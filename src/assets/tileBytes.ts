/**
 * tileBytes.ts
 * The single seam for reading tile image bytes, bundled or loose.
 *
 * Public API
 *   type TileBytes = { bytes: ArrayBuffer; mime: string; source: 'bundle' | 'vault' }
 *   type TileReadFailure = { ok: false; kind; reason }
 *   readTileBytes(app, vaultPath): Promise<TileBytes | TileReadFailure>
 *   readTileBlob(app, vaultPath): Promise<Blob | null>
 *   readTileThumbBlob(app, vaultPath): Promise<Blob | null>
 *       the bundle's pre-rendered thumbnail (<= 64 px, alpha-cropped) for a
 *       bundled tile that has one; null for loose tiles, a loose file that
 *       shadows the entry, entries without a thumb, or any read failure. Never
 *       falls back to the full image: the caller decides (thumbnailCache does).
 *   isTileReadFailure(x): x is TileReadFailure
 *   clearTileBytesNegativeCache(pathOrPrefix?): void
 *       forget "no loose file at this path" answers (all, one path, or a folder
 *       prefix). Call it on vault `create` events.
 *
 * Resolution order (a loose file always beats a bundle entry, design section 4):
 *   1. an indexed loose TFile at the path (sync map lookup, no I/O)
 *   2. bundle entry (longest-prefix match on mounted roots): first
 *      adapter.exists(path), because a loose file the vault index has not
 *      caught up with still wins. A positive answer is cached per path in the
 *      registry (cleared when the folder remounts); a negative one in the
 *      small negative cache below. Then the shard slice; a bundle failure is
 *      returned as-is (never silently "missing").
 *   3. adapter.exists -> adapter.readBinary (files the vault index has not
 *      caught up with; parity with tileArtAnalysis.readTileImageBinary);
 *      a miss is negative-cached.
 */

import type { App } from 'obsidian';
import { TFile } from 'obsidian';

import { mimeFromPath } from './bundles/bundleFormat';
import {
  isBundleReadFailure, isLooseShadowed, lookupEntry, markLooseShadow, readEntryBytes,
} from './bundles/bundleRegistry';
import type { BundleReadFailureKind } from './bundles/bundleRegistry';

export interface TileBytes {
  bytes: ArrayBuffer;
  mime: string;
  source: 'bundle' | 'vault';
}

export type TileReadFailureKind = BundleReadFailureKind | 'not-found' | 'read-error';

export interface TileReadFailure {
  ok: false;
  kind: TileReadFailureKind;
  reason: string;
}

export function isTileReadFailure(x: unknown): x is TileReadFailure {
  return x !== null && typeof x === 'object' && (x as { ok?: unknown }).ok === false;
}

function vaultMime(path: string): string {
  return mimeFromPath(path) ?? 'application/octet-stream';
}

// ===========================================
// Negative cache: paths with no loose file on disk
// ===========================================

const NEGATIVE_CAP = 4096;
const _looseMissing = new Set<string>();

function rememberMissing(path: string): void {
  if (_looseMissing.has(path)) return;
  if (_looseMissing.size >= NEGATIVE_CAP) {
    const oldest = _looseMissing.values().next().value;
    if (oldest !== undefined) _looseMissing.delete(oldest);
  }
  _looseMissing.add(path);
}

/** Forget cached "no loose file" answers: all, one path, or everything under a folder. */
export function clearTileBytesNegativeCache(pathOrPrefix?: string): void {
  if (pathOrPrefix === undefined || pathOrPrefix === '') {
    _looseMissing.clear();
    return;
  }
  const norm = pathOrPrefix.replace(/\\/g, '/').replace(/\/+$/, '');
  _looseMissing.delete(norm);
  const prefix = norm + '/';
  for (const p of [..._looseMissing]) if (p.startsWith(prefix)) _looseMissing.delete(p);
}

async function looseExists(app: App, path: string): Promise<boolean> {
  if (_looseMissing.has(path)) return false;
  const found = await app.vault.adapter.exists(path);
  if (!found) rememberMissing(path);
  return found;
}

async function readLoose(app: App, vaultPath: string): Promise<TileBytes | TileReadFailure> {
  try {
    return { bytes: await app.vault.adapter.readBinary(vaultPath), mime: vaultMime(vaultPath), source: 'vault' };
  } catch (err) {
    return { ok: false, kind: 'read-error', reason: `${vaultPath}: ${(err as Error)?.message ?? String(err)}` };
  }
}

export async function readTileBytes(app: App, vaultPath: string): Promise<TileBytes | TileReadFailure> {
  const file = app.vault.getAbstractFileByPath(vaultPath);
  if (file instanceof TFile) {
    try {
      return { bytes: await app.vault.readBinary(file), mime: vaultMime(vaultPath), source: 'vault' };
    } catch (err) {
      return { ok: false, kind: 'read-error', reason: `${vaultPath}: ${(err as Error)?.message ?? String(err)}` };
    }
  }

  try {
    if (lookupEntry(vaultPath)) {
      if (isLooseShadowed(vaultPath)) return await readLoose(app, vaultPath);
      if (await looseExists(app, vaultPath)) {
        markLooseShadow(vaultPath);
        return await readLoose(app, vaultPath);
      }
      const res = await readEntryBytes(app, vaultPath);
      if (isBundleReadFailure(res)) return { ok: false, kind: res.kind, reason: res.detail };
      return { bytes: res.bytes, mime: res.mime, source: 'bundle' };
    }

    if (await looseExists(app, vaultPath)) return await readLoose(app, vaultPath);
  } catch (err) {
    return { ok: false, kind: 'read-error', reason: `${vaultPath}: ${(err as Error)?.message ?? String(err)}` };
  }
  return { ok: false, kind: 'not-found', reason: `${vaultPath} is neither a vault file nor a bundle entry` };
}

/** Convenience: bytes as a typed Blob, or null on any failure. */
export async function readTileBlob(app: App, vaultPath: string): Promise<Blob | null> {
  const res = await readTileBytes(app, vaultPath);
  if (isTileReadFailure(res)) return null;
  return new Blob([res.bytes], { type: res.mime });
}

/**
 * The bundle thumbnail slice for `vaultPath`, or null (see the file header).
 * A loose file at the path wins exactly as in readTileBytes, so its thumbnail
 * is never stale bundle art.
 */
export async function readTileThumbBlob(app: App, vaultPath: string): Promise<Blob | null> {
  try {
    if (app.vault.getAbstractFileByPath(vaultPath) instanceof TFile) return null;
    const entry = lookupEntry(vaultPath);
    if (!entry?.thumb) return null;
    if (isLooseShadowed(vaultPath)) return null;
    if (await looseExists(app, vaultPath)) {
      markLooseShadow(vaultPath);
      return null;
    }
    const res = await readEntryBytes(app, vaultPath, { thumb: true });
    if (isBundleReadFailure(res)) return null;
    return new Blob([res.bytes], { type: res.mime });
  } catch {
    return null;
  }
}

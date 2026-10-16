/**
 * tilesetScan.ts
 * Folder scanning for tile images (adapter.list based, concurrent scans deduped).
 *
 * A tileset folder may hold a tile bundle (assets/bundles). Bundled entries
 * come first, in index order, with their STORED ids; the loose walk then
 * unions in: a loose file at the same relative key replaces the bundle entry
 * in place (loose wins, keeping the stored id so placed references survive),
 * other loose files append in walk order with ids minted against a seen-set
 * pre-seeded with every bundle id. A bundle that fails to mount never reads
 * as an empty folder: the loose entries are returned and a Notice names the
 * folder and the state (once per folder per session). An absent folder or a
 * plain loose folder stays silent, exactly as before bundles existed.
 *
 * Scans never force a remount: ensureMounted reuses a serving record and only
 * (re)mounts unknown or failed folders. Forced remounts come from the vault
 * watcher in main.ts. Duplicate stored ids inside a bundle keep the first
 * entry; later ones are skipped with one Notice per folder per session.
 */

import type { TileEntry } from '#types/tiles/tile.types';
import type { App } from 'obsidian';
import { Notice } from 'obsidian';
import { mintTileId } from './tileIds';
import { ensureMounted, entriesFor, getBundleStateInfo, isBundleWriteInProgress } from './bundles/bundleRegistry';
import type { BundleState } from './bundles/bundleRegistry';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);

/** Bundle states that serve entries. */
const SERVING_STATES = new Set<BundleState>(['mounted', 'partial']);

const STATE_LABELS: Partial<Record<BundleState, string>> = {
  'unmounted-corrupt': 'corrupt index',
  'unsupported-version': 'unsupported bundle version',
  'not-on-device': 'bundle files not on this device yet',
};

/** Label for `index-missing`: a marker and shards but no committed index (an import that did not finish). */
const INCOMPLETE_LABEL = 'bundling did not finish';

/** Folders already told about a failed bundle this session. */
const noticedBundleFailures = new Set<string>();
/** Folders already told about duplicate stored ids this session. */
const noticedDuplicateIds = new Set<string>();

/** True when the state is a bundle failure (a bundle exists but serves nothing). */
function isBundleFailureState(state: BundleState): boolean {
  return state in STATE_LABELS;
}

/** Plain-sentence label for a failed bundle state. */
function bundleFailureLabel(state: BundleState): string {
  return STATE_LABELS[state] ?? state;
}

/**
 * Folder-relative path -> subfolder category and tags. Shared by the loose
 * walk and bundle entries so both derive categories identically.
 */
function categoryForRelativePath(relativePath: string): { filename: string; category?: string; tags?: string[] } {
  const parts = relativePath.split('/');
  const filename = parts[parts.length - 1];
  if (parts.length <= 1) return { filename };
  const dirs = parts.slice(0, -1);
  // Auto-derive tags from subfolder path segments
  return { filename, category: dirs.join('/'), tags: dirs };
}

/**
 * Scan a vault folder for tile images using adapter.list() for folder-scoped
 * listing instead of vault.getFiles() which walks every file in the vault.
 * Returns TileEntry[] with subfolder-based categories.
 */
// In-flight scans keyed by normalized folder (MEM-11): a settings save
// rebuilds tilesets in EVERY mounted map at once; concurrent requests for the
// same folder share one walk. Each caller gets its own array copy.
const inFlightScans = new Map<string, Promise<TileEntry[]>>();

async function scanTilesetFolder(app: App, folderPath: string): Promise<TileEntry[]> {
  const key = folderPath.endsWith('/') ? folderPath.slice(0, -1) : folderPath;
  let scan = inFlightScans.get(key);
  if (scan == null) {
    scan = walkTilesetFolder(app, key).finally(() => { inFlightScans.delete(key); });
    inFlightScans.set(key, scan);
  }
  return [...(await scan)];
}

async function walkTilesetFolder(app: App, folderPath: string): Promise<TileEntry[]> {
  const normalizedFolder = folderPath.endsWith('/')
    ? folderPath.slice(0, -1)
    : folderPath;

  const tiles: TileEntry[] = [];
  const seenIds = new Set<string>();
  /** Relative key -> index in `tiles` for bundle entries (loose may replace). */
  const bundleIndexByKey = new Map<string, number>();

  const state = await ensureMounted(app, normalizedFolder);
  if (SERVING_STATES.has(state)) {
    const duplicates: string[] = [];
    for (const entry of entriesFor(normalizedFolder).entries) {
      if (seenIds.has(entry.id)) { duplicates.push(entry.id); continue; }
      const { filename, category, tags } = categoryForRelativePath(entry.key);
      bundleIndexByKey.set(entry.key, tiles.length);
      seenIds.add(entry.id);
      tiles.push({ id: entry.id, filename, vaultPath: entry.vaultPath, category, tags });
    }
    if (duplicates.length > 0 && !noticedDuplicateIds.has(normalizedFolder)) {
      noticedDuplicateIds.add(normalizedFolder);
      console.warn(`[tilesetScan] Tile bundle in ${normalizedFolder} repeats stored ids; later entries skipped`, duplicates);
      const more = duplicates.length > 1 ? ` and ${duplicates.length - 1} more` : '';
      new Notice(`Tile bundle in ${normalizedFolder} repeats the tile id "${duplicates[0]}"${more}; the later entries were skipped.`);
    }
  } else if (isBundleFailureState(state) && !noticedBundleFailures.has(normalizedFolder)) {
    const reason = getBundleStateInfo(normalizedFolder)?.reason ?? '';
    // A deleted or renamed plain folder is not a bundle failure: stay silent.
    // Nor is an index that an import is still writing (no Notice, and the
    // folder is not marked noticed, so a real failure later still speaks).
    const writing = reason === 'index-missing' && isBundleWriteInProgress(normalizedFolder);
    if (reason !== 'folder-absent' && !writing) {
      noticedBundleFailures.add(normalizedFolder);
      console.warn(`[tilesetScan] Tile bundle in ${normalizedFolder} not mounted (${state})${reason !== '' ? `: ${reason}` : ''}`);
      new Notice(reason === 'index-missing'
        ? `Tile bundle in ${normalizedFolder} is incomplete (${INCOMPLETE_LABEL}).`
        : `Tile bundle in ${normalizedFolder} could not be loaded (${bundleFailureLabel(state)}).`);
    }
  }

  // Recursively collect image files via adapter.list (folder-scoped, not vault-wide)
  const queue = [normalizedFolder];
  while (queue.length > 0) {
    const dir = queue.pop();
    if (dir == null) continue;
    let listing: { files: string[]; folders: string[] };
    try {
      listing = await app.vault.adapter.list(dir);
    } catch {
      continue; // folder may not exist
    }

    for (const sub of listing.folders) {
      queue.push(sub);
    }

    for (const filePath of listing.files) {
      const dotIdx = filePath.lastIndexOf('.');
      if (dotIdx < 0) continue;
      const ext = filePath.slice(dotIdx + 1).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) continue;

      const relativePath = filePath.slice(normalizedFolder.length + 1);
      const { filename, category, tags } = categoryForRelativePath(relativePath);

      const bundleIdx = bundleIndexByKey.get(relativePath);
      if (bundleIdx != null) {
        // Loose wins at the same key; keep the stored id (same path, same tile).
        tiles[bundleIdx] = { id: tiles[bundleIdx].id, filename, vaultPath: filePath, category, tags };
        continue;
      }

      const id = mintTileId(relativePath, seenIds);
      tiles.push({ id, filename, vaultPath: filePath, category, tags });
    }
  }

  return tiles;
}

/** Test hook: forget which folders already showed a bundle failure notice. */
function _resetBundleNoticesForTests(): void {
  noticedBundleFailures.clear();
  noticedDuplicateIds.clear();
}

export { scanTilesetFolder, categoryForRelativePath, isBundleFailureState, bundleFailureLabel, _resetBundleNoticesForTests };

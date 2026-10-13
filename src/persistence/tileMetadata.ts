/**
 * tileMetadata.ts
 *
 * Persistence layer for user-defined tile metadata (stars, tags).
 * Stored in windrose-tile-metadata.json in the vault root.
 * Keyed by vault path so metadata survives tileset rescans.
 */

import type { App } from 'obsidian';
import { Notice, TFile } from 'obsidian';
import type { TileMetadataStore, TileMetadataEntry, TileEntry, TileLayerRole } from '#types/tiles/tile.types';

const METADATA_FILE = 'windrose-tile-metadata.json';

let saveTimer: number | null = null;
let saveApp: App | null = null;
const SAVE_DEBOUNCE_MS = 2000;

// ===========================================
// Shared store (module singleton)
// ===========================================
//
// ONE in-memory copy of the vault-global tile metadata, shared by the canvas
// renderer and every mounted tile browser (STRUCT-A-10). Components never keep
// their own copy: they read through useTileMetadata() and write through
// updateTileMetadata(), which applies the mutator to THIS store and persists
// from it. A per-mount copy saved as a whole file was last-writer-wins across
// mounts (a star in one embed erased by a tag in another).
//
// Writers outside the component tree (pack import, classification rescan,
// folder detection) still load -> mutate -> saveTileMetadata, then hand the
// result to setTileMetadataForRender, which replaces this store and notifies
// subscribers.

let _store: TileMetadataStore = {};
let _loaded = false;
let _loadPromise: Promise<TileMetadataStore> | null = null;
/** Bumped on every store change so render caches can key on it (STRUCT-A-31). */
let _version = 0;
const _listeners = new Set<() => void>();

function commitStore(store: TileMetadataStore): void {
  _store = store;
  _version++;
  for (const listener of [..._listeners]) listener();
}

/** Current shared metadata store. Empty until the first load lands. */
function getTileMetadataForRender(): TileMetadataStore {
  return _store;
}

/** Replace the shared store wholesale (external writers, after their own save). */
function setTileMetadataForRender(store: TileMetadataStore): void {
  _loaded = true;
  commitStore(store);
}

/** Monotonic version of the shared store; changes whenever it changes. */
function getTileMetadataRenderVersion(): number {
  return _version;
}

function isTileMetadataLoaded(): boolean {
  return _loaded;
}

/** Subscribe to store changes. Returns the unsubscribe function. */
function subscribeTileMetadata(listener: () => void): () => void {
  _listeners.add(listener);
  return () => { _listeners.delete(listener); };
}

/**
 * Load the store from disk ONCE per session; concurrent callers share the
 * in-flight read. Later calls resolve immediately with the shared store.
 */
function ensureTileMetadataLoaded(app: App): Promise<TileMetadataStore> {
  if (_loaded) return Promise.resolve(_store);
  _loadPromise ??= loadTileMetadata(app).then(store => {
    _loadPromise = null;
    // A writer may have replaced the store while the read was in flight;
    // its copy is newer than what we just read.
    if (!_loaded) setTileMetadataForRender(store);
    return _store;
  });
  return _loadPromise;
}

/**
 * Apply `mutator` to the shared store and schedule a debounced save OF THE
 * SHARED STORE. Returning the same object is a no-op. Mutations issued before
 * the first load are applied after it lands, so they can never be overwritten
 * by (or save over) the on-disk store.
 */
function updateTileMetadata(app: App, mutator: (store: TileMetadataStore) => TileMetadataStore): void {
  const apply = (): void => {
    const next = mutator(_store);
    if (next === _store) return;
    commitStore(next);
    scheduleSave(app);
  };
  if (_loaded) apply();
  else void ensureTileMetadataLoaded(app).then(apply);
}

function scheduleSave(app: App): void {
  saveApp = app;
  if (saveTimer != null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    void saveTileMetadata(app, _store);
  }, SAVE_DEBOUNCE_MS);
}

/** Write a pending debounced save now (before a raw file read, or on unload). */
async function flushTileMetadataSave(): Promise<void> {
  if (saveTimer == null || saveApp == null) return;
  window.clearTimeout(saveTimer);
  saveTimer = null;
  await saveTileMetadata(saveApp, _store);
}

/** Drop all module state (tests; plugin unload after flushTileMetadataSave). */
function resetTileMetadataStore(): void {
  if (saveTimer != null) window.clearTimeout(saveTimer);
  saveTimer = null;
  saveApp = null;
  _store = {};
  _loaded = false;
  _loadPromise = null;
  _listeners.clear();
}

// Throttle the corrupted-file notice so we don't spam the user with a toast
// every time a debounced save fires while the file is broken. Mirrors the
// saveMapData corruption guard in fileOperations.ts.
let lastCorruptionNoticeAt = 0;
const CORRUPTION_NOTICE_INTERVAL_MS = 30_000;
function notifyCorruptedMetadataFile(): void {
  const now = Date.now();
  if (now - lastCorruptionNoticeAt < CORRUPTION_NOTICE_INTERVAL_MS) return;
  lastCorruptionNoticeAt = now;
  new Notice(
    `Windrose: tile metadata file is corrupted and metadata saves are paused to protect your data.\n\n` +
    `File: ${METADATA_FILE}\n\n` +
    `Inspect or restore the file manually, then reload Obsidian to resume saving.`,
    15_000
  );
}

/**
 * Raw read of the store file. Flushes a pending debounced save first so a
 * load -> mutate -> save writer outside the component tree starts from a file
 * that already holds every in-memory edit.
 */
async function loadTileMetadata(app: App): Promise<TileMetadataStore> {
  await flushTileMetadataSave();
  const file = app.vault.getAbstractFileByPath(METADATA_FILE);
  if (!(file instanceof TFile)) return {};
  try {
    const content = await app.vault.read(file);
    return JSON.parse(content) as TileMetadataStore;
  } catch (e) {
    // An existing-but-unreadable store must be loud: silently treating it as
    // empty makes every tile render unclassified (all "Terrain") AND primes the
    // next load→mutate→full-replace save to wipe whatever the file still holds.
    // Saves are refused separately in saveTileMetadata until the file is fixed.
    console.error('[Windrose] Tile metadata file exists but is unreadable:', e);
    notifyCorruptedMetadataFile();
    return {};
  }
}

/** @returns true if the store was written; false if the save was refused or failed. */
async function saveTileMetadata(app: App, metadata: TileMetadataStore): Promise<boolean> {
  const existing = app.vault.getAbstractFileByPath(METADATA_FILE);
  const file = existing instanceof TFile ? existing : null;

  // Refuse-to-overwrite guard (mirrors saveMapData): every save is a whole-file
  // replace, so writing over an unparseable store would silently destroy
  // whatever classification it still contains.
  if (file != null) {
    try {
      JSON.parse(await app.vault.read(file));
    } catch (e) {
      console.error(
        '[Windrose] Existing tile metadata file is unparseable. Refusing to overwrite to avoid data loss.',
        e
      );
      notifyCorruptedMetadataFile();
      return false;
    }
  }

  const cleaned = pruneEmptyEntries(metadata);
  const json = JSON.stringify(cleaned, null, 2);

  try {
    if (file != null) {
      await app.vault.modify(file, json);
    } else {
      await app.vault.create(METADATA_FILE, json);
    }
    return true;
  } catch (e) {
    console.error('[Windrose] Failed to save tile metadata:', e);
    return false;
  }
}

function pruneEmptyEntries(metadata: TileMetadataStore): TileMetadataStore {
  const result: TileMetadataStore = {};
  for (const [key, entry] of Object.entries(metadata)) {
    if (
      entry.starred === true ||
      (entry.userTags != null && entry.userTags.length > 0) ||
      (entry.importTags != null && entry.importTags.length > 0) ||
      entry.depthAffinity != null ||
      entry.categoryOverride != null ||
      entry.ddSourceType != null ||
      entry.renderMode != null ||
      entry.defaultSpanW != null ||
      entry.defaultSpanH != null ||
      entry.worldRepeat != null ||
      entry.edgeFeather != null ||
      entry.alphaCoverage != null ||
      entry.opaqueW != null ||
      entry.opaqueH != null ||
      entry.srcW != null ||
      entry.srcH != null ||
      entry.hexArt != null ||
      entry.wallEndCapPath != null ||
      entry.wallDefaultColor != null ||
      entry.isWallEndCap === true
    ) {
      result[key] = entry;
    }
  }
  return result;
}

function getEntryMetadata(metadata: TileMetadataStore, vaultPath: string): TileMetadataEntry {
  return metadata[vaultPath] ?? {};
}

function setEntryMetadata(
  metadata: TileMetadataStore,
  vaultPath: string,
  update: Partial<TileMetadataEntry>
): TileMetadataStore {
  const existing = metadata[vaultPath] ?? {};
  return { ...metadata, [vaultPath]: { ...existing, ...update } };
}

function toggleStar(metadata: TileMetadataStore, vaultPath: string): TileMetadataStore {
  const existing = metadata[vaultPath] ?? {};
  return setEntryMetadata(metadata, vaultPath, { starred: existing.starred !== true });
}

function addUserTag(metadata: TileMetadataStore, vaultPath: string, tag: string): TileMetadataStore {
  const existing = metadata[vaultPath] ?? {};
  const tags = existing.userTags ?? [];
  if (tags.some(t => t.toLowerCase() === tag.toLowerCase())) return metadata;
  return setEntryMetadata(metadata, vaultPath, { userTags: [...tags, tag] });
}

function removeUserTag(metadata: TileMetadataStore, vaultPath: string, tag: string): TileMetadataStore {
  const existing = metadata[vaultPath] ?? {};
  const tags = (existing.userTags ?? []).filter(t => t.toLowerCase() !== tag.toLowerCase());
  return setEntryMetadata(metadata, vaultPath, { userTags: tags });
}

function bulkAddTag(metadata: TileMetadataStore, vaultPaths: string[], tag: string): TileMetadataStore {
  let result = { ...metadata };
  for (const path of vaultPaths) {
    result = addUserTag(result, path, tag);
  }
  return result;
}

function bulkToggleStar(metadata: TileMetadataStore, vaultPaths: string[], starred: boolean): TileMetadataStore {
  let result = { ...metadata };
  for (const path of vaultPaths) {
    result = setEntryMetadata(result, path, { starred });
  }
  return result;
}

function isStarred(metadata: TileMetadataStore, vaultPath: string): boolean {
  return metadata[vaultPath]?.starred === true;
}

function getUserTags(metadata: TileMetadataStore, vaultPath: string): string[] {
  return metadata[vaultPath]?.userTags ?? [];
}

function getAllTags(tile: TileEntry, metadata: TileMetadataStore): string[] {
  const folderTags = tile.tags ?? [];
  const entry = metadata[tile.vaultPath];
  const ddImportTags = entry?.importTags ?? [];
  const userTags = entry?.userTags ?? [];
  const seen = new Set(folderTags.map(t => t.toLowerCase()));
  const merged = [...folderTags];
  for (const tag of ddImportTags) {
    if (!seen.has(tag.toLowerCase())) {
      merged.push(tag);
      seen.add(tag.toLowerCase());
    }
  }
  for (const tag of userTags) {
    if (!seen.has(tag.toLowerCase())) {
      merged.push(tag);
      seen.add(tag.toLowerCase());
    }
  }
  return merged;
}

function setImportTags(
  metadata: TileMetadataStore,
  vaultPath: string,
  tags: string[]
): TileMetadataStore {
  const existing = metadata[vaultPath] ?? {};
  return { ...metadata, [vaultPath]: { ...existing, importTags: tags } };
}

function bulkSetImportTags(
  metadata: TileMetadataStore,
  entries: Array<{ vaultPath: string; tags: string[] }>
): TileMetadataStore {
  const result = { ...metadata };
  for (const { vaultPath, tags } of entries) {
    const existing = result[vaultPath] ?? {};
    result[vaultPath] = { ...existing, importTags: tags };
  }
  return result;
}

function collectUniqueTags(tiles: TileEntry[], metadata: TileMetadataStore): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const tile of tiles) {
    for (const tag of getAllTags(tile, metadata)) {
      const lower = tag.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        tags.push(tag);
      }
    }
  }
  return tags.sort((a, b) => a.localeCompare(b));
}

function setDepthAffinity(
  metadata: TileMetadataStore,
  vaultPath: string,
  depth: TileLayerRole
): TileMetadataStore {
  return setEntryMetadata(metadata, vaultPath, { depthAffinity: depth });
}

function bulkSetDepthAffinity(
  metadata: TileMetadataStore,
  entries: Array<{ vaultPath: string; depth: TileLayerRole }>
): TileMetadataStore {
  const result = { ...metadata };
  for (const { vaultPath, depth } of entries) {
    const existing = result[vaultPath] ?? {};
    result[vaultPath] = { ...existing, depthAffinity: depth };
  }
  return result;
}

/**
 * Reassign the category home for a set of tiles (Organize → Move…).
 * `category` undefined clears the override, restoring the folder-derived home.
 */
function bulkSetCategoryOverride(
  metadata: TileMetadataStore,
  paths: string[],
  category: string | undefined
): TileMetadataStore {
  const result = { ...metadata };
  for (const vaultPath of paths) {
    const existing = result[vaultPath] ?? {};
    if (category == null) {
      const rest = { ...existing };
      delete rest.categoryOverride;
      result[vaultPath] = rest;
    } else {
      result[vaultPath] = { ...existing, categoryOverride: category };
    }
  }
  return result;
}

function bulkSetDdSourceType(
  metadata: TileMetadataStore,
  entries: Array<{ vaultPath: string; sourceType: string }>
): TileMetadataStore {
  const result = { ...metadata };
  for (const { vaultPath, sourceType } of entries) {
    const existing = result[vaultPath] ?? {};
    result[vaultPath] = { ...existing, ddSourceType: sourceType };
  }
  return result;
}

function bulkSetRenderMode(
  metadata: TileMetadataStore,
  entries: Array<{ vaultPath: string; mode: 'cell' | 'region' }>
): TileMetadataStore {
  const result = { ...metadata };
  for (const { vaultPath, mode } of entries) {
    const existing = result[vaultPath] ?? {};
    result[vaultPath] = { ...existing, renderMode: mode };
  }
  return result;
}

function bulkSetDefaultSpan(
  metadata: TileMetadataStore,
  entries: Array<{ vaultPath: string; spanW: number; spanH: number }>
): TileMetadataStore {
  const result = { ...metadata };
  for (const { vaultPath, spanW, spanH } of entries) {
    const existing = result[vaultPath] ?? {};
    result[vaultPath] = { ...existing, defaultSpanW: spanW, defaultSpanH: spanH };
  }
  return result;
}

/** Remove the per-tile renderMode override — "Auto": detection resolves at read time. */
function bulkClearRenderMode(metadata: TileMetadataStore, paths: string[]): TileMetadataStore {
  const result = { ...metadata };
  for (const vaultPath of paths) {
    const existing = result[vaultPath];
    if (existing?.renderMode == null) continue;
    const rest = { ...existing };
    delete rest.renderMode;
    result[vaultPath] = rest;
  }
  return pruneEmptyEntries(result);
}

/** Remove the per-tile footprint override — "Auto": next placement re-detects. */
function bulkClearDefaultSpan(metadata: TileMetadataStore, paths: string[]): TileMetadataStore {
  const result = { ...metadata };
  for (const vaultPath of paths) {
    const existing = result[vaultPath];
    if (existing == null || (existing.defaultSpanW == null && existing.defaultSpanH == null)) continue;
    const rest = { ...existing };
    delete rest.defaultSpanW;
    delete rest.defaultSpanH;
    result[vaultPath] = rest;
  }
  return pruneEmptyEntries(result);
}

function bulkSetDetectionSignals(
  metadata: TileMetadataStore,
  entries: Array<{ vaultPath: string; signals: { alphaCoverage: number; opaqueW: number; opaqueH: number; naturalW: number; naturalH: number; hexArt?: 'flat' | 'pointy' } }>
): TileMetadataStore {
  const result = { ...metadata };
  for (const { vaultPath, signals } of entries) {
    const existing = result[vaultPath] ?? {};
    const next = {
      ...existing,
      alphaCoverage: signals.alphaCoverage,
      opaqueW: signals.opaqueW,
      opaqueH: signals.opaqueH,
      srcW: signals.naturalW,
      srcH: signals.naturalH,
    };
    // The scan is authoritative for hexArt: a fresh scan with no verdict must
    // also CLEAR a stale one, or entries misclassified before the size floor
    // existed would keep their bogus hexArt forever.
    if (signals.hexArt != null) next.hexArt = signals.hexArt;
    else delete next.hexArt;
    result[vaultPath] = next;
  }
  return result;
}

function bulkSetWallStripInfo(
  metadata: TileMetadataStore,
  entries: Array<{ vaultPath: string; endCapPath?: string; defaultColor?: string }>
): TileMetadataStore {
  const result = { ...metadata };
  for (const { vaultPath, endCapPath, defaultColor } of entries) {
    const existing = result[vaultPath] ?? {};
    result[vaultPath] = {
      ...existing,
      ...(endCapPath != null ? { wallEndCapPath: endCapPath } : {}),
      ...(defaultColor != null ? { wallDefaultColor: defaultColor } : {}),
    };
  }
  return result;
}

function bulkMarkWallEndCaps(
  metadata: TileMetadataStore,
  vaultPaths: string[]
): TileMetadataStore {
  const result = { ...metadata };
  for (const vaultPath of vaultPaths) {
    const existing = result[vaultPath] ?? {};
    result[vaultPath] = { ...existing, isWallEndCap: true };
  }
  return result;
}

function collectDepthAwareTags(
  tiles: TileEntry[],
  metadata: TileMetadataStore,
  activeDepth: TileLayerRole
): string[] {
  const depthTags = new Map<string, number>();
  const otherTags = new Map<string, number>();
  for (const tile of tiles) {
    const entry = metadata[tile.vaultPath];
    const affinity = entry?.depthAffinity;
    const isMatch = affinity === activeDepth;
    for (const tag of getAllTags(tile, metadata)) {
      const lower = tag.toLowerCase();
      const target = isMatch ? depthTags : otherTags;
      target.set(lower, (target.get(lower) ?? 0) + 1);
    }
  }
  const boosted = [...depthTags.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t);
  const rest = [...otherTags.entries()]
    .filter(([t]) => !depthTags.has(t))
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t);
  return [...boosted, ...rest];
}

export {
  loadTileMetadata,
  saveTileMetadata,
  getTileMetadataForRender,
  setTileMetadataForRender,
  getTileMetadataRenderVersion,
  isTileMetadataLoaded,
  subscribeTileMetadata,
  ensureTileMetadataLoaded,
  updateTileMetadata,
  flushTileMetadataSave,
  resetTileMetadataStore,
  pruneEmptyEntries,
  getEntryMetadata,
  setEntryMetadata,
  toggleStar,
  addUserTag,
  removeUserTag,
  bulkAddTag,
  bulkToggleStar,
  isStarred,
  getUserTags,
  getAllTags,
  collectUniqueTags,
  collectDepthAwareTags,
  setImportTags,
  bulkSetImportTags,
  setDepthAffinity,
  bulkSetDepthAffinity,
  bulkSetCategoryOverride,
  bulkSetDdSourceType,
  bulkSetDetectionSignals,
  bulkSetRenderMode,
  bulkSetDefaultSpan,
  bulkClearRenderMode,
  bulkClearDefaultSpan,
  bulkSetWallStripInfo,
  bulkMarkWallEndCaps,
};

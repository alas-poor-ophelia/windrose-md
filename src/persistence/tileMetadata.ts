/**
 * tileMetadata.ts
 *
 * Persistence layer for user-defined tile metadata (stars, tags).
 * Stored in windrose-tile-metadata.json in the vault root.
 * Keyed by vault path so metadata survives tileset rescans.
 */

import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import type { TileMetadataStore, TileMetadataEntry, TileEntry, TileLayerRole } from '#types/tiles/tile.types';

const METADATA_FILE = 'windrose-tile-metadata.json';

let saveTimer: number | null = null;
const SAVE_DEBOUNCE_MS = 2000;

// ===========================================
// Render Accessor (module singleton)
// ===========================================
//
// The canvas renderer needs the vault-global tile metadata store to resolve each
// tile's render mode (cell vs seamless region) per-tile. The store is the same
// shape as plugin settings — vault-global, not per-map — so it follows the same
// `settingsAccessor` idiom: a module singleton read fresh each frame rather than
// threaded through every renderCanvas call site. Populated on map mount and kept
// in sync by the tile browser.

let _renderStore: TileMetadataStore = {};

/** Current metadata store for the renderer. Empty until populated on map mount. */
function getTileMetadataForRender(): TileMetadataStore {
  return _renderStore;
}

/** Replace the renderer's metadata store (call after load or edit). */
function setTileMetadataForRender(store: TileMetadataStore): void {
  _renderStore = store;
}

async function loadTileMetadata(app: App): Promise<TileMetadataStore> {
  try {
    const file = app.vault.getAbstractFileByPath(METADATA_FILE);
    if (!(file instanceof TFile)) return {};
    const content = await app.vault.read(file);
    return JSON.parse(content) as TileMetadataStore;
  } catch {
    return {};
  }
}

async function saveTileMetadata(app: App, metadata: TileMetadataStore): Promise<void> {
  const cleaned = pruneEmptyEntries(metadata);
  const json = JSON.stringify(cleaned, null, 2);

  try {
    const file = app.vault.getAbstractFileByPath(METADATA_FILE);
    if (file instanceof TFile) {
      await app.vault.modify(file, json);
    } else {
      await app.vault.create(METADATA_FILE, json);
    }
  } catch (e) {
    console.error('[Windrose] Failed to save tile metadata:', e);
  }
}

function saveTileMetadataDebounced(app: App, metadata: TileMetadataStore): void {
  if (saveTimer != null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    void saveTileMetadata(app, metadata);
    saveTimer = null;
  }, SAVE_DEBOUNCE_MS);
}

function pruneEmptyEntries(metadata: TileMetadataStore): TileMetadataStore {
  const result: TileMetadataStore = {};
  for (const [key, entry] of Object.entries(metadata)) {
    if (
      entry.starred === true ||
      (entry.userTags != null && entry.userTags.length > 0) ||
      (entry.importTags != null && entry.importTags.length > 0) ||
      entry.depthAffinity != null ||
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

function bulkSetDetectionSignals(
  metadata: TileMetadataStore,
  entries: Array<{ vaultPath: string; signals: { alphaCoverage: number; opaqueW: number; opaqueH: number; naturalW: number; naturalH: number } }>
): TileMetadataStore {
  const result = { ...metadata };
  for (const { vaultPath, signals } of entries) {
    const existing = result[vaultPath] ?? {};
    result[vaultPath] = {
      ...existing,
      alphaCoverage: signals.alphaCoverage,
      opaqueW: signals.opaqueW,
      opaqueH: signals.opaqueH,
      srcW: signals.naturalW,
      srcH: signals.naturalH,
    };
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
  saveTileMetadataDebounced,
  getTileMetadataForRender,
  setTileMetadataForRender,
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
  bulkSetDdSourceType,
  bulkSetDetectionSignals,
  bulkSetRenderMode,
  bulkSetDefaultSpan,
  bulkSetWallStripInfo,
  bulkMarkWallEndCaps,
};

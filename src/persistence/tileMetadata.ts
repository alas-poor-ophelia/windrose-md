/**
 * tileMetadata.ts
 *
 * Persistence layer for user-defined tile metadata (stars, tags).
 * Stored in windrose-tile-metadata.json in the vault root.
 * Keyed by vault path so metadata survives tileset rescans.
 */

import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import type { TileMetadataStore, TileMetadataEntry, TileEntry } from '#types/tiles/tile.types';

const METADATA_FILE = 'windrose-tile-metadata.json';

let saveTimer: ReturnType<typeof setTimeout> | null = null;
const SAVE_DEBOUNCE_MS = 2000;

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
    // eslint-disable-next-line no-console
    console.error('[Windrose] Failed to save tile metadata:', e);
  }
}

function saveTileMetadataDebounced(app: App, metadata: TileMetadataStore): void {
  if (saveTimer != null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
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
      (entry.importTags != null && entry.importTags.length > 0)
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
  return setEntryMetadata(metadata, vaultPath, { starred: !existing.starred });
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
  let result = { ...metadata };
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

export {
  loadTileMetadata,
  saveTileMetadata,
  saveTileMetadataDebounced,
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
  setImportTags,
  bulkSetImportTags,
};

/**
 * fileOperations.ts
 *
 * File I/O operations for map data persistence.
 * Handles loading/saving map data to the Obsidian vault.
 */

import type { MapData, MapLayer, MapType, SubHexMapData } from '#types/core/map.types';
import type { WallPath } from '#types/core/wallpath.types';
import type { App } from 'obsidian';
import { TFile, Notice } from 'obsidian';

import { DEFAULTS, SCHEMA_VERSION } from '../core/dmtConstants';
import { getDataFilePath } from '../core/settingsAccessor';
import { offsetToAxial } from '../geometry/core/offsetCoordinates';
import { getSettings } from '../core/settingsAccessor';
import { generateLayerId, DEFAULT_BOARD_ID } from './layerAccessor';
import { migrateMapData, MapSchemaError, claimedSchemaVersion, isNewerSchema } from './schemaMigration';
import { calculateFitZoom } from '../geometry/core/hexMeasurements';
import { resolveTileEntry } from '../assets/tilesetOperations';

// Serializes EVERY data-file operation (reads as well as writes) so concurrent
// access can't race or interleave. Reads have to share the mutex: a read that
// starts while a chunked write is in flight can observe a half-written file and
// hand a truncated document to JSON.parse.
// The chain is kept healthy by catching errors before re-assigning, so one
// failed op doesn't poison subsequent ones.
let saveQueue: Promise<unknown> = Promise.resolve();
function enqueueDataFileOp<T>(task: () => Promise<T>): Promise<T> {
  const next = saveQueue.then(task, task);
  saveQueue = next.catch(() => undefined);
  return next;
}

/**
 * The tail of the data-file queue. Awaiting it waits for every operation
 * enqueued so far to settle — used by the quit handler so Obsidian doesn't tear
 * the event loop down mid-write.
 */
function getSaveQueue(): Promise<unknown> {
  return saveQueue;
}

/**
 * Thrown by loadMapData when the data file EXISTS but cannot be read or parsed.
 *
 * Returning a fresh map in this case is how a truncated file became permanent
 * data loss: the blank map got edited, saved, and merged over the real entry.
 * Callers must block editing instead.
 */
class MapDataUnreadableError extends Error {
  readonly dataPath: string;
  constructor(dataPath: string) {
    super(`Map data file could not be read: ${dataPath}`);
    this.name = 'MapDataUnreadableError';
    this.dataPath = dataPath;
  }
}

/**
 * Thrown by loadMapData for a map deleted earlier in this session (DATA-02).
 *
 * The entry is gone from the store, so the plain "absent => fresh map" rule
 * would hand back a blank, editable map whose saves are then refused. Callers
 * show their "Map deleted" state instead.
 */
class MapDeletedError extends Error {
  readonly mapId: string;
  constructor(mapId: string) {
    super(`Map was deleted: ${mapId}`);
    this.name = 'MapDeletedError';
    this.mapId = mapId;
  }
}

// Throttle the corrupted-file notice so we don't spam the user with a toast
// every time autosave fires while the file is broken.
let lastCorruptionNoticeAt = 0;
const CORRUPTION_NOTICE_INTERVAL_MS = 30_000;
function notifyCorruptedDataFile(dataPath: string): void {
  const now = Date.now();
  if (now - lastCorruptionNoticeAt < CORRUPTION_NOTICE_INTERVAL_MS) return;
  lastCorruptionNoticeAt = now;
  new Notice(
    `Windrose: map data file is corrupted and saves are paused to protect your data.\n\n` +
    `File: ${dataPath}\n\n` +
    `Inspect or restore the file manually, then reload Obsidian to resume saving.`,
    15_000
  );
}

/** Data file structure */
interface DataFile {
  maps: Record<string, MapData>;
}

// ===========================================
// Two-slot backup rotation
// ===========================================

/**
 * Minimum gap between two backup writes, regardless of how much editing
 * happened in between.
 *
 * A backup is itself a vault write. Autosave can fire in a tight burst while a
 * tool is dragged — this repo once logged ~47 saves/sec — so backing up "on
 * every save that had changes" would turn the safety net into the exact I/O
 * storm it is meant to survive. One rotation per 15 minutes is enough to keep a
 * recent known-good copy without adding measurable write load.
 */
const BAK_THROTTLE_MS = 15 * 60 * 1000;

type BakSlot = 1 | 2;
const BAK_SLOTS: readonly BakSlot[] = [1, 2];

/** null until the first rotation of this plugin session (which always happens). */
let lastBakAt: number | null = null;
/** The slot the NEXT rotation writes. Alternates so a torn .bak can't be the only copy. */
let nextBakSlot: BakSlot = 1;

/**
 * Whether a backup rotation is due. Pure — the caller owns `lastBakAt`.
 *
 * The first successful parse-and-save of a session always rotates (lastAt
 * null): that is the cheapest moment to capture a file we have just proven is
 * readable. After that, at most one rotation per BAK_THROTTLE_MS.
 */
function shouldRotateBak(lastAt: number | null, now: number): boolean {
  if (lastAt == null) return true;
  return now - lastAt > BAK_THROTTLE_MS;
}

/** Slot alternation: 1 → 2 → 1 → … Pure. */
function otherBakSlot(slot: BakSlot): BakSlot {
  return slot === 1 ? 2 : 1;
}

/** `<dataPath minus .json>.bak<slot>.json` — e.g. `maps/data.json` → `maps/data.bak1.json`. */
function bakPathForSlot(dataPath: string, slot: BakSlot): string {
  const base = dataPath.endsWith('.json') ? dataPath.slice(0, -'.json'.length) : dataPath;
  return `${base}.bak${slot}.json`;
}

/** `yyyymmdd-hhmmss` in local time, for the preserved-corrupt-file suffix. */
function backupTimestamp(when: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${String(when.getFullYear())}${pad(when.getMonth() + 1)}${pad(when.getDate())}` +
    `-${pad(when.getHours())}${pad(when.getMinutes())}${pad(when.getSeconds())}`
  );
}

/**
 * Write `knownGood` (content already proven to parse) into a backup slot.
 *
 * Awaited inside the data-file mutex so it serializes with every other data
 * file operation, but a failure NEVER aborts the save it protects — a missing
 * backup is a smaller problem than a skipped save.
 */
async function writeBackupSlot(app: App, dataPath: string, slot: BakSlot, knownGood: string): Promise<void> {
  const bakPath = bakPathForSlot(dataPath, slot);
  try {
    const existing = app.vault.getAbstractFileByPath(bakPath);
    if (existing instanceof TFile) {
      await app.vault.modify(existing, knownGood);
    } else {
      await app.vault.create(bakPath, knownGood);
    }
  } catch (error) {
    console.error('[saveMapData] Backup rotation failed (the save itself continues):', error);
  }
}

/** A parsed, usable backup slot found by findBestBackup. */
interface DataFileBackup {
  /** Vault path of the slot file. */
  path: string;
  /** Raw file content (already proven to parse). */
  content: string;
  /** Slot file mtime, epoch ms — 0 when the adapter could not stat it. */
  mtime: number;
  /** How many maps the backup holds, for the confirm prompt. */
  mapCount: number;
}

/**
 * The newest backup slot that still parses, or null when neither does.
 *
 * Reads only the .bak paths (never the data file), so it does not need the
 * data-file mutex.
 */
async function findBestBackup(app: App): Promise<DataFileBackup | null> {
  const dataPath = getDataFilePath();
  const adapter = app.vault.adapter;
  let best: DataFileBackup | null = null;

  for (const slot of BAK_SLOTS) {
    const path = bakPathForSlot(dataPath, slot);
    try {
      if (!(await adapter.exists(path))) continue;
      const content = await adapter.read(path);
      const parsed = JSON.parse(content) as DataFile;
      if (parsed == null || typeof parsed !== 'object' || parsed.maps == null || typeof parsed.maps !== 'object') {
        continue;
      }
      const stat = await adapter.stat(path);
      const candidate: DataFileBackup = {
        path,
        content,
        mtime: stat?.mtime ?? 0,
        mapCount: Object.keys(parsed.maps).length,
      };
      if (best == null || candidate.mtime > best.mtime) best = candidate;
    } catch (error) {
      console.error('[findBestBackup] Backup slot is unusable:', path, error);
    }
  }

  return best;
}

/** Outcome of restoreFromBackup. `corruptPath` is where the old file was preserved. */
interface RestoreResult {
  ok: boolean;
  corruptPath: string | null;
}

/**
 * Replace the data file with `backup`, preserving the current (unreadable) file
 * first as `<dataPath>.corrupt-<yyyymmdd-hhmmss>`.
 *
 * Evidence before repair: if the copy-aside fails, the restore is abandoned
 * rather than destroying a file the user may still be able to salvage by hand.
 * The current file is read through the ADAPTER — `vault.read` goes through the
 * cached TFile and can choke on content the vault never parsed.
 */
async function restoreFromBackup(app: App, backup: DataFileBackup): Promise<RestoreResult> {
  const dataPath = getDataFilePath();
  return enqueueDataFileOp(async (): Promise<RestoreResult> => {
    const adapter = app.vault.adapter;
    let corruptPath: string | null = null;

    try {
      if (await adapter.exists(dataPath)) {
        const corrupt = await adapter.read(dataPath);
        corruptPath = `${dataPath}.corrupt-${backupTimestamp(new Date())}`;
        await adapter.write(corruptPath, corrupt);
      }
    } catch (error) {
      console.error('[restoreFromBackup] Could not preserve the unreadable file, restore abandoned:', error);
      return { ok: false, corruptPath: null };
    }

    try {
      const existing = app.vault.getAbstractFileByPath(dataPath);
      if (existing instanceof TFile) {
        await app.vault.modify(existing, backup.content);
      } else {
        await app.vault.create(dataPath, backup.content);
      }
      return { ok: true, corruptPath };
    } catch (error) {
      console.error('[restoreFromBackup] Writing the backup over the data file failed:', error);
      return { ok: false, corruptPath };
    }
  });
}

// Session-lifetime tombstones for deleted map IDs. A stale autosave from ANY
// still-mounted instance of a deleted map (e.g. the same map open in both a
// note block and a full-pane view) would resurrect it, and a fresh mount would
// get a blank map. saveMapData refuses tombstoned IDs with status 'deleted';
// loadMapData throws MapDeletedError for them (DATA-02).
// Map IDs are timestamp+random, so a new map can't collide with a tombstone.
const deletedMapIds = new Set<string>();

/**
 * Picture frame mode reopens at the locked viewport (set via the Lock view
 * button) instead of wherever the user last left the map. Applied at load
 * time only — the live viewState keeps committing normally while open, so
 * toggling frame mode off never loses the user's real position.
 */
function applyLockedViewState(mapData: MapData): MapData {
  if (mapData.pictureFrame === true && mapData.lockedViewState != null) {
    return { ...mapData, viewState: { ...mapData.lockedViewState } };
  }
  return mapData;
}

/**
 * Load one map from the data file.
 *
 * Returns a fresh map ONLY when the data file is absent, or when it parses
 * cleanly but holds no entry for `mapId`. Any other failure (unreadable file,
 * bad JSON, structurally-wrong document, migration blowup) throws
 * MapDataUnreadableError so the caller can block editing — silently returning a
 * blank map here is what turned a truncated read into permanent data loss.
 * A map deleted this session throws MapDeletedError (never a blank map).
 *
 * Serialized through the data-file mutex so it can never observe a write in
 * progress.
 */
async function loadMapDataWithGeneration(app: App, mapId: string, mapName: string = '', mapType: MapType = 'grid'): Promise<{ data: MapData; generation: number }> {
  const dataPath = getDataFilePath();
  if (deletedMapIds.has(mapId)) throw new MapDeletedError(mapId);
  return enqueueDataFileOp(async () => {
    // A delete that was queued ahead of this load tombstoned the id first.
    if (deletedMapIds.has(mapId)) throw new MapDeletedError(mapId);
    // Captured INSIDE the mutex: the returned snapshot is exactly the state
    // at this generation — no save can land between the read and the stamp.
    const generation = getEntryGeneration(mapId);
    const file = app.vault.getAbstractFileByPath(dataPath);

    if (!(file instanceof TFile)) {
      return { data: createNewMap(mapName, mapType), generation };
    }

    let data: DataFile;
    try {
      const content = await app.vault.read(file);
      data = JSON.parse(content) as DataFile;
      if (data == null || typeof data !== 'object' || data.maps == null || typeof data.maps !== 'object') {
        throw new Error('data file has no "maps" object');
      }
    } catch (error) {
      console.error('[loadMapData] Data file exists but could not be read. Refusing to substitute a blank map:', error);
      notifyCorruptedDataFile(dataPath);
      throw new MapDataUnreadableError(dataPath);
    }

    if (data.maps[mapId] == null) {
      return { data: createNewMap(mapName, mapType), generation };
    }

    // A map from a newer plugin is never opened for editing by this build:
    // everything that edits it assumes this version's shape, and the first
    // autosave would persist the loss under the newer stamp. Not corruption,
    // so no corrupt-file notice and no backup restore (MapSchemaError).
    const claimed = claimedSchemaVersion(data.maps[mapId]);
    if (isNewerSchema(data.maps[mapId])) {
      throw new MapSchemaError('newer-version', claimed ?? 0, `map schema v${String(claimed)}, this plugin knows v${String(SCHEMA_VERSION)}`);
    }

    try {
      data.maps[mapId] = migrateMapData(data.maps[mapId]);
      if (data.maps[mapId].name == null && mapName) {
        data.maps[mapId].name = mapName;
      }
      return { data: applyLockedViewState(data.maps[mapId]), generation };
    } catch (error) {
      if (error instanceof MapSchemaError) {
        // Missing/failed schema step: a plugin defect, not a corrupt file.
        // Restoring a backup would not help (it holds the same schema) and
        // would discard recent edits.
        console.error('[loadMapData] Stored map entry needs a newer or fixed plugin version:', error);
        throw error;
      }
      // The entry exists but is malformed enough to break migration. Same rule:
      // never hand back a blank map that a later save would merge over it.
      console.error('[loadMapData] Stored map entry could not be migrated. Refusing to substitute a blank map:', error);
      notifyCorruptedDataFile(dataPath);
      throw new MapDataUnreadableError(dataPath);
    }
  });
}

/** Convenience wrapper for read-only consumers that don't track generations. */
async function loadMapData(app: App, mapId: string, mapName: string = '', mapType: MapType = 'grid'): Promise<MapData> {
  return (await loadMapDataWithGeneration(app, mapId, mapName, mapType)).data;
}

/**
 * The raw, unmigrated JSON text of one stored map entry (null when the file or
 * the entry is absent, or the file is unreadable).
 *
 * Used only by the save-journal replay check, which must compare against what
 * is literally on disk — the migrated object loadMapData returns has already
 * been mutated and would produce false "unsaved changes" prompts.
 */
async function readRawMapEntry(app: App, mapId: string): Promise<string | null> {
  return enqueueDataFileOp(async () => {
    try {
      const file = app.vault.getAbstractFileByPath(getDataFilePath());
      if (!(file instanceof TFile)) return null;
      const data = JSON.parse(await app.vault.read(file)) as DataFile;
      const entry = data?.maps?.[mapId];
      return entry != null ? JSON.stringify(entry) : null;
    } catch {
      return null;
    }
  });
}

/** Whether this session has tombstoned `mapId` (deleted via deleteMapData). */
function isMapTombstoned(mapId: string): boolean {
  return deletedMapIds.has(mapId);
}

/**
 * Save map data to vault.
 *
 * Saves are protected by:
 *   1. Mutex (saveQueue) — serializes concurrent saves so two writes never race.
 *      Required because each save does read-modify-write on the whole file;
 *      without serialization, simultaneous saves of different maps would clobber
 *      each other (lost-update problem).
 *   2. Pre-write validation — JSON.parse the serialized output before any disk
 *      write, and refuse to save if existing on-disk file is unparseable
 *      (prevents silently overwriting corrupted data with partial state).
 */
/**
 * Upgrade stored tile ids to their canonical form against the map's tileset
 * registry (legacy basename ids → folder-relative ids minted at scan).
 *
 * Runs at save time, NOT load time: the live tileset rescan completes async
 * after load, and rewriting against an incomplete registry is how the
 * 304-tile render-mode regression happened. This pass is safe against a
 * stale registry by construction — a registry still holding old-style ids
 * exact-matches every stored id, so nothing rewrites. Idempotent: canonical
 * ids resolve to themselves.
 *
 * Returns the canonicalized tree and NEVER mutates the input (it is live
 * Preact state shared with undo snapshots). When nothing changes the input
 * itself is returned. Covers the root and every nested sub-hex map.
 */
function canonicalizeTileIds(mapData: MapData): MapData {
  const tilesets = mapData.tilesets;
  if (tilesets == null || tilesets.length === 0) return mapData;

  // Memoized per (tilesetId, tileId) pair: placements repeat the same few
  // tiles thousands of times, and resolveTileEntry is a linear scan.
  const memo = new Map<string, string | null>();
  const canon = (tilesetId: string, tileId: string): string | null => {
    const key = tilesetId + ':' + tileId;
    let c = memo.get(key);
    if (c === undefined) {
      const entry = resolveTileEntry(tilesets.find(t => t.id === tilesetId), tileId);
      c = entry != null && entry.id !== tileId ? entry.id : null;
      memo.set(key, c);
    }
    return c;
  };

  // Copy-on-write: the input is live Preact state shared with undo
  // snapshots, so nothing is edited in place. Only the objects on the path to
  // a changed id are copied; untouched subtrees keep their identity.
  const mapArray = <T>(arr: T[], fn: (item: T) => T): T[] => {
    let out: T[] | null = null;
    for (let i = 0; i < arr.length; i++) {
      const next = fn(arr[i]);
      if (next !== arr[i]) {
        out ??= arr.slice();
        out[i] = next;
      }
    }
    return out ?? arr;
  };
  const upgradeRef = <T extends { tilesetId: string; tileId: string }>(item: T): T => {
    const c = canon(item.tilesetId, item.tileId);
    return c != null ? { ...item, tileId: c } : item;
  };
  const upgradeWall = (w: WallPath): WallPath => {
    let next = upgradeRef(w);
    // Seated opening art canonicalizes exactly like the strip's tileId:
    // resolve-only (never null an unresolved ref — the pack may be
    // temporarily uninstalled), save-time, and inside this shared walk so
    // sub-hex doors canonicalize too (integrity F7).
    if (w.gaps != null) {
      const gaps = mapArray(w.gaps, (gap) => {
        if (gap.tile == null) return gap;
        const tile = upgradeRef(gap.tile);
        return tile !== gap.tile ? { ...gap, tile } : gap;
      });
      if (gaps !== w.gaps) next = { ...next, gaps };
    }
    return next;
  };
  const upgradeLayer = (layer: MapLayer): MapLayer => {
    const tiles = layer.tiles != null ? mapArray(layer.tiles, upgradeRef) : layer.tiles;
    const terrainStrokes = layer.terrainStrokes != null ? mapArray(layer.terrainStrokes, upgradeRef) : layer.terrainStrokes;
    const wallPaths = layer.wallPaths != null ? mapArray(layer.wallPaths, upgradeWall) : layer.wallPaths;
    if (tiles === layer.tiles && terrainStrokes === layer.terrainStrokes && wallPaths === layer.wallPaths) return layer;
    const next: MapLayer = { ...layer };
    if (tiles !== layer.tiles) next.tiles = tiles;
    if (terrainStrokes !== layer.terrainStrokes) next.terrainStrokes = terrainStrokes;
    if (wallPaths !== layer.wallPaths) next.wallPaths = wallPaths;
    return next;
  };
  // Sub-hex maps at every depth resolve against the ROOT registry (tilesets
  // are root-owned; sub-hex views read the root's).
  const upgradeMap = (m: MapData): MapData => {
    const layers = Array.isArray(m.layers) ? mapArray(m.layers, upgradeLayer) : m.layers;
    let subHexMaps = m.subHexMaps;
    if (m.subHexMaps != null) {
      let copy: Record<string, SubHexMapData> | null = null;
      for (const hexKey of Object.keys(m.subHexMaps)) {
        const sub = m.subHexMaps[hexKey];
        if (sub?.mapData == null) continue;
        const md = upgradeMap(sub.mapData);
        if (md !== sub.mapData) {
          copy ??= { ...m.subHexMaps };
          copy[hexKey] = { ...sub, mapData: md };
        }
      }
      if (copy != null) subHexMaps = copy;
    }
    if (layers === m.layers && subHexMaps === m.subHexMaps) return m;
    const next: MapData = { ...m, layers };
    if (subHexMaps !== m.subHexMaps) next.subHexMaps = subHexMaps;
    return next;
  };

  return upgradeMap(mapData);
}

/**
 * In-process per-mapId write generation. Every successful saveMapData write
 * increments the map's generation; loadMapDataWithGeneration reports the
 * generation its snapshot reflects. A save whose caller loaded (or last
 * saved) at an OLDER generation would replace the whole entry with a stale
 * tree — silently destroying whatever another mount of the same map has
 * committed since — so it is refused as 'stale' instead.
 *
 * Deliberately in-process, not persisted: a persisted rev field would change
 * every entry's bytes and perturb the save journal's exact-string comparison.
 * Cross-process/device conflicts remain out of scope (as they always were);
 * this guard closes the same-window multi-pane race, which shares one module
 * realm — the same assumption the save mutex and deletion tombstones already
 * rely on.
 *
 * KNOWN RESIDUAL GAP (windrose-bc7): generations reset on app restart, so a
 * crash-journal restore accepted after a restart replays its whole tree at
 * base 0 and is never refused — a stale journal from a second pane can still
 * clobber a newer pre-crash save. Do NOT read this guard as covering the
 * journal-restore path across restarts.
 */
interface EntryGenerationState {
  generation: number;
  /** Per-mount writer id of the last successful save (null = untracked). */
  writerId: string | null;
}

const entryGenerations = new Map<string, EntryGenerationState>();

/** Current write generation for a map entry (0 = never written this session). */
function getEntryGeneration(mapId: string): number {
  return entryGenerations.get(mapId)?.generation ?? 0;
}

type SaveMapResult =
  | { status: 'saved'; generation: number }
  | { status: 'failed' }
  | { status: 'stale' }
  /** The map was deleted this session; nothing was written (DATA-02). Terminal. */
  | { status: 'deleted' };

/**
 * The guarded write of one map entry. MUST run inside the data-file mutex.
 *
 * Read-modify-write of the whole file: refuses to overwrite an unparseable
 * file, rotates a .bak of the known-good content, canonicalizes tile ids (on a
 * copy), serializes compactly before touching disk, and bumps the entry's
 * write generation. Shared by saveMapData and createMapEntry so there is
 * exactly one store-writer contract.
 */
async function writeMapEntryLocked(app: App, mapId: string, mapData: MapData, writerId: string | null): Promise<SaveMapResult> {
  let allData: DataFile = { maps: {} };

  // Load existing data
  const dataPath = getDataFilePath();
  const abstractFile = app.vault.getAbstractFileByPath(dataPath);
  const file = abstractFile instanceof TFile ? abstractFile : null;
  if (file) {
    const content = await app.vault.read(file);
    try {
      allData = JSON.parse(content) as DataFile;
    } catch (parseError) {
      console.error(
        '[saveMapData] Existing data file is unparseable. Refusing to overwrite to avoid data loss. ' +
        'Inspect or restore the file manually before saving again.',
        parseError
      );
      notifyCorruptedDataFile(dataPath);
      return { status: 'failed' } as const;
    }

    // Backup rotation. `content` has just been proven to parse, so it is
    // known-good — the backup captures THAT, never the merged output we are
    // about to write (a backup of unverified new state protects nothing).
    // Runs before vault.modify, inside the mutex.
    const now = Date.now();
    if (shouldRotateBak(lastBakAt, now)) {
      const slot = nextBakSlot;
      // Stamped BEFORE the write: a slot that keeps failing must not retry
      // on every autosave (see BAK_THROTTLE_MS).
      lastBakAt = now;
      nextBakSlot = otherBakSlot(slot);
      await writeBackupSlot(app, dataPath, slot, content);
    }
  }

  // Update specific map with legacy tile ids upgraded. The canonical tree is
  // a copy-on-write result: the caller's (live) object is never edited.
  allData.maps ??= {};
  allData.maps[mapId] = canonicalizeTileIds(mapData);

  // Serialize BEFORE touching disk. A circular ref or BigInt makes
  // JSON.stringify throw, which aborts the save here without corrupting the
  // file; a successful stringify of a plain object is ALWAYS valid JSON, so
  // re-parsing it to "validate" only burned a full main-thread parse. Compact
  // output (no pretty-print): on a multi-MB multi-map file the indentation
  // pass plus the redundant re-parse tripled per-save main-thread time,
  // freezing the UI ~300-450ms on every autosave.
  let jsonString: string;
  try {
    jsonString = JSON.stringify(allData);
  } catch (serializeError) {
    console.error('[saveMapData] Serialization failed, save aborted:', serializeError);
    return { status: 'failed' } as const;
  }

  if (file) {
    await app.vault.modify(file, jsonString);
  } else {
    const dirPath = dataPath.includes('/') ? dataPath.substring(0, dataPath.lastIndexOf('/')) : '';
    if (dirPath !== '' && app.vault.getAbstractFileByPath(dirPath) == null) {
      try { await app.vault.createFolder(dirPath); } catch { /* already exists */ }
    }
    await app.vault.create(dataPath, jsonString);
  }

  const generation = getEntryGeneration(mapId) + 1;
  entryGenerations.set(mapId, { generation, writerId });
  return { status: 'saved', generation } as const;
}

async function saveMapData(app: App, mapId: string, mapData: MapData, baseGeneration?: number, writerId?: string): Promise<SaveMapResult> {
  // Tombstoned map: drop the write and say so. Reporting 'saved' here let a
  // still-mounted instance show "Saved" (and clear its journal) for edits that
  // were never written (DATA-02).
  if (deletedMapIds.has(mapId)) return { status: 'deleted' } as const;
  return enqueueDataFileOp(async () => {
    // Re-checked inside the mutex: a delete queued ahead of this save
    // tombstoned the id after the check above.
    if (deletedMapIds.has(mapId)) return { status: 'deleted' } as const;
    try {
      // Stale-base check inside the mutex: refuse to replace an entry that
      // has been written since this caller's tree was loaded/last saved —
      // UNLESS the last writer was this same caller. An instance's saves are
      // dispatched with the base read BEFORE its previous save resolved, so
      // without the writer exemption an instance whose write outlasts the
      // debounce window gets refused against ITSELF (spurious conflict
      // panel). Same-writer payloads are always derived from newer state
      // than the write they follow, so passing them is safe by construction.
      const current = entryGenerations.get(mapId);
      if (
        baseGeneration != null && current != null && current.generation > baseGeneration &&
        (writerId == null || current.writerId !== writerId)
      ) {
        console.warn(`[saveMapData] Refusing stale save of "${mapId}": base generation ${String(baseGeneration)} < current ${String(current.generation)} last written by ${current.writerId ?? 'untracked'} (map open in another pane?)`);
        return { status: 'stale' } as const;
      }
      return await writeMapEntryLocked(app, mapId, mapData, writerId ?? null);
    } catch (error) {
      console.error('Error saving map data:', error);
      return { status: 'failed' } as const;
    }
  });
}

/**
 * Delete a map from the data file.
 *
 * Serialized through the same mutex as saveMapData so it can't race a pending
 * autosave. Returns true if the map existed and was removed, false if the mapId
 * was absent (no write performed). The data file itself is never deleted, even
 * if it becomes empty.
 */
async function deleteMapData(app: App, mapId: string): Promise<boolean> {
  // Tombstone before enqueue so post-tombstone saves are refused immediately;
  // pre-tombstone saves that beat us into the mutex write first and are deleted after.
  deletedMapIds.add(mapId);
  return enqueueDataFileOp(async () => {
    try {
      const dataPath = getDataFilePath();
      const abstractFile = app.vault.getAbstractFileByPath(dataPath);
      if (!(abstractFile instanceof TFile)) return false;

      const content = await app.vault.read(abstractFile);
      let allData: DataFile;
      try {
        allData = JSON.parse(content) as DataFile;
      } catch (parseError) {
        console.error(
          '[deleteMapData] Existing data file is unparseable. Refusing to modify to avoid data loss.',
          parseError
        );
        notifyCorruptedDataFile(dataPath);
        return false;
      }

      if (allData.maps[mapId] == null) return false;

      delete allData.maps[mapId];

      let jsonString: string;
      try {
        jsonString = JSON.stringify(allData);
      } catch (serializeError) {
        console.error('[deleteMapData] Serialization failed, delete aborted:', serializeError);
        return false;
      }

      await app.vault.modify(abstractFile, jsonString);
      return true;
    } catch (error) {
      console.error('Error deleting map data:', error);
      return false;
    }
  });
}

function createNewMap(mapName: string = '', mapType: MapType = 'grid'): MapData {
  // Generate layer ID for initial layer
  const initialLayerId = generateLayerId();

  const initialLayer: MapLayer = {
    id: initialLayerId,
    name: '1',
    order: 0,
    visible: true,
    cells: [],
    curves: [],
    edges: [],
    objects: [],
    textLabels: [],
    fogOfWar: null,
    boardId: DEFAULT_BOARD_ID,
  };

  // Base map structure with layer schema (v2)
  const baseMap: MapData = {
    // Global settings
    name: mapName,
    description: "",
    mapType: mapType,
    northDirection: 0,
    customColors: [],
    sidebarCollapsed: false,
    expandedState: false,
    settings: {
      useGlobalSettings: true,
      overrides: {}
    },
    uiPreferences: {
      rememberPanZoom: true,
      rememberSidebarState: true,
      rememberExpandedState: false
    },
    lastTextLabelSettings: null,

    // Layer system (v2)
    schemaVersion: SCHEMA_VERSION,
    activeLayerId: initialLayerId,
    layerPanelVisible: false,
    layers: [initialLayer],

    // Board (floor) system — one implicit default board
    boards: [{ id: DEFAULT_BOARD_ID, name: 'Ground Floor', order: 0 }],
    activeBoardId: DEFAULT_BOARD_ID,

    // Will be set below based on mapType
    gridSize: DEFAULTS.gridSize,
    dimensions: { ...DEFAULTS.dimensions },
    viewState: {
      zoom: DEFAULTS.initialZoom,
      center: { x: 0, y: 0 }
    }
  };

  // Add type-specific properties
  if (mapType === 'hex') {
    // Get global settings to respect user configuration
    const globalSettings = getSettings();

    baseMap.hexSize = DEFAULTS.hexSize;
    baseMap.orientation = globalSettings.hexOrientation || DEFAULTS.hexOrientation;
    baseMap.hexBounds = { ...DEFAULTS.hexBounds };
    baseMap.dimensions = { ...DEFAULTS.dimensions };

    // Calculate proper viewport center for hex map using offset coordinates
    const hexSize = baseMap.hexSize;
    const orientation = baseMap.orientation;

    // Calculate center in offset coordinates (rectangular bounds)
    const centerCol = Math.floor(DEFAULTS.hexBounds.maxCol / 2);
    const centerRow = Math.floor(DEFAULTS.hexBounds.maxRow / 2);

    // Convert offset center to axial coordinates
    const { q: centerQ, r: centerR } = offsetToAxial(centerCol, centerRow, orientation);

    // Convert hex center to world coordinates (using axial coords)
    let worldX: number, worldY: number;
    if (orientation === 'flat') {
      worldX = hexSize * (3 / 2) * centerQ;
      worldY = hexSize * (Math.sqrt(3) / 2 * centerQ + Math.sqrt(3) * centerR);
    } else {
      // pointy
      worldX = hexSize * (Math.sqrt(3) * centerQ + Math.sqrt(3) / 2 * centerR);
      worldY = hexSize * (3 / 2) * centerR;
    }

    const fitZoom = calculateFitZoom(
      hexSize, orientation, baseMap.hexBounds,
      DEFAULTS.canvasSize.width, DEFAULTS.canvasSize.height
    );

    baseMap.viewState = {
      zoom: fitZoom,
      center: {
        x: worldX,
        y: worldY
      }
    };
  } else {
    // Grid map
    baseMap.gridSize = DEFAULTS.gridSize;
    baseMap.dimensions = { ...DEFAULTS.dimensions };
    baseMap.viewState = {
      zoom: DEFAULTS.initialZoom,
      center: {
        x: Math.floor(DEFAULTS.dimensions.width / 2),
        y: Math.floor(DEFAULTS.dimensions.height / 2)
      }
    };
  }

  return baseMap;
}

/**
 * A new map entry: createNewMap(name, mapType) with `overrides` spread over
 * the map and `layerOverrides` over its single initial layer. Pure. Used by
 * generated-content writers so their maps keep every createNewMap default
 * (boards, layer boardId, curves array) instead of a hand-copied literal.
 */
function buildMapEntry(
  name: string,
  mapType: MapType,
  overrides: Partial<MapData> = {},
  layerOverrides: Partial<MapLayer> = {}
): MapData {
  const base = createNewMap(name, mapType);
  const layer: MapLayer = { ...base.layers[0], ...layerOverrides };
  return { ...base, ...overrides, layers: [layer], activeLayerId: layer.id };
}

/**
 * Persist a brand-new map entry through the same guarded path as saveMapData
 * (mutex, unparseable-file refusal, .bak rotation, tile-id canonicalization,
 * compact JSON, write-generation bump). Throws when the write fails so the
 * caller can surface it.
 */
async function createMapEntry(app: App, mapId: string, mapData: MapData): Promise<void> {
  const result = await enqueueDataFileOp(() => writeMapEntryLocked(app, mapId, mapData, null));
  if (result.status !== 'saved') {
    throw new Error('Windrose: map data file is unreadable or could not be written, map not created.');
  }
}

interface MapListEntry {
  id: string;
  name: string;
  type: MapType;
}

/**
 * Map list outcome. 'unreadable' means the data file EXISTS but could not be
 * read or parsed — a picker must not present that as "no maps" (DATA-20).
 */
type MapListResult =
  | { status: 'ok'; maps: MapListEntry[] }
  | { status: 'unreadable'; dataPath: string };

async function listMapsResult(app: App): Promise<MapListResult> {
  // Serialized with writes: an unserialized read can catch a chunked write
  // mid-flight and see a truncated document.
  const dataPath = getDataFilePath();
  return enqueueDataFileOp(async (): Promise<MapListResult> => {
    const file = app.vault.getAbstractFileByPath(dataPath);
    if (!(file instanceof TFile)) return { status: 'ok', maps: [] };
    try {
      const content = await app.vault.read(file);
      const data = JSON.parse(content) as DataFile;
      if (data == null || typeof data !== 'object' || data.maps == null || typeof data.maps !== 'object') {
        throw new Error('data file has no "maps" object');
      }
      const maps = Object.entries(data.maps).map(([id, mapData]) => ({
        id,
        name: mapData.name != null && mapData.name !== '' ? mapData.name : id,
        type: mapData.mapType || 'grid',
      }));
      return { status: 'ok', maps };
    } catch (error) {
      console.error('[listMaps] Data file exists but could not be read:', error);
      return { status: 'unreadable', dataPath };
    }
  });
}

/**
 * Entries only; an unreadable store yields [] (legacy shape for callers that
 * cannot show an error). Prefer listMapsResult where the UI can say why.
 */
async function listMaps(app: App): Promise<MapListEntry[]> {
  const result = await listMapsResult(app);
  return result.status === 'ok' ? result.maps : [];
}

export type { SaveMapResult };
export {
  loadMapData, loadMapDataWithGeneration, getEntryGeneration,
  saveMapData, deleteMapData, createNewMap, buildMapEntry, createMapEntry, listMaps, listMapsResult, migrateMapData,
  canonicalizeTileIds, applyLockedViewState, enqueueDataFileOp, getSaveQueue,
  notifyCorruptedDataFile, readRawMapEntry, isMapTombstoned, MapDataUnreadableError, MapDeletedError, MapSchemaError,
  shouldRotateBak, otherBakSlot, bakPathForSlot, backupTimestamp,
  findBestBackup, restoreFromBackup, BAK_THROTTLE_MS
};
export type { MapListEntry, MapListResult, BakSlot, DataFileBackup, RestoreResult };
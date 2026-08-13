/**
 * fileOperations.ts
 *
 * File I/O operations for map data persistence.
 * Handles loading/saving map data to the Obsidian vault.
 */

import type { MapData, MapLayer, MapType } from '#types/core/map.types';
import type { WallPath } from '#types/core/wallpath.types';
import type { App } from 'obsidian';
import { TFile, Notice } from 'obsidian';

import { DEFAULTS, SCHEMA_VERSION } from '../core/dmtConstants';
import { getDataFilePath } from '../core/settingsAccessor';
import { offsetToAxial } from '../geometry/core/offsetCoordinates';
import { getSettings } from '../core/settingsAccessor';
import { migrateToLayerSchema, needsMigration, generateLayerId, ensureBoards, DEFAULT_BOARD_ID } from './layerAccessor';
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

// Session-lifetime tombstones for deleted map IDs. loadMapData silently
// re-creates missing maps, so a stale autosave from ANY still-mounted instance
// of a deleted map (e.g. the same map open in both a note block and a
// full-pane view) would resurrect it. saveMapData refuses tombstoned IDs.
// Map IDs are timestamp+random, so a new map can't collide with a tombstone.
const deletedMapIds = new Set<string>();

/**
 * Sanitize a wall's openings on load. Drops ONLY structurally-invalid gaps
 * (invariants 1-2): non-object, missing id, non-integer/out-of-range `seg`,
 * non-finite `t` outside [0,1], or `widthCells <= 0`/non-finite. These are the
 * only conditions that delete a gap (integrity F1).
 *
 * Geometric invariants (3 door-wider-than-segment, 4 overlap) are NOT enforced
 * here: they are clamp/nudge-at-derive (§2.2), and computing them would require
 * flattening every wall against `cellSize`, which this migration deliberately
 * avoids (§2.5 note — the cheapest correct approach). A `gap.tile` binding is
 * NEVER destroyed (integrity F2). Empty/absent → the field is removed so
 * gapless walls stay byte-identical.
 */
function sanitizeWallGaps(w: WallPath): void {
  const raw = (w as { gaps?: unknown }).gaps;
  if (!Array.isArray(raw)) {
    delete (w as { gaps?: unknown }).gaps;
    return;
  }
  const V = w.vertices.length;
  const segCount = w.closed ? V : V - 1;
  const valid = raw.filter((g: unknown): boolean => {
    if (g == null || typeof g !== 'object') return false;
    const gap = g as Record<string, unknown>;
    return (
      typeof gap.id === 'string' &&
      Number.isInteger(gap.seg) && (gap.seg as number) >= 0 && (gap.seg as number) < segCount &&
      Number.isFinite(gap.t) && (gap.t as number) >= 0 && (gap.t as number) <= 1 &&
      Number.isFinite(gap.widthCells) && (gap.widthCells as number) > 0
    );
  });
  if (valid.length > 0) w.gaps = valid;
  else delete (w as { gaps?: unknown }).gaps;
}

function migrateMapData(mapData: MapData): MapData {
  mapData.objects ??= [];
  mapData.textLabels ??= [];
  mapData.customColors ??= [];
  mapData.edges ??= [];
  mapData.regions ??= [];
  mapData.outlines ??= [];
  mapData.shapeOverlays ??= [];
  mapData.partyPins ??= [];
  mapData.savedRoutes ??= [];
  // Legacy measurement route shape (bare waypoint array, pre-terrain)
  if (Array.isArray(mapData.measurementRoute)) {
    mapData.measurementRoute = { points: mapData.measurementRoute, segmentTerrains: [] };
  }
  if (!mapData.mapType) mapData.mapType = 'grid';
  mapData.settings ??= { useGlobalSettings: true, overrides: {} };
  mapData.uiPreferences ??= {
    rememberPanZoom: true,
    rememberSidebarState: true,
    rememberExpandedState: false
  };
  mapData.expandedState ??= false;
  mapData.lastTextLabelSettings ??= null;

  // Hex-specific migration
  if (mapData.mapType === 'hex') {
    if (!mapData.hexBounds) {
      mapData.hexBounds = { ...DEFAULTS.hexBounds };
    } else if ((mapData.hexBounds as unknown as Record<string, unknown>).maxQ !== undefined) {
      // Old axial bounds format → offset format (boundary cast: legacy schema)
      const legacyBounds = mapData.hexBounds as unknown as Record<string, unknown>;
      mapData.hexBounds = {
        maxCol: legacyBounds.maxQ as number,
        maxRow: legacyBounds.maxR as number
      };
    }

    if (!mapData.backgroundImage) {
      mapData.backgroundImage = {
        path: null,
        lockBounds: false,
        gridDensity: 'medium',
        customColumns: 24,
        sizingMode: 'density',
        measurementMethod: 'corner',
        measurementSize: 86,
        fineTuneOffset: 0
      };
    } else {
      mapData.backgroundImage.gridDensity ??= 'medium';
      mapData.backgroundImage.customColumns ??= 24;
      mapData.backgroundImage.sizingMode ??= 'density';
      mapData.backgroundImage.measurementMethod ??= 'corner';
      mapData.backgroundImage.measurementSize ??= 86;
      mapData.backgroundImage.fineTuneOffset ??= 0;
    }
  }

  // Layer schema migration (v2)
  if (needsMigration(mapData)) {
    mapData = migrateToLayerSchema(mapData) as MapData;
  }

  // Tileset source migration: add source: 'folder' to legacy tilesets
  mapData.tilesets ??= [];
  for (const ts of mapData.tilesets) {
    if (!('source' in ts)) {
      (ts as Record<string, unknown>).source = 'folder';
    }
  }

  // Layer-level arrays and curve migration
  for (const layer of mapData.layers) {
    layer.tiles ??= [];

    // Tile assignment migration: q→col, r→row, layer→placement (boundary cast: legacy schema)
    for (const tile of layer.tiles) {
      const legacy = tile as unknown as Record<string, unknown>;
      if ('q' in legacy && !('col' in legacy)) {
        legacy.col = legacy.q;
        legacy.row = legacy.r;
        delete legacy.q;
        delete legacy.r;
      }
      if ('layer' in legacy && !('placement' in legacy)) {
        const oldLayer = legacy.layer as string;
        legacy.placement = oldLayer === 'base' ? undefined : oldLayer;
        delete legacy.layer;
      }
    }

    layer.wallPaths ??= [];
    layer.wallPaths = layer.wallPaths.filter(w => Array.isArray(w.vertices) && w.vertices.length >= 2 &&
      typeof w.tilesetId === 'string' && typeof w.tileId === 'string');
    for (const w of layer.wallPaths) sanitizeWallGaps(w);

    layer.terrainStrokes ??= [];
    layer.terrainStrokes = layer.terrainStrokes.filter(s =>
      Array.isArray(s.points) && s.points.length >= 2 && s.points.length % 2 === 0 &&
      Number.isFinite(s.radius) && s.radius > 0 &&
      typeof s.tilesetId === 'string' && typeof s.tileId === 'string');

    layer.curves ??= [];
    layer.curves = layer.curves.filter(c => c.start != null && c.segments != null);
    for (const curve of layer.curves) {
      // Migrate legacy holes (flat number[]) to innerRings (boundary cast: legacy schema)
      const legacy = (curve as unknown as Record<string, unknown>).holes as number[][] | undefined;
      if (legacy && legacy.length > 0) {
        const innerRings: [number, number][][] = [];
        for (const hole of legacy) {
          if (hole.length < 6) continue;
          const ring: [number, number][] = [];
          for (let i = 0; i < hole.length; i += 2) {
            ring.push([hole[i], hole[i + 1]]);
          }
          innerRings.push(ring);
        }
        if (innerRings.length > 0) {
          curve.innerRings = innerRings;
        }
        delete (curve as unknown as Record<string, unknown>).holes;
      }
    }
  }

  // Board (floor) projection: ensure every layer has a boardId, the boards registry
  // exists, and activeBoardId is valid. Idempotent — safe on already-migrated maps.
  ensureBoards(mapData);

  // Sub-hex migration
  if (mapData.subHexMaps) {
    for (const hexKey of Object.keys(mapData.subHexMaps)) {
      const subHex = mapData.subHexMaps[hexKey];
      if (subHex?.mapData != null) {
        for (const layer of subHex.mapData.layers) {
          layer.tiles ??= [];
          layer.curves ??= [];
          layer.curves = layer.curves.filter(c => c.start != null && c.segments != null);
          layer.wallPaths ??= [];
          layer.wallPaths = layer.wallPaths.filter(w => Array.isArray(w.vertices) && w.vertices.length >= 2 &&
            typeof w.tilesetId === 'string' && typeof w.tileId === 'string');
          for (const w of layer.wallPaths) sanitizeWallGaps(w);
          layer.terrainStrokes ??= [];
          layer.terrainStrokes = layer.terrainStrokes.filter(s =>
            Array.isArray(s.points) && s.points.length >= 2 && s.points.length % 2 === 0 &&
            Number.isFinite(s.radius) && s.radius > 0 &&
            typeof s.tilesetId === 'string' && typeof s.tileId === 'string');
        }
        subHex.mapData.regions ??= [];
        subHex.mapData.outlines ??= [];
        subHex.mapData.shapeOverlays ??= [];
        subHex.mapData.partyPins ??= [];
        // Sub-hex maps get their own implicit board too (Parallax: don't leave
        // sub-hex layers boardless or board filters would drop them).
        ensureBoards(subHex.mapData);
      }
    }
  }

  return mapData;
}

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
 *
 * Serialized through the data-file mutex so it can never observe a write in
 * progress.
 */
async function loadMapData(app: App, mapId: string, mapName: string = '', mapType: MapType = 'grid'): Promise<MapData> {
  const dataPath = getDataFilePath();
  return enqueueDataFileOp(async () => {
    const file = app.vault.getAbstractFileByPath(dataPath);

    if (!(file instanceof TFile)) {
      return createNewMap(mapName, mapType);
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
      return createNewMap(mapName, mapType);
    }

    try {
      data.maps[mapId] = migrateMapData(data.maps[mapId]);
      if (data.maps[mapId].name == null && mapName) {
        data.maps[mapId].name = mapName;
      }
      return applyLockedViewState(data.maps[mapId]);
    } catch (error) {
      // The entry exists but is malformed enough to break migration. Same rule:
      // never hand back a blank map that a later save would merge over it.
      console.error('[loadMapData] Stored map entry could not be migrated. Refusing to substitute a blank map:', error);
      notifyCorruptedDataFile(dataPath);
      throw new MapDataUnreadableError(dataPath);
    }
  });
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
 */
function canonicalizeTileIds(mapData: MapData): void {
  const tilesets = mapData.tilesets;
  if (tilesets == null || tilesets.length === 0) return;

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

  const upgradeLayers = (layers: MapLayer[]): void => {
    for (const layer of layers) {
      for (const t of layer.tiles ?? []) {
        const c = canon(t.tilesetId, t.tileId);
        if (c != null) t.tileId = c;
      }
      for (const s of layer.terrainStrokes ?? []) {
        const c = canon(s.tilesetId, s.tileId);
        if (c != null) s.tileId = c;
      }
      for (const w of layer.wallPaths ?? []) {
        const c = canon(w.tilesetId, w.tileId);
        if (c != null) w.tileId = c;
        // Seated opening art canonicalizes exactly like the strip's tileId:
        // resolve-only (never null an unresolved ref — the pack may be
        // temporarily uninstalled), save-time, and inside this shared walk so
        // sub-hex doors canonicalize too (integrity F7).
        for (const gap of w.gaps ?? []) {
          if (gap.tile != null) {
            const gc = canon(gap.tile.tilesetId, gap.tile.tileId);
            if (gc != null) gap.tile.tileId = gc;
          }
        }
      }
    }
  };

  upgradeLayers(mapData.layers);
  if (mapData.subHexMaps) {
    for (const hexKey of Object.keys(mapData.subHexMaps)) {
      const sub = mapData.subHexMaps[hexKey];
      if (sub?.mapData != null) upgradeLayers(sub.mapData.layers);
    }
  }
}

async function saveMapData(app: App, mapId: string, mapData: MapData): Promise<boolean> {
  // Tombstoned map: silently drop the write. Returning true (not false) lets a
  // stale instance's save status settle to 'Saved' instead of flagging an error
  // for an intentional no-op.
  if (deletedMapIds.has(mapId)) return true;
  return enqueueDataFileOp(async () => {
    try {
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
          return false;
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

      // Update specific map — upgrading any legacy tile ids in place first so
      // disk and memory converge on canonical ids.
      canonicalizeTileIds(mapData);
      allData.maps[mapId] = mapData;

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
        return false;
      }

      if (file) {
        await app.vault.modify(file, jsonString);
      } else {
        await app.vault.create(dataPath, jsonString);
      }

      return true;
    } catch (error) {
      console.error('Error saving map data:', error);
      return false;
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

interface MapListEntry {
  id: string;
  name: string;
  type: MapType;
}

async function listMaps(app: App): Promise<MapListEntry[]> {
  // Serialized with writes: an unserialized read can catch a chunked write
  // mid-flight and see a truncated document.
  return enqueueDataFileOp(async () => {
    try {
      const dataPath = getDataFilePath();
      const file = app.vault.getAbstractFileByPath(dataPath);
      if (!(file instanceof TFile)) return [];

      const content = await app.vault.read(file);
      const data = JSON.parse(content) as DataFile;

      return Object.entries(data.maps).map(([id, mapData]) => ({
        id,
        name: mapData.name != null && mapData.name !== '' ? mapData.name : id,
        type: mapData.mapType || 'grid',
      }));
    } catch {
      return [];
    }
  });
}

export {
  loadMapData, saveMapData, deleteMapData, createNewMap, listMaps, migrateMapData,
  canonicalizeTileIds, applyLockedViewState, enqueueDataFileOp, getSaveQueue,
  notifyCorruptedDataFile, readRawMapEntry, isMapTombstoned, MapDataUnreadableError,
  shouldRotateBak, otherBakSlot, bakPathForSlot, backupTimestamp,
  findBestBackup, restoreFromBackup, BAK_THROTTLE_MS
};
export type { MapListEntry, BakSlot, DataFileBackup, RestoreResult };
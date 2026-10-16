/**
 * schemaMigration.ts
 *
 * Load-time migration of stored map entries: the version-stepped schema
 * runner, plus the per-map defaults, sanitation filters and legacy-shape
 * upgrades that every map level (root AND every nested sub-hex map, at any
 * depth) receives.
 *
 * Re-exported from fileOperations (migrateMapData) so existing imports keep
 * working.
 */

import type { MapData, MapLayer, ShapeOverlay } from '#types/core/map.types';
import type { WallPath } from '#types/core/wallpath.types';

import { DEFAULTS, SCHEMA_VERSION } from '../core/dmtConstants';
import { migrateToLayerSchema, ensureBoards, LAYER_SCHEMA_VERSION, normaliseLevels } from './layerAccessor';

// ===========================================
// Version-stepped schema runner
// ===========================================

type SchemaStep = (mapData: MapData) => MapData;

/**
 * Schema migration steps, keyed by the TARGET version: `migrations[n]` upgrades
 * a map stored at version n-1 to version n. Bumping SCHEMA_VERSION REQUIRES
 * registering `migrations[SCHEMA_VERSION]` here; the runner refuses to load
 * (rather than silently rebuild or skip) when a step is missing, and a unit
 * test asserts every step from 2..SCHEMA_VERSION is registered.
 *
 * A step receives a map that is already valid at version n-1 (layers array
 * present for every n-1 >= 2) and must preserve existing data.
 */
const migrations: Record<number, SchemaStep> = {
  // v1 -> v2: root-level cells/edges/objects/textLabels move into one layer.
  // Only ever reached for maps WITHOUT a layers array (see detectSchemaVersion).
  [LAYER_SCHEMA_VERSION]: (m) => migrateToLayerSchema(m) as MapData,
};

/**
 * Why a stored map cannot be migrated by THIS plugin build. Never a sign of a
 * corrupt data file, so callers must not offer a backup restore for it:
 *  - 'newer-version': written by a newer plugin (schemaVersion > SCHEMA_VERSION);
 *  - 'missing-step': a SCHEMA_VERSION bump shipped without migrations[N];
 *  - 'step-failed': a registered step left the map without a layers array.
 */
type MapSchemaErrorReason = 'newer-version' | 'missing-step' | 'step-failed';

class MapSchemaError extends Error {
  readonly reason: MapSchemaErrorReason;
  readonly storedVersion: number;
  constructor(reason: MapSchemaErrorReason, storedVersion: number, detail: string) {
    super(`This map needs a newer or fixed version of the plugin (${detail}).`);
    this.name = 'MapSchemaError';
    this.reason = reason;
    this.storedVersion = storedVersion;
  }
}

/** The numeric schemaVersion a map CLAIMS, or null when absent/not a finite number. */
function claimedSchemaVersion(mapData: MapData): number | null {
  const v = (mapData as Partial<MapData> | null)?.schemaVersion;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Whether a map claims a schema newer than this plugin knows. */
function isNewerSchema(mapData: MapData): boolean {
  const v = claimedSchemaVersion(mapData);
  return v != null && v > SCHEMA_VERSION;
}

/**
 * The schema version a stored map is ACTUALLY at.
 *
 * A claimed version NEWER than this plugin is believed outright, before any
 * shape inference: a future schema may restructure `layers`, and reading its
 * absence as "v1" would rebuild and downgrade the map. Otherwise judged by
 * shape: no layers array => v1 (whatever schemaVersion claims); layers present
 * => at least v2, even when schemaVersion is missing (hand-edited /
 * MCP-written entries). A layers array is never rebuilt.
 */
function detectSchemaVersion(mapData: MapData): number {
  const claimed = claimedSchemaVersion(mapData);
  if (claimed != null && claimed > SCHEMA_VERSION) return claimed;
  if (!Array.isArray((mapData as Partial<MapData>).layers)) return 1;
  return claimed != null && claimed >= LAYER_SCHEMA_VERSION ? claimed : LAYER_SCHEMA_VERSION;
}

/**
 * Bring `mapData` up to SCHEMA_VERSION one registered step at a time, then
 * stamp the version.
 *
 * A map written by a NEWER plugin (schemaVersion > SCHEMA_VERSION) is loaded
 * as-is with a console warning: no step runs, the version stamp is left alone
 * (never downgraded), and unknown fields pass through untouched because the
 * whole entry object is kept.
 *
 * Throws MapSchemaError when a step is missing or a step leaves the map
 * without layers (the v1->v2 step returns its backup on validation failure);
 * the loader surfaces it as "needs a newer or fixed plugin" so editing is
 * blocked instead of saving a half-migrated tree. It is NOT reported as a
 * corrupt data file.
 */
function runSchemaMigrations(mapData: MapData): MapData {
  let m = mapData;
  let version = detectSchemaVersion(m);

  if (version > SCHEMA_VERSION) {
    console.warn(
      `[Windrose] Map was written by a newer schema (v${String(version)}; this plugin knows v${String(SCHEMA_VERSION)}). ` +
      'Loading it without migration.'
    );
    return m;
  }

  while (version < SCHEMA_VERSION) {
    const target = version + 1;
    const step = migrations[target];
    if (step == null) {
      throw new MapSchemaError('missing-step', version, `no schema migration registered for v${String(version)} -> v${String(target)}`);
    }
    m = step(m);
    if (!Array.isArray((m as Partial<MapData>).layers)) {
      throw new MapSchemaError('step-failed', version, `schema migration to v${String(target)} failed (no layers array)`);
    }
    m.schemaVersion = target;
    version = target;
  }

  // Stamp maps whose layers array proves v2+ but whose schemaVersion is
  // missing or understated. Stamp only — never rebuild.
  if (m.schemaVersion !== version) m.schemaVersion = version;
  return m;
}

// ===========================================
// Per-layer sanitation
// ===========================================

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

/**
 * Backfill a shape overlay's per-axis half-extents. Saves written before 2.4.0
 * only carry the single `size` half-extent (every rectangle was a square), so
 * both axes default to it. Rotation is dropped when it is not a finite number.
 */
function normalizeShapeOverlays(shapes: ShapeOverlay[]): void {
  for (const shape of shapes) {
    if (!Number.isFinite(shape.halfWidth) || (shape.halfWidth as number) <= 0) shape.halfWidth = shape.size;
    if (!Number.isFinite(shape.halfHeight) || (shape.halfHeight as number) <= 0) shape.halfHeight = shape.size;
    if (shape.rotation != null && !Number.isFinite(shape.rotation)) delete shape.rotation;
  }
}

/**
 * Normalise an element's explicit ladder rung set (kgc.31) in place: keep
 * non-negative integers only, dedupe, sort; delete the key when it is not an
 * array or nothing survives (absent = Auto, never an empty set).
 */
function sanitizeVisibleLevels(element: { visibleLevels?: unknown }): void {
  if (!('visibleLevels' in element)) return;
  const raw = element.visibleLevels;
  const kept = Array.isArray(raw)
    ? [...new Set(raw.filter((n): n is number => Number.isInteger(n) && (n as number) >= 0))].sort((a, b) => a - b)
    : [];
  if (kept.length === 0) delete element.visibleLevels;
  else element.visibleLevels = kept;
}

/**
 * Defaults, crash filters, wall-gap sanitation and the two legacy-shape
 * upgrades for ONE layer (in place). Shared by the root and every sub-hex
 * level so they can no longer drift apart.
 */
function sanitizeLayer(layer: MapLayer): void {
  layer.tiles ??= [];
  // A hand-edited `levels: null` is absent, not an empty rung record.
  if ((layer as { levels?: unknown }).levels === null) delete layer.levels;

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

  for (const obj of layer.objects ?? []) sanitizeVisibleLevels(obj);
  for (const label of layer.textLabels ?? []) sanitizeVisibleLevels(label);

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

// ===========================================
// Per-map migration (recursive through sub-hex maps)
// ===========================================

interface MigrateOptions {
  /**
   * Root map only: tilesets are owned by the root (sub-hex views resolve
   * tiles against the root's registry), so only the root gets an empty
   * `tilesets` default. Sub-maps that DO carry tilesets still get source
   * stamping.
   */
  isRoot: boolean;
}

function migrateOneMap(input: MapData, options: MigrateOptions): MapData {
  // A map from a NEWER plugin is returned untouched: no defaults, no
  // sanitizers, no recursion. Every one of them encodes THIS version's idea of
  // the shape and could drop or rewrite fields the newer schema relies on.
  // The loader refuses to open such a map for editing (MapSchemaError), so the
  // untouched entry is never saved back by this build.
  if (isNewerSchema(input)) {
    console.warn(
      `[Windrose] Map was written by a newer schema (v${String(claimedSchemaVersion(input))}; this plugin knows v${String(SCHEMA_VERSION)}). ` +
      'Leaving it untouched.'
    );
    return input;
  }
  let mapData = input;
  mapData.objects ??= [];
  mapData.textLabels ??= [];
  mapData.customColors ??= [];
  mapData.edges ??= [];
  mapData.regions ??= [];
  mapData.outlines ??= [];
  mapData.shapeOverlays ??= [];
  normalizeShapeOverlays(mapData.shapeOverlays);
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

  // A hand-edited `lod: null` means "no ladder": every ladder predicate tests
  // `lod === undefined`, so null would pass as a ladder block (Codex review).
  if ((mapData as { lod?: unknown }).lod === null) delete mapData.lod;

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

  // Schema migration: version-stepped, never rebuilds an existing layers array.
  // ORDER: the root defaults above (settings, hexBounds, backgroundImage) run
  // BEFORE the stepped runner, so a future migrations[N] step sees those
  // fields already filled in. A step that must detect a legacy shape by the
  // ABSENCE of one of them cannot; it must key on schemaVersion instead (or
  // this block must move below the runner in the same change).
  mapData = runSchemaMigrations(mapData);

  // Tileset source migration: add source: 'folder' to legacy tilesets
  if (options.isRoot) mapData.tilesets ??= [];
  for (const ts of mapData.tilesets ?? []) {
    if (!('source' in ts)) {
      (ts as Record<string, unknown>).source = 'folder';
    }
  }

  for (const layer of mapData.layers) sanitizeLayer(layer);

  // Ladder levels (design 06, s19 item 1): validation NEVER destroys. `lod`
  // (m / minCellPx / maxLevel) is left exactly as stored, and `levels` is kept
  // even when `lod` is absent: both cases are depth quarantine, a derived
  // read-time state (isDepthQuarantined), not a load-time rewrite. Only empty
  // containers are removed.
  for (let i = 0; i < mapData.layers.length; i++) {
    const normalised = normaliseLevels(mapData.layers[i]);
    if (normalised !== mapData.layers[i]) mapData.layers[i] = normalised;
  }

  // Board (floor) projection: ensure every layer has a boardId, the boards registry
  // exists, and activeBoardId is valid. Idempotent — safe on already-migrated maps.
  // Sub-hex maps get their own implicit board too (Parallax: don't leave
  // sub-hex layers boardless or board filters would drop them).
  ensureBoards(mapData);

  // Nested sub-hex maps, at any depth.
  if (mapData.subHexMaps) {
    for (const hexKey of Object.keys(mapData.subHexMaps)) {
      const subHex = mapData.subHexMaps[hexKey];
      if (subHex?.mapData != null) {
        subHex.mapData = migrateOneMap(subHex.mapData, { isRoot: false });
      }
    }
  }

  return mapData;
}

/** Load-time migration of one stored map entry (root plus every nested sub-hex map). */
function migrateMapData(mapData: MapData): MapData {
  return migrateOneMap(mapData, { isRoot: true });
}

export {
  MapSchemaError,
  claimedSchemaVersion,
  isNewerSchema,
  migrateMapData,
  migrateOneMap,
  sanitizeLayer,
  sanitizeVisibleLevels,
  sanitizeWallGaps,
  normalizeShapeOverlays,
  runSchemaMigrations,
  detectSchemaVersion,
  migrations,
};
export type { SchemaStep, MigrateOptions, MapSchemaErrorReason };

import type { TileForm } from '../tiles/tile.types';
import type { LadderCrossingStats, LadderSnapshot } from '../../src/geometry/renderers/ladderTelemetry';
import type { SurfaceSnapshot } from '../../src/geometry/renderers/surfaceBudget';

/**
 * One wall's gap geometry, as computed by the render/edit-derive pipeline
 * (invariant 3 clamp; §2.2/§4). Consumed by E2E to assert opening placement
 * and editing directly rather than by pixel-sampling the canvas (G-F9).
 */
interface WindroseWallGapDebug {
  wallId: string;
  kind: 'wall' | 'path';
  /** Total flattened arc length of the wall's stable (gap-math) flatten. */
  totalLength: number;
  /** Skip intervals (gap spans) in global flattened arc length. */
  skips: Array<[number, number]>;
  gaps: Array<{
    gapId: string;
    seg: number;
    hasTile: boolean;
    /** Clamped span in global flattened arc length (invariant 3). */
    span: { lo: number; hi: number; widthWorld: number };
    /** Seated art transform (world-space); null when bare or unresolvable. */
    seated: { x: number; y: number; angle: number; w: number; h: number } | null;
  }>;
}

/** Raw active-board wall-gap fields for E2E (read live, not from the file). */
interface WindroseRawGap {
  wallId: string;
  seg: number;
  t: number;
  widthCells: number;
  widthLocked: boolean;
  bound: boolean;
  flip: boolean;
}

/**
 * Result of a cell write addressed to a ladder rung (level >= 1), or of a
 * refused paintCells request at any level. Level-0 writes keep their legacy
 * boolean / number returns.
 */
interface WindroseLevelWriteResult {
  ok: boolean;
  level: number;
  /** Cells written (painted or erased) on the rung. */
  count: number;
  /** Requested cells dropped because they do not exist at this rung (outside the root bounds). */
  skipped: number;
  /** Refusal reason (a DepthWriteRefusal, 'no-active-layer', 'no-ladder', 'too-many-cells', 'invalid-level'). */
  error?: string;
}

interface WindroseMcpOps {
  /** Refuses an id outside the ToolId union (the paint tool is `draw`). */
  setTool: (toolId: string) => { ok: true; tool: string } | { ok: false; error: string };
  setColor: (color: string) => void;
  setOpacity: (opacity: number) => void;
  /** Level omitted or 0: legacy boolean. Level >= 1: rung write result. */
  paintCell: (x: number, y: number, color?: string, opacity?: number, level?: number) => boolean | WindroseLevelWriteResult;
  /** Level omitted or 0: legacy count (a request over MAX_CELLS_PER_DEPTH_OP is refused with a result object). Level >= 1: rung write result. */
  paintCells: (cells: Array<{ x: number; y: number; color?: string; opacity?: number }>, level?: number) => number | WindroseLevelWriteResult;
  /** Level omitted or 0: legacy boolean. Level >= 1: rung write result. */
  eraseCell: (x: number, y: number, level?: number) => boolean | WindroseLevelWriteResult;
  /** Level omitted or 0: the root lattice. Rung cells are in the rung's own axial coordinates. */
  getCells: (bbox?: { x0: number; y0: number; x1: number; y1: number }, level?: number) => Array<{ x: number; y: number; color: string; opacity: number }>;
  undo: () => boolean;
  redo: () => boolean;
  selectLayer: (layerId: string) => void;
  forceSave: () => void;
  /** Drive the live viewport (pan/zoom). Omitting zoom keeps the current zoom; zoom is clamped to the map's range. `level` (ladder maps) overrides zoom with that rung's band-middle zoom. */
  setViewport: (x: number, y: number, zoom?: number, level?: number) => { ok: boolean; viewState: { x: number; y: number; zoom: number } };
  /** Installed tilesets and their tiles (vaultPath is the human-meaningful name). */
  listTiles: () => Array<{ tilesetId: string; tilesetName: string; tileCount: number; tiles: Array<{ id: string; vaultPath: string }> }>;
  /** Select a tile and arm the tile-paint tool. */
  selectTile: (tilesetId: string, tileId: string) => { ok: boolean; note?: string; availableTilesetIds?: string[] };
  /**
   * Form-aware arming (mirrors a drawer pick): sets selection + derived form so
   * the wall/opening coupling routes the tool — a wall/path strip (form 'line')
   * and a portal (form 'opening') auto-arm the wall tool; any other form falls
   * back to tile-paint. Unlike selectTile it never forces tile-paint.
   */
  armTile: (tilesetId: string, tileId: string) => { ok: boolean; form?: TileForm; availableTilesetIds?: string[] };
  /** Non-mutating derived-form probe (waits out async tile-metadata load in E2E). */
  deriveForm: (tilesetId: string, tileId: string) => TileForm | null;
  /** Place a tile at a grid/hex cell, removing overlapping same-tier tiles. */
  placeTile: (a: { col: number; row: number; tilesetId: string; tileId: string; rotation?: number; depth?: string; scale?: number }, level?: number) => { ok: boolean; tileCount: number; error?: string };
  /** Resolved object types for the active map's type + object set. */
  listObjectTypes: () => Array<{ id: string; label: string; category: string }>;
  /** Objects on the active layer. */
  listObjects: (level?: number) => Array<{ id: string; type: string; x: number; y: number; label?: string; level: number; depthMode?: 'pop' | 'persist'; visibleLevels?: number[] }>;
  /** Place an object via the imperative placement API. */
  placeObject: (typeId: string, x: number, y: number, level?: number, visibleLevels?: number[]) => { ok: boolean; objectId?: string; error?: string };
  /** Open a drawer pane or edge-rail flyout; null closes the rail. */
  openDrawer: (pane: 'tiles' | 'objects' | 'layers' | 'colors' | 'regions' | 'view' | null) => { ok: boolean; note?: string };
  /** Computed gap skip-intervals + seated-art transforms for the active board's walls (G-F9). */
  debugWallGaps: () => WindroseWallGapDebug[];
  /** Raw active-board wall/gap fields, read live (race-immune) for E2E assertions. */
  readWallGaps: () => { walls: number; gaps: WindroseRawGap[] };
}

interface WindroseMcpInstance {
  mapId: string;
  mapName: string;
  mapType: string;
  viewState: { x: number; y: number; zoom: number };
  activeLayerId: string;
  layerCount: number;
  layerIds: string[];
  currentTool: string;
  selectedColor: string;
  selectedOpacity: number;
  canUndo: boolean;
  canRedo: boolean;
  saveStatus: string;
  isExpanded: boolean;
  dataFilePath: string;
  notePath: string;
  /** Per-mount id; stable key when several blocks share one notePath */
  instanceId?: string;
  timestamp: number;
  /** Number of cells in the active layer */
  cellCount: number;
  /** Cell count per layer id (level 0 only) */
  layerCellCounts: Record<string, number>;
  /** Active layer cell count per ladder level; keys are level numbers as strings, '0' always present */
  cellCountByLevel: Record<string, number>;
  /** Ladder rung the current zoom shows; 0 on classic (non-ladder) maps */
  getActiveLevel: () => number;
  /** Rung authoring tools write to: the active level, or the locked edit level when shallower; 0 on classic maps */
  getEditLevel: () => number;
  /** Total objects across all layers */
  objectCount: number;
  /** Total wall paths across all layers */
  wallPathCount: number;
  /** Total text labels across all layers */
  textLabelCount: number;
  /** Whether this instance is in a full-pane ItemView or a markdown block */
  context: 'block' | 'fullPane';
  ops: WindroseMcpOps;
}

interface WindroseGlobal {
  version?: string;
  /** Set to true once the plugin has fully initialized */
  ready?: boolean;
  mcpInstances?: Record<string, WindroseMcpInstance>;
  /** Ladder frame telemetry (geometry/renderers/ladderTelemetry.ts), attached on the first recorded ladder frame. */
  ladder?: {
    snapshot: (canvasId?: number) => LadderSnapshot;
    crossingStats: (canvasId?: number) => LadderCrossingStats;
    reset: () => void;
  };
  /** Surface budget counters (geometry/renderers/surfaceBudget.ts), attached on the first surface registration. */
  surfaces?: {
    peakBytes: () => number;
    currentBytes: () => number;
    snapshot: () => SurfaceSnapshot;
  };
}

/**
 * Developer-only ladder parameter overrides (`window.__windroseLadder`), read by
 * core/lodFlags.ts and the renderer's tile-clip knob. Dev-set input: readers keep
 * their typeof checks.
 */
interface WindroseLadderDevKnobs {
  m?: unknown;
  minCellPx?: unknown;
  maxLevel?: unknown;
  tileClip?: unknown;
}

declare global {
  interface Window {
    __windrose?: WindroseGlobal;
    __windroseLadder?: WindroseLadderDevKnobs;
  }
}

export type { WindroseMcpOps, WindroseMcpInstance, WindroseGlobal, WindroseWallGapDebug, WindroseRawGap, WindroseLevelWriteResult };

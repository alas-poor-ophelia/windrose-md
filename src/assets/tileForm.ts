/**
 * tileForm.ts
 *
 * Derives a tile's composite "render form" (cell/region/line/autotile) from
 * signals already in the data model, and exposes the form×subtool matrix as
 * DATA (not hardcoded branching) so the drawer ribbon can grade the placement
 * subtools for a selected tile's form.
 *
 * Gating is deliberately LENIENT: detection can be rough, so a subtool is
 * 'disabled' only when the combination is truly impossible (e.g. wall/path
 * line-draw needs strip metadata). Everything else is at worst 'available' —
 * dimmed in the ribbon but still clickable as a manual override.
 *
 * Pure functions — no Obsidian, no rendering. `renderMode` ('cell'|'region')
 * remains the only persisted render mode; `TileForm` is a read-time projection.
 */

import type { TileForm, TileMetadataEntry, TilesetDef } from '#types/tiles/tile.types';
import { DEFAULT_PIXELS_PER_CELL } from './spanPredictor';

/** DD source dirs drawn ALONG edges/curves (swept strips). */
const LINE_DD_SOURCES = new Set(['walls', 'paths']);

/**
 * DD source dir seated into wall GAPS (doors/windows/thresholds) — plain
 * single PNGs (256px-wide = 1 cell convention), never strips. An opening is
 * not an independent placed tile: the art is a property of the WallGap it
 * seats into (see wallGapOperations.ts), so this form gets its own dedicated
 * 'opening' placement subtool rather than being treated as a stamped prop.
 */
const OPENING_DD_SOURCES = new Set(['portals']);

/**
 * Classify a tile into its render form. Priority (most specific first):
 *   autotile  — the tileset declares an autoTileConfig
 *   line      — DD source is walls/paths
 *   opening   — DD source is portals
 *   region    — effective renderMode is 'region'
 *   cell      — residual default
 */
function deriveTileForm(
  metadata: TileMetadataEntry | undefined,
  tileset: TilesetDef | undefined,
): TileForm {
  if (tileset?.autoTileConfig != null) return 'autotile';

  const src = metadata?.ddSourceType?.toLowerCase();
  if (src != null && LINE_DD_SOURCES.has(src)) return 'line';
  if (src != null && OPENING_DD_SOURCES.has(src)) return 'opening';

  // Per-tile metadata renderMode wins; else the tileset default; else 'cell'.
  const renderMode = metadata?.renderMode ?? tileset?.renderMode ?? 'cell';
  if (renderMode === 'region') return 'region';

  return 'cell';
}

/** A placement subtool the ribbon can offer. */
export type TileSubtoolId = 'paint' | 'stamp' | 'scatter' | 'fill' | 'brush' | 'line' | 'autotile' | 'opening';

/**
 * How a form grades a subtool:
 *   recommended — bright; a natural fit for the form
 *   available   — dimmed but clickable; unusual pairing, manual override
 *   disabled    — truly impossible (missing required metadata/machinery)
 */
export type SubtoolGate = 'recommended' | 'available' | 'disabled';

export interface TileSubtoolDef {
  id: TileSubtoolId;
  label: string;
  icon: string;
  title: string;
}

/** Subtool metadata (icon/label/title) — single source for the ribbon. */
const SUBTOOL_META: Record<TileSubtoolId, TileSubtoolDef> = {
  paint: { id: 'paint', label: 'Paint', icon: 'lucide-paintbrush', title: 'Paint the tile per grid cell' },
  stamp: { id: 'stamp', label: 'Stamp', icon: 'lucide-stamp', title: 'Place one freeform stamp' },
  scatter: { id: 'scatter', label: 'Scatter', icon: 'lucide-diamond', title: 'Scatter freeform stamps with jitter' },
  fill: { id: 'fill', label: 'Fill', icon: 'lucide-paint-bucket', title: 'Flood fill a connected area' },
  brush: { id: 'brush', label: 'Brush', icon: 'lucide-brush', title: 'Soft round terrain brush' },
  line: { id: 'line', label: 'Draw', icon: 'lucide-spline', title: 'Draw along a wall / path curve' },
  autotile: { id: 'autotile', label: 'Auto', icon: 'lucide-grid-3x3', title: 'Auto-tile by neighbours' },
  opening: { id: 'opening', label: 'Opening', icon: 'lucide-door-open', title: 'Place a door / window in a wall' },
};

/**
 * Ribbon display order. 'autotile' and 'opening' are NOT listed — each is
 * prepended only when the selected tile's form matches (hidden otherwise).
 */
const RIBBON_SUBTOOL_ORDER: TileSubtoolId[] = ['paint', 'stamp', 'scatter', 'fill', 'brush', 'line'];

interface FormDef {
  form: TileForm;
  label: string;
  /** Subtool armed by default (★) when this form is selected. */
  defaultSubtool: TileSubtoolId;
  /** Lenient grade for every subtool. */
  gates: Record<TileSubtoolId, SubtoolGate>;
}

/**
 * The form×subtool matrix, as data. 'line' is disabled off the line form (it
 * needs wall/path strip metadata); 'autotile' and 'opening' are hidden from
 * the ribbon for forms that don't match, so their gate there is moot (kept
 * 'disabled' for honesty).
 */
const FORM_DEFS: Record<TileForm, FormDef> = {
  cell: {
    form: 'cell',
    label: 'Cell',
    defaultSubtool: 'paint',
    gates: {
      paint: 'recommended',
      stamp: 'recommended',
      scatter: 'recommended',
      fill: 'available',
      brush: 'available',
      line: 'disabled',
      autotile: 'disabled',
      opening: 'disabled',
    },
  },
  region: {
    form: 'region',
    label: 'Region',
    defaultSubtool: 'fill',
    gates: {
      paint: 'recommended',
      stamp: 'available',
      scatter: 'available',
      fill: 'recommended',
      brush: 'recommended',
      line: 'disabled',
      autotile: 'disabled',
      opening: 'disabled',
    },
  },
  line: {
    form: 'line',
    label: 'Line',
    defaultSubtool: 'line',
    gates: {
      paint: 'available',
      stamp: 'available',
      scatter: 'available',
      fill: 'available',
      brush: 'available',
      line: 'recommended',
      autotile: 'disabled',
      opening: 'disabled',
    },
  },
  autotile: {
    form: 'autotile',
    label: 'Auto-tile',
    defaultSubtool: 'autotile',
    gates: {
      paint: 'available',
      stamp: 'available',
      scatter: 'available',
      fill: 'available',
      brush: 'available',
      line: 'disabled',
      autotile: 'recommended',
      opening: 'disabled',
    },
  },
  // A door/window is wall furniture (seated into a WallGap), not a placed
  // tile — paint/scatter/fill/brush would place it as a loose cell tile,
  // contradicting that architecture, so they stay disabled. 'stamp' is kept
  // as a manual override (a door CAN be stamped as a decorative prop).
  opening: {
    form: 'opening',
    label: 'Opening',
    defaultSubtool: 'opening',
    gates: {
      paint: 'disabled',
      stamp: 'available',
      scatter: 'disabled',
      fill: 'disabled',
      brush: 'disabled',
      line: 'disabled',
      autotile: 'disabled',
      opening: 'recommended',
    },
  },
};

function formDef(form: TileForm): FormDef {
  return FORM_DEFS[form];
}

function subtoolMeta(id: TileSubtoolId): TileSubtoolDef {
  return SUBTOOL_META[id];
}

/** Grade of the given subtool for the given form (matrix lookup). */
function subtoolGate(form: TileForm, subtool: TileSubtoolId): SubtoolGate {
  return FORM_DEFS[form].gates[subtool];
}

/** Subtools the ribbon shows for a form, in display order. */
function ribbonSubtoolsForForm(form: TileForm): TileSubtoolId[] {
  if (form === 'autotile') return ['autotile', ...RIBBON_SUBTOOL_ORDER];
  if (form === 'opening') return ['opening', ...RIBBON_SUBTOOL_ORDER];
  return RIBBON_SUBTOOL_ORDER;
}

/**
 * Built-in ribbon entry that arms NO asset (§5.3) — cuts a bare, capped gap
 * regardless of which tile (if any) is selected. It is deliberately NOT a
 * `TileSubtoolId`/`FORM_DEFS` matrix entry: unlike every other subtool it
 * doesn't act on the selected tile's art, so grading it against a form would
 * be meaningless. This is the id/metadata stub only — the ribbon renders it
 * for the 'opening' form, but arming WallLayer's bare-threshold placement
 * (and any always-visible affordance for it, tile selected or not) is wired
 * by the placement-flow phase, not here.
 */
const THRESHOLD_ENTRY_ID = 'threshold' as const;
const THRESHOLD_ENTRY: { id: typeof THRESHOLD_ENTRY_ID; label: string; icon: string; title: string } = {
  id: THRESHOLD_ENTRY_ID,
  label: 'Threshold',
  icon: 'lucide-square-dashed',
  title: 'Cut a bare threshold (no door art) in a wall',
};

/**
 * Derive a door/window's default width in grid cells from its art's natural
 * pixel width (§3.3, placement-time — no scan-time schema change). DD authors
 * portals at 256px = 1 cell like every other strip/prop asset; `pixelsPerCell`
 * respects a per-tileset override. Clamped to `[minGapCells, segmentLengthCells]`
 * so an oversized asset never overhangs its host wall segment (invariant 3);
 * when the segment is shorter than `minGapCells` the clamp resolves to the
 * segment length (G-F8), never below it. Callers pass wallGapOperations'
 * `MIN_GAP_CELLS` as `minGapCells` to share the one tuning constant.
 */
function deriveOpeningWidthCells(
  naturalWidth: number,
  pixelsPerCell: number | undefined,
  segmentLengthCells: number,
  minGapCells: number,
): number {
  const ppc = pixelsPerCell ?? DEFAULT_PIXELS_PER_CELL;
  const raw = ppc > 0 ? naturalWidth / ppc : 1;
  const hi = segmentLengthCells;
  const lo = minGapCells;
  if (lo > hi) return hi;
  return Math.max(lo, Math.min(hi, raw));
}

export {
  deriveTileForm,
  deriveOpeningWidthCells,
  formDef,
  subtoolMeta,
  subtoolGate,
  ribbonSubtoolsForForm,
  FORM_DEFS,
  SUBTOOL_META,
  RIBBON_SUBTOOL_ORDER,
  LINE_DD_SOURCES,
  OPENING_DD_SOURCES,
  THRESHOLD_ENTRY_ID,
  THRESHOLD_ENTRY,
};

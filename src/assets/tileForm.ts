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

/**
 * DD source directories whose art is drawn ALONG edges/curves, not stamped per
 * cell. Portals are deliberately NOT here: DD ships them beside walls, but they
 * are stamped like props — and the wall tool has no strip metadata for them.
 */
const LINE_DD_SOURCES = new Set(['walls', 'paths']);

/**
 * Classify a tile into its render form. Priority (most specific first):
 *   autotile  — the tileset declares an autoTileConfig
 *   line      — DD source is walls/paths
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

  // Per-tile metadata renderMode wins; else the tileset default; else 'cell'.
  const renderMode = metadata?.renderMode ?? tileset?.renderMode ?? 'cell';
  if (renderMode === 'region') return 'region';

  return 'cell';
}

/** A placement subtool the ribbon can offer. */
export type TileSubtoolId = 'paint' | 'stamp' | 'scatter' | 'fill' | 'brush' | 'line' | 'autotile';

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
};

/**
 * Ribbon display order. 'autotile' is NOT listed — it is prepended only when
 * the selected tile's form is 'autotile' (hidden otherwise, per design).
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
 * needs wall/path strip metadata); 'autotile' is hidden from the ribbon for
 * non-autotile forms so its gate there is moot (kept 'disabled' for honesty).
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
  return form === 'autotile' ? ['autotile', ...RIBBON_SUBTOOL_ORDER] : RIBBON_SUBTOOL_ORDER;
}

export {
  deriveTileForm,
  formDef,
  subtoolMeta,
  subtoolGate,
  ribbonSubtoolsForForm,
  FORM_DEFS,
  SUBTOOL_META,
  RIBBON_SUBTOOL_ORDER,
  LINE_DD_SOURCES,
};

/**
 * tileForm.ts
 *
 * Derives a tile's composite "render form" (cell/region/line/autotile/scatter)
 * from signals already in the data model, and exposes the form×subtool matrix as
 * DATA (not hardcoded branching) so the drawer ribbon can light only the
 * placement subtools a selected tile's form supports.
 *
 * Pure functions — no Obsidian, no rendering. `renderMode` ('cell'|'region')
 * remains the only persisted render mode; `TileForm` is a read-time projection.
 */

import type { TileForm, TileMetadataEntry, TilesetDef } from '#types/tiles/tile.types';

/** DD source directories whose art is drawn ALONG edges/curves, not stamped per cell. */
const LINE_DD_SOURCES = new Set(['walls', 'paths', 'portals']);

/**
 * Classify a tile into its render form. Priority (most specific first):
 *   autotile  — the tileset declares an autoTileConfig
 *   line      — DD source is walls/paths/portals
 *   region    — effective renderMode is 'region'
 *   cell      — residual default
 *
 * Note: 'scatter' is NOT derived here — it is a brush mode (stampMode), with no
 * per-tile signal in the data model. It exists in the matrix for the ribbon only.
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
export type TileSubtoolId = 'stamp' | 'fill' | 'line' | 'autotile' | 'scatter';

export interface TileSubtoolDef {
  id: TileSubtoolId;
  label: string;
  icon: string;
  title: string;
}

/** Subtool metadata (icon/label/title) — single source for the ribbon. */
const SUBTOOL_META: Record<TileSubtoolId, TileSubtoolDef> = {
  stamp: { id: 'stamp', label: 'Stamp', icon: 'lucide-stamp', title: 'Stamp one tile per cell' },
  fill: { id: 'fill', label: 'Fill', icon: 'lucide-paint-bucket', title: 'Seamless region fill' },
  line: { id: 'line', label: 'Draw', icon: 'lucide-spline', title: 'Draw along edges / a curve' },
  autotile: { id: 'autotile', label: 'Auto', icon: 'lucide-grid-3x3', title: 'Auto-tile by neighbours' },
  scatter: { id: 'scatter', label: 'Scatter', icon: 'lucide-diamond', title: 'Freeform scatter brush' },
};

interface FormDef {
  form: TileForm;
  label: string;
  /** Subtool armed by default (★) when this form is selected. */
  defaultSubtool: TileSubtoolId;
  /** Subtools this form supports, in display order. First is the default. */
  subtools: TileSubtoolId[];
}

/**
 * The form×subtool matrix, as data. The ribbon renders `subtools` for the
 * selected tile's form and arms `defaultSubtool`; everything else is dimmed.
 */
const FORM_DEFS: Record<TileForm, FormDef> = {
  cell: { form: 'cell', label: 'Cell', defaultSubtool: 'stamp', subtools: ['stamp', 'scatter'] },
  region: { form: 'region', label: 'Region', defaultSubtool: 'fill', subtools: ['fill', 'stamp'] },
  line: { form: 'line', label: 'Line', defaultSubtool: 'line', subtools: ['line'] },
  autotile: { form: 'autotile', label: 'Auto-tile', defaultSubtool: 'autotile', subtools: ['autotile', 'stamp'] },
  scatter: { form: 'scatter', label: 'Scatter', defaultSubtool: 'scatter', subtools: ['scatter', 'stamp'] },
};

function formDef(form: TileForm): FormDef {
  return FORM_DEFS[form];
}

function subtoolMeta(id: TileSubtoolId): TileSubtoolDef {
  return SUBTOOL_META[id];
}

/** Does the given form support the given subtool? (matrix membership test) */
function formSupportsSubtool(form: TileForm, subtool: TileSubtoolId): boolean {
  return FORM_DEFS[form].subtools.includes(subtool);
}

export {
  deriveTileForm,
  formDef,
  subtoolMeta,
  formSupportsSubtool,
  FORM_DEFS,
  SUBTOOL_META,
  LINE_DD_SOURCES,
};

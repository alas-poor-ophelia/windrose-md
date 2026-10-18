/**
 * skyCells.ts
 *
 * The map-side inputs of the weather shapes (src/weather/skyClip.ts): each
 * cell's corners in world px and the full cell list of a bounded hex map
 * (fogged cells come from foggedAreaKeys in weatherFog.ts), plus the region
 * name plates the weather layers keep clear. Grid cells are
 * {x: col, y: row}; hex cells are axial {x: q, y: r}.
 *
 * The whole-map area covers a bounded hex map's every cell; on an unbounded
 * map (all grid maps, hex maps without bounds) it covers the painted cells
 * of the active layer, so weather sits on the map rather than on the empty
 * canvas around it. A map with nothing painted falls back to the whole
 * canvas.
 */

// Type-only imports
import type { Cell } from '#types/core/cell.types';
import type { HexBounds, Region } from '#types/core/map.types';
import type { HexOrientation } from '#types/settings/settings.types';

import { offsetToAxial } from '../geometry/core/offsetCoordinates';
import { isHexCell } from '../geometry/core/cellAccessor';
import { computeCentroid, getRegionLabelHalfHeight } from '../geometry/renderers/regionRenderer';
import type { HexGeometryLike } from '../geometry/renderers/regionRenderer';

/** The geometry surface the shapes need */
type SkyCellGeometry =
  | { type: 'grid'; cellSize: number }
  | {
      type: 'hex';
      orientation: HexOrientation;
      renderingMode: 'rectangular' | 'radial';
      getHexVertices: (q: number, r: number) => Array<{ worldX: number; worldY: number }>;
      getAllRadialCells: (maxRing: number) => Array<{ q: number; r: number }>;
    };

interface SkyCellSource {
  cellVertices: (x: number, y: number) => Array<{ worldX: number; worldY: number }>;
  /** Every cell of the map (bounded hex) or its painted cells; null = the whole canvas */
  mapCells: (() => Iterable<{ x: number; y: number }>) | null;
}

function* rectangularHexCells(bounds: HexBounds, orientation: HexOrientation): Generator<{ x: number; y: number }> {
  for (let col = 0; col < bounds.maxCol; col++) {
    for (let row = 0; row < bounds.maxRow; row++) {
      const { q, r } = offsetToAxial(col, row, orientation);
      yield { x: q, y: r };
    }
  }
}

/** Painted cells in area coordinates, or null when nothing is painted */
function paintedCellList(cells: readonly Cell[] | null | undefined): (() => Iterable<{ x: number; y: number }>) | null {
  if (cells == null || cells.length === 0) return null;
  return () => cells.map(cell => (isHexCell(cell) ? { x: cell.q, y: cell.r } : { x: cell.x, y: cell.y }));
}

function skyCellSource(
  geometry: SkyCellGeometry,
  hexBounds: HexBounds | null | undefined,
  paintedCells?: readonly Cell[] | null
): SkyCellSource {
  if (geometry.type === 'grid') {
    const size = geometry.cellSize;
    return {
      cellVertices: (x, y) => [
        { worldX: x * size, worldY: y * size },
        { worldX: (x + 1) * size, worldY: y * size },
        { worldX: (x + 1) * size, worldY: (y + 1) * size },
        { worldX: x * size, worldY: (y + 1) * size },
      ],
      // Grid maps are unbounded
      mapCells: paintedCellList(paintedCells),
    };
  }
  const hex = geometry;
  let mapCells: SkyCellSource['mapCells'] = paintedCellList(paintedCells);
  if (hexBounds != null) {
    if (hex.renderingMode === 'radial') {
      const ring = hexBounds.maxRing ?? 0;
      mapCells = () => hex.getAllRadialCells(ring).map(c => ({ x: c.q, y: c.r }));
    } else if (hexBounds.maxCol > 0 && hexBounds.maxRow > 0) {
      mapCells = () => rectangularHexCells(hexBounds, hex.orientation);
    }
  }
  return { cellVertices: (q, r) => hex.getHexVertices(q, r), mapCells };
}

// ===========================================
// Region name plates (kept clear of weather)
// ===========================================

/** A region name plate drawn on the map canvas, which the weather must not wash over */
interface RegionLabelSpot {
  regionId: string;
  /** The plate's centre, world px */
  worldX: number;
  worldY: number;
  text: string;
}

/** Share of a region that must be out of the fog for its name to show (the region renderer's rule) */
const LABEL_MIN_REVEALED = 0.5;
/** The region renderer's plate padding, canvas px */
const LABEL_PAD_X = 6;
const LABEL_PAD_Y = 3;

/**
 * The name plates the region renderer draws: visible, named regions with at
 * least half their hexes revealed, at the label position or the centroid.
 */
function regionLabelSpots(
  regions: readonly Region[] | null | undefined,
  geometry: HexGeometryLike,
  fogged: ReadonlySet<string> | null
): RegionLabelSpot[] {
  const spots: RegionLabelSpot[] = [];
  for (const region of regions ?? []) {
    if (!region.visible || region.hexes.length === 0 || region.name === '') continue;
    if (fogged != null) {
      const revealed = region.hexes.filter(h => !fogged.has(`${h.x},${h.y}`)).length;
      if (revealed / region.hexes.length < LABEL_MIN_REVEALED) continue;
    }
    const anchor = region.labelPosition != null
      ? { worldX: region.labelPosition.x, worldY: region.labelPosition.y }
      : computeCentroid(region.hexes, geometry);
    spots.push({ regionId: region.id, worldX: anchor.worldX, worldY: anchor.worldY, text: region.name });
  }
  return spots;
}

let measureContext: OffscreenCanvasRenderingContext2D | null | undefined;

/**
 * A name plate's size in canvas px at `zoom`, matching the region
 * renderer's bold sans-serif label and padding. Estimated from the text
 * length where no canvas is available.
 */
function regionLabelPlateSize(text: string, zoom: number): { width: number; height: number } {
  const halfHeight = getRegionLabelHalfHeight(zoom);
  // The plate is the font size plus LABEL_PAD_Y (3 px) above and below
  const fontPx = halfHeight * 2 - LABEL_PAD_Y * 2;
  if (measureContext === undefined) {
    measureContext = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1).getContext('2d') : null;
  }
  let textWidth: number;
  if (measureContext != null) {
    measureContext.font = `bold ${fontPx}px sans-serif`;
    textWidth = measureContext.measureText(text).width;
  } else {
    textWidth = text.length * fontPx * 0.62;
  }
  return { width: textWidth + LABEL_PAD_X * 2, height: halfHeight * 2 };
}

export { regionLabelPlateSize, regionLabelSpots, skyCellSource };
export type { RegionLabelSpot, SkyCellGeometry, SkyCellSource };

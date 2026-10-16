/**
 * skyCells.ts
 *
 * The map-side inputs of the weather shapes (src/weather/skyClip.ts): the
 * fogged cells in the weather areas' cell coordinates, each cell's corners
 * in world px, and the full cell list of a bounded hex map. Grid cells are
 * {x: col, y: row}; hex cells are axial {x: q, y: r} and fog is stored in
 * offset (col, row), so hex fog is converted.
 *
 * The whole-map area covers a bounded hex map's every cell; on an unbounded
 * map (all grid maps, hex maps without bounds) it covers the painted cells
 * of the active layer, so weather sits on the map rather than on the empty
 * canvas around it. A map with nothing painted falls back to the whole
 * canvas.
 */

// Type-only imports
import type { Cell } from '#types/core/cell.types';
import type { FogOfWar, HexBounds } from '#types/core/map.types';
import type { HexOrientation } from '#types/settings/settings.types';

import { offsetToAxial } from '../geometry/core/offsetCoordinates';
import { isHexCell } from '../geometry/core/cellAccessor';

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

/**
 * Fogged cells as "x,y" keys in area cell coordinates, or null when the
 * layer has no active fog. Fogged cells hide weather exactly as they hide
 * the map under them.
 */
function collectFoggedKeys(
  fogOfWar: FogOfWar | null | undefined,
  mapType: 'grid' | 'hex',
  orientation: HexOrientation
): Set<string> | null {
  if (fogOfWar?.enabled !== true || fogOfWar.foggedCells.length === 0) return null;
  const fogged = new Set<string>();
  for (const cell of fogOfWar.foggedCells) {
    if (mapType === 'hex') {
      const { q, r } = offsetToAxial(cell.col, cell.row, orientation);
      fogged.add(`${q},${r}`);
    } else {
      fogged.add(`${cell.col},${cell.row}`);
    }
  }
  return fogged;
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

export { collectFoggedKeys, skyCellSource };
export type { SkyCellGeometry, SkyCellSource };

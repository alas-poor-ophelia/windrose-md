/**
 * contentFitView.ts
 *
 * Pure "fit to content" calculation used by the recenter-view control: given a
 * map's data and geometry, finds the bounding box of the current content and
 * returns a StoredViewState (center + zoom) that frames it with a comfort
 * margin. Works for grid and hex maps, including bounded sub-hex maps — the
 * geometry abstraction is the only thing that differs between them.
 *
 * No side effects, no dependency on canvas/DOM beyond the caller-supplied
 * canvas dimensions.
 */

import type { MapData, MapLayer, StoredViewState } from '#types/core/map.types';
import type { ExtendedGeometry } from '#types/contexts/context.types';
import { isGridCell } from '#types/core/cell.types';

import { DEFAULTS } from '../../core/dmtConstants';

/** A single occupied grid coordinate (hex: axial q/r; hex objects/tiles have no footprint). */
interface OccupiedPoint {
  x: number;
  y: number;
}

/** A span of occupied grid coordinates in cell units (grid maps: [coord, coord+size)). */
interface GridSpan {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Comfort factor applied before zoom clamping, so fit content isn't edge-to-edge. */
const FIT_COMFORT_FACTOR = 0.9;

function collectHexPointsFromLayer(layer: MapLayer): OccupiedPoint[] {
  const points: OccupiedPoint[] = [];

  for (const cell of layer.cells) {
    points.push(isGridCell(cell) ? { x: cell.x, y: cell.y } : { x: cell.q, y: cell.r });
  }
  for (const obj of layer.objects) {
    points.push({ x: obj.position.x, y: obj.position.y });
  }
  for (const tile of layer.tiles ?? []) {
    points.push({ x: tile.col, y: tile.row });
  }

  return points;
}

function collectGridSpansFromLayer(layer: MapLayer): GridSpan[] {
  const spans: GridSpan[] = [];

  for (const cell of layer.cells) {
    const x = isGridCell(cell) ? cell.x : cell.q;
    const y = isGridCell(cell) ? cell.y : cell.r;
    spans.push({ minX: x, maxX: x + 1, minY: y, maxY: y + 1 });
  }
  for (const obj of layer.objects) {
    const width = obj.size?.width ?? 1;
    const height = obj.size?.height ?? 1;
    spans.push({
      minX: obj.position.x,
      maxX: obj.position.x + width,
      minY: obj.position.y,
      maxY: obj.position.y + height
    });
  }
  for (const tile of layer.tiles ?? []) {
    const spanW = tile.spanW ?? 1;
    const spanH = tile.spanH ?? 1;
    spans.push({ minX: tile.col, maxX: tile.col + spanW, minY: tile.row, maxY: tile.row + spanH });
  }

  return spans;
}

function findActiveLayer(mapData: MapData): MapLayer | undefined {
  return mapData.layers.find(layer => layer.id === mapData.activeLayerId);
}

function clampZoom(zoom: number): number {
  return Math.max(DEFAULTS.minZoom, Math.min(DEFAULTS.maxZoom, zoom));
}

/**
 * Calculate a fit-to-content view (center + zoom) for the active layer's
 * content, falling back to the union of all visible layers if the active
 * layer is empty. Returns null when there is no content anywhere to fit.
 */
function calculateContentFitView(
  mapData: MapData,
  geometry: ExtendedGeometry,
  canvasWidth: number,
  canvasHeight: number
): StoredViewState | null {
  const activeLayer = findActiveLayer(mapData);

  if (geometry.type === 'hex') {
    let points = activeLayer ? collectHexPointsFromLayer(activeLayer) : [];
    if (points.length === 0) {
      points = mapData.layers.filter(layer => layer.visible).flatMap(collectHexPointsFromLayer);
    }
    if (points.length === 0) return null;

    const hexSize = geometry.hexSize;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const point of points) {
      const { worldX, worldY } = geometry.gridToWorld(point.x, point.y);
      minX = Math.min(minX, worldX);
      maxX = Math.max(maxX, worldX);
      minY = Math.min(minY, worldY);
      maxY = Math.max(maxY, worldY);
    }
    minX -= hexSize;
    maxX += hexSize;
    minY -= hexSize;
    maxY += hexSize;

    const bboxWidth = maxX - minX;
    const bboxHeight = maxY - minY;

    const zoom = clampZoom(
      Math.min(canvasWidth / bboxWidth, canvasHeight / bboxHeight) * FIT_COMFORT_FACTOR
    );

    return {
      zoom,
      center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
    };
  }

  // Grid map: work entirely in cell units.
  let spans = activeLayer ? collectGridSpansFromLayer(activeLayer) : [];
  if (spans.length === 0) {
    spans = mapData.layers.filter(layer => layer.visible).flatMap(collectGridSpansFromLayer);
  }
  if (spans.length === 0) return null;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const span of spans) {
    minX = Math.min(minX, span.minX);
    maxX = Math.max(maxX, span.maxX);
    minY = Math.min(minY, span.minY);
    maxY = Math.max(maxY, span.maxY);
  }

  const cellSize = geometry.cellSize;
  const spanX = maxX - minX;
  const spanY = maxY - minY;

  const zoom = clampZoom(
    Math.min(canvasWidth / (spanX * cellSize), canvasHeight / (spanY * cellSize)) * FIT_COMFORT_FACTOR
  );

  return {
    zoom,
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
  };
}

export { calculateContentFitView };

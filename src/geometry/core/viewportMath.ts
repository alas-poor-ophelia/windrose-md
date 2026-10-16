/**
 * viewportMath.ts
 *
 * Pure viewport math shared by every pointer-to-map and map-to-screen path:
 * client px -> canvas buffer px, north (un)rotation about the canvas centre,
 * canvas px <-> world px, screen deltas -> view-centre deltas, and
 * cursor-anchored zoom.
 *
 * The one unit rule lives here and nowhere else: StoredViewState.center is in
 * CELL units on grid maps and WORLD px on hex maps. `viewCenterScale` is the
 * multiplier from centre units to canvas px (cellSize * zoom on grid, zoom on
 * hex). Callers pass a geometry and never branch on map type themselves.
 *
 * Canvas px means the canvas's internal buffer grid (canvas.width/height),
 * which can differ from its CSS size (MapCanvas pads the backing store to a
 * minimum size), so client coordinates must go through `clientToCanvasPx`.
 */

/**
 * Geometry surface the view math needs: either a full geometry (which
 * answers getViewCenterScale) or a bare { type, cellSize } descriptor.
 */
type ViewGeometry =
  | { getViewCenterScale(zoom: number): number }
  | {
      /** 'hex' selects world-px centres; anything else is treated as grid (cell units). */
      readonly type: string;
      readonly cellSize: number;
    };

interface ViewPoint {
  x: number;
  y: number;
}

interface ViewSize {
  width: number;
  height: number;
}

/** View basis: zoom plus centre in the geometry's centre units. */
interface ViewBasis {
  zoom: number;
  center: ViewPoint;
}

/** Element-like surface for client -> buffer conversion (an HTMLCanvasElement fits). */
interface CanvasLike {
  width: number;
  height: number;
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
}

/** Canvas px per centre unit: cellSize * zoom on grid, zoom on hex. */
function viewCenterScale(geometry: ViewGeometry, zoom: number): number {
  if ('getViewCenterScale' in geometry) return geometry.getViewCenterScale(zoom);
  return geometry.type === 'hex' ? zoom : geometry.cellSize * zoom;
}

/**
 * Canvas-px offset of world origin for a view centred on `center`
 * (before north rotation).
 */
function calculateViewportOffset(
  geometry: ViewGeometry,
  center: ViewPoint,
  canvasSize: ViewSize,
  zoom: number
): { offsetX: number; offsetY: number } {
  const scale = viewCenterScale(geometry, zoom);
  return {
    offsetX: canvasSize.width / 2 - center.x * scale,
    offsetY: canvasSize.height / 2 - center.y * scale,
  };
}

/** Client (viewport) coordinates -> canvas buffer px, honouring CSS scaling. */
function clientToCanvasPx(canvas: CanvasLike, clientX: number, clientY: number): ViewPoint {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) * (canvas.width / rect.width),
    y: (clientY - rect.top) * (canvas.height / rect.height),
  };
}

/** Rotate a vector by `degrees` (positive = the map's north rotation direction). */
function rotateVector(x: number, y: number, degrees: number): ViewPoint {
  if (degrees === 0) return { x, y };
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

/** Rotate a point by `degrees` about the centre of a canvas of `size`. */
function rotateAboutCanvasCenter(x: number, y: number, size: ViewSize, degrees: number): ViewPoint {
  if (degrees === 0) return { x, y };
  const cx = size.width / 2;
  const cy = size.height / 2;
  const r = rotateVector(x - cx, y - cy, degrees);
  return { x: r.x + cx, y: r.y + cy };
}

/** Undo the map's north rotation on a canvas-px point (screen -> map frame). */
function unrotateCanvasPx(x: number, y: number, size: ViewSize, northDirection: number): ViewPoint {
  return rotateAboutCanvasCenter(x, y, size, -northDirection);
}

/** Canvas px (as displayed, rotated) -> world px. */
function canvasPxToWorld(
  geometry: ViewGeometry,
  x: number,
  y: number,
  size: ViewSize,
  view: ViewBasis,
  northDirection: number
): { worldX: number; worldY: number } {
  const p = unrotateCanvasPx(x, y, size, northDirection);
  const { offsetX, offsetY } = calculateViewportOffset(geometry, view.center, size, view.zoom);
  return { worldX: (p.x - offsetX) / view.zoom, worldY: (p.y - offsetY) / view.zoom };
}

/** World px -> canvas px (as displayed, rotated). Inverse of canvasPxToWorld. */
function worldToCanvasPx(
  geometry: ViewGeometry,
  worldX: number,
  worldY: number,
  size: ViewSize,
  view: ViewBasis,
  northDirection: number
): ViewPoint {
  const { offsetX, offsetY } = calculateViewportOffset(geometry, view.center, size, view.zoom);
  return rotateAboutCanvasCenter(offsetX + worldX * view.zoom, offsetY + worldY * view.zoom, size, northDirection);
}

/** Client coordinates -> world px through the full chain (CSS scale, unrotate, offset). */
function clientToWorld(
  geometry: ViewGeometry,
  canvas: CanvasLike,
  clientX: number,
  clientY: number,
  view: ViewBasis,
  northDirection: number
): { worldX: number; worldY: number } {
  const p = clientToCanvasPx(canvas, clientX, clientY);
  return canvasPxToWorld(geometry, p.x, p.y, { width: canvas.width, height: canvas.height }, view, northDirection);
}

/**
 * A screen-space delta expressed in view-centre units (unrotated into the map
 * frame, divided by viewCenterScale). Dragging content by (dx, dy) moves the
 * centre by the NEGATED result; scroll-style panning adds it.
 */
function screenDeltaToCenterUnits(
  geometry: ViewGeometry,
  dx: number,
  dy: number,
  zoom: number,
  northDirection: number
): ViewPoint {
  const r = rotateVector(dx, dy, -northDirection);
  const scale = viewCenterScale(geometry, zoom);
  return { x: r.x / scale, y: r.y / scale };
}

/**
 * New view centre after zooming to `newZoom` while keeping the map point under
 * the canvas-px anchor fixed on screen. The anchor is a displayed (rotated)
 * canvas px, so rotation and CSS scaling are honoured by construction when the
 * caller derives it with clientToCanvasPx.
 */
function anchoredZoomCenter(
  geometry: ViewGeometry,
  anchor: ViewPoint,
  size: ViewSize,
  view: ViewBasis,
  newZoom: number,
  northDirection: number
): ViewPoint {
  const p = unrotateCanvasPx(anchor.x, anchor.y, size, northDirection);
  const world = canvasPxToWorld(geometry, anchor.x, anchor.y, size, view, northDirection);
  const newOffsetX = p.x - world.worldX * newZoom;
  const newOffsetY = p.y - world.worldY * newZoom;
  const newScale = viewCenterScale(geometry, newZoom);
  return {
    x: (size.width / 2 - newOffsetX) / newScale,
    y: (size.height / 2 - newOffsetY) / newScale,
  };
}

/**
 * Apply the map's north rotation to a 2D context about the centre of a
 * surface of `width` x `height`. Callers own save()/restore().
 */
function applyNorthRotation(
  ctx: Pick<CanvasRenderingContext2D, 'translate' | 'rotate'>,
  width: number,
  height: number,
  northDirection: number
): void {
  if (northDirection === 0) return;
  ctx.translate(width / 2, height / 2);
  ctx.rotate((northDirection * Math.PI) / 180);
  ctx.translate(-width / 2, -height / 2);
}

export {
  viewCenterScale,
  calculateViewportOffset,
  clientToCanvasPx,
  rotateVector,
  rotateAboutCanvasCenter,
  unrotateCanvasPx,
  canvasPxToWorld,
  worldToCanvasPx,
  clientToWorld,
  screenDeltaToCenterUnits,
  anchoredZoomCenter,
  applyNorthRotation,
};
export type { ViewGeometry, ViewPoint, ViewSize, ViewBasis, CanvasLike };

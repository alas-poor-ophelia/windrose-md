/**
 * shapeOverlayRenderer.ts
 *
 * Canvas renderer for shape overlays (rectangle/circle).
 * Renders smooth geometric shapes in world-space.
 */

import type { ShapeOverlay } from '#types/core/map.types';

import { getShapeHalfExtents } from '../../objects/shapeOverlayOperations';

/** Player light radius: disc fill alpha, dashed ring alpha, ring width and dash (on, off). */
const LIGHT_FILL_ALPHA = 0.15;
const LIGHT_RING_ALPHA = 0.4;
const LIGHT_RING_WIDTH_PX = 1.5;
const LIGHT_RING_DASH = [4, 4];


interface ViewState {
  x: number;
  y: number;
  zoom: number;
}

function worldToScreen(wx: number, wy: number, vs: ViewState): { sx: number; sy: number } {
  return {
    sx: wx * vs.zoom + vs.x,
    sy: wy * vs.zoom + vs.y
  };
}

function renderShapeOverlay(
  ctx: CanvasRenderingContext2D,
  shape: ShapeOverlay,
  viewState: ViewState
): void {
  if (!shape.visible) return;

  const { sx, sy } = worldToScreen(shape.worldPosition.x, shape.worldPosition.y, viewState);

  ctx.save();
  ctx.globalAlpha = shape.opacity;
  ctx.fillStyle = shape.color;
  ctx.strokeStyle = shape.color;
  ctx.lineWidth = 2;

  if (shape.shape === 'circle') {
    const screenSize = shape.size * viewState.zoom;
    ctx.beginPath();
    ctx.arc(sx, sy, screenSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = Math.min(shape.opacity * 2, 1);
    ctx.stroke();
  } else {
    const { halfWidth, halfHeight } = getShapeHalfExtents(shape);
    const screenHalfWidth = halfWidth * viewState.zoom;
    const screenHalfHeight = halfHeight * viewState.zoom;
    const rotation = shape.rotation ?? 0;

    // Rotate about the shape centre; the surrounding save/restore undoes it
    if (rotation !== 0) {
      ctx.translate(sx, sy);
      ctx.rotate(rotation * Math.PI / 180);
      ctx.translate(-sx, -sy);
    }

    ctx.fillRect(sx - screenHalfWidth, sy - screenHalfHeight, screenHalfWidth * 2, screenHalfHeight * 2);
    ctx.globalAlpha = Math.min(shape.opacity * 2, 1);
    ctx.strokeRect(sx - screenHalfWidth, sy - screenHalfHeight, screenHalfWidth * 2, screenHalfHeight * 2);
  }

  ctx.restore();
}

function renderShapeOverlays(
  ctx: CanvasRenderingContext2D,
  shapeOverlays: ShapeOverlay[],
  viewState: ViewState
): void {
  for (const shape of shapeOverlays) {
    renderShapeOverlay(ctx, shape, viewState);
  }
}

function renderPlayerLights(
  ctx: CanvasRenderingContext2D,
  objects: Array<{ position: { x: number; y: number }; freeform?: boolean; worldPosition?: { x: number; y: number }; isPlayer?: boolean; lightRadius?: number; lightColor?: string; lightEnabled?: boolean }>,
  geometry: { cellSize?: number; hexSize?: number; getCellCenter: (x: number, y: number) => { worldX: number; worldY: number } },
  viewState: ViewState,
  distancePerCell: number
): void {
  for (const obj of objects) {
    if (obj.isPlayer !== true || obj.lightEnabled !== true || obj.lightRadius == null) continue;

    const cellSize = geometry.cellSize ?? geometry.hexSize ?? 1;
    const radiusInCells = obj.lightRadius / distancePerCell;
    const radiusInWorld = radiusInCells * cellSize;

    let worldX: number, worldY: number;
    if (obj.freeform === true && obj.worldPosition != null) {
      worldX = obj.worldPosition.x;
      worldY = obj.worldPosition.y;
    } else {
      const w = geometry.getCellCenter(obj.position.x, obj.position.y);
      worldX = w.worldX;
      worldY = w.worldY;
    }

    const { sx, sy } = worldToScreen(worldX, worldY, viewState);
    const screenRadius = radiusInWorld * viewState.zoom;

    ctx.save();
    ctx.globalAlpha = LIGHT_FILL_ALPHA;
    ctx.fillStyle = obj.lightColor ?? 'rgba(255, 255, 100, 1)';
    ctx.beginPath();
    ctx.arc(sx, sy, screenRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = LIGHT_RING_ALPHA;
    ctx.strokeStyle = obj.lightColor ?? 'rgba(255, 255, 100, 1)';
    ctx.lineWidth = LIGHT_RING_WIDTH_PX;
    ctx.setLineDash(LIGHT_RING_DASH);
    ctx.stroke();
    ctx.restore();
  }
}

export { renderShapeOverlays, renderPlayerLights };
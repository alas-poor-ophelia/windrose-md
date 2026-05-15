/**
 * shapeOverlayRenderer.ts
 *
 * Canvas renderer for shape overlays (square/circle).
 * Renders smooth geometric shapes in world-space.
 */

import type { ShapeOverlay } from '#types/core/map.types';

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
  const screenSize = shape.size * viewState.zoom;

  ctx.save();
  ctx.globalAlpha = shape.opacity;
  ctx.fillStyle = shape.color;
  ctx.strokeStyle = shape.color;
  ctx.lineWidth = 2;

  if (shape.shape === 'circle') {
    ctx.beginPath();
    ctx.arc(sx, sy, screenSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = Math.min(shape.opacity * 2, 1);
    ctx.stroke();
  } else {
    ctx.fillRect(sx - screenSize, sy - screenSize, screenSize * 2, screenSize * 2);
    ctx.globalAlpha = Math.min(shape.opacity * 2, 1);
    ctx.strokeRect(sx - screenSize, sy - screenSize, screenSize * 2, screenSize * 2);
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

function renderShapePreview(
  ctx: CanvasRenderingContext2D,
  center: { x: number; y: number },
  size: number,
  shape: 'square' | 'circle',
  color: string,
  opacity: number,
  viewState: ViewState
): void {
  const { sx, sy } = worldToScreen(center.x, center.y, viewState);
  const screenSize = size * viewState.zoom;

  ctx.save();
  ctx.globalAlpha = opacity * 0.5;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);

  if (shape === 'circle') {
    ctx.beginPath();
    ctx.arc(sx, sy, screenSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = Math.min(opacity, 1);
    ctx.stroke();
  } else {
    ctx.fillRect(sx - screenSize, sy - screenSize, screenSize * 2, screenSize * 2);
    ctx.globalAlpha = Math.min(opacity, 1);
    ctx.strokeRect(sx - screenSize, sy - screenSize, screenSize * 2, screenSize * 2);
  }

  // Center crosshair
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = 1;
  const crossSize = 6;
  ctx.beginPath();
  ctx.moveTo(sx - crossSize, sy);
  ctx.lineTo(sx + crossSize, sy);
  ctx.moveTo(sx, sy - crossSize);
  ctx.lineTo(sx, sy + crossSize);
  ctx.stroke();

  ctx.restore();
}

function renderPlayerLights(
  ctx: CanvasRenderingContext2D,
  objects: Array<{ position: { x: number; y: number }; freeform?: boolean; worldPosition?: { x: number; y: number }; isPlayer?: boolean; lightRadius?: number; lightColor?: string; lightEnabled?: boolean }>,
  geometry: { cellSize?: number; hexSize?: number; cellToWorld?: (x: number, y: number) => { worldX: number; worldY: number } },
  viewState: ViewState,
  distancePerCell: number
): void {
  for (const obj of objects) {
    if (!obj.isPlayer || !obj.lightEnabled || !obj.lightRadius) continue;

    const cellSize = geometry.cellSize || geometry.hexSize || 1;
    const radiusInCells = obj.lightRadius / distancePerCell;
    const radiusInWorld = radiusInCells * cellSize;

    let worldX: number, worldY: number;
    if (obj.freeform && obj.worldPosition) {
      worldX = obj.worldPosition.x;
      worldY = obj.worldPosition.y;
    } else if (geometry.cellToWorld) {
      const w = geometry.cellToWorld(obj.position.x, obj.position.y);
      worldX = w.worldX;
      worldY = w.worldY;
    } else {
      worldX = obj.position.x * cellSize;
      worldY = obj.position.y * cellSize;
    }

    const { sx, sy } = worldToScreen(worldX, worldY, viewState);
    const screenRadius = radiusInWorld * viewState.zoom;

    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = obj.lightColor || 'rgba(255, 255, 100, 1)';
    ctx.beginPath();
    ctx.arc(sx, sy, screenRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = obj.lightColor || 'rgba(255, 255, 100, 1)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.restore();
  }
}

return { renderShapeOverlays, renderShapePreview, renderPlayerLights };

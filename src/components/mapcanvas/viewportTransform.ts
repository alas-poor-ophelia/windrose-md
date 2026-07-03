/**
 * viewportTransform.ts
 *
 * World→buffer-space viewport transform shared by the mapcanvas overlay
 * layers. Buffer space is the canvas's internal pixel grid
 * (canvas.width/height); converting to CSS/display pixels is a separate
 * step via getCanvasDisplayMetrics.
 */

import { calculateViewportOffset } from '../../geometry/core/BaseGeometry';

/** Minimal geometry surface needed to build the transform. */
interface ViewportGeometry {
  type: 'grid' | 'hex';
  cellSize: number;
  getScaledCellSize: (zoom: number) => number;
}

interface ViewportTransformParams {
  geometry: ViewportGeometry;
  /** Canvas buffer size (canvas.width/height, not CSS size). */
  width: number;
  height: number;
  zoom: number;
  center: { x: number; y: number };
  /** Map rotation in degrees; 0 or undefined = no rotation. */
  northDirection?: number;
}

interface ViewportTransform {
  /** Cell/hex size in buffer pixels at the current zoom. */
  scaledSize: number;
  pxOffsetX: number;
  pxOffsetY: number;
  /** World coords → buffer-space coords (pan/zoom, then rotation about the buffer centre). */
  worldToBuffer: (worldX: number, worldY: number) => { x: number; y: number };
}

function createViewportTransform(params: ViewportTransformParams): ViewportTransform {
  const { geometry, width, height, zoom, center } = params;
  const northDirection = params.northDirection ?? 0;

  const scaledSize = geometry.getScaledCellSize(zoom);
  const { offsetX: pxOffsetX, offsetY: pxOffsetY } = calculateViewportOffset(
    geometry, center, { width, height }, zoom
  );

  const angleRad = (northDirection * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const cx = width / 2;
  const cy = height / 2;

  const worldToBuffer = (worldX: number, worldY: number): { x: number; y: number } => {
    const screenX = pxOffsetX + worldX * zoom;
    const screenY = pxOffsetY + worldY * zoom;
    if (northDirection === 0) return { x: screenX, y: screenY };
    const relX = screenX - cx;
    const relY = screenY - cy;
    return {
      x: relX * cos - relY * sin + cx,
      y: relX * sin + relY * cos + cy
    };
  };

  return { scaledSize, pxOffsetX, pxOffsetY, worldToBuffer };
}

/** Buffer→display conversion factors for DOM-positioned overlays. */
interface CanvasDisplayMetrics {
  /** Canvas position within the positioning container (flex centring offset). */
  canvasOffsetX: number;
  canvasOffsetY: number;
  /** CSS pixels per buffer pixel. */
  scaleX: number;
  scaleY: number;
}

function getCanvasDisplayMetrics(
  canvas: HTMLCanvasElement,
  container: Element | null
): CanvasDisplayMetrics {
  const canvasRect = canvas.getBoundingClientRect();
  const containerRect = container?.getBoundingClientRect() ?? canvasRect;
  return {
    canvasOffsetX: canvasRect.left - containerRect.left,
    canvasOffsetY: canvasRect.top - containerRect.top,
    scaleX: canvasRect.width / canvas.width,
    scaleY: canvasRect.height / canvas.height
  };
}

export { createViewportTransform, getCanvasDisplayMetrics };
export type { ViewportGeometry, ViewportTransformParams, ViewportTransform, CanvasDisplayMetrics };

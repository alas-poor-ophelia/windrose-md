/**
 * curveRenderer.ts
 *
 * Renders freehand curves on the HTML Canvas 2D context.
 * Builds and caches Path2D objects per curve, applies viewport transforms,
 * fills closed paths with even-odd rule, and strokes all paths.
 */

import type { Curve } from '#types/core/curve.types';
import type { RendererTheme } from '#types/hooks/canvasRenderer.types';

/** Viewport state needed for rendering */
interface CurveViewState {
  x: number;  // offsetX
  y: number;  // offsetY
  zoom: number;
}

/**
 * Build a Path2D for a curve, including holes.
 * Caches on curve._path2d for reuse across frames.
 */
function buildPath2D(curve: Curve): Path2D {
  if ((curve as any)._path2d) return (curve as any)._path2d;

  const path = new Path2D();
  const [sx, sy] = curve.start;
  path.moveTo(sx, sy);

  const segs = curve.segments;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    path.bezierCurveTo(seg[0], seg[1], seg[2], seg[3], seg[4], seg[5]);
  }

  if (curve.closed) {
    path.closePath();
  }

  // Add inner rings as subpaths (counter-wound for even-odd fill)
  if (curve.innerRings) {
    for (let h = 0; h < curve.innerRings.length; h++) {
      const ring = curve.innerRings[h];
      if (!ring || ring.length < 3) continue;
      path.moveTo(ring[0][0], ring[0][1]);
      for (let i = 1; i < ring.length; i++) {
        path.lineTo(ring[i][0], ring[i][1]);
      }
      path.closePath();
    }
  }

  (curve as any)._path2d = path;
  return path;
}

/**
 * Invalidate the cached Path2D for a curve (call after mutation).
 */
function invalidatePath2D(curve: Curve): void {
  delete (curve as any)._path2d;
  delete (curve as any)._flatPoly;
}

/** Grid configuration for interior grid lines inside curves */
interface CurveGridConfig {
  cellSize: number;
  lineColor: string;
  lineWidth: number;
  interiorRatio: number;
}

/**
 * Compute the world-coordinate bounding box of a curve from its geometry.
 */
function getCurveBounds(curve: Curve): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = curve.start[0];
  let minY = curve.start[1];
  let maxX = minX;
  let maxY = minY;

  const segs = curve.segments;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    // Check all 3 points per segment (cp1, cp2, endpoint)
    for (let j = 0; j < 6; j += 2) {
      const px = seg[j];
      const py = seg[j + 1];
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Render interior grid lines clipped to a curve's filled area.
 * Uses fillRect (not stroke) for Obsidian Live Preview compatibility.
 * Coordinates are in world space (caller has already applied viewport transform).
 */
function renderCurveInteriorGrid(
  ctx: CanvasRenderingContext2D,
  curve: Curve,
  path: Path2D,
  gridConfig: CurveGridConfig
): void {
  const { cellSize, lineColor, lineWidth, interiorRatio } = gridConfig;
  const actualLineWidth = Math.max(1 / ctx.getTransform().a, lineWidth * interiorRatio);
  const halfWidth = actualLineWidth / 2;

  const bounds = getCurveBounds(curve);

  // Grid-align the bounds with 1-cell padding
  const startCol = Math.floor(bounds.minX / cellSize) - 1;
  const endCol = Math.ceil(bounds.maxX / cellSize) + 1;
  const startRow = Math.floor(bounds.minY / cellSize) - 1;
  const endRow = Math.ceil(bounds.maxY / cellSize) + 1;

  ctx.save();
  ctx.clip(path, 'evenodd');
  ctx.fillStyle = lineColor;

  // Draw vertical grid lines
  for (let col = startCol; col <= endCol; col++) {
    const x = col * cellSize;
    ctx.fillRect(x - halfWidth, bounds.minY - cellSize, actualLineWidth, bounds.maxY - bounds.minY + cellSize * 2);
  }

  // Draw horizontal grid lines
  for (let row = startRow; row <= endRow; row++) {
    const y = row * cellSize;
    ctx.fillRect(bounds.minX - cellSize, y - halfWidth, bounds.maxX - bounds.minX + cellSize * 2, actualLineWidth);
  }

  ctx.restore();
}

/**
 * Render all curves for a layer onto the canvas.
 *
 * @param ctx - Canvas 2D rendering context
 * @param curves - Array of curves to render
 * @param viewState - Current viewport (offsetX, offsetY, zoom)
 * @param theme - Renderer theme for border styling
 * @param options - Optional rendering options
 */
function renderCurves(
  ctx: CanvasRenderingContext2D,
  curves: Curve[],
  viewState: CurveViewState,
  theme: RendererTheme,
  options: {
    opacity?: number;
    mergeIndex?: { curveCellRects: Map<number, Array<{ x: number; y: number; w: number; h: number }>> } | null;
    gridConfig?: CurveGridConfig;
  } = {}
): void {
  if (!curves || !Array.isArray(curves) || curves.length === 0) return;

  const { x: offsetX, y: offsetY, zoom } = viewState;
  const { opacity = 1, mergeIndex = null, gridConfig } = options;

  const previousAlpha = ctx.globalAlpha;
  if (opacity < 1) {
    ctx.globalAlpha = opacity;
  }

  ctx.save();

  // Apply viewport transform: world coords -> screen coords
  ctx.translate(offsetX, offsetY);
  ctx.scale(zoom, zoom);

  // Stroke styling matches cell borders
  const strokeColor = theme.cells.border;
  const strokeWidth = theme.cells.borderWidth / zoom; // Constant screen-space width

  // Render each curve individually
  for (let i = 0; i < curves.length; i++) {
    const curve = curves[i];
    if (!curve || !curve.start || !curve.segments) continue;

    const path = buildPath2D(curve);

    // Fill closed curves
    if (curve.closed && curve.color && curve.color !== 'transparent') {
      ctx.fillStyle = curve.color;
      const curveAlpha = curve.opacity ?? 1;
      if (curveAlpha < 1 || opacity < 1) {
        ctx.globalAlpha = (opacity < 1 ? opacity : 1) * curveAlpha;
      }
      ctx.fill(path, 'evenodd');
      // Reset alpha
      ctx.globalAlpha = opacity < 1 ? opacity : 1;
    }

    // Interior grid lines: between fill and stroke, clipped to curve shape
    if (gridConfig && curve.closed && curve.color && curve.color !== 'transparent') {
      renderCurveInteriorGrid(ctx, curve, path, gridConfig);
    }

    // Stroke all curves
    if (curve.closed) {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
    } else {
      ctx.strokeStyle = curve.strokeColor || strokeColor;
      ctx.lineWidth = (curve.strokeWidth || 2) / zoom;
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Check for same-color cell rects to clip out of the stroke
    const cellRects = mergeIndex?.curveCellRects?.get(i);
    if (cellRects && cellRects.length > 0 && curve.closed) {
      // Clip-based stroke suppression: stroke everywhere except
      // where same-color cells cover the curve border.
      // Uses even-odd rule: large rect + cell rects = holes at cells.
      ctx.save();
      const clipPath = new Path2D();
      clipPath.rect(-1e6, -1e6, 2e6, 2e6);
      for (let r = 0; r < cellRects.length; r++) {
        const cr = cellRects[r];
        clipPath.rect(cr.x, cr.y, cr.w, cr.h);
      }
      ctx.clip(clipPath, 'evenodd');
      ctx.stroke(path);
      ctx.restore();
    } else {
      ctx.stroke(path);
    }
  }

  ctx.restore();

  if (opacity < 1) {
    ctx.globalAlpha = previousAlpha;
  }
}

return {
  renderCurves,
  buildPath2D,
  invalidatePath2D
};

/**
 * curveRenderer.ts
 *
 * Renders freehand curves on the canvas.
 * Curves are stored as Catmull-Rom control points and rendered as Bezier curves.
 *
 * RENDERING NOTES:
 * - Curves are stored in world coordinates (pixel units)
 * - Rendering uses offset-based view state for consistency with other renderers
 * - Stroke width can optionally scale with zoom
 * - Uses lineCap/lineJoin = 'round' for smooth appearance
 */

// Type-only imports
import type { Curve, CurveRenderOptions, BezierSegment, CurvePoint } from '#types/core/curve.types';

/**
 * View state used by renderers (offset-based).
 * x, y are offset values, zoom is the scale factor.
 */
interface RendererViewState {
  x: number;  // Offset X (already calculated from center)
  y: number;  // Offset Y (already calculated from center)
  zoom: number;
}

// Datacore imports
const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

const { catmullRomToBezier } = await requireModuleByName("curveMath.ts") as {
  catmullRomToBezier: (points: CurvePoint[], tension: number, closed: boolean) => BezierSegment[];
};

// Default render options
const DEFAULT_OPTIONS: CurveRenderOptions = {
  lineCap: 'round',
  lineJoin: 'round',
  scaleStrokeWithZoom: true,
};

/**
 * Render a single curve on the canvas.
 *
 * @param ctx - Canvas rendering context
 * @param curve - Curve to render
 * @param viewState - Renderer view state with offset and zoom
 * @param options - Rendering options
 */
function renderCurve(
  ctx: CanvasRenderingContext2D,
  curve: Curve,
  viewState: RendererViewState,
  options: CurveRenderOptions = {}
): void {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { points, color, opacity = 1, strokeWidth = 2, smoothing = 0.5, closed = false, filled = false } = curve;

  if (points.length < 2) {
    return;
  }

  // Convert Catmull-Rom control points to Bezier segments
  const segments = catmullRomToBezier(points, smoothing, closed);

  if (segments.length === 0) {
    return;
  }

  // Calculate screen coordinates using offset-based view state
  // This is the same formula used by other renderers (gridRenderer, hexRenderer)
  // worldPoint * zoom + offset = screenPoint
  const toScreen = (x: number, y: number) => ({
    x: x * viewState.zoom + viewState.x,
    y: y * viewState.zoom + viewState.y,
  });

  // Begin path
  ctx.beginPath();

  // Move to start of first segment
  const start = toScreen(segments[0].start[0], segments[0].start[1]);
  ctx.moveTo(start.x, start.y);

  // Draw each Bezier segment
  for (const segment of segments) {
    const cp1 = toScreen(segment.cp1[0], segment.cp1[1]);
    const cp2 = toScreen(segment.cp2[0], segment.cp2[1]);
    const end = toScreen(segment.end[0], segment.end[1]);
    ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y);
  }

  // Close path if needed
  if (closed) {
    ctx.closePath();
  }

  // Set up stroke style
  const previousAlpha = ctx.globalAlpha;
  ctx.globalAlpha = previousAlpha * opacity;

  // Calculate stroke width (optionally scaled with zoom)
  const scaledWidth = opts.scaleStrokeWithZoom
    ? strokeWidth * viewState.zoom
    : strokeWidth;

  // Fill if closed and filled
  if (closed && filled) {
    ctx.fillStyle = color;
    ctx.fill();
  }

  // Stroke the curve
  ctx.strokeStyle = color;
  ctx.lineWidth = scaledWidth;
  ctx.lineCap = opts.lineCap!;
  ctx.lineJoin = opts.lineJoin!;
  ctx.stroke();

  // Restore alpha
  ctx.globalAlpha = previousAlpha;
}

/**
 * Render all curves on the canvas.
 *
 * @param ctx - Canvas rendering context
 * @param curves - Curves to render
 * @param viewState - Renderer view state with offset and zoom
 * @param options - Rendering options
 */
function renderCurves(
  ctx: CanvasRenderingContext2D,
  curves: Curve[] | null | undefined,
  viewState: RendererViewState,
  options: CurveRenderOptions = {}
): void {
  if (!curves || curves.length === 0) {
    return;
  }

  for (const curve of curves) {
    renderCurve(ctx, curve, viewState, options);
  }
}

/**
 * Render a preview curve during drawing (before it's finalized).
 * Uses slightly different styling for visual feedback.
 *
 * @param ctx - Canvas rendering context
 * @param points - Raw points being drawn
 * @param color - Stroke color
 * @param strokeWidth - Line width
 * @param viewState - Renderer view state with offset and zoom
 */
function renderCurvePreview(
  ctx: CanvasRenderingContext2D,
  points: [number, number][],
  color: string,
  strokeWidth: number,
  viewState: RendererViewState
): void {
  if (points.length < 2) {
    return;
  }

  // For preview, draw as simple polyline (smoother performance during drawing)
  const toScreen = (x: number, y: number) => ({
    x: x * viewState.zoom + viewState.x,
    y: y * viewState.zoom + viewState.y,
  });

  ctx.beginPath();
  const start = toScreen(points[0][0], points[0][1]);
  ctx.moveTo(start.x, start.y);

  for (let i = 1; i < points.length; i++) {
    const pt = toScreen(points[i][0], points[i][1]);
    ctx.lineTo(pt.x, pt.y);
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = strokeWidth * viewState.zoom;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

/**
 * Render selection highlight for a curve.
 *
 * @param ctx - Canvas rendering context
 * @param curve - Curve to highlight
 * @param viewState - Renderer view state with offset and zoom
 * @param highlightColor - Color for the highlight
 */
function renderCurveHighlight(
  ctx: CanvasRenderingContext2D,
  curve: Curve,
  viewState: RendererViewState,
  highlightColor: string = '#4dabf7'
): void {
  const { points, smoothing = 0.5, closed = false } = curve;

  if (points.length < 2) {
    return;
  }

  const segments = catmullRomToBezier(points, smoothing, closed);

  if (segments.length === 0) {
    return;
  }

  const toScreen = (x: number, y: number) => ({
    x: x * viewState.zoom + viewState.x,
    y: y * viewState.zoom + viewState.y,
  });

  // Draw thicker outline in highlight color
  ctx.beginPath();
  const start = toScreen(segments[0].start[0], segments[0].start[1]);
  ctx.moveTo(start.x, start.y);

  for (const segment of segments) {
    const cp1 = toScreen(segment.cp1[0], segment.cp1[1]);
    const cp2 = toScreen(segment.cp2[0], segment.cp2[1]);
    const end = toScreen(segment.end[0], segment.end[1]);
    ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y);
  }

  if (closed) {
    ctx.closePath();
  }

  ctx.strokeStyle = highlightColor;
  ctx.lineWidth = ((curve.strokeWidth ?? 2) + 4) * viewState.zoom;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Draw control point indicators
  ctx.fillStyle = highlightColor;
  const handleSize = 6;
  for (const point of points) {
    const screen = toScreen(point[0], point[1]);
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, handleSize, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ===========================================================================
// Exports (Datacore module format)
// ===========================================================================

return {
  renderCurve,
  renderCurves,
  renderCurvePreview,
  renderCurveHighlight,
};

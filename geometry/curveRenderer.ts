/**
 * curveRenderer.ts
 *
 * Renders freehand curves on the HTML Canvas 2D context.
 * Builds and caches Path2D objects per curve, applies viewport transforms,
 * fills closed paths with even-odd rule, and strokes all paths.
 *
 * Overlapping closed curves with the same color+opacity are merged via
 * polygon union at render time, eliminating internal stroke borders.
 * The data model is never touched — union is purely visual.
 */

import type { Curve } from '#types/core/curve.types';
import type { RendererTheme } from '#types/hooks/canvasRenderer.types';

// Datacore import for polygon union
const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

const { unionCurves } = await requireModuleByName("curveBoolean.ts") as {
  unionCurves: (curves: Curve[]) => [number, number][][][] | null
};

/** Viewport state needed for rendering */
interface CurveViewState {
  x: number;  // offsetX
  y: number;  // offsetY
  zoom: number;
}

/** Axis-aligned bounding box */
interface AABB {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** A union group ready for rendering */
interface UnionGroup {
  path: Path2D;
  bounds: AABB;
  color: string;
  opacity: number;
  curveIndices: number[];
}

/** Result of preprocessing curves for rendering */
interface PreprocessResult {
  unionGroups: UnionGroup[];
  individualCurves: { curve: Curve; index: number }[];
}

const path2DCache = new WeakMap<Curve, Path2D>();

/**
 * Build a Path2D for a curve, including holes.
 * Caches in a WeakMap for reuse across frames.
 */
function buildPath2D(curve: Curve): Path2D {
  const cached = path2DCache.get(curve);
  if (cached) return cached;

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

  path2DCache.set(curve, path);
  return path;
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
function getCurveBounds(curve: Curve): AABB {
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
  const zoom = ctx.getTransform().a;
  const actualLineWidth = Math.max(1, lineWidth * interiorRatio) / zoom;
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
 * Render interior grid lines clipped to a union group's path.
 */
function renderUnionInteriorGrid(
  ctx: CanvasRenderingContext2D,
  bounds: AABB,
  path: Path2D,
  gridConfig: CurveGridConfig
): void {
  const { cellSize, lineColor, lineWidth, interiorRatio } = gridConfig;
  const zoom = ctx.getTransform().a;
  const actualLineWidth = Math.max(1, lineWidth * interiorRatio) / zoom;
  const halfWidth = actualLineWidth / 2;

  const startCol = Math.floor(bounds.minX / cellSize) - 1;
  const endCol = Math.ceil(bounds.maxX / cellSize) + 1;
  const startRow = Math.floor(bounds.minY / cellSize) - 1;
  const endRow = Math.ceil(bounds.maxY / cellSize) + 1;

  ctx.save();
  ctx.clip(path, 'evenodd');
  ctx.fillStyle = lineColor;

  for (let col = startCol; col <= endCol; col++) {
    const x = col * cellSize;
    ctx.fillRect(x - halfWidth, bounds.minY - cellSize, actualLineWidth, bounds.maxY - bounds.minY + cellSize * 2);
  }

  for (let row = startRow; row <= endRow; row++) {
    const y = row * cellSize;
    ctx.fillRect(bounds.minX - cellSize, y - halfWidth, bounds.maxX - bounds.minX + cellSize * 2, actualLineWidth);
  }

  ctx.restore();
}

// =========================================================================
// AABB overlap and union-find clustering
// =========================================================================

function aabbOverlap(a: AABB, b: AABB): boolean {
  return a.minX <= b.maxX && b.minX <= a.maxX &&
         a.minY <= b.maxY && b.minY <= a.maxY;
}

function findOverlapClusters(items: { bounds: AABB; index: number }[]): number[][] {
  const n = items.length;
  const parent = new Int32Array(n);
  const rank = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;

  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }

  function unite(a: number, b: number): void {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    if (rank[ra] < rank[rb]) { parent[ra] = rb; }
    else if (rank[ra] > rank[rb]) { parent[rb] = ra; }
    else { parent[rb] = ra; rank[ra]++; }
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (aabbOverlap(items[i].bounds, items[j].bounds)) {
        unite(i, j);
      }
    }
  }

  const clusters = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    let cluster = clusters.get(root);
    if (!cluster) {
      cluster = [];
      clusters.set(root, cluster);
    }
    cluster.push(items[i].index);
  }

  return Array.from(clusters.values());
}

// =========================================================================
// MultiPolygon → Path2D conversion
// =========================================================================

function multiPolygonToPath2D(multiPoly: [number, number][][][]): Path2D {
  const path = new Path2D();
  for (let p = 0; p < multiPoly.length; p++) {
    const polygon = multiPoly[p];
    for (let r = 0; r < polygon.length; r++) {
      const ring = polygon[r];
      if (ring.length < 2) continue;
      path.moveTo(ring[0][0], ring[0][1]);
      for (let i = 1; i < ring.length; i++) {
        path.lineTo(ring[i][0], ring[i][1]);
      }
      path.closePath();
    }
  }
  return path;
}

function multiPolygonBounds(multiPoly: [number, number][][][]): AABB {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let p = 0; p < multiPoly.length; p++) {
    const ring = multiPoly[p][0]; // outer ring
    if (!ring) continue;
    for (let i = 0; i < ring.length; i++) {
      const x = ring[i][0], y = ring[i][1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, minY, maxX, maxY };
}

// =========================================================================
// Two-level caching for preprocessing
// =========================================================================

let preprocessCacheRef: Curve[] | null = null;
let preprocessCacheResult: PreprocessResult | null = null;

const unionCache = new Map<string, { refs: Curve[]; path: Path2D; bounds: AABB }>();

function preprocessCurves(curves: Curve[]): PreprocessResult {
  // Level 1: array reference check
  if (preprocessCacheRef === curves && preprocessCacheResult) {
    return preprocessCacheResult;
  }

  const individualCurves: { curve: Curve; index: number }[] = [];
  const unionGroups: UnionGroup[] = [];

  // Group closed curves by color|opacity
  const colorGroups = new Map<string, { curve: Curve; index: number; bounds: AABB }[]>();

  for (let i = 0; i < curves.length; i++) {
    const curve = curves[i];
    if (!curve || !curve.start || !curve.segments) continue;

    if (!curve.closed || !curve.color || curve.color === 'transparent') {
      individualCurves.push({ curve, index: i });
      continue;
    }

    const key = `${curve.color}|${curve.opacity ?? 1}`;
    let group = colorGroups.get(key);
    if (!group) {
      group = [];
      colorGroups.set(key, group);
    }
    group.push({ curve, index: i, bounds: getCurveBounds(curve) });
  }

  for (const [, group] of colorGroups) {
    if (group.length === 1) {
      individualCurves.push({ curve: group[0].curve, index: group[0].index });
      continue;
    }

    // Find overlap clusters via AABB
    const clusterItems = group.map(g => ({ bounds: g.bounds, index: g.index }));
    const clusters = findOverlapClusters(clusterItems);

    for (const cluster of clusters) {
      if (cluster.length === 1) {
        const idx = cluster[0];
        const item = group.find(g => g.index === idx)!;
        individualCurves.push({ curve: item.curve, index: item.index });
        continue;
      }

      // Build cache key from sorted curve IDs
      const clusterCurves = cluster.map(idx => {
        const item = group.find(g => g.index === idx)!;
        return item.curve;
      });
      const sortedIds = clusterCurves.map(c => c.id).sort().join(',');

      // Level 2: union cache by sorted IDs + ref validation
      const cached = unionCache.get(sortedIds);
      if (cached && cached.refs.length === clusterCurves.length) {
        let valid = true;
        for (let i = 0; i < cached.refs.length; i++) {
          if (cached.refs[i] !== clusterCurves[i]) {
            valid = false;
            break;
          }
        }
        if (valid) {
          unionGroups.push({
            path: cached.path,
            bounds: cached.bounds,
            color: clusterCurves[0].color,
            opacity: clusterCurves[0].opacity ?? 1,
            curveIndices: cluster
          });
          continue;
        }
      }

      // Compute union
      const result = unionCurves(clusterCurves);
      if (!result) {
        // Fallback to individual rendering
        for (const idx of cluster) {
          const item = group.find(g => g.index === idx)!;
          individualCurves.push({ curve: item.curve, index: item.index });
        }
        continue;
      }

      const path = multiPolygonToPath2D(result);
      const bounds = multiPolygonBounds(result);

      unionCache.set(sortedIds, { refs: clusterCurves.slice(), path, bounds });

      unionGroups.push({
        path,
        bounds,
        color: clusterCurves[0].color,
        opacity: clusterCurves[0].opacity ?? 1,
        curveIndices: cluster
      });
    }
  }

  const result: PreprocessResult = { unionGroups, individualCurves };
  preprocessCacheRef = curves;
  preprocessCacheResult = result;
  return result;
}

// =========================================================================
// Main render function
// =========================================================================

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

  // Preprocess: group overlapping same-color curves for union rendering
  const { unionGroups, individualCurves } = preprocessCurves(curves);

  // --- Render union groups ---
  for (let g = 0; g < unionGroups.length; g++) {
    const group = unionGroups[g];

    // Fill
    ctx.fillStyle = group.color;
    const groupAlpha = group.opacity;
    if (groupAlpha < 1 || opacity < 1) {
      ctx.globalAlpha = (opacity < 1 ? opacity : 1) * groupAlpha;
    }
    ctx.fill(group.path, 'evenodd');
    ctx.globalAlpha = opacity < 1 ? opacity : 1;

    // Interior grid lines (grid maps only)
    if (gridConfig) {
      renderUnionInteriorGrid(ctx, group.bounds, group.path, gridConfig);
    }

    // Stroke with aggregated merge index clipping
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Aggregate cell rects from all curves in the group
    let aggregatedRects: Array<{ x: number; y: number; w: number; h: number }> | null = null;
    if (mergeIndex) {
      for (let ci = 0; ci < group.curveIndices.length; ci++) {
        const rects = mergeIndex.curveCellRects?.get(group.curveIndices[ci]);
        if (rects && rects.length > 0) {
          if (!aggregatedRects) aggregatedRects = [];
          for (let r = 0; r < rects.length; r++) {
            aggregatedRects.push(rects[r]);
          }
        }
      }
    }

    if (aggregatedRects && aggregatedRects.length > 0) {
      ctx.save();
      const clipPath = new Path2D();
      clipPath.rect(-1e6, -1e6, 2e6, 2e6);
      for (let r = 0; r < aggregatedRects.length; r++) {
        const cr = aggregatedRects[r];
        clipPath.rect(cr.x, cr.y, cr.w, cr.h);
      }
      ctx.clip(clipPath, 'evenodd');
      ctx.stroke(group.path);
      ctx.restore();
    } else {
      ctx.stroke(group.path);
    }
  }

  // --- Render individual curves (unchanged from original path) ---
  for (let ic = 0; ic < individualCurves.length; ic++) {
    const { curve, index: i } = individualCurves[ic];

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
  buildPath2D
};

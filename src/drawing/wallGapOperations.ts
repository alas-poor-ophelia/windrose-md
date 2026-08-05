/**
 * wallGapOperations.ts
 *
 * Pure geometry for WallGap openings (doors / windows / thresholds). A gap is
 * anchored to a LOGICAL segment of its host WallPath by `{seg, t}` (t = center
 * fraction of that segment's flattened arc length) with a `widthCells` length,
 * so edits to unrelated segments never move it.
 *
 * This module owns:
 *  - a STABLE, fixed-subdivision flatten dedicated to gap math (geometry F6):
 *    the renderer's adaptive `arcSubdivisions` count jumps 8→12→…→48 as a bow
 *    deepens, which would make a gap at t≠0.5 visibly step along the wall as the
 *    user drags a bow; gap seg/t math must NOT inherit that quantization.
 *  - screen→arc-length projection (`projectToWall`) and world-center
 *    reprojection (`reprojectGap`) — the load-bearing remap path for every
 *    topological wall edit (insert / delete vertex; §2.3).
 *  - the invariant sweep: clamp a gap's derived span inside its segment
 *    (invariant 3, CLAMP-never-drop) and resolve overlaps by NUDGE (invariant 4).
 *  - `subtractIntervals`, the skip-span helper the renderer draws with.
 *
 * Stored values (`seg`, `t`, `widthCells`, `tile`) are never destroyed by the
 * geometric invariants — only clamped/nudged at derive time — so a door
 * survives cellSize changes and wall-shortening across save/reload.
 */

import type { WallGap, WallGapTile, WallPath } from '#types/core/wallpath.types';

import { projectPointToPolyline } from './segmentMath';

// ===========================================
// Constants
// ===========================================

/**
 * Fixed subdivision count per arced segment for gap math. Deliberately NOT the
 * renderer's adaptive `arcSubdivisions` — a stable count keeps a gap's arc-length
 * position smooth as a bow deepens (geometry F6). High enough to keep the
 * arc-length estimate accurate for projection/round-trip.
 */
const GAP_ARC_SUBDIVISIONS = 32;

/** Minimum door width floor (in grid cells) for edge-resize (geometry F7). */
const MIN_GAP_CELLS = 0.25;

// ===========================================
// Types
// ===========================================

/**
 * A stable flatten of a wall's centerline with per-logical-segment arc-length
 * offsets. Built with a FIXED subdivision count (see GAP_ARC_SUBDIVISIONS).
 */
interface GapFlatten {
  /** Flattened polyline points in world coords. */
  points: Array<[number, number]>;
  /** Cumulative arc length at each point (length === points.length). */
  cumLen: number[];
  /** Cumulative arc length at the start of each logical segment. */
  segStart: number[];
  /** Arc length of each logical segment. */
  segLen: number[];
  /** Total flattened arc length. */
  totalLength: number;
}

/** Result of projecting a world point onto a wall's stable flatten. */
interface GapProjection {
  /** Logical segment index. */
  seg: number;
  /** 0..1 fraction along that segment's arc length. */
  t: number;
  /** Global flattened arc length of the projected point. */
  lenAlong: number;
  /** Distance from the query point to the projected point. */
  dist: number;
}

/** A gap's derived (clamped) span, in GLOBAL flattened arc length. */
interface ClampedGapSpan {
  seg: number;
  /** Clamped center, global flattened arc length. */
  centerLen: number;
  /** Span lower/upper edge, global flattened arc length. */
  lo: number;
  hi: number;
  /** Derived (possibly clamped) width in world units. */
  widthWorld: number;
  /** Derived (possibly clamped) width in grid cells. */
  derivedWidthCells: number;
  /** True if the derived width or center differs from the stored geometry. */
  clamped: boolean;
}

// ===========================================
// Stable flatten
// ===========================================

/** Evaluate a quadratic bezier at t (local copy — renderer's is not exported). */
function quadPoint(
  p0x: number, p0y: number,
  cx: number, cy: number,
  p1x: number, p1y: number,
  t: number,
): [number, number] {
  const mt = 1 - t;
  return [
    mt * mt * p0x + 2 * mt * t * cx + t * t * p1x,
    mt * mt * p0y + 2 * mt * t * cy + t * t * p1y,
  ];
}

/**
 * Flatten a wall to a polyline with per-segment arc-length offsets, using a
 * FIXED subdivision count for arcs (stable parameterization; geometry F6).
 * Only the centerline (`vertices` + `closed`) matters — accepts anything with
 * those fields so callers can flatten pre/post-edit wall snapshots.
 */
function buildGapFlatten(wall: Pick<WallPath, 'vertices' | 'closed'>): GapFlatten {
  const verts = wall.vertices;
  const points: Array<[number, number]> = [];
  const cumLen: number[] = [];
  const segStart: number[] = [];
  const segLen: number[] = [];
  if (verts.length < 2) return { points, cumLen, segStart, segLen, totalLength: 0 };

  points.push([verts[0].x, verts[0].y]);
  cumLen.push(0);
  let total = 0;

  const segCount = wall.closed ? verts.length : verts.length - 1;
  for (let i = 0; i < segCount; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % verts.length];
    segStart.push(total);
    const before = total;
    if (a.arc != null) {
      const [cx, cy] = a.arc;
      for (let s = 1; s <= GAP_ARC_SUBDIVISIONS; s++) {
        const p = quadPoint(a.x, a.y, cx, cy, b.x, b.y, s / GAP_ARC_SUBDIVISIONS);
        const prev = points[points.length - 1];
        total += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
        points.push(p);
        cumLen.push(total);
      }
    } else {
      total += Math.hypot(b.x - a.x, b.y - a.y);
      points.push([b.x, b.y]);
      cumLen.push(total);
    }
    segLen.push(total - before);
  }
  return { points, cumLen, segStart, segLen, totalLength: total };
}

/** Number of logical segments in a flatten. */
function segmentCount(flat: GapFlatten): number {
  return flat.segStart.length;
}

/** Global flattened arc length of a gap's segment-local {seg, t}. */
function segTToLen(flat: GapFlatten, seg: number, t: number): number {
  const s = Math.max(0, Math.min(segmentCount(flat) - 1, seg));
  return flat.segStart[s] + t * flat.segLen[s];
}

/** Map a global flattened arc length back to segment-local {seg, t}. */
function lenToSegT(flat: GapFlatten, len: number): { seg: number; t: number } {
  const n = segmentCount(flat);
  if (n === 0) return { seg: 0, t: 0 };
  const clamped = Math.max(0, Math.min(flat.totalLength, len));
  for (let s = 0; s < n; s++) {
    const start = flat.segStart[s];
    const end = start + flat.segLen[s];
    if (clamped <= end || s === n - 1) {
      const sl = flat.segLen[s];
      const t = sl > 0 ? Math.max(0, Math.min(1, (clamped - start) / sl)) : 0;
      return { seg: s, t };
    }
  }
  return { seg: n - 1, t: 1 };
}

/** World point + tangent angle at a global flattened arc length. */
function pointAtLength(flat: GapFlatten, len: number): { x: number; y: number; angle: number } {
  const pts = flat.points;
  if (pts.length === 0) return { x: 0, y: 0, angle: 0 };
  if (pts.length === 1) return { x: pts[0][0], y: pts[0][1], angle: 0 };
  const target = Math.max(0, Math.min(flat.totalLength, len));
  for (let i = 1; i < pts.length; i++) {
    if (target <= flat.cumLen[i] || i === pts.length - 1) {
      const segStart = flat.cumLen[i - 1];
      const subLen = flat.cumLen[i] - segStart;
      const f = subLen > 0 ? (target - segStart) / subLen : 0;
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      return {
        x: x0 + f * (x1 - x0),
        y: y0 + f * (y1 - y0),
        angle: Math.atan2(y1 - y0, x1 - x0),
      };
    }
  }
  const [lx, ly] = pts[pts.length - 1];
  return { x: lx, y: ly, angle: 0 };
}

/** World point of a gap's center on a given flatten. */
function gapCenterWorld(gap: Pick<WallGap, 'seg' | 't'>, flat: GapFlatten): { x: number; y: number } {
  const { x, y } = pointAtLength(flat, segTToLen(flat, gap.seg, gap.t));
  return { x, y };
}

// ===========================================
// Projection & reprojection
// ===========================================

/** Project a world point onto a wall's stable flatten → {seg, t, lenAlong, dist}. */
function projectPointOntoFlatten(flat: GapFlatten, wx: number, wy: number): GapProjection | null {
  const p = projectPointToPolyline(flat.points, wx, wy);
  if (p == null) return null;
  const before = flat.cumLen[p.segIndex - 1];
  const after = flat.cumLen[p.segIndex];
  const lenAlong = before + p.t * (after - before);
  const { seg, t } = lenToSegT(flat, lenAlong);
  return { seg, t, lenAlong, dist: p.dist };
}

/**
 * Screen→arc-length projection: nearest point on the wall centerline, returned
 * as segment-local {seg, t} plus global arc length and distance. Works for
 * straight, single-arc, multi-arc, and closed-loop walls (§6.2).
 */
function projectToWall(wall: Pick<WallPath, 'vertices' | 'closed'>, wx: number, wy: number): GapProjection | null {
  return projectPointOntoFlatten(buildGapFlatten(wall), wx, wy);
}

/**
 * Reproject a gap's center world point from an OLD flatten onto a NEW one,
 * yielding fresh {seg, t}; `widthCells` (and every other stored field) is kept.
 * This is the mandated remap mechanism for every topological edit — both
 * insert-vertex and delete-vertex mutate arc/segment length, so neither can
 * trust an analytic index formula (geometry F4, integrity F3). Also usable as a
 * debug-build post-edit assertion.
 */
function reprojectGap(gap: WallGap, oldFlat: GapFlatten, newFlat: GapFlatten): WallGap {
  const center = gapCenterWorld(gap, oldFlat);
  const proj = projectPointOntoFlatten(newFlat, center.x, center.y);
  if (proj == null) return gap;
  return { ...gap, seg: proj.seg, t: proj.t };
}

// ===========================================
// Invariants (clamp / nudge)
// ===========================================

/**
 * Clamp a width (cells) to [MIN_GAP_CELLS, segLenCells]. When the segment is
 * shorter than the minimum floor (lo > hi), the clamp resolves to the UPPER
 * bound = fit-to-segment (G-F8), never the floor.
 */
function clampWidthCells(widthCells: number, segLenCells: number): number {
  const hi = segLenCells;
  const lo = MIN_GAP_CELLS;
  if (lo > hi) return hi; // segment shorter than the floor → fit to segment
  return Math.max(lo, Math.min(hi, widthCells));
}

/**
 * Invariant-3 derive: clamp a gap's span inside its own segment WITHOUT
 * touching stored values. Returns the span in GLOBAL flattened arc length. If
 * the door is wider than its segment (cellSize grew, or the segment was
 * shortened), the derived width is capped to the segment while stored
 * `widthCells` is left unchanged, so it returns to full size when the wall is
 * lengthened again.
 */
function clampGapToSegment(gap: WallGap, flat: GapFlatten, cellSize: number): ClampedGapSpan {
  const seg = Math.max(0, Math.min(segmentCount(flat) - 1, gap.seg));
  const segLenWorld = flat.segLen[seg] ?? 0;
  const segStartWorld = flat.segStart[seg] ?? 0;
  const segLenCells = cellSize > 0 ? segLenWorld / cellSize : 0;
  const derivedWidthCells = clampWidthCells(gap.widthCells, segLenCells);
  const widthWorld = derivedWidthCells * cellSize;
  const half = widthWorld / 2;
  const rawCenter = gap.t * segLenWorld;
  // half <= segLenWorld/2 after the width clamp, so [half, segLenWorld-half] is valid.
  const centerLocal = Math.max(half, Math.min(segLenWorld - half, rawCenter));
  const centerLen = segStartWorld + centerLocal;
  const clamped =
    Math.abs(derivedWidthCells - gap.widthCells) > 1e-9 ||
    Math.abs(centerLocal - rawCenter) > 1e-9;
  return {
    seg,
    centerLen,
    lo: centerLen - half,
    hi: centerLen + half,
    widthWorld,
    derivedWidthCells,
    clamped,
  };
}

/**
 * Invariant sweep (re-run after every remap): normalize stored `t` in place so
 * each gap's derived span fits its segment (invariant 3), then resolve overlaps
 * on the same segment by NUDGING the later gap along the segment (invariant 4).
 * Stored `widthCells` and `tile` are preserved; a gap is dropped only when it
 * genuinely cannot fit alongside its neighbours even at its clamped width.
 * Gaps on different segments cannot overlap (span is clamped inside the segment).
 */
function sweepGapInvariants(gaps: WallGap[], flat: GapFlatten, cellSize: number): WallGap[] {
  if (gaps.length === 0) return gaps;
  const nSeg = segmentCount(flat);

  // Group by (clamped) segment index.
  const bySeg = new Map<number, WallGap[]>();
  for (const gap of gaps) {
    const seg = Math.max(0, Math.min(nSeg - 1, gap.seg));
    const arr = bySeg.get(seg);
    if (arr) arr.push(gap);
    else bySeg.set(seg, [gap]);
  }

  const out: WallGap[] = [];
  for (const [seg, group] of bySeg) {
    const segLenWorld = flat.segLen[seg] ?? 0;
    const segStartWorld = flat.segStart[seg] ?? 0;
    // Order by current center so nudging preserves left→right intent.
    group.sort((a, b) => a.t - b.t);
    let cursor = 0; // local arc length already consumed on this segment
    for (const gap of group) {
      const span = clampGapToSegment({ ...gap, seg }, flat, cellSize);
      const half = span.widthWorld / 2;
      let centerLocal = span.centerLen - segStartWorld;
      // Nudge right so this gap's low edge clears the previous gap's high edge.
      if (centerLocal - half < cursor) centerLocal = cursor + half;
      if (centerLocal + half > segLenWorld + 1e-6) {
        // Genuinely cannot fit alongside its neighbours — drop (last resort).
        continue;
      }
      const t = segLenWorld > 0 ? centerLocal / segLenWorld : 0;
      out.push({ ...gap, seg, t });
      cursor = centerLocal + half;
    }
  }
  return out;
}

// ===========================================
// Remap suite (topological edits — via reprojectGap)
// ===========================================

/**
 * Remap gaps through a topological edit (vertex insert/delete) by reprojecting
 * each gap's center world point from the pre-edit flatten onto the post-edit
 * flatten, then re-running the invariant sweep. Used for BOTH insert and delete
 * (both mutate arc/segment length, so an analytic index formula is unsafe —
 * geometry F4, integrity F3). No reverse/close/open remap exists: those ops are
 * not exposed by the wall tool (§2.3).
 */
function remapGapsThroughEdit(
  gaps: WallGap[] | undefined,
  oldWall: Pick<WallPath, 'vertices' | 'closed'>,
  newWall: Pick<WallPath, 'vertices' | 'closed'>,
  cellSize: number,
): WallGap[] {
  if (gaps == null || gaps.length === 0) return [];
  const oldFlat = buildGapFlatten(oldWall);
  const newFlat = buildGapFlatten(newWall);
  const reprojected = gaps.map(g => reprojectGap(g, oldFlat, newFlat));
  return sweepGapInvariants(reprojected, newFlat, cellSize);
}

/**
 * Remap after inserting a vertex (splits a segment; the insert path deletes the
 * split segment's arc, so the retained half's arc length changes — reproject,
 * never analytic t/p; geometry F4). Callers must pass `newWall` with the arc
 * already flattened/removed exactly as WallLayer applies it.
 */
function remapGapsAfterInsertVertex(
  gaps: WallGap[] | undefined,
  oldWall: Pick<WallPath, 'vertices' | 'closed'>,
  newWall: Pick<WallPath, 'vertices' | 'closed'>,
  cellSize: number,
): WallGap[] {
  return remapGapsThroughEdit(gaps, oldWall, newWall, cellSize);
}

/**
 * Remap after deleting a vertex (merges two segments). Reprojects onto the
 * merged geometry and runs the overlap resolver, so two doors that each sat
 * near the deleted corner nudge apart on the merged segment (integrity F3).
 */
function remapGapsAfterDeleteVertex(
  gaps: WallGap[] | undefined,
  oldWall: Pick<WallPath, 'vertices' | 'closed'>,
  newWall: Pick<WallPath, 'vertices' | 'closed'>,
  cellSize: number,
): WallGap[] {
  return remapGapsThroughEdit(gaps, oldWall, newWall, cellSize);
}

/**
 * Insert-vertex guard (§2.3 insert row): if a candidate insertion point on
 * segment `seg` would land INSIDE an existing gap's clamped span, snap it to
 * the NEARER edge of that span instead — invariant 3 forbids straddling a
 * gap, and splitting through a door's middle would otherwise silently shift
 * the door rather than preserve it. Ties (equidistant from both edges) resolve
 * to the far edge. Returns the point unchanged when it lands outside every
 * gap on that segment. Pure/testable; called on the PRE-edit wall, before the
 * segment is split.
 */
function snapInsertPointOutsideGaps(
  wall: Pick<WallPath, 'vertices' | 'closed' | 'gaps'>,
  seg: number,
  wx: number,
  wy: number,
  cellSize: number,
): { x: number; y: number } {
  const flat = buildGapFlatten(wall);
  const nSeg = segmentCount(flat);
  if (nSeg === 0 || seg < 0 || seg >= nSeg) return { x: wx, y: wy };
  const proj = projectPointOntoFlatten(flat, wx, wy);
  const lenAlong = proj != null ? proj.lenAlong : segTToLen(flat, seg, 0.5);
  for (const g of wall.gaps ?? []) {
    if (g.seg !== seg) continue;
    const span = clampGapToSegment(g, flat, cellSize);
    if (lenAlong > span.lo && lenAlong < span.hi) {
      const snappedLen = lenAlong - span.lo < span.hi - lenAlong ? span.lo : span.hi;
      const p = pointAtLength(flat, snappedLen);
      return { x: p.x, y: p.y };
    }
  }
  return { x: wx, y: wy };
}

// ===========================================
// Edit-mode handle math (P5 — §6.1)
// ===========================================

/** World anchors for a gap's edit handles, derived (clamped) from the wall. */
interface GapHandleAnchors {
  /** Clamped segment index the gap currently sits on. */
  seg: number;
  /** Gap center world point + wall tangent angle (for the perpendicular offset). */
  center: { x: number; y: number; angle: number };
  /** Low-edge world point (on the centerline). */
  lo: { x: number; y: number };
  /** High-edge world point (on the centerline). */
  hi: { x: number; y: number };
  /** Derived (clamped) span width in world units. */
  widthWorld: number;
}

/**
 * World-space anchor points for a gap's center + edge handles, derived from the
 * clamped span (invariant 3). Pure so handle placement/hit-testing is testable.
 * The WallLayer offsets the CENTER handle perpendicular to `center.angle` (off
 * the centerline where the bow diamond sits) to resolve the gap-center/bow
 * spatial collision (geometry F5) — the offset is screen-space (zoom-dependent)
 * so it stays in the layer, not here.
 */
function gapHandleAnchors(
  wall: Pick<WallPath, 'vertices' | 'closed'>,
  gap: WallGap,
  cellSize: number,
): GapHandleAnchors | null {
  const flat = buildGapFlatten(wall);
  if (segmentCount(flat) === 0) return null;
  const span = clampGapToSegment(gap, flat, cellSize);
  const c = pointAtLength(flat, span.centerLen);
  const lo = pointAtLength(flat, span.lo);
  const hi = pointAtLength(flat, span.hi);
  return {
    seg: span.seg,
    center: { x: c.x, y: c.y, angle: c.angle },
    lo: { x: lo.x, y: lo.y },
    hi: { x: hi.x, y: hi.y },
    widthWorld: span.widthWorld,
  };
}

/**
 * Hit-test a pointer against a wall's gap footprints: returns the id of the
 * gap whose clamped span contains the pointer's arc-length projection, with
 * the pointer within `maxPerp` world units of the centerline. Opening mode's
 * click-to-edit — clicking a placed door selects it instead of inserting a
 * new gap on top of it. Pure; mirrors gapHandleAnchors' clamped-span math.
 */
function findGapOnWallAtPoint(
  wall: Pick<WallPath, 'vertices' | 'closed' | 'gaps'>,
  wx: number,
  wy: number,
  cellSize: number,
  maxPerp: number,
): string | null {
  const gaps = wall.gaps;
  if (gaps == null || gaps.length === 0) return null;
  const flat = buildGapFlatten(wall);
  if (segmentCount(flat) === 0) return null;
  const proj = projectPointOntoFlatten(flat, wx, wy);
  if (proj == null || proj.dist > maxPerp) return null;
  for (const g of gaps) {
    const span = clampGapToSegment(g, flat, cellSize);
    if (proj.lenAlong >= span.lo && proj.lenAlong <= span.hi) return g.id;
  }
  return null;
}

/**
 * gapMove: re-anchor a gap to the projected pointer (§6.1). Keeps `widthCells`;
 * a door can migrate across a corner into a neighbouring segment (re-homes
 * `seg`). The stored `t` is re-centered so the clamped span fits its segment.
 */
function resolveGapMove(
  wall: Pick<WallPath, 'vertices' | 'closed'>,
  gap: WallGap,
  wx: number,
  wy: number,
  cellSize: number,
): WallGap {
  const flat = buildGapFlatten(wall);
  const proj = projectPointOntoFlatten(flat, wx, wy);
  if (proj == null) return gap;
  const span = clampGapToSegment({ ...gap, seg: proj.seg, t: proj.t }, flat, cellSize);
  const segLenWorld = flat.segLen[span.seg] ?? 0;
  const segStartWorld = flat.segStart[span.seg] ?? 0;
  const t = segLenWorld > 0 ? (span.centerLen - segStartWorld) / segLenWorld : 0;
  return { ...gap, seg: span.seg, t };
}

/**
 * gapEdge resize: drag one edge while holding the opposite edge fixed (§6.1,
 * geometry F7 + G-F8). Recomputes center `t` + `widthCells`, floors width at
 * `MIN_GAP_CELLS`, NEVER inverts (a negative/too-small target width clamps up to
 * the floor via `clampWidthCells`), and fits-to-segment when the segment is
 * shorter than the floor (lo>hi → upper bound). Sets `widthLocked`.
 */
function resolveGapEdgeResize(
  wall: Pick<WallPath, 'vertices' | 'closed'>,
  gap: WallGap,
  edge: 'lo' | 'hi',
  wx: number,
  wy: number,
  cellSize: number,
): WallGap {
  const flat = buildGapFlatten(wall);
  const seg = Math.max(0, Math.min(segmentCount(flat) - 1, gap.seg));
  const segLenWorld = flat.segLen[seg] ?? 0;
  const segStartWorld = flat.segStart[seg] ?? 0;
  if (!(segLenWorld > 0) || !(cellSize > 0)) return gap;
  const segLenCells = segLenWorld / cellSize;

  // Fixed edge (the one NOT being dragged) in LOCAL segment arc length.
  const span = clampGapToSegment({ ...gap, seg }, flat, cellSize);
  const fixedLocal = (edge === 'hi' ? span.lo : span.hi) - segStartWorld;

  // Project the pointer, clamp its arc length to this segment.
  const proj = projectPointOntoFlatten(flat, wx, wy);
  const rawLocal = proj != null ? proj.lenAlong - segStartWorld : fixedLocal;
  const dragLocal = Math.max(0, Math.min(segLenWorld, rawLocal));

  // Width in the drag direction; clampWidthCells floors negatives/undersize at
  // MIN_GAP_CELLS and resolves lo>hi to fit-to-segment.
  const desiredWidthWorld = edge === 'hi' ? dragLocal - fixedLocal : fixedLocal - dragLocal;
  const widthCells = clampWidthCells(desiredWidthWorld / cellSize, segLenCells);
  const widthWorld = widthCells * cellSize;
  const half = widthWorld / 2;

  // Hold the fixed edge; clamp the center so the whole span stays in the segment.
  let centerLocal = edge === 'hi' ? fixedLocal + half : fixedLocal - half;
  centerLocal = Math.max(half, Math.min(segLenWorld - half, centerLocal));
  const t = segLenWorld > 0 ? centerLocal / segLenWorld : 0;
  return { ...gap, seg, t, widthCells, widthLocked: true };
}

// ===========================================
// Skip-span helper
// ===========================================

/**
 * Subtract a sorted set of skip intervals from [start, end], returning the
 * visible sub-pieces in order. Skips need not be pre-sorted or disjoint; they
 * are normalized here. Used by the renderer to draw a strip chunk with gap
 * holes cut out of it (§4.2).
 */
function subtractIntervals(
  start: number,
  end: number,
  skips: ReadonlyArray<readonly [number, number]>,
): Array<[number, number]> {
  if (end <= start) return [];
  if (skips.length === 0) return [[start, end]];
  // Normalize: clip to [start, end], drop empties, sort, merge overlaps.
  const clipped: Array<[number, number]> = [];
  for (const [lo, hi] of skips) {
    const a = Math.max(start, Math.min(end, lo));
    const b = Math.max(start, Math.min(end, hi));
    if (b > a) clipped.push([a, b]);
  }
  if (clipped.length === 0) return [[start, end]];
  clipped.sort((p, q) => p[0] - q[0]);
  const merged: Array<[number, number]> = [clipped[0]];
  for (let i = 1; i < clipped.length; i++) {
    const last = merged[merged.length - 1];
    if (clipped[i][0] <= last[1]) last[1] = Math.max(last[1], clipped[i][1]);
    else merged.push(clipped[i]);
  }
  const out: Array<[number, number]> = [];
  let cursor = start;
  for (const [lo, hi] of merged) {
    if (lo > cursor) out.push([cursor, lo]);
    cursor = hi;
  }
  if (cursor < end) out.push([cursor, end]);
  return out;
}

// ===========================================
// Insert planning (placement flow — §5.2)
// ===========================================

/** Outcome of planning a gap insertion. */
interface GapInsertPlan {
  /** The clamped, non-overlapping gap ready to append to the wall's gaps. */
  gap: WallGap;
}

/**
 * Plan a gap insertion at a clicked world point on a wall (§5.2). Pure so the
 * placement flow is unit-testable.
 *
 * Steps: project the click to {seg,t}; clamp the tile-derived width to the host
 * segment (§3.3, invariant 3); then position the gap at the non-overlapping
 * spot NEAREST the click within the segment's free space (invariant 4 — NUDGE,
 * never shrink for overlap). Returns `null` when the segment genuinely cannot
 * fit the gap at its clamped width, so the caller aborts with a Notice and
 * places nothing (no partial insert). `widthCells` is stored already clamped to
 * the segment; invariant-3 re-clamps only if the segment later shrinks.
 */
function planGapInsert(
  wall: Pick<WallPath, 'vertices' | 'closed' | 'gaps'>,
  wx: number,
  wy: number,
  widthCells: number,
  cellSize: number,
  tile?: WallGapTile,
): GapInsertPlan | null {
  if (!(cellSize > 0) || !(widthCells > 0)) return null;
  const flat = buildGapFlatten(wall);
  const proj = projectPointOntoFlatten(flat, wx, wy);
  if (proj == null) return null;

  const seg = proj.seg;
  const segLenWorld = flat.segLen[seg] ?? 0;
  if (!(segLenWorld > 0)) return null;
  const segStartWorld = flat.segStart[seg] ?? 0;

  const segLenCells = segLenWorld / cellSize;
  const derivedWidthCells = clampWidthCells(widthCells, segLenCells);
  const widthWorld = derivedWidthCells * cellSize;
  const half = widthWorld / 2;
  // Desired center in LOCAL segment arc length, clamped so the span fits.
  const desired = Math.max(half, Math.min(segLenWorld - half, proj.t * segLenWorld));

  // Occupied (local) spans from existing gaps on the same segment.
  const occupied: Array<[number, number]> = [];
  for (const g of wall.gaps ?? []) {
    const gs = Math.max(0, Math.min(segmentCount(flat) - 1, g.seg));
    if (gs !== seg) continue;
    const span = clampGapToSegment({ ...g, seg: gs }, flat, cellSize);
    occupied.push([span.lo - segStartWorld, span.hi - segStartWorld]);
  }
  occupied.sort((a, b) => a[0] - b[0]);

  // Free (local) intervals = complement of occupied within [0, segLenWorld].
  const free: Array<[number, number]> = [];
  let cursor = 0;
  for (const [lo, hi] of occupied) {
    const clo = Math.max(0, lo);
    const chi = Math.min(segLenWorld, hi);
    if (clo > cursor) free.push([cursor, clo]);
    cursor = Math.max(cursor, chi);
  }
  if (cursor < segLenWorld) free.push([cursor, segLenWorld]);

  // Pick the center nearest `desired` inside a free interval wide enough.
  const EPS = 1e-6;
  let bestCenter: number | null = null;
  let bestDist = Infinity;
  for (const [lo, hi] of free) {
    if (hi - lo + EPS < widthWorld) continue;
    const c = Math.max(lo + half, Math.min(hi - half, desired));
    const d = Math.abs(c - desired);
    if (d < bestDist) { bestDist = d; bestCenter = c; }
  }
  if (bestCenter == null) return null;

  const t = segLenWorld > 0 ? bestCenter / segLenWorld : 0;
  return { gap: createWallGap({ seg, t, widthCells: derivedWidthCells, tile }) };
}

// ===========================================
// Construction
// ===========================================

/** Create a unique gap ID (same scheme as createWallPathId). */
function createWallGapId(): string {
  return 'gap-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

interface CreateWallGapOptions {
  seg: number;
  t: number;
  widthCells: number;
  widthLocked?: boolean;
  tile?: WallGapTile;
}

/** Construct a WallGap with an id minted and optional fields normalized. */
function createWallGap(opts: CreateWallGapOptions): WallGap {
  return {
    id: createWallGapId(),
    seg: opts.seg,
    t: opts.t,
    widthCells: opts.widthCells,
    ...(opts.widthLocked === true ? { widthLocked: true } : {}),
    ...(opts.tile != null ? { tile: opts.tile } : {}),
  };
}

export {
  GAP_ARC_SUBDIVISIONS,
  MIN_GAP_CELLS,
  buildGapFlatten,
  segTToLen,
  lenToSegT,
  pointAtLength,
  gapCenterWorld,
  projectToWall,
  projectPointOntoFlatten,
  reprojectGap,
  clampWidthCells,
  clampGapToSegment,
  gapHandleAnchors,
  findGapOnWallAtPoint,
  resolveGapMove,
  resolveGapEdgeResize,
  sweepGapInvariants,
  remapGapsThroughEdit,
  remapGapsAfterInsertVertex,
  remapGapsAfterDeleteVertex,
  snapInsertPointOutsideGaps,
  subtractIntervals,
  createWallGapId,
  createWallGap,
  planGapInsert,
};
export type { GapFlatten, GapProjection, ClampedGapSpan, CreateWallGapOptions, GapInsertPlan, GapHandleAnchors };

/**
 * outlineRenderer.ts
 * Renders visual polygon outlines on hex maps.
 * Supports straight-line and hex-edge-snapped rendering modes.
 */

import type { Point } from '#types/core/geometry.types';
import type { Outline } from '#types/core/map.types';

interface HexGeometryLike {
  hexSize: number;
  orientation: string;
  hexToWorld(q: number, r: number): { worldX: number; worldY: number };
  getHexVertices(q: number, r: number): { worldX: number; worldY: number }[];
  worldToScreen(worldX: number, worldY: number, offsetX: number, offsetY: number, zoom: number): { screenX: number; screenY: number };
  getNeighbors(x: number, y: number): Point[];
  isWithinBounds(q: number, r: number): boolean;
  worldToHex(worldX: number, worldY: number): { q: number; r: number };
}

interface ViewState {
  x: number;
  y: number;
  zoom: number;
}

function getDashPattern(lineStyle: string): number[] {
  switch (lineStyle) {
    case 'dashed': return [12, 6];
    case 'dotted': return [0.5, 8];
    default: return [];
  }
}

function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}

function pointInPolygon(px: number, py: number, polygon: Array<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function hexOverlapsPolygon(
  q: number, r: number,
  polygon: Array<{ x: number; y: number }>,
  geometry: HexGeometryLike
): boolean {
  const center = geometry.hexToWorld(q, r);
  if (pointInPolygon(center.worldX, center.worldY, polygon)) return true;
  const verts = geometry.getHexVertices(q, r);
  for (const v of verts) {
    if (pointInPolygon(v.worldX, v.worldY, polygon)) return true;
  }
  // Check if any polygon vertex falls inside this hex
  const hexPoly = verts.map(v => ({ x: v.worldX, y: v.worldY }));
  for (const pv of polygon) {
    if (pointInPolygon(pv.x, pv.y, hexPoly)) return true;
  }
  return false;
}

function findEnclosedHexes(
  vertices: Point[],
  geometry: HexGeometryLike,
  mapBounds: { maxRing?: number; maxCol?: number; maxRow?: number },
  orientation: string
): Point[] {
  const selected: Point[] = [];

  if (mapBounds.maxRing !== undefined) {
    for (let ring = 0; ring <= mapBounds.maxRing; ring++) {
      if (ring === 0) {
        if (hexOverlapsPolygon(0, 0, vertices, geometry)) {
          selected.push({ x: 0, y: 0 });
        }
      } else {
        let q = ring, r = 0;
        const dirs = [
          { dq: -1, dr: 1 }, { dq: -1, dr: 0 }, { dq: 0, dr: -1 },
          { dq: 1, dr: -1 }, { dq: 1, dr: 0 }, { dq: 0, dr: 1 }
        ];
        for (const dir of dirs) {
          for (let step = 0; step < ring; step++) {
            if (geometry.isWithinBounds(q, r)) {
              if (hexOverlapsPolygon(q, r, vertices, geometry)) {
                selected.push({ x: q, y: r });
              }
            }
            q += dir.dq;
            r += dir.dr;
          }
        }
      }
    }
  } else if (mapBounds.maxCol !== undefined && mapBounds.maxRow !== undefined) {
    for (let col = 0; col <= mapBounds.maxCol; col++) {
      for (let row = 0; row <= mapBounds.maxRow; row++) {
        let q: number, r: number;
        if (orientation === 'flat') {
          q = col;
          r = row - (col - (col & 1)) / 2;
        } else {
          q = col - (row - (row & 1)) / 2;
          r = row;
        }
        if (geometry.isWithinBounds(q, r)) {
          if (hexOverlapsPolygon(q, r, vertices, geometry)) {
            selected.push({ x: q, y: r });
          }
        }
      }
    }
  }

  return selected;
}

function computeBoundaryEdges(
  hexes: Point[],
  geometry: HexGeometryLike
): Array<{ q: number; r: number; edgeIndex: number }> {
  const memberSet = new Set<string>();
  for (const h of hexes) memberSet.add(hexKey(h.x, h.y));

  const edges: Array<{ q: number; r: number; edgeIndex: number }> = [];
  for (const h of hexes) {
    const neighbors = geometry.getNeighbors(h.x, h.y);
    for (let i = 0; i < 6; i++) {
      const neighbor = neighbors[i];
      if (!memberSet.has(hexKey(neighbor.x, neighbor.y))) {
        edges.push({ q: h.x, r: h.y, edgeIndex: i });
      }
    }
  }
  return edges;
}

function chainSegments(
  segments: Array<{ x1: number; y1: number; x2: number; y2: number }>
): Array<Array<{ x: number; y: number }>> {
  if (segments.length === 0) return [];

  const EPS = 0.5;
  const remaining = segments.map((s, i) => i);
  const chains: Array<Array<{ x: number; y: number }>> = [];

  while (remaining.length > 0) {
    const chain: Array<{ x: number; y: number }> = [];
    const firstIdx = remaining.shift()!;
    const first = segments[firstIdx];
    chain.push({ x: first.x1, y: first.y1 }, { x: first.x2, y: first.y2 });

    let extended = true;
    while (extended) {
      extended = false;
      const tail = chain[chain.length - 1];
      for (let i = 0; i < remaining.length; i++) {
        const seg = segments[remaining[i]];
        if (Math.abs(seg.x1 - tail.x) < EPS && Math.abs(seg.y1 - tail.y) < EPS) {
          chain.push({ x: seg.x2, y: seg.y2 });
          remaining.splice(i, 1);
          extended = true;
          break;
        }
        if (Math.abs(seg.x2 - tail.x) < EPS && Math.abs(seg.y2 - tail.y) < EPS) {
          chain.push({ x: seg.x1, y: seg.y1 });
          remaining.splice(i, 1);
          extended = true;
          break;
        }
      }
    }
    chains.push(chain);
  }
  return chains;
}

// ── Straight-mode rendering ─────────────────────────────────────────

function renderOutlineStraight(
  ctx: CanvasRenderingContext2D,
  outline: Outline,
  geometry: HexGeometryLike,
  viewState: ViewState
): void {
  if (outline.vertices.length < 3) return;

  const screenVerts = outline.vertices.map(v =>
    geometry.worldToScreen(v.x, v.y, viewState.x, viewState.y, viewState.zoom)
  );

  if (outline.filled) {
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = outline.fillOpacity;
    ctx.fillStyle = outline.color;
    ctx.beginPath();
    ctx.moveTo(screenVerts[0].screenX, screenVerts[0].screenY);
    for (let i = 1; i < screenVerts.length; i++) {
      ctx.lineTo(screenVerts[i].screenX, screenVerts[i].screenY);
    }
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = prevAlpha;
  }

  ctx.strokeStyle = outline.color;
  ctx.lineWidth = outline.lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash(getDashPattern(outline.lineStyle));
  ctx.beginPath();
  ctx.moveTo(screenVerts[0].screenX, screenVerts[0].screenY);
  for (let i = 1; i < screenVerts.length; i++) {
    ctx.lineTo(screenVerts[i].screenX, screenVerts[i].screenY);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);
}

// ── Hex-snap-mode rendering ─────────────────────────────────────────

function renderOutlineHex(
  ctx: CanvasRenderingContext2D,
  outline: Outline,
  geometry: HexGeometryLike,
  viewState: ViewState,
  mapBounds: { maxRing?: number; maxCol?: number; maxRow?: number },
  orientation: string
): void {
  if (outline.vertices.length < 3) return;

  const enclosedHexes = findEnclosedHexes(outline.vertices, geometry, mapBounds, orientation);
  if (enclosedHexes.length === 0) return;

  const memberSet = new Set<string>();
  for (const h of enclosedHexes) memberSet.add(hexKey(h.x, h.y));

  // Fill
  if (outline.filled) {
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = outline.fillOpacity;
    ctx.fillStyle = outline.color;
    ctx.beginPath();
    for (const h of enclosedHexes) {
      const vertices = geometry.getHexVertices(h.x, h.y);
      const sv = vertices.map(v =>
        geometry.worldToScreen(v.worldX, v.worldY, viewState.x, viewState.y, viewState.zoom)
      );
      ctx.moveTo(sv[0].screenX, sv[0].screenY);
      for (let i = 1; i < sv.length; i++) ctx.lineTo(sv[i].screenX, sv[i].screenY);
      ctx.closePath();
    }
    ctx.fill();
    ctx.globalAlpha = prevAlpha;
  }

  // Stroke: for each hex, draw any edge whose neighbor is NOT in the set
  ctx.strokeStyle = outline.color;
  ctx.lineWidth = outline.lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash(getDashPattern(outline.lineStyle));

  for (const h of enclosedHexes) {
    const vertices = geometry.getHexVertices(h.x, h.y);
    const screenVerts = vertices.map(v =>
      geometry.worldToScreen(v.worldX, v.worldY, viewState.x, viewState.y, viewState.zoom)
    );
    const neighbors = geometry.getNeighbors(h.x, h.y);

    const hc = geometry.hexToWorld(h.x, h.y);
    for (let i = 0; i < 6; i++) {
      if (!memberSet.has(hexKey(neighbors[i].x, neighbors[i].y))) {
        const nc = geometry.hexToWorld(neighbors[i].x, neighbors[i].y);
        const dirX = nc.worldX - hc.worldX;
        const dirY = nc.worldY - hc.worldY;
        let bestEdge = 0, bestDot = -Infinity;
        for (let e = 0; e < 6; e++) {
          const v1 = vertices[e];
          const v2 = vertices[(e + 1) % 6];
          const emx = (v1.worldX + v2.worldX) / 2 - hc.worldX;
          const emy = (v1.worldY + v2.worldY) / 2 - hc.worldY;
          const dot = emx * dirX + emy * dirY;
          if (dot > bestDot) { bestDot = dot; bestEdge = e; }
        }
        ctx.beginPath();
        ctx.moveTo(screenVerts[bestEdge].screenX, screenVerts[bestEdge].screenY);
        ctx.lineTo(screenVerts[(bestEdge + 1) % 6].screenX, screenVerts[(bestEdge + 1) % 6].screenY);
        ctx.stroke();
      }
    }
  }
  ctx.setLineDash([]);
}

// ── Main Entry Point ────────────────────────────────────────────────

function renderOutlines(
  ctx: CanvasRenderingContext2D,
  outlines: Outline[],
  geometry: HexGeometryLike,
  viewState: ViewState,
  mapBounds: { maxRing?: number; maxCol?: number; maxRow?: number },
  orientation: string
): void {
  if (!outlines || outlines.length === 0) return;

  const sorted = [...outlines].sort((a, b) => a.order - b.order);

  for (const outline of sorted) {
    if (!outline.visible) continue;
    if (outline.snapMode === 'hex') {
      renderOutlineHex(ctx, outline, geometry, viewState, mapBounds, orientation);
    } else {
      renderOutlineStraight(ctx, outline, geometry, viewState);
    }
  }
}

return {
  renderOutlines,
  findEnclosedHexes,
  computeBoundaryEdges,
  pointInPolygon
};

/**
 * outlineRenderer.ts
 * Renders visual polygon outlines on hex maps.
 * Supports straight-line and hex-edge-snapped rendering modes.
 */

import type { Point } from '#types/core/geometry.types';
import type { Outline } from '#types/core/map.types';
import { assertNever } from '../../utils/assertNever';
import {
  computeBoundaryEdges,
  forEachHexInBounds,
  hexKey,
  pointInPolygon,
  type HexGeometryLike,
  type HexRegionBounds
} from '../hex/hexRegionMath';

/** Canvas dash patterns (on, off) in px for each outline line style. */
const OUTLINE_DASHED_PATTERN = [12, 6];
const OUTLINE_DOTTED_PATTERN = [0.5, 8];


interface ViewState {
  x: number;
  y: number;
  zoom: number;
}

function getDashPattern(lineStyle: Outline['lineStyle']): number[] {
  switch (lineStyle) {
    case 'solid': return [];
    case 'dashed': return OUTLINE_DASHED_PATTERN;
    case 'dotted': return OUTLINE_DOTTED_PATTERN;
    default: return assertNever(lineStyle);
  }
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
  mapBounds: HexRegionBounds,
  orientation: string
): Point[] {
  const selected: Point[] = [];
  // Ring 0 is not bounds-checked (forEachHexInBounds preserves that).
  forEachHexInBounds(geometry, mapBounds, orientation, (q, r) => {
    if (hexOverlapsPolygon(q, r, vertices, geometry)) selected.push({ x: q, y: r });
  });
  return selected;
}

// â”€â”€ Straight-mode rendering â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ Hex-snap-mode rendering â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ Main Entry Point â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function renderOutlines(
  ctx: CanvasRenderingContext2D,
  outlines: Outline[],
  geometry: HexGeometryLike,
  viewState: ViewState,
  mapBounds: { maxRing?: number; maxCol?: number; maxRow?: number },
  orientation: string
): void {
  if (outlines == null || outlines.length === 0) return;

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

export { renderOutlines, computeBoundaryEdges, pointInPolygon };
export type { HexGeometryLike };
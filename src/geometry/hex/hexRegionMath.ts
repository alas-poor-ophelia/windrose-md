/**
 * hexRegionMath.ts
 * Shared pure helpers for hex region/outline math: coordinate keys, boundary
 * edges, bounds iteration and point-in-polygon. Single home for what used to
 * be copied across outlineRenderer, regionRenderer and useRegionTools.
 */

import type { Point } from '#types/core/geometry.types';
import { offsetToAxial } from '../core/offsetCoordinates';

/** Minimal hex geometry surface needed by region/outline math and renderers. */
export interface HexGeometryLike {
  hexSize: number;
  orientation: string;
  hexToWorld(q: number, r: number): { worldX: number; worldY: number };
  getHexVertices(q: number, r: number): { worldX: number; worldY: number }[];
  worldToScreen(worldX: number, worldY: number, offsetX: number, offsetY: number, zoom: number): { screenX: number; screenY: number };
  getNeighbors(x: number, y: number): Point[];
  isWithinBounds(q: number, r: number): boolean;
  worldToHex?(worldX: number, worldY: number): { q: number; r: number };
}

export interface HexRegionBounds {
  maxRing?: number;
  maxCol?: number;
  maxRow?: number;
}

export interface BoundaryEdge {
  q: number;
  r: number;
  edgeIndex: number;
}

const RING_DIRECTIONS = [
  { dq: -1, dr: 1 }, { dq: -1, dr: 0 }, { dq: 0, dr: -1 },
  { dq: 1, dr: -1 }, { dq: 1, dr: 0 }, { dq: 0, dr: 1 }
] as const;

export function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}

/** Ray-casting point-in-polygon for {x, y} polygons. */
export function pointInPolygon(px: number, py: number, polygon: ReadonlyArray<{ x: number; y: number }>): boolean {
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

/**
 * Outer boundary edges of a hex set. Each edge is (hex, edgeIndex) where the
 * edge runs from vertex[i] to vertex[(i+1)%6].
 */
export function computeBoundaryEdges(
  hexes: Point[],
  geometry: Pick<HexGeometryLike, 'getNeighbors'>
): BoundaryEdge[] {
  const memberSet = new Set<string>();
  for (const h of hexes) memberSet.add(hexKey(h.x, h.y));

  const edges: BoundaryEdge[] = [];
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

/**
 * Visit every axial hex inside radial (maxRing) or rectangular (maxCol/maxRow)
 * bounds, filtered by geometry.isWithinBounds. The ring-0 center is always
 * visited (matches the original per-caller loops).
 */
export function forEachHexInBounds(
  geometry: Pick<HexGeometryLike, 'isWithinBounds'>,
  bounds: HexRegionBounds,
  orientation: string,
  callback: (q: number, r: number) => void
): void {
  if (bounds.maxRing !== undefined) {
    for (let ring = 0; ring <= bounds.maxRing; ring++) {
      if (ring === 0) {
        callback(0, 0);
        continue;
      }
      let q = ring, r = 0;
      for (const dir of RING_DIRECTIONS) {
        for (let step = 0; step < ring; step++) {
          if (geometry.isWithinBounds(q, r)) callback(q, r);
          q += dir.dq;
          r += dir.dr;
        }
      }
    }
  } else if (bounds.maxCol !== undefined && bounds.maxRow !== undefined) {
    const orient = orientation === 'flat' ? 'flat' : 'pointy';
    for (let col = 0; col <= bounds.maxCol; col++) {
      for (let row = 0; row <= bounds.maxRow; row++) {
        const { q, r } = offsetToAxial(col, row, orient);
        if (geometry.isWithinBounds(q, r)) callback(q, r);
      }
    }
  }
}

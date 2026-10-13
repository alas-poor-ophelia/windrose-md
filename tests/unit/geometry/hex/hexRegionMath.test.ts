import { describe, it, expect } from 'vitest';
import {
  hexKey,
  pointInPolygon,
  computeBoundaryEdges,
  forEachHexInBounds
} from '../../../../src/geometry/hex/hexRegionMath';

const AXIAL_DIRS = [
  { x: 1, y: 0 }, { x: 1, y: -1 }, { x: 0, y: -1 },
  { x: -1, y: 0 }, { x: -1, y: 1 }, { x: 0, y: 1 }
];
const neighborsOf = (x: number, y: number) => AXIAL_DIRS.map(d => ({ x: x + d.x, y: y + d.y }));

describe('hexRegionMath', () => {
  it('hexKey formats q,r', () => {
    expect(hexKey(2, -3)).toBe('2,-3');
  });

  it('pointInPolygon ray-casts a square', () => {
    const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(pointInPolygon(5, 5, sq)).toBe(true);
    expect(pointInPolygon(15, 5, sq)).toBe(false);
  });

  it('computeBoundaryEdges: single hex has 6 edges, adjacent pair shares none', () => {
    const geo = { getNeighbors: neighborsOf };
    expect(computeBoundaryEdges([{ x: 0, y: 0 }], geo)).toHaveLength(6);
    const pair = computeBoundaryEdges([{ x: 0, y: 0 }, { x: 1, y: 0 }], geo);
    expect(pair).toHaveLength(10);
    expect(pair[0]).toEqual({ q: 0, r: 0, edgeIndex: 1 });
  });

  it('forEachHexInBounds radial visits 1 + 3n(n+1) hexes in ring order', () => {
    const seen: string[] = [];
    forEachHexInBounds({ isWithinBounds: () => true }, { maxRing: 2 }, 'flat', (q, r) => seen.push(hexKey(q, r)));
    expect(seen).toHaveLength(19);
    expect(seen[0]).toBe('0,0');
    expect(seen[1]).toBe('1,0');
    expect(new Set(seen).size).toBe(19);
  });

  it('forEachHexInBounds rectangular converts offset coords per orientation', () => {
    const flat: string[] = [];
    forEachHexInBounds({ isWithinBounds: () => true }, { maxCol: 1, maxRow: 1 }, 'flat', (q, r) => flat.push(hexKey(q, r)));
    expect(flat).toEqual(['0,0', '0,1', '1,0', '1,1']);
    const pointy: string[] = [];
    forEachHexInBounds({ isWithinBounds: () => true }, { maxCol: 1, maxRow: 1 }, 'pointy', (q, r) => pointy.push(hexKey(q, r)));
    expect(pointy).toHaveLength(4);
    expect(pointy[0]).toBe('0,0');
    expect(pointy[2]).toBe('1,0');
  });

  it('forEachHexInBounds honours isWithinBounds filter', () => {
    const seen: string[] = [];
    forEachHexInBounds({ isWithinBounds: (q) => q >= 0 }, { maxCol: 1, maxRow: 0 }, 'flat', (q, r) => seen.push(hexKey(q, r)));
    expect(seen).toEqual(['0,0', '1,0']);
  });
});

/**
 * ladderHitTest.test.ts
 *
 * Level-aware hit-testing and placement for objects under the lattice ladder
 * (bead kgc.12). The drawn footprint (objectRenderer.calculateObjectPosition on
 * the home rung, held by elementScale) is the one hit area: a persist object
 * past its crossing keeps its held disc, a pop object below its home is not
 * hit, and rung cells of different levels never collide.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/core/settingsAccessor', () => ({
  getSettings: () => ({}),
  getObjectSettings: () => ({ objectOverrides: {}, customObjects: [], customCategories: [] }),
  getObjectSettingsForSet: () => null
}));

import type { MapData } from '#types/core/map.types';
import type { MapObject } from '#types/objects/object.types';
import { HexGeometry } from '../../../src/geometry/core/HexGeometry';
import { createGeometryLadder } from '../../../src/geometry/core/createGeometryLadder';
import { crossingZoom } from '../../../src/geometry/core/lattice';
import { scaledSizeForRung } from '../../../src/geometry/renderers/elementBands';
import { ladderObjectFootprint, ladderFootprintContains, pickLadderObject } from '../../../src/objects/ladderHitTest';
import { getObjectsInCell, canAddObjectToCell, getClickedObjectInCell, classicHitRung } from '../../../src/objects/hexSlotPositioner';
import { placeObject, placeObjectFreeform, canPlaceObjectAt, eraseObjectAt, getObjectAtPosition, removeObjectFromHex, isAreaFree, removeObjectsInRectangle, removeObjectAtPosition, addObject, canResizeObject } from '../../../src/objects/objectOperations';
import { findTileHitInLayers, tileHitsCell } from '../../../src/assets/tileFootprint';
import type { TileAssignment } from '#types/tiles/tile.types';
import type { MapLayer } from '#types/core/map.types';
import { calculateObjectScreenPosition } from '../../../src/objects/screenPositionUtils';

const PARAMS = { m: 4, minCellPx: 64, maxLevel: 3 };
const root = new HexGeometry(80, 'flat', null);
const ladder = createGeometryLadder(root, PARAMS);
const rung2 = ladder.geometryForLevel(2);

const ZOOM_RUNG2 = 8; // past crossingZoom(2) = 6.4, before crossingZoom(3) = 25.6

function obj(over: Partial<MapObject> & { id: string }): MapObject {
  return { type: 'entrance', position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, ...over } as MapObject;
}

function view(zoom: number): { ladder: typeof ladder; level: number; zoom: number; orientation: 'flat' } {
  return { ladder, level: ladder.activeLevel(zoom), zoom, orientation: 'flat' };
}

/** Centre of a footprint in world px. */
function centreWorld(rect: { screenX: number; screenY: number; objectWidth: number; objectHeight: number }, zoom: number): { x: number; y: number } {
  return { x: (rect.screenX + rect.objectWidth / 2) / zoom, y: (rect.screenY + rect.objectHeight / 2) / zoom };
}

describe('ladderObjectFootprint', () => {
  it('activates rung 2 at the test zoom', () => {
    expect(crossingZoom(2, { ...PARAMS, hexSize: 80 })).toBeCloseTo(6.4, 9);
    expect(ladder.activeLevel(ZOOM_RUNG2)).toBe(2);
  });

  it('holds a persist root object at the size it had when rung 1 activated', () => {
    const entrance = obj({ id: 'a' });
    const rect = ladderObjectFootprint(entrance, [entrance], view(ZOOM_RUNG2));
    expect(rect).not.toBeNull();
    // Unheld width would be the root cell at zoom 8; held = that * crossingZoom(1) / zoom.
    const unheld = scaledSizeForRung(ladder, 0, ZOOM_RUNG2);
    const hold = crossingZoom(1, { ...PARAMS, hexSize: 80 }) / ZOOM_RUNG2;
    expect(rect!.objectWidth).toBeCloseTo(unheld * hold, 6);
    expect(rect!.objectWidth).toBeLessThan(unheld);
  });

  it('is the full cell footprint at the home rung (no hold below the crossing)', () => {
    const entrance = obj({ id: 'a' });
    const rect = ladderObjectFootprint(entrance, [entrance], view(1));
    expect(rect!.objectWidth).toBeCloseTo(scaledSizeForRung(ladder, 0, 1), 6);
  });

  it('is null for a pop object finer than its home, and for one under the pixel floor', () => {
    const pop = obj({ id: 'p', depthMode: 'pop' });
    expect(ladderObjectFootprint(pop, [pop], view(ZOOM_RUNG2))).toBeNull();
    expect(ladderObjectFootprint(pop, [pop], view(1))).not.toBeNull();
    const deep = obj({ id: 'd', homeLevel: 3 });
    // A rung-3 cell at zoom 1 is 80/64*2 px wide: under OBJECT_FLOOR_PX.
    expect(ladderObjectFootprint(deep, [deep], view(1))).toBeNull();
  });

  it('places a deep object on its own rung geometry', () => {
    const deep = obj({ id: 'd', homeLevel: 2, position: { x: 3, y: -1 } });
    const rect = ladderObjectFootprint(deep, [deep], view(ZOOM_RUNG2));
    expect(rect).not.toBeNull();
    const centre = centreWorld(rect!, ZOOM_RUNG2);
    const cell = rung2.getCellCenter(3, -1);
    expect(centre.x).toBeCloseTo(cell.worldX, 6);
    expect(centre.y).toBeCloseTo(cell.worldY, 6);
    expect(rect!.objectWidth).toBeCloseTo(scaledSizeForRung(ladder, 2, ZOOM_RUNG2), 6);
  });
});

describe('pickLadderObject', () => {
  it('hits inside the held disc and misses beside it in the same root hex', () => {
    const entrance = obj({ id: 'a' });
    const v = view(ZOOM_RUNG2);
    const rect = ladderObjectFootprint(entrance, [entrance], v)!;
    const c = centreWorld(rect, ZOOM_RUNG2);
    expect(pickLadderObject([entrance], c.x, c.y, v)?.id).toBe('a');
    // Just outside the held box but well inside the unheld cell.
    const beside = c.x + (rect.objectWidth / 2 + 2) / ZOOM_RUNG2;
    expect(beside).toBeLessThan(c.x + scaledSizeForRung(ladder, 0, ZOOM_RUNG2) / 2 / ZOOM_RUNG2);
    expect(pickLadderObject([entrance], beside, c.y, v)).toBeNull();
    // At the home rung the same offset is inside the unheld footprint.
    const v0 = view(1);
    const rect0 = ladderObjectFootprint(entrance, [entrance], v0)!;
    const c0 = centreWorld(rect0, 1);
    expect(pickLadderObject([entrance], c0.x + rect.objectWidth / 2 / ZOOM_RUNG2 + 2, c0.y, v0)?.id).toBe('a');
  });

  it('never picks a hidden pop object', () => {
    const pop = obj({ id: 'p', depthMode: 'pop' });
    const rect = ladderObjectFootprint(pop, [pop], view(1))!;
    const c = centreWorld(rect, 1);
    expect(pickLadderObject([pop], c.x, c.y, view(1))?.id).toBe('p');
    expect(pickLadderObject([pop], c.x, c.y, view(ZOOM_RUNG2))).toBeNull();
  });

  it('picks a deep object at its rung cell, and not at the same index on the root', () => {
    const deep = obj({ id: 'd', homeLevel: 2, position: { x: 3, y: -1 } });
    const v = view(ZOOM_RUNG2);
    const deepCentre = rung2.getCellCenter(3, -1);
    expect(pickLadderObject([deep], deepCentre.worldX, deepCentre.worldY, v)?.id).toBe('d');
    const rootCentre = root.getCellCenter(3, -1);
    expect(pickLadderObject([deep], rootCentre.worldX, rootCentre.worldY, v)).toBeNull();
  });

  it('keeps the last-drawn object when footprints overlap', () => {
    const under = obj({ id: 'under' });
    const over = obj({ id: 'over', homeLevel: 1 }); // rung-1 cell (0,0) shares the root's origin
    const v = view(ZOOM_RUNG2);
    const c = centreWorld(ladderObjectFootprint(over, [under, over], v)!, ZOOM_RUNG2);
    expect(pickLadderObject([under, over], c.x, c.y, v)?.id).toBe('over');
  });

  it('fogged top footprint skipped; the visible object beneath is picked', () => {
    const v = view(ZOOM_RUNG2);
    // Fog every root hex except (0,0).
    const origin = root.toOffsetCoords(0, 0);
    const layer = { id: 'L', fogOfWar: { enabled: true } } as unknown as MapLayer;
    const isCellFogged = (_l: MapLayer, col: number, row: number): boolean => !(col === origin.col && row === origin.row);
    const inRootOrigin = (q: number, r: number): boolean => {
      const centre = rung2.getCellCenter(q, r);
      const container = root.worldToGrid(centre.worldX, centre.worldY);
      return container.x === 0 && container.y === 0;
    };
    // A 3x3 rung-2 object `under` homed inside root (0,0) (visible) and a nearby
    // rung-2 object `over` homed outside it (fogged), drawn later in the same depth
    // group, with over's footprint centre inside under's footprint.
    let found: { under: MapObject; over: MapObject; at: { x: number; y: number } } | null = null;
    const dirs: number[][] = [];
    for (let dq = -2; dq <= 2; dq++) for (let dr = -2; dr <= 2; dr++) if (dq !== 0 || dr !== 0) dirs.push([dq, dr]);
    for (let q = -20; q <= 20 && found === null; q++) {
      for (let r = -20; r <= 20 && found === null; r++) {
        if (!inRootOrigin(q, r)) continue;
        for (const [dq, dr] of dirs) {
          if (inRootOrigin(q + dq, r + dr)) continue;
          const under = obj({ id: 'under', homeLevel: 2, position: { x: q, y: r }, size: { width: 3, height: 3 } });
          const over = obj({ id: 'over', homeLevel: 2, position: { x: q + dq, y: r + dr } });
          const overRect = ladderObjectFootprint(over, [under, over], v);
          if (overRect === null) continue;
          const at = centreWorld(overRect, ZOOM_RUNG2);
          if (!ladderFootprintContains(under, [under, over], at.x, at.y, v)) continue;
          found = { under, over, at };
          break;
        }
      }
    }
    expect(found).not.toBeNull();
    const { under, over, at } = found!;
    const objects = [under, over];
    // Without fog the object drawn on top wins; with fog it is skipped.
    expect(pickLadderObject(objects, at.x, at.y, v)?.id).toBe('over');
    expect(pickLadderObject(objects, at.x, at.y, v, { layer, isCellFogged })?.id).toBe('under');
  });
});

describe('ladderFootprintContains', () => {
  it('is the held footprint, not the cell: group drag grabs what is drawn', () => {
    const entrance = obj({ id: 'a' });
    const v = view(ZOOM_RUNG2);
    const rect = ladderObjectFootprint(entrance, [entrance], v)!;
    const c = centreWorld(rect, ZOOM_RUNG2);
    expect(ladderFootprintContains(entrance, [entrance], c.x, c.y, v)).toBe(true);
    // Beside the held box, still inside the root cell the cell test would use
    const beside = c.x + (rect.objectWidth / 2 + 2) / ZOOM_RUNG2;
    expect(ladderFootprintContains(entrance, [entrance], beside, c.y, v)).toBe(false);
  });

  it('is false for an object that is not drawn', () => {
    const pop = obj({ id: 'p', depthMode: 'pop' });
    expect(ladderFootprintContains(pop, [pop], 0, 0, view(ZOOM_RUNG2))).toBe(false);
  });
});

describe('cell membership is per rung', () => {
  const rootA = obj({ id: 'r1' });
  const rootB = obj({ id: 'r2', slot: 1 });
  const deep = obj({ id: 'd', homeLevel: 2 });
  const all = [rootA, rootB, deep];

  it('getObjectsInCell filters by home level when asked, matches by index otherwise', () => {
    expect(getObjectsInCell(all, 0, 0).map(o => o.id)).toEqual(['r1', 'r2', 'd']);
    expect(getObjectsInCell(all, 0, 0, 0).map(o => o.id)).toEqual(['r1', 'r2']);
    expect(getObjectsInCell(all, 0, 0, 2).map(o => o.id)).toEqual(['d']);
    expect(getObjectsInCell(all, 0, 0, 1)).toEqual([]);
  });

  it('a full root cell does not block the same index on another rung', () => {
    const full = [0, 1, 2, 3].map(slot => obj({ id: `r${slot}`, slot }));
    expect(canAddObjectToCell(full, 0, 0, 0)).toBe(false);
    expect(canAddObjectToCell(full, 0, 0, 2)).toBe(true);
    expect(canPlaceObjectAt(full, 0, 0, 'hex', 0)).toBe(false);
    expect(canPlaceObjectAt(full, 0, 0, 'hex', 2)).toBe(true);
  });

  it('getObjectAtPosition and isAreaFree honour the rung', () => {
    expect(getObjectAtPosition([deep], 0, 0, 0)).toBeNull();
    expect(getObjectAtPosition([deep], 0, 0, 2)?.id).toBe('d');
    expect(getObjectAtPosition([deep], 0, 0)?.id).toBe('d');
    expect(isAreaFree([deep], 0, 0, 1, 1, null, 0)).toBe(true);
    expect(isAreaFree([deep], 0, 0, 1, 1, null, 2)).toBe(false);
  });
});

describe('placement stamps the home rung', () => {
  it('writes homeLevel only above the root', () => {
    const atRoot = placeObject([], 'entrance', 0, 0, { mapType: 'hex', homeLevel: 0 });
    expect(atRoot.success).toBe(true);
    expect('homeLevel' in atRoot.object!).toBe(false);
    const absent = placeObject([], 'entrance', 0, 0, { mapType: 'hex' });
    expect('homeLevel' in absent.object!).toBe(false);
    const deep = placeObject([], 'entrance', 3, -1, { mapType: 'hex', homeLevel: 2 });
    expect(deep.object?.homeLevel).toBe(2);
    expect(deep.object?.slot).toBe(0);
  });

  it('assigns slots within the rung, not across rungs', () => {
    const rootFull = [0, 1, 2, 3].map(slot => obj({ id: `r${slot}`, slot }));
    const result = placeObject(rootFull, 'entrance', 0, 0, { mapType: 'hex', homeLevel: 1 });
    expect(result.success).toBe(true);
    expect(result.object?.slot).toBe(0);
    expect(result.object?.homeLevel).toBe(1);
  });

  it('freeform placement carries the rung', () => {
    const r = placeObjectFreeform([], 'entrance', 12, 34, { x: 0, y: 0 }, 'hex', undefined, 2);
    expect(r.object?.homeLevel).toBe(2);
    expect(r.object?.freeform).toBe(true);
    const r0 = placeObjectFreeform([], 'entrance', 12, 34, { x: 0, y: 0 }, 'hex', undefined, 0);
    expect('homeLevel' in r0.object!).toBe(false);
  });

  it('erase and removal stay on the rung', () => {
    const rootA = obj({ id: 'r', slot: 0 });
    const deep = obj({ id: 'd', homeLevel: 2, slot: 0 });
    const erased = eraseObjectAt([rootA, deep], 0, 0, 'hex', 2);
    expect(erased.success).toBe(true);
    expect(erased.objects.map(o => o.id)).toEqual(['r']);
    expect(eraseObjectAt([rootA, deep], 0, 0, 'hex', 1).success).toBe(false);
    // Removing a root object reorganises root slots only: the deep slot is untouched.
    const rootB = obj({ id: 'r2', slot: 1 });
    const deepB = obj({ id: 'd2', homeLevel: 2, slot: 1 });
    const after = removeObjectFromHex([rootA, rootB, deep, deepB], 'r');
    expect(after.find(o => o.id === 'r2')?.slot).toBe(0);
    expect(after.find(o => o.id === 'd2')?.slot).toBe(1);
  });
});

describe('level-0 erase paths never reach another rung (review fixes)', () => {
  const rootA = obj({ id: 'r', position: { x: 1, y: 1 } });
  const deep = obj({ id: 'd', homeLevel: 2, position: { x: 1, y: 1 } });

  it('removeObjectsInRectangle scoped to level 0 spares deep objects at the same index', () => {
    expect(removeObjectsInRectangle([rootA, deep], 0, 0, 2, 2, 0).map(o => o.id)).toEqual(['d']);
    expect(removeObjectsInRectangle([rootA, deep], 0, 0, 2, 2).map(o => o.id)).toEqual([]);
  });

  it('removeObjectAtPosition scoped to a rung', () => {
    expect(removeObjectAtPosition([rootA, deep], 1, 1, 0).map(o => o.id)).toEqual(['d']);
    expect(removeObjectAtPosition([rootA, deep], 1, 1, 2).map(o => o.id)).toEqual(['r']);
    expect(removeObjectAtPosition([rootA, deep], 1, 1)).toEqual([]);
  });

  it('a root-only add (note pins) is not blocked by a deep object sharing the index', () => {
    const next = addObject([deep], 'note_pin', 1, 1, 'hex');
    expect(next.length).toBe(2);
    expect('homeLevel' in next[1]).toBe(false);
  });

  it('canResizeObject checks overlap on the object\'s own rung', () => {
    const wide = obj({ id: 'w', homeLevel: 2, position: { x: 0, y: 0 } });
    const rootNeighbour = obj({ id: 'n', position: { x: 1, y: 0 } });
    const deepNeighbour = obj({ id: 'dn', homeLevel: 2, position: { x: 1, y: 0 } });
    expect(canResizeObject([wide, rootNeighbour], 'w', 2, 1)).toBe(true);
    expect(canResizeObject([wide, deepNeighbour], 'w', 2, 1)).toBe(false);
  });

  it('tile hits by cell honour the rung', () => {
    const rootTile = { id: 't0', col: 4, row: 2, tilesetId: 's', tileId: 't', placement: 'fill' } as unknown as TileAssignment;
    const deepTile = { id: 't2', col: 4, row: 2, tilesetId: 's', tileId: 't', placement: 'fill', homeLevel: 2 } as unknown as TileAssignment;
    expect(tileHitsCell(deepTile, 4, 2)).toBe(true);
    expect(tileHitsCell(deepTile, 4, 2, 0)).toBe(false);
    expect(tileHitsCell(deepTile, 4, 2, 2)).toBe(true);
    const layer = { id: 'L', tiles: [deepTile, rootTile] } as unknown as MapLayer;
    expect(findTileHitInLayers([layer], 4, 2, 0)?.index).toBe(1);
    expect(findTileHitInLayers([layer], 4, 2, 2)?.index).toBe(0);
    expect(findTileHitInLayers([{ id: 'L', tiles: [deepTile] } as unknown as MapLayer], 4, 2, 0)).toBeNull();
  });
});

describe('calculateObjectScreenPosition under the ladder', () => {
  const W = 1000;
  const H = 800;
  const canvas = {
    width: W,
    height: H,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: W, height: H }),
    parentElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: W, height: H }) }
  } as unknown as HTMLCanvasElement;

  function mapWith(objects: MapObject[], zoom: number): MapData {
    return {
      mapType: 'hex', hexSize: 80, orientation: 'flat',
      viewState: { zoom, center: { x: 0, y: 0 } },
      layers: [{ id: 'L1', name: '1', order: 0, visible: true, cells: [], curves: [], edges: [], objects, textLabels: [], fogOfWar: null }],
      activeLayerId: 'L1'
    } as unknown as MapData;
  }

  it('anchors a held persist object on its held footprint', () => {
    const entrance = obj({ id: 'a' });
    const pos = calculateObjectScreenPosition(entrance, canvas, mapWith([entrance], ZOOM_RUNG2), root, null, ladder);
    expect(pos).not.toBeNull();
    const rect = ladderObjectFootprint(entrance, [entrance], view(ZOOM_RUNG2))!;
    expect(pos!.objectWidth).toBeCloseTo(rect.objectWidth, 6);
    expect(pos!.screenX).toBeCloseTo(W / 2 + rect.screenX + rect.objectWidth / 2, 6);
    expect(pos!.screenY).toBeCloseTo(H / 2 + rect.screenY + rect.objectHeight / 2, 6);
  });

  it('has no anchor for a hidden pop object', () => {
    const pop = obj({ id: 'p', depthMode: 'pop' });
    expect(calculateObjectScreenPosition(pop, canvas, mapWith([pop], ZOOM_RUNG2), root, null, ladder)).toBeNull();
    expect(calculateObjectScreenPosition(pop, canvas, mapWith([pop], 1), root, null, ladder)).not.toBeNull();
  });

  it('is unchanged without a ladder', () => {
    const entrance = obj({ id: 'a' });
    const classic = calculateObjectScreenPosition(entrance, canvas, mapWith([entrance], ZOOM_RUNG2), root, null);
    expect(classic!.objectWidth).toBeCloseTo(80 * ZOOM_RUNG2, 6);
  });
});

describe('classicHitRung: classic-branch index hit-tests on a lod map (cross-model review item 2)', () => {
  const at = (id: string, homeLevel?: number): MapObject =>
    ({ id, type: 'entrance', position: { x: 3, y: -1 }, size: { width: 1, height: 1 }, ...(homeLevel !== undefined ? { homeLevel } : {}) } as MapObject);
  const deepFirst = [at('deep', 2), at('root')];

  it('is undefined without lod (unscoped, byte-identical to main) and 0 with lod', () => {
    expect(classicHitRung(null)).toBeUndefined();
    expect(classicHitRung({} as MapData)).toBeUndefined();
    expect(classicHitRung({ lod: null } as unknown as MapData)).toBeUndefined();
    expect(classicHitRung({ lod: { m: 4, minCellPx: 64, maxLevel: 3 } } as MapData)).toBe(0);
  });

  it('without lod the index match still finds the first object at the index, any rung', () => {
    const scope = classicHitRung({} as MapData);
    expect(getObjectAtPosition(deepFirst, 3, -1, scope)?.id).toBe('deep');
    expect(getObjectsInCell(deepFirst, 3, -1, scope).map(o => o.id)).toEqual(['deep', 'root']);
  });

  it('with lod a rung-2 object at the same index is neither hit, listed nor clicked', () => {
    const scope = classicHitRung({ lod: { m: 4, minCellPx: 64, maxLevel: 3 } } as MapData);
    expect(getObjectAtPosition(deepFirst, 3, -1, scope)?.id).toBe('root');
    expect(getObjectsInCell(deepFirst, 3, -1, scope).map(o => o.id)).toEqual(['root']);
    expect(getClickedObjectInCell(deepFirst, 3, -1, 0, 0, 'flat', scope)?.id).toBe('root');
    expect(getObjectAtPosition([at('deep', 2)], 3, -1, scope)).toBeNull();
  });
});

describe('explicit visibleLevels (kgc.31)', () => {
  it('an object limited to rung 2 is not pickable at rung 1, though Auto would show it there', () => {
    const zoomRung1 = 3; // between crossingZoom(1) and crossingZoom(2)
    expect(view(zoomRung1).level).toBe(1);
    const auto = obj({ id: 'auto', homeLevel: 2 });
    const pinned = obj({ id: 'pinned', homeLevel: 2, visibleLevels: [2] });
    expect(ladderObjectFootprint(auto, [auto], view(zoomRung1))).not.toBeNull();
    expect(ladderObjectFootprint(pinned, [pinned], view(zoomRung1))).toBeNull();
    expect(ladderObjectFootprint(pinned, [pinned], view(ZOOM_RUNG2))).not.toBeNull();
  });
});

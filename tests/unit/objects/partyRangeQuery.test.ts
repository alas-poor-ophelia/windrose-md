/**
 * partyRangeQuery Unit Tests
 */

import { describe, it, expect } from 'vitest';

import type { MapData, PartyPin } from '#types/core/map.types';
import type { MapObject } from '#types/objects/object.types';
import type { DiagonalRule } from '#types/settings/settings.types';

import { queryPartyRange, noteDisplayName } from '../../../src/objects/partyRangeQuery';
import { GridGeometry } from '../../../src/geometry/core/GridGeometry';
import { HexGeometry } from '../../../src/geometry/core/HexGeometry';

const geometry = new GridGeometry(32);

function makeObject(overrides: Partial<MapObject>): MapObject {
  return {
    id: overrides.id ?? 'obj-' + Math.random().toString(36).slice(2),
    type: 'note_pin',
    position: { x: 0, y: 0 },
    size: 'medium',
    ...overrides
  } as MapObject;
}

function makeMapData(objects: MapObject[], secondLayerObjects: MapObject[] = []): MapData {
  return {
    layers: [
      { id: 'layer-one', objects },
      { id: 'layer-two', objects: secondLayerObjects }
    ]
  } as unknown as MapData;
}

function makePin(x: number, y: number): PartyPin {
  return { id: 'party-test', position: { x, y }, label: 'The Party', color: '#c4a57b', range: 30, rangeStyle: 'circle' };
}

const settings = (rangeInCells: number, diagonalRule: DiagonalRule = 'equal') => ({
  rangeInCells,
  distancePerCell: 5,
  distanceUnit: 'ft',
  diagonalRule,
  displayFormat: 'units' as const
});

describe('noteDisplayName', () => {
  it('strips folders and the md extension', () => {
    expect(noteDisplayName('World/Places/Ravenwatch.md')).toBe('Ravenwatch');
    expect(noteDisplayName('Tavern.md')).toBe('Tavern');
  });
});

describe('queryPartyRange', () => {
  it('returns linked notes within range with map-rule distances', () => {
    const mapData = makeMapData([
      makeObject({ id: 'a', position: { x: 13, y: 10 }, linkedNote: 'Places/Tavern.md' }),
      makeObject({ id: 'b', position: { x: 20, y: 10 }, linkedNote: 'Places/Keep.md' })
    ]);
    const { linked } = queryPartyRange(mapData, geometry, makePin(10, 10), settings(4));
    expect(linked).toHaveLength(1);
    expect(linked[0].notePath).toBe('Places/Tavern.md');
    expect(linked[0].displayName).toBe('Tavern');
    expect(linked[0].distanceInCells).toBe(3);
    expect(linked[0].distanceLabel).toBe('15 ft');
  });

  it('deduplicates markers linking the same note at minimum distance', () => {
    const mapData = makeMapData([
      makeObject({ id: 'far', position: { x: 14, y: 10 }, linkedNote: 'Camp.md' }),
      makeObject({ id: 'near', position: { x: 11, y: 10 }, linkedNote: 'Camp.md' })
    ]);
    const { linked } = queryPartyRange(mapData, geometry, makePin(10, 10), settings(6));
    expect(linked).toHaveLength(1);
    expect(linked[0].distanceInCells).toBe(1);
    expect(linked[0].sourceObjectId).toBe('near');
  });

  it('collects labeled unlinked markers separately and ignores unlabeled ones', () => {
    const mapData = makeMapData([
      makeObject({ id: 'labeled', position: { x: 12, y: 10 }, customTooltip: 'Old Well' }),
      makeObject({ id: 'silent', position: { x: 11, y: 10 } })
    ]);
    const { linked, unlinked } = queryPartyRange(mapData, geometry, makePin(10, 10), settings(4));
    expect(linked).toHaveLength(0);
    expect(unlinked).toHaveLength(1);
    expect(unlinked[0].label).toBe('Old Well');
  });

  it('sorts results nearest-first', () => {
    const mapData = makeMapData([
      makeObject({ position: { x: 14, y: 10 }, linkedNote: 'Far.md' }),
      makeObject({ position: { x: 11, y: 10 }, linkedNote: 'Near.md' }),
      makeObject({ position: { x: 12, y: 10 }, linkedNote: 'Mid.md' })
    ]);
    const { linked } = queryPartyRange(mapData, geometry, makePin(10, 10), settings(6));
    expect(linked.map(r => r.displayName)).toEqual(['Near', 'Mid', 'Far']);
  });

  it('spans all layers', () => {
    const mapData = makeMapData(
      [makeObject({ position: { x: 11, y: 10 }, linkedNote: 'LayerOne.md' })],
      [makeObject({ position: { x: 12, y: 10 }, linkedNote: 'LayerTwo.md' })]
    );
    const { linked } = queryPartyRange(mapData, geometry, makePin(10, 10), settings(4));
    expect(linked.map(r => r.displayName)).toEqual(['LayerOne', 'LayerTwo']);
  });

  it('honors the diagonal rule at the range boundary', () => {
    const diagonal = makeObject({ position: { x: 12, y: 12 }, linkedNote: 'Corner.md' });
    const mapData = makeMapData([diagonal]);
    // (2,2) costs 2 under 'equal' but 3 under 'alternating'
    expect(queryPartyRange(mapData, geometry, makePin(10, 10), settings(2, 'equal')).linked).toHaveLength(1);
    expect(queryPartyRange(mapData, geometry, makePin(10, 10), settings(2, 'alternating')).linked).toHaveLength(0);
  });

  it('resolves freeform markers through world coordinates', () => {
    const freeform = makeObject({
      position: { x: 0, y: 0 },
      worldPosition: { x: 12 * 32 + 16, y: 10 * 32 + 16 },
      freeform: true,
      linkedNote: 'Freeform.md'
    });
    const { linked } = queryPartyRange(makeMapData([freeform]), geometry, makePin(10, 10), settings(4));
    expect(linked).toHaveLength(1);
    expect(linked[0].distanceInCells).toBe(2);
  });

  it("scopes to selected layers when configured", () => {
    const mapData = makeMapData(
      [makeObject({ position: { x: 11, y: 10 }, linkedNote: 'One.md' })],
      [makeObject({ position: { x: 12, y: 10 }, linkedNote: 'Two.md' })]
    );
    const pin = { ...makePin(10, 10), layerScope: { mode: 'selected' as const, layerIds: ['layer-two'] } };
    const { linked } = queryPartyRange(mapData, geometry, pin, settings(4));
    expect(linked.map(r => r.displayName)).toEqual(['Two']);
  });

  it('degrades to all layers when the selected layers no longer exist', () => {
    const mapData = makeMapData(
      [makeObject({ position: { x: 11, y: 10 }, linkedNote: 'One.md' })],
      [makeObject({ position: { x: 12, y: 10 }, linkedNote: 'Two.md' })]
    );
    const pin = { ...makePin(10, 10), layerScope: { mode: 'selected' as const, layerIds: ['layer-deleted'] } };
    const { linked } = queryPartyRange(mapData, geometry, pin, settings(4));
    expect(linked).toHaveLength(2);
  });

  it('filters linked notes by tag', () => {
    const mapData = makeMapData([
      makeObject({ position: { x: 11, y: 10 }, linkedNote: 'Town.md' }),
      makeObject({ position: { x: 12, y: 10 }, linkedNote: 'Lair.md' })
    ]);
    const pin = { ...makePin(10, 10), filters: { tags: ['settlement'] } };
    const metadata = (path: string) =>
      path === 'Town.md'
        ? { tags: ['settlement', 'visited'], frontmatter: {} }
        : { tags: ['dungeon'], frontmatter: {} };
    const { linked } = queryPartyRange(mapData, geometry, pin, { ...settings(4), noteMetadata: metadata });
    expect(linked.map(r => r.displayName)).toEqual(['Town']);
  });

  it('filters by frontmatter property with multiple accepted values', () => {
    const mapData = makeMapData([
      makeObject({ position: { x: 11, y: 10 }, linkedNote: 'A.md' }),
      makeObject({ position: { x: 12, y: 10 }, linkedNote: 'B.md' }),
      makeObject({ position: { x: 13, y: 10 }, linkedNote: 'C.md' })
    ]);
    const pin = { ...makePin(10, 10), filters: { properties: { status: ['active', 'rumored'] } } };
    const metadata = (path: string) => ({
      tags: [],
      frontmatter: path === 'A.md' ? { status: 'active' } : path === 'B.md' ? { status: 'cleared' } : {}
    });
    const { linked } = queryPartyRange(mapData, geometry, pin, { ...settings(4), noteMetadata: metadata });
    expect(linked.map(r => r.displayName)).toEqual(['A']);
  });

  it('requires every configured property but only one tag', () => {
    const mapData = makeMapData([
      makeObject({ position: { x: 11, y: 10 }, linkedNote: 'Both.md' }),
      makeObject({ position: { x: 12, y: 10 }, linkedNote: 'OneProp.md' })
    ]);
    const pin = {
      ...makePin(10, 10),
      filters: { properties: { status: ['active'], region: ['north'] } }
    };
    const metadata = (path: string) => ({
      tags: [],
      frontmatter: path === 'Both.md'
        ? { status: 'active', region: 'north' }
        : { status: 'active' }
    });
    const { linked } = queryPartyRange(mapData, geometry, pin, { ...settings(4), noteMetadata: metadata });
    expect(linked.map(r => r.displayName)).toEqual(['Both']);
  });

  it('drops unresolvable notes when filters are configured, keeps them otherwise', () => {
    const mapData = makeMapData([
      makeObject({ position: { x: 11, y: 10 }, linkedNote: 'Ghost.md' })
    ]);
    const noMeta = () => null;
    const unfiltered = queryPartyRange(mapData, geometry, makePin(10, 10), { ...settings(4), noteMetadata: noMeta });
    expect(unfiltered.linked).toHaveLength(1);
    const pin = { ...makePin(10, 10), filters: { tags: ['any'] } };
    const filtered = queryPartyRange(mapData, geometry, pin, { ...settings(4), noteMetadata: noMeta });
    expect(filtered.linked).toHaveLength(0);
  });

  it('uses hex distance on hex maps', () => {
    const hexGeometry = new HexGeometry(40, 'pointy');
    const mapData = makeMapData([
      makeObject({ position: { x: 2, y: 0 }, linkedNote: 'TwoAway.md' }),
      makeObject({ position: { x: 2, y: 1 }, linkedNote: 'ThreeAway.md' })
    ]);
    const { linked } = queryPartyRange(mapData, hexGeometry, makePin(0, 0), settings(2));
    expect(linked.map(r => r.displayName)).toEqual(['TwoAway']);
  });
});

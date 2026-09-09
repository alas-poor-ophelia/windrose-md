/**
 * partyPinOperations Unit Tests
 */

import { describe, it, expect } from 'vitest';

import {
  PARTY_PIN_DEFAULTS,
  PARTY_PIN_PALETTE,
  isValidRange,
  findPartyPinAt,
  getPartyPinsAt,
  canAddPartyPinToCell,
  getPartyPinIconPlacement,
  findPartyPinAtWorld,
  getPartyPinById,
  createPartyPin,
  nextPartyPinDefaults,
  upsertPartyPin,
  movePartyPin,
  updatePartyPin,
  removePartyPin,
  resolvePinIconGlyph,
  parseTagFilters,
  formatTagFilters,
  parsePropertyFilters,
  formatPropertyFilters,
} from '../../../src/objects/partyPinOperations';
import { GridGeometry } from '../../../src/geometry/core/GridGeometry';
import { HexGeometry } from '../../../src/geometry/core/HexGeometry';

describe('isValidRange', () => {
  it('accepts positive finite numbers', () => {
    expect(isValidRange(5)).toBe(true);
    expect(isValidRange(0.5)).toBe(true);
  });

  it('rejects zero, negatives, and non-finite values', () => {
    expect(isValidRange(0)).toBe(false);
    expect(isValidRange(-10)).toBe(false);
    expect(isValidRange(NaN)).toBe(false);
    expect(isValidRange(Infinity)).toBe(false);
  });
});

describe('createPartyPin', () => {
  it('creates a pin with defaults at the given position', () => {
    const pin = createPartyPin({ x: 4, y: 7 });
    expect(pin.position).toEqual({ x: 4, y: 7 });
    expect(pin.label).toBe(PARTY_PIN_DEFAULTS.label);
    expect(pin.color).toBe(PARTY_PIN_DEFAULTS.color);
    expect(pin.range).toBe(PARTY_PIN_DEFAULTS.range);
    expect(pin.rangeStyle).toBe(PARTY_PIN_DEFAULTS.rangeStyle);
    expect(pin.id).toMatch(/^party-/);
  });

  it('applies overrides and copies the position', () => {
    const position = { x: 1, y: 2 };
    const pin = createPartyPin(position, { label: 'Scouts', range: 60, rangeStyle: 'cells' });
    expect(pin.label).toBe('Scouts');
    expect(pin.range).toBe(60);
    expect(pin.rangeStyle).toBe('cells');
    expect(pin.position).not.toBe(position);
  });

  it('falls back to the default range when the override is invalid', () => {
    expect(createPartyPin({ x: 0, y: 0 }, { range: -5 }).range).toBe(PARTY_PIN_DEFAULTS.range);
    expect(createPartyPin({ x: 0, y: 0 }, { range: NaN }).range).toBe(PARTY_PIN_DEFAULTS.range);
  });

  it('generates unique ids', () => {
    const a = createPartyPin({ x: 0, y: 0 });
    const b = createPartyPin({ x: 0, y: 0 });
    expect(a.id).not.toBe(b.id);
  });
});

describe('nextPartyPinDefaults', () => {
  it('gives the first pin "The Party" and the default color', () => {
    expect(nextPartyPinDefaults([])).toEqual({
      label: PARTY_PIN_DEFAULTS.label,
      color: PARTY_PIN_DEFAULTS.color,
    });
    expect(nextPartyPinDefaults(undefined)).toEqual({
      label: PARTY_PIN_DEFAULTS.label,
      color: PARTY_PIN_DEFAULTS.color,
    });
  });

  it('gives the second pin "Beacon 2" and the second palette color', () => {
    const first = createPartyPin({ x: 0, y: 0 });
    expect(nextPartyPinDefaults([first])).toEqual({
      label: 'Beacon 2',
      color: PARTY_PIN_PALETTE[1],
    });
  });

  it('skips labels already in use, so re-adding after a delete never duplicates', () => {
    const first = createPartyPin({ x: 0, y: 0 });
    const beacon3 = createPartyPin({ x: 1, y: 1 }, { label: 'Beacon 3' });
    // Only two pins remain, but "Beacon 2" is free and "Beacon 3" is taken.
    const defaults = nextPartyPinDefaults([first, beacon3]);
    expect(defaults.label).toBe('Beacon 4');
  });

  it('avoids colors already used by existing pins', () => {
    const first = createPartyPin({ x: 0, y: 0 });
    const second = createPartyPin({ x: 1, y: 1 }, { label: 'Beacon 2', color: PARTY_PIN_PALETTE[1] });
    const defaults = nextPartyPinDefaults([first, second]);
    expect(defaults.color).toBe(PARTY_PIN_PALETTE[2]);
  });

  it('cycles colors by pin count once the palette is exhausted', () => {
    const pins = PARTY_PIN_PALETTE.map((color, i) =>
      createPartyPin({ x: i, y: 0 }, { label: `Pin ${i}`, color })
    );
    const defaults = nextPartyPinDefaults(pins);
    expect(defaults.color).toBe(PARTY_PIN_PALETTE[pins.length % PARTY_PIN_PALETTE.length]);
  });
});

describe('findPartyPinAt', () => {
  it('returns the pin occupying a cell', () => {
    const first = createPartyPin({ x: 1, y: 2 });
    const second = createPartyPin({ x: 4, y: 5 });
    expect(findPartyPinAt([first, second], { x: 4, y: 5 })).toBe(second);
  });

  it('returns null for a free cell or an empty map', () => {
    const pin = createPartyPin({ x: 1, y: 2 });
    expect(findPartyPinAt([pin], { x: 2, y: 1 })).toBeNull();
    expect(findPartyPinAt([], { x: 0, y: 0 })).toBeNull();
    expect(findPartyPinAt(undefined, { x: 0, y: 0 })).toBeNull();
  });
});

describe('getPartyPinById', () => {
  it('returns the pin with the given id', () => {
    const first = createPartyPin({ x: 0, y: 0 });
    const second = createPartyPin({ x: 3, y: 3 });
    expect(getPartyPinById([first, second], second.id)).toBe(second);
  });

  it('returns null for unknown, empty, or missing ids', () => {
    const pin = createPartyPin({ x: 0, y: 0 });
    expect(getPartyPinById([pin], 'party-nope')).toBeNull();
    expect(getPartyPinById([pin], '')).toBeNull();
    expect(getPartyPinById([pin], null)).toBeNull();
    expect(getPartyPinById(undefined, pin.id)).toBeNull();
  });
});

describe('upsertPartyPin', () => {
  it('appends a new pin without mutating the original array', () => {
    const pins: ReturnType<typeof createPartyPin>[] = [];
    const pin = createPartyPin({ x: 0, y: 0 });
    const result = upsertPartyPin(pins, pin);
    expect(result).toEqual([pin]);
    expect(pins).toEqual([]);
  });

  it('replaces an existing pin by id', () => {
    const pin = createPartyPin({ x: 0, y: 0 });
    const updated = { ...pin, label: 'Vanguard' };
    const result = upsertPartyPin([pin], updated);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Vanguard');
  });
});

describe('movePartyPin', () => {
  it('moves the matching pin to a new position copy', () => {
    const pin = createPartyPin({ x: 0, y: 0 });
    const target = { x: 9, y: 3 };
    const result = movePartyPin([pin], pin.id, target);
    expect(result[0].position).toEqual(target);
    expect(result[0].position).not.toBe(target);
    expect(pin.position).toEqual({ x: 0, y: 0 });
  });

  it('leaves the array unchanged for unknown ids', () => {
    const pin = createPartyPin({ x: 0, y: 0 });
    const result = movePartyPin([pin], 'missing', { x: 9, y: 3 });
    expect(result[0].position).toEqual({ x: 0, y: 0 });
  });
});

describe('updatePartyPin', () => {
  it('updates fields on the matching pin', () => {
    const pin = createPartyPin({ x: 0, y: 0 });
    const result = updatePartyPin([pin], pin.id, { range: 120, rangeStyle: 'cells' });
    expect(result[0].range).toBe(120);
    expect(result[0].rangeStyle).toBe('cells');
  });

  it('ignores invalid range updates but applies the rest', () => {
    const pin = createPartyPin({ x: 0, y: 0 });
    const result = updatePartyPin([pin], pin.id, { range: 0, label: 'Rearguard' });
    expect(result[0].range).toBe(pin.range);
    expect(result[0].label).toBe('Rearguard');
  });

  it('sets an icon and removes it on empty string', () => {
    const pin = createPartyPin({ x: 0, y: 0 });
    const withIcon = updatePartyPin([pin], pin.id, { icon: 'ra-axe' });
    expect(withIcon[0].icon).toBe('ra-axe');
    const cleared = updatePartyPin(withIcon, pin.id, { icon: '' });
    expect(cleared[0].icon).toBeUndefined();
  });
});

describe('resolvePinIconGlyph', () => {
  it('returns null for undefined or blank icons', () => {
    expect(resolvePinIconGlyph(undefined)).toBeNull();
    expect(resolvePinIconGlyph('')).toBeNull();
    expect(resolvePinIconGlyph('   ')).toBeNull();
  });

  it('resolves an ra-* class to its RPGAwesome char', () => {
    const glyph = resolvePinIconGlyph('ra-axe');
    expect(glyph).not.toBeNull();
    expect(glyph?.isRaIcon).toBe(true);
    expect(glyph?.glyph).toBe('');
  });

  it('returns null for an unknown ra-* class instead of a broken glyph', () => {
    expect(resolvePinIconGlyph('ra-not-a-real-icon')).toBeNull();
  });

  it('treats any other string as a literal symbol', () => {
    expect(resolvePinIconGlyph('★')).toEqual({ glyph: '★', isRaIcon: false });
    expect(resolvePinIconGlyph('🐉')).toEqual({ glyph: '🐉', isRaIcon: false });
  });
});

describe('filter parsing round-trips', () => {
  it('parses comma-separated tags, tolerating # and blanks', () => {
    expect(parseTagFilters(' #settlement, visited,, ')).toEqual(['settlement', 'visited']);
    expect(parseTagFilters('')).toEqual([]);
  });

  it('round-trips tags through format', () => {
    expect(formatTagFilters(parseTagFilters('a, b'))).toBe('a, b');
    expect(formatTagFilters(undefined)).toBe('');
  });

  it('parses semicolon-separated property clauses', () => {
    expect(parsePropertyFilters('status: active, rumored; region: north')).toEqual({
      status: ['active', 'rumored'],
      region: ['north'],
    });
  });

  it('drops malformed property clauses', () => {
    expect(parsePropertyFilters('no-colon-here; : orphan; empty:')).toEqual({});
  });

  it('round-trips properties through format', () => {
    const text = 'status: active, rumored; region: north';
    expect(formatPropertyFilters(parsePropertyFilters(text))).toBe(text);
    expect(formatPropertyFilters(undefined)).toBe('');
  });
});

describe('removePartyPin', () => {
  it('removes the matching pin', () => {
    const pin = createPartyPin({ x: 0, y: 0 });
    expect(removePartyPin([pin], pin.id)).toEqual([]);
  });

  it('keeps other pins', () => {
    const a = createPartyPin({ x: 0, y: 0 });
    const b = createPartyPin({ x: 1, y: 1 });
    expect(removePartyPin([a, b], a.id)).toEqual([b]);
  });
});

describe('stacked pins per cell', () => {
  const grid = new GridGeometry(32);
  const flatHex = new HexGeometry(40, 'flat');
  const pinAt = (id: string, x: number, y: number) => createPartyPin({ x, y }, { label: id });
  const withId = (pin: ReturnType<typeof createPartyPin>, id: string) => ({ ...pin, id });

  it('lists the pins in a cell in array order and counts free slots', () => {
    const a = withId(pinAt('a', 2, 2), 'a');
    const b = withId(pinAt('b', 2, 2), 'b');
    const c = withId(pinAt('c', 5, 5), 'c');
    const pins = [a, b, c];
    expect(getPartyPinsAt(pins, { x: 2, y: 2 }).map(p => p.id)).toEqual(['a', 'b']);
    expect(canAddPartyPinToCell(pins, { x: 2, y: 2 })).toBe(true);
    expect(canAddPartyPinToCell(pins, { x: 9, y: 9 })).toBe(true);
  });

  it('refuses a fifth pin but lets a pin already in the cell move within it', () => {
    const pins = ['a', 'b', 'c', 'd'].map(id => withId(pinAt(id, 2, 2), id));
    expect(canAddPartyPinToCell(pins, { x: 2, y: 2 })).toBe(false);
    expect(canAddPartyPinToCell(pins, { x: 2, y: 2 }, 'c')).toBe(true);
    expect(canAddPartyPinToCell(pins, { x: 2, y: 2 }, 'zzz')).toBe(false);
  });

  it('places a lone pin dead centre at full size', () => {
    const a = withId(pinAt('a', 2, 2), 'a');
    expect(getPartyPinIconPlacement([a], a, grid)).toEqual({ offsetX: 0, offsetY: 0, scale: 1, sharesCell: false });
  });

  it('offsets shared-cell pins by the slot table scaled to the cell', () => {
    const a = withId(pinAt('a', 2, 2), 'a');
    const b = withId(pinAt('b', 2, 2), 'b');
    // Grid: one cell wide (32) — two pins sit ±0.22 cells apart, shrunk to 0.7
    const gridA = getPartyPinIconPlacement([a, b], a, grid);
    const gridB = getPartyPinIconPlacement([a, b], b, grid);
    expect(gridA.offsetX).toBeCloseTo(-0.22 * 32);
    expect(gridB.offsetX).toBeCloseTo(0.22 * 32);
    expect(gridA.offsetY).toBe(0);
    expect(gridA.scale).toBe(0.7);
    expect(gridA.sharesCell).toBe(true);
    // Flat hex: full hex width (2 × size) is the unit, as for objects
    const hexA = getPartyPinIconPlacement([a, b], a, flatHex);
    expect(hexA.offsetX).toBeCloseTo(-0.22 * 80);
    expect(hexA.scale).toBe(0.7);
  });

  it('hit-tests pin icons individually inside a shared cell', () => {
    const a = withId(pinAt('a', 2, 2), 'a');
    const b = withId(pinAt('b', 2, 2), 'b');
    const solo = withId(pinAt('solo', 5, 5), 'solo');
    const pins = [a, b, solo];
    // Cell (2,2) centre is (80,80); a sits at x≈72.96, b at x≈87.04, icons rising ~20px above the tip
    expect(findPartyPinAtWorld(pins, 87, 70, grid)?.id).toBe('b');
    expect(findPartyPinAtWorld(pins, 73, 70, grid)?.id).toBe('a');
    // Below the tips: nothing
    expect(findPartyPinAtWorld(pins, 80, 95, grid)).toBeNull();
    // A lone pin's icon spans the full 0.9-cell height above its cell centre
    expect(findPartyPinAtWorld(pins, 176, 160, grid)?.id).toBe('solo');
    expect(findPartyPinAtWorld(pins, 300, 300, grid)).toBeNull();
  });
});

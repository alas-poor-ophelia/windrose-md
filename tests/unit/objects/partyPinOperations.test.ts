/**
 * partyPinOperations Unit Tests
 */

import { describe, it, expect } from 'vitest';

import {
  PARTY_PIN_DEFAULTS,
  isValidRange,
  getPartyPin,
  createPartyPin,
  upsertPartyPin,
  movePartyPin,
  updatePartyPin,
  removePartyPin,
} from '../../../src/objects/partyPinOperations';

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

describe('getPartyPin', () => {
  it('returns the first pin or null', () => {
    const pin = createPartyPin({ x: 0, y: 0 });
    expect(getPartyPin([pin])).toBe(pin);
    expect(getPartyPin([])).toBeNull();
    expect(getPartyPin(undefined)).toBeNull();
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

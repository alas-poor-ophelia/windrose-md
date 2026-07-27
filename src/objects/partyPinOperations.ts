/**
 * partyPinOperations.ts
 *
 * Pure operations for party pins: creation, movement, range updates, and
 * removal. All functions return new arrays/objects (immutable updates) so
 * they compose with handlePartyPinsChange and history tracking.
 *
 * The UI exposes a single party pin per map; these operations work on the
 * pins array so storage can hold more in the future without a migration.
 */

// Type-only imports
import type { PartyPin, PartyRangeStyle } from '#types/core/map.types';
import type { Point } from '#types/core/geometry.types';

/** Defaults for a freshly placed party pin */
const PARTY_PIN_DEFAULTS = {
  label: 'The Party',
  color: '#c4a57b',
  range: 30,
  rangeStyle: 'circle' as PartyRangeStyle,
};

/**
 * Generate a unique party pin ID
 */
function generatePartyPinId(): string {
  return 'party-' + Date.now() + '-' + Math.random().toString(36).slice(2, 11);
}

/**
 * Validate a range value: must be a finite number greater than zero.
 * Used at input time so invalid ranges never reach map data.
 */
function isValidRange(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/**
 * Get the map's party pin (the UI-visible single pin), or null if none placed
 */
function getPartyPin(partyPins: PartyPin[] | undefined): PartyPin | null {
  return partyPins?.[0] ?? null;
}

/**
 * Create a new party pin at a cell position
 * @param position - Cell position in native coordinates (col/row or q/r)
 * @param overrides - Optional field overrides (label, color, range, rangeStyle)
 */
function createPartyPin(position: Point, overrides: Partial<Omit<PartyPin, 'id' | 'position'>> = {}): PartyPin {
  const range = overrides.range !== undefined && isValidRange(overrides.range)
    ? overrides.range
    : PARTY_PIN_DEFAULTS.range;

  return {
    id: generatePartyPinId(),
    position: { ...position },
    label: overrides.label ?? PARTY_PIN_DEFAULTS.label,
    color: overrides.color ?? PARTY_PIN_DEFAULTS.color,
    ...(overrides.icon !== undefined ? { icon: overrides.icon } : {}),
    range,
    rangeStyle: overrides.rangeStyle ?? PARTY_PIN_DEFAULTS.rangeStyle,
  };
}

/**
 * Add or replace a pin in the array (matched by id).
 * Returns a new array; the original is not modified.
 */
function upsertPartyPin(partyPins: PartyPin[], pin: PartyPin): PartyPin[] {
  const index = partyPins.findIndex(p => p.id === pin.id);
  if (index === -1) return [...partyPins, pin];
  return partyPins.map(p => (p.id === pin.id ? pin : p));
}

/**
 * Move a pin to a new cell position.
 * Returns a new array; unknown ids leave the array unchanged.
 */
function movePartyPin(partyPins: PartyPin[], pinId: string, position: Point): PartyPin[] {
  return partyPins.map(p => (p.id === pinId ? { ...p, position: { ...position } } : p));
}

/**
 * Update a pin's fields (label, color, icon, range, rangeStyle).
 * Invalid range values are ignored, keeping the current range.
 * Returns a new array; unknown ids leave the array unchanged.
 */
function updatePartyPin(
  partyPins: PartyPin[],
  pinId: string,
  updates: Partial<Omit<PartyPin, 'id' | 'position'>>
): PartyPin[] {
  const safeUpdates = { ...updates };
  if (safeUpdates.range !== undefined && !isValidRange(safeUpdates.range)) {
    delete safeUpdates.range;
  }
  return partyPins.map(p => (p.id === pinId ? { ...p, ...safeUpdates } : p));
}

/**
 * Remove a pin by id. Returns a new array.
 */
function removePartyPin(partyPins: PartyPin[], pinId: string): PartyPin[] {
  return partyPins.filter(p => p.id !== pinId);
}

export {
  PARTY_PIN_DEFAULTS,
  isValidRange,
  getPartyPin,
  createPartyPin,
  upsertPartyPin,
  movePartyPin,
  updatePartyPin,
  removePartyPin,
};

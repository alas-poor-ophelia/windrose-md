/**
 * partyPinOperations.ts
 *
 * Pure operations for party pins: creation, movement, range updates, and
 * removal. All functions return new arrays/objects (immutable updates) so
 * they compose with handlePartyPinsChange and history tracking.
 *
 * A map can hold any number of pins; every pin carries its own range,
 * filters and note, so all lookups here are by id or by cell position.
 */

// Type-only imports
import type { PartyPin, PartyRangeStyle } from '#types/core/map.types';
import type { Point } from '#types/core/geometry.types';

import { getIconInfo } from '../assets/rpgAwesomeIcons';

/** Defaults for a freshly placed party pin */
const PARTY_PIN_DEFAULTS = {
  label: 'The Party',
  color: '#c4a57b',
  range: 30,
  rangeStyle: 'circle' as PartyRangeStyle,
};

/**
 * Fixed color cycle for additional pins beyond the first. Starts with the
 * default pin color, then five more readable, mutually distinct hues.
 */
const PARTY_PIN_PALETTE = [
  PARTY_PIN_DEFAULTS.color,
  '#7ba8c4', // blue
  '#8ac47b', // green
  '#c47b9e', // rose
  '#a57bc4', // purple
  '#c4a03b', // amber
];

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
 * Find the pin occupying a cell, or null when the cell is free.
 * One pin per cell is an invariant of placement and dragging.
 */
function findPartyPinAt(partyPins: PartyPin[] | undefined, position: Point): PartyPin | null {
  return partyPins?.find(p => p.position.x === position.x && p.position.y === position.y) ?? null;
}

/**
 * Look a pin up by id, or null when the id is absent (removed, undone)
 */
function getPartyPinById(partyPins: PartyPin[] | undefined, pinId: string | null | undefined): PartyPin | null {
  if (pinId == null || pinId === '') return null;
  return partyPins?.find(p => p.id === pinId) ?? null;
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
 * Derive label/color defaults for the next pin to be placed, based on pins
 * already on the map. The first pin on a map keeps "The Party" and the
 * default color. Each additional pin gets "Beacon N" (N counted from the
 * existing pin count, skipping any label already in use so deleting and
 * re-adding a pin never produces a duplicate label) and the first palette
 * color not already used by an existing pin — once the palette is
 * exhausted, colors cycle by pin count.
 *
 * Pure and read-only; callers pass the result as `createPartyPin` overrides.
 */
function nextPartyPinDefaults(existingPins: PartyPin[] | undefined): { label: string; color: string } {
  const pins = existingPins ?? [];
  if (pins.length === 0) {
    return { label: PARTY_PIN_DEFAULTS.label, color: PARTY_PIN_DEFAULTS.color };
  }

  const usedLabels = new Set(pins.map(p => p.label));
  let n = pins.length + 1;
  while (usedLabels.has(`Beacon ${n}`)) {
    n++;
  }

  const usedColors = new Set(pins.map(p => p.color));
  const unusedColor = PARTY_PIN_PALETTE.find(c => !usedColors.has(c));
  const color = unusedColor ?? PARTY_PIN_PALETTE[pins.length % PARTY_PIN_PALETTE.length];

  return { label: `Beacon ${n}`, color };
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
  return partyPins.map(p => {
    if (p.id !== pinId) return p;
    const next: PartyPin = { ...p, ...safeUpdates };
    if (safeUpdates.icon !== undefined && safeUpdates.icon === '') {
      delete next.icon;
    }
    return next;
  });
}

/** A pin icon resolved to a renderable glyph */
interface PinIconGlyph {
  /** The character(s) to draw */
  glyph: string;
  /** True when the glyph is an RPGAwesome char (needs the rpgawesome font) */
  isRaIcon: boolean;
}

/**
 * Resolve a pin's stored icon to a renderable glyph. An `ra-*` class maps
 * to its RPGAwesome character (null if the class is unknown — e.g. from a
 * newer plugin version); any other non-empty string is a literal symbol
 * (emoji or unicode) drawn in the interface font.
 */
function resolvePinIconGlyph(icon: string | undefined): PinIconGlyph | null {
  if (icon == null || icon.trim() === '') return null;
  if (icon.startsWith('ra-')) {
    const info = getIconInfo(icon);
    return info != null ? { glyph: info.char, isRaIcon: true } : null;
  }
  return { glyph: icon, isRaIcon: false };
}

/**
 * Remove a pin by id. Returns a new array.
 */
function removePartyPin(partyPins: PartyPin[], pinId: string): PartyPin[] {
  return partyPins.filter(p => p.id !== pinId);
}

/**
 * Parse a comma-separated tag list ("settlement, visited") into filter tags.
 * Leading #s are tolerated; empty entries dropped.
 */
function parseTagFilters(text: string): string[] {
  return text
    .split(',')
    .map(t => t.trim().replace(/^#/, ''))
    .filter(t => t !== '');
}

/** Format filter tags back into the input's comma-separated form */
function formatTagFilters(tags: string[] | undefined): string {
  return (tags ?? []).join(', ');
}

/**
 * Parse property filters from "status: active, rumored; region: north"
 * into a property → accepted-values record. Entries without a name or
 * any values are dropped.
 */
function parsePropertyFilters(text: string): Record<string, string[]> {
  const properties: Record<string, string[]> = {};
  for (const clause of text.split(';')) {
    const colon = clause.indexOf(':');
    if (colon === -1) continue;
    const name = clause.slice(0, colon).trim();
    const values = clause.slice(colon + 1)
      .split(',')
      .map(v => v.trim())
      .filter(v => v !== '');
    if (name !== '' && values.length > 0) properties[name] = values;
  }
  return properties;
}

/** Format property filters back into the input's "name: v1, v2; ..." form */
function formatPropertyFilters(properties: Record<string, string[]> | undefined): string {
  return Object.entries(properties ?? {})
    .map(([name, values]) => `${name}: ${values.join(', ')}`)
    .join('; ');
}

export {
  PARTY_PIN_DEFAULTS,
  PARTY_PIN_PALETTE,
  isValidRange,
  findPartyPinAt,
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
};

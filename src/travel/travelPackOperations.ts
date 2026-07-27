/**
 * travelPackOperations.ts
 *
 * Pure operations for travel packs: creation, list editing, enable/disable,
 * export serialization, and import validation. All functions return new
 * arrays/objects (immutable updates).
 *
 * Cross-references inside a pack (a mode's distance unit → a custom unit)
 * use stable internal ids only. Nothing here may compare display names or
 * abbreviations for identity.
 */

// Type-only imports
import type {
  TravelPack,
  TravelPackExport,
  TravelPackValidation,
  TravelUnit,
  TravelTerrain,
  TravelMode,
  TravelAllowance,
  TravelTimeUnit,
} from '#types/settings/travelPack.types';

/** Version stamp written into exported pack files */
const TRAVEL_PACK_FORMAT = 'windrose-travel-pack';
const TRAVEL_PACK_FORMAT_VERSION = 1;

const TIME_UNITS: TravelTimeUnit[] = ['minutes', 'hours', 'days'];

/**
 * Generate a unique id for a pack or pack entity
 */
function generateTravelId(prefix: string): string {
  return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 11);
}

// ===========================================
// Creation
// ===========================================

/** Create an empty travel pack (enabled by default) */
function createTravelPack(name: string): TravelPack {
  return {
    id: generateTravelId('travel-pack'),
    name,
    enabled: true,
    units: [],
    terrains: [],
    modes: [],
    allowances: [],
  };
}

function createTravelUnit(overrides: Partial<Omit<TravelUnit, 'id'>> = {}): TravelUnit {
  return {
    id: generateTravelId('unit'),
    name: overrides.name ?? 'New unit',
    abbreviation: overrides.abbreviation ?? '',
    factor: overrides.factor ?? 1,
    baseUnit: overrides.baseUnit ?? 'mi',
  };
}

function createTravelTerrain(overrides: Partial<Omit<TravelTerrain, 'id'>> = {}): TravelTerrain {
  return {
    id: generateTravelId('terrain'),
    name: overrides.name ?? 'New terrain',
    multiplier: overrides.multiplier ?? 1,
    ...(overrides.color !== undefined ? { color: overrides.color } : {}),
  };
}

function createTravelMode(overrides: Partial<Omit<TravelMode, 'id'>> = {}): TravelMode {
  return {
    id: generateTravelId('mode'),
    name: overrides.name ?? 'New mode',
    distance: overrides.distance ?? 24,
    unit: overrides.unit ?? { type: 'standard', unit: 'mi' },
    timeValue: overrides.timeValue ?? 8,
    timeUnit: overrides.timeUnit ?? 'hours',
  };
}

function createTravelAllowance(overrides: Partial<Omit<TravelAllowance, 'id'>> = {}): TravelAllowance {
  return {
    id: generateTravelId('allowance'),
    name: overrides.name ?? 'New allowance',
    timeValue: overrides.timeValue ?? 8,
    timeUnit: overrides.timeUnit ?? 'hours',
  };
}

// ===========================================
// Pack list editing
// ===========================================

/** Add or replace a pack (matched by id). Returns a new array. */
function upsertTravelPack(packs: TravelPack[], pack: TravelPack): TravelPack[] {
  const index = packs.findIndex(p => p.id === pack.id);
  if (index === -1) return [...packs, pack];
  return packs.map(p => (p.id === pack.id ? pack : p));
}

/** Remove a pack by id. Returns a new array. */
function removeTravelPack(packs: TravelPack[], packId: string): TravelPack[] {
  return packs.filter(p => p.id !== packId);
}

/** Enable or disable a pack. Only enabled packs surface in map UI. */
function setTravelPackEnabled(packs: TravelPack[], packId: string, enabled: boolean): TravelPack[] {
  return packs.map(p => (p.id === packId ? { ...p, enabled } : p));
}

/** Enabled packs only — everything map-facing goes through this */
function getEnabledTravelPacks(packs: TravelPack[] | undefined): TravelPack[] {
  return (packs ?? []).filter(p => p.enabled);
}

// ===========================================
// Pack entity editing (units/terrains/modes/allowances)
// ===========================================

type PackListKey = 'units' | 'terrains' | 'modes' | 'allowances';
type PackEntity = { id: string };

/** Add or replace an entity in one of the pack's lists (matched by id) */
function upsertPackItem<T extends PackEntity>(pack: TravelPack, key: PackListKey, item: T): TravelPack {
  const list = pack[key] as PackEntity[];
  const index = list.findIndex(e => e.id === item.id);
  const next = index === -1 ? [...list, item] : list.map(e => (e.id === item.id ? item : e));
  return { ...pack, [key]: next };
}

/** Remove an entity from one of the pack's lists by id */
function removePackItem(pack: TravelPack, key: PackListKey, itemId: string): TravelPack {
  const list = pack[key] as PackEntity[];
  return { ...pack, [key]: list.filter(e => e.id !== itemId) };
}

/**
 * Modes whose distance unit references the given custom unit.
 * The settings UI warns before a unit removal leaves modes dangling.
 */
function findModesReferencingUnit(pack: TravelPack, unitId: string): TravelMode[] {
  return pack.modes.filter(m => m.unit.type === 'custom' && m.unit.unitId === unitId);
}

/** Resolve a custom unit reference inside a pack, or null if dangling */
function resolvePackUnit(pack: TravelPack, unitId: string): TravelUnit | null {
  return pack.units.find(u => u.id === unitId) ?? null;
}

/**
 * Dropdown options for pack-defined custom units, so a map's distance unit
 * can be a pack unit (TM-24). The option value is the string stored as the
 * map's distanceUnit — abbreviation preferred, name as fallback — which is
 * exactly what travel-time unit resolution matches against (name or
 * abbreviation, case-insensitive). Only enabled packs contribute; duplicate
 * values (within packs or against `exclude`, e.g. the standard unit list)
 * are dropped first-wins.
 */
function getPackUnitOptions(
  packs: TravelPack[] | undefined,
  exclude: string[] = []
): { value: string; label: string }[] {
  const seen = new Set(exclude.map(v => v.trim().toLowerCase()));
  const options: { value: string; label: string }[] = [];
  for (const pack of getEnabledTravelPacks(packs)) {
    for (const unit of pack.units) {
      const value = unit.abbreviation.trim() !== '' ? unit.abbreviation : unit.name;
      const key = value.trim().toLowerCase();
      if (key === '' || seen.has(key)) continue;
      seen.add(key);
      options.push({ value, label: `${unit.name} (${pack.name})` });
    }
  }
  return options;
}

// ===========================================
// Export
// ===========================================

/** Build the export envelope (local `enabled` state is stripped) */
function exportTravelPack(pack: TravelPack): TravelPackExport {
  const { enabled: _enabled, ...portable } = pack;
  return {
    format: TRAVEL_PACK_FORMAT,
    formatVersion: TRAVEL_PACK_FORMAT_VERSION,
    pack: portable,
  };
}

/** Serialize a pack to pretty JSON for writing to a file */
function serializeTravelPack(pack: TravelPack): string {
  return JSON.stringify(exportTravelPack(pack), null, 2);
}

// ===========================================
// Import validation
// ===========================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function checkUniqueIds(list: { id: string }[], label: string, errors: string[]): void {
  const seen = new Set<string>();
  for (const item of list) {
    if (seen.has(item.id)) errors.push(`Duplicate ${label} id: ${item.id}`);
    seen.add(item.id);
  }
}

/**
 * Validate parsed JSON as a travel pack export and normalize it into a
 * TravelPack (enabled by default). Returns every problem found, not just
 * the first — import errors must be actionable.
 */
function validateTravelPackImport(data: unknown): TravelPackValidation {
  const errors: string[] = [];

  if (!isRecord(data)) {
    return { valid: false, errors: ['File is not a JSON object'] };
  }
  if (data.format !== TRAVEL_PACK_FORMAT) {
    const found = typeof data.format === 'string' ? data.format : 'missing';
    return { valid: false, errors: [`Not a travel pack file (format: ${found})`] };
  }
  if (!isPositiveNumber(data.formatVersion) || data.formatVersion > TRAVEL_PACK_FORMAT_VERSION) {
    return { valid: false, errors: [`Unsupported travel pack format version: ${String(data.formatVersion)}`] };
  }
  const rawPack = data.pack;
  if (!isRecord(rawPack)) {
    return { valid: false, errors: ['Missing pack contents'] };
  }

  if (!isNonEmptyString(rawPack.id)) errors.push('Pack id is missing');
  if (!isNonEmptyString(rawPack.name)) errors.push('Pack name is missing');

  const units: TravelUnit[] = [];
  const terrains: TravelTerrain[] = [];
  const modes: TravelMode[] = [];
  const allowances: TravelAllowance[] = [];

  const rawUnits = Array.isArray(rawPack.units) ? rawPack.units : [];
  for (const [i, raw] of rawUnits.entries()) {
    if (!isRecord(raw) || !isNonEmptyString(raw.id) || !isNonEmptyString(raw.name)) {
      errors.push(`Unit #${i + 1} is missing an id or name`);
      continue;
    }
    if (!isPositiveNumber(raw.factor)) errors.push(`Unit "${String(raw.name)}" needs a conversion factor greater than zero`);
    if (!isNonEmptyString(raw.baseUnit)) errors.push(`Unit "${String(raw.name)}" needs a base unit`);
    units.push({
      id: raw.id,
      name: raw.name,
      abbreviation: typeof raw.abbreviation === 'string' ? raw.abbreviation : '',
      factor: raw.factor as number,
      baseUnit: raw.baseUnit as string,
    });
  }

  const rawTerrains = Array.isArray(rawPack.terrains) ? rawPack.terrains : [];
  for (const [i, raw] of rawTerrains.entries()) {
    if (!isRecord(raw) || !isNonEmptyString(raw.id) || !isNonEmptyString(raw.name)) {
      errors.push(`Terrain #${i + 1} is missing an id or name`);
      continue;
    }
    if (!isPositiveNumber(raw.multiplier)) errors.push(`Terrain "${String(raw.name)}" needs a speed multiplier greater than zero`);
    terrains.push({
      id: raw.id,
      name: raw.name,
      multiplier: raw.multiplier as number,
      ...(isNonEmptyString(raw.color) ? { color: raw.color } : {}),
    });
  }

  const unitIds = new Set(units.map(u => u.id));
  const rawModes = Array.isArray(rawPack.modes) ? rawPack.modes : [];
  for (const [i, raw] of rawModes.entries()) {
    if (!isRecord(raw) || !isNonEmptyString(raw.id) || !isNonEmptyString(raw.name)) {
      errors.push(`Mode #${i + 1} is missing an id or name`);
      continue;
    }
    if (!isPositiveNumber(raw.distance)) errors.push(`Mode "${String(raw.name)}" needs a distance greater than zero`);
    if (!isPositiveNumber(raw.timeValue)) errors.push(`Mode "${String(raw.name)}" needs a time span greater than zero`);
    if (!TIME_UNITS.includes(raw.timeUnit as TravelTimeUnit)) errors.push(`Mode "${String(raw.name)}" has an invalid time unit`);

    const rawUnit = raw.unit;
    let unit: TravelMode['unit'] | null = null;
    if (isRecord(rawUnit) && rawUnit.type === 'standard' && isNonEmptyString(rawUnit.unit)) {
      unit = { type: 'standard', unit: rawUnit.unit };
    } else if (isRecord(rawUnit) && rawUnit.type === 'custom' && isNonEmptyString(rawUnit.unitId)) {
      if (!unitIds.has(rawUnit.unitId)) {
        errors.push(`Mode "${String(raw.name)}" references a custom unit that is not in the pack`);
      }
      unit = { type: 'custom', unitId: rawUnit.unitId };
    } else {
      errors.push(`Mode "${String(raw.name)}" has an invalid distance unit`);
    }

    if (unit != null) {
      modes.push({
        id: raw.id,
        name: raw.name,
        distance: raw.distance as number,
        unit,
        timeValue: raw.timeValue as number,
        timeUnit: raw.timeUnit as TravelTimeUnit,
      });
    }
  }

  const rawAllowances = Array.isArray(rawPack.allowances) ? rawPack.allowances : [];
  for (const [i, raw] of rawAllowances.entries()) {
    if (!isRecord(raw) || !isNonEmptyString(raw.id) || !isNonEmptyString(raw.name)) {
      errors.push(`Allowance #${i + 1} is missing an id or name`);
      continue;
    }
    if (!isPositiveNumber(raw.timeValue)) errors.push(`Allowance "${String(raw.name)}" needs a time value greater than zero`);
    if (raw.timeUnit !== 'minutes' && raw.timeUnit !== 'hours') errors.push(`Allowance "${String(raw.name)}" must be in minutes or hours`);
    allowances.push({
      id: raw.id,
      name: raw.name,
      timeValue: raw.timeValue as number,
      timeUnit: raw.timeUnit as 'minutes' | 'hours',
    });
  }

  checkUniqueIds(units, 'unit', errors);
  checkUniqueIds(terrains, 'terrain', errors);
  checkUniqueIds(modes, 'mode', errors);
  checkUniqueIds(allowances, 'allowance', errors);

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    pack: {
      id: rawPack.id as string,
      name: rawPack.name as string,
      ...(isNonEmptyString(rawPack.description) ? { description: rawPack.description } : {}),
      enabled: true,
      units,
      terrains,
      modes,
      allowances,
    },
  };
}

export {
  TRAVEL_PACK_FORMAT,
  TRAVEL_PACK_FORMAT_VERSION,
  generateTravelId,
  createTravelPack,
  createTravelUnit,
  createTravelTerrain,
  createTravelMode,
  createTravelAllowance,
  upsertTravelPack,
  removeTravelPack,
  setTravelPackEnabled,
  getEnabledTravelPacks,
  upsertPackItem,
  removePackItem,
  findModesReferencingUnit,
  resolvePackUnit,
  getPackUnitOptions,
  exportTravelPack,
  serializeTravelPack,
  validateTravelPackImport,
};

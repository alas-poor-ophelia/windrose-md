/**
 * travelPackOperations Unit Tests
 *
 * Tests travel pack creation, list editing, enable/disable filtering,
 * export serialization (round trip), and import validation.
 */

import { describe, it, expect } from "vitest";

import {
  TRAVEL_PACK_FORMAT,
  TRAVEL_PACK_FORMAT_VERSION,
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
  getEffectiveTravelSettings,
  exportTravelPack,
  serializeTravelPack,
  validateTravelPackImport,
} from "../../../src/travel/travelPackOperations";
import type { TravelPack } from "#types/settings/travelPack.types";

/** A representative pack exercising every entity type and a custom-unit ref */
function buildSamplePack(): TravelPack {
  const pack = createTravelPack("D&D 5e");
  const hex = createTravelUnit({ name: "Hex", abbreviation: "hex", factor: 6, baseUnit: "mi" });
  const forest = createTravelTerrain({ name: "Forest", multiplier: 0.5, color: "#2d5a27" });
  const road = createTravelTerrain({ name: "Road", multiplier: 1.25 });
  const onFoot = createTravelMode({ name: "On foot", distance: 24, unit: { type: "standard", unit: "mi" }, timeValue: 8, timeUnit: "hours" });
  const hexCrawl = createTravelMode({ name: "Hex crawl", distance: 3, unit: { type: "custom", unitId: hex.id }, timeValue: 1, timeUnit: "days" });
  const normal = createTravelAllowance({ name: "Normal pace", timeValue: 8, timeUnit: "hours" });

  let built = upsertPackItem(pack, "units", hex);
  built = upsertPackItem(built, "terrains", forest);
  built = upsertPackItem(built, "terrains", road);
  built = upsertPackItem(built, "modes", onFoot);
  built = upsertPackItem(built, "modes", hexCrawl);
  built = upsertPackItem(built, "allowances", normal);
  return built;
}

describe("travelPackOperations", () => {
  // ===========================================================================
  // Creation
  // ===========================================================================

  describe("createTravelPack", () => {
    it("creates an empty enabled pack", () => {
      const pack = createTravelPack("Pathfinder 2e");
      expect(pack.id).toMatch(/^travel-pack-/);
      expect(pack.name).toBe("Pathfinder 2e");
      expect(pack.enabled).toBe(true);
      expect(pack.units).toEqual([]);
      expect(pack.terrains).toEqual([]);
      expect(pack.modes).toEqual([]);
      expect(pack.allowances).toEqual([]);
    });

    it("generates unique pack ids", () => {
      expect(createTravelPack("a").id).not.toBe(createTravelPack("b").id);
    });
  });

  // ===========================================================================
  // Pack list editing
  // ===========================================================================

  describe("pack list editing", () => {
    it("upsert adds a new pack", () => {
      const pack = createTravelPack("A");
      expect(upsertTravelPack([], pack)).toEqual([pack]);
    });

    it("upsert replaces an existing pack by id", () => {
      const pack = createTravelPack("A");
      const renamed = { ...pack, name: "B" };
      const result = upsertTravelPack([pack], renamed);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("B");
    });

    it("remove filters by id without mutating", () => {
      const a = createTravelPack("A");
      const b = createTravelPack("B");
      const packs = [a, b];
      expect(removeTravelPack(packs, a.id)).toEqual([b]);
      expect(packs).toHaveLength(2);
    });

    it("setTravelPackEnabled toggles only the target pack", () => {
      const a = createTravelPack("A");
      const b = createTravelPack("B");
      const result = setTravelPackEnabled([a, b], a.id, false);
      expect(result[0].enabled).toBe(false);
      expect(result[1].enabled).toBe(true);
    });

    it("getEnabledTravelPacks filters disabled packs and tolerates undefined", () => {
      const a = createTravelPack("A");
      const b = { ...createTravelPack("B"), enabled: false };
      expect(getEnabledTravelPacks([a, b])).toEqual([a]);
      expect(getEnabledTravelPacks(undefined)).toEqual([]);
    });
  });

  // ===========================================================================
  // Entity editing
  // ===========================================================================

  describe("pack entity editing", () => {
    it("upsertPackItem adds and replaces by id", () => {
      const pack = createTravelPack("A");
      const terrain = createTravelTerrain({ name: "Swamp", multiplier: 0.5 });
      const withTerrain = upsertPackItem(pack, "terrains", terrain);
      expect(withTerrain.terrains).toHaveLength(1);

      const updated = upsertPackItem(withTerrain, "terrains", { ...terrain, multiplier: 0.25 });
      expect(updated.terrains).toHaveLength(1);
      expect(updated.terrains[0].multiplier).toBe(0.25);
    });

    it("removePackItem removes by id", () => {
      const pack = buildSamplePack();
      const result = removePackItem(pack, "terrains", pack.terrains[0].id);
      expect(result.terrains).toHaveLength(1);
    });

    it("findModesReferencingUnit finds custom-unit modes only", () => {
      const pack = buildSamplePack();
      const hexId = pack.units[0].id;
      const referencing = findModesReferencingUnit(pack, hexId);
      expect(referencing).toHaveLength(1);
      expect(referencing[0].name).toBe("Hex crawl");
    });

    it("resolvePackUnit returns null for a dangling reference", () => {
      const pack = buildSamplePack();
      expect(resolvePackUnit(pack, pack.units[0].id)?.name).toBe("Hex");
      expect(resolvePackUnit(pack, "unit-nope")).toBeNull();
    });
  });

  // ===========================================================================
  // getPackUnitOptions (TM-24)
  // ===========================================================================

  describe("getPackUnitOptions", () => {
    it("offers enabled packs' units with abbreviation as value and pack-qualified label", () => {
      const options = getPackUnitOptions([buildSamplePack()]);
      expect(options).toEqual([{ value: "hex", label: "Hex (D&D 5e)" }]);
    });

    it("falls back to the unit name when the abbreviation is empty", () => {
      const pack = upsertPackItem(
        createTravelPack("Leagues & Lore"),
        "units",
        createTravelUnit({ name: "League", abbreviation: "", factor: 3, baseUnit: "mi" })
      );
      const options = getPackUnitOptions([pack]);
      expect(options).toEqual([{ value: "League", label: "League (Leagues & Lore)" }]);
    });

    it("excludes disabled packs", () => {
      const pack = { ...buildSamplePack(), enabled: false };
      expect(getPackUnitOptions([pack])).toEqual([]);
    });

    it("drops duplicates across packs and against the exclude list, first wins", () => {
      const a = upsertPackItem(
        createTravelPack("Pack A"),
        "units",
        createTravelUnit({ name: "Hex", abbreviation: "hex", factor: 6, baseUnit: "mi" })
      );
      const b = upsertPackItem(
        upsertPackItem(
          createTravelPack("Pack B"),
          "units",
          createTravelUnit({ name: "Hexagon", abbreviation: "HEX", factor: 5, baseUnit: "mi" })
        ),
        "units",
        createTravelUnit({ name: "Mile", abbreviation: "mi", factor: 1, baseUnit: "mi" })
      );
      const options = getPackUnitOptions([a, b], ["ft", "m", "mi", "km", "yd"]);
      expect(options).toEqual([{ value: "hex", label: "Hex (Pack A)" }]);
    });

    it("returns empty for undefined or empty pack lists", () => {
      expect(getPackUnitOptions(undefined)).toEqual([]);
      expect(getPackUnitOptions([])).toEqual([]);
    });
  });

  // ===========================================================================
  // Export / import round trip
  // ===========================================================================

  describe("export and import", () => {
    it("export strips local enabled state and stamps the format", () => {
      const pack = { ...buildSamplePack(), enabled: false };
      const exported = exportTravelPack(pack);
      expect(exported.format).toBe(TRAVEL_PACK_FORMAT);
      expect(exported.formatVersion).toBe(TRAVEL_PACK_FORMAT_VERSION);
      expect("enabled" in exported.pack).toBe(false);
    });

    it("round trips a serialized pack identically (TM-12)", () => {
      const pack = buildSamplePack();
      const json = serializeTravelPack(pack);
      const result = validateTravelPackImport(JSON.parse(json));
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      // Imported packs come back enabled; everything else is identical
      expect(result.pack).toEqual({ ...pack, enabled: true });
    });

    it("rejects non-objects and wrong formats", () => {
      expect(validateTravelPackImport("nope").valid).toBe(false);
      expect(validateTravelPackImport(null).valid).toBe(false);
      expect(validateTravelPackImport({ format: "other" }).valid).toBe(false);
    });

    it("rejects a newer format version", () => {
      const exported = exportTravelPack(buildSamplePack());
      const future = { ...exported, formatVersion: TRAVEL_PACK_FORMAT_VERSION + 1 };
      const result = validateTravelPackImport(future);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("version");
    });

    it("collects every validation error, not just the first", () => {
      const exported = exportTravelPack(buildSamplePack());
      const broken = JSON.parse(JSON.stringify(exported));
      broken.pack.terrains[0].multiplier = -1;
      broken.pack.modes[0].distance = 0;
      const result = validateTravelPackImport(broken);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });

    it("rejects a mode referencing a custom unit missing from the pack", () => {
      const exported = exportTravelPack(buildSamplePack());
      const broken = JSON.parse(JSON.stringify(exported));
      broken.pack.units = [];
      const result = validateTravelPackImport(broken);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes("custom unit"))).toBe(true);
    });

    it("rejects duplicate entity ids", () => {
      const exported = exportTravelPack(buildSamplePack());
      const broken = JSON.parse(JSON.stringify(exported));
      broken.pack.terrains[1].id = broken.pack.terrains[0].id;
      const result = validateTravelPackImport(broken);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes("Duplicate terrain"))).toBe(true);
    });

    it("rejects an allowance expressed in days", () => {
      const exported = exportTravelPack(buildSamplePack());
      const broken = JSON.parse(JSON.stringify(exported));
      broken.pack.allowances[0].timeUnit = "days";
      const result = validateTravelPackImport(broken);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes("minutes or hours"))).toBe(true);
    });

    it("accepts empty entity lists (TM-9: each list possibly empty)", () => {
      const result = validateTravelPackImport(exportTravelPack(createTravelPack("Empty")));
      expect(result.valid).toBe(true);
      expect(result.pack?.units).toEqual([]);
    });
  });

  // ===========================================================================
  // Effective travel settings (global default + per-map override)
  // ===========================================================================

  describe("getEffectiveTravelSettings", () => {
    it("uses the per-map override when it selects at least one mode", () => {
      const globalDefault = { modeIds: ["global-a"], allowanceId: "global-allow" };
      const mapOverride = { modeIds: ["map-a", "map-b"], allowanceId: "map-allow" };
      expect(getEffectiveTravelSettings(globalDefault, mapOverride)).toEqual({
        modeIds: ["map-a", "map-b"],
        allowanceId: "map-allow",
      });
    });

    it("falls back to the global default when the per-map selection is empty", () => {
      const globalDefault = { modeIds: ["global-a"], allowanceId: "global-allow" };
      const mapOverride = { modeIds: [], allowanceId: "map-allow" };
      expect(getEffectiveTravelSettings(globalDefault, mapOverride)).toEqual({
        modeIds: ["global-a"],
        allowanceId: "global-allow",
      });
    });

    it("falls back to the global default when the per-map override is missing", () => {
      const globalDefault = { modeIds: ["global-a"], allowanceId: null };
      expect(getEffectiveTravelSettings(globalDefault, null)).toEqual({
        modeIds: ["global-a"],
        allowanceId: null,
      });
      expect(getEffectiveTravelSettings(globalDefault, undefined)).toEqual({
        modeIds: ["global-a"],
        allowanceId: null,
      });
    });

    it("returns an empty selection when both inputs are empty or absent", () => {
      expect(getEffectiveTravelSettings(null, null)).toEqual({ modeIds: [], allowanceId: null });
      expect(getEffectiveTravelSettings(undefined, undefined)).toEqual({ modeIds: [], allowanceId: null });
      expect(getEffectiveTravelSettings({ modeIds: [] }, { modeIds: [] })).toEqual({
        modeIds: [],
        allowanceId: null,
      });
    });

    it("normalizes a missing allowanceId to null", () => {
      expect(getEffectiveTravelSettings(null, { modeIds: ["map-a"] })).toEqual({
        modeIds: ["map-a"],
        allowanceId: null,
      });
    });
  });
});

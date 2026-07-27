/**
 * travelTimeOperations Unit Tests
 *
 * Tests travel-time math: unit resolution (standard, custom, mismatch),
 * terrain-aware route times, allowance-based days+remainder formatting,
 * and selection resolution against enabled packs.
 */

import { describe, it, expect } from "vitest";

import {
  createTravelAllowance,
  createTravelMode,
  createTravelPack,
  createTravelTerrain,
  createTravelUnit,
  upsertPackItem,
} from "../../../src/travel/travelPackOperations";
import {
  computeTravelTime,
  computeRouteTravelTime,
  formatTravelTime,
  formatTravelTimesLabel,
  findTravelMismatch,
  resolveSelectedModes,
  resolveSelectedAllowance,
  findTerrainById,
} from "../../../src/travel/travelTimeOperations";
import type { TravelPack, TravelTimeUnit } from "#types/settings/travelPack.types";

/** D&D-ish pack: on foot 24 mi / 8 h; hex crawl 3 hex / 1 day (hex = 6 mi) */
function buildPack(): TravelPack {
  let pack = createTravelPack("Test pack");
  const hex = createTravelUnit({ name: "Hex", abbreviation: "hex", factor: 6, baseUnit: "mi" });
  pack = upsertPackItem(pack, "units", hex);
  pack = upsertPackItem(pack, "modes", createTravelMode({
    name: "On foot", distance: 24, unit: { type: "standard", unit: "mi" }, timeValue: 8, timeUnit: "hours",
  }));
  pack = upsertPackItem(pack, "modes", createTravelMode({
    name: "Hex crawl", distance: 3, unit: { type: "custom", unitId: hex.id }, timeValue: 1, timeUnit: "days",
  }));
  pack = upsertPackItem(pack, "terrains", createTravelTerrain({ name: "Forest", multiplier: 0.5 }));
  pack = upsertPackItem(pack, "terrains", createTravelTerrain({ name: "Road", multiplier: 1.25 }));
  pack = upsertPackItem(pack, "allowances", createTravelAllowance({ name: "Normal", timeValue: 8, timeUnit: "hours" }));
  return pack;
}

const time = (amount: number, base: 'hours' | 'days') => ({ ok: true as const, amount, base });

describe("travelTimeOperations", () => {
  // ===========================================================================
  // computeTravelTime — unit resolution
  // ===========================================================================

  describe("computeTravelTime", () => {
    const pack = buildPack();
    const onFoot = pack.modes[0];
    const hexCrawl = pack.modes[1];

    it("computes time = distance / speed for a matching standard unit", () => {
      // 24 mi per 8 h = 3 mi/h; 48 mi → 16 h
      const result = computeTravelTime(48, "mi", onFoot, pack);
      expect(result).toEqual(time(16, "hours"));
    });

    it("matches units case-insensitively", () => {
      const result = computeTravelTime(24, "MI", onFoot, pack);
      expect(result).toEqual(time(8, "hours"));
    });

    it("refuses a standard-unit mismatch with actionable guidance", () => {
      const result = computeTravelTime(48, "km", onFoot, pack);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain("On foot");
        expect(result.reason).toContain("km");
      }
    });

    it("converts a custom-unit mode through its base unit", () => {
      // 3 hex/day = 18 mi/day; 36 mi → 2 days
      const result = computeTravelTime(36, "mi", hexCrawl, pack);
      expect(result).toEqual(time(2, "days"));
    });

    it("uses a custom-unit mode directly when the map measures in that unit", () => {
      // Map unit 'hex': 3 hex/day; 6 hexes → 2 days (by name or abbreviation)
      expect(computeTravelTime(6, "hex", hexCrawl, pack)).toEqual(time(2, "days"));
      expect(computeTravelTime(6, "Hex", hexCrawl, pack)).toEqual(time(2, "days"));
    });

    it("refuses when a custom unit's base cannot reach the map unit", () => {
      const result = computeTravelTime(6, "km", hexCrawl, pack);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain("Hex");
    });

    it("refuses a dangling custom-unit reference", () => {
      const broken = { ...pack, units: [] };
      const result = computeTravelTime(6, "mi", hexCrawl, broken);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain("no longer in the pack");
    });

    it("normalizes minute-based modes to hours", () => {
      const sprint = createTravelMode({
        name: "Sprint", distance: 1, unit: { type: "standard", unit: "mi" }, timeValue: 15, timeUnit: "minutes" as TravelTimeUnit,
      });
      // 1 mi per 15 min = 4 mi/h; 2 mi → 0.5 h
      const result = computeTravelTime(2, "mi", sprint, pack);
      expect(result).toEqual(time(0.5, "hours"));
    });
  });

  // ===========================================================================
  // computeRouteTravelTime — terrain multipliers
  // ===========================================================================

  describe("computeRouteTravelTime", () => {
    const pack = buildPack();
    const onFoot = pack.modes[0];

    it("matches the acceptance sketch: 3-segment mixed-terrain route sums per-segment times", () => {
      // Speed 3 mi/h. Segments: 6 mi road (×1.25 → 1.6 h), 6 mi plain (2 h),
      // 3 mi forest (×0.5 → 2 h). Total = 5.6 h.
      const result = computeRouteTravelTime([6, 6, 3], [1.25, 1, 0.5], "mi", onFoot, pack);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.amount).toBeCloseTo(5.6, 5);
    });

    it("treats unassigned terrain as multiplier 1 (TM-22)", () => {
      const plain = computeRouteTravelTime([9], [1], "mi", onFoot, pack);
      const defaulted = computeRouteTravelTime([9], [undefined as unknown as number], "mi", onFoot, pack);
      expect(defaulted).toEqual(plain);
    });
  });

  // ===========================================================================
  // formatTravelTime
  // ===========================================================================

  describe("formatTravelTime", () => {
    const allowance = createTravelAllowance({ name: "Normal", timeValue: 8, timeUnit: "hours" });

    it("formats sub-hour times as minutes", () => {
      expect(formatTravelTime(time(0.5, "hours"), null)).toBe("30 min");
    });

    it("formats hours with one decimal", () => {
      expect(formatTravelTime(time(16.25, "hours"), null)).toBe("16.3 h");
    });

    it("formats day-based times in days without an allowance", () => {
      expect(formatTravelTime(time(2.5, "days"), null)).toBe("2.5 days");
      expect(formatTravelTime(time(1, "days"), null)).toBe("1 day");
    });

    it("renders days + remainder with an allowance (TM-16)", () => {
      // 26 h at 8 h/day = 3 days + 2 h
      expect(formatTravelTime(time(26, "hours"), allowance)).toBe("3 days + 2 h");
    });

    it("renders exact whole days without a remainder", () => {
      expect(formatTravelTime(time(16, "hours"), allowance)).toBe("2 days");
    });

    it("keeps sub-day times as hours even with an allowance", () => {
      expect(formatTravelTime(time(5, "hours"), allowance)).toBe("5 h");
    });

    it("expresses a day-based fraction through the allowance's hours", () => {
      // 2.5 days at 8 h/day = 2 days + 4 h
      expect(formatTravelTime(time(2.5, "days"), allowance)).toBe("2 days + 4 h");
    });

    it("supports minute-based allowances", () => {
      const shortDay = createTravelAllowance({ name: "March", timeValue: 480, timeUnit: "minutes" });
      expect(formatTravelTime(time(26, "hours"), shortDay)).toBe("3 days + 2 h");
    });
  });

  // ===========================================================================
  // Per-result labels (party pin, PP-35)
  // ===========================================================================

  describe("formatTravelTimesLabel and findTravelMismatch", () => {
    const pack = buildPack();
    const selections = pack.modes.map(mode => ({ mode, pack }));

    it("joins per-mode times, skipping incompatible modes", () => {
      // Map in mi: On foot 48 mi → 16 h; Hex crawl 36 mi (18 mi/day) → 2 days
      const label = formatTravelTimesLabel(48, "mi", selections, null);
      expect(label).toContain("On foot 16 h");
      expect(label).toContain("Hex crawl");
      expect(label).toContain(" · ");
    });

    it("returns null when no selected mode can compute", () => {
      expect(formatTravelTimesLabel(48, "km", selections, null)).toBeNull();
      expect(formatTravelTimesLabel(48, "mi", [], null)).toBeNull();
    });

    it("findTravelMismatch surfaces the first incompatible mode's guidance", () => {
      expect(findTravelMismatch("mi", selections)).toBeNull();
      const mismatch = findTravelMismatch("km", selections);
      expect(mismatch).toContain("km");
    });
  });

  // ===========================================================================
  // Selection resolution
  // ===========================================================================

  describe("selection resolution", () => {
    const pack = buildPack();

    it("resolves selected mode ids across enabled packs, skipping vanished ids", () => {
      const resolved = resolveSelectedModes([pack], [pack.modes[1].id, "mode-gone"]);
      expect(resolved).toHaveLength(1);
      expect(resolved[0].mode.name).toBe("Hex crawl");
      expect(resolved[0].pack.id).toBe(pack.id);
    });

    it("resolves the selected allowance or null", () => {
      expect(resolveSelectedAllowance([pack], pack.allowances[0].id)?.name).toBe("Normal");
      expect(resolveSelectedAllowance([pack], "allowance-gone")).toBeNull();
      expect(resolveSelectedAllowance([pack], null)).toBeNull();
    });

    it("finds terrains by id across packs, null for unknown", () => {
      expect(findTerrainById([pack], pack.terrains[0].id)?.name).toBe("Forest");
      expect(findTerrainById([pack], "terrain-gone")).toBeNull();
      expect(findTerrainById([pack], null)).toBeNull();
    });
  });
});

/**
 * distanceOperations Unit Tests
 *
 * Tests distance formatting and settings resolution.
 * Used by the distance measurement tool to format display output.
 */

import { describe, it, expect } from "vitest";

import {
  formatDistance,
  getEffectiveDistanceSettings,
} from "../../../src/utils/distanceOperations.ts";

describe("distanceOperations", () => {
  // ===========================================================================
  // formatDistance
  // ===========================================================================

  describe("formatDistance", () => {
    describe("cells format", () => {
      it("formats single cell", () => {
        expect(formatDistance(1, 5, "ft", "cells")).toBe("1 cell");
      });

      it("formats multiple cells", () => {
        expect(formatDistance(3, 5, "ft", "cells")).toBe("3 cells");
      });

      it("formats fractional cells", () => {
        expect(formatDistance(2.5, 5, "ft", "cells")).toBe("2.5 cells");
      });

      it("rounds to 1 decimal place", () => {
        expect(formatDistance(2.567, 5, "ft", "cells")).toBe("2.6 cells");
      });
    });

    describe("units format", () => {
      it("formats distance in units", () => {
        expect(formatDistance(3, 5, "ft", "units")).toBe("15 ft");
      });

      it("handles different units", () => {
        expect(formatDistance(2, 6, "mi", "units")).toBe("12 mi");
        expect(formatDistance(2, 10, "m", "units")).toBe("20 m");
      });

      it("handles empty unit string", () => {
        expect(formatDistance(3, 5, "", "units")).toBe("15");
      });

      it("rounds unit values", () => {
        expect(formatDistance(2.5, 5, "ft", "units")).toBe("12.5 ft");
      });
    });

    describe("both format", () => {
      it("shows cells and units", () => {
        expect(formatDistance(3, 5, "ft", "both")).toBe("3 cells (15 ft)");
      });

      it("handles single cell", () => {
        expect(formatDistance(1, 5, "ft", "both")).toBe("1 cell (5 ft)");
      });

      it("handles fractional values", () => {
        expect(formatDistance(2.5, 5, "ft", "both")).toBe("2.5 cells (12.5 ft)");
      });

      it("omits parentheses when no unit", () => {
        expect(formatDistance(3, 5, "", "both")).toBe("3 cells");
      });
    });

    describe("default format", () => {
      it("defaults to both format", () => {
        // @ts-expect-error - testing invalid format falls back to default
        expect(formatDistance(2, 5, "ft", "invalid")).toBe("2 cells (10 ft)");
      });
    });

    describe("edge cases", () => {
      it("handles zero distance", () => {
        expect(formatDistance(0, 5, "ft", "cells")).toBe("0 cells");
        expect(formatDistance(0, 5, "ft", "units")).toBe("0 ft");
      });

      it("handles large distances", () => {
        expect(formatDistance(100, 5, "ft", "both")).toBe("100 cells (500 ft)");
      });
    });
  });

  // ===========================================================================
  // getEffectiveDistanceSettings
  // ===========================================================================

  describe("getEffectiveDistanceSettings", () => {
    const globalSettings = {
      distancePerCellGrid: 5,
      distancePerCellHex: 6,
      distanceUnitGrid: "ft",
      distanceUnitHex: "mi",
      gridDiagonalRule: "alternating" as const,
      distanceDisplayFormat: "both" as const,
    };

    describe("grid maps", () => {
      it("uses grid defaults from global settings", () => {
        const result = getEffectiveDistanceSettings("grid", globalSettings, null);

        expect(result.distancePerCell).toBe(5);
        expect(result.distanceUnit).toBe("ft");
        expect(result.gridDiagonalRule).toBe("alternating");
        expect(result.displayFormat).toBe("both");
      });

      it("applies map overrides", () => {
        const mapOverrides = {
          distancePerCell: 10,
          distanceUnit: "m",
          gridDiagonalRule: "equal" as const,
          displayFormat: "cells" as const,
        };

        const result = getEffectiveDistanceSettings(
          "grid",
          globalSettings,
          mapOverrides
        );

        expect(result.distancePerCell).toBe(10);
        expect(result.distanceUnit).toBe("m");
        expect(result.gridDiagonalRule).toBe("equal");
        expect(result.displayFormat).toBe("cells");
      });

      it("partially applies map overrides", () => {
        const mapOverrides = {
          distancePerCell: 10,
          // Other settings not overridden
        };

        const result = getEffectiveDistanceSettings(
          "grid",
          globalSettings,
          mapOverrides
        );

        expect(result.distancePerCell).toBe(10); // Overridden
        expect(result.distanceUnit).toBe("ft"); // From global
        expect(result.gridDiagonalRule).toBe("alternating"); // From global
      });
    });

    describe("hex maps", () => {
      it("uses hex defaults from global settings", () => {
        const result = getEffectiveDistanceSettings("hex", globalSettings, null);

        expect(result.distancePerCell).toBe(6);
        expect(result.distanceUnit).toBe("mi");
      });

      it("applies map overrides for hex", () => {
        const mapOverrides = {
          distancePerCell: 24,
          distanceUnit: "km",
        };

        const result = getEffectiveDistanceSettings(
          "hex",
          globalSettings,
          mapOverrides
        );

        expect(result.distancePerCell).toBe(24);
        expect(result.distanceUnit).toBe("km");
      });
    });

    describe("fallback to defaults", () => {
      it("uses DEFAULTS when global settings is null", () => {
        const result = getEffectiveDistanceSettings("grid", null, null);

        // Should fall back to DEFAULTS.distance values
        expect(result.distancePerCell).toBe(5); // DEFAULTS.distance.perCellGrid
        expect(result.distanceUnit).toBe("ft"); // DEFAULTS.distance.unitGrid
        expect(result.gridDiagonalRule).toBe("alternating");
        expect(result.displayFormat).toBe("both");
      });

      it("uses DEFAULTS when global settings is undefined", () => {
        const result = getEffectiveDistanceSettings("grid", undefined, null);

        expect(result.distancePerCell).toBe(5);
        expect(result.distanceUnit).toBe("ft");
      });

      it("uses DEFAULTS for hex when global settings is null", () => {
        const result = getEffectiveDistanceSettings("hex", null, null);

        expect(result.distancePerCell).toBe(6); // DEFAULTS.distance.perCellHex
        expect(result.distanceUnit).toBe("mi"); // DEFAULTS.distance.unitHex
      });
    });
  });
});

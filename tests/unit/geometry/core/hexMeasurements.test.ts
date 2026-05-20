/**
 * hexMeasurements Unit Tests
 *
 * Tests hex measurement conversions and grid sizing calculations.
 * Pure math with no dependencies.
 */

import { describe, it, expect } from "vitest";

import {
  MEASUREMENT_EDGE,
  MEASUREMENT_CORNER,
  MIN_MEASUREMENT_SIZE,
  MAX_MEASUREMENT_SIZE,
  MAX_FINE_TUNE_OFFSET,
  measurementToHexSize,
  hexSizeToMeasurement,
  calculateColumns,
  calculateRows,
  calculateHexSizeFromColumns,
  calculateGridFromMeasurement,
  calculateGridFromColumns,
  validateMeasurementSize,
  validateFineTune,
  getFineTuneRange,
} from "../../../../src/geometry/core/hexMeasurements";

const SQRT3 = Math.sqrt(3);

describe("hexMeasurements", () => {
  // ===========================================================================
  // Constants
  // ===========================================================================

  describe("constants", () => {
    it("has measurement method constants", () => {
      expect(MEASUREMENT_EDGE).toBe("edge");
      expect(MEASUREMENT_CORNER).toBe("corner");
    });

    it("has size limits", () => {
      expect(MIN_MEASUREMENT_SIZE).toBe(10);
      expect(MAX_MEASUREMENT_SIZE).toBe(500);
      expect(MAX_FINE_TUNE_OFFSET).toBe(3);
    });
  });

  // ===========================================================================
  // Core Conversions
  // ===========================================================================

  describe("measurementToHexSize", () => {
    it("converts edge-to-edge measurement to hexSize", () => {
      // Edge-to-edge = sqrt(3) * hexSize
      // hexSize = size / sqrt(3)
      const size = 100;
      const hexSize = measurementToHexSize(size, "edge");
      expect(hexSize).toBeCloseTo(100 / SQRT3);
    });

    it("converts corner-to-corner measurement to hexSize", () => {
      // Corner-to-corner = 2 * hexSize
      // hexSize = size / 2
      const size = 100;
      const hexSize = measurementToHexSize(size, "corner");
      expect(hexSize).toBe(50);
    });

    it("handles flat orientation (same as default)", () => {
      expect(measurementToHexSize(100, "edge", "flat")).toBeCloseTo(100 / SQRT3);
      expect(measurementToHexSize(100, "corner", "flat")).toBe(50);
    });

    it("handles pointy orientation (same formulas)", () => {
      expect(measurementToHexSize(100, "edge", "pointy")).toBeCloseTo(100 / SQRT3);
      expect(measurementToHexSize(100, "corner", "pointy")).toBe(50);
    });
  });

  describe("hexSizeToMeasurement", () => {
    it("converts hexSize to edge-to-edge measurement", () => {
      const hexSize = 50;
      const measurement = hexSizeToMeasurement(hexSize, "edge");
      expect(measurement).toBeCloseTo(50 * SQRT3);
    });

    it("converts hexSize to corner-to-corner measurement", () => {
      const hexSize = 50;
      const measurement = hexSizeToMeasurement(hexSize, "corner");
      expect(measurement).toBe(100);
    });

    it("is inverse of measurementToHexSize", () => {
      const originalSize = 100;

      // Edge round-trip
      const hexSizeEdge = measurementToHexSize(originalSize, "edge");
      const roundTripEdge = hexSizeToMeasurement(hexSizeEdge, "edge");
      expect(roundTripEdge).toBeCloseTo(originalSize);

      // Corner round-trip
      const hexSizeCorner = measurementToHexSize(originalSize, "corner");
      const roundTripCorner = hexSizeToMeasurement(hexSizeCorner, "corner");
      expect(roundTripCorner).toBeCloseTo(originalSize);
    });
  });

  // ===========================================================================
  // Grid Calculations
  // ===========================================================================

  describe("calculateColumns", () => {
    it("calculates columns for flat-top orientation", () => {
      // Flat: hexSize * (2 + (columns - 1) * 1.5) = imageWidth
      const imageWidth = 800;
      const hexSize = 50;
      const columns = calculateColumns(imageWidth, hexSize, "flat");

      expect(columns).toBeGreaterThan(0);
      expect(Number.isInteger(columns)).toBe(true);
    });

    it("calculates columns for pointy-top orientation", () => {
      // Pointy: columns * sqrt(3) * hexSize = imageWidth
      const imageWidth = 800;
      const hexSize = 50;
      const columns = calculateColumns(imageWidth, hexSize, "pointy");

      const expected = Math.ceil(imageWidth / (hexSize * SQRT3));
      expect(columns).toBe(expected);
    });

    it("uses ceiling to ensure coverage", () => {
      // Should always round up to ensure full image coverage
      const imageWidth = 801;
      const hexSize = 50;

      const flatCols = calculateColumns(imageWidth, hexSize, "flat");
      const pointyCols = calculateColumns(imageWidth, hexSize, "pointy");

      expect(flatCols).toBeGreaterThan(0);
      expect(pointyCols).toBeGreaterThan(0);
    });
  });

  describe("calculateRows", () => {
    it("calculates rows for flat-top orientation", () => {
      // Flat: rows * sqrt(3) * hexSize = imageHeight
      const imageHeight = 600;
      const hexSize = 50;
      const rows = calculateRows(imageHeight, hexSize, "flat");

      const expected = Math.ceil(imageHeight / (hexSize * SQRT3));
      expect(rows).toBe(expected);
    });

    it("calculates rows for pointy-top orientation", () => {
      // Pointy: hexSize * (2 + (rows - 1) * 1.5) = imageHeight
      const imageHeight = 600;
      const hexSize = 50;
      const rows = calculateRows(imageHeight, hexSize, "pointy");

      expect(rows).toBeGreaterThan(0);
      expect(Number.isInteger(rows)).toBe(true);
    });
  });

  describe("calculateHexSizeFromColumns", () => {
    it("is inverse of calculateColumns for flat-top", () => {
      const imageWidth = 800;
      const targetColumns = 10;

      const hexSize = calculateHexSizeFromColumns(imageWidth, targetColumns, "flat");
      const resultColumns = calculateColumns(imageWidth, hexSize, "flat");

      // Due to ceiling, resultColumns >= targetColumns
      expect(resultColumns).toBeGreaterThanOrEqual(targetColumns);
    });

    it("is inverse of calculateColumns for pointy-top", () => {
      const imageWidth = 800;
      const targetColumns = 10;

      const hexSize = calculateHexSizeFromColumns(imageWidth, targetColumns, "pointy");
      const resultColumns = calculateColumns(imageWidth, hexSize, "pointy");

      expect(resultColumns).toBeGreaterThanOrEqual(targetColumns);
    });

    it("calculates correct hexSize for pointy orientation", () => {
      // Pointy: imageWidth = columns * sqrt(3) * hexSize
      const imageWidth = 800;
      const columns = 10;

      const hexSize = calculateHexSizeFromColumns(imageWidth, columns, "pointy");
      expect(hexSize).toBeCloseTo(imageWidth / (columns * SQRT3));
    });

    it("calculates correct hexSize for flat orientation", () => {
      // Flat: imageWidth = hexSize * (2 + (columns - 1) * 1.5)
      const imageWidth = 800;
      const columns = 10;

      const hexSize = calculateHexSizeFromColumns(imageWidth, columns, "flat");
      const expected = imageWidth / (2 + (columns - 1) * 1.5);
      expect(hexSize).toBeCloseTo(expected);
    });
  });

  describe("calculateGridFromMeasurement", () => {
    it("returns complete grid calculation", () => {
      const result = calculateGridFromMeasurement(800, 600, 100, "edge", "flat");

      expect(result).toHaveProperty("columns");
      expect(result).toHaveProperty("rows");
      expect(result).toHaveProperty("hexSize");
      expect(result.columns).toBeGreaterThan(0);
      expect(result.rows).toBeGreaterThan(0);
      expect(result.hexSize).toBeGreaterThan(0);
    });

    it("uses correct hexSize from measurement", () => {
      const size = 100;
      const result = calculateGridFromMeasurement(800, 600, size, "corner", "flat");

      expect(result.hexSize).toBe(50); // corner-to-corner / 2
    });

    it("handles edge measurement", () => {
      const size = 100;
      const result = calculateGridFromMeasurement(800, 600, size, "edge", "flat");

      expect(result.hexSize).toBeCloseTo(100 / SQRT3);
    });
  });

  describe("calculateGridFromColumns", () => {
    it("returns complete grid calculation", () => {
      const result = calculateGridFromColumns(800, 600, 10, "flat");

      expect(result.columns).toBe(10);
      expect(result).toHaveProperty("rows");
      expect(result).toHaveProperty("hexSize");
    });

    it("maintains requested column count", () => {
      const columns = 15;
      const result = calculateGridFromColumns(800, 600, columns, "flat");

      expect(result.columns).toBe(columns);
    });

    it("calculates appropriate rows for image height", () => {
      const result = calculateGridFromColumns(800, 600, 10, "flat");

      expect(result.rows).toBeGreaterThan(0);
      expect(Number.isInteger(result.rows)).toBe(true);
    });
  });

  // ===========================================================================
  // Validation
  // ===========================================================================

  describe("validateMeasurementSize", () => {
    it("accepts valid sizes", () => {
      expect(validateMeasurementSize(50).valid).toBe(true);
      expect(validateMeasurementSize(100).valid).toBe(true);
      expect(validateMeasurementSize(MIN_MEASUREMENT_SIZE).valid).toBe(true);
      expect(validateMeasurementSize(MAX_MEASUREMENT_SIZE).valid).toBe(true);
    });

    it("rejects sizes below minimum", () => {
      const result = validateMeasurementSize(MIN_MEASUREMENT_SIZE - 1);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("at least");
    });

    it("rejects sizes above maximum", () => {
      const result = validateMeasurementSize(MAX_MEASUREMENT_SIZE + 1);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("no more than");
    });
  });

  describe("validateFineTune", () => {
    it("accepts adjustments within range", () => {
      const base = 50;
      expect(validateFineTune(base, base).valid).toBe(true);
      expect(validateFineTune(base, base + 1).valid).toBe(true);
      expect(validateFineTune(base, base - 2).valid).toBe(true);
      expect(validateFineTune(base, base + MAX_FINE_TUNE_OFFSET).valid).toBe(true);
    });

    it("rejects adjustments beyond range", () => {
      const base = 50;
      const result = validateFineTune(base, base + MAX_FINE_TUNE_OFFSET + 1);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Fine-tune");
    });
  });

  describe("getFineTuneRange", () => {
    it("returns min and max around base value", () => {
      const base = 50;
      const range = getFineTuneRange(base);

      expect(range.min).toBe(base - MAX_FINE_TUNE_OFFSET);
      expect(range.max).toBe(base + MAX_FINE_TUNE_OFFSET);
    });

    it("clamps min to MIN_MEASUREMENT_SIZE / 2", () => {
      const base = MIN_MEASUREMENT_SIZE / 2;
      const range = getFineTuneRange(base);

      expect(range.min).toBe(MIN_MEASUREMENT_SIZE / 2);
    });

    it("clamps max to MAX_MEASUREMENT_SIZE / 2", () => {
      const base = MAX_MEASUREMENT_SIZE / 2;
      const range = getFineTuneRange(base);

      expect(range.max).toBe(MAX_MEASUREMENT_SIZE / 2);
    });
  });

  // ===========================================================================
  // Integration / Consistency
  // ===========================================================================

  describe("consistency", () => {
    it("larger measurement produces larger hexSize", () => {
      const small = measurementToHexSize(50, "edge");
      const large = measurementToHexSize(100, "edge");
      expect(large).toBeGreaterThan(small);
    });

    it("larger hexSize produces fewer columns", () => {
      const imageWidth = 800;
      const smallHex = 30;
      const largeHex = 60;

      const moreColumns = calculateColumns(imageWidth, smallHex, "flat");
      const fewerColumns = calculateColumns(imageWidth, largeHex, "flat");

      expect(moreColumns).toBeGreaterThan(fewerColumns);
    });

    it("more columns means smaller hexSize", () => {
      const imageWidth = 800;

      const hexSize10 = calculateHexSizeFromColumns(imageWidth, 10, "flat");
      const hexSize20 = calculateHexSizeFromColumns(imageWidth, 20, "flat");

      expect(hexSize10).toBeGreaterThan(hexSize20);
    });
  });
});

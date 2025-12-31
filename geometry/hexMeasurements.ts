/**
 * hexMeasurements.ts
 * 
 * Pure functions for hex measurement conversions and grid sizing calculations.
 * Handles conversions between different measurement methods (edge-to-edge, 
 * corner-to-corner) and hexSize (center-to-vertex radius).
 * 
 * Similar to offsetCoordinates.js, this module provides pure mathematical functions
 * with no side effects, state, or dependencies on other modules.
 * 
 * Used by MapSettingsModal for sizing UI and by calculation systems for grid generation.
 * 
 * MEASUREMENT TERMINOLOGY:
 * - hexSize: Center-to-vertex radius (internal representation)
 * - edge-to-edge: Distance between parallel flat sides (flat-to-flat)
 * - corner-to-corner: Distance between opposite vertices (point-to-point)
 * 
 * For both flat-top and pointy-top hexes:
 * - Corner-to-corner = 2 * hexSize (vertex to opposite vertex)
 * - Edge-to-edge = sqrt(3) * hexSize (flat side to opposite flat side)
 */

import type { HexOrientation } from '#types/settings/settings.types';

// ===========================================
// Type Definitions
// ===========================================

/** Measurement method */
export type MeasurementMethod = 'edge' | 'corner';

/** Grid calculation result */
export interface GridCalculation {
  columns: number;
  rows: number;
  hexSize: number;
}

/** Validation result */
export interface ValidationResult {
  valid: boolean;
  error: string | null;
}

/** Fine-tune range */
export interface FineTuneRange {
  min: number;
  max: number;
}

// ===========================================
// Constants
// ===========================================

/** Edge-to-edge measurement method */
const MEASUREMENT_EDGE: MeasurementMethod = 'edge';

/** Corner-to-corner measurement method */
const MEASUREMENT_CORNER: MeasurementMethod = 'corner';

/** Minimum hex size in pixels */
const MIN_MEASUREMENT_SIZE = 10;

/** Maximum hex size in pixels */
const MAX_MEASUREMENT_SIZE = 500;

/** Maximum fine-tune adjustment in pixels */
const MAX_FINE_TUNE_OFFSET = 3;

// ===========================================
// Core Conversions
// ===========================================

/**
 * Convert user measurement to hexSize (center-to-vertex radius)
 */
function measurementToHexSize(
  size: number,
  method: MeasurementMethod,
  orientation: HexOrientation = 'flat'
): number {
  if (method === MEASUREMENT_EDGE) {
    // Edge-to-edge = sqrt(3) * hexSize, so hexSize = size / sqrt(3)
    return size / Math.sqrt(3);
  } else {
    // Corner-to-corner = 2 * hexSize, so hexSize = size / 2
    return size / 2;
  }
}

/**
 * Convert hexSize to user measurement
 */
function hexSizeToMeasurement(
  hexSize: number,
  method: MeasurementMethod,
  orientation: HexOrientation = 'flat'
): number {
  if (method === MEASUREMENT_EDGE) {
    // Edge-to-edge = sqrt(3) * hexSize
    return hexSize * Math.sqrt(3);
  } else {
    // Corner-to-corner = 2 * hexSize
    return hexSize * 2;
  }
}

// ===========================================
// Grid Calculations
// ===========================================

/**
 * Calculate columns that fit in given width.
 * Uses ceiling to ensure full image coverage.
 */
function calculateColumns(
  imageWidth: number,
  hexSize: number,
  orientation: HexOrientation
): number {
  if (orientation === 'pointy') {
    // Pointy: columns * sqrt(3) * hexSize = imageWidth
    return Math.ceil(imageWidth / (hexSize * Math.sqrt(3)));
  } else {
    // Flat: hexSize * (2 + (columns - 1) * 1.5) = imageWidth
    // Solving for columns: (imageWidth / hexSize - 2) / 1.5 + 1
    // Simplified: (imageWidth / hexSize - 0.5) / 1.5
    return Math.ceil((imageWidth / hexSize - 0.5) / 1.5);
  }
}

/**
 * Calculate rows that fit in given height.
 * Uses ceiling to ensure full image coverage.
 */
function calculateRows(
  imageHeight: number,
  hexSize: number,
  orientation: HexOrientation
): number {
  if (orientation === 'pointy') {
    // Pointy: hexSize * (2 + (rows - 1) * 1.5) = imageHeight
    return Math.ceil((imageHeight / hexSize - 0.5) / 1.5);
  } else {
    // Flat: rows * sqrt(3) * hexSize = imageHeight
    return Math.ceil(imageHeight / (hexSize * Math.sqrt(3)));
  }
}

/**
 * Calculate hexSize from desired column count (density mode).
 * This is the inverse of calculateColumns.
 */
function calculateHexSizeFromColumns(
  imageWidth: number,
  columns: number,
  orientation: HexOrientation
): number {
  if (orientation === 'pointy') {
    // Pointy: imageWidth = columns * sqrt(3) * hexSize
    return imageWidth / (columns * Math.sqrt(3));
  } else {
    // Flat: imageWidth = hexSize * (2 + (columns - 1) * 1.5)
    return imageWidth / (2 + (columns - 1) * 1.5);
  }
}

/**
 * Calculate grid from user measurement (measurement mode / Advanced tab).
 * Primary API for "Advanced" mode where user specifies hex size directly.
 */
function calculateGridFromMeasurement(
  imageWidth: number,
  imageHeight: number,
  size: number,
  method: MeasurementMethod,
  orientation: HexOrientation = 'flat'
): GridCalculation {
  const hexSize = measurementToHexSize(size, method, orientation);
  const columns = calculateColumns(imageWidth, hexSize, orientation);
  const rows = calculateRows(imageHeight, hexSize, orientation);
  
  return {
    columns,
    rows,
    hexSize
  };
}

/**
 * Calculate grid from column count (density mode / Quick Setup tab).
 * Primary API for "Quick Setup" mode where user selects density preset or custom column count.
 */
function calculateGridFromColumns(
  imageWidth: number,
  imageHeight: number,
  columns: number,
  orientation: HexOrientation = 'flat'
): GridCalculation {
  const hexSize = calculateHexSizeFromColumns(imageWidth, columns, orientation);
  const rows = calculateRows(imageHeight, hexSize, orientation);
  
  return {
    columns,
    rows,
    hexSize
  };
}

// ===========================================
// Validation
// ===========================================

/**
 * Validate measurement size is within acceptable range
 */
function validateMeasurementSize(size: number): ValidationResult {
  if (size < MIN_MEASUREMENT_SIZE) {
    return { 
      valid: false, 
      error: `Hex size must be at least ${MIN_MEASUREMENT_SIZE}px` 
    };
  }
  if (size > MAX_MEASUREMENT_SIZE) {
    return { 
      valid: false, 
      error: `Hex size must be no more than ${MAX_MEASUREMENT_SIZE}px` 
    };
  }
  return { valid: true, error: null };
}

/**
 * Validate fine-tune offset is within acceptable range
 */
function validateFineTune(baseHexSize: number, adjustedHexSize: number): ValidationResult {
  const offset = Math.abs(adjustedHexSize - baseHexSize);
  
  if (offset > MAX_FINE_TUNE_OFFSET) {
    return { 
      valid: false, 
      error: `Fine-tune adjustment limited to ±${MAX_FINE_TUNE_OFFSET}px` 
    };
  }
  return { valid: true, error: null };
}

/**
 * Calculate allowed range for fine-tune adjustment
 */
function getFineTuneRange(baseHexSize: number): FineTuneRange {
  return {
    min: Math.max(MIN_MEASUREMENT_SIZE / 2, baseHexSize - MAX_FINE_TUNE_OFFSET),
    max: Math.min(MAX_MEASUREMENT_SIZE / 2, baseHexSize + MAX_FINE_TUNE_OFFSET)
  };
}

// ===========================================
// Exports
// ===========================================

return {
  // Constants
  MEASUREMENT_EDGE,
  MEASUREMENT_CORNER,
  MIN_MEASUREMENT_SIZE,
  MAX_MEASUREMENT_SIZE,
  MAX_FINE_TUNE_OFFSET,
  
  // Core conversions
  measurementToHexSize,
  hexSizeToMeasurement,
  
  // Grid calculations
  calculateColumns,
  calculateRows,
  calculateHexSizeFromColumns,
  calculateGridFromMeasurement,
  calculateGridFromColumns,
  
  // Validation
  validateMeasurementSize,
  validateFineTune,
  getFineTuneRange
};
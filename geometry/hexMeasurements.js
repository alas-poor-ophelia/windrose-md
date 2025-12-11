/**
 * hexMeasurements.js
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

// Measurement method constants
const MEASUREMENT_EDGE = 'edge';
const MEASUREMENT_CORNER = 'corner';

// Validation constants
const MIN_MEASUREMENT_SIZE = 10;   // Minimum hex size in pixels
const MAX_MEASUREMENT_SIZE = 500;  // Maximum hex size in pixels
const MAX_FINE_TUNE_OFFSET = 3;    // Maximum fine-tune adjustment in pixels

/**
 * Convert user measurement to hexSize (center-to-vertex radius)
 * 
 * @param {number} size - Measurement in pixels
 * @param {string} method - 'edge' or 'corner'
 * @param {string} orientation - 'flat' or 'pointy' (for API consistency, but math is same for both)
 * @returns {number} hexSize in pixels
 */
function measurementToHexSize(size, method, orientation = 'flat') {
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
 * 
 * @param {number} hexSize - Center-to-vertex radius in pixels
 * @param {string} method - 'edge' or 'corner'
 * @param {string} orientation - 'flat' or 'pointy' (for API consistency, but math is same for both)
 * @returns {number} Measurement in pixels
 */
function hexSizeToMeasurement(hexSize, method, orientation = 'flat') {
  if (method === MEASUREMENT_EDGE) {
    // Edge-to-edge = sqrt(3) * hexSize
    return hexSize * Math.sqrt(3);
  } else {
    // Corner-to-corner = 2 * hexSize
    return hexSize * 2;
  }
}

/**
 * Calculate columns that fit in given width
 * 
 * Uses ceiling to ensure full image coverage.
 * 
 * @param {number} imageWidth - Width in pixels
 * @param {number} hexSize - Center-to-vertex radius
 * @param {string} orientation - 'flat' or 'pointy'
 * @returns {number} Number of columns (ceiled to ensure coverage)
 */
function calculateColumns(imageWidth, hexSize, orientation) {
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
 * Calculate rows that fit in given height
 * 
 * Uses ceiling to ensure full image coverage.
 * 
 * @param {number} imageHeight - Height in pixels
 * @param {number} hexSize - Center-to-vertex radius
 * @param {string} orientation - 'flat' or 'pointy'
 * @returns {number} Number of rows (ceiled to ensure coverage)
 */
function calculateRows(imageHeight, hexSize, orientation) {
  if (orientation === 'pointy') {
    // Pointy: hexSize * (2 + (rows - 1) * 1.5) = imageHeight
    return Math.ceil((imageHeight / hexSize - 0.5) / 1.5);
  } else {
    // Flat: rows * sqrt(3) * hexSize = imageHeight
    return Math.ceil(imageHeight / (hexSize * Math.sqrt(3)));
  }
}

/**
 * Calculate hexSize from desired column count (density mode)
 * 
 * This is the inverse of calculateColumns - given a target number of columns,
 * calculates the hexSize needed to achieve that.
 * 
 * @param {number} imageWidth - Width in pixels
 * @param {number} columns - Desired number of columns
 * @param {string} orientation - 'flat' or 'pointy'
 * @returns {number} hexSize in pixels
 */
function calculateHexSizeFromColumns(imageWidth, columns, orientation) {
  if (orientation === 'pointy') {
    // Pointy: imageWidth = columns * sqrt(3) * hexSize
    return imageWidth / (columns * Math.sqrt(3));
  } else {
    // Flat: imageWidth = hexSize * (2 + (columns - 1) * 1.5)
    return imageWidth / (2 + (columns - 1) * 1.5);
  }
}

/**
 * Calculate grid from user measurement (measurement mode / Advanced tab)
 * 
 * Primary API for "Advanced" mode where user specifies hex size directly.
 * 
 * @param {number} imageWidth - Image width in pixels
 * @param {number} imageHeight - Image height in pixels
 * @param {number} size - User's measurement in pixels
 * @param {string} method - 'edge' or 'corner'
 * @param {string} orientation - 'flat' or 'pointy'
 * @returns {{columns: number, rows: number, hexSize: number}}
 */
function calculateGridFromMeasurement(imageWidth, imageHeight, size, method, orientation = 'flat') {
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
 * Calculate grid from column count (density mode / Quick Setup tab)
 * 
 * Primary API for "Quick Setup" mode where user selects density preset or custom column count.
 * 
 * @param {number} imageWidth - Image width in pixels
 * @param {number} imageHeight - Image height in pixels
 * @param {number} columns - Desired number of columns
 * @param {string} orientation - 'flat' or 'pointy'
 * @returns {{columns: number, rows: number, hexSize: number}}
 */
function calculateGridFromColumns(imageWidth, imageHeight, columns, orientation = 'flat') {
  const hexSize = calculateHexSizeFromColumns(imageWidth, columns, orientation);
  const rows = calculateRows(imageHeight, hexSize, orientation);
  
  return {
    columns,
    rows,
    hexSize
  };
}

/**
 * Validate measurement size is within acceptable range
 * 
 * @param {number} size - Measurement in pixels
 * @returns {{valid: boolean, error: string|null}}
 */
function validateMeasurementSize(size) {
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
 * 
 * @param {number} baseHexSize - Calculated base hex size
 * @param {number} adjustedHexSize - User's adjusted hex size
 * @returns {{valid: boolean, error: string|null}}
 */
function validateFineTune(baseHexSize, adjustedHexSize) {
  const offset = Math.abs(adjustedHexSize - baseHexSize);
  
  if (offset > MAX_FINE_TUNE_OFFSET) {
    return { 
      valid: false, 
      error: `Fine-tune adjustment limited to Â±${MAX_FINE_TUNE_OFFSET}px` 
    };
  }
  return { valid: true, error: null };
}

/**
 * Calculate allowed range for fine-tune adjustment
 * 
 * @param {number} baseHexSize - Calculated base hex size
 * @returns {{min: number, max: number}}
 */
function getFineTuneRange(baseHexSize) {
  return {
    min: Math.max(MIN_MEASUREMENT_SIZE / 2, baseHexSize - MAX_FINE_TUNE_OFFSET),
    max: Math.min(MAX_MEASUREMENT_SIZE / 2, baseHexSize + MAX_FINE_TUNE_OFFSET)
  };
}

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
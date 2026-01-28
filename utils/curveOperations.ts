/**
 * curveOperations.ts
 *
 * Pure functions for curve CRUD operations.
 * Similar pattern to edgeOperations.ts.
 *
 * CURVE DATA STRUCTURE:
 * {
 *   id: string,           // Unique identifier
 *   points: CurvePoint[], // Control points [[x,y], ...]
 *   color: string,        // Hex color code
 *   opacity?: number,     // Optional opacity (0-1)
 *   strokeWidth?: number, // Line width
 *   smoothing?: number,   // Catmull-Rom tension
 *   closed?: boolean      // Whether curve is closed
 * }
 */

// Type-only imports
import type {
  Curve,
  CurveId,
  CurvePoint,
  CurveTemplate,
  CurveUpdate,
  CurveBounds,
} from '#types/core/curve.types';

// Datacore imports
const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

const { getCurveBounds, isPointNearCurve } = await requireModuleByName("curveMath.ts") as {
  getCurveBounds: (points: CurvePoint[]) => CurveBounds | null;
  isPointNearCurve: (points: CurvePoint[], point: CurvePoint, threshold: number, tension: number) => boolean;
};

// ===========================================================================
// ID Generation
// ===========================================================================

/**
 * Generate a unique curve ID
 */
function generateCurveId(): CurveId {
  return 'curve-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// ===========================================================================
// CRUD Operations
// ===========================================================================

/**
 * Add a new curve to the array.
 * Generates a unique ID for the curve.
 *
 * @param curves - Existing curves array (or null/undefined)
 * @param template - Curve data without ID
 * @returns New array with the added curve
 */
function addCurve(
  curves: Curve[] | null | undefined,
  template: CurveTemplate
): Curve[] {
  const curveArray = curves || [];

  const newCurve: Curve = {
    id: generateCurveId(),
    ...template,
  };

  return [...curveArray, newCurve];
}

/**
 * Remove a curve by ID.
 *
 * @param curves - Existing curves array
 * @param curveId - ID of curve to remove
 * @returns New array without the removed curve
 */
function removeCurve(
  curves: Curve[] | null | undefined,
  curveId: CurveId
): Curve[] {
  if (!curves || !Array.isArray(curves)) return [];
  return curves.filter(c => c.id !== curveId);
}

/**
 * Update curve properties by ID.
 *
 * @param curves - Existing curves array
 * @param curveId - ID of curve to update
 * @param updates - Partial curve properties to update
 * @returns New array with the updated curve
 */
function updateCurve(
  curves: Curve[] | null | undefined,
  curveId: CurveId,
  updates: CurveUpdate
): Curve[] {
  if (!curves || !Array.isArray(curves)) return [];

  return curves.map(curve => {
    if (curve.id === curveId) {
      return { ...curve, ...updates };
    }
    return curve;
  });
}

/**
 * Get a curve by ID.
 *
 * @param curves - Curves array to search
 * @param curveId - ID to find
 * @returns The curve or null if not found
 */
function getCurveById(
  curves: Curve[] | null | undefined,
  curveId: CurveId
): Curve | null {
  if (!curves || !Array.isArray(curves)) return null;
  return curves.find(c => c.id === curveId) || null;
}

// ===========================================================================
// Query Operations
// ===========================================================================

/**
 * Get all curves that overlap with a bounding box.
 *
 * @param curves - Curves to search
 * @param bounds - Bounding box to check
 * @returns Curves that overlap the bounds
 */
function getCurvesInBounds(
  curves: Curve[] | null | undefined,
  bounds: CurveBounds
): Curve[] {
  if (!curves || !Array.isArray(curves)) return [];

  return curves.filter(curve => {
    const curveBounds = getCurveBounds(curve.points);
    if (!curveBounds) return false;

    // Check if bounding boxes overlap
    return !(
      curveBounds.maxX < bounds.minX ||
      curveBounds.minX > bounds.maxX ||
      curveBounds.maxY < bounds.minY ||
      curveBounds.minY > bounds.maxY
    );
  });
}

/**
 * Find the first curve near a point (for selection).
 *
 * @param curves - Curves to search
 * @param point - Query point [x, y]
 * @param threshold - Maximum distance to consider "near"
 * @param tension - Curve smoothing (for Catmull-Rom)
 * @returns First curve within threshold or null
 */
function getCurveAtPoint(
  curves: Curve[] | null | undefined,
  point: CurvePoint,
  threshold: number,
  tension: number
): Curve | null {
  if (!curves || !Array.isArray(curves)) return null;

  for (const curve of curves) {
    const curveTension = curve.smoothing ?? tension;
    if (isPointNearCurve(curve.points, point, threshold, curveTension)) {
      return curve;
    }
  }

  return null;
}

// ===========================================================================
// Bulk Operations
// ===========================================================================

/**
 * Clear all curves.
 *
 * @returns Empty array
 */
function clearAllCurves(): Curve[] {
  return [];
}

// ===========================================================================
// Exports (Datacore module format)
// ===========================================================================

return {
  generateCurveId,
  addCurve,
  removeCurve,
  updateCurve,
  getCurveById,
  getCurvesInBounds,
  getCurveAtPoint,
  clearAllCurves,
};

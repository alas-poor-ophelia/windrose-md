/**
 * useFreehandDrawing.ts
 *
 * Custom hook for freehand curve drawing on the map canvas.
 * Handles point capture during drawing and creates curves from the captured path.
 *
 * POC implementation - kept separate from useDrawingTools for clarity.
 */

// Type-only imports
import type { Point, IGeometry } from '#types/core/geometry.types';
import type { MapData, MapLayer } from '#types/core/map.types';
import type { Curve, CurvePoint, CurveTemplate } from '#types/core/curve.types';

// Datacore imports
const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

// Context types
interface MapStateValue {
  geometry: IGeometry | null;
  canvasRef: { current: HTMLCanvasElement | null };
  mapData: MapData | null;
  screenToWorld: (clientX: number, clientY: number) => { worldX: number; worldY: number } | null;
  getClientCoords: (e: PointerEvent | MouseEvent | TouchEvent) => { clientX: number; clientY: number };
}

interface MapOperationsValue {
  onCurvesChange: (curves: Curve[], skipHistory?: boolean) => void;
}

const { useMapState, useMapOperations } = await requireModuleByName("MapContext.tsx") as {
  useMapState: () => MapStateValue;
  useMapOperations: () => MapOperationsValue;
};

const { getActiveLayer } = await requireModuleByName("layerAccessor.ts") as {
  getActiveLayer: (mapData: MapData) => MapLayer;
};

const { simplifyPath } = await requireModuleByName("curveMath.ts") as {
  simplifyPath: (points: CurvePoint[], epsilon: number) => CurvePoint[];
};

const { addCurve } = await requireModuleByName("curveOperations.ts") as {
  addCurve: (curves: Curve[], template: CurveTemplate) => Curve[];
};

// ===========================================================================
// Hook Result Type
// ===========================================================================

export interface UseFreehandDrawingResult {
  /** Whether drawing is in progress */
  isDrawing: boolean;

  /** Current preview points (for rendering) */
  previewPoints: CurvePoint[];

  /** Start drawing at pointer position */
  startDrawing: (e: PointerEvent | MouseEvent | TouchEvent) => void;

  /** Continue drawing at pointer position */
  continueDrawing: (e: PointerEvent | MouseEvent | TouchEvent) => void;

  /** Finish drawing and create curve */
  finishDrawing: () => void;

  /** Cancel drawing without creating curve */
  cancelDrawing: () => void;
}

// ===========================================================================
// Configuration
// ===========================================================================

/** Minimum distance between captured points (world units) */
const MIN_POINT_DISTANCE = 3;

/** RDP simplification epsilon */
const SIMPLIFY_EPSILON = 2;

/** Minimum points needed to create a curve */
const MIN_CURVE_POINTS = 3;

// ===========================================================================
// Hook Implementation
// ===========================================================================

/**
 * Hook for freehand curve drawing.
 *
 * @param isActive - Whether the freehand tool is currently active
 * @param selectedColor - Color for the new curve
 * @param strokeWidth - Stroke width for the new curve
 * @param smoothing - Smoothing factor (0-1) for the new curve
 */
const useFreehandDrawing = (
  isActive: boolean,
  selectedColor: string,
  strokeWidth: number = 2,
  smoothing: number = 0.5
): UseFreehandDrawingResult => {
  const {
    mapData,
    screenToWorld,
    getClientCoords,
  } = useMapState();

  const { onCurvesChange } = useMapOperations();

  // State
  let isDrawing = false;
  let capturedPoints: CurvePoint[] = [];

  /**
   * Get world coordinates from pointer event.
   */
  const getWorldCoords = (e: PointerEvent | MouseEvent | TouchEvent): CurvePoint | null => {
    const { clientX, clientY } = getClientCoords(e);
    const world = screenToWorld(clientX, clientY);
    if (!world) return null;
    return [world.worldX, world.worldY];
  };

  /**
   * Calculate distance between two points.
   */
  const distance = (p1: CurvePoint, p2: CurvePoint): number => {
    return Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  };

  /**
   * Start drawing at pointer position.
   */
  const startDrawing = (e: PointerEvent | MouseEvent | TouchEvent): void => {
    if (!isActive || !mapData) return;

    const point = getWorldCoords(e);
    if (!point) return;

    isDrawing = true;
    capturedPoints = [point];
  };

  /**
   * Continue drawing at pointer position.
   */
  const continueDrawing = (e: PointerEvent | MouseEvent | TouchEvent): void => {
    if (!isDrawing || !isActive) return;

    const point = getWorldCoords(e);
    if (!point) return;

    // Only add point if it's far enough from the last one
    const lastPoint = capturedPoints[capturedPoints.length - 1];
    if (distance(point, lastPoint) >= MIN_POINT_DISTANCE) {
      capturedPoints.push(point);
    }
  };

  /**
   * Finish drawing and create the curve.
   */
  const finishDrawing = (): void => {
    if (!isDrawing || !mapData) {
      cancelDrawing();
      return;
    }

    // Need enough points to make a curve
    if (capturedPoints.length < MIN_CURVE_POINTS) {
      cancelDrawing();
      return;
    }

    // Simplify the path
    const simplifiedPoints = simplifyPath(capturedPoints, SIMPLIFY_EPSILON);

    // Need at least 2 points after simplification
    if (simplifiedPoints.length < 2) {
      cancelDrawing();
      return;
    }

    // Create curve template
    const template: CurveTemplate = {
      points: simplifiedPoints,
      color: selectedColor,
      opacity: 1,
      strokeWidth,
      smoothing,
      closed: false,
    };

    // Get current curves from active layer
    const layer = getActiveLayer(mapData);
    const currentCurves = layer.curves || [];

    // Add new curve
    const newCurves = addCurve(currentCurves, template);

    // Update map data
    onCurvesChange(newCurves);

    // Reset state
    isDrawing = false;
    capturedPoints = [];
  };

  /**
   * Cancel drawing without creating curve.
   */
  const cancelDrawing = (): void => {
    isDrawing = false;
    capturedPoints = [];
  };

  return {
    isDrawing,
    previewPoints: capturedPoints,
    startDrawing,
    continueDrawing,
    finishDrawing,
    cancelDrawing,
  };
};

// ===========================================================================
// Exports (Datacore module format)
// ===========================================================================

return {
  useFreehandDrawing,
};

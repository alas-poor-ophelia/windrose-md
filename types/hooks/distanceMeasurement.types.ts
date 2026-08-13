/**
 * Distance Measurement Hook Type Definitions
 * Path: types/hooks/distanceMeasurement.types.ts
 *
 * Types for useDistanceMeasurement hook - measures distances between cells.
 */

import type { DiagonalRule, DistanceDisplayFormat } from '../settings/settings.types';

// ===========================================
// Measurement Points
// ===========================================

/** Origin or target point for measurement */
export interface MeasurementPoint {
  x: number;
  y: number;
}

// ===========================================
// Distance Settings
// ===========================================

/** Resolved distance settings for measurement display */
export interface EffectiveDistanceSettings {
  distancePerCell: number;
  distanceUnit: string;
  gridDiagonalRule: DiagonalRule;
  displayFormat: DistanceDisplayFormat;
}

/** Per-map distance overrides */
export interface MapDistanceOverrides {
  useGlobalDistance?: boolean;
  distancePerCell?: number;
  distanceUnit?: string;
  gridDiagonalRule?: DiagonalRule;
  displayFormat?: DistanceDisplayFormat;
}

// ===========================================
// Hook Return Type
// ===========================================

/** Return type for useDistanceMeasurement hook */
export interface UseDistanceMeasurementResult {
  // State
  /** Committed route waypoints in click order */
  waypoints: MeasurementPoint[];
  /** Per-segment terrain ids (index i = waypoint i → i+1; null = unassigned) */
  segmentTerrains: (string | null)[];
  /** Live cursor cell for the preview segment (mouse); null when idle */
  previewTarget: MeasurementPoint | null;
  /** Per-committed-segment distances in cells (length = waypoints.length - 1) */
  segmentDistances: number[];
  /** Distance in cells of the preview segment (0 when no preview) */
  previewDistance: number;
  /** Running total in cells including the preview segment; null with no waypoints */
  totalDistance: number | null;
  /** Formatted running total for display */
  formattedTotal: string | null;
  /**
   * Formatted true Euclidean ("as the crow flies") running total, including
   * the preview segment; null with no waypoints or when displayFormat is
   * 'cells' (unit display opted out).
   */
  formattedEuclideanTotal: string | null;
  /** Formatted label per committed segment */
  formattedSegments: string[];
  distanceSettings: EffectiveDistanceSettings;

  // Handlers
  handleMeasureClick: (cellX: number, cellY: number, isTouch?: boolean) => void;
  handleMeasureMove: (cellX: number, cellY: number) => void;
  removeLastWaypoint: () => void;
  clearMeasurement: () => void;
  /** Assign a terrain (null = unassigned) to a committed segment */
  assignSegmentTerrain: (segmentIndex: number, terrainId: string | null) => void;
}

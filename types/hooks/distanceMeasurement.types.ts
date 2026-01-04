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
  measureOrigin: MeasurementPoint | null;
  currentTarget: MeasurementPoint | null;
  currentDistance: number | null;
  formattedDistance: string | null;
  distanceSettings: EffectiveDistanceSettings;
  isTargetLocked: boolean;

  // Handlers
  handleMeasureClick: (cellX: number, cellY: number, isTouch?: boolean) => void;
  handleMeasureMove: (cellX: number, cellY: number) => void;
  clearMeasurement: () => void;
}

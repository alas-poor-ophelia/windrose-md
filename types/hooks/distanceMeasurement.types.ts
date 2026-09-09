/**
 * Distance Measurement Hook Type Definitions
 * Path: types/hooks/distanceMeasurement.types.ts
 *
 * Types for useDistanceMeasurement hook - measures distances between cells.
 */

import type { DiagonalRule, DistanceDisplayFormat } from '../settings/settings.types';
import type { Point } from '../core/geometry.types';

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
// Automatic terrain categorization
// ===========================================

/**
 * Automatic segment-terrain sampling bound to a live map (see
 * useTerrainSampling). `available` is false when no enabled pack defines a
 * terrain, or the map has nothing to sample — both sample calls then return
 * "no result" rather than throwing.
 */
export interface RouteTerrainSampling {
  available: boolean;
  /** Terrain for the crossing a→b, or null when nothing on the line matched */
  sampleSegment: (a: Point, b: Point, previousTerrainId: string | null) => string | null;
  /** One result per segment of a waypoint sequence (points.length - 1) */
  sampleRoute: (points: readonly Point[], firstSegmentTerrainId: string | null) => (string | null)[];
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
  /**
   * Per-segment "the sampler owns this" flags, normalized to one entry per
   * segment. A hand-picked segment reads false and survives every automatic
   * pass short of an explicit recategorization.
   */
  segmentTerrainAuto: boolean[];
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
  /**
   * Re-sample every segment from the map, overwriting hand-picked segments
   * too (the explicit "recategorize terrain" command). No-op without a
   * sampler or with fewer than two waypoints.
   */
  recategorizeRoute: () => void;
}

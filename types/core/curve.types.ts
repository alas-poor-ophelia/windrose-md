/**
 * Curve Type Definitions
 * Path: types/core/curve.types.ts
 *
 * Freehand curve data model for vector path storage.
 * Uses even-odd fill rule for compound paths with holes.
 */

// ===========================================
// Identifiers
// ===========================================

/** Unique curve identifier */
export type CurveId = string;

// ===========================================
// Segment Types
// ===========================================

/** A cubic bezier segment: [cp1x, cp1y, cp2x, cp2y, endX, endY] */
export type BezierSegment = [number, number, number, number, number, number];

// ===========================================
// Curve Data
// ===========================================

/**
 * A freehand curve stored as vector path data.
 * Rendered with even-odd fill rule for holes.
 */
export interface Curve {
  id: CurveId;
  /** Starting point of the path [x, y] */
  start: [number, number];
  /** Cubic bezier segments from start point */
  segments: BezierSegment[];
  /** Whether the path is closed (endpoint snapped to start) */
  closed: boolean;
  /** Fill color (hex string) — only used when closed */
  color: string;
  /** Fill opacity (0-1) */
  opacity: number;
  /** Stroke color */
  strokeColor: string;
  /** Stroke width in world units */
  strokeWidth: number;
  /**
   * Interior holes from boolean subtraction.
   * Each ring is a closed polygon as [[x,y], [x,y], ...] coordinate pairs.
   * Counter-wound relative to outer boundary for even-odd fill.
   */
  innerRings?: [number, number][][];
}

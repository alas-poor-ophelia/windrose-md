/** A cubic bezier segment: [cp1x, cp1y, cp2x, cp2y, endX, endY] */
export type BezierSegment = [number, number, number, number, number, number];

export interface Curve {
  id: string;
  start: [number, number];
  segments: BezierSegment[];
  closed: boolean;
  color: string;
  opacity: number;
  strokeColor: string;
  strokeWidth: number;
  innerRings?: [number, number][][];
}

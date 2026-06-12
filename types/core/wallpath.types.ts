/**
 * Wall Path Type Definitions
 *
 * Walls and paths are textures swept along user-drawn polylines whose
 * segments can optionally curve (Dungeondraft-style walls). Unlike the
 * freehand Curve type (implicit anchors inside a fitted bezier chain),
 * WallPath stores explicit, hand-editable vertices.
 */

// ===========================================
// Wall Path
// ===========================================

/** Wall path identifier */
export type WallPathId = string;

/**
 * A vertex on a wall path, in world coordinates.
 *
 * `arc` is the single quadratic-bezier control point for the segment LEAVING
 * this vertex (toward the next vertex) — Dungeondraft's ArcVector2 model.
 * Absent = the segment is a straight line. The last vertex's `arc` is only
 * meaningful when the path is closed (it curves the closing segment).
 */
export interface WallVertex {
  x: number;
  y: number;
  arc?: [number, number];
}

/**
 * A texture strip swept along an editable polyline.
 *
 * The strip asset is referenced like a tile (tilesetId + tileId); its
 * metadata entry (windrose-tile-metadata.json) supplies the native strip
 * height, paired `_end` cap texture, and default tint.
 */
export interface WallPath {
  id: WallPathId;
  /** Polyline anchors in world coordinates. Minimum 2. */
  vertices: WallVertex[];
  /** Closed loop: an implicit segment joins the last vertex back to the first. */
  closed: boolean;
  /** Strip asset reference, resolved like a tile. */
  tilesetId: string;
  tileId: string;
  /** Wall (thin, structural) or path (wide, decorative). Affects defaults only. */
  kind: 'wall' | 'path';
  /**
   * Rendered width multiplier. 1.0 = the strip's native pixel height mapped
   * through the pack's authoring scale (256 px per cell). @default 1
   */
  widthScale: number;
  /** Multiply tint (hex, no '#'). Absent = untinted. */
  tint?: string;
  /** Reverse the texture's travel direction along the path. @default false */
  flip?: boolean;
}

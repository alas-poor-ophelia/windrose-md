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
 * Seated door/window art bound into a WallGap. NOT a `layer.tiles` record —
 * an embedded property of its host gap, so it rides the gap through every
 * wall edit and undo/redo as a single WallPath replacement.
 */
export interface WallGapTile {
  tilesetId: string;
  /** Canonicalized folder-relative id, canonicalized at save like WallPath.tileId. */
  tileId: string;
  /** Extra rotation (radians) beyond the wall tangent (rare). @default 0 */
  rotation?: number;
  /** Mirror across the wall normal (DD "Rotate 180"). */
  flip?: boolean;
  /** Optional per-opening multiply tint (hex, no '#'). */
  tint?: string;
  /**
   * Perpendicular leaf-height multiplier applied ON TOP of the widthScale-tracking
   * default (so leaf height ≈ wall thickness). @default 1
   */
  heightScale?: number;
}

/**
 * An opening (door / window / threshold) living inside its host WallPath.
 *
 * A gap is anchored to a LOGICAL segment (not global path arc length), so edits
 * to unrelated segments cannot move it. `tile` absent = a bare capped doorway.
 *
 * Invariant classes (see OPENINGS-PLAN §2.2):
 *  - Structural (1,2): dropped at load if violated.
 *  - Geometric (3,4): CLAMP/NUDGE at derive/edit, never drop; stored values
 *    (including `tile`) are preserved verbatim.
 */
export interface WallGap {
  /** Stable id minted at insert ('gap-' + Date.now() + '-' + rand). */
  id: string;
  /**
   * Index of the logical segment the gap sits on: segment i spans
   * vertices[i] -> vertices[(i+1) % V]. Valid range 0 .. (closed ? V-1 : V-2).
   */
  seg: number;
  /** 0..1 CENTER position along the segment's flattened arc length. */
  t: number;
  /**
   * Gap length along the wall, in GRID CELLS (resolution-independent;
   * world width = widthCells * cellSize).
   */
  widthCells: number;
  /** True once the user resizes; suppresses tile-derived auto-size. */
  widthLocked?: boolean;
  /** Absent = bare threshold (empty capped gap). */
  tile?: WallGapTile;
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
  /** Openings (doors/windows/thresholds). Absent/[] = solid wall. */
  gaps?: WallGap[];
}

/**
 * Live control surface published by WallLayer for the tile-drawer footer.
 *
 * WallLayer owns all wall-tool transient state (draw vertices, snap toggles,
 * the selected wall). The relocated toolbar controls live in the drawer footer
 * — a sibling component tree — so WallLayer mirrors the state and actions those
 * controls need into this object. `null` when the wall tool is inactive.
 */
export interface WallToolSurface {
  /** 'edit' when an existing wall is selected and nothing is being drawn; else 'draw'. */
  mode: 'draw' | 'edit';
  /** A wall/path strip asset is armed as the active brush. */
  hasAsset: boolean;
  /** Armed strip kind, for the leading icon. */
  assetKind: 'wall' | 'path';
  /**
   * Which brush form the wall tool is servicing: 'strip' (draw/edit walls) or
   * 'opening' (a portal is armed → click a wall to seat a door/window). Drives
   * the footer's opening hint vs the draw/edit controls.
   */
  assetForm: 'strip' | 'opening';
  // --- draw mode ---
  isDrawing: boolean;
  vertexCount: number;
  snapEnabled: boolean;
  angleSnapEnabled: boolean;
  canFinish: boolean;
  toggleSnap: () => void;
  toggleAngleSnap: () => void;
  undoLastPoint: () => void;
  cancelDrawing: () => void;
  finishWall: () => void;
  // --- edit mode (null unless mode === 'edit') ---
  edit: {
    vertexCount: number;
    widthScale: number;
    flip: boolean;
    setWidth: (v: number) => void;
    toggleFlip: () => void;
    deleteWall: () => void;
    deselect: () => void;
    /**
     * Selected-gap controls (null unless a gap handle is selected). Editing a gap
     * takes over the footer from the whole-wall controls: gap width, art flip,
     * unbind-to-threshold, delete gap.
     */
    gap: {
      /** Stored gap width in grid cells. */
      widthCells: number;
      /** Seated art is mirrored across the wall normal. */
      flip: boolean;
      /** Gap has seated art (false = bare threshold; flip/unbind disabled). */
      bound: boolean;
      setWidth: (cells: number) => void;
      toggleFlip: () => void;
      unbind: () => void;
      deleteGap: () => void;
      deselectGap: () => void;
    } | null;
  } | null;
}

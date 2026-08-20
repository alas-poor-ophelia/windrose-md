/**
 * subHexBackdrop.ts
 *
 * Pure placement math for the sub-hex backdrop: a still frame of the parent map,
 * captured when the user dives into a hex and drawn behind the sub-map so the
 * dive doesn't open onto an empty void. The snapshot is a bitmap of the parent
 * canvas as it looked at dive time and never re-renders — the only thing that
 * changes is WHERE it lands on screen as the sub-map is panned and zoomed.
 *
 * A sub-map's world space is a UNIFORM remap of its parent hex (see
 * subHexAnchorToChildCenter / subHexChildPointToParentOffset in hexMeasurements
 * — one scale, both axes, same ratio as subHexContinuityZoom), so every child
 * view has an equivalent PARENT view: zoom divided by the continuity ratio,
 * center mapped back through the parent hex. Placing the snapshot is then just
 * projecting its own capture-time parent view into that equivalent view — one
 * axis-aligned drawImage rect that pans in exact lockstep with the child grid.
 */

import { subHexChildPointToParentOffset, subHexContinuityZoom } from './hexMeasurements';

// ===========================================
// Type Definitions
// ===========================================

/** A map view: world-space center plus zoom. */
export interface BackdropView {
  zoom: number;
  center: { x: number; y: number };
}

/** Everything about the parent map that placing its snapshot requires. */
export interface SubHexBackdropCapture {
  /** Parent view the canvas was showing when the snapshot was taken. */
  view: BackdropView;
  /** Parent canvas size, in canvas pixels, when the snapshot was taken. */
  canvasSize: { width: number; height: number };
  /** World-space center of the parent hex that was dived into. */
  hexCenterWorld: { x: number; y: number };
  /** Parent hex size (center-to-vertex radius). */
  parentHexSize: number;
  /** Sub-map hex size (normally inherited from the parent). */
  childHexSize: number;
  /** Sub-grid rings — one parent hex spans (rings * 2 + 1) child cells. */
  rings: number;
  orientation: string;
  /** Parent map rotation, in degrees. */
  northDirection: number;
}

/** Destination canvas a backdrop is being drawn onto. */
export interface SubHexBackdropTarget {
  width: number;
  height: number;
  /** Sub-map rotation, in degrees. */
  northDirection: number;
}

/** drawImage destination rect for the snapshot, in target canvas pixels. */
export interface SubHexBackdropPlacement {
  dx: number;
  dy: number;
  drawW: number;
  drawH: number;
}

// ===========================================
// Placement
// ===========================================

/**
 * Where to blit the parent snapshot for the sub-map's current view.
 * Returns null when the backdrop must not be drawn at all.
 */
function computeBackdropPlacement(
  childView: BackdropView,
  capture: SubHexBackdropCapture,
  target: SubHexBackdropTarget
): SubHexBackdropPlacement | null {
  // An axis-aligned drawImage rect cannot express a rotated map, and the
  // snapshot itself was rasterized under the parent's own rotation. Sub-maps
  // the plugin creates are always unrotated, so a rotated parent or child
  // skips the backdrop rather than drawing it askew.
  if (capture.northDirection !== 0 || target.northDirection !== 0) return null;

  const { parentHexSize, childHexSize, rings } = capture;
  if (!(parentHexSize > 0) || !(childHexSize > 0) || !(rings >= 0)) return null;
  const ratio = subHexContinuityZoom(1, parentHexSize, childHexSize, rings);
  if (!(ratio > 0) || !Number.isFinite(ratio)) return null;
  if (!(capture.view.zoom > 0) || !(childView.zoom > 0)) return null;
  if (!(capture.canvasSize.width > 0) || !(capture.canvasSize.height > 0)) return null;

  // The parent view this child view is effectively looking through.
  const parentZoom = childView.zoom / ratio;
  const offset = subHexChildPointToParentOffset(
    childView.center.x,
    childView.center.y,
    parentHexSize,
    childHexSize,
    rings
  );
  const parentCenterX = capture.hexCenterWorld.x + offset.x;
  const parentCenterY = capture.hexCenterWorld.y + offset.y;

  // screen = canvasSize/2 + (world − center) · zoom, so the snapshot's own
  // top-left pixel is the parent-world point half a capture-canvas (in world
  // units) up-left of its capture center. Project that point into the current
  // view, and scale the bitmap by the ratio of the two zooms.
  const scale = parentZoom / capture.view.zoom;
  const originX = capture.view.center.x - (capture.canvasSize.width / 2) / capture.view.zoom;
  const originY = capture.view.center.y - (capture.canvasSize.height / 2) / capture.view.zoom;
  const dx = target.width / 2 + (originX - parentCenterX) * parentZoom;
  const dy = target.height / 2 + (originY - parentCenterY) * parentZoom;
  const drawW = capture.canvasSize.width * scale;
  const drawH = capture.canvasSize.height * scale;

  if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(drawW) || !Number.isFinite(drawH)) {
    return null;
  }
  // Panned clear of the parent hex: nothing of the snapshot is on screen.
  if (dx + drawW <= 0 || dy + drawH <= 0 || dx >= target.width || dy >= target.height) return null;

  return { dx, dy, drawW, drawH };
}

// ===========================================
// Exports
// ===========================================

export { computeBackdropPlacement };

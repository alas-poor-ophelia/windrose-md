/**
 * subHexBackdropStore.ts
 *
 * Holds the parent-map snapshots that back the sub-hex backdrop — read-only
 * stills of the parent canvas taken at dive time, so drilling into a hex
 * doesn't drop the world into a void. Explicitly NOT live renders: bitmaps,
 * captured once per dive and discarded when the user leaves that level.
 *
 * Keying is per canvas (WeakMap — two co-mounted map views can't clobber
 * each other, and entries die with their canvas) and, within a canvas, per
 * drill path. Per-PATH matters: a map view keeps ONE canvas across all drill
 * depths, so a single slot per canvas meant diving A→B erased A's snapshot —
 * surfacing B→A then had no backdrop to show. Each level's capture is
 * self-contained (own view/canvasSize/hexCenterWorld), and a snapshot taken
 * while viewing A already has A's own backdrop rasterized into it, so levels
 * coexist without any cross-referencing. Cost: one bitmap per open drill
 * level, pruned on exit/breadcrumb-jump and GC'd with the canvas.
 *
 * Sibling navigation RE-LABELS the departing level's entry instead of
 * recapturing: the snapshot depicts the PARENT map's world, identical for
 * adjacent siblings — only the hex the child sits behind changes. Capturing
 * the live canvas at sibling-nav time would snapshot the departing sibling's
 * own interior, which is the wrong imagery entirely.
 */

import type { MapData, StoredViewState } from '#types/core/map.types';
import type { IGeometry } from '#types/core/geometry.types';
import type { SubHexBackdropCapture } from '../geometry/core/subHexBackdrop';

import { DEFAULTS } from './dmtConstants';
import { getPaintedView } from './paintedViewStore';
import { traceZoom } from '../utils/zoomTraceProbe';

/** Rings a sub-map is created with; used when it doesn't exist yet. */
const DEFAULT_SUBDIVISION_RINGS = 7;

interface SubHexBackdropEntry {
  /** Copy of the parent canvas as it looked at dive time. */
  snapshot: HTMLCanvasElement;
  /** Canvas the snapshot came from — scopes the backdrop to one map view. */
  canvas: HTMLCanvasElement;
  /** Drill path this snapshot backs ('/'-joined "q,r" hexKeys). */
  subHexPath: string;
  capture: SubHexBackdropCapture;
}

interface CaptureSubHexBackdropOptions {
  /** Live map canvas, still showing the parent map. */
  canvas: HTMLCanvasElement | null;
  /** Map currently on screen — the parent of the hex being entered. */
  parentMapData: MapData;
  geometry: Pick<IGeometry, 'gridToWorld'> | null;
  q: number;
  r: number;
  /** Parent view the canvas is currently showing (live, not committed). */
  parentView: StoredViewState;
  /** Drill path of the parent map; null at root. */
  parentSubHexPath: string | null;
}

interface RelabelSubHexBackdropOptions {
  /** Canvas whose entry to re-label; null is a no-op. */
  canvas: HTMLCanvasElement | null;
  /** Drill path of the sibling being navigated AWAY from. */
  oldSubHexPath: string;
  /** Drill path of the sibling being navigated TO. */
  newSubHexPath: string;
  /** The target sibling's hex center in the PARENT map's world space. */
  hexCenterWorld: { x: number; y: number };
  /** Target sibling's hex size (its own, or inherited from the parent). */
  childHexSize: number;
  /** Target sibling's subdivision rings. */
  rings: number;
}

const entries = new WeakMap<HTMLCanvasElement, Map<string, SubHexBackdropEntry>>();

/**
 * Copy the live parent canvas and record everything needed to place it behind
 * the sub-map being entered. Only the TARGET path's entry is touched: a
 * failed capture (no geometry, zero-size canvas, rotated parent) removes any
 * stale entry at that path but leaves ancestor levels' snapshots intact.
 */
function captureSubHexBackdrop({
  canvas,
  parentMapData,
  geometry,
  q,
  r,
  parentView,
  parentSubHexPath
}: CaptureSubHexBackdropOptions): void {
  if (canvas == null) return;

  const hexKey = `${q},${r}`;
  const targetPath = parentSubHexPath != null && parentSubHexPath !== ''
    ? `${parentSubHexPath}/${hexKey}`
    : hexKey;

  entries.get(canvas)?.delete(targetPath);
  if (geometry == null) return;
  if (canvas.width <= 0 || canvas.height <= 0) return;
  if ((parentMapData.northDirection ?? 0) !== 0) return;

  const snapshot = activeWindow.createEl('canvas');
  snapshot.width = canvas.width;
  snapshot.height = canvas.height;
  const ctx = snapshot.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(canvas, 0, 0);

  const subHex = parentMapData.subHexMaps?.[hexKey];
  const parentHexSize = parentMapData.hexSize ?? DEFAULTS.hexSize;
  const hexCenter = geometry.gridToWorld(q, r);

  // The snapshot copied the last PAINTED frame, which lags the live view by
  // up to a frame under fast gestures (rapid unsettled dive/surface cycles).
  // Label the bitmap with the view it actually depicts — labeling it with
  // the live view makes placement project it from a view it doesn't show
  // (backdrop wrong size / off center by gesture velocity × paint lag).
  const paintedView = getPaintedView(canvas) ?? parentView;
  traceZoom('capture', { liveZoom: parentView.zoom, paintedZoom: paintedView.zoom });

  let pathMap = entries.get(canvas);
  if (pathMap == null) {
    pathMap = new Map();
    entries.set(canvas, pathMap);
  }
  pathMap.set(targetPath, {
    snapshot,
    canvas,
    subHexPath: targetPath,
    capture: {
      view: { zoom: paintedView.zoom, center: { x: paintedView.center.x, y: paintedView.center.y } },
      canvasSize: { width: canvas.width, height: canvas.height },
      hexCenterWorld: { x: hexCenter.worldX, y: hexCenter.worldY },
      parentHexSize,
      childHexSize: subHex?.mapData.hexSize ?? parentHexSize,
      rings: subHex?.subdivisionRings ?? DEFAULT_SUBDIVISION_RINGS,
      orientation: subHex?.mapData.orientation ?? parentMapData.orientation ?? DEFAULTS.hexOrientation,
      northDirection: 0
    }
  });
}

/**
 * Point an existing snapshot at an adjacent sibling: same parent imagery,
 * new anchor hex. No-op when there is no entry to re-label (nothing would
 * have rendered anyway).
 */
function relabelSubHexBackdrop({
  canvas,
  oldSubHexPath,
  newSubHexPath,
  hexCenterWorld,
  childHexSize,
  rings
}: RelabelSubHexBackdropOptions): void {
  if (canvas == null) return;
  const pathMap = entries.get(canvas);
  const entry = pathMap?.get(oldSubHexPath);
  if (pathMap == null || entry == null) return;
  traceZoom('relabel', { from: oldSubHexPath, to: newSubHexPath });
  pathMap.delete(oldSubHexPath);
  entry.subHexPath = newSubHexPath;
  entry.capture.hexCenterWorld = { x: hexCenterWorld.x, y: hexCenterWorld.y };
  entry.capture.childHexSize = childHexSize;
  entry.capture.rings = rings;
  pathMap.set(newSubHexPath, entry);
}

/** The snapshot backing this canvas at this drill path, or null. */
function getSubHexBackdrop(canvas: HTMLCanvasElement, subHexPath: string | null): SubHexBackdropEntry | null {
  if (subHexPath == null || subHexPath === '') return null;
  return entries.get(canvas)?.get(subHexPath) ?? null;
}

/**
 * Drop snapshots for this canvas: the one backing `subHexPath` when given
 * (leaving a level — ancestor levels' snapshots survive so surfacing can
 * show them), or every level's when omitted (unmount).
 */
function clearSubHexBackdrop(canvas?: HTMLCanvasElement | null, subHexPath?: string | null): void {
  if (canvas == null) return;
  if (subHexPath == null) {
    entries.delete(canvas);
    return;
  }
  entries.get(canvas)?.delete(subHexPath);
}

/**
 * Keep only the snapshots still on the active drill path (each retained
 * entry's path must be `currentPath` or a prefix of it); `null` clears all.
 * Used by breadcrumb jumps, which can leave several levels at once.
 */
function pruneSubHexBackdrops(canvas: HTMLCanvasElement | null, currentPath: string | null): void {
  if (canvas == null) return;
  if (currentPath == null || currentPath === '') {
    entries.delete(canvas);
    return;
  }
  const pathMap = entries.get(canvas);
  if (pathMap == null) return;
  for (const path of [...pathMap.keys()]) {
    if (path !== currentPath && !currentPath.startsWith(`${path}/`)) pathMap.delete(path);
  }
}

export type { SubHexBackdropEntry, CaptureSubHexBackdropOptions };
export { captureSubHexBackdrop, relabelSubHexBackdrop, getSubHexBackdrop, clearSubHexBackdrop, pruneSubHexBackdrops };

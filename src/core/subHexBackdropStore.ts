/**
 * subHexBackdropStore.ts
 *
 * Holds the parent-map snapshot that backs the sub-hex backdrop — a read-only
 * still of the parent canvas taken at dive time, so drilling into a hex doesn't
 * drop the world into a void. Explicitly NOT a live render of the parent: it is
 * a bitmap, captured once and discarded when the user surfaces.
 *
 * ONE slot, not a per-canvas map: a snapshot is a full-canvas bitmap, and only
 * the map view the user just dove into can be showing one. The stored canvas
 * and drill path are matched on read, so a second embed (or a stale entry left
 * by a dive the navigation didn't follow) simply renders no backdrop.
 */

import type { MapData, StoredViewState } from '#types/core/map.types';
import type { IGeometry } from '#types/core/geometry.types';
import type { SubHexBackdropCapture } from '../geometry/core/subHexBackdrop';

import { DEFAULTS } from './dmtConstants';

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

let entry: SubHexBackdropEntry | null = null;

/**
 * Copy the live parent canvas and record everything needed to place it behind
 * the sub-map. Any condition that would make the backdrop wrong (no canvas, a
 * rotated parent) clears the slot instead of storing a mismatched snapshot.
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
  entry = null;
  if (canvas == null || geometry == null) return;
  if (canvas.width <= 0 || canvas.height <= 0) return;
  if ((parentMapData.northDirection ?? 0) !== 0) return;

  const snapshot = activeWindow.createEl('canvas');
  snapshot.width = canvas.width;
  snapshot.height = canvas.height;
  const ctx = snapshot.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(canvas, 0, 0);

  const hexKey = `${q},${r}`;
  const subHex = parentMapData.subHexMaps?.[hexKey];
  const parentHexSize = parentMapData.hexSize ?? DEFAULTS.hexSize;
  const hexCenter = geometry.gridToWorld(q, r);

  entry = {
    snapshot,
    canvas,
    subHexPath: parentSubHexPath != null && parentSubHexPath !== ''
      ? `${parentSubHexPath}/${hexKey}`
      : hexKey,
    capture: {
      view: { zoom: parentView.zoom, center: { x: parentView.center.x, y: parentView.center.y } },
      canvasSize: { width: canvas.width, height: canvas.height },
      hexCenterWorld: { x: hexCenter.worldX, y: hexCenter.worldY },
      parentHexSize,
      childHexSize: subHex?.mapData.hexSize ?? parentHexSize,
      rings: subHex?.subdivisionRings ?? DEFAULT_SUBDIVISION_RINGS,
      orientation: subHex?.mapData.orientation ?? parentMapData.orientation ?? DEFAULTS.hexOrientation,
      northDirection: 0
    }
  };
}

/** The snapshot backing this canvas at this drill path, or null. */
function getSubHexBackdrop(canvas: HTMLCanvasElement, subHexPath: string | null): SubHexBackdropEntry | null {
  if (entry == null || subHexPath == null || subHexPath === '') return null;
  if (entry.canvas !== canvas || entry.subHexPath !== subHexPath) return null;
  return entry;
}

/** Drop the snapshot (surfacing, sibling navigation, breadcrumb jumps). */
function clearSubHexBackdrop(): void {
  entry = null;
}

export type { SubHexBackdropEntry, CaptureSubHexBackdropOptions };
export { captureSubHexBackdrop, getSubHexBackdrop, clearSubHexBackdrop };

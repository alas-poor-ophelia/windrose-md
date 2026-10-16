/**
 * ladderElementPass.ts
 *
 * Objects and text labels on a lattice-ladder map, drawn LIVE after the blit
 * and the lattice, so they sit on top of the grid lines (the classic order) and
 * stay crisp under the crossing scale-blit. Two passes share one banding:
 *
 *   - bandedMembersByRung: the band decision, made ONCE per frame. For each
 *     depth group (home rung, depth mode, explicit levels) visible on the active
 *     rung: the members over their size floor, plus the rung sizing the draw
 *     uses. Selection chrome is drawn only around what this returns, so chrome
 *     never appears around an element that was not drawn (or the reverse).
 *   - renderLadderElements: draws the banded set, culled to the viewport first.
 *   - renderLadderSelectionChrome: selection chrome for the banded set.
 *
 * Per-frame cost is O(visible elements): depth groups are memoised on the
 * element array (elementBands.groupByDepth), off-screen elements are culled
 * before any per-object work, and the hex slot lookup goes through a per-cell
 * index (getObjectsInCellIndexed) instead of a filter over the whole layer.
 */

import type { MapData, MapLayer } from '#types/core/map.types';
import type { MapObject } from '#types/objects/object.types';
import type { TextLabel } from '#types/objects/note.types';
import type { IGeometry } from '#types/core/geometry.types';
import type { LayerVisibility } from '#types/contexts/context.types';
import type { RendererSelectedItem } from '#types/hooks/canvasRenderer.types';
import type { GeometryLadder } from '../core/createGeometryLadder';
import type { DepthMode } from './elementBands';

import { OBJECT_FLOOR_PX, LABEL_FLOOR_PX, groupByDepth, groupVisibleAt, elementZoom, elementScale, objectRenderedPx, scaledSizeForRung } from './elementBands';
import { renderObjects } from './objectRenderer';
import { renderTextLabels } from './textLabelRenderer';
import { renderObjectSelections, renderTextLabelSelections } from './selectionRenderer';
import { objectRenderDeps } from './staticPasses';
import { fogDepsForRung } from '../fog/rungFog';
import { getFontCss } from '../../text/fontOptions';
import { getSlotOffset, getMultiObjectScale, getObjectsInCellIndexed } from '../../objects/hexSlotPositioner';

/** One visible object depth group, floored, with the sizing its rung draws at. */
interface BandedObjectGroup {
  home: number;
  mode: DepthMode;
  /** Members over OBJECT_FLOOR_PX, in layer order. */
  objects: MapObject[];
  /** The home rung's geometry: position and slots are laid out on it. */
  geometry: ReturnType<GeometryLadder['geometryForLevel']>;
  scaledSize: number;
  elementScale: number;
}

/** One visible label depth group, floored, with the held font zoom. */
interface BandedLabelGroup {
  home: number;
  /** Members over LABEL_FLOOR_PX, in layer order. */
  labels: TextLabel[];
  /** Font zoom (held under `persist`); positions use the real zoom. */
  fontZoom: number;
}

/** The frame's band decision, shared by the draw pass and the selection chrome. */
interface BandedMembers {
  objects: BandedObjectGroup[];
  labels: BandedLabelGroup[];
}

/** Where a ladder element pass draws: the live canvas, under the north rotation. */
interface LadderElementFrame {
  ctx: CanvasRenderingContext2D;
  offsetX: number;
  offsetY: number;
  zoom: number;
  width: number;
  height: number;
  northDirection: number;
}

/**
 * THE band decision for one frame: the depth groups of `layer`'s objects and
 * labels visible on `level`, each cut to the members over its floor. Empty
 * groups are dropped. The draw pass and the selection chrome both read this.
 */
function bandedMembersByRung(ladder: GeometryLadder, layer: MapLayer, level: number, zoom: number): BandedMembers {
  const objects: BandedObjectGroup[] = [];
  for (const group of groupByDepth(layer.objects)) {
    if (!groupVisibleAt(group, level, 'object')) continue;
    const { home, mode, members } = group;
    // The floor judges each object's own rendered width, not the cell's.
    const kept = members.filter((o) => objectRenderedPx(ladder, home, zoom, o.size?.width ?? 1, mode) >= OBJECT_FLOOR_PX);
    if (kept.length === 0) continue;
    objects.push({
      home, mode, objects: kept,
      geometry: ladder.geometryForLevel(home),
      scaledSize: scaledSizeForRung(ladder, home, zoom),
      elementScale: elementScale(ladder, home, zoom, mode),
    });
  }
  const labels: BandedLabelGroup[] = [];
  for (const group of groupByDepth(layer.textLabels)) {
    if (!groupVisibleAt(group, level, 'label')) continue;
    const { home, mode, members } = group;
    const fontZoom = elementZoom(ladder, home, zoom, mode);
    const kept = members.filter((label) => label.fontSize * fontZoom >= LABEL_FLOOR_PX);
    if (kept.length === 0) continue;
    labels.push({ home, labels: kept, fontZoom });
  }
  return { objects, labels };
}

interface ViewRect { minX: number; minY: number; maxX: number; maxY: number }

/**
 * The region the live canvas shows, in the pre-rotation pixel space element
 * positions are computed in: the canvas itself when unrotated, else a square of
 * the canvas's half-diagonal around its centre (covers every rotation).
 */
function viewRect(frame: LadderElementFrame): ViewRect {
  const { width, height } = frame;
  if (frame.northDirection % 360 === 0) return { minX: 0, minY: 0, maxX: width, maxY: height };
  const half = Math.hypot(width, height) / 2;
  return { minX: width / 2 - half, minY: height / 2 - half, maxX: width / 2 + half, maxY: height / 2 + half };
}

function nearView(rect: ViewRect, x: number, y: number, radius: number): boolean {
  return x + radius >= rect.minX && x - radius <= rect.maxX && y + radius >= rect.minY && y - radius <= rect.maxY;
}

/**
 * Conservative on-screen test for one object: its cell centre (or freeform
 * world point) against the view, widened by a radius covering the object's size
 * and scale, hex slot offsets, alignment and badges. Never culls an object with
 * a visible pixel; may keep a few just off screen.
 */
function objectNearView(obj: MapObject, group: BandedObjectGroup, frame: LadderElementFrame, rect: ViewRect): boolean {
  const { offsetX, offsetY, zoom } = frame;
  const { scaledSize } = group;
  const size = obj.size ?? { width: 1, height: 1 };
  const radius = (Math.max(size.width, size.height) * Math.max(1, obj.scale ?? 1) * 1.5 + 2) * scaledSize;
  if (obj.freeform === true && obj.worldPosition != null) {
    const { screenX, screenY } = group.geometry.worldToScreen(obj.worldPosition.x, obj.worldPosition.y, offsetX, offsetY, zoom);
    return nearView(rect, screenX, screenY, radius);
  }
  const { screenX, screenY } = group.geometry.gridToScreen(obj.position.x, obj.position.y, offsetX, offsetY, zoom);
  return nearView(rect, screenX + scaledSize / 2, screenY + scaledSize / 2, radius);
}

/**
 * Conservative on-screen test for one label: its anchor widened by a box the
 * text cannot outgrow (1.5 font sizes per character, any alignment or rotation).
 */
function labelNearView(label: TextLabel, fontZoom: number, geometry: IGeometry, frame: LadderElementFrame, rect: ViewRect): boolean {
  const { screenX, screenY } = geometry.worldToScreen(label.position.x, label.position.y, frame.offsetX, frame.offsetY, frame.zoom);
  const fontPx = label.fontSize * fontZoom;
  return nearView(rect, screenX, screenY, fontPx * ((label.content?.length ?? 0) * 1.5 + 4));
}

/**
 * Draws the banded objects then labels (the classic bake's order) on the live
 * canvas, culled to the view. `layer` is the active layer: fog and the hex slot
 * layout read the WHOLE layer, never just the drawn subset.
 */
function renderLadderElements(
  frame: LadderElementFrame,
  banded: BandedMembers,
  ladder: GeometryLadder,
  mapData: MapData,
  layer: MapLayer,
  geometry: IGeometry,
  visibility: LayerVisibility
): void {
  const rect = viewRect(frame);
  const { ctx, offsetX, offsetY, zoom } = frame;
  if (visibility.objects && banded.objects.length > 0) {
    const objectDeps = { ...objectRenderDeps(mapData), getObjectsInCell: getObjectsInCellIndexed };
    for (const group of banded.objects) {
      const objects = group.objects.filter((o) => objectNearView(o, group, frame, rect));
      if (objects.length === 0) continue;
      renderObjects(
        { ...layer, objects },
        { ctx, offsetX, offsetY, zoom, scaledSize: group.scaledSize, elementScale: group.elementScale, slotObjects: layer.objects },
        group.geometry,
        true,
        mapData.orientation ?? 'flat',
        // Fog is level-0 cell data: a deep object is fogged by its root ancestor hex.
        fogDepsForRung(ladder, group.home, objectDeps)
      );
    }
  }
  if (visibility.textLabels && banded.labels.length > 0) {
    for (const group of banded.labels) {
      const labels = group.labels.filter((label) => labelNearView(label, group.fontZoom, geometry, frame, rect));
      if (labels.length === 0) continue;
      // Position at the real zoom (world px are level-invariant); font at the held zoom.
      renderTextLabels(labels, { ctx, zoom: group.fontZoom, getFontCss }, geometry, { offsetX, offsetY, zoom });
    }
  }
}

/**
 * Selection chrome for the banded set: one call per depth group, on the home
 * rung's geometry, with the hold its element was drawn with. A selected element
 * outside the banded set (hidden, or under its floor) gets no chrome.
 */
function renderLadderSelectionChrome(
  frame: LadderElementFrame,
  banded: BandedMembers,
  selectedItems: RendererSelectedItem[],
  layer: MapLayer,
  geometry: IGeometry,
  baseScaledSize: number,
  visibility: LayerVisibility,
  isResizeMode: boolean,
  orientation: 'flat' | 'pointy'
): void {
  if (selectedItems.length === 0) return;
  const { ctx, offsetX, offsetY, zoom } = frame;
  if (visibility.textLabels !== false) {
    for (const group of banded.labels) {
      renderTextLabelSelections(selectedItems, group.labels, { ctx, offsetX, offsetY, zoom, scaledSize: baseScaledSize, fontZoom: group.fontZoom }, geometry, getFontCss);
    }
  }
  if (visibility.objects !== false) {
    const deps = { getObjectsInCell: getObjectsInCellIndexed, getSlotOffset, getMultiObjectScale };
    for (const group of banded.objects) {
      const ids = new Set(group.objects.map((o) => o.id));
      const items = selectedItems.filter((it) => it.type === 'object' && ids.has(it.id));
      if (items.length === 0) continue;
      renderObjectSelections(
        items,
        layer.objects,
        { ctx, offsetX, offsetY, zoom, scaledSize: group.scaledSize, elementScale: group.elementScale },
        group.geometry,
        group.geometry,
        true,
        isResizeMode,
        orientation,
        deps
      );
    }
  }
}

export type { BandedMembers, LadderElementFrame };
export { bandedMembersByRung, renderLadderElements, renderLadderSelectionChrome };

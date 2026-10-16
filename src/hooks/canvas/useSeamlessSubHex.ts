/**
 * useSeamlessSubHex.ts
 *
 * Seamless sub-hex dive/surface zoom: the zoom-driven transition between a
 * hex map and its sub-map, called from the wheel and touch-pinch zoom paths in
 * useCanvasInteraction. Owns the cooldown and approach-prewarm bookkeeping.
 */

import type { IGeometry } from '#types/core/geometry.types';
import type { MapData } from '#types/core/map.types';
import type { WorldCoords } from '#types/hooks/canvasInteraction.types';
import type { ViewController } from '#types/hooks/viewController.types';
import type { SubHexCoordDetail } from '../../core/windroseEvents';
import type { SubHexExitDetail } from '#types/hooks/canvasInteraction.types';

import { useRef } from 'preact/hooks';
import { DEFAULTS } from '../../core/dmtConstants';
import { getApp } from '../../core/settingsAccessor';
import { captureSubHexBackdrop } from '../../core/subHexBackdropStore';
import { prewarmMapAssets } from '../state/useImagePreloading';
import { traceZoom } from '../../utils/zoomTraceProbe';
import { clientToCanvasPx, rotateVector } from '../../geometry/core/viewportMath';
import { calculateFitZoom, subHexAnchorToChildCenter, subHexContinuityZoom } from '../../geometry/core/hexMeasurements';

/** Upper zoom clamp for wheel and pinch zooming. */
const MAX_WHEEL_ZOOM = 4;

/**
 * Seamless sub-hex zoom: dive when a zoom-in tick reaches the max-zoom ceiling
 * over a hex that has a sub-map; surface when a zoom-out tick drops below the
 * visual-continuity zoom (where the sub-map has shrunk back to the parent
 * hex's max-zoom footprint). Both swaps are footprint-matched, so entry sits
 * just above the surface threshold — the cooldown below is what keeps a
 * single wheel burst from ping-ponging across it.
 */
const SEAMLESS_DIVE_EPSILON = 0.001;
// Legacy surface threshold (fraction of the sub-map's fit zoom), used only
// for sub-maps without ring bounds where continuity can't be derived.
const SEAMLESS_SURFACE_FIT_FRACTION = 0.5;
/**
 * Surface hysteresis: a dive lands exactly at the continuity zoom, so a
 * surface threshold at that same value lets touch-pinch jitter (per-tick
 * scale noise around 1.0) eject the user right back out — dive/surface
 * ping-pong. Surfacing requires zooming a deliberate fraction BELOW the
 * entry zoom. The exit view is continuity-mapped from the ACTUAL zoom at
 * surface time, so this band costs no exit smoothness — only clearer intent.
 * (Symmetrically, the surfaced parent lands at this fraction of max zoom,
 * safely below the dive trigger.)
 */
const SEAMLESS_SURFACE_CONTINUITY_FRACTION = 0.8;
/** Ignore further transitions briefly after one fires (wheel bursts re-tick). */
const SEAMLESS_COOLDOWN_MS = 600;
/**
 * Zoom at which an approaching dive starts prewarming the target child's
 * image assets, so the swap's first frame paints complete instead of with
 * cold-image holes (windrose-1mc).
 */
const SEAMLESS_PREWARM_ZOOM = 3;

interface UseSeamlessSubHexArgs {
  readonly canvasRef: { current: HTMLCanvasElement | null };
  readonly mapData: MapData | null;
  readonly geometry: (IGeometry & { getScaledCellSize?: (zoom: number) => number }) | null;
  readonly viewController: ViewController;
  readonly isInSubHex: boolean;
  readonly subHexPath: string | null;
  readonly requestEnterSubHex?: (detail: SubHexCoordDetail) => void;
  readonly requestExitSubHex?: (detail: SubHexExitDetail | null) => void;
  readonly screenToGrid: (clientX: number, clientY: number) => { x: number; y: number } | null;
  readonly screenToWorld: (clientX: number, clientY: number) => WorldCoords | null;
  /** Cancel a pending wheel-settle commit before the map swaps. */
  readonly clearWheelSettle: () => void;
  /** Commit the in-flight gesture so the parent's stored view is the dive-from view. */
  readonly commitActiveGesture: () => void;
}

interface UseSeamlessSubHexResult {
  readonly maybeSeamlessSubHexTransition: (
    zoomingIn: boolean,
    currentZoom: number,
    newZoom: number,
    anchorClientX: number,
    anchorClientY: number
  ) => boolean;
  /** Forget the prewarmed sub-hex key (hex keys are per-map; call on map swap). */
  readonly resetPrewarm: () => void;
}

function useSeamlessSubHex({
  canvasRef,
  mapData,
  geometry,
  viewController,
  isInSubHex,
  subHexPath,
  requestEnterSubHex,
  requestExitSubHex,
  screenToGrid,
  screenToWorld,
  clearWheelSettle,
  commitActiveGesture
}: UseSeamlessSubHexArgs): UseSeamlessSubHexResult {
  // Timestamp of the last seamless sub-hex dive/surface, for the cooldown.
  const seamlessTransitionAtRef = useRef<number>(0);
  // Sub-hex key whose assets were last prewarmed (avoids re-firing per tick).
  const prewarmedSubHexKeyRef = useRef<string | null>(null);

  /**
   * Seamless sub-hex transitions, called from the wheel and touch-pinch zoom
   * paths. Returns true when a transition fired (the caller should stop
   * processing the tick — the map is about to swap).
   *
   * Dive: a zoom-in tick reaches the ceiling and the hex under the zoom
   * anchor has an EXISTING sub-map → enter it (never creates one), opening at
   * the visual-continuity view (child grid in the parent hex's footprint,
   * anchor point kept under the cursor).
   * Surface: inside a sub-hex, a zoom-out tick drops below the continuity
   * zoom → exit to the parent at the mirrored continuity view.
   */
  const maybeSeamlessSubHexTransition = (
    zoomingIn: boolean,
    currentZoom: number,
    newZoom: number,
    anchorClientX: number,
    anchorClientY: number
  ): boolean => {
    if (!mapData || geometry?.type !== 'hex') return false;
    if (Date.now() - seamlessTransitionAtRef.current < SEAMLESS_COOLDOWN_MS) return false;

    if (zoomingIn) {
      // Approach band: prewarm the target child's image assets while the
      // zoom is still climbing toward the ceiling, so the dive's first frame
      // paints complete instead of with cold-image holes. Fire-and-forget,
      // deduped per hex key; preloadImage itself dedupes in-flight loads.
      if (newZoom >= SEAMLESS_PREWARM_ZOOM && newZoom < MAX_WHEEL_ZOOM - SEAMLESS_DIVE_EPSILON) {
        const warmCoords = screenToGrid(anchorClientX, anchorClientY);
        const warmKey = warmCoords != null ? `${warmCoords.x},${warmCoords.y}` : null;
        const warmTarget = warmKey != null ? mapData.subHexMaps?.[warmKey] : undefined;
        if (warmTarget != null && warmKey !== prewarmedSubHexKeyRef.current) {
          prewarmedSubHexKeyRef.current = warmKey;
          prewarmMapAssets(getApp(), { ...warmTarget.mapData, tilesets: mapData.tilesets });
        }
      }
      // Fire on the tick that REACHES the ceiling (not the one after it), so
      // there are no dead ticks pinned at max zoom before the dive.
      if (newZoom < MAX_WHEEL_ZOOM - SEAMLESS_DIVE_EPSILON) return false;
      const coords = screenToGrid(anchorClientX, anchorClientY);
      if (!coords) return false;
      const subHex = mapData.subHexMaps?.[`${coords.x},${coords.y}`];
      const canvas = canvasRef.current;
      if (subHex == null || canvas == null || requestEnterSubHex == null) return false;

      // Open the sub-map at VISUAL CONTINUITY: the child grid occupies the
      // same screen footprint the parent hex has right now, and the world
      // point under the zoom anchor stays under the anchor. The swap is
      // pixel-continuous; the user just keeps zooming in from there.
      const child = subHex.mapData;
      const rings = subHex.subdivisionRings ?? 7;
      const parentHexSize = mapData.hexSize ?? DEFAULTS.hexSize;
      const childHexSize = child.hexSize ?? mapData.hexSize ?? DEFAULTS.hexSize;
      // Clamped to the wheel ceiling: subHexContinuityZoom has no upper bound,
      // and an unusual child/parent hex-size ratio could otherwise open the
      // child above max zoom.
      const childZoom = Math.max(
        DEFAULTS.minZoom,
        Math.min(MAX_WHEEL_ZOOM, subHexContinuityZoom(currentZoom, parentHexSize, childHexSize, rings))
      );

      // The anchor point, mapped into the child map's extent…
      const anchorWorld = screenToWorld(anchorClientX, anchorClientY);
      const parentCenter = geometry.gridToWorld(coords.x, coords.y);
      const childAnchor = anchorWorld != null
        ? subHexAnchorToChildCenter(
            anchorWorld.worldX - parentCenter.worldX,
            anchorWorld.worldY - parentCenter.worldY,
            parentHexSize,
            childHexSize,
            rings
          )
        : { x: 0, y: 0 };

      // …placed at the anchor's SCREEN position, not the canvas center:
      // center = anchor − screenOffset/zoom (screen offset rotated into the
      // child's world axes when the child map is rotated).
      const anchorPx = clientToCanvasPx(canvas, anchorClientX, anchorClientY);
      const rot = rotateVector(
        anchorPx.x - canvas.width / 2,
        anchorPx.y - canvas.height / 2,
        -(child.northDirection ?? 0)
      );
      const childCenter = {
        x: childAnchor.x - rot.x / childZoom,
        y: childAnchor.y - rot.y / childZoom
      };

      // Freeze the parent as it looks RIGHT NOW (still at `currentZoom` — the
      // tick that triggered the dive was never applied) so the sub-map opens
      // over a still of the world it came from.
      captureSubHexBackdrop({
        canvas,
        parentMapData: mapData,
        geometry,
        q: coords.x,
        r: coords.y,
        parentView: viewController.getLive(),
        parentSubHexPath: subHexPath
      });

      seamlessTransitionAtRef.current = Date.now();
      traceZoom('dive', { zoom: currentZoom, childZoom, cx: childCenter.x, cy: childCenter.y });
      // Commit the in-flight zoom so the parent's stored view (what a
      // non-seamless exit restores) is the view the user dove from.
      clearWheelSettle();
      commitActiveGesture();
      requestEnterSubHex({
        q: coords.x,
        r: coords.y,
        viewOverride: { zoom: childZoom, center: childCenter }
      });
      return true;
    }

    if (!isInSubHex || requestExitSubHex == null) return false;
    const canvas = canvasRef.current;
    if (!canvas) return false;

    // Surface at the visual-continuity zoom — the point where the sub-map has
    // shrunk back to the parent hex's max-zoom footprint — so the exit swap is
    // as continuous as the dive. Sub-maps inherit the parent's hex size, so
    // the parent/child sizes cancel out of the threshold. Legacy sub-maps
    // without ring bounds fall back to the old fit-fraction threshold.
    const ownRings = mapData.hexBounds?.maxRing;
    let surfaceThreshold: number;
    if (ownRings != null && ownRings > 0) {
      surfaceThreshold = SEAMLESS_SURFACE_CONTINUITY_FRACTION *
        subHexContinuityZoom(MAX_WHEEL_ZOOM, 1, 1, ownRings);
    } else {
      if (mapData.hexBounds == null) return false;
      surfaceThreshold = SEAMLESS_SURFACE_FIT_FRACTION * calculateFitZoom(
        mapData.hexSize ?? DEFAULTS.hexSize,
        mapData.orientation ?? DEFAULTS.hexOrientation,
        mapData.hexBounds,
        canvas.width,
        canvas.height
      );
    }
    if (newZoom >= surfaceThreshold) return false;

    // Hand the exit the child view at this instant so it can restore a
    // visually-continuous parent view (same spot, matched footprint).
    const anchorWorld = screenToWorld(anchorClientX, anchorClientY);
    const anchorPx = clientToCanvasPx(canvas, anchorClientX, anchorClientY);
    const exitDetail = anchorWorld != null
      ? {
          childZoom: newZoom,
          childAnchor: { x: anchorWorld.worldX, y: anchorWorld.worldY },
          anchorOffset: {
            dx: anchorPx.x - canvas.width / 2,
            dy: anchorPx.y - canvas.height / 2
          }
        }
      : null;

    seamlessTransitionAtRef.current = Date.now();
    traceZoom('surface', { newZoom });
    clearWheelSettle();
    commitActiveGesture();
    requestExitSubHex(exitDetail);
    return true;
  };

  const resetPrewarm = (): void => {
    prewarmedSubHexKeyRef.current = null;
  };

  return { maybeSeamlessSubHexTransition, resetPrewarm };
}

export { useSeamlessSubHex, MAX_WHEEL_ZOOM };
export type { UseSeamlessSubHexArgs, UseSeamlessSubHexResult };

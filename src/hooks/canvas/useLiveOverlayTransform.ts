/**
 * useLiveOverlayTransform.ts
 *
 * Keeps DOM/SVG overlays locked to the canvas during live pan/zoom gestures.
 *
 * The canvas renderer reads viewController.getLive() every frame, but SVG
 * overlays (routes, party pin) render from React state and would otherwise
 * freeze at the last committed viewState until gesture end. This hook
 * subscribes to the controller's live ticks and imperatively rewrites a
 * world-space <g> transform (rAF-coalesced, no React re-render) so overlays
 * track the gesture exactly like the canvas.
 *
 * Overlays draw their shapes in WORLD coordinates inside the group; nodes
 * that must keep a constant on-screen size (labels) carry
 * data-counter-scale-x/y anchor attributes and are counter-scaled on the
 * same tick.
 */

import type { RefObject } from 'preact';
import type { IGeometry } from '#types/core/geometry.types';
import type { StoredViewState } from '#types/core/map.types';
import type { ViewController } from '#types/hooks/viewController.types';

import { useEffect } from 'preact/hooks';

/** Geometry surface needed for the world→screen transform */
interface OverlayGeometry extends IGeometry {
  getScaledCellSize: (zoom: number) => number;
}

/** Canvas/container measurements the transform depends on */
interface OverlayMetrics {
  canvasWidth: number;
  canvasHeight: number;
  /** CSS px per canvas px */
  displayScale: number;
  /** Canvas position relative to .windrose-canvas-container */
  canvasOffsetX: number;
  canvasOffsetY: number;
}

const COUNTER_SCALE_SELECTOR = '[data-counter-scale-x]';

/** Walk up from the canvas to the overlay positioning container. */
function findCanvasContainer(canvas: HTMLCanvasElement): HTMLElement | null {
  let container = canvas.parentElement;
  let traversalCount = 0;
  while (container?.classList && !container.classList.contains('windrose-canvas-container')) {
    container = container.parentElement;
    traversalCount++;
    if (traversalCount > 10) break;
  }
  return container?.classList.contains('windrose-canvas-container') === true ? container : null;
}

/** Measure the canvas relative to its overlay container. */
function computeOverlayMetrics(canvas: HTMLCanvasElement): OverlayMetrics | null {
  const container = findCanvasContainer(canvas);
  if (!container) return null;
  const canvasRect = canvas.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  if (canvas.width === 0) return null;
  return {
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    displayScale: canvasRect.width / canvas.width,
    canvasOffsetX: canvasRect.left - containerRect.left,
    canvasOffsetY: canvasRect.top - containerRect.top
  };
}

/**
 * World→screen SVG transform matching the cellToScreen pipeline: pan offset +
 * zoom, rotated about the canvas center, scaled to CSS px, container offset.
 */
function computeWorldTransform(
  viewState: StoredViewState,
  geometry: OverlayGeometry,
  northDirection: number,
  metrics: OverlayMetrics
): string {
  const { zoom, center } = viewState;
  const { canvasWidth, canvasHeight, displayScale, canvasOffsetX, canvasOffsetY } = metrics;
  const panOffsetX = geometry.type === 'grid'
    ? canvasWidth / 2 - center.x * geometry.getScaledCellSize(zoom)
    : canvasWidth / 2 - center.x * zoom;
  const panOffsetY = geometry.type === 'grid'
    ? canvasHeight / 2 - center.y * geometry.getScaledCellSize(zoom)
    : canvasHeight / 2 - center.y * zoom;

  return `translate(${canvasOffsetX} ${canvasOffsetY}) ` +
    `scale(${displayScale}) ` +
    (northDirection !== 0 ? `rotate(${northDirection} ${canvasWidth / 2} ${canvasHeight / 2}) ` : '') +
    `translate(${panOffsetX} ${panOffsetY}) ` +
    `scale(${zoom})`;
}

/** Inverse of the cumulative world scale — keeps a node at constant CSS px. */
function computeCounterScale(zoom: number, displayScale: number): number {
  const total = zoom * displayScale;
  return total > 0 ? 1 / total : 1;
}

/** Transform for a constant-screen-size node anchored at a world point. */
function counterScaleTransform(worldX: number, worldY: number, counterScale: number): string {
  return `translate(${worldX} ${worldY}) scale(${counterScale})`;
}

interface UseLiveOverlayTransformOptions {
  /** World-space group whose transform tracks the live viewState */
  groupRef: RefObject<SVGGElement>;
  canvasRef: RefObject<HTMLCanvasElement> | null;
  geometry: IGeometry | null;
  northDirection: number;
  viewController: ViewController | undefined;
}

/**
 * Subscribe the given world-space group to live viewState ticks. Updates are
 * rAF-coalesced and applied directly to the DOM — no React re-render.
 */
function useLiveOverlayTransform({
  groupRef,
  canvasRef,
  geometry,
  northDirection,
  viewController
}: UseLiveOverlayTransformOptions): void {
  useEffect(() => {
    if (!viewController || !geometry) return undefined;

    let rafId: number | null = null;
    let latest: StoredViewState | null = null;

    const apply = (): void => {
      rafId = null;
      const vs = latest;
      const group = groupRef.current;
      const canvas = canvasRef?.current;
      if (!vs || !group || !canvas) return;
      const metrics = computeOverlayMetrics(canvas);
      if (!metrics) return;
      group.setAttribute(
        'transform',
        computeWorldTransform(vs, geometry, northDirection, metrics)
      );
      const counterScale = computeCounterScale(vs.zoom, metrics.displayScale);
      for (const node of Array.from(group.querySelectorAll(COUNTER_SCALE_SELECTOR))) {
        const x = node.getAttribute('data-counter-scale-x');
        const y = node.getAttribute('data-counter-scale-y');
        if (x == null || y == null) continue;
        node.setAttribute('transform', counterScaleTransform(Number(x), Number(y), counterScale));
      }
    };

    const unsubscribe = viewController.subscribeLive((vs) => {
      latest = vs;
      rafId ??= window.requestAnimationFrame(apply);
    });

    return () => {
      unsubscribe();
      if (rafId != null) window.cancelAnimationFrame(rafId);
    };
  }, [groupRef, canvasRef, geometry, northDirection, viewController]);
}

export {
  computeCounterScale,
  computeOverlayMetrics,
  computeWorldTransform,
  counterScaleTransform,
  findCanvasContainer,
  useLiveOverlayTransform
};
export type { OverlayMetrics };

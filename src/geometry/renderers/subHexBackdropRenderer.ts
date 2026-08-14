/**
 * subHexBackdropRenderer.ts
 *
 * Blits the parent-map snapshot behind a sub-hex map. Runs from renderCanvas
 * immediately after the background fill, so it sits under every layer of the
 * sub-map and follows pan/zoom for free (the renderer already repaints per
 * frame from the ViewController during a gesture).
 */

import type { StoredViewState } from '#types/core/map.types';

import { getSubHexBackdrop } from '../../core/subHexBackdropStore';
import { computeBackdropPlacement } from '../core/subHexBackdrop';

/** No-op at root level, or when no snapshot matches this canvas and drill path. */
function renderSubHexBackdrop(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  childView: StoredViewState,
  subHexPath: string | null,
  northDirection: number
): void {
  const backdrop = getSubHexBackdrop(canvas, subHexPath);
  if (backdrop == null) return;

  const placement = computeBackdropPlacement(childView, backdrop.capture, {
    width: canvas.width,
    height: canvas.height,
    northDirection
  });
  if (placement == null) return;

  ctx.drawImage(backdrop.snapshot, placement.dx, placement.dy, placement.drawW, placement.drawH);
}

export { renderSubHexBackdrop };

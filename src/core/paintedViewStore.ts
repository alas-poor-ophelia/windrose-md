/**
 * paintedViewStore.ts
 *
 * Records, per canvas, the viewState the last completed renderCanvas call
 * actually painted with. Under fast gestures a canvas bitmap can lag the live
 * ViewController by a frame — anything that copies canvas pixels and needs to
 * know what view they depict (the sub-hex backdrop capture) must read THIS,
 * not the live view: labeling the copy with the live view mispositions it by
 * exactly the paint lag (the rapid dive/surface backdrop-misplacement bug).
 */

import type { StoredViewState } from '#types/core/map.types';

const paintedViews = new WeakMap<HTMLCanvasElement, StoredViewState>();

function recordPaintedView(canvas: HTMLCanvasElement, view: StoredViewState): void {
  paintedViews.set(canvas, view);
}

function getPaintedView(canvas: HTMLCanvasElement): StoredViewState | null {
  return paintedViews.get(canvas) ?? null;
}

export { recordPaintedView, getPaintedView };

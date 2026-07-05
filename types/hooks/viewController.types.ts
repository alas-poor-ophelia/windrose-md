/**
 * View Controller Hook Type Definitions
 * Path: types/hooks/viewController.types.ts
 *
 * Types for useViewController — the encapsulated live pan/zoom controller that
 * holds viewState off the React path during a gesture and commits to mapData
 * once at gesture end. See src/hooks/canvas/useViewController.ts.
 */

import type { StoredViewState } from '../core/map.types';

/** Encapsulated live pan/zoom controller. */
export interface ViewController {
  /** Current authoritative viewState for the canvas transform + hit-testing. */
  getLive: () => StoredViewState;
  /** True while a pan/zoom/pinch gesture is in flight. */
  isGesturing: () => boolean;
  /** Write a live viewState mid-gesture and schedule an imperative render. */
  setLive: (vs: StoredViewState) => void;
  /** Open a gesture; returns a token used to guard the eventual commit. */
  beginGesture: () => number;
  /** Commit to mapData ONCE at gesture end — only if the token is still current. */
  commitIfCurrent: (gestureId: number, vs: StoredViewState) => void;
  /** Abandon a gesture without committing (pointercancel / blur / unmount). */
  cancelIfCurrent: (gestureId: number) => void;
  /** External mapData.viewState change (navigate/undo/load) → live; no-op mid-gesture. */
  syncCommitted: (vs: StoredViewState) => void;
  /** The renderer registers its rAF-coalesced draw here. */
  setRenderCallback: (cb: () => void) => void;
}

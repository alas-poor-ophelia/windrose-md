/**
 * useViewController.ts
 *
 * Encapsulated LIVE pan/zoom controller. viewState (zoom/center) normally lives
 * inside mapData (a useState); writing it on every wheel/pointermove tick
 * reconciled the whole map tree (17 unmemoized layers + DungeonMapTracker)
 * synchronously — measured 100-327ms main-thread stalls, unrelated to the
 * (already rAF-coalesced) canvas draw.
 *
 * This controller holds the live viewState OFF the React path during a gesture:
 * handlers write via `setLive()` (which triggers an imperative canvas render, no
 * setState), and the committed `mapData.viewState` updates exactly ONCE at
 * gesture end via `commitIfCurrent()`. Reads — the renderer transform AND the
 * coordinate hit-testing (screenToGrid/screenToWorld) — go through `getLive()`,
 * so the canvas and cursor-to-grid math never desync (the one invisible
 * regression the adversarial review flagged).
 *
 * Ownership guards: commits are gesture-token-guarded so a stale wheel-settle
 * timer can't clobber an external navigate/undo/load; external changes flow in
 * via `syncCommitted()`, which no-ops while a gesture is in flight.
 */

import type { StoredViewState } from '#types/core/map.types';
import type { ViewController } from '#types/hooks/viewController.types';

import { useRef } from 'preact/hooks';

export type { ViewController };

const DEFAULT_VIEW_STATE: StoredViewState = { zoom: 1, center: { x: 0, y: 0 } };

/**
 * Create (once) the stable ViewController for a map canvas.
 * @param committed the current committed viewState (mapData.viewState), used to seed live
 * @param commit    the sink that persists a committed viewState (onViewStateChange → setMapData)
 */
function useViewController(
  committed: StoredViewState | undefined,
  commit: (vs: StoredViewState) => void,
): ViewController {
  // Keep the commit sink current without recreating the controller.
  const commitRef = useRef(commit);
  commitRef.current = commit;

  const ref = useRef<ViewController | null>(null);
  if (ref.current == null) {
    const s = {
      live: committed ?? DEFAULT_VIEW_STATE,
      gestureId: null as number | null,
      nextId: 1,
      renderCb: (): void => {},
    };
    ref.current = {
      getLive: () => s.live,
      isGesturing: () => s.gestureId != null,
      setLive: (vs) => {
        s.live = vs;
        s.renderCb();
      },
      beginGesture: () => {
        s.gestureId = s.nextId;
        s.nextId += 1;
        return s.gestureId;
      },
      commitIfCurrent: (gestureId, vs) => {
        if (gestureId !== s.gestureId) return;
        s.live = vs;
        s.gestureId = null;
        commitRef.current(vs);
      },
      cancelIfCurrent: (gestureId) => {
        if (gestureId === s.gestureId) s.gestureId = null;
      },
      syncCommitted: (vs) => {
        if (s.gestureId == null) {
          s.live = vs;
          s.renderCb();
        }
      },
      setRenderCallback: (cb) => {
        s.renderCb = cb;
      },
    };
  }
  return ref.current;
}

export { useViewController };

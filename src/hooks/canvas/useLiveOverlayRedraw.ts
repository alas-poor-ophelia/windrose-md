/**
 * useLiveOverlayRedraw.ts
 *
 * Subscribes an imperative overlay-canvas redraw to the ViewController's live
 * pan/zoom ticks. During a gesture, setLive() deliberately bypasses React
 * state (see useViewController) — so an overlay drawn from committed
 * mapData.viewState inside a useEffect freezes mid-pan and snaps into place
 * only when the gesture commits. Canvas-overlay counterpart of
 * useLiveOverlayTransform (which does the same for SVG overlay groups).
 *
 * Redraws are coalesced to at most one per animation frame, matching the
 * main canvas's render loop.
 */

import type { StoredViewState } from '#types/core/map.types';
import type { ViewController } from '#types/hooks/viewController.types';

import { useEffect } from 'preact/hooks';

function useLiveOverlayRedraw(
	viewController: ViewController | null | undefined,
	redraw: (viewState: StoredViewState) => void
): void {
	useEffect(() => {
		if (viewController == null) return undefined;
		let rafId: number | null = null;
		const unsubscribe = viewController.subscribeLive(() => {
			if (rafId != null) return;
			rafId = window.requestAnimationFrame(() => {
				rafId = null;
				redraw(viewController.getLive());
			});
		});
		return () => {
			unsubscribe();
			if (rafId != null) window.cancelAnimationFrame(rafId);
		};
	}, [viewController, redraw]);
}

export { useLiveOverlayRedraw };

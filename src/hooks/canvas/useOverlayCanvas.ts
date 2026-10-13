/**
 * useOverlayCanvas.ts
 *
 * Lifecycle of a layer's private overlay <canvas> (DUP-04): created on demand
 * as a `.windrose-overlay-layer` sibling of the main canvas, kept at the main
 * canvas's backing size, removed on demand and on unmount.
 *
 * - `ensure()` is guarded: at most one overlay per layer, however many times
 *   it is called (a second pointerdown before pointerup used to orphan one).
 * - Size follows the main canvas. The main canvas's backing store is sized in
 *   CSS px by MapCanvas (no devicePixelRatio scaling), so the overlay mirrors
 *   `width`/`height` 1:1 and adds no DPR transform of its own. A
 *   MutationObserver on the main canvas's width/height attributes re-syncs
 *   the overlay while it exists and calls `onResize` (resizing clears it).
 * - `sized()` returns the overlay synced to the current main size, for the
 *   start of a draw. It only assigns width/height when they differ: the
 *   assignment resets the context and can reallocate the backing store.
 * - `active` (optional) makes presence declarative: true creates, false
 *   removes. Omit it to drive ensure()/remove() imperatively.
 *
 * Pan/zoom is NOT handled here: the layer still subscribes its redraw with
 * useLiveOverlayRedraw, which stays the source of truth for live view ticks.
 */

import { useCallback, useEffect, useMemo, useRef } from 'preact/hooks';

interface CanvasRefLike {
	readonly current: HTMLCanvasElement | null;
}

interface OverlayCanvasOptions {
	/** Declarative presence: true creates the overlay, false removes it. */
	active?: boolean;
	/** Called after the overlay was resized to follow the main canvas. */
	onResize?: () => void;
}

interface OverlayCanvas {
	/** The overlay, or null when it does not exist. Read-only for callers. */
	overlayRef: CanvasRefLike;
	/** Create the overlay if missing (sized to the main canvas); return it. */
	ensure: () => HTMLCanvasElement | null;
	/** Remove the overlay, if any. */
	remove: () => void;
	/** The existing overlay synced to the main canvas size, or null. */
	sized: () => HTMLCanvasElement | null;
}

function syncSize(overlay: HTMLCanvasElement, main: HTMLCanvasElement): boolean {
	let changed = false;
	if (overlay.width !== main.width) { overlay.width = main.width; changed = true; }
	if (overlay.height !== main.height) { overlay.height = main.height; changed = true; }
	return changed;
}

function useOverlayCanvas(canvasRef: CanvasRefLike, options: OverlayCanvasOptions = {}): OverlayCanvas {
	const { active } = options;
	const overlayRef = useRef<HTMLCanvasElement | null>(null);
	const observerRef = useRef<MutationObserver | null>(null);
	const onResizeRef = useRef(options.onResize);
	onResizeRef.current = options.onResize;

	const remove = useCallback((): void => {
		observerRef.current?.disconnect();
		observerRef.current = null;
		overlayRef.current?.remove();
		overlayRef.current = null;
	}, []);

	const sized = useCallback((): HTMLCanvasElement | null => {
		const overlay = overlayRef.current;
		const main = canvasRef.current;
		if (overlay == null) return null;
		if (main != null) syncSize(overlay, main);
		return overlay;
	}, [canvasRef]);

	const ensure = useCallback((): HTMLCanvasElement | null => {
		if (overlayRef.current != null) return sized();
		const main = canvasRef.current;
		const parent = main?.parentElement;
		if (main == null || parent == null) return null;

		// Created in the main canvas's own window (popout-safe), not activeWindow.
		const overlay = main.win.createEl('canvas');
		overlay.width = main.width;
		overlay.height = main.height;
		overlay.classList.add('windrose-overlay-layer');
		parent.appendChild(overlay);
		overlayRef.current = overlay;

		const observer = new MutationObserver(() => {
			const current = overlayRef.current;
			const currentMain = canvasRef.current;
			if (current == null || currentMain == null) return;
			if (syncSize(current, currentMain)) onResizeRef.current?.();
		});
		observer.observe(main, { attributes: true, attributeFilter: ['width', 'height'] });
		observerRef.current = observer;
		return overlay;
	}, [canvasRef, sized]);

	useEffect(() => {
		if (active === undefined) return;
		if (active) ensure();
		else remove();
	}, [active, ensure, remove]);

	useEffect(() => remove, [remove]);

	return useMemo(() => ({ overlayRef, ensure, remove, sized }), [ensure, remove, sized]);
}

export { useOverlayCanvas };
export type { OverlayCanvas, OverlayCanvasOptions };

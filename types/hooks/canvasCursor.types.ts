/**
 * Canvas cursor store types (REACT-04).
 *
 * The map canvas carries a tool cursor class (from the current tool) plus at
 * most ONE transient interaction class (space-grab, panning, a shape-active
 * class, or drawing). The transient class changes on pointer/key input, so it
 * is written straight to the canvas element instead of re-rendering MapCanvas.
 */

/** Drawing-layer interaction cursors, without the `windrose-canvas-` prefix. */
export type CanvasDrawingCursor = 'drawing' | 'rectangle-active' | 'circle-active' | 'cleararea-active';

/** The transient interaction classes, at most one applied at a time. */
export type CanvasStateCursorClass =
  | 'windrose-canvas-space-grab'
  | 'windrose-canvas-panning'
  | `windrose-canvas-${CanvasDrawingCursor}`;

/** Per-map cursor store: one per MapCanvas, shared through MapStateContext. */
export interface CanvasCursorStore {
  /** Bind (or unbind with null) the canvas element the classes are written to. */
  attach(el: HTMLElement | null): void;
  /** Tool cursor class computed from the current tool (render-time, cheap). */
  setBase(className: string): void;
  setSpaceHeld(held: boolean): void;
  setPointerOver(over: boolean): void;
  setPanning(panning: boolean): void;
  setDrawing(cursor: CanvasDrawingCursor | null): void;
  /** Window blur: drop the space-held and panning inputs. */
  releaseTransient(): void;
  /** The transient class currently applied, or null. */
  getStateClass(): CanvasStateCursorClass | null;
  subscribe(listener: (stateClass: CanvasStateCursorClass | null) => void): () => void;
}

/**
 * AnchoredPopup.tsx
 *
 * Shared shell for the small transient popups anchored to a container-relative
 * point (TerrainPickerPopup, LevelPickerPopup): the selection-card chrome,
 * placement, click-outside and Escape dismissal, and an edge clamp. Popups
 * supply only a title and body as children.
 *
 * Listeners go on the popup's own ownerDocument and the timer on that
 * document's window, so the popup works in pop-out windows.
 */

import type { ComponentChildren, VNode } from 'preact';
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';

import { CornerBrackets } from '../shared/CornerBrackets';
import { Z_INDEX } from '../../core/dmtConstants';

interface AnchoredPopupProps {
  /** Anchor position, container-relative. */
  x: number;
  y: number;
  /** Root class names after the shared `windrose-selection-card`. */
  className: string;
  /** Unique SVG filter id for the corner brackets. */
  filterId: string;
  onClose: () => void;
  /** True when the CSS centres the popup on x (translateX(-50%)); the clamp then keeps both halves inside. */
  centered?: boolean;
  /** Dialog semantics: role="dialog" with this label. */
  ariaLabel?: string;
  /** Move focus to the first button when the popup opens. */
  focusFirst?: boolean;
  children: ComponentChildren;
}

const EDGE_MARGIN = 4;

const AnchoredPopup = ({
  x,
  y,
  className,
  filterId,
  onClose,
  centered = false,
  ariaLabel,
  focusFirst = false,
  children
}: AnchoredPopupProps): VNode => {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const doc = root?.ownerDocument ?? activeDocument;
    const win = doc.defaultView ?? activeWindow;
    const onPointerDown = (e: PointerEvent): void => {
      if (rootRef.current != null && e.target instanceof Node && !rootRef.current.contains(e.target)) {
        onClose();
      }
    };
    // Escape closes the popup and must not also reach the map's own key
    // handling (which would clear the selection).
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      onClose();
    };
    // Deferred so the opening click does not immediately dismiss.
    const id = win.setTimeout(() => doc.addEventListener('pointerdown', onPointerDown, true), 0);
    doc.addEventListener('keydown', onKeyDown, true);
    return () => {
      win.clearTimeout(id);
      doc.removeEventListener('pointerdown', onPointerDown, true);
      doc.removeEventListener('keydown', onKeyDown, true);
    };
  }, [onClose]);

  useEffect(() => {
    if (focusFirst) rootRef.current?.querySelector('button')?.focus({ preventScroll: true });
  }, [focusFirst]);

  // Keep the box inside the container: measured, so it adapts to the content width.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const parentWidth = root?.parentElement?.clientWidth ?? 0;
    if (root == null || parentWidth === 0 || root.offsetWidth === 0) return;
    const half = centered ? root.offsetWidth / 2 : 0;
    const max = Math.max(half + EDGE_MARGIN, parentWidth - root.offsetWidth + half - EDGE_MARGIN);
    root.style.left = `${Math.min(Math.max(x, half + EDGE_MARGIN), max)}px`;
  }, [x, y, centered]);

  return (
    <div
      ref={rootRef}
      className={`windrose-selection-card ${className}`}
      role={ariaLabel !== undefined ? 'dialog' : undefined}
      aria-label={ariaLabel}
      style={{
        left: `${x}px`,
        top: `${y + 10}px`,
        zIndex: Z_INDEX.DRAWING_LAYER + 2
      }}
    >
      <CornerBrackets classPrefix="windrose-selection-card-bracket" variant="minimal" filterId={filterId} />
      <div className="windrose-selection-card-content">{children}</div>
    </div>
  );
};

export { AnchoredPopup };
export type { AnchoredPopupProps };

// popoverClamp.ts - Keep a portalled, fixed-position popover (color/icon picker)
// inside its window. The popover opens at its anchor's left edge, above or below
// it; near an edge of a narrow window (a phone) that runs off screen.

import { useLayoutEffect, useState } from 'preact/hooks';
import type { RefObject } from 'preact';

interface PopoverSize {
  width: number;
  height: number;
}

/** Left edge for a `width`-wide popover anchored at `left`, kept inside a
 *  `winW`-wide window (a popover wider than the window pins at 0). */
function clampPopoverLeft(left: number, width: number, winW: number): number {
  return Math.max(0, Math.min(left, winW - width));
}

/** Whether a `height`-tall popover that prefers `wantAbove` should open above
 *  its anchor: flip to the other side only when the preferred side lacks room
 *  and the other side has it. */
function popoverOpensAbove(
  wantAbove: boolean, anchorTop: number, anchorBottom: number, height: number, gap: number, winH: number
): boolean {
  const fitsAbove = anchorTop - gap - height >= 0;
  const fitsBelow = anchorBottom + gap + height <= winH;
  return wantAbove ? fitsAbove || !fitsBelow : !fitsBelow && fitsAbove;
}

/** Rendered size of `ref`'s element while `active`, measured when it opens;
 *  null until measured. Size does not depend on where the element sits, so it
 *  is valid before ModalPortal moves it to the body. */
function usePopoverSize(ref: RefObject<HTMLElement>, active: boolean): PopoverSize | null {
  const [size, setSize] = useState<PopoverSize | null>(null);
  useLayoutEffect(() => {
    const el = active ? ref.current : null;
    const next = el != null ? { width: el.offsetWidth, height: el.offsetHeight } : null;
    if (next?.width !== size?.width || next?.height !== size?.height) setSize(next);
  }, [active, ref, size]);
  return size;
}

export { clampPopoverLeft, popoverOpensAbove, usePopoverSize };

/**
 * useLevelPicker.ts
 *
 * Open/close state for the ladder level picker popup, shared by ObjectLayer
 * and TextLayer. The state is tied to a selection key (the sorted selected
 * ids): when the selection changes by any route (Delete, undo, MCP, a new
 * marquee) the popup closes and never re-opens for a different selection.
 */

import { useCallback, useEffect, useState } from 'preact/hooks';

interface LevelPickerState {
  x: number;
  y: number;
}

interface LevelPickerStored extends LevelPickerState {
  key: string;
}

/**
 * Container-relative anchor for the popup: the bottom centre of the action
 * button that was clicked. Menu invocations carry no event; they anchor near
 * the top centre of the map container instead.
 */
function levelPickerAnchor(e: Event | undefined, container: HTMLElement | null): LevelPickerState {
  const box = container?.getBoundingClientRect();
  const target = e?.currentTarget ?? e?.target;
  if (box !== undefined && target instanceof Element) {
    const rect = target.getBoundingClientRect();
    return { x: rect.left + rect.width / 2 - box.left, y: rect.bottom - box.top };
  }
  return { x: (box?.width ?? 300) / 2, y: 48 };
}

/** Selection key for a set of selected ids: order-independent. */
function selectionKeyOf(prefix: string, ids: readonly string[]): string {
  return `${prefix}:${[...ids].sort().join(',')}`;
}

function useLevelPicker(
  selectionKey: string | null,
  containerRef: { current: HTMLElement | null }
): { picker: LevelPickerState | null; open: (e?: Event) => void; close: () => void } {
  const [stored, setStored] = useState<LevelPickerStored | null>(null);

  // Reset when the selection changes (the render gate below hides the stale
  // popup for the one render before this effect runs).
  useEffect(() => {
    setStored(null);
  }, [selectionKey]);

  const open = useCallback((e?: Event): void => {
    if (selectionKey === null) return;
    e?.preventDefault();
    e?.stopPropagation();
    setStored({ ...levelPickerAnchor(e, containerRef.current), key: selectionKey });
  }, [selectionKey, containerRef]);

  const close = useCallback((): void => setStored(null), []);

  const picker = stored !== null && stored.key === selectionKey ? { x: stored.x, y: stored.y } : null;
  return { picker, open, close };
}

export { useLevelPicker, levelPickerAnchor, selectionKeyOf };
export type { LevelPickerState };

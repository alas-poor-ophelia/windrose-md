/**
 * LevelPickerPopup.tsx
 *
 * Small transient popup for choosing which lattice-ladder rungs a selected
 * object or text label (or a whole multi-selection) is visible on (kgc.31).
 * A chip row: `Auto` (clears `visibleLevels`, back to the home band) plus one
 * chip per rung, multi-toggle. Chips reuse the ladder overlay's
 * `windrose-ladder-chip` look: `is-current` = on, `is-mixed` = some of a
 * multi-selection. Anchored container-relative like TerrainPickerPopup;
 * click-outside dismisses.
 */

import type { VNode } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

import { CornerBrackets } from '../shared/CornerBrackets';
import { Z_INDEX } from '../../core/dmtConstants';

type ChipState = 'on' | 'off' | 'mixed';

interface LevelPickerPopupProps {
  /** Anchor position, container-relative (the action button's bottom centre). */
  x: number;
  y: number;
  /** Deepest rung of the map's ladder; chips run L0..L<maxLevel>. */
  maxLevel: number;
  /** Auto chip state: on when every selected element has no explicit set. */
  autoState: ChipState;
  /** State of rung `level` across the selection (effective sets, Auto included). */
  levelState: (level: number) => ChipState;
  onToggleLevel: (level: number) => void;
  onAuto: () => void;
  onClose: () => void;
}

/**
 * Container-relative anchor for the popup: the bottom centre of the action
 * button that was clicked. Menu invocations carry no event; they anchor near
 * the top centre of the map container instead.
 */
function levelPickerAnchor(e: Event | undefined, container: HTMLElement | null): { x: number; y: number } {
  const box = container?.getBoundingClientRect();
  const target = e?.currentTarget ?? e?.target;
  if (box !== undefined && target instanceof Element) {
    const rect = target.getBoundingClientRect();
    return { x: rect.left + rect.width / 2 - box.left, y: rect.bottom - box.top };
  }
  return { x: (box?.width ?? 300) / 2, y: 48 };
}

/** One rung's chip state across a selection, from each element's effective set. */
function chipStateOf(flags: readonly boolean[]): ChipState {
  const on = flags.filter(Boolean).length;
  if (on === 0) return 'off';
  return on === flags.length ? 'on' : 'mixed';
}

function chipClass(state: ChipState): string {
  if (state === 'on') return 'windrose-ladder-chip is-current';
  if (state === 'mixed') return 'windrose-ladder-chip is-mixed';
  return 'windrose-ladder-chip';
}

const LevelPickerPopup = ({
  x,
  y,
  maxLevel,
  autoState,
  levelState,
  onToggleLevel,
  onAuto,
  onClose
}: LevelPickerPopupProps): VNode => {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handler = (e: PointerEvent): void => {
      if (rootRef.current != null && e.target instanceof Node && !rootRef.current.contains(e.target)) {
        onClose();
      }
    };
    // Deferred so the opening click does not immediately dismiss.
    // The popup's ownerDocument is the window that owns this map (popout-safe).
    const doc = rootRef.current?.ownerDocument ?? activeDocument;
    const id = window.setTimeout(() => doc.addEventListener('pointerdown', handler, true), 0);
    return () => {
      window.clearTimeout(id);
      doc.removeEventListener('pointerdown', handler, true);
    };
  }, [onClose]);

  const levels: number[] = [];
  for (let level = 0; level <= maxLevel; level++) levels.push(level);

  return (
    <div
      ref={rootRef}
      className="windrose-selection-card windrose-level-picker"
      style={{
        left: `${x}px`,
        top: `${y + 10}px`,
        zIndex: Z_INDEX.DRAWING_LAYER + 2
      }}
    >
      <CornerBrackets classPrefix="windrose-selection-card-bracket" variant="minimal" filterId="level-picker-bracket" />
      <div className="windrose-selection-card-content">
        <div className="windrose-level-picker-title">Visible on levels</div>
        <div className="windrose-level-picker-row">
          <button
            type="button"
            className={chipClass(autoState)}
            aria-pressed={autoState === 'mixed' ? 'mixed' : autoState === 'on'}
            aria-label="Automatic levels"
            onClick={onAuto}
          >
            Auto
          </button>
          {levels.map(level => {
            const state = levelState(level);
            return (
              <button
                key={level}
                type="button"
                className={chipClass(state)}
                aria-pressed={state === 'mixed' ? 'mixed' : state === 'on'}
                aria-label={`Level ${level} visible`}
                onClick={() => onToggleLevel(level)}
              >
                {`L${level}`}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export { LevelPickerPopup, levelPickerAnchor, chipStateOf };
export type { ChipState, LevelPickerPopupProps };

/**
 * LevelPickerPopup.tsx
 *
 * Small transient popup for choosing which lattice-ladder rungs a selected
 * object or text label (or a whole multi-selection) is visible on.
 * A chip row: `Auto` (clears `visibleLevels`, back to the home band) plus one
 * chip per rung, multi-toggle. Chips reuse the ladder overlay's
 * `windrose-ladder-chip` look via LevelChip: `is-on` = on, `is-mixed` = some
 * of a multi-selection. The shell (anchor, click-outside, Escape, clamp) is
 * AnchoredPopup, shared with TerrainPickerPopup.
 */

import type { VNode } from 'preact';

import { AnchoredPopup } from './AnchoredPopup';
import { LevelChip, levelChipClass } from './LevelChip';

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

/** One rung's chip state across a selection, from each element's effective set. */
function chipStateOf(flags: readonly boolean[]): ChipState {
  const on = flags.filter(Boolean).length;
  if (on === 0) return 'off';
  return on === flags.length ? 'on' : 'mixed';
}

function pressedOf(state: ChipState): boolean | 'mixed' {
  return state === 'mixed' ? 'mixed' : state === 'on';
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
  const levels: number[] = [];
  for (let level = 0; level <= maxLevel; level++) levels.push(level);

  return (
    <AnchoredPopup
      x={x}
      y={y}
      className="windrose-level-picker"
      filterId="level-picker-bracket"
      onClose={onClose}
      centered
      ariaLabel="Visible on levels"
      focusFirst
    >
      <div className="windrose-level-picker-title">Visible on levels</div>
      <div className="windrose-level-picker-row">
        <button
          type="button"
          className={levelChipClass(autoState)}
          aria-pressed={pressedOf(autoState)}
          aria-label="Automatic levels"
          onClick={onAuto}
        >
          Auto
        </button>
        {levels.map(level => {
          const state = levelState(level);
          return (
            <LevelChip
              key={level}
              level={level}
              state={state}
              pressed={pressedOf(state)}
              ariaLabel={`Level ${level} visible`}
              onClick={() => onToggleLevel(level)}
            />
          );
        })}
      </div>
    </AnchoredPopup>
  );
};

export { LevelPickerPopup, chipStateOf };
export type { ChipState, LevelPickerPopupProps };

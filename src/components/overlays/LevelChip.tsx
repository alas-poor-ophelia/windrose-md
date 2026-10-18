/**
 * LevelChip.tsx
 *
 * One rung chip, shared by the ladder HUD and the level picker so both render
 * the same markup (the "L" prefix shows at every width).
 * `current` = the camera's rung (HUD), `on` / `mixed` = picker membership.
 * With `onClick` it is a button, otherwise a static span.
 */

import type { VNode } from 'preact';

type LevelChipState = 'current' | 'on' | 'mixed' | 'off';

interface LevelChipProps {
  level: number;
  state?: LevelChipState;
  /** HUD only: the rung the edit lock is pinned to. */
  locked?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
  /** Picker chips are toggles; pass 'mixed' for a partial multi-selection. */
  pressed?: boolean | 'mixed';
  /** Button chips only: render disabled (pair with `title` to say why). */
  disabled?: boolean;
  title?: string;
}

function levelChipClass(state: LevelChipState, locked = false): string {
  let cls = 'windrose-ladder-chip';
  if (state === 'current') cls += ' is-current';
  else if (state === 'on') cls += ' is-on';
  else if (state === 'mixed') cls += ' is-mixed';
  if (locked) cls += ' is-locked';
  return cls;
}

const LevelChip = ({ level, state = 'off', locked = false, onClick, ariaLabel, pressed, disabled, title }: LevelChipProps): VNode => {
  const className = levelChipClass(state, locked);
  const body = <><span className="windrose-ladder-chip-prefix">L</span>{level}</>;
  if (onClick === undefined) {
    return <span className={className} aria-current={state === 'current' ? 'true' : undefined}>{body}</span>;
  }
  return (
    <button type="button" className={className} aria-label={ariaLabel} aria-pressed={pressed} disabled={disabled} title={title} onClick={onClick}>
      {body}
    </button>
  );
};

export { LevelChip, levelChipClass };
export type { LevelChipProps, LevelChipState };

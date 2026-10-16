// @vitest-environment happy-dom
/**
 * Ladder level picker (kgc.31): one chip per rung plus Auto, state classes and
 * aria-pressed per chip, taps routed to the callbacks.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { h, render } from 'preact';

import { LevelPickerPopup, chipStateOf } from '../../../../src/components/overlays/LevelPickerPopup';

let root: HTMLElement | null = null;
afterEach(() => {
  if (root) { render(null, root); root.remove(); root = null; }
});

describe('LevelPickerPopup', () => {
  it('renders Auto + L0..Lmax with on/mixed state and routes taps', () => {
    root = document.createElement('div');
    document.body.appendChild(root);
    const onToggleLevel = vi.fn();
    const onAuto = vi.fn();
    render(h(LevelPickerPopup, {
      x: 10, y: 10, maxLevel: 2, autoState: 'off',
      levelState: (l: number) => (l === 0 ? 'on' : l === 1 ? 'mixed' : 'off'),
      onToggleLevel, onAuto, onClose: () => {}
    }), root);
    const chips = [...root.querySelectorAll('button.windrose-ladder-chip')];
    expect(chips.map(c => c.textContent)).toEqual(['Auto', 'L0', 'L1', 'L2']);
    expect(chips[1].classList.contains('is-current')).toBe(true);
    expect(chips[2].classList.contains('is-mixed')).toBe(true);
    expect(chips[2].getAttribute('aria-pressed')).toBe('mixed');
    expect(chips[3].getAttribute('aria-label')).toBe('Level 2 visible');
    (chips[3] as HTMLButtonElement).click();
    (chips[0] as HTMLButtonElement).click();
    expect(onToggleLevel).toHaveBeenCalledWith(2);
    expect(onAuto).toHaveBeenCalledTimes(1);
  });

  it('chipStateOf: all on, some on, none on', () => {
    expect(chipStateOf([true, true])).toBe('on');
    expect(chipStateOf([true, false])).toBe('mixed');
    expect(chipStateOf([false])).toBe('off');
  });
});

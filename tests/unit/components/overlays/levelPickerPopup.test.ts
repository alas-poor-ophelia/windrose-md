// @vitest-environment happy-dom
/**
 * Ladder level picker (kgc.31): one chip per rung plus Auto, state classes and
 * aria-pressed per chip, taps routed to the callbacks.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';

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
    expect(chips[1].classList.contains('is-on')).toBe(true);
    expect(chips[2].classList.contains('is-mixed')).toBe(true);
    expect(chips[2].getAttribute('aria-pressed')).toBe('mixed');
    expect(chips[3].getAttribute('aria-label')).toBe('Level 2 visible');
    (chips[3] as HTMLButtonElement).click();
    (chips[0] as HTMLButtonElement).click();
    expect(onToggleLevel).toHaveBeenCalledWith(2);
    expect(onAuto).toHaveBeenCalledTimes(1);
  });

  it('has role and label', () => {
    root = document.createElement('div');
    document.body.appendChild(root);
    render(h(LevelPickerPopup, {
      x: 10, y: 10, maxLevel: 1, autoState: 'on' as const, levelState: () => 'off' as const,
      onToggleLevel: () => {}, onAuto: () => {}, onClose: () => {}
    }), root);
    expect(root.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Visible on levels');
  });

  it('Escape closes and does not clear the selection', () => {
    root = document.createElement('div');
    document.body.appendChild(root);
    const onClose = vi.fn();
    const mapKey = vi.fn();
    document.body.addEventListener('keydown', mapKey);
    const el = root;
    act(() => { render(h(LevelPickerPopup, {
      x: 10, y: 10, maxLevel: 1, autoState: 'on' as const, levelState: () => 'off' as const,
      onToggleLevel: () => {}, onAuto: () => {}, onClose
    }), el); });
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.body.dispatchEvent(ev);
    document.body.removeEventListener('keydown', mapKey);
    expect(onClose).toHaveBeenCalledTimes(1);
    // The capture listener on the document stops it before the map's own handler.
    expect(mapKey).not.toHaveBeenCalled();
  });

  it('chipStateOf: all on, some on, none on', () => {
    expect(chipStateOf([true, true])).toBe('on');
    expect(chipStateOf([true, false])).toBe('mixed');
    expect(chipStateOf([false])).toBe('off');
  });
});

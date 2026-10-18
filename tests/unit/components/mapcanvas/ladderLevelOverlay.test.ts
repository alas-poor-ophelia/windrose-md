// @vitest-environment happy-dom
/**
 * LadderLevelOverlay: chips, current/locked state, labels, lock toggle, the
 * edit readout, and no re-render on a live tick that does not cross a rung.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';

const mocks = vi.hoisted(() => ({
  useMapState: vi.fn(),
  onMapDataUpdate: vi.fn()
}));

vi.mock('../../../../src/context/MapContext', () => ({
  useMapState: mocks.useMapState,
  useMapOperations: () => ({ onMapDataUpdate: mocks.onMapDataUpdate })
}));
vi.mock('../../../../src/components/shared/Icon', () => ({
  Icon: () => null
}));

import { LadderLevelOverlay } from '../../../../src/components/mapcanvas/LadderLevelOverlay';

let root: HTMLElement | null = null;
let live = { zoom: 1.2, x: 0, y: 0 };
let listener: ((vs: unknown) => void) | null = null;
const setEditLevelLock = vi.fn();

function setup(editLevelLock: number | null = null): void {
  const viewController = {
    getLive: () => live,
    subscribeLive: (cb: (vs: unknown) => void) => { listener = cb; return () => { listener = null; }; }
  };
  const ladder = {
    params: { maxLevel: 3, minCellPx: 24 },
    // One rung per whole zoom unit.
    activeLevel: (zoom: number) => Math.min(3, Math.floor(zoom))
  };
  mocks.useMapState.mockImplementation(() => ({
    ladder, viewController, editLevelLock, setEditLevelLock, mapData: { lod: {} }
  }));
  root = document.createElement('div');
  document.body.appendChild(root);
  act(() => { render(h(LadderLevelOverlay, {}), root as HTMLElement); });
}

beforeEach(() => {
  live = { zoom: 1.2, x: 0, y: 0 };
  listener = null;
  mocks.useMapState.mockReset();
  setEditLevelLock.mockReset();
});
afterEach(() => {
  if (root) { render(null, root); root.remove(); root = null; }
});

describe('LadderLevelOverlay', () => {
  it('renders one chip per rung with the camera rung current and aria labels', () => {
    setup();
    const chips = [...(root as HTMLElement).querySelectorAll('.windrose-ladder-chip')];
    expect(chips.map(c => c.textContent)).toEqual(['L0', 'L1', 'L2', 'L3']);
    expect(chips[1].classList.contains('is-current')).toBe(true);
    expect(chips[1].getAttribute('aria-current')).toBe('true');
    expect(chips[0].getAttribute('aria-label')).toBe('Zoom to level 0');
    expect(chips[0].tagName).toBe('BUTTON');
    expect((root as HTMLElement).querySelector('.windrose-ladder-readout')?.textContent).toBe('level: L1');
  });

  it('lock button has a fixed label and aria-pressed, and toggles the lock', () => {
    setup();
    const lock = (root as HTMLElement).querySelector('button.windrose-ladder-lock') as HTMLButtonElement;
    expect(lock.getAttribute('aria-label')).toBe('Lock edit level');
    expect(lock.getAttribute('aria-pressed')).toBe('false');
    act(() => { lock.click(); });
    expect(setEditLevelLock).toHaveBeenCalledWith(1);
  });

  it('a locked rung is marked and the readout shows the edit level', () => {
    setup(0);
    const el = root as HTMLElement;
    const chips = [...el.querySelectorAll('.windrose-ladder-chip')];
    expect(chips[0].classList.contains('is-locked')).toBe(true);
    expect(el.querySelector('.windrose-ladder-lock')?.getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('.windrose-ladder-readout-edit')?.textContent).toBe('edit: L0');
  });

  it('no re-render on a live tick without a crossing', () => {
    setup();
    const rendersBefore = mocks.useMapState.mock.calls.length;
    act(() => { listener?.({ ...live, zoom: 1.7 }); });
    act(() => { listener?.({ ...live, zoom: 1.9 }); });
    expect(mocks.useMapState.mock.calls.length).toBe(rendersBefore);
    act(() => { listener?.({ ...live, zoom: 2.1 }); });
    expect(mocks.useMapState.mock.calls.length).toBeGreaterThan(rendersBefore);
    const chips = [...(root as HTMLElement).querySelectorAll('.windrose-ladder-chip')];
    expect(chips[2].classList.contains('is-current')).toBe(true);
  });
});

// @vitest-environment happy-dom
/**
 * Provider value stability (REACT-01, STRUCT-B-13 / REACT-06).
 *
 * - MapSelectionProvider: the selection value keeps its identity across an
 *   unrelated parent re-render and across hover updates; hover lives in its
 *   own context (useHoverState) so selection consumers do not re-render per
 *   mousemove.
 * - MapSettingsProvider: handlers keep their identity while hex bounds are
 *   edited, and globalSettings is read once per open.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { h, render } from 'preact';
import type { ComponentChild } from 'preact';
import { act } from 'preact/test-utils';

const getSettingsMock = vi.fn(() => ({}));
vi.mock('../../../src/core/settingsAccessor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/core/settingsAccessor')>();
  return { ...actual, getSettings: () => getSettingsMock() };
});

import { MapSelectionProvider, useMapSelection, useHoverState } from '../../../src/context/MapSelectionContext';
import { MapSettingsProvider, useHexGrid, useAppearance } from '../../../src/context/MapSettingsContext';
import type { MapSelectionContextValue, MapHoverContextValue, LayerVisibility } from '../../../types/contexts/context.types';
import type { HexGridContextValue, AppearanceContextValue } from '../../../src/context/MapSettingsContext';

let root: HTMLElement | null = null;

afterEach(() => {
  if (root) {
    render(null, root);
    root.remove();
    root = null;
  }
});

function mountRoot(): HTMLElement {
  root = document.createElement('div');
  document.body.appendChild(root);
  return root;
}

describe('MapSelectionProvider value stability (REACT-01)', () => {
  const visibility: Partial<LayerVisibility> = { grid: false };

  it('keeps value + layerVisibility identity across an unrelated re-render and hover updates', () => {
    const seen: MapSelectionContextValue[] = [];
    let hover: MapHoverContextValue | null = null;
    let selectionRenders = 0;
    let hoverRenders = 0;

    function SelectionConsumer(): null {
      seen.push(useMapSelection());
      selectionRenders++;
      return null;
    }
    function HoverConsumer(): null {
      hover = useHoverState();
      hoverRenders++;
      return null;
    }
    // Children are created once so a provider re-render alone does not re-render them
    const children = [h(SelectionConsumer, null), h(HoverConsumer, null)];
    // Parent re-renders with a changing unrelated prop; the provider gets the same props
    function Parent({ n }: { n: number }): ComponentChild {
      return h('div', { title: String(n) }, h(MapSelectionProvider, { layerVisibility: visibility, children }));
    }
    const tree = (n: number): ComponentChild => h(Parent, { n });

    const el = mountRoot();
    act(() => { render(tree(0), el); });
    const first = seen[seen.length - 1];
    expect(first.layerVisibility.grid).toBe(false);
    expect(first.layerVisibility.objects).toBe(true);

    // Unrelated parent re-render (same layerVisibility prop)
    act(() => { render(tree(1), el); });
    expect(seen[seen.length - 1]).toBe(first);

    const selectionBefore = selectionRenders;
    const hoverBefore = hoverRenders;

    // Hover updates (what useObjectHover does per mousemove)
    act(() => {
      first.setHoveredObject({ id: 'o1', type: 'chest', label: 'Chest' });
      first.setMousePosition({ x: 10, y: 20 });
    });
    act(() => { first.setMousePosition({ x: 11, y: 21 }); });

    expect(seen[seen.length - 1]).toBe(first);
    expect(selectionRenders).toBe(selectionBefore);
    expect(hoverRenders).toBeGreaterThan(hoverBefore);
    expect(hover).toEqual({ hoveredObject: { id: 'o1', type: 'chest', label: 'Chest' }, mousePosition: { x: 11, y: 21 } });

    // A real selection change still produces a new value
    act(() => { first.selectItem({ id: 'o1', type: 'object', data: {} } as never); });
    expect(seen[seen.length - 1]).not.toBe(first);
  });
});

describe('MapSettingsProvider handler stability (STRUCT-B-13 / REACT-06)', () => {
  it('keeps handleHexBoundsChange identity across bounds edits and reads globalSettings once per open', () => {
    let hex: HexGridContextValue | null = null;
    let appearance: AppearanceContextValue | null = null;
    function Probe(): null {
      hex = useHexGrid();
      appearance = useAppearance();
      return null;
    }
    const el = mountRoot();
    getSettingsMock.mockClear();
    act(() => {
      render(h(MapSettingsProvider, {
        isOpen: true,
        onClose: () => {},
        onSave: () => {},
        mapType: 'hex',
        currentHexBounds: { maxCol: 26, maxRow: 20 },
        children: h(Probe, null),
      }), el);
    });
    const callsAfterOpen = getSettingsMock.mock.calls.length;
    const h0 = hex!;
    const globalSettings0 = appearance!.globalSettings;

    act(() => { h0.handleHexBoundsChange('maxCol', '30'); });
    act(() => { hex!.handleHexBoundsChange('maxRow', '12'); });

    expect(hex!.hexBounds).toEqual({ maxCol: 30, maxRow: 12 });
    expect(hex!.handleHexBoundsChange).toBe(h0.handleHexBoundsChange);
    expect(hex!.handleRadiusChange).toBe(h0.handleRadiusChange);
    expect(appearance!.globalSettings).toBe(globalSettings0);
    expect(getSettingsMock.mock.calls.length).toBe(callsAfterOpen);
  });
});

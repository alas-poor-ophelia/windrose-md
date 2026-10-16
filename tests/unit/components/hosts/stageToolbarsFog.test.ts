// @vitest-environment happy-dom
/**
 * Fog toolbar wiring through StageToolbars (live check U3-U5).
 *
 * Mirrors the DungeonMapTracker wiring: useFogOfWar owns showFogTools, the
 * visibility toolbar's "Fog of War tools" button toggles it, and the
 * FogOfWarToolbar renders with isOpen = showFogTools && showVisibilityToolbar.
 * Clicking the toggle must put `.windrose-fow-floating-toolbar` in the DOM.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { h, render } from 'preact';
import type { VNode, ComponentProps } from 'preact';
import { act } from 'preact/test-utils';

vi.mock('../../../../src/core/settingsAccessor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/core/settingsAccessor')>();
  // fogOfWar absent: must resolve to enabled (matches the live dev vault).
  return { ...actual, getSettings: () => ({ features: { partyPin: true } }) };
});

vi.mock('../../../../src/components/shared/obsidianTooltip', () => ({ tooltipRef: () => () => {} }));

vi.mock('../../../../src/components/shared/Icon', () => ({ Icon: () => null }));
// The weather toggle reads the per-map weather store; without a
// WeatherProvider useWeatherStore() is the inert, unavailable store.

import { StageToolbars } from '../../../../src/components/hosts/StageToolbars';
import { AppContext } from '../../../../src/context/AppContext';
import { useFogOfWar } from '../../../../src/hooks/interactions/useFogOfWar';
import type { LayerVisibility } from '../../../../types/contexts/context.types';

let root: HTMLElement | null = null;

afterEach(() => {
  if (root) {
    render(null, root);
    root.remove();
    root = null;
  }
});

const layerVisibility = { grid: true, objects: true, textLabels: true, hexCoordinates: false } as unknown as LayerVisibility;

function Harness({ fullPane, showVisibilityToolbar }: { fullPane: boolean; showVisibilityToolbar: boolean }): VNode {
  const fog = useFogOfWar({ mapData: null, geometry: null, updateMapData: () => {} } as unknown as Parameters<typeof useFogOfWar>[0]);
  const props: ComponentProps<typeof StageToolbars> = {
    fullPane,
    toolPalette: {} as never,
    paletteDocked: false,
    onPopOutPalette: () => {},
    visibility: fullPane ? null : {
      isOpen: showVisibilityToolbar, layerVisibility, onToggleLayer: () => {},
      mapType: 'grid', showFogTools: fog.showFogTools, onFogToolsToggle: fog.handleFogToolsToggle,
    },
    fogToolbar: fullPane ? null : {
      isOpen: fog.showFogTools && showVisibilityToolbar, fogOfWarState: fog.currentFogState,
      onFogToolSelect: fog.handleFogToolSelect, onFogVisibilityToggle: fog.handleFogVisibilityToggle,
      onFogFillAll: fog.handleFogFillAll, onFogClearAll: fog.handleFogClearAll,
    },
  };
  return h(StageToolbars, props) as VNode;
}

function mount(fullPane: boolean): HTMLElement {
  root = document.createElement('div');
  document.body.appendChild(root);
  act(() => {
    render(h(AppContext.Provider, { value: {} as never }, h(Harness, { fullPane, showVisibilityToolbar: true })), root!);
  });
  return root;
}

describe('StageToolbars fog toolbar (block mode)', () => {
  it('renders the floating fog toolbar after the Fog of War tools toggle is clicked', () => {
    const el = mount(false);
    const toggle = el.querySelector<HTMLButtonElement>('.windrose-toolbar-anchor .windrose-fow-toggle-btn');
    expect(toggle).not.toBeNull();
    expect(document.querySelector('.windrose-fow-floating-toolbar')).toBeNull();

    act(() => { toggle!.click(); });

    expect(toggle!.classList.contains('expanded')).toBe(true);
    expect(document.querySelector('.windrose-fow-floating-toolbar')).not.toBeNull();

    act(() => { toggle!.click(); });
    expect(document.querySelector('.windrose-fow-floating-toolbar')).toBeNull();
  });
});

describe('StageToolbars fog toolbar (full-pane)', () => {
  it('renders neither the visibility toolbar nor the floating fog toolbar (fog lives in the dock View panel)', () => {
    const el = mount(true);
    expect(el.querySelector('.windrose-fow-toggle-btn')).toBeNull();
    expect(document.querySelector('.windrose-fow-floating-toolbar')).toBeNull();
  });
});

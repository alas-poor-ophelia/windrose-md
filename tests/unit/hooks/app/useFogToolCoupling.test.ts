// @vitest-environment happy-dom
/**
 * Fog pseudo-tool must not stick (fix-fog-sticky).
 *
 * Mirrors the DungeonMapTracker wiring: useToolState wrapped by
 * useFogAwareToolState, useFogOfWar, useReleaseFogOnSurfaceClose; renders the
 * real StageToolbars (docked palette + visibility + fog toolbar) and the real
 * DockViewPanel (block rail View flyout / full-pane dock View section).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { h, render } from 'preact';
import type { VNode, ComponentProps } from 'preact';
import { useState } from 'preact/hooks';
import { act } from 'preact/test-utils';

vi.mock('../../../../src/core/settingsAccessor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/core/settingsAccessor')>();
  return { ...actual, getSettings: () => ({ features: { partyPin: true } }) };
});
vi.mock('../../../../src/components/shared/obsidianTooltip', () => ({ tooltipRef: () => () => {} }));
vi.mock('../../../../src/components/shared/Icon', () => ({ Icon: () => null }));

import { StageToolbars } from '../../../../src/components/hosts/StageToolbars';
import { DockViewPanel } from '../../../../src/components/panels/DockViewPanel';
import { AppContext } from '../../../../src/context/AppContext';
import { useFogOfWar } from '../../../../src/hooks/interactions/useFogOfWar';
import { useToolState } from '../../../../src/hooks/state/useToolState';
import { useFogAwareToolState, useReleaseFogOnSurfaceClose, isFogSurfaceOpen } from '../../../../src/hooks/app/useFogToolCoupling';
import type { LayerVisibility } from '../../../../types/contexts/context.types';
import type { FogToolId } from '../../../../types/hooks/fog.types';

const layerVisibility = { grid: true, objects: true, textLabels: true, hexCoordinates: false } as unknown as LayerVisibility;

interface Ctl {
  fogActiveTool: FogToolId | null;
  showFogTools: boolean;
  currentTool: string;
  setShowVisibilityToolbar: (v: boolean) => void;
  setRailOpenId: (v: string | null) => void;
  setViewDockOpen: (v: boolean) => void;
}
const ctl = {} as Ctl;

function Harness({ fullPane }: { fullPane: boolean }): VNode {
  const { toolState, releaseFogRef } = useFogAwareToolState(useToolState());
  const fog = useFogOfWar({ mapData: null, geometry: null, updateMapData: () => {} } as unknown as Parameters<typeof useFogOfWar>[0]);
  releaseFogRef.current = fog.releaseFog;
  const [showVisibilityToolbar, setShowVisibilityToolbar] = useState(!fullPane);
  const [railOpenId, setRailOpenId] = useState<string | null>(null);
  const [viewDockOpen, setViewDockOpen] = useState(fullPane);
  useReleaseFogOnSurfaceClose({
    fullPane, showVisibilityToolbar, showFogTools: fog.showFogTools, railOpenId, viewDockOpen, viewFloating: false,
  }, fog.releaseFog);
  Object.assign(ctl, {
    fogActiveTool: fog.fogActiveTool, showFogTools: fog.showFogTools, currentTool: toolState.currentTool,
    setShowVisibilityToolbar, setRailOpenId, setViewDockOpen,
  });
  const props: ComponentProps<typeof StageToolbars> = {
    fullPane,
    toolPalette: {
      currentTool: toolState.currentTool, onToolChange: toolState.setCurrentTool,
      onUndo: () => {}, onRedo: () => {}, canUndo: false, canRedo: false, mapType: 'grid',
      fogArmed: fog.fogActiveTool != null,
    },
    paletteDocked: true,
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
  const showView = fullPane ? viewDockOpen : railOpenId === 'view';
  return h('div', null,
    h(StageToolbars, props),
    showView ? h('div', { className: 'view-host' }, h(DockViewPanel, {
      currentZoom: 1, onZoomIn: () => {}, onZoomOut: () => {}, layerVisibility, onToggleLayer: () => {},
      mapType: 'grid', fogOfWarState: fog.currentFogState, onFogToolSelect: fog.handleFogToolSelect,
      onFogVisibilityToggle: fog.handleFogVisibilityToggle, onFogFillAll: fog.handleFogFillAll, onFogClearAll: fog.handleFogClearAll,
    })) : null,
  ) as VNode;
}

let root: HTMLElement | null = null;
afterEach(() => {
  if (root) { render(null, root); root.remove(); root = null; }
});

function mount(fullPane: boolean): HTMLElement {
  root = document.createElement('div');
  document.body.appendChild(root);
  act(() => {
    render(h(AppContext.Provider, { value: {} as never }, h(Harness, { fullPane })), root!);
  });
  return root;
}

const activePaletteButtons = (): number => document.querySelectorAll('.windrose-tool-palette .windrose-tool-btn-active').length;

function armFogPaintFromToolbar(el: HTMLElement): void {
  act(() => { el.querySelector<HTMLButtonElement>('.windrose-fow-toggle-btn')!.click(); });
  // FogOfWarToolbar buttons: [visibility, paint, erase, rectangle, ...]
  const paint = document.querySelectorAll<HTMLButtonElement>('.windrose-fow-floating-toolbar .windrose-fow-tool-btn')[1];
  expect(paint).toBeDefined();
  act(() => { paint.click(); });
  expect(ctl.fogActiveTool).toBe('paint');
}

function armFogPaintFromViewPanel(el: HTMLElement): void {
  const paint = Array.from(el.querySelectorAll<HTMLButtonElement>('.view-host .windrose-dock-view-toggle'))
    .find(b => b.textContent === 'Paint');
  expect(paint).toBeDefined();
  act(() => { paint!.click(); });
  expect(ctl.fogActiveTool).toBe('paint');
}

function pickPaletteTool(el: HTMLElement): void {
  const btn = el.querySelector<HTMLButtonElement>('.windrose-tool-palette .windrose-tool-btn');
  expect(btn).not.toBeNull();
  // Group buttons select on a short press (pointerdown then pointerup).
  act(() => {
    btn!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    btn!.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });
}

describe('fog pseudo-tool coupling (block mode, fog toolbar)', () => {
  it('arming a fog tool clears the palette highlight; picking a palette tool leaves fog mode', () => {
    const el = mount(false);
    expect(activePaletteButtons()).toBe(1);
    armFogPaintFromToolbar(el);
    expect(activePaletteButtons()).toBe(0);

    pickPaletteTool(el);
    expect(ctl.fogActiveTool).toBeNull();
    expect(ctl.showFogTools).toBe(false);
    expect(document.querySelector('.windrose-fow-floating-toolbar')).toBeNull();
    expect(activePaletteButtons()).toBe(1);
  });

  it('closing the fog toolbar restores the previous palette tool highlight', () => {
    const el = mount(false);
    const before = ctl.currentTool;
    armFogPaintFromToolbar(el);
    act(() => { el.querySelector<HTMLButtonElement>('.windrose-fow-toggle-btn')!.click(); });
    expect(ctl.fogActiveTool).toBeNull();
    expect(ctl.currentTool).toBe(before);
    expect(activePaletteButtons()).toBe(1);
  });

  it('closing the visibility toolbar leaves fog mode', () => {
    const el = mount(false);
    armFogPaintFromToolbar(el);
    act(() => { ctl.setShowVisibilityToolbar(false); });
    expect(ctl.fogActiveTool).toBeNull();
    expect(ctl.showFogTools).toBe(false);
  });
});

describe('fog pseudo-tool coupling (block mode, left rail View flyout)', () => {
  it('closing the drawer leaves fog mode', () => {
    const el = mount(false);
    act(() => { ctl.setShowVisibilityToolbar(false); ctl.setRailOpenId('view'); });
    armFogPaintFromViewPanel(el);
    act(() => { ctl.setRailOpenId(null); });
    expect(ctl.fogActiveTool).toBeNull();
  });

  it('picking a palette tool leaves fog mode with the drawer still open', () => {
    const el = mount(false);
    act(() => { ctl.setRailOpenId('view'); });
    armFogPaintFromViewPanel(el);
    expect(activePaletteButtons()).toBe(0);
    pickPaletteTool(el);
    expect(ctl.fogActiveTool).toBeNull();
    expect(activePaletteButtons()).toBe(1);
  });
});

describe('fog pseudo-tool coupling (full-pane dock View section)', () => {
  it('picking a palette tool leaves fog mode', () => {
    const el = mount(true);
    armFogPaintFromViewPanel(el);
    expect(activePaletteButtons()).toBe(0);
    pickPaletteTool(el);
    expect(ctl.fogActiveTool).toBeNull();
    expect(activePaletteButtons()).toBe(1);
  });

  it('collapsing the View section leaves fog mode', () => {
    const el = mount(true);
    armFogPaintFromViewPanel(el);
    act(() => { ctl.setViewDockOpen(false); });
    expect(ctl.fogActiveTool).toBeNull();
  });
});

describe('isFogSurfaceOpen', () => {
  const base = { fullPane: false, showVisibilityToolbar: false, showFogTools: false, railOpenId: null, viewDockOpen: false, viewFloating: false };
  it('block: fog toolbar needs both the visibility toolbar and the fog toggle', () => {
    expect(isFogSurfaceOpen({ ...base, showVisibilityToolbar: true })).toBe(false);
    expect(isFogSurfaceOpen({ ...base, showVisibilityToolbar: true, showFogTools: true })).toBe(true);
    expect(isFogSurfaceOpen({ ...base, railOpenId: 'view' })).toBe(true);
    expect(isFogSurfaceOpen({ ...base, railOpenId: 'layers' })).toBe(false);
  });
  it('full-pane: the dock View section or a floated View panel', () => {
    expect(isFogSurfaceOpen({ ...base, fullPane: true, railOpenId: 'view' })).toBe(false);
    expect(isFogSurfaceOpen({ ...base, fullPane: true, viewDockOpen: true })).toBe(true);
    expect(isFogSurfaceOpen({ ...base, fullPane: true, viewFloating: true })).toBe(true);
  });
});

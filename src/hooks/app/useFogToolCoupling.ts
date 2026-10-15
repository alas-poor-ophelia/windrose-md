// useFogToolCoupling.ts - Couples the fog-of-war pseudo-tool to the normal tool
// state. Fog tools (paint / erase / rectangle) live in useFogOfWar, apart from
// currentTool; arming one leaves currentTool untouched, so releasing fog falls
// back to whatever palette tool was active before (that IS the restore).
//
// Two transitions leave fog mode:
//  1. Any normal tool pick (palette, keyboard shortcut, drawer, tile coupling,
//     MCP) goes through the wrapped setCurrentTool, which releases fog first.
//  2. Every surface that shows the fog tools closes (block: the fog toolbar or
//     the left rail's View flyout; full-pane: the dock's View section; either:
//     a floated View panel), so an armed tool is never left with no UI.

import { useCallback, useEffect, useRef } from 'preact/hooks';
import type { MutableRef } from 'preact/hooks';
import type { ToolId } from '#types/tools/tool.types';

const noop = (): void => {};

interface ToolSetterHolder {
  setCurrentTool: (tool: ToolId) => void;
}

interface FogAwareToolState<T extends ToolSetterHolder> {
  /** The tool state with setCurrentTool wrapped to release fog first. */
  toolState: T;
  /** Assign the fog hook's releaseFog here once it exists (it is created later in the render). */
  releaseFogRef: MutableRef<() => void>;
}

function useFogAwareToolState<T extends ToolSetterHolder>(raw: T): FogAwareToolState<T> {
  const releaseFogRef = useRef<() => void>(noop);
  const rawSet = raw.setCurrentTool;
  const setCurrentTool = useCallback((tool: ToolId): void => {
    releaseFogRef.current();
    rawSet(tool);
  }, [rawSet]);
  return { toolState: { ...raw, setCurrentTool }, releaseFogRef };
}

interface FogSurfaceState {
  fullPane: boolean;
  /** Block: visibility toolbar open (the fog toolbar renders only inside it). */
  showVisibilityToolbar: boolean;
  /** Block: fog toolbar toggled on. */
  showFogTools: boolean;
  /** Block: which left-rail flyout is open. */
  railOpenId: string | null;
  /** Full-pane: dock column expanded AND its View section expanded. */
  viewDockOpen: boolean;
  /** Either mode: the View panel is floated (always visible while floated). */
  viewFloating: boolean;
}

/** True while at least one surface that shows the fog tools is visible. */
function isFogSurfaceOpen(s: FogSurfaceState): boolean {
  if (s.viewFloating) return true;
  if (s.fullPane) return s.viewDockOpen;
  return (s.showVisibilityToolbar && s.showFogTools) || s.railOpenId === 'view';
}

/** Releases fog whenever the last fog surface closes. */
function useReleaseFogOnSurfaceClose(surfaces: FogSurfaceState, releaseFog: () => void): void {
  const open = isFogSurfaceOpen(surfaces);
  useEffect(() => {
    if (!open) releaseFog();
  }, [open, releaseFog]);
}

export { useFogAwareToolState, useReleaseFogOnSurfaceClose, isFogSurfaceOpen };
export type { FogSurfaceState };

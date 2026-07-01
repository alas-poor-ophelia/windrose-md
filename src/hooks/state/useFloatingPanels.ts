import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

import { Z_INDEX } from '../../core/dmtConstants';

type PanelId = 'layers' | 'regions' | 'objects' | 'tiles' | 'colorPicker' | 'view' | 'visibility' | 'fogOfWar' | 'toolPalette';

interface PanelState {
  floating: boolean;
  focusOrder: number;
  initialPosition?: { x: number; y: number };
}

interface UseFloatingPanelsOptions {
  fullPane: boolean;
  savedState?: Partial<Record<PanelId, PanelState>>;
  onStateChange?: (state: Partial<Record<PanelId, PanelState>>) => void;
}

interface UseFloatingPanelsResult {
  isFloating: (panelId: PanelId) => boolean;
  getZIndex: (panelId: PanelId) => number;
  getInitialPosition: (panelId: PanelId) => { x: number; y: number } | undefined;
  toggleFloat: (panelId: PanelId, initialPosition?: { x: number; y: number }) => void;
  bringToFront: (panelId: PanelId) => void;
  updatePosition: (panelId: PanelId, position: { x: number; y: number }) => void;
}

function useFloatingPanels({ fullPane, savedState, onStateChange }: UseFloatingPanelsOptions): UseFloatingPanelsResult {
  const [panels, setPanels] = useState<Partial<Record<PanelId, PanelState>>>(() => savedState ?? {});
  const focusCounterRef = useRef(0);
  const initializedRef = useRef(false);

  // Restore focus counter from saved state
  if (!initializedRef.current && savedState) {
    const maxOrder = Object.values(savedState).reduce((max, p) => Math.max(max, p?.focusOrder ?? 0), 0);
    focusCounterRef.current = maxOrder;
    initializedRef.current = true;
  }

  // Notify parent when panel state changes (skip initial render)
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    onStateChange?.(panels);
  }, [panels, onStateChange]);

  const isFloating = useCallback((panelId: PanelId): boolean => {
    if (!fullPane) return false;
    return panels[panelId]?.floating ?? false;
  }, [fullPane, panels]);

  const getZIndex = useCallback((panelId: PanelId): number => {
    const panel = panels[panelId];
    if (panel?.floating !== true) return Z_INDEX.FLOATING_PANEL;
    return Z_INDEX.FLOATING_PANEL + panel.focusOrder;
  }, [panels]);

  const getInitialPosition = useCallback((panelId: PanelId): { x: number; y: number } | undefined => {
    return panels[panelId]?.initialPosition;
  }, [panels]);

  const toggleFloat = useCallback((panelId: PanelId, initialPosition?: { x: number; y: number }) => {
    if (!fullPane) return;
    setPanels(prev => {
      const current = prev[panelId];
      const newFloating = !(current?.floating ?? false);
      if (newFloating) {
        focusCounterRef.current += 1;
      }
      return {
        ...prev,
        [panelId]: {
          floating: newFloating,
          focusOrder: newFloating ? focusCounterRef.current : 0,
          initialPosition: newFloating ? initialPosition : current?.initialPosition,
        }
      };
    });
  }, [fullPane]);

  const bringToFront = useCallback((panelId: PanelId) => {
    setPanels(prev => {
      const current = prev[panelId];
      if (current?.floating !== true) return prev;
      focusCounterRef.current += 1;
      if (current.focusOrder === focusCounterRef.current - 1) return prev;
      return {
        ...prev,
        [panelId]: { ...current, focusOrder: focusCounterRef.current }
      };
    });
  }, []);

  const updatePosition = useCallback((panelId: PanelId, position: { x: number; y: number }) => {
    setPanels(prev => {
      const current = prev[panelId];
      if (current?.floating !== true) return prev;
      return {
        ...prev,
        [panelId]: { ...current, initialPosition: position }
      };
    });
  }, []);

  return { isFloating, getZIndex, getInitialPosition, toggleFloat, bringToFront, updatePosition };
}

export { useFloatingPanels };
export type { PanelId, PanelState, UseFloatingPanelsResult };

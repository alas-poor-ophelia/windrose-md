/**
 * useUILayout.ts
 *
 * Manages UI layout state for DungeonMapTracker:
 * - Expand/collapse with animation
 * - Panel visibility (layer panel, region panel, visibility toolbar)
 * - Footer, focus state
 * - Container ref and parent element class management
 */

import type { MapData } from '#types/core/map.types';

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { getSetting } from '../../core/settingsAccessor';






interface UseUILayoutOptions {
  mapData: MapData | null;
  updateMapData: (data: MapData | ((current: MapData) => MapData)) => void;
}

interface LayerVisibilityState {
  grid: boolean;
  objects: boolean;
  textLabels: boolean;
  hexCoordinates: boolean;
  regions: boolean;
  outlines: boolean;
}

interface UseUILayoutResult {
  containerRef: { current: HTMLDivElement | null };
  isFocused: boolean;
  setIsFocused: (v: boolean) => void;
  isExpanded: boolean;
  isAnimating: boolean;
  handleToggleExpand: () => void;
  showFooter: boolean;
  setShowFooter: (v: boolean) => void;
  showVisibilityToolbar: boolean;
  setShowVisibilityToolbar: (v: boolean) => void;
  showLayerPanel: boolean;
  setShowLayerPanel: (v: boolean) => void;
  showRegionPanel: boolean;
  setShowRegionPanel: (v: boolean) => void;
  layerVisibility: LayerVisibilityState;
  handleToggleLayerVisibility: (layerId: keyof LayerVisibilityState) => void;
}

function useUILayout({
  mapData,
  updateMapData
}: UseUILayoutOptions): UseUILayoutResult {

  const [showFooter, setShowFooter] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showVisibilityToolbar, setShowVisibilityToolbar] = useState(false);
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [showRegionPanel, setShowRegionPanel] = useState(false);

  // Layer visibility state (session-only, resets on reload)
  const [layerVisibility, setLayerVisibility] = useState<LayerVisibilityState>({
    grid: true,
    objects: true,
    textLabels: true,
    hexCoordinates: false,
    regions: true,
    outlines: true
  });

  const handleToggleLayerVisibility = useCallback((layerId: keyof LayerVisibilityState) => {
    setLayerVisibility((prev: LayerVisibilityState) => ({
      ...prev,
      [layerId]: !prev[layerId]
    }));
  }, []);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const animationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize expanded state from settings or saved state (once, when mapData first arrives)
  const expandInitializedRef = useRef(false);
  useEffect(() => {
    if (!mapData || expandInitializedRef.current) return undefined;
    expandInitializedRef.current = true;

    const timer = setTimeout(() => {
      try {
        if (mapData.uiPreferences?.rememberExpandedState && mapData.expandedState !== undefined) {
          if (mapData.expandedState) {
            setIsExpanded(true);
            setIsAnimating(false);
          }
        } else {
          const expandedByDefault = getSetting('expandedByDefault');
          if (expandedByDefault) {
            setIsExpanded(true);
            setIsAnimating(false);
          }
        }
      } catch (error) {
        console.warn('[DungeonMapTracker] Error reading expanded state:', error);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [mapData]);

  // Manage parent element classes for expand/collapse
  useEffect(() => {
    if (!containerRef.current) return undefined;

    const container = containerRef.current;

    // Walk up to find cm-embed-block
    let cmEmbedBlock: HTMLElement | null = container.parentElement;
    while (cmEmbedBlock && !cmEmbedBlock.classList.contains('cm-embed-block')) {
      cmEmbedBlock = cmEmbedBlock.parentElement;
      if (cmEmbedBlock?.classList.contains('cm-editor')) {
        cmEmbedBlock = null;
        break;
      }
    }

    container.classList.toggle('dmt-expanded', isExpanded);
    container.classList.toggle('dmt-animating', isAnimating);

    if (cmEmbedBlock) {
      cmEmbedBlock.classList.add('dmt-cm-parent');
      cmEmbedBlock.classList.toggle('dmt-cm-expanded', isExpanded);
      cmEmbedBlock.classList.toggle('dmt-cm-animating', isAnimating);
    }

    return () => {
      container.classList.remove('dmt-expanded', 'dmt-animating');
      cmEmbedBlock?.classList.remove('dmt-cm-parent', 'dmt-cm-expanded', 'dmt-cm-animating');
    };
  }, [isExpanded, isAnimating]);

  const handleToggleExpand = (): void => {
    if (animationTimeoutRef.current) {
      clearTimeout(animationTimeoutRef.current);
      animationTimeoutRef.current = null;
    }

    const newExpandedState = !isExpanded;

    if (newExpandedState) {
      setIsExpanded(true);
      setIsAnimating(false);
    } else {
      setIsAnimating(true);
      setIsExpanded(false);

      animationTimeoutRef.current = setTimeout(() => {
        setIsAnimating(false);
        animationTimeoutRef.current = null;
      }, 300);
    }

    if (mapData && mapData.uiPreferences?.rememberExpandedState) {
      const newMapData = {
        ...mapData,
        expandedState: newExpandedState
      };
      updateMapData(newMapData);
    }
  };

  return {
    containerRef,
    isFocused, setIsFocused,
    isExpanded, isAnimating, handleToggleExpand,
    showFooter, setShowFooter,
    showVisibilityToolbar, setShowVisibilityToolbar,
    showLayerPanel, setShowLayerPanel,
    showRegionPanel, setShowRegionPanel,
    layerVisibility, handleToggleLayerVisibility
  };
}

export { useUILayout };
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
  fullPane?: boolean;
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
  updateMapData,
  fullPane = false
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
  const animationTimeoutRef = useRef<number | null>(null);

  // Initialize expanded state from settings or saved state (once, when mapData first arrives)
  const expandInitializedRef = useRef(false);
  useEffect(() => {
    if (!mapData || expandInitializedRef.current || fullPane) return undefined;
    expandInitializedRef.current = true;

    const timer = window.setTimeout(() => {
      try {
        if (mapData.uiPreferences?.rememberExpandedState === true && mapData.expandedState !== undefined) {
          if (mapData.expandedState === true) {
            setIsExpanded(true);
            setIsAnimating(false);
          }
        } else {
          const expandedByDefault = getSetting('expandedByDefault');
          if (expandedByDefault === true) {
            setIsExpanded(true);
            setIsAnimating(false);
          }
        }
      } catch (error) {
        console.warn('[DungeonMapTracker] Error reading expanded state:', error);
      }
    }, 100);

    return () => window.clearTimeout(timer);
  }, [mapData]);

  // Manage parent element classes for expand/collapse
  useEffect(() => {
    if (!containerRef.current) return undefined;

    const container = containerRef.current;

    // Walk up to find cm-embed-block
    let cmEmbedBlock: HTMLElement | null = container.parentElement;
    while (cmEmbedBlock && !cmEmbedBlock.classList.contains('cm-embed-block')) {
      cmEmbedBlock = cmEmbedBlock.parentElement;
      if (cmEmbedBlock?.classList.contains('cm-editor') === true) {
        cmEmbedBlock = null;
        break;
      }
    }

    container.classList.toggle('windrose-expanded', isExpanded);
    container.classList.toggle('windrose-animating', isAnimating);

    if (cmEmbedBlock) {
      cmEmbedBlock.classList.add('windrose-cm-parent');
      cmEmbedBlock.classList.toggle('windrose-cm-expanded', isExpanded);
      cmEmbedBlock.classList.toggle('windrose-cm-animating', isAnimating);

      if (isExpanded || isAnimating) {
        cmEmbedBlock.removeAttribute('contenteditable');
      } else if (!cmEmbedBlock.hasAttribute('contenteditable')) {
        cmEmbedBlock.setAttribute('contenteditable', 'false');
      }
    }

    return () => {
      container.classList.remove('windrose-expanded', 'windrose-animating');
      if (cmEmbedBlock) {
        cmEmbedBlock.classList.remove('windrose-cm-parent', 'windrose-cm-expanded', 'windrose-cm-animating');
        if (!cmEmbedBlock.hasAttribute('contenteditable')) {
          cmEmbedBlock.setAttribute('contenteditable', 'false');
        }
      }
    };
  }, [isExpanded, isAnimating]);

  const handleToggleExpand = (): void => {
    if (animationTimeoutRef.current != null) {
      window.clearTimeout(animationTimeoutRef.current);
      animationTimeoutRef.current = null;
    }

    const newExpandedState = !isExpanded;

    if (newExpandedState) {
      setIsExpanded(true);
      setIsAnimating(false);
    } else {
      setIsAnimating(true);
      setIsExpanded(false);

      animationTimeoutRef.current = window.setTimeout(() => {
        setIsAnimating(false);
        animationTimeoutRef.current = null;
      }, 300);
    }

    if (mapData != null && mapData.uiPreferences?.rememberExpandedState === true) {
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
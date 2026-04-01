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

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { getSetting } = await requireModuleByName("settingsAccessor.ts") as {
  getSetting: (key: string) => unknown;
};

interface UseUILayoutOptions {
  mapData: MapData | null;
  updateMapData: (data: MapData | ((current: MapData) => MapData)) => void;
  showPluginInstaller: boolean;
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
}

function useUILayout({
  mapData,
  updateMapData,
  showPluginInstaller
}: UseUILayoutOptions): UseUILayoutResult {

  const [showFooter, setShowFooter] = dc.useState(false);
  const [isFocused, setIsFocused] = dc.useState(false);
  const [isExpanded, setIsExpanded] = dc.useState(false);
  const [isAnimating, setIsAnimating] = dc.useState(false);
  const [showVisibilityToolbar, setShowVisibilityToolbar] = dc.useState(false);
  const [showLayerPanel, setShowLayerPanel] = dc.useState(false);
  const [showRegionPanel, setShowRegionPanel] = dc.useState(false);

  const containerRef = dc.useRef<HTMLDivElement | null>(null);
  const animationTimeoutRef = dc.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize expanded state from settings or saved state
  dc.useEffect(() => {
    if (showPluginInstaller || !mapData) return;

    const timer = setTimeout(() => {
      try {
        if (mapData.uiPreferences?.rememberExpandedState && mapData.expandedState !== undefined) {
          if (mapData.expandedState && !isExpanded) {
            setIsExpanded(true);
            setIsAnimating(false);
          }
        } else {
          const expandedByDefault = getSetting('expandedByDefault');
          if (expandedByDefault && !isExpanded) {
            setIsExpanded(true);
            setIsAnimating(false);
          }
        }
      } catch (error) {
        console.warn('[DungeonMapTracker] Error reading expanded state:', error);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [showPluginInstaller, mapData]);

  // Manage parent element classes for expand/collapse
  dc.useEffect(() => {
    if (!containerRef.current) return;

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
    showRegionPanel, setShowRegionPanel
  };
}

return { useUILayout };

/**
 * useSubHexNavigation.ts
 *
 * Manages sub-hex drill-down navigation via a stack-based approach.
 * Swaps the active mapData between parent and sub-hex levels,
 * allowing the entire DungeonMapTracker UI to be reused.
 */

import type { MapData, MapLayer, SubHexMapData, ViewState } from '#types/core/map.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

const { DEFAULTS, SCHEMA_VERSION } = await requireModuleByName("dmtConstants.ts") as {
  DEFAULTS: Record<string, any>;
  SCHEMA_VERSION: number;
};

const { generateLayerId } = await requireModuleByName("layerAccessor.ts") as {
  generateLayerId: () => string;
};

const { calculateFitZoom } = await requireModuleByName("fileOperations.ts") as {
  calculateFitZoom: (hexSize: number, orientation: string, hexBounds: any, canvasWidth: number, canvasHeight: number) => number;
};

// =========================================================================
// Types
// =========================================================================

interface SubHexNavFrame {
  parentMapData: MapData;
  parentViewState: ViewState;
  hexKey: string;
}

interface BreadcrumbSegment {
  label: string;
  depth: number;
}

type MapDataUpdater = (updater: MapData | ((prev: MapData | null) => MapData | null)) => void;

interface UseSubHexNavigationOptions {
  mapData: MapData | null;
  updateMapData: MapDataUpdater;
}

interface UseSubHexNavigationResult {
  activeMapData: MapData | null;
  activeUpdateMapData: MapDataUpdater;
  isInSubHex: boolean;
  depth: number;
  breadcrumbs: BreadcrumbSegment[];
  enterSubHex: (q: number, r: number) => void;
  exitSubHex: () => void;
  navigateToLevel: (depth: number) => void;
  navigationVersion: number;
}

// =========================================================================
// Sub-hex MapData creation
// =========================================================================

function createSubHexMapData(parentMapData: MapData, q: number, r: number): SubHexMapData {
  const layerId = generateLayerId();
  const subdivisionRings = 7;

  const initialLayer: MapLayer = {
    id: layerId,
    name: '1',
    order: 0,
    visible: true,
    cells: [],
    curves: [],
    edges: [],
    objects: [],
    textLabels: [],
    fogOfWar: null
  };

  const mapData: MapData = {
    name: `Hex (${q}, ${r})`,
    description: '',
    mapType: 'hex',
    northDirection: 0,
    customColors: [],
    sidebarCollapsed: false,
    expandedState: false,
    settings: {
      useGlobalSettings: true,
      overrides: {}
    },
    uiPreferences: {
      rememberPanZoom: true,
      rememberSidebarState: true,
      rememberExpandedState: false
    },
    lastTextLabelSettings: null,
    schemaVersion: SCHEMA_VERSION,
    activeLayerId: layerId,
    layerPanelVisible: false,
    layers: [initialLayer],
    gridSize: DEFAULTS.gridSize,
    dimensions: { ...DEFAULTS.dimensions },
    hexSize: parentMapData.hexSize || DEFAULTS.hexSize,
    orientation: parentMapData.orientation || DEFAULTS.hexOrientation,
    hexBounds: {
      maxCol: subdivisionRings * 2 + 1,
      maxRow: subdivisionRings * 2 + 1,
      maxRing: subdivisionRings
    },
    viewState: {
      zoom: calculateFitZoom(
        parentMapData.hexSize || DEFAULTS.hexSize,
        parentMapData.orientation || DEFAULTS.hexOrientation,
        { maxCol: subdivisionRings * 2 + 1, maxRow: subdivisionRings * 2 + 1, maxRing: subdivisionRings },
        DEFAULTS.canvasSize.width, DEFAULTS.canvasSize.height
      ),
      center: { x: 0, y: 0 }
    }
  };

  return {
    subdivisionRings,
    mapData,
    lastModified: new Date().toISOString()
  };
}

// =========================================================================
// Hook
// =========================================================================

function useSubHexNavigation({
  mapData: rootMapData,
  updateMapData: rootUpdateMapData
}: UseSubHexNavigationOptions): UseSubHexNavigationResult {

  // Navigation stack: each frame holds the parent's state when we drilled down
  const [navStack, setNavStack] = dc.useState<SubHexNavFrame[]>([]);
  // The currently active sub-hex mapData (null = at root level)
  const [subHexMapData, setSubHexMapData] = dc.useState<MapData | null>(null);
  // Counter to signal history resets
  const [navigationVersion, setNavigationVersion] = dc.useState(0);

  const isInSubHex = navStack.length > 0;
  const depth = navStack.length;
  const activeMapData = isInSubHex ? subHexMapData : rootMapData;

  // Build breadcrumb segments
  const breadcrumbs = dc.useMemo((): BreadcrumbSegment[] => {
    if (!isInSubHex) return [];

    const segments: BreadcrumbSegment[] = [
      { label: navStack[0]?.parentMapData?.name || 'World Map', depth: 0 }
    ];

    for (let i = 0; i < navStack.length; i++) {
      const key = navStack[i].hexKey;
      segments.push({ label: `Hex (${key})`, depth: i + 1 });
    }

    return segments;
  }, [navStack, isInSubHex]);

  // Enter a sub-hex at the given axial coordinate
  const enterSubHex = dc.useCallback((q: number, r: number): void => {
    const currentMapData = isInSubHex ? subHexMapData : rootMapData;
    if (!currentMapData) return;

    const hexKey = `${q},${r}`;

    // Look up or create sub-hex data
    let subHex = currentMapData.subHexMaps?.[hexKey];
    if (!subHex) {
      subHex = createSubHexMapData(currentMapData, q, r);
      // Write the new sub-hex into the current map's subHexMaps
      const updatedCurrent = {
        ...currentMapData,
        subHexMaps: {
          ...(currentMapData.subHexMaps || {}),
          [hexKey]: subHex
        }
      };

      if (isInSubHex) {
        setSubHexMapData(updatedCurrent);
        // Propagate to root for saving
        propagateToRoot(updatedCurrent, navStack);
      } else {
        rootUpdateMapData(updatedCurrent);
      }
    }

    // Push current state onto navigation stack
    const frame: SubHexNavFrame = {
      parentMapData: currentMapData,
      parentViewState: currentMapData.viewState || { zoom: 1.0, center: { x: 0, y: 0 } },
      hexKey
    };

    setNavStack(prev => [...prev, frame]);
    setSubHexMapData(subHex.mapData);
    setNavigationVersion(prev => prev + 1);
  }, [rootMapData, subHexMapData, isInSubHex, navStack]);

  // Propagate sub-hex changes up the navigation stack to root for saving
  const propagateToRoot = dc.useCallback((
    currentSubHexMapData: MapData,
    stack: SubHexNavFrame[]
  ): void => {
    if (stack.length === 0) return;

    // Walk the stack from top to bottom, nesting mapData at each level
    let nestedMapData = currentSubHexMapData;

    for (let i = stack.length - 1; i >= 0; i--) {
      const frame = stack[i];
      const parentWithUpdate = {
        ...frame.parentMapData,
        subHexMaps: {
          ...(frame.parentMapData.subHexMaps || {}),
          [frame.hexKey]: {
            ...(frame.parentMapData.subHexMaps?.[frame.hexKey] || {}),
            mapData: nestedMapData,
            lastModified: new Date().toISOString()
          }
        }
      };
      nestedMapData = parentWithUpdate;
    }

    // nestedMapData is now the fully-updated root
    rootUpdateMapData(nestedMapData);
  }, [rootUpdateMapData]);

  // Exit current sub-hex (go up one level)
  const exitSubHex = dc.useCallback((): void => {
    if (navStack.length === 0) return;

    const currentSubHex = subHexMapData;
    const topFrame = navStack[navStack.length - 1];

    // Merge current sub-hex data back into parent's subHexMaps
    const restoredParent = {
      ...topFrame.parentMapData,
      subHexMaps: {
        ...(topFrame.parentMapData.subHexMaps || {}),
        [topFrame.hexKey]: {
          ...(topFrame.parentMapData.subHexMaps?.[topFrame.hexKey] || {}),
          mapData: currentSubHex,
          lastModified: new Date().toISOString()
        }
      },
      // Restore the parent's viewState
      viewState: topFrame.parentViewState
    };

    const newStack = navStack.slice(0, -1);
    setNavStack(newStack);

    if (newStack.length === 0) {
      // Back at root
      setSubHexMapData(null);
      rootUpdateMapData(restoredParent);
    } else {
      // Still in a sub-hex, just one level up
      setSubHexMapData(restoredParent);
      propagateToRoot(restoredParent, newStack);
    }

    setNavigationVersion(prev => prev + 1);
  }, [navStack, subHexMapData, rootUpdateMapData, propagateToRoot]);

  // Navigate to a specific breadcrumb level (0 = root)
  const navigateToLevel = dc.useCallback((targetDepth: number): void => {
    if (targetDepth >= depth) return;

    // Pop levels from top down to target
    let currentData = subHexMapData;
    let stack = [...navStack];

    while (stack.length > targetDepth) {
      const frame = stack[stack.length - 1];
      const parent = {
        ...frame.parentMapData,
        subHexMaps: {
          ...(frame.parentMapData.subHexMaps || {}),
          [frame.hexKey]: {
            ...(frame.parentMapData.subHexMaps?.[frame.hexKey] || {}),
            mapData: currentData,
            lastModified: new Date().toISOString()
          }
        },
        viewState: frame.parentViewState
      };
      currentData = parent;
      stack = stack.slice(0, -1);
    }

    setNavStack(stack);

    if (stack.length === 0) {
      setSubHexMapData(null);
      rootUpdateMapData(currentData as MapData);
    } else {
      setSubHexMapData(currentData);
      propagateToRoot(currentData as MapData, stack);
    }

    setNavigationVersion(prev => prev + 1);
  }, [navStack, subHexMapData, depth, rootUpdateMapData, propagateToRoot]);

  // Wrapped updateMapData that routes writes to the correct level
  const activeUpdateMapData = dc.useCallback<MapDataUpdater>((updaterOrData) => {
    if (!isInSubHex) {
      // At root level, delegate directly
      rootUpdateMapData(updaterOrData);
      return;
    }

    // In sub-hex: apply update to sub-hex mapData, then propagate to root
    setSubHexMapData(prev => {
      if (!prev) return prev;
      const newData = typeof updaterOrData === 'function'
        ? updaterOrData(prev)
        : updaterOrData;
      if (!newData) return prev;

      // Propagate to root for saving (async, after state update)
      setTimeout(() => propagateToRoot(newData, navStack), 0);

      return newData;
    });
  }, [isInSubHex, rootUpdateMapData, navStack, propagateToRoot]);

  return {
    activeMapData,
    activeUpdateMapData,
    isInSubHex,
    depth,
    breadcrumbs,
    enterSubHex,
    exitSubHex,
    navigateToLevel,
    navigationVersion
  };
}

return { useSubHexNavigation, createSubHexMapData };

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

interface AdjacentSubHex {
  hexKey: string;
  /** Delta from current hex in axial coords */
  dq: number;
  dr: number;
  mapData: MapData;
  name: string;
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
  navigateToSibling: (q: number, r: number) => void;
  navigationVersion: number;
  currentHexKey: string | null;
  adjacentSubHexes: AdjacentSubHex[];
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

  // Build breadcrumb segments using actual map names
  const breadcrumbs = dc.useMemo((): BreadcrumbSegment[] => {
    if (!isInSubHex) return [];

    const segments: BreadcrumbSegment[] = [
      { label: navStack[0]?.parentMapData?.name || 'World Map', depth: 0 }
    ];

    for (let i = 0; i < navStack.length; i++) {
      const key = navStack[i].hexKey;
      const isLast = i === navStack.length - 1;

      if (isLast) {
        // Current level — use the live activeMapData name
        segments.push({ label: subHexMapData?.name || `Hex (${key})`, depth: i + 1 });
      } else {
        // Intermediate level — look up name from the next frame's parent
        const nextFrame = navStack[i + 1];
        const subHexName = nextFrame?.parentMapData?.name;
        segments.push({ label: subHexName || `Hex (${key})`, depth: i + 1 });
      }
    }

    return segments;
  }, [navStack, isInSubHex, subHexMapData?.name]);

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

  // Navigate to a sibling sub-hex (atomic exit + enter)
  const navigateToSibling = dc.useCallback((q: number, r: number): void => {
    if (navStack.length === 0) return;

    const currentSubHex = subHexMapData;
    const topFrame = navStack[navStack.length - 1];
    const siblingKey = `${q},${r}`;

    // Merge current sub-hex back into parent
    const restoredParent: MapData = {
      ...topFrame.parentMapData,
      subHexMaps: {
        ...(topFrame.parentMapData.subHexMaps || {}),
        [topFrame.hexKey]: {
          ...(topFrame.parentMapData.subHexMaps?.[topFrame.hexKey] || {}),
          mapData: currentSubHex,
          lastModified: new Date().toISOString()
        }
      }
    };

    // Look up or create sibling sub-hex
    let siblingSubHex = restoredParent.subHexMaps?.[siblingKey];
    if (!siblingSubHex) {
      siblingSubHex = createSubHexMapData(restoredParent, q, r);
      restoredParent.subHexMaps = {
        ...(restoredParent.subHexMaps || {}),
        [siblingKey]: siblingSubHex
      };
    }

    // Replace the top frame with the sibling's frame
    const newFrame: SubHexNavFrame = {
      parentMapData: restoredParent,
      parentViewState: topFrame.parentViewState,
      hexKey: siblingKey
    };

    const newStack = [...navStack.slice(0, -1), newFrame];
    setNavStack(newStack);
    setSubHexMapData(siblingSubHex.mapData);
    setNavigationVersion(prev => prev + 1);

    // Propagate to root
    setTimeout(() => propagateToRoot(siblingSubHex!.mapData, newStack), 0);
  }, [navStack, subHexMapData, propagateToRoot]);

  // Current hex key (for adjacent sub-hex lookup)
  const currentHexKey = isInSubHex ? navStack[navStack.length - 1].hexKey : null;

  // Compute adjacent sub-hexes (siblings with content)
  const adjacentSubHexes = dc.useMemo((): AdjacentSubHex[] => {
    if (!isInSubHex || navStack.length === 0) return [];

    const topFrame = navStack[navStack.length - 1];
    const parentSubHexMaps = topFrame.parentMapData.subHexMaps;
    if (!parentSubHexMaps) return [];

    const [cqStr, crStr] = topFrame.hexKey.split(',');
    const cq = parseInt(cqStr, 10);
    const cr = parseInt(crStr, 10);

    // 6 axial hex neighbor directions
    const dirs = [
      [1, 0], [1, -1], [0, -1],
      [-1, 0], [-1, 1], [0, 1]
    ];

    const adjacent: AdjacentSubHex[] = [];
    for (const [dq, dr] of dirs) {
      const nq = cq + dq;
      const nr = cr + dr;
      const key = `${nq},${nr}`;
      const subHex = parentSubHexMaps[key];
      if (subHex?.mapData) {
        // Only include if it has visible content
        const sd = subHex.mapData;
        const hasContent = sd.layers?.some((l: MapLayer) =>
          (l.cells && l.cells.length > 0) ||
          (l.curves && l.curves.length > 0) ||
          (l.objects && l.objects.length > 0) ||
          (l.textLabels && l.textLabels.length > 0) ||
          (l.tiles && l.tiles.length > 0)
        );
        if (hasContent) {
          adjacent.push({
            hexKey: key,
            dq,
            dr,
            mapData: subHex.mapData,
            name: subHex.mapData.name || `Hex (${nq}, ${nr})`
          });
        }
      }
    }
    return adjacent;
  }, [isInSubHex, navStack]);

  return {
    activeMapData,
    activeUpdateMapData,
    isInSubHex,
    depth,
    breadcrumbs,
    enterSubHex,
    exitSubHex,
    navigateToLevel,
    navigateToSibling,
    navigationVersion,
    currentHexKey,
    adjacentSubHexes
  };
}

return { useSubHexNavigation, createSubHexMapData };

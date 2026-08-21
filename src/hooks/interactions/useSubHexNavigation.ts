/**
 * useSubHexNavigation.ts
 *
 * Manages sub-hex drill-down navigation via a stack-based approach.
 * Swaps the active mapData between parent and sub-hex levels,
 * allowing the entire DungeonMapTracker UI to be reused.
 */

import type { MapData, MapLayer, SubHexMapData, StoredViewState } from '#types/core/map.types';
import type { MapDataUpdater, MapDataUpdateOptions } from '#types/hooks/mapData.types';
import type { MapDistanceOverrides, ResolvedDistanceSettings, SubHexDistanceLevel } from '../../drawing/distanceOperations';
import type { SubHexExitDetail } from '../../core/windroseEvents';

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { DEFAULTS, SCHEMA_VERSION } from '../../core/dmtConstants';
import { isFeatureEnabled } from '../../core/featureFlags';
import { getSettings } from '../../core/settingsAccessor';
import { generateLayerId } from '../../persistence/layerAccessor';
import { clearSubHexBackdrop, pruneSubHexBackdrops, relabelSubHexBackdrop } from '../../core/subHexBackdropStore';
import { calculateFitZoom, subHexAnchorToChildCenter, subHexChildPointToParentOffset, subHexContinuityZoom } from '../../geometry/core/hexMeasurements';
import { createGeometry } from '../../geometry/core/createGeometry';
import { traceZoom } from '../../utils/zoomTraceProbe';
import { resolveSubHexDistanceSettings } from '../../drawing/distanceOperations';

// =========================================================================
// Types
// =========================================================================

interface SubHexNavFrame {
  parentMapData: MapData;
  parentStoredViewState: StoredViewState;
  hexKey: string;
}

interface BreadcrumbSegment {
  label: string;
  depth: number;
}

/**
 * In-flight sub-hex drill. Segments are '/'-split "q,r" hexKeys; `index` is how
 * many have been entered so far (the drill advances one per render). `onArrive`
 * fires once, on completion or on the first unresolvable segment.
 */
interface PendingDrill {
  segments: string[];
  index: number;
  onArrive?: () => void;
}

interface UseSubHexNavigationOptions {
  mapData: MapData | null;
  updateMapData: MapDataUpdater;
  /**
   * Optional sub-hex path to auto-drill into once the root map loads —
   * hexKey segments separated by '/', e.g. "0,0" or "0,0/2,-1". Only
   * EXISTING sub-maps are entered (drilling stops at a missing segment);
   * applied once, so the user can freely navigate away afterwards.
   */
  initialSubHexPath?: string | null;
  /**
   * Live map canvas accessor (stable identity). The backdrop store is keyed
   * per-canvas, so exits clear and sibling navigation re-labels THIS view's
   * snapshot only. Null/absent degrades to no backdrop bookkeeping.
   */
  getCanvas?: () => HTMLCanvasElement | null;
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
  enterSubHex: (q: number, r: number, viewOverride?: StoredViewState) => void;
  /**
   * Exit to the parent level. A seamless zoom-out surface passes the child
   * view at the moment it fired so the parent reopens visually continuous
   * (sub-map footprint → hex footprint); plain exits restore the dive-time
   * parent view.
   */
  exitSubHex: (seamlessExit?: SubHexExitDetail | null) => void;
  /**
   * Drill into an absolute sub-hex path ('/'-joined "q,r" hexKeys) from root,
   * tolerating missing segments. `onArrive` fires once the target (or nearest
   * resolvable level) is reached. Used by deep-link navigation.
   */
  drillToSubHexPath: (path: string | null, onArrive?: () => void) => void;
  navigateToLevel: (depth: number) => void;
  navigateToSibling: (q: number, r: number) => void;
  navigationVersion: number;
  currentHexKey: string | null;
  adjacentSubHexes: AdjacentSubHex[];
  /**
   * Fully-resolved distance settings for the active sub-hex, derived live
   * from the parent chain (each level divides by its sub-grid's cells-across
   * unless it carries an explicit per-map override). Null at root level.
   */
  activeDistanceOverrides: ResolvedDistanceSettings | null;
  /** Current drill-down path as '/'-joined hexKeys ("0,0/2,-1"); null at root. */
  subHexPath: string | null;
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
    hexSize: parentMapData.hexSize ?? DEFAULTS.hexSize,
    orientation: parentMapData.orientation ?? DEFAULTS.hexOrientation,
    hexBounds: {
      maxCol: subdivisionRings * 2 + 1,
      maxRow: subdivisionRings * 2 + 1,
      maxRing: subdivisionRings
    },
    viewState: {
      zoom: calculateFitZoom(
        parentMapData.hexSize ?? DEFAULTS.hexSize,
        parentMapData.orientation ?? DEFAULTS.hexOrientation,
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
  updateMapData: rootUpdateMapData,
  initialSubHexPath,
  getCanvas
}: UseSubHexNavigationOptions): UseSubHexNavigationResult {

  // Navigation stack: each frame holds the parent's state when we drilled down
  const [navStack, setNavStack] = useState<SubHexNavFrame[]>([]);
  // Mirror for deferred propagation: setTimeout callbacks must read the stack
  // as of when they fire, not the (possibly stale) closure they were scheduled with
  const navStackRef = useRef<SubHexNavFrame[]>(navStack);
  navStackRef.current = navStack;
  // The currently active sub-hex mapData (null = at root level)
  const [subHexMapData, setSubHexMapData] = useState<MapData | null>(null);
  // Counter to signal history resets
  const [navigationVersion, setNavigationVersion] = useState(0);
  // Active sub-hex drill (embed auto-drill or deep-link navigation); null = idle
  const [pendingDrill, setPendingDrill] = useState<PendingDrill | null>(null);

  const isInSubHex = navStack.length > 0;
  const depth = navStack.length;
  const activeMapData = isInSubHex ? subHexMapData : rootMapData;

  // If the map unmounts while still nested (leaf closed, mode switch), no exit
  // path runs — release the backdrop snapshot eagerly (the WeakMap would also
  // free it with the canvas, but the bitmap is large; don't wait for GC).
  useEffect(() => () => clearSubHexBackdrop(getCanvas?.() ?? null), [getCanvas]);

  // Build breadcrumb segments using actual map names
  const breadcrumbs = useMemo((): BreadcrumbSegment[] => {
    if (!isInSubHex) return [];

    const segments: BreadcrumbSegment[] = [
      { label: navStack[0]?.parentMapData?.name ?? 'World Map', depth: 0 }
    ];

    for (let i = 0; i < navStack.length; i++) {
      const key = navStack[i].hexKey;
      const isLast = i === navStack.length - 1;

      if (isLast) {
        // Current level — use the live activeMapData name
        segments.push({ label: subHexMapData?.name ?? `Hex (${key})`, depth: i + 1 });
      } else {
        // Intermediate level — look up name from the next frame's parent
        const nextFrame = navStack[i + 1];
        const subHexName = nextFrame?.parentMapData?.name;
        segments.push({ label: subHexName ?? `Hex (${key})`, depth: i + 1 });
      }
    }

    return segments;
  }, [navStack, isInSubHex, subHexMapData?.name]);

  // Enter a sub-hex at the given axial coordinate. `viewOverride` opens the
  // sub-map at that view instead of its stored one (seamless zoom dives pass
  // the live-canvas fit so the sub-map fills the screen).
  const enterSubHex = useCallback((q: number, r: number, viewOverride?: StoredViewState): void => {
    const currentMapData = isInSubHex ? subHexMapData : rootMapData;
    if (!currentMapData) return;

    const hexKey = `${q},${r}`;

    // Look up or create sub-hex data
    let subHex = currentMapData.subHexMaps?.[hexKey];
    if (!subHex) {
      // Feature gate: entering EXISTING sub-maps always works; creating new
      // ones requires the subMaps feature.
      if (!isFeatureEnabled('subMaps')) return;
      subHex = createSubHexMapData(currentMapData, q, r);
      // Write the new sub-hex into the current map's subHexMaps
      const updatedCurrent = {
        ...currentMapData,
        subHexMaps: {
          ...(currentMapData.subHexMaps ?? {}),
          [hexKey]: subHex
        }
      } as MapData;

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
      parentStoredViewState: currentMapData.viewState ?? { zoom: 1.0, center: { x: 0, y: 0 } },
      hexKey
    };

    const newStack = [...navStack, frame];
    navStackRef.current = newStack;
    setNavStack(newStack);
    traceZoom('enterSubHex', viewOverride != null
      ? { hexKey, overrideZoom: viewOverride.zoom }
      : { hexKey, storedZoom: subHex.mapData.viewState?.zoom ?? null });
    setSubHexMapData(viewOverride != null
      ? { ...subHex.mapData, viewState: { zoom: viewOverride.zoom, center: { ...viewOverride.center } } }
      : subHex.mapData);
    setNavigationVersion(prev => prev + 1);
  }, [rootMapData, subHexMapData, isInSubHex, navStack]);

  // Propagate sub-hex changes up the navigation stack to root for saving.
  // `options` rides through to the root updater so cosmetic-only changes
  // (pan/zoom inside a sub-hex) keep their cosmetic flag at the save layer.
  const propagateToRoot = useCallback((
    currentSubHexMapData: MapData,
    stack: SubHexNavFrame[],
    options?: MapDataUpdateOptions
  ): void => {
    if (stack.length === 0) return;

    // Walk the stack from top to bottom, nesting mapData at each level
    let nestedMapData = currentSubHexMapData;

    for (let i = stack.length - 1; i >= 0; i--) {
      const frame = stack[i];
      const parentWithUpdate = {
        ...frame.parentMapData,
        subHexMaps: {
          ...(frame.parentMapData.subHexMaps ?? {}),
          [frame.hexKey]: {
            ...(frame.parentMapData.subHexMaps?.[frame.hexKey] ?? {}),
            mapData: nestedMapData,
            lastModified: new Date().toISOString()
          }
        }
      } as MapData;
      nestedMapData = parentWithUpdate;
    }

    // nestedMapData is now the fully-updated root
    rootUpdateMapData(nestedMapData, options);
  }, [rootUpdateMapData]);

  // Exit current sub-hex (go up one level)
  const exitSubHex = useCallback((seamlessExit?: SubHexExitDetail | null): void => {
    if (navStack.length === 0) return;

    // Discard only the LEAVING level's snapshot: ancestor levels keep theirs,
    // so surfacing from a nested dive re-exposes the outer backdrop instead
    // of leaving the intermediate level in a void.
    clearSubHexBackdrop(getCanvas?.() ?? null, navStack.map(f => f.hexKey).join('/'));

    const currentSubHex = subHexMapData;
    const topFrame = navStack[navStack.length - 1];

    // Plain exits (Escape, breadcrumbs) restore the dive-time parent view.
    // Seamless surfaces instead compute the visually-continuous parent view:
    // zoom where the hex footprint matches the sub-map's current screen size,
    // centered so the anchor point stays at the same screen position.
    let restoredViewState = topFrame.parentStoredViewState;
    if (seamlessExit != null && currentSubHex != null) {
      const parentMap = topFrame.parentMapData;
      const rings = parentMap.subHexMaps?.[topFrame.hexKey]?.subdivisionRings
        ?? currentSubHex.hexBounds?.maxRing ?? 7;
      const parentHexSize = parentMap.hexSize ?? DEFAULTS.hexSize;
      const childHexSize = currentSubHex.hexSize ?? parentHexSize;

      const continuityRatio = subHexContinuityZoom(1, parentHexSize, childHexSize, rings);
      const parentZoom = Math.max(
        DEFAULTS.minZoom,
        Math.min(DEFAULTS.maxZoom, seamlessExit.childZoom / continuityRatio)
      );

      const [qStr, rStr] = topFrame.hexKey.split(',');
      const hexCenter = createGeometry(parentMap).gridToWorld(parseInt(qStr, 10), parseInt(rStr, 10));
      const anchorOffset = subHexChildPointToParentOffset(
        seamlessExit.childAnchor.x,
        seamlessExit.childAnchor.y,
        parentHexSize,
        childHexSize,
        rings
      );
      // center = anchor − screenOffset/zoom, with the screen offset rotated
      // into the parent's world axes when the parent map is rotated.
      const angleRad = (-(parentMap.northDirection ?? 0) * Math.PI) / 180;
      const { dx, dy } = seamlessExit.anchorOffset;
      const rotDx = dx * Math.cos(angleRad) - dy * Math.sin(angleRad);
      const rotDy = dx * Math.sin(angleRad) + dy * Math.cos(angleRad);
      restoredViewState = {
        zoom: parentZoom,
        center: {
          x: hexCenter.worldX + anchorOffset.x - rotDx / parentZoom,
          y: hexCenter.worldY + anchorOffset.y - rotDy / parentZoom
        }
      };
    }

    // Merge current sub-hex data back into parent's subHexMaps
    const restoredParent = {
      ...topFrame.parentMapData,
      subHexMaps: {
        ...(topFrame.parentMapData.subHexMaps ?? {}),
        [topFrame.hexKey]: {
          ...(topFrame.parentMapData.subHexMaps?.[topFrame.hexKey] ?? {}),
          mapData: currentSubHex,
          lastModified: new Date().toISOString()
        }
      },
      // Restore the parent's viewState
      viewState: restoredViewState
    } as MapData;

    const newStack = navStack.slice(0, -1);
    navStackRef.current = newStack;
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
  }, [navStack, subHexMapData, rootUpdateMapData, propagateToRoot, getCanvas]);

  // Navigate to a specific breadcrumb level (0 = root)
  const navigateToLevel = useCallback((targetDepth: number): void => {
    if (targetDepth >= depth) return;

    // Drop the snapshots of every level being left; levels still on the
    // remaining drill path keep theirs.
    pruneSubHexBackdrops(
      getCanvas?.() ?? null,
      targetDepth === 0 ? null : navStack.slice(0, targetDepth).map(f => f.hexKey).join('/')
    );

    // Pop levels from top down to target
    let currentData = subHexMapData;
    let stack = [...navStack];

    while (stack.length > targetDepth) {
      const frame = stack[stack.length - 1];
      const parent = {
        ...frame.parentMapData,
        subHexMaps: {
          ...(frame.parentMapData.subHexMaps ?? {}),
          [frame.hexKey]: {
            ...(frame.parentMapData.subHexMaps?.[frame.hexKey] ?? {}),
            mapData: currentData,
            lastModified: new Date().toISOString()
          }
        },
        viewState: frame.parentStoredViewState
      } as MapData;
      currentData = parent;
      stack = stack.slice(0, -1);
    }

    navStackRef.current = stack;
    setNavStack(stack);

    if (stack.length === 0) {
      setSubHexMapData(null);
      rootUpdateMapData(currentData as MapData);
    } else {
      setSubHexMapData(currentData);
      propagateToRoot(currentData as MapData, stack);
    }

    setNavigationVersion(prev => prev + 1);
  }, [navStack, subHexMapData, depth, rootUpdateMapData, propagateToRoot, getCanvas]);

  // Wrapped updateMapData that routes writes to the correct level
  const activeUpdateMapData = useCallback<MapDataUpdater>((updaterOrData, options) => {
    if (!isInSubHex) {
      // At root level, delegate directly
      rootUpdateMapData(updaterOrData, options);
      return;
    }

    // In sub-hex: apply update to sub-hex mapData, then propagate to root
    setSubHexMapData(prev => {
      if (!prev) return prev;
      const newData = typeof updaterOrData === 'function'
        ? updaterOrData(prev)
        : updaterOrData;
      if (newData == null) return prev;

      // Propagate to root for saving (async, after state update). Guarded by
      // the drill path as of scheduling: `newData` belongs to THIS level, and
      // propagateToRoot writes it under the top frame's hexKey — if navigation
      // moves the stack before the timeout fires, that write would nest one
      // level's map inside a different level's slot (a map can end up its own
      // child). A skipped propagate loses nothing: every navigation path
      // merges the live subHexMapData into the parent itself.
      const scheduledPath = navStackRef.current.map(f => f.hexKey).join('/');
      window.setTimeout(() => {
        const currentPath = navStackRef.current.map(f => f.hexKey).join('/');
        if (currentPath !== scheduledPath) {
          traceZoom('propagateSkipped', { scheduledPath, currentPath });
          return;
        }
        propagateToRoot(newData, navStackRef.current, options);
      }, 0);

      return newData;
    });
  }, [isInSubHex, rootUpdateMapData, propagateToRoot]);

  // Navigate to a sibling sub-hex (atomic exit + enter)
  const navigateToSibling = useCallback((q: number, r: number): void => {
    if (navStack.length === 0) return;

    const currentSubHex = subHexMapData;
    const topFrame = navStack[navStack.length - 1];
    const siblingKey = `${q},${r}`;

    // Merge current sub-hex back into parent
    const restoredParent = {
      ...topFrame.parentMapData,
      subHexMaps: {
        ...(topFrame.parentMapData.subHexMaps ?? {}),
        [topFrame.hexKey]: {
          ...(topFrame.parentMapData.subHexMaps?.[topFrame.hexKey] ?? {}),
          mapData: currentSubHex,
          lastModified: new Date().toISOString()
        }
      }
    } as MapData;

    // Look up or create sibling sub-hex
    let siblingSubHex = restoredParent.subHexMaps?.[siblingKey];
    if (!siblingSubHex) {
      siblingSubHex = createSubHexMapData(restoredParent, q, r);
      restoredParent.subHexMaps = {
        ...(restoredParent.subHexMaps ?? {}),
        [siblingKey]: siblingSubHex
      };
    }

    const parentMap = topFrame.parentMapData;
    const parentHexSize = parentMap.hexSize ?? DEFAULTS.hexSize;
    const parentGeometry = createGeometry(parentMap);
    const siblingCenter = parentGeometry.gridToWorld(q, r);

    // View continuity: adjacent siblings tile the SAME parent world, one hex
    // apart, so the arrival view must be the departing view translated through
    // parent space — never the sibling's own stored view, which has no
    // geometric relation to where the user is looking (the "moves over, then
    // jumps" bug: the backdrop relabel slides to the correct adjacent hex
    // while the foreground snapped to an arbitrary saved view). Map the
    // departing view center child→parent→child and convert zoom through the
    // two continuity ratios; with matching hex size and rings (the normal
    // case) this is a pure translation at unchanged zoom.
    const [cqStr, crStr] = topFrame.hexKey.split(',');
    const currentCenter = parentGeometry.gridToWorld(parseInt(cqStr, 10), parseInt(crStr, 10));
    const departingView = currentSubHex?.viewState;
    let siblingMapData = siblingSubHex.mapData;
    if (departingView != null) {
      const currentRings = parentMap.subHexMaps?.[topFrame.hexKey]?.subdivisionRings ?? 7;
      const currentHexSize = currentSubHex?.hexSize ?? parentHexSize;
      const siblingRings = siblingSubHex.subdivisionRings ?? 7;
      const siblingHexSize = siblingMapData.hexSize ?? parentHexSize;

      const parentOffset = subHexChildPointToParentOffset(
        departingView.center.x,
        departingView.center.y,
        parentHexSize,
        currentHexSize,
        currentRings
      );
      const arrivalCenter = subHexAnchorToChildCenter(
        currentCenter.worldX + parentOffset.x - siblingCenter.worldX,
        currentCenter.worldY + parentOffset.y - siblingCenter.worldY,
        parentHexSize,
        siblingHexSize,
        siblingRings
      );
      const departRatio = subHexContinuityZoom(1, parentHexSize, currentHexSize, currentRings);
      const arriveRatio = subHexContinuityZoom(1, parentHexSize, siblingHexSize, siblingRings);
      const arrivalZoom = Math.max(
        DEFAULTS.minZoom,
        Math.min(DEFAULTS.maxZoom, departingView.zoom * (arriveRatio / departRatio))
      );
      traceZoom('siblingNav', {
        from: topFrame.hexKey, to: siblingKey,
        zoom: departingView.zoom, arrivalZoom, cx: arrivalCenter.x, cy: arrivalCenter.y
      });
      siblingMapData = {
        ...siblingMapData,
        viewState: { zoom: arrivalZoom, center: arrivalCenter }
      };
    }

    // The backdrop snapshot depicts the PARENT map's world — identical for
    // adjacent siblings, only the anchor hex changes. Re-label it to the
    // sibling's path instead of dropping it (dropping was the "background
    // vanishes on adjacent navigation" bug: capture only ever ran on dives,
    // so a cleared snapshot never came back). Recapturing here would be
    // wrong too: the live canvas shows the DEPARTING sibling's interior,
    // not the parent imagery.
    const newPath = [...navStack.slice(0, -1).map(f => f.hexKey), siblingKey].join('/');
    const canvas = getCanvas?.() ?? null;
    if (canvas != null) {
      relabelSubHexBackdrop({
        canvas,
        oldSubHexPath: navStack.map(f => f.hexKey).join('/'),
        newSubHexPath: newPath,
        hexCenterWorld: { x: siblingCenter.worldX, y: siblingCenter.worldY },
        childHexSize: siblingSubHex.mapData.hexSize ?? parentHexSize,
        rings: siblingSubHex.subdivisionRings ?? 7
      });
    }

    // Replace the top frame with the sibling's frame
    const newFrame: SubHexNavFrame = {
      parentMapData: restoredParent,
      parentStoredViewState: topFrame.parentStoredViewState,
      hexKey: siblingKey
    };

    const newStack = [...navStack.slice(0, -1), newFrame];
    navStackRef.current = newStack;
    setNavStack(newStack);
    setSubHexMapData(siblingMapData);
    setNavigationVersion(prev => prev + 1);

    // Propagate to root, guarded by the drill path as of scheduling (see
    // activeUpdateMapData) — a propagate firing after further navigation
    // would write this level's map into the wrong slot.
    window.setTimeout(() => {
      const currentPath = navStackRef.current.map(f => f.hexKey).join('/');
      if (currentPath !== newPath) {
        traceZoom('propagateSkipped', { scheduledPath: newPath, currentPath });
        return;
      }
      propagateToRoot(siblingMapData, navStackRef.current);
    }, 0);
  }, [navStack, subHexMapData, propagateToRoot, getCanvas]);

  // Current hex key (for adjacent sub-hex lookup)
  const currentHexKey = isInSubHex ? navStack[navStack.length - 1].hexKey : null;

  // Compute adjacent sub-hexes (siblings with content)
  const adjacentSubHexes = useMemo((): AdjacentSubHex[] => {
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
      if (subHex?.mapData != null) {
        // Only include if it has visible content
        const sd = subHex.mapData;
        const hasContent = sd.layers?.some((l: MapLayer) =>
          l.cells.length > 0 ||
          l.curves.length > 0 ||
          l.objects.length > 0 ||
          l.textLabels.length > 0 ||
          (l.tiles != null && l.tiles.length > 0)
        ) === true;
        if (hasContent) {
          adjacent.push({
            hexKey: key,
            dq,
            dr,
            mapData: subHex.mapData,
            name: subHex.mapData.name ?? `Hex (${nq}, ${nr})`
          });
        }
      }
    }
    return adjacent;
  }, [isInSubHex, navStack]);

  // Advance the active sub-hex drill one level per render. enterSubHex reads
  // state, so each level must commit before the next segment is read; the
  // effect re-fires as navStack catches up. Missing/malformed segments stop
  // the drill at the nearest resolvable level (drilling never creates
  // sub-maps). `onArrive` fires exactly once, on completion or on stop.
  useEffect(() => {
    if (pendingDrill == null) return;
    const { segments, index, onArrive } = pendingDrill;

    // Wait until the stack reflects the segments applied so far.
    if (navStack.length !== index) return;

    if (index >= segments.length) {
      setPendingDrill(null);
      onArrive?.();
      return;
    }

    const current = index === 0 ? rootMapData : subHexMapData;
    const [qStr, rStr] = segments[index].split(',');
    const q = parseInt(qStr, 10);
    const r = parseInt(rStr, 10);
    if (current == null || Number.isNaN(q) || Number.isNaN(r) || current.subHexMaps?.[`${q},${r}`] == null) {
      setPendingDrill(null);
      onArrive?.();
      return;
    }

    setPendingDrill({ segments, index: index + 1, onArrive });
    enterSubHex(q, r);
  }, [pendingDrill, navStack.length, rootMapData, subHexMapData, enterSubHex]);

  // Seed the auto-drill from an embed block's `subhex:` key, once per load.
  // Runs from root (mount stack is empty), so this never fights the user's
  // own navigation afterwards.
  const initialSeededRef = useRef(false);
  useEffect(() => {
    if (initialSeededRef.current) return;
    if (initialSubHexPath == null || initialSubHexPath === '') return;
    if (rootMapData == null) return; // wait for the root map to load
    initialSeededRef.current = true;
    const segments = initialSubHexPath.split('/').map(s => s.trim()).filter(s => s !== '');
    if (segments.length > 0) setPendingDrill({ segments, index: 0 });
  }, [initialSubHexPath, rootMapData]);

  // Drill into an absolute sub-hex path from root (deep-link navigation).
  // Resets to root first so the absolute path drills from a known base;
  // `onArrive` fires once the target (or nearest resolvable level) is reached.
  const drillToSubHexPath = useCallback((path: string | null, onArrive?: () => void): void => {
    const segments = (path ?? '').split('/').map(s => s.trim()).filter(s => s !== '');
    if (navStack.length > 0) navigateToLevel(0);
    if (segments.length === 0) {
      setPendingDrill(null);
      onArrive?.();
      return;
    }
    setPendingDrill({ segments, index: 0, onArrive });
  }, [navStack.length, navigateToLevel]);

  // Current drill-down path, for "copy embed block" to reference this sub-hex
  const subHexPath = navStack.length > 0 ? navStack.map(f => f.hexKey).join('/') : null;

  // Live-derived distance settings for the active sub-hex: one parent hex
  // spans the sub-map, so each nesting level divides distance-per-cell by
  // the sub-grid's cells-across unless that level has an explicit override.
  const activeDistanceOverrides = useMemo((): ResolvedDistanceSettings | null => {
    if (navStack.length === 0) return null;

    const mapOverrides = (map: MapData | null): MapDistanceOverrides | null =>
      (map?.settings?.distanceSettings as MapDistanceOverrides | undefined) ?? null;

    const levels: SubHexDistanceLevel[] = [
      { overrides: mapOverrides(navStack[0].parentMapData), cellsAcross: null }
    ];
    for (let i = 0; i < navStack.length; i++) {
      const frame = navStack[i];
      const rings = frame.parentMapData.subHexMaps?.[frame.hexKey]?.subdivisionRings ?? 7;
      const childMap = i + 1 < navStack.length ? navStack[i + 1].parentMapData : subHexMapData;
      levels.push({
        overrides: mapOverrides(childMap),
        cellsAcross: rings * 2 + 1
      });
    }

    return resolveSubHexDistanceSettings('hex', getSettings(), levels);
  }, [navStack, subHexMapData]);

  return {
    activeMapData,
    activeUpdateMapData,
    isInSubHex,
    depth,
    breadcrumbs,
    enterSubHex,
    exitSubHex,
    drillToSubHexPath,
    navigateToLevel,
    navigateToSibling,
    navigationVersion,
    currentHexKey,
    adjacentSubHexes,
    activeDistanceOverrides,
    subHexPath
  };
}

export { useSubHexNavigation, createSubHexMapData };
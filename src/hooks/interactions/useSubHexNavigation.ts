/**
 * useSubHexNavigation.ts
 *
 * Manages sub-hex drill-down navigation. State is the hexKey path from the
 * root; the active level's mapData is derived from the live root and written
 * back through setAtSubHexPath (persistence/subHexPath.ts), so the entire
 * DungeonMapTracker UI is reused at every level.
 */

import type { MapData, MapLayer, SubHexMapData, StoredViewState } from '#types/core/map.types';
import type { MapDataUpdater } from '#types/hooks/mapData.types';
import type { SubHexPath } from '../../persistence/subHexPath';
import type { MapDistanceOverrides, ResolvedDistanceSettings, SubHexDistanceLevel } from '../../drawing/distanceOperations';
import type { SubHexExitDetail } from '../../core/windroseEvents';

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { DEFAULTS } from '../../core/dmtConstants';
import { isFeatureEnabled } from '../../core/featureFlags';
import { getSettings } from '../../core/settingsAccessor';
import { buildMapEntry } from '../../persistence/fileOperations';
import {
  addSubHexEntryAtPath,
  formatSubHexPath,
  getMapAtSubHexPath,
  getSubHexEntryAtPath,
  parseSubHexPath,
  resolvableSubHexDepth,
  setAtSubHexPath,
  toRootUpdater
} from '../../persistence/subHexPath';
import { clearSubHexBackdrop, pruneSubHexBackdrops, relabelSubHexBackdrop } from '../../core/subHexBackdropStore';
import { calculateFitZoom, subHexAnchorToChildCenter, subHexChildPointToParentOffset, subHexContinuityZoom } from '../../geometry/core/hexMeasurements';
import { createGeometry } from '../../geometry/core/createGeometry';
import { traceZoom } from '../../utils/zoomTraceProbe';
import { resolveSubHexDistanceSettings } from '../../drawing/distanceOperations';

// =========================================================================
// Types
// =========================================================================

/**
 * One entered level. Holds NO map data: the maps are always read from the
 * live root by path, so nothing here can go stale.
 */
interface SubHexNavFrame {
  /** hexKey entered at this level, in its parent's subHexMaps. */
  hexKey: string;
  /** The parent's view at dive time; plain exits restore it. */
  parentStoredViewState: StoredViewState;
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

/**
 * Adjacent slot with no navigable sibling: the sub-map is missing, or exists
 * but is empty. Surfaced as a "+" create/enter affordance in sub-hex view.
 */
interface AdjacentEmptySlot {
  hexKey: string;
  /** Delta from current hex in axial coords */
  dq: number;
  dr: number;
  /** True when the sibling sub-map exists but has no content yet. */
  exists: boolean;
}

/**
 * Pure slot computation for the "+" affordances: the 6 axial neighbors of
 * `currentHexKey` that (a) aren't already navigable siblings, and (b) fall
 * within the PARENT map's own bounds — a slot outside the parent grid could
 * never legally hold a sibling (see the bounds fences in enterSubHex /
 * navigateToSibling). Exported for unit tests.
 */
function computeAdjacentEmptySlots(
  parentMapData: MapData,
  currentHexKey: string,
  navigableKeys: ReadonlySet<string>
): AdjacentEmptySlot[] {
  const [cqStr, crStr] = currentHexKey.split(',');
  const cq = parseInt(cqStr, 10);
  const cr = parseInt(crStr, 10);
  const parentGeometry = createGeometry(parentMapData);

  const dirs = [
    [1, 0], [1, -1], [0, -1],
    [-1, 0], [-1, 1], [0, 1]
  ];
  const slots: AdjacentEmptySlot[] = [];
  for (const [dq, dr] of dirs) {
    const nq = cq + dq;
    const nr = cr + dr;
    const key = `${nq},${nr}`;
    if (navigableKeys.has(key)) continue;
    if (!parentGeometry.isWithinBounds(nq, nr)) continue;
    slots.push({
      hexKey: key,
      dq,
      dr,
      exists: parentMapData.subHexMaps?.[key]?.mapData != null
    });
  }
  return slots;
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
  navigateToSibling: (q: number, r: number, opts?: { createIfMissing?: boolean }) => void;
  navigationVersion: number;
  currentHexKey: string | null;
  adjacentSubHexes: AdjacentSubHex[];
  /** In-bounds neighbor slots with no navigable sibling ("+" affordances). */
  adjacentEmptySlots: AdjacentEmptySlot[];
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

/**
 * A fresh sub-hex map for hex (q, r) of `parentMapData`. Built through the same
 * constructor as every other new map (createNewMap via buildMapEntry), so it
 * carries the boards registry, activeBoardId and layer boardId; only the
 * sub-hex specifics are overridden: name, the parent's hex size/orientation,
 * the ring-bounded extent and the fit-to-rings view centred on the origin.
 */
function createSubHexMapData(parentMapData: MapData, q: number, r: number): SubHexMapData {
  const subdivisionRings = 7;
  const hexSize = parentMapData.hexSize ?? DEFAULTS.hexSize;
  const orientation = parentMapData.orientation ?? DEFAULTS.hexOrientation;
  const hexBounds = {
    maxCol: subdivisionRings * 2 + 1,
    maxRow: subdivisionRings * 2 + 1,
    maxRing: subdivisionRings
  };

  const mapData = buildMapEntry(`Hex (${q}, ${r})`, 'hex', {
    hexSize,
    orientation,
    hexBounds,
    dimensions: { ...DEFAULTS.dimensions },
    viewState: {
      zoom: calculateFitZoom(
        hexSize, orientation, hexBounds,
        DEFAULTS.canvasSize.width, DEFAULTS.canvasSize.height
      ),
      center: { x: 0, y: 0 }
    }
  });

  return {
    subdivisionRings,
    mapData,
    lastModified: new Date().toISOString()
  };
}

// =========================================================================
// Hook
// =========================================================================

const DEFAULT_PARENT_VIEW: StoredViewState = { zoom: 1.0, center: { x: 0, y: 0 } };

/** Sibling list equality by key and map identity (keeps the memo result stable across unrelated edits). */
function sameAdjacent(a: AdjacentSubHex[], b: AdjacentSubHex[]): boolean {
  return a.length === b.length && a.every((x, i) => x.hexKey === b[i].hexKey && x.mapData === b[i].mapData && x.name === b[i].name);
}

function sameSlots(a: AdjacentEmptySlot[], b: AdjacentEmptySlot[]): boolean {
  return a.length === b.length && a.every((x, i) => x.hexKey === b[i].hexKey && x.exists === b[i].exists);
}

/**
 * Navigation state is ONLY the hexKey path from the root (plus each level's
 * dive-time parent view, for plain exits). The map shown at the active level
 * is derived from the live root on every render, and every write - edits,
 * sub-map creation, view restores - goes through setAtSubHexPath inside a
 * functional root update. Nothing holds a copy of a parent map, so a root
 * change made while drilled in (tileset rescan, journal restore, MCP write,
 * another level's edit) is never reverted by a later sub-hex edit
 * (STRUCT-B-22 / DATA-04).
 */
function useSubHexNavigation({
  mapData: rootMapData,
  updateMapData: rootUpdateMapData,
  initialSubHexPath,
  getCanvas
}: UseSubHexNavigationOptions): UseSubHexNavigationResult {

  // Navigation stack: one frame per entered level (hexKey + dive-time parent view)
  const [navStack, setNavStack] = useState<SubHexNavFrame[]>([]);
  // Counter to signal history resets
  const [navigationVersion, setNavigationVersion] = useState(0);
  // Active sub-hex drill (embed auto-drill or deep-link navigation); null = idle
  const [pendingDrill, setPendingDrill] = useState<PendingDrill | null>(null);

  // A level can vanish from the live root while it is open (journal restore,
  // another pane's write). Render the deepest level that still resolves; the
  // effect below trims the stack to match. A null root (still loading) keeps
  // the stack as is.
  const fullPathKey = navStack.map(f => f.hexKey).join('/');
  const resolvedDepth = useMemo(
    () => resolvableSubHexDepth(rootMapData, parseSubHexPath(fullPathKey)),
    [rootMapData, fullPathKey]
  );
  const frames = useMemo(
    () => (rootMapData != null && resolvedDepth < navStack.length ? navStack.slice(0, resolvedDepth) : navStack),
    [navStack, rootMapData, resolvedDepth]
  );
  const pathKey = frames.map(f => f.hexKey).join('/');
  const path = useMemo((): SubHexPath => parseSubHexPath(pathKey), [pathKey]);

  const isInSubHex = path.length > 0;
  const depth = path.length;
  const activeMapData = useMemo(() => getMapAtSubHexPath(rootMapData, path), [rootMapData, path]);
  const parentPath = useMemo((): SubHexPath => path.slice(0, -1), [path]);
  const parentMapData = isInSubHex ? getMapAtSubHexPath(rootMapData, parentPath) : null;

  // Trim the stack once the open level is gone from the live root. Only a
  // path that HAS resolved before is trimmed: a just-entered sub-map whose
  // creation write has not committed yet must not be popped.
  const lastResolvedPathRef = useRef('');
  // A frame pushed while its creation write was still deferred: if a root
  // commit lands and the path still does not resolve, the write was dropped
  // and the frame is dead (never resolved, so the rule above never trims it).
  const pendingCreateRef = useRef<{ pathKey: string; root: MapData | null } | null>(null);
  useEffect(() => {
    if (rootMapData == null) return;
    if (resolvedDepth === navStack.length) {
      lastResolvedPathRef.current = fullPathKey;
      if (pendingCreateRef.current?.pathKey === fullPathKey) pendingCreateRef.current = null;
      return;
    }
    const pending = pendingCreateRef.current;
    const droppedCreation = pending != null && pending.pathKey === fullPathKey && pending.root !== rootMapData;
    if (droppedCreation) pendingCreateRef.current = null;
    if (lastResolvedPathRef.current !== fullPathKey && !droppedCreation) return;
    const kept = navStack.slice(0, resolvedDepth);
    pruneSubHexBackdrops(getCanvas?.() ?? null, formatSubHexPath(kept.map(f => f.hexKey)));
    setNavStack(kept);
    setNavigationVersion(prev => prev + 1);
  }, [rootMapData, resolvedDepth, navStack, fullPathKey, getCanvas]);

  // If the map unmounts while still nested (leaf closed, mode switch), no exit
  // path runs — release the backdrop snapshot eagerly (the WeakMap would also
  // free it with the canvas, but the bitmap is large; don't wait for GC).
  useEffect(() => () => clearSubHexBackdrop(getCanvas?.() ?? null), [getCanvas]);

  // Breadcrumb labels from the live maps at each level. Keyed on the joined
  // labels so an edit that does not rename anything keeps the same array.
  const breadcrumbLabels: string[] = [];
  if (isInSubHex) {
    breadcrumbLabels.push(rootMapData?.name ?? 'World Map');
    for (let i = 0; i < path.length; i++) {
      breadcrumbLabels.push(getMapAtSubHexPath(rootMapData, path.slice(0, i + 1))?.name ?? `Hex (${path[i]})`);
    }
  }
  const breadcrumbKey = breadcrumbLabels.join('\u0000');
  const breadcrumbs = useMemo(
    (): BreadcrumbSegment[] => (breadcrumbKey === '' ? [] : breadcrumbKey.split('\u0000').map((label, i) => ({ label, depth: i }))),
    [breadcrumbKey]
  );

  // Wrapped updateMapData that routes writes to the active level. The path is
  // the one this render shows, so an edit lands on the level its caller saw.
  const activeUpdateMapData = useCallback<MapDataUpdater>((updaterOrData, options) => {
    if (path.length === 0) {
      rootUpdateMapData(updaterOrData, options);
      return;
    }
    rootUpdateMapData(toRootUpdater(path, updaterOrData), options);
  }, [path, rootUpdateMapData]);

  // Enter a sub-hex at the given axial coordinate. `viewOverride` opens the
  // sub-map at that view instead of its stored one (seamless zoom dives pass
  // the live-canvas fit so the sub-map fills the screen).
  const enterSubHex = useCallback((q: number, r: number, viewOverride?: StoredViewState): void => {
    const currentMapData = activeMapData;
    if (!currentMapData) return;

    const hexKey = `${q},${r}`;
    const childPath = [...path, hexKey];

    let created: SubHexMapData | null = null;
    let subHex = currentMapData.subHexMaps?.[hexKey];
    if (!subHex) {
      // Feature gate: entering EXISTING sub-maps always works; creating new
      // ones requires the subMaps feature.
      if (!isFeatureEnabled('subMaps')) return;
      // Bounds fence: never create a sub-map at a hex outside the current
      // map's own grid. Without this, a double-click over an adjacent-sibling
      // ghost region resolves (via screenToGrid) to a far-out-of-bounds hex
      // of the CURRENT map and silently spawns a nested sub-map there.
      if (!createGeometry(currentMapData).isWithinBounds(q, r)) return;
      created = createSubHexMapData(currentMapData, q, r);
      subHex = created;
    }

    const view = viewOverride != null
      ? { zoom: viewOverride.zoom, center: { ...viewOverride.center } }
      : null;
    // Did the creation write add the entry? Preact runs state updaters at
    // dispatch time, so this is known right after the call (null = deferred).
    // A level that vanished first makes addSubHexEntryAtPath return the root
    // unchanged: pushing a frame then would leave a dead entry in navStack
    // that jumps the view if another writer later creates that key.
    const creation: { added: boolean | null } = { added: null };
    if (created != null || view != null) {
      const toAdd = created;
      rootUpdateMapData((prev) => {
        let next = prev;
        if (toAdd != null) {
          next = addSubHexEntryAtPath(prev, path, hexKey, toAdd);
          creation.added = next !== prev;
        }
        if (view != null) next = setAtSubHexPath(next, childPath, m => ({ ...m, viewState: view }));
        return next;
      }, { cosmetic: created == null });
    }
    if (creation.added === false) return;
    if (created != null && creation.added == null) pendingCreateRef.current = { pathKey: childPath.join('/'), root: rootMapData };

    setNavStack([...frames, { hexKey, parentStoredViewState: currentMapData.viewState ?? DEFAULT_PARENT_VIEW }]);
    traceZoom('enterSubHex', viewOverride != null
      ? { hexKey, overrideZoom: viewOverride.zoom }
      : { hexKey, storedZoom: subHex.mapData.viewState?.zoom ?? null });
    setNavigationVersion(prev => prev + 1);
  }, [activeMapData, path, frames, rootUpdateMapData, rootMapData]);

  // Exit current sub-hex (go up one level). Edits already live in the root,
  // so the only write is the parent's view restore, which is cosmetic.
  const exitSubHex = useCallback((seamlessExit?: SubHexExitDetail | null): void => {
    if (frames.length === 0) return;

    // Discard only the LEAVING level's snapshot: ancestor levels keep theirs,
    // so surfacing from a nested dive re-exposes the outer backdrop instead
    // of leaving the intermediate level in a void.
    clearSubHexBackdrop(getCanvas?.() ?? null, pathKey);

    const currentSubHex = activeMapData;
    const topFrame = frames[frames.length - 1];
    const parentMap = parentMapData;

    // Plain exits (Escape, breadcrumbs) restore the dive-time parent view.
    // Seamless surfaces instead compute the visually-continuous parent view:
    // zoom where the hex footprint matches the sub-map's current screen size,
    // centered so the anchor point stays at the same screen position.
    let restoredViewState = topFrame.parentStoredViewState;
    if (seamlessExit != null && currentSubHex != null && parentMap != null) {
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

    const restored = restoredViewState;
    rootUpdateMapData(
      prev => setAtSubHexPath(prev, parentPath, p => ({ ...p, viewState: restored })),
      { cosmetic: true }
    );
    setNavStack(frames.slice(0, -1));
    setNavigationVersion(prev => prev + 1);
  }, [frames, pathKey, activeMapData, parentMapData, parentPath, rootUpdateMapData, getCanvas]);

  // Navigate to a specific breadcrumb level (0 = root). Each level being left
  // gets its dive-time parent view back, as a sequence of plain exits would.
  const navigateToLevel = useCallback((targetDepth: number): void => {
    if (targetDepth >= frames.length || targetDepth < 0) return;

    // Drop the snapshots of every level being left; levels still on the
    // remaining drill path keep theirs.
    pruneSubHexBackdrops(getCanvas?.() ?? null, formatSubHexPath(path.slice(0, targetDepth)));

    const leaving = frames;
    rootUpdateMapData((prev) => {
      let next = prev;
      for (let i = leaving.length - 1; i >= targetDepth; i--) {
        const view = leaving[i].parentStoredViewState;
        next = setAtSubHexPath(next, path.slice(0, i), m => ({ ...m, viewState: view }));
      }
      return next;
    }, { cosmetic: true });
    setNavStack(frames.slice(0, targetDepth));
    setNavigationVersion(prev => prev + 1);
  }, [frames, path, rootUpdateMapData, getCanvas]);

  // Navigate to a sibling sub-hex (atomic exit + enter). Navigating to a
  // sibling that doesn't exist is a no-op unless the caller explicitly opts
  // into creation (the "+" affordance) — a stray click must never mint maps.
  const navigateToSibling = useCallback((q: number, r: number, opts?: { createIfMissing?: boolean }): void => {
    if (frames.length === 0) return;
    const parentMap = parentMapData;
    if (parentMap == null) return;

    const currentSubHex = activeMapData;
    const topFrame = frames[frames.length - 1];
    const siblingKey = `${q},${r}`;

    // Creation preconditions: explicit opt-in, the subMaps feature, and the
    // sibling hex inside the parent's bounds.
    let created: SubHexMapData | null = null;
    let siblingSubHex = parentMap.subHexMaps?.[siblingKey];
    if (siblingSubHex == null) {
      if (opts?.createIfMissing !== true) return;
      if (!isFeatureEnabled('subMaps')) return;
      if (!createGeometry(parentMap).isWithinBounds(q, r)) return;
      created = createSubHexMapData(parentMap, q, r);
      siblingSubHex = created;
    }

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
    let arrivalView: StoredViewState | null = null;
    if (departingView != null) {
      const currentRings = parentMap.subHexMaps?.[topFrame.hexKey]?.subdivisionRings ?? 7;
      const currentHexSize = currentSubHex?.hexSize ?? parentHexSize;
      const siblingRings = siblingSubHex.subdivisionRings ?? 7;
      const siblingHexSize = siblingSubHex.mapData.hexSize ?? parentHexSize;

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
      arrivalView = { zoom: arrivalZoom, center: arrivalCenter };
    }

    // The backdrop snapshot depicts the PARENT map's world — identical for
    // adjacent siblings, only the anchor hex changes. Re-label it to the
    // sibling's path instead of dropping it (dropping was the "background
    // vanishes on adjacent navigation" bug: capture only ever ran on dives,
    // so a cleared snapshot never came back). Recapturing here would be
    // wrong too: the live canvas shows the DEPARTING sibling's interior,
    // not the parent imagery.
    const siblingPath = [...parentPath, siblingKey];

    // Write first: a creation dropped because the parent level vanished must
    // not relabel the backdrop or replace the frame (see enterSubHex).
    const creation: { added: boolean | null } = { added: null };
    if (created != null || arrivalView != null) {
      const toAdd = created;
      const view = arrivalView;
      rootUpdateMapData((prev) => {
        let next = prev;
        if (toAdd != null) {
          next = addSubHexEntryAtPath(prev, parentPath, siblingKey, toAdd);
          creation.added = next !== prev;
        }
        if (view != null) next = setAtSubHexPath(next, siblingPath, m => ({ ...m, viewState: view }));
        return next;
      }, { cosmetic: created == null });
    }
    if (creation.added === false) return;
    if (created != null && creation.added == null) pendingCreateRef.current = { pathKey: siblingPath.join('/'), root: rootMapData };

    const canvas = getCanvas?.() ?? null;
    if (canvas != null) {
      relabelSubHexBackdrop({
        canvas,
        oldSubHexPath: pathKey,
        newSubHexPath: siblingPath.join('/'),
        hexCenterWorld: { x: siblingCenter.worldX, y: siblingCenter.worldY },
        childHexSize: siblingSubHex.mapData.hexSize ?? parentHexSize,
        rings: siblingSubHex.subdivisionRings ?? 7
      });
    }

    // Replace the top frame with the sibling's frame
    setNavStack([...frames.slice(0, -1), { hexKey: siblingKey, parentStoredViewState: topFrame.parentStoredViewState }]);
    setNavigationVersion(prev => prev + 1);
  }, [frames, parentMapData, parentPath, activeMapData, pathKey, rootUpdateMapData, getCanvas, rootMapData]);

  // Current hex key (for adjacent sub-hex lookup)
  const currentHexKey = isInSubHex ? path[path.length - 1] : null;

  // Compute adjacent sub-hexes (siblings with content), from the live parent.
  // The parent object changes with every edit at this level (the edited
  // entry lives in its subHexMaps); the ref keeps the result's identity
  // until a sibling actually changes.
  const adjacentRef = useRef<AdjacentSubHex[]>([]);
  const adjacentSubHexes = useMemo((): AdjacentSubHex[] => {
    const parentSubHexMaps = parentMapData?.subHexMaps;
    const adjacent: AdjacentSubHex[] = [];
    if (currentHexKey != null && parentSubHexMaps != null) {
      const [cqStr, crStr] = currentHexKey.split(',');
      const cq = parseInt(cqStr, 10);
      const cr = parseInt(crStr, 10);

      // 6 axial hex neighbor directions
      const dirs = [
        [1, 0], [1, -1], [0, -1],
        [-1, 0], [-1, 1], [0, 1]
      ];

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
    }
    if (sameAdjacent(adjacent, adjacentRef.current)) return adjacentRef.current;
    adjacentRef.current = adjacent;
    return adjacent;
  }, [parentMapData, currentHexKey]);

  // Neighbor slots WITHOUT a navigable sibling (missing, or existing but
  // empty), constrained to the parent's own grid bounds. Rendered as "+"
  // affordances; clicking one calls navigateToSibling(..., { createIfMissing }).
  const slotsRef = useRef<AdjacentEmptySlot[]>([]);
  const adjacentEmptySlots = useMemo((): AdjacentEmptySlot[] => {
    const slots = currentHexKey != null && parentMapData != null && isFeatureEnabled('subMaps')
      ? computeAdjacentEmptySlots(parentMapData, currentHexKey, new Set(adjacentSubHexes.map(a => a.hexKey)))
      : [];
    if (sameSlots(slots, slotsRef.current)) return slotsRef.current;
    slotsRef.current = slots;
    return slots;
  }, [parentMapData, currentHexKey, adjacentSubHexes]);

  // Advance the active sub-hex drill one level per render. enterSubHex reads
  // the committed path, so each level must commit before the next segment is
  // read; the effect re-fires as the stack catches up. Missing/malformed
  // segments stop the drill at the nearest resolvable level (drilling never
  // creates sub-maps). `onArrive` fires exactly once, on completion or on stop.
  useEffect(() => {
    if (pendingDrill == null) return;
    const { segments, index, onArrive } = pendingDrill;

    // Wait until the stack reflects the segments applied so far.
    if (frames.length !== index) return;

    if (index >= segments.length) {
      setPendingDrill(null);
      onArrive?.();
      return;
    }

    const current = activeMapData;
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
  }, [pendingDrill, frames.length, activeMapData, enterSubHex]);

  // Seed the auto-drill from an embed block's `subhex:` key, once per load.
  // Runs from root (mount stack is empty), so this never fights the user's
  // own navigation afterwards. A later root replacement (journal restore)
  // needs no special handling: the drilled level is read from the live root.
  const initialSeededRef = useRef(false);
  useEffect(() => {
    if (initialSeededRef.current) return;
    if (initialSubHexPath == null || initialSubHexPath === '') return;
    if (rootMapData == null) return; // wait for the root map to load
    initialSeededRef.current = true;
    const segments = parseSubHexPath(initialSubHexPath);
    if (segments.length > 0) setPendingDrill({ segments, index: 0 });
  }, [initialSubHexPath, rootMapData]);

  // Drill into an absolute sub-hex path from root (deep-link navigation).
  // Resets to root first so the absolute path drills from a known base;
  // `onArrive` fires once the target (or nearest resolvable level) is reached.
  const drillToSubHexPath = useCallback((target: string | null, onArrive?: () => void): void => {
    const segments = parseSubHexPath(target);
    if (frames.length > 0) navigateToLevel(0);
    if (segments.length === 0) {
      setPendingDrill(null);
      onArrive?.();
      return;
    }
    setPendingDrill({ segments, index: 0, onArrive });
  }, [frames.length, navigateToLevel]);

  // Current drill-down path, for "copy embed block" to reference this sub-hex
  const subHexPath = formatSubHexPath(path);

  // Live-derived distance settings for the active sub-hex: one parent hex
  // spans the sub-map, so each nesting level divides distance-per-cell by
  // the sub-grid's cells-across unless that level has an explicit override.
  const activeDistanceOverrides = useMemo((): ResolvedDistanceSettings | null => {
    if (path.length === 0) return null;

    const mapOverrides = (map: MapData | null | undefined): MapDistanceOverrides | null =>
      (map?.settings?.distanceSettings as MapDistanceOverrides | undefined) ?? null;

    const levels: SubHexDistanceLevel[] = [
      { overrides: mapOverrides(rootMapData), cellsAcross: null }
    ];
    for (let i = 0; i < path.length; i++) {
      const levelPath = path.slice(0, i + 1);
      const rings = getSubHexEntryAtPath(rootMapData, levelPath)?.subdivisionRings ?? 7;
      levels.push({
        overrides: mapOverrides(getMapAtSubHexPath(rootMapData, levelPath)),
        cellsAcross: rings * 2 + 1
      });
    }

    return resolveSubHexDistanceSettings('hex', getSettings(), levels);
  }, [path, rootMapData]);

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
    adjacentEmptySlots,
    activeDistanceOverrides,
    subHexPath
  };
}

export { useSubHexNavigation, createSubHexMapData, computeAdjacentEmptySlots };

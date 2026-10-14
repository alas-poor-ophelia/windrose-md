import type { ComponentChildren, VNode, RefObject } from 'preact';
import type {
  MapData,
  MapDataUpdate,
  Cell,
  Curve,
  MapObject,
  TextLabel,
  Edge,
  StoredViewState,
  TextLabelSettings,
  ToolId,
  ObjectTypeId,
  LayerId,
  LayerVisibility
} from '#types/index';
import type { ResolvedTheme } from '#types/settings/settings.types';
import type { ExtendedGeometry, MapStateContextValue } from '#types/contexts/context.types';
import type { AdjacentEmptySlotRenderData, AdjacentSubHexRenderData } from '#types/hooks/canvasRenderer.types';
import type { MapDistanceOverrides } from '#types/hooks/distanceMeasurement.types';
import type { TileAssignment } from '#types/tiles/tile.types';
import type { WallPath } from '#types/core/wallpath.types';
import type { TerrainStroke } from '#types/core/terrainstroke.types';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useCanvasRenderer } from '../../hooks/canvas/useCanvasRenderer';
import { useCanvasInteraction } from '../../hooks/canvas/useCanvasInteraction';
import { useViewController } from '../../hooks/canvas/useViewController';
import { createCanvasCursorStore, toolCursorClass } from '../../hooks/canvas/canvasCursor';
import type { ViewController } from '#types/hooks/viewController.types';
import { GridGeometry } from '../../geometry/core/GridGeometry';
import { DEFAULTS } from '../../core/dmtConstants';
import { getObjectAtPosition, addObject, removeObject, removeObjectsInRectangle, updateObject, isAreaFree } from '../../objects/objectOperations';
import { addTextLabel, getTextLabelAtPosition, removeTextLabel, updateTextLabel } from '../../text/textLabelOperations';
import { HexGeometry } from '../../geometry/core/HexGeometry';
import { createGeometry } from '../../geometry/core/createGeometry';
import { LinkedNoteHoverOverlays } from '../overlays/LinkedNoteHoverOverlays';
import { MapStateProvider, MapOperationsProvider } from '../../context/MapContext';
import { MapSelectionProvider, useMapSelection } from '../../context/MapSelectionContext';
import { ObjectLinkingProvider } from '../../context/ObjectLinkingContext';
import { ObjectLayer } from './ObjectLayer';
import { DrawingLayer } from './DrawingLayer';
import { FreehandLayer } from './FreehandLayer';
import { TextLayer } from './TextLayer';
import { NotePinLayer } from './NotePinLayer';
import { EventHandlerProvider } from '../../context/EventHandlerContext';
import { HexCoordinateLayer } from './HexCoordinateLayer';
import { MeasurementLayer } from './MeasurementLayer';
import { RouteLayer } from './RouteLayer';
import { PartyPinLayer } from './PartyPinLayer';
import { DiagonalFillOverlay } from './DiagonalFillOverlay';
import { AreaSelectLayer } from './AreaSelectLayer';
import { FogOfWarLayer } from './FogOfWarLayer';
import { RegionLayer } from './RegionLayer';
import { OutlineLayer } from './OutlineLayer';
import { ShapeOverlayLayer } from './ShapeOverlayLayer';
import { TilePlacementLayer } from './TilePlacementLayer';
import { TerrainBrushLayer } from './TerrainBrushLayer';
import { WallLayer } from './WallLayer';
import { focusMapOnPointerDown, shouldHandleMapKey } from '../../utils/keyboardTargets';
import { RerollDungeonButton } from './RerollDungeonButton';
import { getSetting } from '../../core/settingsAccessor';
import { usePanZoomCoordinator } from '../../hooks/canvas/usePanZoomCoordinator';
import { useEventCoordinator } from '../../hooks/canvas/useEventCoordinator';

// ===========================================
// Local Type Definitions
// ===========================================

interface CanvasDimensions {
  width: number;
  height: number;
}

interface CoordinatorsProps {
  canvasRef: RefObject<HTMLCanvasElement>;
  mapData: MapData | null;
  geometry: ExtendedGeometry | null;
  isFocused: boolean;
  isColorPickerOpen: boolean;
  isAlignmentMode: boolean;
  interactionLocked: boolean;
  viewController: ViewController;
}

interface MapCanvasContentProps {
  mapId?: string;
  notePath?: string;
  mapData: MapData | null;
  onCellsChange: (cells: Cell[], skipHistory?: boolean) => void;
  onCurvesChange: (curves: Curve[], skipHistory?: boolean) => void;
  onObjectsChange: (objects: MapObject[], suppressHistory?: boolean) => void;
  onTextLabelsChange: (labels: TextLabel[]) => void;
  onEdgesChange: (edges: Edge[], skipHistory?: boolean) => void;
  onTilesChange?: (tiles: TileAssignment[]) => void;
  /** Arms a layer (real layer-select: swaps the per-layer history stack). */
  onLayerSelect?: (layerId: LayerId) => void;
  /** Drops held transient-history baselines (gesture boundary; see useLayerHistory.clearTransient). */
  clearTransient?: () => void;
  onWallPathsChange?: (wallPaths: WallPath[], suppressHistory?: boolean) => void;
  onTerrainStrokesChange?: (strokes: TerrainStroke[], suppressHistory?: boolean) => void;
  tileImagesReady?: boolean;
  hiddenTileLayers?: Set<string>;
  adjacentSubHexes?: AdjacentSubHexRenderData[] | null;
  adjacentEmptySlots?: AdjacentEmptySlotRenderData[] | null;
  onViewStateChange: (viewState: StoredViewState) => void;
  onTextLabelSettingsChange: (settings: TextLabelSettings) => void;
  currentTool: ToolId;
  selectedObjectType: ObjectTypeId | undefined;
  selectedColor: string;
  isColorPickerOpen: boolean;
  isFocused: boolean;
  isAnimating: boolean;
  theme: ResolvedTheme;
  isAlignmentMode: boolean;
  /** Picture frame mode: view-only canvas — tool actions become pans, menus/editors suppressed. */
  interactionLocked?: boolean;
  /** Wall under active edit-drag; excluded from the static raster (live overlay owns it). */
  draggingWallId?: string | null;
  /** Resolved distance overrides for the active map (sub-hex-aware; null/undefined = use global). */
  distanceOverrides?: MapDistanceOverrides | null;
  /** True when the active map is a drilled-into sub-hex. */
  isInSubHex?: boolean;
  /** Current sub-hex drill path ('/'-joined "q,r" hexKeys); null at root. */
  subHexPath?: string | null;
  /** Per-mount instance id — stamped into map-scoped custom events. */
  instanceId?: string | null;
  /** Direct sub-hex dive/surface callbacks for this mount (see MapContext). */
  requestEnterSubHex?: MapStateContextValue['requestEnterSubHex'];
  requestExitSubHex?: MapStateContextValue['requestExitSubHex'];
  children: ComponentChildren;
}

interface MapCanvasProps extends MapCanvasContentProps {
  layerVisibility: LayerVisibility;
  adjacentSubHexes?: AdjacentSubHexRenderData[] | null;
  adjacentEmptySlots?: AdjacentEmptySlotRenderData[] | null;
}


// ===========================================
// Components
// ===========================================

/**
 * Coordinators - Internal component that calls coordinator hooks
 * This component must be rendered inside the Context provider tree
 * so the hooks have access to MapState, MapSelection, and EventHandler contexts.
 * Returns null (no visual rendering) - only manages behavioral coordination.
 */
const Coordinators = ({ canvasRef, mapData, geometry, isFocused, isColorPickerOpen, isAlignmentMode, interactionLocked, viewController }: CoordinatorsProps): null => {
  // Coordinator hooks need to be called inside the provider tree
  usePanZoomCoordinator({
    canvasRef,
    mapData,
    geometry,
    isFocused,
    viewController
  });

  useEventCoordinator({
    canvasRef,
    isColorPickerOpen,
    showObjectColorPicker: false,
    isAlignmentMode,
    interactionLocked
  });

  return null; // No UI - coordinators only manage behavior
};

/**
 * MapCanvasContent - Inner component that uses context hooks
 * Contains all the map canvas logic and interacts with shared selection state
 */
const MapCanvasContent = ({ mapId, notePath, mapData, onCellsChange, onCurvesChange, onObjectsChange, onTextLabelsChange, onEdgesChange, onTilesChange, onLayerSelect, clearTransient, onWallPathsChange, onTerrainStrokesChange, tileImagesReady, hiddenTileLayers, adjacentSubHexes, adjacentEmptySlots, onViewStateChange, onTextLabelSettingsChange, currentTool, selectedObjectType, selectedColor, isColorPickerOpen, isFocused, isAnimating, theme, isAlignmentMode, interactionLocked = false, draggingWallId, distanceOverrides, isInSubHex, subHexPath, instanceId, requestEnterSubHex, requestExitSubHex, children }: MapCanvasContentProps): VNode => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fogCanvasRef = useRef<HTMLCanvasElement | null>(null);  // Separate canvas for fog blur effect (CSS blur for iOS compat)
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canvasDimensions, setCanvasDimensions] = useState<CanvasDimensions>({
    width: DEFAULTS.canvasSize.width,
    height: DEFAULTS.canvasSize.height
  });
  // Create onMapDataUpdate wrapper for map-level changes
  // This bridges the old prop-based API with the new context-based approach
  const onMapDataUpdate = useCallback((updates: MapDataUpdate) => {
    if (updates.viewState != null) {
      onViewStateChange(updates.viewState);
    }
    if (updates.lastTextLabelSettings != null) {
      onTextLabelSettingsChange(updates.lastTextLabelSettings);
    }
  }, [onViewStateChange, onTextLabelSettingsChange]);

  // Use shared selection from context (same state ObjectLayer uses)
  const {
    selectedItem,
    selectedItems,
    isDraggingSelection,
    isResizeMode,
    showCoordinates, setShowCoordinates,
    layerVisibility
  } = useMapSelection();

  // Orientation animation state

  // Ref for reading showCoordinates inside stable keyboard effect
  const showCoordinatesRef = useRef<boolean>(showCoordinates);
  showCoordinatesRef.current = showCoordinates;

  // Cursor classes for THIS map's canvas (REACT-04). The tool class is
  // render-time; the transient interaction class (space-grab, panning,
  // shape-active, drawing) is written by the store straight to the element,
  // fed by the pan/zoom coordinator and DrawingLayer. The canvas takes no
  // className prop so Preact never clobbers the transient class.
  const [cursorStore] = useState(createCanvasCursorStore);
  const toolCursor = toolCursorClass(currentTool, isDraggingSelection, selectedObjectType != null);
  useLayoutEffect(() => {
    cursorStore.attach(canvasRef.current);
    return () => cursorStore.attach(null);
  }, [cursorStore]);
  useLayoutEffect(() => {
    cursorStore.setBase(toolCursor);
  }, [cursorStore, toolCursor]);

  // Create geometry instance based on map type
  // Return null during loading to prevent errors
  // Keyed on the five fields createGeometry reads; the rest of mapData comes
  // from a latest-ref so unrelated edits don't rebuild the geometry.
  const geometryMapDataRef = useRef(mapData);
  geometryMapDataRef.current = mapData;
  const hasGeometryMapData = mapData != null;
  const geoMapType = mapData?.mapType;
  const geoGridSize = mapData?.gridSize;
  const geoHexSize = mapData?.hexSize;
  const geoOrientation = mapData?.orientation;
  const geoHexBounds = mapData?.hexBounds;
  const geometry = useMemo((): ExtendedGeometry | null => {
    const latest = geometryMapDataRef.current;
    if (!hasGeometryMapData || latest == null) return null;
    return createGeometry({
      ...latest,
      mapType: geoMapType ?? latest.mapType, gridSize: geoGridSize, hexSize: geoHexSize,
      orientation: geoOrientation, hexBounds: geoHexBounds
    });
  }, [hasGeometryMapData, geoMapType, geoGridSize, geoHexSize, geoOrientation, geoHexBounds]);

  // Shared live pan/zoom controller. Holds viewState off the React path during a
  // gesture and commits to mapData once at gesture end (sink = onViewStateChange).
  // The SAME instance is passed to the coordinator's interaction handlers, this
  // coord-utility instance, and the renderer, so canvas + hit-testing never desync.
  const viewController = useViewController(mapData?.viewState, onViewStateChange);

  // External viewState changes (navigate / undo / load / fit-view) flow into the
  // live controller; syncCommitted no-ops while a gesture is in flight.
  useEffect(() => {
    if (mapData?.viewState) viewController.syncCommitted(mapData.viewState);
  }, [mapData?.viewState, viewController]);

  // Use canvas interaction ONLY for coordinate utility functions — do NOT
  // pass the sub-hex args here. The three outputs consumed below never read
  // them, and threading subHexPath in wakes the hook's internal sub-hex
  // boundary layout effect in a SECOND instance sharing the one
  // ViewController: every dive/surface then double-fires syncCommitted/
  // notifyLive (live overlays aren't rAF-coalesced), which showed up as
  // wheel dive/surface jitter. Only the handler-registering instance in
  // usePanZoomCoordinator gets the sub-hex wiring.
  const {
    screenToGrid,
    screenToWorld,
    getClientCoords
  } = useCanvasInteraction(canvasRef, mapData, geometry, isFocused, viewController);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const updateCanvasSize = (): void => {
      const rect = container.getBoundingClientRect();
      setCanvasDimensions({
        width: Math.max(rect.width, DEFAULTS.canvasSize.width),
        height: Math.max(rect.height, DEFAULTS.canvasSize.height)
      });
    };

    // Initial size
    updateCanvasSize();

    // Watch for container size changes
    const resizeObserver = new ResizeObserver(updateCanvasSize);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

  // Force canvas resize when animation completes
  useEffect(() => {
    if (isAnimating) return; // Only run when animation ends

    const container = containerRef.current;
    if (!container) return;

    // Wait one more frame to ensure CSS transition is fully complete
    const rafId = window.requestAnimationFrame(() => {
      const rect = container.getBoundingClientRect();
      setCanvasDimensions({
        width: Math.max(rect.width, DEFAULTS.canvasSize.width),
        height: Math.max(rect.height, DEFAULTS.canvasSize.height)
      });
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [isAnimating]);

  // Render canvas whenever relevant state changes
  const { scheduleRender } = useCanvasRenderer(canvasRef, fogCanvasRef, mapData, geometry, selectedItems, { isResizeMode, theme, showCoordinates, layerVisibility, tileImagesReady, adjacentSubHexes, adjacentEmptySlots, hiddenTileLayers, draggingWallId, subHexPath: subHexPath ?? null }, viewController);

  // Canvas sizing on dimension change (expand/collapse). This effect only
  // resizes; every repaint goes through the coordinated renderer's
  // scheduleRender so the frame carries multi-select, live view and dragged-wall
  // state (REACT-05). Visibility/coordinate/adjacency changes are already
  // inputs of useCanvasRenderer and are not repeated here. Layout effect: the
  // queued frame lands before the browser paints the cleared canvas.
  useLayoutEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const fogCanvas = fogCanvasRef.current;

    // During animation, preserve canvas content
    if (isAnimating) {
      // Save current canvas content
      const tempCanvas = (canvas.ownerDocument.defaultView ?? activeWindow).createEl('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.drawImage(canvas, 0, 0);
      }

      // Update canvas size
      canvas.width = canvasDimensions.width;
      canvas.height = canvasDimensions.height;

      // Also update fog canvas size
      if (fogCanvas) {
        fogCanvas.width = canvasDimensions.width;
        fogCanvas.height = canvasDimensions.height;
      }

      // Restore content (will stretch/compress during animation)
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
      }
    } else {
      // After animation, do a proper redraw with correct dimensions
      scheduleRender();
    }
  }, [canvasDimensions.width, canvasDimensions.height, isAnimating, scheduleRender]);

  // Keyboard focus: a press on the map moves focus to the (tabIndex -1) map
  // wrapper, so the next Delete/R/Escape targets the map. Without it, focus
  // stays on the note editor in Live Preview (the canvas handlers
  // preventDefault mousedown/touchstart) and the typing guard drops the key.
  // Capture phase: runs before any layer's own pointer handling. Presses on
  // inputs, buttons and other self-focusing controls keep their own focus.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const handlePointerDown = (e: PointerEvent): void => {
      focusMapOnPointerDown(e.target, container);
    };
    container.addEventListener('pointerdown', handlePointerDown, true);
    return () => container.removeEventListener('pointerdown', handlePointerDown, true);
  }, []);

  // 'C' key handler for coordinate overlay (hex maps only)
  useEffect(() => {
    // Get the coordinate key mode from settings ('hold' or 'toggle')
    const keyMode = getSetting('coordinateKeyMode') || 'hold';

    // Only attach listeners if focused and on a hex map
    if (!isFocused || mapData?.mapType !== 'hex') {
      if (showCoordinatesRef.current && (mapData?.mapType !== 'hex' || keyMode === 'hold')) {
        setShowCoordinates(false);
      }
      return undefined;
    }

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key.toLowerCase() === 'c' && !e.shiftKey && !e.ctrlKey && !e.metaKey &&
          shouldHandleMapKey(e, canvasRef.current)) {
        if (e.repeat && keyMode === 'toggle') return;

        e.preventDefault();

        if (keyMode === 'toggle') {
          setShowCoordinates(!showCoordinatesRef.current);
        } else {
          setShowCoordinates(true);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent): void => {
      if (e.key.toLowerCase() === 'c') {
        if (keyMode === 'hold') {
          setShowCoordinates(false);
        }
      }
    };

    // Listen on the window that owns this map's canvas (popout-safe).
    const win = canvasRef.current?.ownerDocument.defaultView ?? window;
    win.addEventListener('keydown', handleKeyDown);
    win.addEventListener('keyup', handleKeyUp);
    return () => {
      win.removeEventListener('keydown', handleKeyDown);
      win.removeEventListener('keyup', handleKeyUp);
    };
  }, [isFocused, mapData?.mapType, setShowCoordinates]);

  // Build context values for providers
  const mapStateValue = useMemo(() => ({
    canvasRef,
    containerRef,
    mapData,
    mapId,
    notePath,
    geometry,
    currentTool,
    selectedColor,
    selectedObjectType,
    screenToGrid,
    screenToWorld,
    getClientCoords,
    viewController,
    GridGeometry,
    HexGeometry,
    distanceOverrides,
    isInSubHex: isInSubHex === true,
    subHexPath: subHexPath ?? null,
    instanceId: instanceId ?? null,
    requestEnterSubHex,
    requestExitSubHex,
    cursorStore
  } as MapStateContextValue), [mapData, mapId, notePath, geometry, currentTool, selectedColor,
    selectedObjectType, screenToGrid, screenToWorld, getClientCoords, viewController,
    distanceOverrides, isInSubHex, subHexPath, instanceId, requestEnterSubHex, requestExitSubHex,
    cursorStore]);

  const mapOperationsValue = useMemo(() => ({
    // Object operations
    getObjectAtPosition,
    addObject,
    updateObject,
    removeObject,
    isAreaFree,
    removeObjectsInRectangle,

    // Text operations
    getTextLabelAtPosition,
    addTextLabel,
    updateTextLabel,
    removeTextLabel,

    // Callbacks
    onCellsChange,
    onCurvesChange,
    onObjectsChange,
    onTextLabelsChange,
    onEdgesChange,
    onTilesChange,
    onLayerSelect,
    clearTransient,
    onWallPathsChange,
    onTerrainStrokesChange,
    onMapDataUpdate
  }), [onCellsChange, onCurvesChange, onObjectsChange, onTextLabelsChange, onEdgesChange, onTilesChange, onLayerSelect, clearTransient, onWallPathsChange, onTerrainStrokesChange, onMapDataUpdate]);

  return (
    <EventHandlerProvider>
      <MapStateProvider value={mapStateValue}>
        <MapOperationsProvider value={mapOperationsValue}>
          {/* Coordinators - must be inside provider tree to access contexts */}
          <Coordinators
            canvasRef={canvasRef}
            mapData={mapData}
            geometry={geometry}
            isFocused={isFocused}
            isColorPickerOpen={isColorPickerOpen}
            isAlignmentMode={isAlignmentMode}
            interactionLocked={interactionLocked}
            viewController={viewController}
          />

          <div className="windrose-canvas-container" ref={containerRef}>
            {/* Wrapper for canvas alignment - fog canvas positions relative to this */}
            <div style={{ position: 'relative', display: 'inline-block' }}>
              {/* Main canvas */}
              <canvas
                ref={canvasRef}
                width={canvasDimensions.width}
                height={canvasDimensions.height}
                style={{ touchAction: 'none', display: 'block' }}
              />

              {/* Fog blur overlay canvas */}
              <canvas
                ref={fogCanvasRef}
                width={canvasDimensions.width}
                height={canvasDimensions.height}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  pointerEvents: 'none'
                }}
              />
            </div>

            <LinkedNoteHoverOverlays
              selectedItem={selectedItem}
            />

            {/* Render child layers */}
            {children}
          </div>
        </MapOperationsProvider>
      </MapStateProvider>
    </EventHandlerProvider>
  );
};

const MapCanvas = (props: MapCanvasProps): VNode => {
  const { children, layerVisibility, adjacentSubHexes, adjacentEmptySlots, ...restProps } = props;

  return (
    <MapSelectionProvider layerVisibility={layerVisibility}>
      <ObjectLinkingProvider>
        <MapCanvasContent {...restProps} adjacentSubHexes={adjacentSubHexes} adjacentEmptySlots={adjacentEmptySlots}>
          {children}
        </MapCanvasContent>
      </ObjectLinkingProvider>
    </MapSelectionProvider>
  );
};

// Attach layer components using dot notation
MapCanvas.ObjectLayer = ObjectLayer;
MapCanvas.DrawingLayer = DrawingLayer;
MapCanvas.FreehandLayer = FreehandLayer;
MapCanvas.TextLayer = TextLayer;
MapCanvas.NotePinLayer = NotePinLayer;
MapCanvas.HexCoordinateLayer = HexCoordinateLayer;
MapCanvas.MeasurementLayer = MeasurementLayer;
MapCanvas.RouteLayer = RouteLayer;
MapCanvas.PartyPinLayer = PartyPinLayer;
MapCanvas.DiagonalFillOverlay = DiagonalFillOverlay;
MapCanvas.AreaSelectLayer = AreaSelectLayer;
MapCanvas.FogOfWarLayer = FogOfWarLayer;
MapCanvas.RegionLayer = RegionLayer;
MapCanvas.OutlineLayer = OutlineLayer;
MapCanvas.ShapeOverlayLayer = ShapeOverlayLayer;
MapCanvas.TilePlacementLayer = TilePlacementLayer;
MapCanvas.TerrainBrushLayer = TerrainBrushLayer;
MapCanvas.WallLayer = WallLayer;
MapCanvas.RerollDungeonButton = RerollDungeonButton;

export { MapCanvas };
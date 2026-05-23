// DungeonMapTracker.tsx - Main component with undo/redo, objects, text labels, and color support

import type { VNode } from 'preact';
import type {
  MapData,
  MapType,
  IGeometry,
  ExtendedGeometry,
  MapObject,
} from '#types/index';
import type { ResolvedTheme } from '#types/settings/settings.types';
import type { ToolId } from '#types/tools/tool.types';
import type { FoggedCell } from '#types/core/map.types';
import type { Cell } from '#types/core/cell.types';
import type { TilesetOverrides } from '#types/tiles/tile.types';
import type { FogTool } from './components/toolbars/VisibilityToolbar';
import type { LayerVisibility } from '#types/contexts/context.types';
import type { CustomColor } from '#types/core/common.types';

import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { useMapData } from './hooks/state/useMapData';
import { useLayerHistory } from './hooks/state/useLayerHistory';
import { useToolState } from './hooks/state/useToolState';
import { useFogOfWar } from './hooks/interactions/useFogOfWar';
import { useDataHandlers } from './hooks/state/useDataHandlers';
import { GridGeometry } from './geometry/core/GridGeometry';
import { HexGeometry } from './geometry/core/HexGeometry';
import { MapHeader } from './components/controls/MapHeader';
import { MapCanvas } from './components/mapcanvas/MapCanvas';
import { MapControls } from './components/controls/MapControls';
import { ToolPalette } from './components/toolbars/ToolPalette';
import { ObjectSidebar } from './components/panels/ObjectSidebar';
import { VisibilityToolbar } from './components/toolbars/VisibilityToolbar';
import { FogOfWarToolbar } from './components/toolbars/FogOfWarToolbar';

import { MapSettingsModal } from './components/settings/MapSettingsModal';
import { getTheme, getEffectiveSettings, getSettings } from './core/settingsAccessor';
import { DEFAULTS } from './core/dmtConstants';
import { getColorByHex, isDefaultColor } from './drawing/colorOperations';
import { ImageAlignmentMode } from './components/overlays/ImageAlignmentMode';
import { useAlignmentMode } from './hooks/interactions/useAlignmentMode';
import { ModalPortal } from './components/modals/ModalPortal';
import { getActiveLayer, getLayerById } from './persistence/layerAccessor';
import { setCell as accessorSetCell, removeCell as accessorRemoveCell, cellToPoint } from './geometry/core/cellAccessor';
import { LayerControls } from './components/panels/LayerControls';
import { RegionPanel } from './components/panels/RegionPanel';
import { LayerEditModal } from './components/modals/LayerEditModal';
import { openNativeCloneLayerModal, CloneLayerModal } from './components/modals/CloneLayerModal';
import { useSubHexNavigation } from './hooks/interactions/useSubHexNavigation';
import { useCustomEventHandlers } from './hooks/interactions/useCustomEventHandlers';
import { useUILayout } from './hooks/state/useUILayout';
import { usePanelState } from './hooks/state/usePanelState';
import { useViewControls } from './hooks/state/useViewControls';
import { useTileBrush } from './hooks/state/useTileBrush';
import { SubHexBreadcrumb } from './components/controls/SubHexBreadcrumb';
import { TileAssetBrowser } from './components/panels/TileAssetBrowser';
import { RA_ICONS } from './assets/rpgAwesomeIcons';
import { injectIconCSS } from './assets/rpgAwesomeLoader';
import { useApp } from './context/AppContext';
import { Icon } from './components/shared/Icon';

// Inject RPGAwesome icon CSS classes on module load
injectIconCSS(RA_ICONS);

// ============================================================================
// LOCAL TYPE DEFINITIONS
// ============================================================================

/** Extended geometry with implementation-specific methods used in this component */
interface RichGeometry extends ExtendedGeometry {
  offsetToWorld?: (col: number, row: number) => { worldX: number; worldY: number };
}

interface DungeonMapTrackerProps {
  mapId?: string;
  mapName?: string;
  mapType?: MapType;
  notePath?: string;
}

type CornerPosition = 'tl' | 'tr' | 'bl' | 'br';

interface CornerBracketProps {
  position: CornerPosition;
}


// ============================================================================
// MAIN COMPONENT
// ============================================================================

// Corner Bracket SVG Component
const CornerBracket = ({ position }: CornerBracketProps): VNode => {
  return (
    <svg
      className={`dmt-corner-bracket dmt-corner-bracket-${position}`}
      viewBox="0 0 50 50"
    >
      <defs>
        <filter id={`bracket-glow-${position}`}>
          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* Main L-bracket with ornamental details */}
      <path
        d="M 0 18 L 0 0 L 18 0"
        stroke="#c4a57b"
        strokeWidth="3"
        fill="none"
        filter={`url(#bracket-glow-${position})`}
      />
      {/* Inner detail line */}
      <path
        d="M 3 15 L 3 3 L 15 3"
        stroke="rgba(255, 255, 255, 0.4)"
        strokeWidth="1"
        fill="none"
      />
      {/* Small notches for detail */}
      <line
        x1="0" y1="9" x2="5" y2="9"
        stroke="#c4a57b"
        strokeWidth="2"
      />
      <line
        x1="9" y1="0" x2="9" y2="5"
        stroke="#c4a57b"
        strokeWidth="2"
      />
      {/* Corner ornament */}
      <circle
        cx="18" cy="18" r="3"
        fill="none"
        stroke="#c4a57b"
        strokeWidth="1.5"
        filter={`url(#bracket-glow-${position})`}
      />
    </svg>
  );
};

const DungeonMapTracker = ({ mapId = 'default-map', mapName = '', mapType = 'grid', notePath = '' }: DungeonMapTrackerProps): VNode => {
  const app = useApp();
  const { mapData: rootMapData, isLoading, saveStatus, updateMapData: rootUpdateMapData, forceSave, tileImagesReady, getCachedImage } = useMapData(mapId, mapName, mapType);

  const {
    activeMapData: mapData,
    activeUpdateMapData: updateMapData,
    isInSubHex,
    breadcrumbs,
    enterSubHex,
    exitSubHex,
    navigateToLevel,
    navigateToSibling,
    navigationVersion,
    adjacentSubHexes
  } = useSubHexNavigation({ mapData: rootMapData, updateMapData: rootUpdateMapData });

  // notePath is passed from the code block processor (ctx.sourcePath)

  // Tool and color state (extracted to useToolState hook)
  const {
    currentTool, setCurrentTool,
    selectedObjectType, setSelectedObjectType,
    selectedColor, setSelectedColor,
    selectedOpacity,
    isColorPickerOpen, setIsColorPickerOpen,
    freeformPlacementMode, setFreeformPlacementMode,
    handleOpacityChange
  } = useToolState({ mapData, updateMapData });

  // Panel/modal state (plugin installer, settings modal, layer edit)
  const {
    showSettingsModal, setShowSettingsModal,
    editingLayerId, setEditingLayerId,
    editingLayer,
    handleSettingsClick, handleSettingsSave, handleSettingsClose: panelSettingsClose
  } = usePanelState({ mapData, updateMapData });

  // UI layout state (expand/collapse, panels, focus, footer, layer visibility)
  const {
    containerRef, isFocused, setIsFocused,
    isExpanded, isAnimating, handleToggleExpand,
    showFooter, setShowFooter,
    showVisibilityToolbar, setShowVisibilityToolbar,
    showLayerPanel, setShowLayerPanel,
    showRegionPanel, setShowRegionPanel,
    layerVisibility, handleToggleLayerVisibility
  } = useUILayout({ mapData, updateMapData });

  // Adjacent sub-map visibility: persisted in global plugin settings
  const [showAdjacentSubMaps, setShowAdjacentSubMapsState] = useState(() =>
    getSettings().showAdjacentSubMaps ?? false
  );
  const setShowAdjacentSubMaps = useCallback((v: boolean) => {
    try {
      const plugin = app.plugins.plugins['dungeon-map-tracker-settings'];
      if (plugin != null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (plugin as any).settings.showAdjacentSubMaps = v;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (plugin as any).saveSettings();
        window.dispatchEvent(new Event('dmt-settings-changed'));
      }
    } catch { /* settings plugin unavailable */ }
    setShowAdjacentSubMapsState(v);
  }, []);
  useEffect(() => {
    const handler = (): void => { setShowAdjacentSubMapsState(getSettings().showAdjacentSubMaps ?? false); };
    window.addEventListener('dmt-settings-changed', handler);
    return () => window.removeEventListener('dmt-settings-changed', handler);
  }, []);

  // Tile browser state (hex maps only)
  const {
    tileBrowserCollapsed, setTileBrowserCollapsed,
    selectedTilesetId,
    selectedTileId,
    tileRotation, setTileRotation,
    tileFlipH, setTileFlipH,
    tileLayer, setTileLayer,
    tileFitMode, setTileFitMode,
    stampMode, setStampMode,
    tileScale, setTileScale,
    handleTileSelect, handleTileDeselect,
  } = useTileBrush();
  // Use rootMapData for tileset check — tilesets are built from global settings and stored on root,
  // but sub-maps should also have access to tiles
  const availableTilesets = rootMapData?.tilesets || mapData?.tilesets || [];
  const showTilePanel = mapData?.mapType === 'hex' && availableTilesets.length > 0;

  // Image alignment mode (extracted to useAlignmentMode hook)
  const {
    isAlignmentMode, alignmentOffsetX, alignmentOffsetY,
    returningFromAlignment, setReturningFromAlignment,
    handleOpenAlignmentMode, handleAlignmentOffsetChange,
    handleAlignmentGridSizeChange, handleAlignmentApply, handleAlignmentCancel
  } = useAlignmentMode({ mapData, updateMapData, setShowSettingsModal });

  // Create geometry instance for coordinate conversions
  // Same logic as MapCanvas for consistency
  const geometry = useMemo((): IGeometry | null => {
    if (!mapData) return null;

    const currentMapType = mapData.mapType ?? DEFAULTS.mapType;

    if (currentMapType === 'hex') {
      const hexSize = mapData.hexSize ?? DEFAULTS.hexSize;
      const orientation = mapData.orientation ?? DEFAULTS.hexOrientation;
      const hexBounds = mapData.hexBounds ?? null;
      return new HexGeometry(hexSize, orientation, hexBounds);
    } else {
      const gridSize = mapData.gridSize ?? DEFAULTS.gridSize;
      return new GridGeometry(gridSize);
    }
  }, [mapData?.mapType, mapData?.gridSize, mapData?.hexSize, mapData?.orientation, mapData?.hexBounds]);

  // Fog of War state and handlers (extracted to useFogOfWar hook)
  const {
    showFogTools,
    fogActiveTool,
    currentFogState,
    handleFogToolsToggle,
    handleFogToolSelect,
    handleFogVisibilityToggle,
    handleFogFillAll,
    handleFogClearAll,
    handleFogChange
  } = useFogOfWar({ mapData, geometry, updateMapData });

  // Get current theme with effective settings (global + map overrides)
  // This will be called on every render, fetching fresh settings each time
  const effectiveSettings = mapData ? getEffectiveSettings(mapData.settings) : null;
  const theme: ResolvedTheme = effectiveSettings ? {
    grid: {
      lines: effectiveSettings.gridLineColor,
      lineWidth: effectiveSettings.gridLineWidth,
      background: effectiveSettings.backgroundColor
    },
    cells: {
      fill: getTheme().cells.fill,
      border: effectiveSettings.borderColor,
      borderWidth: getTheme().cells.borderWidth
    },
    compass: getTheme().compass,
    decorativeBorder: getTheme().decorativeBorder,
    coordinateKey: effectiveSettings.coordinateKeyColor
  } as ResolvedTheme : getTheme();

  // Determine canvas height based on device type and settings
  // Detect touch devices using media query match
  const isTouchDevice = useMemo(() => {
    return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  }, []);

  const canvasHeight = effectiveSettings
    ? (isTouchDevice
        ? (effectiveSettings.canvasHeightMobile ?? 400)
        : (effectiveSettings.canvasHeight ?? 600))
    : (isTouchDevice ? 400 : 600);



  // Compose settings close with alignment reset
  const handleSettingsClose = (): void => {
    panelSettingsClose();
    setReturningFromAlignment(false);
  };

  // Layer and history management (extracted to useLayerHistory hook)
  const {
    // Layer management
    handleLayerSelect,
    handleLayerAdd,
    handleLayerDelete,
    handleLayerReorder,
    handleToggleShowLayerBelow,
    handleSetLayerBelowOpacity,
    handleUpdateLayerDisplay,
    handleLayerClone,
    // History state
    canUndo,
    canRedo,
    // History actions
    handleUndo,
    handleRedo,
    // For data change handlers
    addToHistory,
    isApplyingHistory
  } = useLayerHistory({ mapData, updateMapData, isLoading, navigationVersion });

  // Wrap undo to let in-progress operations (e.g. region creation) cancel first
  const wrappedHandleUndo = useCallback(() => {
    const event = new CustomEvent('windrose:before-undo', { cancelable: true });
    document.dispatchEvent(event);
    if (!event.defaultPrevented) {
      handleUndo();
    }
  }, [handleUndo]);

  // Clone layer modal state (Preact fallback only)
  const [cloningLayerId, setCloningLayerId] = useState<string | null>(null);

  const handleCloneLayerRequest = useCallback((layerId: string): void => {
    if (!mapData) return;
    const layer = getLayerById(mapData, layerId);
    if (!layer) return;

    const layerName = layer.name || String(layer.order + 1);
    const opened = openNativeCloneLayerModal({
      app,
      layerName,
      onClone: (mode) => handleLayerClone(layerId, mode),
    });
    if (!opened) {
      setCloningLayerId(layerId);
    }
  }, [mapData, handleLayerClone]);

  // Data change handlers (extracted to useDataHandlers hook)
  const {
    handleNameChange,
    handleCellsChange,
    handleCurvesChange,
    handleObjectsChange,
    handleTextLabelsChange,
    handleEdgesChange,
    handleTilesChange,
    handleAddCustomColor,
    handleDeleteCustomColor,
    handleUpdateColorOpacity,
    handleViewStateChange,
    handleSidebarCollapseChange,
    handleObjectSetChange,
    handleTextLabelSettingsChange,
    handleRegionsChange,
    handleOutlinesChange,
    handleShapeOverlaysChange
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = useDataHandlers({ mapData, updateMapData: updateMapData as any, addToHistory: addToHistory as any, isApplyingHistory });

  // Custom event listeners (sub-hex, deep links, regions, object links, hex context menu)
  useCustomEventHandlers({
    mapData, mapId, geometry, updateMapData,
    handleLayerSelect, enterSubHex, exitSubHex, isInSubHex,
    navigateToSibling,
    handleRegionsChange
  });

  // Player fog clearing on drop (reads latest state via functional updater, supports undo)
  useEffect(() => {
    const handler = (e: CustomEvent): void => {
      if (geometry == null || isApplyingHistory()) return;
      const { objectId } = e.detail;

      updateMapData((current: MapData) => {
        if (current == null) return current;
        const activeLayer = getActiveLayer(current);
        if (activeLayer.fogOfWar?.enabled !== true || (activeLayer.fogOfWar?.foggedCells?.length ?? 0) === 0) return current;

        const obj = activeLayer.objects.find((o: MapObject) => o.id === objectId);
        if (obj == null || obj.isPlayer !== true || obj.lightEnabled !== true || (obj.lightRadius ?? 0) === 0) return current;

        const settings = current.settings?.overrides ?? {};
        const distancePerCell = (settings.distancePerCell as number | undefined) ?? 5;
        const richGeom = geometry as RichGeometry;
        const cellSize = (richGeom.cellSize ?? richGeom.hexSize) ?? 1;
        const radiusInCells = (obj.lightRadius ?? 0) / distancePerCell;
        const radiusInWorld = radiusInCells * cellSize;

        let objWorldX: number, objWorldY: number;
        if (obj.freeform === true && obj.worldPosition != null) {
          objWorldX = obj.worldPosition.x;
          objWorldY = obj.worldPosition.y;
        } else {
          const w = richGeom.getCellCenter(obj.position.x, obj.position.y);
          objWorldX = w.worldX;
          objWorldY = w.worldY;
        }

        const clearRadius = radiusInWorld + cellSize * 0.5;
        const radiusSq = clearRadius * clearRadius;
        const remainingCells = activeLayer.fogOfWar.foggedCells.filter((fc: FoggedCell) => {
          let cellWorldX: number, cellWorldY: number;
          if (richGeom.offsetToWorld != null) {
            const w = richGeom.offsetToWorld(fc.col, fc.row);
            cellWorldX = w.worldX;
            cellWorldY = w.worldY;
          } else {
            cellWorldX = (fc.col + 0.5) * cellSize;
            cellWorldY = (fc.row + 0.5) * cellSize;
          }
          const dx = cellWorldX - objWorldX;
          const dy = cellWorldY - objWorldY;
          return dx * dx + dy * dy > radiusSq;
        });

        if (remainingCells.length >= activeLayer.fogOfWar.foggedCells.length) return current;

        const newFog = { ...activeLayer.fogOfWar, foggedCells: remainingCells };

        addToHistory({
          cells: activeLayer.cells,
          curves: activeLayer.curves,
          name: current.name ?? '',
          objects: activeLayer.objects,
          textLabels: activeLayer.textLabels,
          edges: activeLayer.edges,
          tiles: activeLayer.tiles ?? [],
          regions: current.regions ?? [],
          outlines: current.outlines ?? [],
          shapeOverlays: current.shapeOverlays ?? [],
          fogOfWar: newFog
        });

        const layers = current.layers.map(l =>
          l.id === current.activeLayerId
            ? { ...l, fogOfWar: newFog }
            : l
        );
        return { ...current, layers };
      });
    };

    document.addEventListener('windrose:player-fog-clear', handler as EventListener);
    return () => document.removeEventListener('windrose:player-fog-clear', handler as EventListener);
  }, [geometry, updateMapData, addToHistory, isApplyingHistory]);

  // Adjacent sub-map click-to-navigate
  useEffect((): (() => void) | undefined => {
    if (!showAdjacentSubMaps || !isInSubHex || adjacentSubHexes.length === 0 || !geometry || geometry.type !== 'hex' || !mapData) return undefined;

    const hexGeom = geometry as ExtendedGeometry;
    const maxRing = mapData.hexBounds?.maxRing ?? 7;
    const tileStep = 2 * maxRing + 1;

    const handleAdjacentClick = (e: MouseEvent): void => {
      const canvas = (e.target as HTMLElement).closest('canvas');
      if (canvas == null) return;

      const rect = canvas.getBoundingClientRect();
      const canvasX = (e.clientX - rect.left) * (canvas.width / rect.width);
      const canvasY = (e.clientY - rect.top) * (canvas.height / rect.height);

      const viewState = mapData.viewState;
      if (viewState == null) return;
      const oX = canvas.width / 2 - viewState.center.x * viewState.zoom;
      const oY = canvas.height / 2 - viewState.center.y * viewState.zoom;

      // Convert click to world coords
      const clickWorldX = (canvasX - oX) / viewState.zoom;
      const clickWorldY = (canvasY - oY) / viewState.zoom;

      // Check each adjacent sub-hex: is the click within its grid bounds?
      for (const adj of adjacentSubHexes) {
        const scaledQ = adj.dq * tileStep;
        const scaledR = adj.dr * tileStep;
        if (hexGeom.hexToWorld == null) continue;
        const offset = hexGeom.hexToWorld(scaledQ, scaledR);

        // Click relative to adjacent grid center
        const relX = clickWorldX - offset.worldX;
        const relY = clickWorldY - offset.worldY;

        // Check if within maxRing hex radius (approximate with world-space distance)
        const hexSize = hexGeom.hexSize ?? 1;
        const gridRadius = hexSize * Math.sqrt(3) * maxRing;
        if (relX * relX + relY * relY < gridRadius * gridRadius) {
          // Parse the hex key to get absolute q, r
          const [aq, ar] = adj.hexKey.split(',').map(Number);
          document.dispatchEvent(new CustomEvent('windrose:navigate-sibling-sub-hex', { detail: { q: aq, r: ar } }));
          e.stopPropagation();
          e.preventDefault();
          return;
        }
      }
    };

    document.addEventListener('click', handleAdjacentClick, true);
    return () => document.removeEventListener('click', handleAdjacentClick, true);
  }, [showAdjacentSubMaps, isInSubHex, adjacentSubHexes, geometry, mapData]);

  // View controls (zoom, compass)
  const { handleZoomIn, handleZoomOut, handleCompassClick } = useViewControls({
    mapData, updateMapData, handleViewStateChange
  });

  // Global keyboard shortcuts: layer nav, undo/redo
  useEffect((): (() => void) | undefined => {
    if (!isFocused || !mapData) return undefined;

    const handler = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key;
      const mod = e.ctrlKey || e.metaKey;

      const shortcuts = getSettings().keyboardShortcuts ?? {};
      const bareKey = (s: string): string => { const parts = s.split('+'); return (parts[parts.length - 1] ?? s).toLowerCase(); };

      if (mod && !e.shiftKey && key.toLowerCase() === bareKey(shortcuts.undo ?? 'z')) {
        wrappedHandleUndo(); e.preventDefault(); return;
      }
      if (mod && key.toLowerCase() === bareKey(shortcuts.redo ?? 'y')) {
        handleRedo(); e.preventDefault(); return;
      }
      if (mod && e.shiftKey && key.toLowerCase() === 'z') {
        handleRedo(); e.preventDefault(); return;
      }

      if (mod || e.altKey) return;

      const layerPrevKey = shortcuts.layerPrev ?? '[';
      const layerNextKey = shortcuts.layerNext ?? ']';

      if (key === layerPrevKey || key === layerNextKey) {
        const layers = mapData.layers;
        const currentIdx = layers.findIndex((l: { id: string }) => l.id === mapData.activeLayerId);
        if (key === layerPrevKey && currentIdx > 0) {
          handleLayerSelect(layers[currentIdx - 1].id);
          e.preventDefault();
        } else if (key === layerNextKey && currentIdx < layers.length - 1) {
          handleLayerSelect(layers[currentIdx + 1].id);
          e.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isFocused, mapData, wrappedHandleUndo, handleRedo, handleLayerSelect]);

  // MCP bridge: each map instance registers its own state + operations keyed by notePath.
  // No race conditions — the query side picks the active file's state.
  useEffect(() => {
    if (window.__windrose == null || mapData == null || notePath === '' || geometry == null) return;
    if (window.__windrose.mcpInstances == null) window.__windrose.mcpInstances = {};

    const activeLayer = getActiveLayer(mapData);
    const layers = mapData.layers;
    window.__windrose.mcpInstances[notePath] = {
      mapId,
      mapName: mapData.name ?? mapName,
      mapType: mapData.mapType ?? 'grid',
      viewState: {
        x: mapData.viewState?.offsetX ?? 0,
        y: mapData.viewState?.offsetY ?? 0,
        zoom: mapData.viewState?.zoom ?? 1,
      },
      activeLayerId: activeLayer?.id ?? '',
      layerCount: layers.length,
      layerIds: layers.map((l: { id: string }) => l.id),
      currentTool,
      selectedColor,
      selectedOpacity,
      canUndo,
      canRedo,
      saveStatus,
      isExpanded,
      dataFilePath: 'windrose-md-data.json',
      notePath,
      timestamp: Date.now(),
      ops: {
        setTool: (toolId: string) => setCurrentTool(toolId as ToolId),
        setColor: (color: string) => setSelectedColor(color),
        setOpacity: (opacity: number) => handleOpacityChange(opacity),
        paintCell: (x: number, y: number, color?: string, opacity?: number): boolean => {
          if (activeLayer == null) return false;
          const c = color ?? selectedColor;
          const o = opacity ?? selectedOpacity;
          const newCells = accessorSetCell(activeLayer.cells, { x, y }, c, o, geometry);
          handleCellsChange(newCells);
          return true;
        },
        paintCells: (cells: Array<{ x: number; y: number; color?: string; opacity?: number }>): number => {
          if (activeLayer == null) return 0;
          let currentCells = activeLayer.cells;
          for (const cell of cells) {
            const c = cell.color ?? selectedColor;
            const o = cell.opacity ?? selectedOpacity;
            currentCells = accessorSetCell(currentCells, { x: cell.x, y: cell.y }, c, o, geometry);
          }
          handleCellsChange(currentCells);
          return cells.length;
        },
        eraseCell: (x: number, y: number): boolean => {
          if (activeLayer == null) return false;
          const newCells = accessorRemoveCell(activeLayer.cells, { x, y }, geometry);
          handleCellsChange(newCells);
          return true;
        },
        getCells: (): Array<{ x: number; y: number; color: string; opacity: number }> => {
          if (activeLayer == null) return [];
          return activeLayer.cells.map((cell: Cell) => ({
            ...cellToPoint(cell),
            color: cell.color,
            opacity: cell.opacity ?? 1,
          }));
        },
        undo: (): boolean => { wrappedHandleUndo(); return true; },
        redo: (): boolean => { handleRedo(); return true; },
        selectLayer: (layerId: string) => handleLayerSelect(layerId),
        forceSave: () => forceSave(),
      },
    };
  });
  useEffect(() => {
    return () => {
      if (window.__windrose?.mcpInstances != null) delete window.__windrose.mcpInstances[notePath];
    };
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div className="dmt-loading">
        Loading map...
      </div>
    );
  }

  if (!mapData) {
    return <div className="dmt-loading">Loading map...</div>;
  }

  // Get color display name
  const getColorDisplayName = (): string => {
    if (isDefaultColor(selectedColor)) return 'Default';
    const colorDef = getColorByHex(selectedColor);
    return colorDef ? colorDef.label : selectedColor;
  };

  // Main render
  return (
    <>
      <div
        ref={containerRef}
        className={`dmt-container interactive-child`}
      >
        {/* Decorative corner brackets */}
        <CornerBracket position="tl" />
        <CornerBracket position="tr" />
        <CornerBracket position="bl" />
        <CornerBracket position="br" />

        <MapHeader
          mapData={mapData}
          onNameChange={handleNameChange}
          saveStatus={saveStatus}
          showFooter={showFooter}
          onToggleFooter={() => setShowFooter(!showFooter)}
        />

        {isInSubHex && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <SubHexBreadcrumb
              breadcrumbs={breadcrumbs}
              onNavigate={navigateToLevel}
            />
            {adjacentSubHexes.length > 0 && (
              <button
                onClick={() => setShowAdjacentSubMaps(!showAdjacentSubMaps)}
                title={showAdjacentSubMaps ? 'Hide adjacent sub-maps' : 'Show adjacent sub-maps'}
                style={{
                  padding: '2px 8px',
                  fontSize: '11px',
                  background: showAdjacentSubMaps ? 'var(--interactive-accent)' : 'var(--background-secondary)',
                  color: showAdjacentSubMaps ? 'var(--text-on-accent)' : 'var(--text-muted)',
                  border: '1px solid var(--background-modifier-border)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                <Icon icon="lucide-layers" />
              </button>
            )}
          </div>
        )}

        <ToolPalette
          currentTool={currentTool}
          onToolChange={setCurrentTool}
          onUndo={wrappedHandleUndo}
          onRedo={handleRedo}
          canUndo={canUndo}
          canRedo={canRedo}
          selectedColor={selectedColor}
          onColorChange={setSelectedColor}
          selectedOpacity={selectedOpacity}
          onOpacityChange={handleOpacityChange}
          isColorPickerOpen={isColorPickerOpen}
          onColorPickerOpenChange={setIsColorPickerOpen}
          customColors={mapData.customColors ?? []}
          paletteColorOpacityOverrides={mapData.paletteColorOpacityOverrides || {}}
          onAddCustomColor={handleAddCustomColor}
          onDeleteCustomColor={handleDeleteCustomColor}
          onUpdateColorOpacity={handleUpdateColorOpacity}
          mapType={mapData.mapType}
          isFocused={isFocused}
        />

        <VisibilityToolbar
          isOpen={showVisibilityToolbar}
          layerVisibility={layerVisibility}
          onToggleLayer={handleToggleLayerVisibility}
          mapType={mapData.mapType}
          showFogTools={showFogTools}
          onFogToolsToggle={handleFogToolsToggle}
        />

        <FogOfWarToolbar
          isOpen={showFogTools && showVisibilityToolbar}
          fogOfWarState={currentFogState}
          onFogToolSelect={handleFogToolSelect as unknown as (tool: FogTool) => void}
          onFogVisibilityToggle={handleFogVisibilityToggle}
          onFogFillAll={handleFogFillAll}
          onFogClearAll={handleFogClearAll}
        />

        <div
          className="dmt-canvas-wrapper"
          style={{ height: `${canvasHeight}px` }}
          onMouseEnter={() => setIsFocused(true)}
          onMouseLeave={() => setIsFocused(false)}
        >
          <ObjectSidebar
            selectedObjectType={selectedObjectType}
            onObjectTypeSelect={setSelectedObjectType}
            onToolChange={(tool) => setCurrentTool(tool as ToolId)}
            isCollapsed={mapData.sidebarCollapsed ?? false}
            onCollapseChange={handleSidebarCollapseChange}
            mapType={mapData.mapType ?? 'grid'}
            objectSetId={mapData.objectSetId}
            onObjectSetChange={handleObjectSetChange}
            isFreeformMode={freeformPlacementMode}
            onFreeformToggle={() => setFreeformPlacementMode(prev => !prev)}
          />

          {/* Left side panels container — layers + regions stacked */}
          <div className={`dmt-left-panels ${mapData.sidebarCollapsed === true ? 'sidebar-closed' : 'sidebar-open'}`}>
            {/* Layer Controls Panel (Z-Layer System) */}
            <LayerControls
              mapData={mapData}
              onLayerSelect={handleLayerSelect}
              onLayerAdd={handleLayerAdd}
              onLayerDelete={handleLayerDelete}
              onLayerReorder={handleLayerReorder}
              onToggleShowLayerBelow={handleToggleShowLayerBelow}
              onSetLayerBelowOpacity={handleSetLayerBelowOpacity}
              onEditLayer={setEditingLayerId}
              onLayerClone={handleCloneLayerRequest}
              sidebarCollapsed={mapData.sidebarCollapsed ?? false}
              isOpen={showLayerPanel}
            />

            {/* Region Panel (hex maps only) */}
            {mapData.mapType === 'hex' && (
              <RegionPanel
                regions={mapData.regions ?? []}
                onRegionsChange={handleRegionsChange}
                sidebarCollapsed={mapData.sidebarCollapsed ?? false}
                isOpen={showRegionPanel}
              />
            )}
          </div>

          {/* For hex maps, override northDirection to 0 for rendering while keeping real value for compass display */}
          {/* This allows the compass to show and persist the north direction without actually rotating hex maps */}
          <div className="dmt-canvas-and-controls">
            <MapCanvas
              mapId={mapId}
              notePath={notePath}
              mapData={mapData.mapType === 'hex' ? { ...mapData, northDirection: 0, tilesets: availableTilesets.length > 0 ? availableTilesets : mapData.tilesets } as MapData : mapData}
              onCellsChange={handleCellsChange}
              onCurvesChange={handleCurvesChange}
              onObjectsChange={handleObjectsChange}
              onTextLabelsChange={handleTextLabelsChange}
              onEdgesChange={handleEdgesChange}
              onTilesChange={handleTilesChange}
              tileImagesReady={tileImagesReady}
              onViewStateChange={handleViewStateChange}
              onTextLabelSettingsChange={handleTextLabelSettingsChange}
              currentTool={currentTool}
              isAlignmentMode={isAlignmentMode}
              selectedObjectType={selectedObjectType ?? undefined}
              selectedColor={selectedColor}
              isColorPickerOpen={isColorPickerOpen}
              customColors={(mapData.customColors ?? []).map((c: CustomColor) => c.color)}
              onAddCustomColor={handleAddCustomColor}
              onDeleteCustomColor={handleDeleteCustomColor}
              isFocused={isFocused}
              isAnimating={isAnimating}
              theme={theme}
              layerVisibility={layerVisibility as unknown as LayerVisibility}
              adjacentSubHexes={showAdjacentSubMaps && isInSubHex ? adjacentSubHexes : null}
            >
              {/* DrawingLayer - handles all drawing tools */}
              <MapCanvas.DrawingLayer
                currentTool={currentTool}
                selectedColor={selectedColor}
                selectedOpacity={selectedOpacity}
              />

              {/* FreehandLayer - handles freehand curve drawing */}
              <MapCanvas.FreehandLayer
                currentTool={currentTool}
                selectedColor={selectedColor}
                selectedOpacity={selectedOpacity}
              />

              {/* ObjectLayer - handles object placement and interactions */}
              <MapCanvas.ObjectLayer
                currentTool={currentTool}
                selectedObjectType={selectedObjectType}
                onObjectsChange={handleObjectsChange}
                customColors={mapData.customColors ?? []}
                onAddCustomColor={handleAddCustomColor}
                onDeleteCustomColor={handleDeleteCustomColor}
                freeformPlacementMode={freeformPlacementMode}
              />

              {/* AreaSelectLayer - handles area selection tool for multi-select */}
              <MapCanvas.AreaSelectLayer
                currentTool={currentTool}
              />

              {/* TextLayer - handles text label interactions */}
              <MapCanvas.TextLayer
                currentTool={currentTool}
                customColors={mapData.customColors ?? []}
                onAddCustomColor={handleAddCustomColor}
                onDeleteCustomColor={handleDeleteCustomColor}
              />

              {/* NotePinLayer - handles note pin placement */}
              <MapCanvas.NotePinLayer
                currentTool={currentTool}
                selectedObjectType={selectedObjectType}
              />

              {/* FogOfWarLayer - handles fog painting/erasing interactions */}
              {fogActiveTool && (
                <MapCanvas.FogOfWarLayer
                  activeTool={fogActiveTool}
                  onFogChange={handleFogChange}
                  onInitializeFog={((updatedMapData: MapData) => updateMapData(updatedMapData)) as unknown as () => void}
                />
              )}

              {/* TilePlacementLayer - hex tile placement */}
              <MapCanvas.TilePlacementLayer
                currentTool={currentTool}
                selectedTilesetId={selectedTilesetId}
                selectedTileId={selectedTileId}
                tileRotation={tileRotation}
                tileFlipH={tileFlipH}
                tileLayer={tileLayer}
                tileFitMode={tileFitMode}
                stampMode={stampMode}
                tileScale={tileScale}
                onTilesChange={handleTilesChange}
              />

              {/* RegionLayer - hex region creation and editing */}
              <MapCanvas.RegionLayer
                currentTool={currentTool}
                selectedColor={selectedColor}
                selectedOpacity={selectedOpacity}
                onRegionsChange={handleRegionsChange}
              />

              {/* OutlineLayer - polygon outline drawing and editing */}
              <MapCanvas.OutlineLayer
                currentTool={currentTool}
                selectedColor={selectedColor}
                onColorChange={setSelectedColor}
                onOutlinesChange={handleOutlinesChange}
              />

              {/* ShapeOverlayLayer - square/circle shape overlay placement */}
              <MapCanvas.ShapeOverlayLayer
                currentTool={currentTool}
                selectedColor={selectedColor}
                selectedOpacity={selectedOpacity}
                onShapeOverlaysChange={handleShapeOverlaysChange}
              />

              {/* HexCoordinateLayer - displays coordinate labels when 'C' key is held */}
              <MapCanvas.HexCoordinateLayer />

              {/* MeasurementLayer - distance measurement tool overlay */}
              <MapCanvas.MeasurementLayer
                currentTool={currentTool}
                globalSettings={effectiveSettings ?? undefined}
                mapDistanceOverrides={mapData?.settings?.distanceSettings}
              />

              {/* DiagonalFillOverlay - diagonal fill tool preview */}
              <MapCanvas.DiagonalFillOverlay
                currentTool={currentTool}
              />

              {/* Re-roll button for generated dungeons */}
              <MapCanvas.RerollDungeonButton />
            </MapCanvas>

            <MapControls
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onCompassClick={handleCompassClick}
              onSettingsClick={handleSettingsClick}
              northDirection={mapData.northDirection ?? 0}
              currentZoom={mapData.viewState?.zoom ?? 1}
              isExpanded={isExpanded}
              onToggleExpand={handleToggleExpand}
              mapType={mapData.mapType}
              showLayerPanel={showLayerPanel}
              onToggleLayerPanel={() => setShowLayerPanel(!showLayerPanel)}
              showRegionPanel={showRegionPanel}
              onToggleRegionPanel={mapData.mapType === 'hex' ? () => setShowRegionPanel(!showRegionPanel) : undefined}
              showVisibilityToolbar={showVisibilityToolbar}
              onToggleVisibilityToolbar={() => {
                const closing = showVisibilityToolbar;
                setShowVisibilityToolbar(!showVisibilityToolbar);
                if (closing && showFogTools) handleFogToolsToggle();
              }}
              alwaysShowControls={effectiveSettings?.alwaysShowControls ?? false}
            />
          </div>

          {/* Tile Asset Browser (right sidebar, hex maps with tilesets only) */}
          {showTilePanel && (
            <TileAssetBrowser
              tilesets={availableTilesets}
              selectedTilesetId={selectedTilesetId}
              selectedTileId={selectedTileId}
              onTileSelect={handleTileSelect}
              onTileDeselect={handleTileDeselect}
              onToolChange={setCurrentTool as unknown as (tool: string) => void}
              isCollapsed={tileBrowserCollapsed}
              onCollapseChange={setTileBrowserCollapsed}
              rotation={tileRotation}
              flipH={tileFlipH}
              onRotationChange={setTileRotation}
              onFlipChange={setTileFlipH}
              tileLayer={tileLayer}
              onTileLayerChange={setTileLayer}
              tileFitMode={tileFitMode}
              onTileFitModeChange={setTileFitMode}
              stampMode={stampMode}
              onStampModeChange={setStampMode}
              tileScale={tileScale}
              onTileScaleChange={setTileScale}
              getCachedImage={getCachedImage}
              tilesetOverrides={mapData?.tilesetOverrides}
              onTilesetOverrideChange={(tilesetId: string, overrides: TilesetOverrides) => {
                updateMapData((prev: MapData) => ({
                  ...prev,
                  tilesetOverrides: { ...prev.tilesetOverrides, [tilesetId]: overrides },
                }));
              }}
            />
          )}
        </div>

        {showFooter && (
          <div className="dmt-footer">
            Map ID: {mapId} | Color: {getColorDisplayName()} | {
              currentTool === 'select' ? 'Click to select text/objects | Drag to move | Press R to rotate | Press Delete to remove' :
                currentTool === 'draw' ? 'Click/drag to draw' :
                  currentTool === 'erase' ? 'Click/drag to erase (text first, then objects, then cells)' :
                    currentTool === 'rectangle' ? 'Click two corners to fill rectangle' :
                      currentTool === 'circle' ? 'Click edge point, then center to fill circle' :
                        currentTool === 'clearArea' ? 'Click two corners to clear area' :
                          currentTool === 'addObject' ? (selectedObjectType != null && selectedObjectType !== '' ? 'Click to place object' : 'Select an object from the sidebar') :
                            currentTool === 'addNote' ? 'Click to place note pin' :
                            currentTool === 'addText' ? 'Click to add text label' :
                              'Select a tool'
            } | Undo/redo available | Middle-click or two-finger drag to pan | Scroll to zoom | Click compass to rotate | {getActiveLayer(mapData).cells.length} cells filled | {getActiveLayer(mapData).objects.length} objects placed | {getActiveLayer(mapData).textLabels.length} text labels
          </div>
        )}

        {/* Map Settings Modal */}
        <MapSettingsModal
          isOpen={showSettingsModal}
          onCancel={handleSettingsClose}
          onSave={handleSettingsSave}
          onOpenAlignmentMode={handleOpenAlignmentMode}
          initialTab={returningFromAlignment ? (mapData?.mapType === 'hex' ? 'hexgrid' : 'gridbackground') : undefined}
          mapType={mapData?.mapType ?? 'grid'}
          orientation={mapData?.orientation ?? 'flat'}
          currentSettings={mapData.settings}
          currentPreferences={mapData.uiPreferences}
          currentHexBounds={mapData.mapType === 'hex' ? mapData.hexBounds : null}
          currentObjectSetId={mapData.objectSetId}
          currentBackgroundImage={mapData.backgroundImage ?? null}
          currentCells={mapData.mapType === 'hex' ? getActiveLayer(mapData).cells : []}
          currentObjects={mapData.mapType === 'hex' ? getActiveLayer(mapData).objects : []}
          mapData={mapData}
          geometry={geometry}
          isInSubHex={isInSubHex}
          subMapName={isInSubHex ? (mapData?.name ?? undefined) : undefined}
        />

        {/* Image Alignment Mode */}
        {isAlignmentMode && mapData.backgroundImage?.path != null && mapData.backgroundImage.path !== '' && (
          <ImageAlignmentMode
            isActive={isAlignmentMode}
            offsetX={alignmentOffsetX}
            offsetY={alignmentOffsetY}
            onOffsetChange={handleAlignmentOffsetChange}
            onApply={handleAlignmentApply}
            onCancel={handleAlignmentCancel}
            gridSize={mapData.backgroundImage?.imageGridSize}
            onGridSizeChange={mapData.mapType === 'grid' ? handleAlignmentGridSizeChange : undefined}
          />
        )}

        
        {editingLayer && (
          <ModalPortal>
            <LayerEditModal
              layer={editingLayer}
              defaultName={String(editingLayer.order + 1)}
              onSave={(name, icon) => {
                if (editingLayerId != null) {
                  handleUpdateLayerDisplay(editingLayerId, name, icon);
                }
                setEditingLayerId(null);
              }}
              onCancel={() => setEditingLayerId(null)}
            />
          </ModalPortal>
        )}

        {cloningLayerId != null && cloningLayerId !== '' && (() => {
          const layer = getLayerById(mapData, cloningLayerId);
          if (layer == null) return null;
          const layerName = layer.name ?? String(layer.order + 1);
          return (
            <ModalPortal>
              <CloneLayerModal
                layerName={layerName}
                onClone={(mode) => {
                  handleLayerClone(cloningLayerId, mode);
                  setCloningLayerId(null);
                }}
                onCancel={() => setCloningLayerId(null)}
              />
            </ModalPortal>
          );
        })()}
      </div>
    </>
  );
};

// ============================================================================
// EXPORTS
// ============================================================================

export { DungeonMapTracker };
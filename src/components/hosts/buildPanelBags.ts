// buildPanelBags.ts - Builds the per-panel prop bags (see panelBags.ts) from
// the root component's hook results. Called once per render after the early
// returns; values keep the identities the hooks give them, so memo()'d panels
// (TileAssetBrowser) still skip when nothing they use changed.

import type { MapData } from '#types/index';
import type { TilesetDef, TileLayerRole } from '#types/tiles/tile.types';
import type { WindroseFeature } from '#types/settings/settings.types';
import { DEFAULT_COLOR } from '../shared/ColorPicker';
import type { useToolState } from '../../hooks/state/useToolState';
import type { useLayerHistory } from '../../hooks/state/useLayerHistory';
import type { useDataHandlers } from '../../hooks/state/useDataHandlers';
import type { useFogOfWar } from '../../hooks/interactions/useFogOfWar';
import type { useTileBrush } from '../../hooks/state/useTileBrush';
import type { useUILayout } from '../../hooks/state/useUILayout';
import type { BoardHandlers } from '../../hooks/app/useBoardHandlers';
import type { TileDrawerState } from '../../hooks/app/useTileDrawerState';
import type { TileFlyouts } from '../../hooks/app/useTileFlyouts';
import type { TilesetArtHandlers } from '../../hooks/app/useTilesetArtHandlers';
import type { PanelBags } from './panelBags';

interface PanelBagSources {
  mapData: MapData;
  tool: ReturnType<typeof useToolState>;
  layerHistory: ReturnType<typeof useLayerHistory>;
  data: ReturnType<typeof useDataHandlers>;
  fog: ReturnType<typeof useFogOfWar>;
  tileBrush: ReturnType<typeof useTileBrush>;
  uiLayout: Pick<ReturnType<typeof useUILayout>, 'layerVisibility' | 'handleToggleLayerVisibility' | 'isFocused'>;
  boards: BoardHandlers;
  drawer: TileDrawerState;
  flyouts: TileFlyouts;
  art: TilesetArtHandlers;
  featureFlags: Record<WindroseFeature, boolean>;
  availableTilesets: TilesetDef[];
  getCachedImage: (path: string) => HTMLImageElement | null;
  onEditLayer: (layerId: string | null) => void;
  onLayerClone: (layerId: string) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onUndo: () => void;
  onTileDepthChange: (depth: TileLayerRole) => void;
  collapseTileBrowser: () => void;
  expandTileBrowser: () => void;
}

function buildPanelBags(src: PanelBagSources): PanelBags {
  const { mapData, tool, layerHistory: lh, data, fog, tileBrush: tb, uiLayout, boards, drawer, flyouts, art } = src;
  return {
    layerList: {
      mapData,
      onLayerSelect: lh.handleLayerSelect,
      onLayerAdd: lh.handleLayerAdd,
      onLayerDelete: lh.handleLayerDelete,
      onLayerReorder: lh.handleLayerReorder,
      onToggleShowLayerBelow: lh.handleToggleShowLayerBelow,
      onSetLayerBelowOpacity: lh.handleSetLayerBelowOpacity,
      onEditLayer: src.onEditLayer,
      onLayerClone: src.onLayerClone,
      onToggleStrataMode: boards.handleToggleStrataMode,
      onBoardAdd: boards.handleBoardAdd,
      onBoardSelect: boards.handleBoardSelect,
      onBoardDelete: boards.handleBoardDelete,
      onAddLayerToStratum: boards.handleAddLayerToStratum,
      onToggleLayerVisible: boards.handleToggleLayerVisible,
      onToggleShowBoardBelow: boards.handleToggleShowBoardBelow,
      onSetBoardBelowOpacity: boards.handleSetBoardBelowOpacity,
    },
    colorPicker: {
      isOpen: true,
      floatingMode: true,
      selectedColor: tool.selectedColor,
      onColorSelect: tool.setSelectedColor,
      onClose: () => {},
      onReset: () => tool.setSelectedColor(DEFAULT_COLOR),
      customColors: mapData.customColors ?? [],
      paletteColorOpacityOverrides: mapData.paletteColorOpacityOverrides ?? {},
      onAddCustomColor: data.handleAddCustomColor,
      onDeleteCustomColor: data.handleDeleteCustomColor,
      onUpdateColorOpacity: data.handleUpdateColorOpacity,
      opacity: tool.selectedOpacity,
      onOpacityChange: tool.handleOpacityChange,
    },
    viewPanel: {
      currentZoom: mapData.viewState?.zoom ?? 1,
      onZoomIn: src.onZoomIn,
      onZoomOut: src.onZoomOut,
      layerVisibility: uiLayout.layerVisibility,
      onToggleLayer: uiLayout.handleToggleLayerVisibility,
      mapType: mapData.mapType,
      fogOfWarState: fog.currentFogState,
      onFogToolSelect: fog.handleFogToolSelect,
      onFogVisibilityToggle: fog.handleFogVisibilityToggle,
      onFogFillAll: fog.handleFogFillAll,
      onFogClearAll: fog.handleFogClearAll,
    },
    tileBrowser: {
      tilesets: src.availableTilesets,
      selectedTilesetId: tb.selectedTilesetId,
      selectedTileId: tb.selectedTileId,
      onTileSelect: tb.handleTileSelect,
      onTileDeselect: tb.handleTileDeselect,
      onToolChange: tool.setCurrentTool,
      onCollapse: src.collapseTileBrowser,
      rotation: tb.tileRotation,
      flipH: tb.tileFlipH,
      onRotationChange: tb.setTileRotation,
      onFlipChange: tb.setTileFlipH,
      tileDepth: tb.tileDepth,
      onTileDepthChange: src.onTileDepthChange,
      hidden: tb.hiddenLayers,
      onToggleHide: tb.toggleHiddenLayer,
      mapType: mapData.mapType,
      tileFitMode: tb.tileFitMode,
      onTileFitModeChange: tb.setTileFitMode,
      activeSubtool: tb.tileSubtool,
      onSubtoolChange: tb.setTileSubtool,
      wallSurface: drawer.wallSurface,
      tileScale: tb.tileScale,
      onTileScaleChange: tb.setTileScale,
      brushSize: tb.brushSize,
      onBrushSizeChange: tb.setBrushSize,
      brushSoftness: tb.brushSoftness,
      onBrushSoftnessChange: tb.setBrushSoftness,
      paintEdgeBlend: tb.paintEdgeBlend,
      onPaintEdgeBlendChange: tb.setPaintEdgeBlend,
      getCachedImage: src.getCachedImage,
      tilesetOverrides: mapData.tilesetOverrides,
      onTilesetOverrideChange: art.handleTilesetOverrideChange,
      onTilesetArtOffsetChange: art.handleTilesetArtOffsetChange,
      onTilesetArtScaleChange: art.handleTilesetArtScaleChange,
      active: !tb.tileBrowserCollapsed,
      recentTiles: tb.recentTiles,
      onStarredChange: flyouts.setStarredFlyoutTiles,
      onSelectedFormChange: tb.setSelectedTileForm,
      railSel: drawer.tileRailSel,
      onRailSelChange: drawer.setTileRailSel,
      viewMode: drawer.tileViewMode,
      onViewModeChange: drawer.setTileViewMode,
    },
    objectsPane: {
      selectedObjectType: tool.selectedObjectType,
      onObjectTypeSelect: tool.setSelectedObjectType,
      onToolChange: tool.setCurrentTool,
      mapType: mapData.mapType ?? 'grid',
      objectSetId: mapData.objectSetId,
      onObjectSetChange: data.handleObjectSetChange,
      isFreeformMode: tool.freeformPlacementMode,
      onFreeformToggle: () => tool.setFreeformPlacementMode(prev => !prev),
      viewMode: drawer.objectViewMode,
      onViewModeChange: drawer.setObjectViewMode,
      onCollapse: src.collapseTileBrowser,
    },
    drawer: {
      open: !tb.tileBrowserCollapsed,
      onCollapse: src.collapseTileBrowser,
      onExpand: src.expandTileBrowser,
      depth: tb.tileDepth,
      onDepthChange: src.onTileDepthChange,
      hidden: tb.hiddenLayers,
      onToggleHide: tb.toggleHiddenLayer,
      flyoutRecent: flyouts.flyoutRecent,
      flyoutStarred: flyouts.starredFlyoutTiles,
      onFlyoutSelect: flyouts.handleFlyoutSelect,
      pane: drawer.tilePane,
      onPane: drawer.selectPane,
      tilesEnabled: src.featureFlags.tiles,
    },
    toolPalette: {
      currentTool: tool.currentTool,
      onToolChange: tool.setCurrentTool,
      onUndo: src.onUndo,
      onRedo: lh.handleRedo,
      canUndo: lh.canUndo,
      canRedo: lh.canRedo,
      mapType: mapData.mapType,
      isFocused: uiLayout.isFocused,
      fogArmed: fog.fogActiveTool != null,
    },
  };
}

export { buildPanelBags };


// MapCanvasLayers.tsx - The interaction/overlay layer children of MapCanvas
// (drawing, freehand, objects, text, pins, fog, tiles, terrain brush, walls,
// regions, outlines, shapes, weather and its Sky, Beacon, routes, measure,
// diagonal fill, reroll).
// Rendered as MapCanvas children; every layer reads the map through context.

import type { VNode, ComponentProps } from 'preact';
import type { MapData } from '#types/index';
import type { ToolId } from '#types/tools/tool.types';
import type { MapDataUpdater } from '#types/hooks/mapData.types';
import type { WallToolSurface } from '#types/core/wallpath.types';
import { MapCanvas } from '../mapcanvas/MapCanvas';
import type { useDataHandlers } from '../../hooks/state/useDataHandlers';
import type { useFogOfWar } from '../../hooks/interactions/useFogOfWar';
import type { useTileBrush } from '../../hooks/state/useTileBrush';

type DataHandlers = ReturnType<typeof useDataHandlers>;
type FogOfWar = ReturnType<typeof useFogOfWar>;
type TileBrush = ReturnType<typeof useTileBrush>;

interface MapCanvasLayersProps {
  currentTool: ToolId;
  selectedColor: string;
  selectedOpacity: number;
  onColorChange: (color: string) => void;
  selectedObjectType: string | null;
  freeformPlacementMode: boolean;
  customColors: NonNullable<MapData['customColors']>;
  distanceOverrides: ComponentProps<typeof MapCanvas.DrawingLayer>['mapDistanceOverrides'];
  globalSettings: ComponentProps<typeof MapCanvas.MeasurementLayer>['globalSettings'];
  data: DataHandlers;
  fogActiveTool: FogOfWar['fogActiveTool'];
  onFogChange: FogOfWar['handleFogChange'];
  updateMapData: MapDataUpdater;
  tileBrush: TileBrush;
  onWallDragStateChange: (id: string | null) => void;
  onWallSurfaceChange: (surface: WallToolSurface | null) => void;
  bareThresholdArmed: boolean;
  onDisarmOpening: () => void;
  showSavedRoutes: boolean;
  /** Weather overlay over weather-bound regions (visibility toolbar toggle) */
  showWeather: boolean;
  showRerollButton: boolean;
}

const MapCanvasLayers = ({
  currentTool, selectedColor, selectedOpacity, onColorChange, selectedObjectType, freeformPlacementMode,
  customColors, distanceOverrides, globalSettings, data, fogActiveTool, onFogChange, updateMapData,
  tileBrush, onWallDragStateChange, onWallSurfaceChange, bareThresholdArmed, onDisarmOpening,
  showSavedRoutes, showWeather, showRerollButton,
}: MapCanvasLayersProps): VNode => {
  const { selectedTilesetId, selectedTileId, tileSubtool, tileScale, brushSize, tileDepth } = tileBrush;
  return (
    <>
      {/* DrawingLayer - handles all drawing tools */}
      <MapCanvas.DrawingLayer
        currentTool={currentTool}
        selectedColor={selectedColor}
        selectedOpacity={selectedOpacity}
        mapDistanceOverrides={distanceOverrides}
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
        onObjectsChange={data.handleObjectsChange}
        customColors={customColors}
        onAddCustomColor={data.handleAddCustomColor}
        onDeleteCustomColor={data.handleDeleteCustomColor}
        freeformPlacementMode={freeformPlacementMode}
      />

      {/* AreaSelectLayer - handles area selection tool for multi-select */}
      <MapCanvas.AreaSelectLayer currentTool={currentTool} />

      {/* TextLayer - handles text label interactions */}
      <MapCanvas.TextLayer
        currentTool={currentTool}
        customColors={customColors}
        onAddCustomColor={data.handleAddCustomColor}
        onDeleteCustomColor={data.handleDeleteCustomColor}
      />

      {/* NotePinLayer - handles note pin placement */}
      <MapCanvas.NotePinLayer currentTool={currentTool} selectedObjectType={selectedObjectType} />

      {/* FogOfWarLayer - handles fog painting/erasing interactions */}
      {fogActiveTool && (
        <MapCanvas.FogOfWarLayer
          activeTool={fogActiveTool}
          onFogChange={onFogChange}
          onInitializeFog={(updatedMapData) => updateMapData(updatedMapData)}
        />
      )}

      {/* TilePlacementLayer - hex tile placement */}
      <MapCanvas.TilePlacementLayer
        currentTool={currentTool}
        selectedTilesetId={selectedTilesetId}
        selectedTileId={selectedTileId}
        tileRotation={tileBrush.tileRotation}
        tileFlipH={tileBrush.tileFlipH}
        tileFitMode={tileBrush.tileFitMode}
        activeSubtool={tileSubtool}
        tileScale={tileScale}
        brushSize={brushSize}
        paintEdgeBlend={tileBrush.paintEdgeBlend}
        tileDepth={tileDepth}
        onTilesChange={data.handleTilesChange}
      />

      {/* TerrainBrushLayer - world-space soft terrain brush ('brush' subtool) */}
      <MapCanvas.TerrainBrushLayer
        currentTool={currentTool}
        activeSubtool={tileSubtool}
        selectedTilesetId={selectedTilesetId}
        selectedTileId={selectedTileId}
        brushSize={brushSize}
        brushSoftness={tileBrush.brushSoftness}
        tileDepth={tileDepth}
        onTerrainStrokesChange={data.handleTerrainStrokesChange}
      />

      {/* WallLayer - wall/path strip drawing along polylines */}
      <MapCanvas.WallLayer
        currentTool={currentTool}
        selectedTilesetId={selectedTilesetId}
        selectedTileId={selectedTileId}
        onWallPathsChange={data.handleWallPathsChange}
        onDragStateChange={onWallDragStateChange}
        onSurfaceChange={onWallSurfaceChange}
        bareThresholdArmed={bareThresholdArmed}
        onDisarmOpening={onDisarmOpening}
        tileScale={tileScale}
      />

      {/* RegionLayer - hex region creation and editing */}
      <MapCanvas.RegionLayer
        currentTool={currentTool}
        selectedColor={selectedColor}
        selectedOpacity={selectedOpacity}
        onRegionsChange={data.handleRegionsChange}
      />

      {/* OutlineLayer - polygon outline drawing and editing */}
      <MapCanvas.OutlineLayer
        currentTool={currentTool}
        selectedColor={selectedColor}
        onColorChange={onColorChange}
        onOutlinesChange={data.handleOutlinesChange}
      />

      {/* ShapeOverlayLayer - square/circle shape overlay placement */}
      <MapCanvas.ShapeOverlayLayer
        currentTool={currentTool}
        selectedColor={selectedColor}
        selectedOpacity={selectedOpacity}
        freeformPlacementMode={freeformPlacementMode}
        onShapeOverlaysChange={data.handleShapeOverlaysChange}
      />

      {/* HexCoordinateLayer - displays coordinate labels when 'C' key is held */}
      <MapCanvas.HexCoordinateLayer />

      {/* WeatherLayer - weather over weather-bound regions (below the beacons) */}
      <MapCanvas.WeatherLayer visible={showWeather} />

      {/* WeatherSkyLayer - animated Sky over the weather areas (same toggle; off when the map's "Animate weather" is off) */}
      <MapCanvas.WeatherSkyLayer visible={showWeather} />

      {/* PartyPinLayer - party pin marker and range ring */}
      <MapCanvas.PartyPinLayer currentTool={currentTool} onPartyPinsChange={data.handlePartyPinsChange} />

      {/* RouteLayer - saved measurement routes (gated by the visibility toolbar) */}
      {showSavedRoutes && (
        <MapCanvas.RouteLayer currentTool={currentTool} onSavedRoutesChange={data.handleSavedRoutesChange} />
      )}

      {/* MeasurementLayer - distance measurement tool overlay */}
      <MapCanvas.MeasurementLayer
        currentTool={currentTool}
        globalSettings={globalSettings}
        mapDistanceOverrides={distanceOverrides}
        onMeasurementRouteChange={data.handleMeasurementRouteChange}
        onSavedRoutesChange={data.handleSavedRoutesChange}
        onTravelSettingsChange={data.handleTravelSettingsChange}
      />

      {/* DiagonalFillOverlay - diagonal fill tool preview */}
      <MapCanvas.DiagonalFillOverlay currentTool={currentTool} />

      {/* Re-roll button for generated dungeons */}
      {showRerollButton && <MapCanvas.RerollDungeonButton />}
    </>
  );
};

export { MapCanvasLayers };

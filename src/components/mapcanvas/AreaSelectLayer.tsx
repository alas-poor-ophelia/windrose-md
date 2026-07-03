/**
 * AreaSelectLayer.tsx
 *
 * Handles area selection tool:
 * - Registers handlers with EventHandlerContext
 * - Renders start marker overlay (similar to rectangle tool)
 * - Coordinates with MapSelectionContext for multi-select
 */

import type { ToolId } from '#types/tools/tool.types';
import type { VNode } from 'preact';

import { useEffect } from 'preact/hooks';
import { useAreaSelect } from '../../hooks/interactions/useAreaSelect';
import { useMapState } from '../../context/MapContext';
import { useMapSelection } from '../../context/MapSelectionContext';
import { useLayerHandlers } from '../../hooks/canvas/useLayerHandlers';
import { createViewportTransform, getCanvasDisplayMetrics } from './viewportTransform';
import { ShapePreviewOverlay } from './ShapePreviewOverlay';
import { getSettings } from '../../core/settingsAccessor';
import { Z_INDEX } from '../../core/dmtConstants';












/** Props for AreaSelectLayer component */
export interface AreaSelectLayerProps {
  /** Current active tool */
  currentTool: ToolId;
}

const AreaSelectLayer = ({ currentTool }: AreaSelectLayerProps): VNode | null => {
  const { canvasRef, containerRef, mapData, geometry } = useMapState();
  const { areaSelectStart, setAreaSelectStart, clearSelection } = useMapSelection();

  const {
    handleAreaSelectClick,
    cancelAreaSelect,
    isAreaSelecting,
    areaSelectHoverPosition,
    updateAreaSelectHover
  } = useAreaSelect(currentTool);

  useLayerHandlers('areaSelect', {
    handleAreaSelectClick, cancelAreaSelect,
    isAreaSelecting, areaSelectStart, updateAreaSelectHover
  });

  useEffect(() => {
    if (currentTool !== 'areaSelect' && areaSelectStart) {
      setAreaSelectStart(null);
    }
    if (currentTool !== 'areaSelect' && currentTool !== 'select') {
      clearSelection();
    }
  }, [currentTool, areaSelectStart, setAreaSelectStart, clearSelection]);

  const renderStartMarker = (): VNode | null => {
    if (!areaSelectStart || !canvasRef.current || !containerRef?.current || !geometry || !mapData) {
      return null;
    }

    const canvas = canvasRef.current;
    const { viewState, northDirection } = mapData;
    if (!viewState) return null;
    const { zoom, center } = viewState;
    const { width, height } = canvas;

    const { scaledSize, worldToBuffer } = createViewportTransform({
      geometry, width, height, zoom, center, northDirection
    });
    const { canvasOffsetX, canvasOffsetY, scaleX: displayScale } = getCanvasDisplayMetrics(canvas, containerRef.current);

    const gridX = areaSelectStart.x;
    const gridY = areaSelectStart.y;

    const worldPos = geometry.type === 'grid'
      ? { worldX: (gridX + 0.5) * geometry.cellSize, worldY: (gridY + 0.5) * geometry.cellSize }
      : geometry.hexToWorld(gridX, gridY);
    const buffer = worldToBuffer(worldPos.worldX, worldPos.worldY);

    const displayScaledSize = scaledSize * displayScale;
    const cellHalfSize = displayScaledSize / 2;

    const markerX = canvasOffsetX + buffer.x * displayScale - cellHalfSize;
    const markerY = canvasOffsetY + buffer.y * displayScale - cellHalfSize;

    const highlightColor = '#4a9eff';

    return (
      <div
        key="area-select-start"
        className="windrose-area-select-marker"
        style={{
          position: 'absolute',
          left: `${markerX}px`,
          top: `${markerY}px`,
          width: `${displayScaledSize}px`,
          height: `${displayScaledSize}px`,
          border: `2px dashed ${highlightColor}`,
          backgroundColor: 'rgba(74, 158, 255, 0.15)',
          boxSizing: 'border-box',
          pointerEvents: 'none',
          zIndex: Z_INDEX.DRAWING_LAYER,
          borderRadius: '2px'
        }}
      />
    );
  };

  const renderRectanglePreview = (): VNode | null => {
    if (!areaSelectStart || !areaSelectHoverPosition) return null;

    const settings = getSettings();
    const previewEnabled = settings.shapePreviewKbm !== false;
    if (!previewEnabled) return null;

    return (
      <ShapePreviewOverlay
        shapeType="areaSelect"
        startPoint={{ x: areaSelectStart.x, y: areaSelectStart.y }}
        endPoint={areaSelectHoverPosition}
        geometry={geometry}
        mapData={mapData}
        canvasRef={canvasRef}
        containerRef={containerRef}
      />
    );
  };

  const showPreview = areaSelectHoverPosition && areaSelectStart;

  return (
    <>
      {!showPreview && renderStartMarker()}
      {renderRectanglePreview()}
    </>
  );
};

export { AreaSelectLayer };
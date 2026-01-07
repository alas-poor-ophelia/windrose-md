/**
 * AreaSelectLayer.tsx
 *
 * Handles area selection tool:
 * - Registers handlers with EventHandlerContext
 * - Renders start marker overlay (similar to rectangle tool)
 * - Coordinates with MapSelectionContext for multi-select
 */

import type { ToolId } from '#types/tools/tool.types';
import type { OffsetCoords } from '#types/core/geometry.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useAreaSelect } = await requireModuleByName("useAreaSelect.ts");
const { useMapState } = await requireModuleByName("MapContext.tsx");
const { useMapSelection } = await requireModuleByName("MapSelectionContext.tsx");
const { useEventHandlerRegistration } = await requireModuleByName("EventHandlerContext.tsx");
const { GridGeometry } = await requireModuleByName("GridGeometry.ts");

/** Props for AreaSelectLayer component */
export interface AreaSelectLayerProps {
  /** Current active tool */
  currentTool: ToolId;
}

const AreaSelectLayer = ({ currentTool }: AreaSelectLayerProps): React.ReactElement | null => {
  const { canvasRef, containerRef, mapData, geometry } = useMapState();
  const { areaSelectStart, setAreaSelectStart, clearSelection } = useMapSelection();

  const {
    handleAreaSelectClick,
    cancelAreaSelect,
    isAreaSelecting
  } = useAreaSelect(currentTool);

  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();

  dc.useEffect(() => {
    registerHandlers('areaSelect', {
      handleAreaSelectClick,
      cancelAreaSelect,
      isAreaSelecting,
      areaSelectStart
    });

    return () => unregisterHandlers('areaSelect');
  }, [registerHandlers, unregisterHandlers, handleAreaSelectClick, cancelAreaSelect, isAreaSelecting, areaSelectStart]);

  dc.useEffect(() => {
    if (currentTool !== 'areaSelect' && areaSelectStart) {
      setAreaSelectStart(null);
    }
    if (currentTool !== 'areaSelect' && currentTool !== 'select') {
      clearSelection();
    }
  }, [currentTool, areaSelectStart, setAreaSelectStart, clearSelection]);

  const renderStartMarker = (): React.ReactElement | null => {
    if (!areaSelectStart || !canvasRef.current || !containerRef?.current || !geometry || !mapData) {
      return null;
    }

    const canvas = canvasRef.current;
    const { viewState, northDirection } = mapData;
    const { zoom, center } = viewState;
    const { width, height } = canvas;

    let scaledSize: number;
    let offsetX: number;
    let offsetY: number;

    const isGrid = geometry instanceof GridGeometry;
    if (isGrid) {
      scaledSize = geometry.getScaledCellSize(zoom);
      offsetX = width / 2 - center.x * scaledSize;
      offsetY = height / 2 - center.y * scaledSize;
    } else {
      scaledSize = geometry.getScaledHexSize ? geometry.getScaledHexSize(zoom) : zoom * 30;
      offsetX = width / 2 - center.x * zoom;
      offsetY = height / 2 - center.y * zoom;
    }

    const containerRect = containerRef.current.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();

    const canvasOffsetX = canvasRect.left - containerRect.left;
    const canvasOffsetY = canvasRect.top - containerRect.top;

    const displayScale = canvasRect.width / width;

    const gridX = areaSelectStart.x;
    const gridY = areaSelectStart.y;

    let screenX: number;
    let screenY: number;

    if (isGrid) {
      const cellWorldX = (gridX + 0.5) * geometry.cellSize;
      const cellWorldY = (gridY + 0.5) * geometry.cellSize;
      screenX = offsetX + cellWorldX * zoom;
      screenY = offsetY + cellWorldY * zoom;
    } else {
      const hexCenter = geometry.hexToWorld(gridX, gridY);
      screenX = offsetX + hexCenter.worldX * zoom;
      screenY = offsetY + hexCenter.worldY * zoom;
    }

    if (northDirection !== 0) {
      const centerX = width / 2;
      const centerY = height / 2;

      screenX -= centerX;
      screenY -= centerY;

      const angleRad = (northDirection * Math.PI) / 180;
      const rotatedX = screenX * Math.cos(angleRad) - screenY * Math.sin(angleRad);
      const rotatedY = screenX * Math.sin(angleRad) + screenY * Math.cos(angleRad);

      screenX = rotatedX + centerX;
      screenY = rotatedY + centerY;
    }

    screenX *= displayScale;
    screenY *= displayScale;

    const displayScaledSize = scaledSize * displayScale;
    const cellHalfSize = displayScaledSize / 2;

    const markerX = canvasOffsetX + screenX - cellHalfSize;
    const markerY = canvasOffsetY + screenY - cellHalfSize;

    const highlightColor = '#4a9eff';

    return (
      <div
        key="area-select-start"
        className="dmt-area-select-marker"
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
          zIndex: 100,
          borderRadius: '2px'
        }}
      />
    );
  };

  return renderStartMarker();
};

return { AreaSelectLayer };

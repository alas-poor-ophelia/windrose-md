/**
 * FogOfWarLayer.tsx
 *
 * Interaction layer for Fog of War painting and erasing.
 *
 * This is a thin wrapper component that:
 * - Uses useFogTools hook for all logic
 * - Registers handlers with EventHandlerContext
 * - Renders preview overlay for rectangle start point
 */

import type { FogTool } from '../VisibilityToolbar.tsx';
import type { FogOfWar } from '#types/core/map.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useFogTools } = await requireModuleByName("useFogTools.ts");
const { useMapState } = await requireModuleByName("MapContext.tsx");
const { useEventHandlerRegistration } = await requireModuleByName("EventHandlerContext.tsx");
const { GridGeometry } = await requireModuleByName("GridGeometry.ts");

/** Props for FogOfWarLayer component */
export interface FogOfWarLayerProps {
  /** Current FoW tool: 'paint', 'erase', 'rectangle', or null */
  activeTool: FogTool;
  /** Callback when fog data changes */
  onFogChange: (updatedFogOfWar: FogOfWar) => void;
  /** Callback to initialize fog if needed */
  onInitializeFog?: () => void;
}

const FogOfWarLayer = ({
  activeTool,
  onFogChange,
  onInitializeFog
}: FogOfWarLayerProps): React.ReactElement | null => {
  const { canvasRef, containerRef, mapData, geometry } = useMapState();
  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();

  const {
    isDrawing,
    rectangleStart,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleKeyDown,
    cancelFog
  } = useFogTools(activeTool, onFogChange, onInitializeFog);

  dc.useEffect(() => {
    if (!activeTool) {
      unregisterHandlers('fogOfWar');
      return;
    }

    registerHandlers('fogOfWar', {
      handlePointerDown,
      handlePointerMove,
      handlePointerUp,
      handleKeyDown,
      isDrawing,
      rectangleStart
    });

    return () => unregisterHandlers('fogOfWar');
  }, [activeTool, registerHandlers, unregisterHandlers,
    handlePointerDown, handlePointerMove, handlePointerUp, handleKeyDown,
    isDrawing, rectangleStart]);

  const renderPreviewOverlay = (): React.ReactElement | null => {
    if (!activeTool || !rectangleStart || !canvasRef.current || !containerRef?.current || !geometry) {
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
      offsetX = width / 2 - center.x * zoom;
      offsetY = height / 2 - center.y * zoom;
      scaledSize = geometry.getScaledCellSize(zoom);
    }

    const containerRect = containerRef.current.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();

    const canvasOffsetX = canvasRect.left - containerRect.left;
    const canvasOffsetY = canvasRect.top - containerRect.top;

    const displayScale = canvasRect.width / width;

    const { col, row } = rectangleStart;

    let screenX: number;
    let screenY: number;

    if (isGrid) {
      const worldX = (col + 0.5) * geometry.cellSize;
      const worldY = (row + 0.5) * geometry.cellSize;
      screenX = offsetX + worldX * zoom;
      screenY = offsetY + worldY * zoom;
    } else {
      if (geometry.offsetToAxial) {
        const axial = geometry.offsetToAxial(col, row);
        const world = geometry.gridToWorld(axial.q, axial.r);
        screenX = offsetX + world.worldX * zoom;
        screenY = offsetY + world.worldY * zoom;
      } else {
        screenX = offsetX + col * scaledSize;
        screenY = offsetY + row * scaledSize;
      }
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

    const displayX = canvasOffsetX + screenX * displayScale;
    const displayY = canvasOffsetY + screenY * displayScale;
    const displaySize = scaledSize * displayScale;

    const halfSize = displaySize / 2;

    return (
      <div
        className="dmt-fow-preview"
        style={{
          position: 'absolute',
          left: `${displayX - halfSize}px`,
          top: `${displayY - halfSize}px`,
          width: `${displaySize}px`,
          height: `${displaySize}px`,
          border: '2px dashed #00ff00',
          backgroundColor: 'rgba(0, 255, 0, 0.1)',
          boxSizing: 'border-box',
          pointerEvents: 'none',
          zIndex: 100
        }}
      />
    );
  };

  return renderPreviewOverlay();
};

return { FogOfWarLayer };

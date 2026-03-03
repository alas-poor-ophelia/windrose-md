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
const { getSettings } = await requireModuleByName("settingsAccessor.ts");
const { offsetToAxial } = await requireModuleByName("offsetCoordinates.ts");

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
    rectangleHover,
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
      rectangleStart,
      rectangleHover
    });

    return () => unregisterHandlers('fogOfWar');
  }, [activeTool, registerHandlers, unregisterHandlers,
    handlePointerDown, handlePointerMove, handlePointerUp, handleKeyDown,
    isDrawing, rectangleStart, rectangleHover]);

  const renderPreviewOverlay = (): React.ReactElement | null => {
    if (!activeTool || !rectangleStart || !canvasRef.current || !containerRef?.current || !geometry) {
      return null;
    }

    const canvas = canvasRef.current;
    const { viewState, northDirection } = mapData;
    const { zoom, center } = viewState;
    const { width, height } = canvas;

    let scaledSize: number;
    let pxOffsetX: number;
    let pxOffsetY: number;

    const isGrid = geometry instanceof GridGeometry;
    if (isGrid) {
      scaledSize = geometry.getScaledCellSize(zoom);
      pxOffsetX = width / 2 - center.x * scaledSize;
      pxOffsetY = height / 2 - center.y * scaledSize;
    } else {
      pxOffsetX = width / 2 - center.x * zoom;
      pxOffsetY = height / 2 - center.y * zoom;
      scaledSize = geometry.getScaledCellSize(zoom);
    }

    const containerRect = containerRef.current.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();

    const canvasOffsetX = canvasRect.left - containerRect.left;
    const canvasOffsetY = canvasRect.top - containerRect.top;

    const displayScale = canvasRect.width / width;

    /**
     * Convert offset coords (col, row) to buffer-space screen coords.
     * useCenter=true → cell center (grid: +0.5, hex: hex center)
     * useCenter=false → cell top-left corner (grid only; hex always uses center)
     */
    const toScreen = (col: number, row: number, useCenter = true): { x: number; y: number } => {
      let worldX: number, worldY: number;

      if (isGrid) {
        if (useCenter) {
          worldX = (col + 0.5) * geometry.cellSize;
          worldY = (row + 0.5) * geometry.cellSize;
        } else {
          worldX = col * geometry.cellSize;
          worldY = row * geometry.cellSize;
        }
      } else {
        const axial = offsetToAxial(col, row, geometry.orientation);
        const world = geometry.gridToWorld(axial.q, axial.r);
        worldX = world.worldX;
        worldY = world.worldY;
      }

      let screenX = pxOffsetX + worldX * zoom;
      let screenY = pxOffsetY + worldY * zoom;

      if (northDirection !== 0) {
        const cx = width / 2;
        const cy = height / 2;
        screenX -= cx;
        screenY -= cy;
        const angleRad = (northDirection * Math.PI) / 180;
        const rotatedX = screenX * Math.cos(angleRad) - screenY * Math.sin(angleRad);
        const rotatedY = screenX * Math.sin(angleRad) + screenY * Math.cos(angleRad);
        screenX = rotatedX + cx;
        screenY = rotatedY + cy;
      }

      return { x: screenX, y: screenY };
    };

    // Rectangle hover preview: show full rectangle outline
    if (rectangleHover) {
      const settings = getSettings();
      const previewEnabled = (settings as Record<string, unknown>).shapePreviewKbm !== false;
      if (!previewEnabled) return null;

      const minCol = Math.min(rectangleStart.col, rectangleHover.col);
      const maxCol = Math.max(rectangleStart.col, rectangleHover.col);
      const minRow = Math.min(rectangleStart.row, rectangleHover.row);
      const maxRow = Math.max(rectangleStart.row, rectangleHover.row);

      const corners = [
        toScreen(minCol, minRow, false),         // TL
        toScreen(maxCol + 1, minRow, false),     // TR
        toScreen(maxCol + 1, maxRow + 1, false), // BR
        toScreen(minCol, maxRow + 1, false),     // BL
      ].map(p => ({
        x: p.x * displayScale + canvasOffsetX,
        y: p.y * displayScale + canvasOffsetY
      }));

      const polygonPoints = corners.map(c => `${c.x},${c.y}`).join(' ');

      return (
        <svg
          className="dmt-fow-preview"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: 100,
            overflow: 'visible'
          }}
        >
          <polygon
            points={polygonPoints}
            fill="none"
            stroke="#00ff00"
            strokeWidth={2}
            strokeDasharray="8,4"
            strokeLinejoin="round"
          />
        </svg>
      );
    }

    // Single-cell start marker (before mouse moves after first click)
    const cellCenter = toScreen(rectangleStart.col, rectangleStart.row, true);
    const displayX = cellCenter.x * displayScale + canvasOffsetX;
    const displayY = cellCenter.y * displayScale + canvasOffsetY;
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

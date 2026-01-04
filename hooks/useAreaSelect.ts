/**
 * useAreaSelect.ts
 *
 * Custom hook for managing area selection tool:
 * - Two-click rectangle selection (matching other area tools)
 * - First click places start corner marker
 * - Second click completes selection of all items in rectangle
 */

// Type-only imports
import type { ToolId } from '#types/tools/tool.types';
import type { Point, WorldCoords, IGeometry } from '#types/core/geometry.types';
import type { MapData } from '#types/core/map.types';
import type {
  AreaSelectStart,
  SelectableItem,
  UseAreaSelectResult,
} from '#types/hooks/areaSelect.types';

// Datacore imports
const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

// Context types - using inline types until contexts are fully typed
interface MapStateValue {
  canvasRef: { current: HTMLCanvasElement | null };
  mapData: MapData | null;
  geometry: IGeometry | null;
  screenToWorld: (clientX: number, clientY: number) => WorldCoords | null;
  screenToGrid: (clientX: number, clientY: number) => Point | null;
  getClientCoords: (e: PointerEvent | MouseEvent | TouchEvent) => { clientX: number; clientY: number };
}

interface MapSelectionValue {
  areaSelectStart: AreaSelectStart | null;
  setAreaSelectStart: (start: AreaSelectStart | null) => void;
  selectMultiple: (items: SelectableItem[]) => void;
  clearSelection: () => void;
}

const { useMapState, useMapOperations } = await requireModuleByName("MapContext.tsx") as {
  useMapState: () => MapStateValue;
  useMapOperations: () => unknown;
};

const { useMapSelection } = await requireModuleByName("MapSelectionContext.tsx") as {
  useMapSelection: () => MapSelectionValue;
};

const { getItemsInWorldRect } = await requireModuleByName("multiSelectOperations.ts") as {
  getItemsInWorldRect: (
    mapData: MapData,
    corner1: WorldCoords,
    corner2: WorldCoords,
    geometry: IGeometry,
    ctx: CanvasRenderingContext2D | null
  ) => SelectableItem[];
};

const { getActiveLayer } = await requireModuleByName("layerAccessor.ts") as {
  getActiveLayer: (mapData: MapData) => unknown;
};

/**
 * Hook for managing area selection tool
 *
 * @param currentTool - Current active tool
 * @returns Area select handlers and state
 */
const useAreaSelect = (currentTool: ToolId): UseAreaSelectResult => {
  const {
    canvasRef,
    mapData,
    geometry,
    screenToWorld,
    screenToGrid,
    getClientCoords
  } = useMapState();

  const {
    areaSelectStart,
    setAreaSelectStart,
    selectMultiple,
    clearSelection
  } = useMapSelection();

  const isAreaSelectTool = currentTool === 'areaSelect';

  /**
   * Handle click for area select tool
   * First click: Set start corner
   * Second click: Complete selection
   */
  const handleAreaSelectClick = dc.useCallback(
    (e: PointerEvent | MouseEvent | TouchEvent): boolean => {
      if (!isAreaSelectTool || !mapData || !geometry) {
        return false;
      }

      const { clientX, clientY } = getClientCoords(e);
      const worldCoords = screenToWorld(clientX, clientY);
      const gridCoords = screenToGrid(clientX, clientY);

      if (!worldCoords || !gridCoords) {
        return false;
      }

      if (!areaSelectStart) {
        clearSelection();

        setAreaSelectStart({
          worldX: worldCoords.worldX,
          worldY: worldCoords.worldY,
          x: gridCoords.x,
          y: gridCoords.y
        });
        return true;
      }

      const corner1: WorldCoords = {
        worldX: areaSelectStart.worldX,
        worldY: areaSelectStart.worldY
      };
      const corner2: WorldCoords = {
        worldX: worldCoords.worldX,
        worldY: worldCoords.worldY
      };

      // Get canvas context for text measurement
      const ctx = canvasRef.current?.getContext('2d') ?? null;

      const items = getItemsInWorldRect(mapData, corner1, corner2, geometry, ctx);

      if (items.length > 0) {
        selectMultiple(items);
      } else {
        clearSelection();
      }

      setAreaSelectStart(null);

      return true;
    },
    [
      isAreaSelectTool,
      mapData,
      geometry,
      areaSelectStart,
      getClientCoords,
      screenToWorld,
      screenToGrid,
      canvasRef,
      setAreaSelectStart,
      selectMultiple,
      clearSelection
    ]
  );

  /**
   * Cancel area selection (e.g., on tool change or Escape)
   */
  const cancelAreaSelect = dc.useCallback((): void => {
    if (areaSelectStart) {
      setAreaSelectStart(null);
    }
  }, [areaSelectStart, setAreaSelectStart]);

  /**
   * Check if area selection is in progress (first corner placed)
   */
  const isAreaSelecting = !!areaSelectStart;

  return {
    // State
    areaSelectStart,
    isAreaSelecting,

    // Handlers
    handleAreaSelectClick,
    cancelAreaSelect
  };
};

return { useAreaSelect };

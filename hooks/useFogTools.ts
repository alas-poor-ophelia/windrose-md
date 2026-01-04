/**
 * useFogTools.ts
 *
 * Custom hook for managing Fog of War tools (paint, erase, rectangle).
 * Handles all fog-related state and operations including:
 * - Paint tool (add fog) with cell tracking
 * - Erase tool (reveal/remove fog) with cell tracking
 * - Rectangle tool for fog/reveal rectangular areas
 *
 * Follows the same pattern as useDrawingTools for consistency.
 * Uses geometry abstraction for coordinate conversion.
 */

// Type-only imports
import type { MapData, MapLayer, FogOfWar } from '#types/core/map.types';
import type { Point, OffsetCoords, IGeometry } from '#types/core/geometry.types';
import type {
  FogToolId,
  FogRectangleStart,
  FogCellPosition,
  UseFogToolsResult,
  OnFogChangeCallback,
  OnInitializeFogCallback,
} from '#types/hooks/fog.types';

// Datacore imports
const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

// Context types - inline until contexts are fully typed
interface MapStateValue {
  geometry: IGeometry | null;
  mapData: MapData | null;
  screenToGrid: (clientX: number, clientY: number) => Point | null;
}

const { useMapState } = await requireModuleByName("MapContext.tsx") as {
  useMapState: () => MapStateValue;
};

const {
  getActiveLayer,
  initializeFogOfWar,
  fogCell,
  revealCell,
  fogRectangle,
  revealRectangle
} = await requireModuleByName("layerAccessor.ts") as {
  getActiveLayer: (mapData: MapData) => MapLayer;
  initializeFogOfWar: (mapData: MapData, layerId: string) => MapData;
  fogCell: (layer: MapLayer, col: number, row: number) => MapLayer;
  revealCell: (layer: MapLayer, col: number, row: number) => MapLayer;
  fogRectangle: (layer: MapLayer, startCol: number, startRow: number, endCol: number, endRow: number) => MapLayer;
  revealRectangle: (layer: MapLayer, startCol: number, startRow: number, endCol: number, endRow: number) => MapLayer;
};

/**
 * Hook for managing fog of war tools
 *
 * @param activeTool - Current active fog tool: 'paint', 'erase', 'rectangle', or null
 * @param onFogChange - Callback when fog data changes
 * @param onInitializeFog - Callback to initialize fog structure if needed
 */
const useFogTools = (
  activeTool: FogToolId | null,
  onFogChange: OnFogChangeCallback | undefined,
  onInitializeFog: OnInitializeFogCallback | undefined
): UseFogToolsResult => {
  // Get required state from Context
  const {
    geometry,
    mapData,
    screenToGrid
  } = useMapState();

  // Fog tool state
  const [isDrawing, setIsDrawing] = dc.useState<boolean>(false);
  const [rectangleStart, setRectangleStart] = dc.useState<FogRectangleStart | null>(null);
  const [lastCell, setLastCell] = dc.useState<FogCellPosition | null>(null);
  const [processedCells, setProcessedCells] = dc.useState<Set<string>>(new Set());

  /**
   * Convert screen coordinates to offset coordinates (col, row)
   * Uses geometry abstraction for coordinate conversion
   */
  const screenToOffset = dc.useCallback(
    (clientX: number, clientY: number): OffsetCoords | null => {
      if (!geometry || !mapData) return null;

      // screenToGrid expects raw client coordinates
      const gridResult = screenToGrid(clientX, clientY);
      if (!gridResult) return null;

      // Use geometry's toOffsetCoords for abstracted conversion
      const { x, y } = gridResult;
      return geometry.toOffsetCoords(x, y);
    },
    [geometry, mapData, screenToGrid]
  );

  /**
   * Ensure fog is initialized before making changes
   * Returns the active layer's fog data, initializing if needed
   */
  const ensureFogInitialized = dc.useCallback((): FogOfWar | null => {
    if (!mapData) return null;

    const activeLayer = getActiveLayer(mapData);
    if (activeLayer.fogOfWar) {
      return activeLayer.fogOfWar;
    }

    // Initialize fog and notify parent
    const updatedMapData = initializeFogOfWar(mapData, mapData.activeLayerId);
    if (onInitializeFog) {
      onInitializeFog(updatedMapData);
    }

    return getActiveLayer(updatedMapData).fogOfWar;
  }, [mapData, onInitializeFog]);

  /**
   * Apply fog/reveal to a single cell based on active tool
   */
  const applyToCell = dc.useCallback(
    (col: number, row: number): void => {
      if (!mapData || !onFogChange) return;

      const fogData = ensureFogInitialized();
      if (!fogData) return;

      const activeLayer = getActiveLayer(mapData);
      let updatedLayer: MapLayer | undefined;

      if (activeTool === 'paint') {
        updatedLayer = fogCell(activeLayer, col, row);
      } else if (activeTool === 'erase') {
        updatedLayer = revealCell(activeLayer, col, row);
      } else {
        return;
      }

      if (updatedLayer && updatedLayer.fogOfWar) {
        onFogChange(updatedLayer.fogOfWar);
      }
    },
    [mapData, activeTool, onFogChange, ensureFogInitialized]
  );

  /**
   * Apply fog/reveal to a rectangular area
   * Rectangle tool defaults to reveal (erase) mode
   */
  const applyRectangle = dc.useCallback(
    (startCol: number, startRow: number, endCol: number, endRow: number): void => {
      if (!mapData || !onFogChange) return;

      const fogData = ensureFogInitialized();
      if (!fogData) return;

      const activeLayer = getActiveLayer(mapData);

      // Rectangle tool reveals (erases fog) by default
      const updatedLayer = revealRectangle(activeLayer, startCol, startRow, endCol, endRow);

      if (updatedLayer && updatedLayer.fogOfWar) {
        onFogChange(updatedLayer.fogOfWar);
      }
    },
    [mapData, onFogChange, ensureFogInitialized]
  );

  /**
   * Handle pointer down for fog tools
   */
  const handlePointerDown = dc.useCallback(
    (e: PointerEvent | MouseEvent): void => {
      if (!activeTool || e.button !== 0) return; // Left click only

      const offset = screenToOffset(e.clientX, e.clientY);
      if (!offset) return;

      const { col, row } = offset;

      if (activeTool === 'rectangle') {
        if (!rectangleStart) {
          setRectangleStart({ col, row });
        } else {
          applyRectangle(rectangleStart.col, rectangleStart.row, col, row);
          setRectangleStart(null);
        }
      } else if (activeTool === 'paint' || activeTool === 'erase') {
        setIsDrawing(true);
        setProcessedCells(new Set([`${col},${row}`]));
        setLastCell({ col, row });
        applyToCell(col, row);
      }
    },
    [activeTool, screenToOffset, rectangleStart, applyToCell, applyRectangle]
  );

  /**
   * Handle pointer move for fog tools (paint/erase drag)
   */
  const handlePointerMove = dc.useCallback(
    (e: PointerEvent | MouseEvent): void => {
      if (!activeTool || !isDrawing) return;
      if (activeTool === 'rectangle') return; // Rectangle doesn't use drag

      const offset = screenToOffset(e.clientX, e.clientY);
      if (!offset) return;

      const { col, row } = offset;
      const cellKey = `${col},${row}`;

      // Skip if we've already processed this cell in this stroke
      if (processedCells.has(cellKey)) return;

      // Skip if same cell as last (shouldn't happen with processedCells, but extra safety)
      if (lastCell && lastCell.col === col && lastCell.row === row) return;

      setProcessedCells((prev: Set<string>) => new Set([...prev, cellKey]));
      setLastCell({ col, row });
      applyToCell(col, row);
    },
    [activeTool, isDrawing, screenToOffset, lastCell, processedCells, applyToCell]
  );

  /**
   * Handle pointer up - end drawing stroke
   */
  const handlePointerUp = dc.useCallback((): void => {
    setIsDrawing(false);
    setLastCell(null);
    setProcessedCells(new Set());
  }, []);

  /**
   * Handle key events (Escape to cancel rectangle)
   */
  const handleKeyDown = dc.useCallback(
    (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && rectangleStart) {
        setRectangleStart(null);
      }
    },
    [rectangleStart]
  );

  /**
   * Cancel any in-progress operation
   */
  const cancelFog = dc.useCallback((): void => {
    setIsDrawing(false);
    setRectangleStart(null);
    setLastCell(null);
    setProcessedCells(new Set());
  }, []);

  return {
    isDrawing,
    rectangleStart,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleKeyDown,
    cancelFog,
    screenToOffset
  };
};

return { useFogTools };

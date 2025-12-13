/**
 * useFogTools.js
 * 
 * Custom hook for managing Fog of War tools (paint, erase, rectangle).
 * Handles all fog-related state and operations including:
 * - Paint tool (add fog) with cell tracking
 * - Erase tool (reveal/remove fog) with cell tracking
 * - Rectangle tool for fog/reveal rectangular areas
 * 
 * Follows the same pattern as useDrawingTools.js for consistency.
 * Uses geometry abstraction for coordinate conversion.
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useMapState } = await requireModuleByName("MapContext.jsx");
const { 
  getActiveLayer, 
  initializeFogOfWar,
  fogCell, 
  revealCell,
  fogRectangle,
  revealRectangle 
} = await requireModuleByName("layerAccessor.js");

/**
 * Hook for managing fog of war tools
 * @param {string|null} activeTool - Current active fog tool: 'paint', 'erase', 'rectangle', or null
 * @param {Function} onFogChange - Callback when fog data changes
 * @param {Function} onInitializeFog - Callback to initialize fog structure if needed
 */
const useFogTools = (activeTool, onFogChange, onInitializeFog) => {
  // Get required state from Context
  const {
    geometry,
    mapData,
    screenToGrid
  } = useMapState();
  
  // Fog tool state
  const [isDrawing, setIsDrawing] = dc.useState(false);
  const [rectangleStart, setRectangleStart] = dc.useState(null);
  const [lastCell, setLastCell] = dc.useState(null);
  const [processedCells, setProcessedCells] = dc.useState(new Set());
  
  /**
   * Convert screen coordinates to offset coordinates (col, row)
   * Uses geometry abstraction for coordinate conversion
   */
  const screenToOffset = dc.useCallback((clientX, clientY) => {
    if (!geometry || !mapData) return null;
    
    // screenToGrid expects raw client coordinates
    const gridResult = screenToGrid(clientX, clientY);
    if (!gridResult) return null;
    
    // Use geometry's toOffsetCoords for abstracted conversion
    const { gridX, gridY } = gridResult;
    return geometry.toOffsetCoords(gridX, gridY);
  }, [geometry, mapData, screenToGrid]);
  
  /**
   * Ensure fog is initialized before making changes
   * Returns the active layer's fog data, initializing if needed
   */
  const ensureFogInitialized = dc.useCallback(() => {
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
  const applyToCell = dc.useCallback((col, row) => {
    if (!mapData || !onFogChange) return;
    
    const fogData = ensureFogInitialized();
    if (!fogData) return;
    
    const activeLayer = getActiveLayer(mapData);
    let updatedLayer;
    
    if (activeTool === 'paint') {
      updatedLayer = fogCell(activeLayer, col, row);
    } else if (activeTool === 'erase') {
      updatedLayer = revealCell(activeLayer, col, row);
    } else {
      return;
    }
    
    if (updatedLayer) {
      onFogChange(updatedLayer.fogOfWar);
    }
  }, [mapData, activeTool, onFogChange, ensureFogInitialized]);
  
  /**
   * Apply fog/reveal to a rectangular area
   * Rectangle tool defaults to reveal (erase) mode
   */
  const applyRectangle = dc.useCallback((startCol, startRow, endCol, endRow) => {
    if (!mapData || !onFogChange) return;
    
    const fogData = ensureFogInitialized();
    if (!fogData) return;
    
    const activeLayer = getActiveLayer(mapData);
    
    // Rectangle tool reveals (erases fog) by default
    const updatedLayer = revealRectangle(activeLayer, startCol, startRow, endCol, endRow);
    
    if (updatedLayer) {
      onFogChange(updatedLayer.fogOfWar);
    }
  }, [mapData, onFogChange, ensureFogInitialized]);
  
  /**
   * Handle pointer down for fog tools
   */
  const handlePointerDown = dc.useCallback((e) => {
    if (!activeTool || e.button !== 0) return; // Left click only
    
    const offset = screenToOffset(e.clientX, e.clientY);
    if (!offset) return;
    
    const { col, row } = offset;
    
    if (activeTool === 'rectangle') {
      if (!rectangleStart) {
        // First click - set start corner
        setRectangleStart({ col, row });
      } else {
        // Second click - complete rectangle
        applyRectangle(rectangleStart.col, rectangleStart.row, col, row);
        setRectangleStart(null);
      }
    } else if (activeTool === 'paint' || activeTool === 'erase') {
      // Start drawing stroke
      setIsDrawing(true);
      setProcessedCells(new Set([`${col},${row}`]));
      setLastCell({ col, row });
      applyToCell(col, row);
    }
  }, [activeTool, screenToOffset, rectangleStart, applyToCell, applyRectangle]);
  
  /**
   * Handle pointer move for fog tools (paint/erase drag)
   */
  const handlePointerMove = dc.useCallback((e) => {
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
    
    setProcessedCells(prev => new Set([...prev, cellKey]));
    setLastCell({ col, row });
    applyToCell(col, row);
  }, [activeTool, isDrawing, screenToOffset, lastCell, processedCells, applyToCell]);
  
  /**
   * Handle pointer up - end drawing stroke
   */
  const handlePointerUp = dc.useCallback(() => {
    setIsDrawing(false);
    setLastCell(null);
    setProcessedCells(new Set());
  }, []);
  
  /**
   * Handle key events (Escape to cancel rectangle)
   */
  const handleKeyDown = dc.useCallback((e) => {
    if (e.key === 'Escape' && rectangleStart) {
      setRectangleStart(null);
    }
  }, [rectangleStart]);
  
  /**
   * Cancel any in-progress operation
   */
  const cancelFog = dc.useCallback(() => {
    setIsDrawing(false);
    setRectangleStart(null);
    setLastCell(null);
    setProcessedCells(new Set());
  }, []);
  
  return {
    // State
    isDrawing,
    rectangleStart,
    
    // Handlers for EventHandlerContext registration
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleKeyDown,
    cancelFog,
    
    // Utility for preview rendering
    screenToOffset
  };
};

return { useFogTools };
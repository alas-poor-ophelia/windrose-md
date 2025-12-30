/**
 * useDiagonalFill.js
 * 
 * Hook for managing diagonal fill tool state and operations.
 * Handles corner detection, path preview, and segment fill execution.
 * 
 * Interaction Model:
 * - Desktop: Click start corner â†’ hover preview â†’ click end corner â†’ fill
 * - Touch: Tap start â†’ tap end â†’ tap confirm/cancel
 * 
 * The tool fills "concave corners" along a staircase diagonal by painting
 * 4 segments (half-cell) in each gap, creating smooth diagonal edges.
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useMapState, useMapOperations } = await requireModuleByName("MapContext.jsx");
const { getActiveLayer } = await requireModuleByName("layerAccessor.js");
const { buildCellMap, setSegments } = await requireModuleByName("cellAccessor.ts");

const {
  getNearestCorner,
  getLocalPosition,
  isValidConcaveCorner,
  findValidCornerForCell,
  findNearestValidCorner,
  validateDiagonalPath,
  getValidCornersAlongDiagonal,
  getInheritedColor,
  getSegmentsForCorner
} = await requireModuleByName("diagonalFillOperations.js");

/**
 * Hook for diagonal fill tool
 * 
 * @param {string} currentTool - Current active tool
 * @returns {Object} Diagonal fill state and handlers
 */
const useDiagonalFill = (currentTool) => {
  // Get map state and operations from context
  const {
    geometry,
    mapData,
    screenToWorld,
    screenToGrid,
    getClientCoords
  } = useMapState();
  
  const { onCellsChange } = useMapOperations();
  
  // State
  const [fillStart, setFillStart] = dc.useState(null);       // {x, y, corner}
  const [fillEnd, setFillEnd] = dc.useState(null);           // {x, y}
  const [isEndLocked, setIsEndLocked] = dc.useState(false);  // Touch: end point set, awaiting confirm
  const [previewEnd, setPreviewEnd] = dc.useState(null);     // {x, y} for hover preview
  
  // Build cell map for lookups (memoized)
  const cellMap = dc.useMemo(() => {
    if (!mapData || !geometry) return new Map();
    const activeLayer = getActiveLayer(mapData);
    return buildCellMap(activeLayer.cells || [], geometry);
  }, [mapData, geometry]);
  
  // Clear state when tool changes away from diagonalFill
  dc.useEffect(() => {
    if (currentTool !== 'diagonalFill') {
      setFillStart(null);
      setFillEnd(null);
      setIsEndLocked(false);
      setPreviewEnd(null);
    }
  }, [currentTool]);
  
  /**
   * Reset all state
   */
  const resetState = dc.useCallback(() => {
    setFillStart(null);
    setFillEnd(null);
    setIsEndLocked(false);
    setPreviewEnd(null);
  }, []);
  
  /**
   * Execute fill along a specific path
   * 
   * @param {Object} start - {x, y, corner}
   * @param {Object} end - {x, y}
   */
  const executeFillPath = dc.useCallback((start, end) => {
    if (!start || !end || !geometry || !mapData) return;
    
    const activeLayer = getActiveLayer(mapData);
    const currentCellMap = buildCellMap(activeLayer.cells || [], geometry);
    
    // Get valid corners along the path
    const validCorners = getValidCornersAlongDiagonal(
      currentCellMap, start.x, start.y, end.x, end.y, start.corner
    );
    
    if (validCorners.length === 0) return;
    
    // Get color from the starting corner's painted neighbor
    const colorInfo = getInheritedColor(currentCellMap, start.x, start.y, start.corner);
    if (!colorInfo) return;
    
    // Get segments to fill for this corner type
    const segments = getSegmentsForCorner(start.corner);
    
    if (segments.length === 0) return;
    
    // Apply segments to all valid corners (batched for single undo)
    let updatedCells = [...(activeLayer.cells || [])];
    
    for (const { x, y } of validCorners) {
      updatedCells = setSegments(
        updatedCells,
        { x, y },
        segments,
        colorInfo.color,
        colorInfo.opacity,
        geometry
      );
    }
    
    // Commit with history (single undo entry)
    onCellsChange(updatedCells, false);
  }, [geometry, mapData, onCellsChange]);
  
  /**
   * Handle click/tap for diagonal fill
   * 
   * @param {Event} e - Pointer event
   * @param {boolean} isTouch - Whether this is a touch event
   * @returns {boolean} True if event was handled
   */
  const handleDiagonalFillClick = dc.useCallback((e, isTouch = false) => {
    if (currentTool !== 'diagonalFill' || !geometry || !mapData) {
      return false;
    }
    
    // Get coordinates
    const { clientX, clientY } = getClientCoords(e);
    const worldCoords = screenToWorld(clientX, clientY);
    if (!worldCoords) return false;
    
    const gridCoords = screenToGrid(clientX, clientY);
    if (!gridCoords) return false;
    
    const { gridX, gridY } = gridCoords;
    
    // Calculate local position within cell for corner detection
    const cellSize = geometry.cellSize;
    const { localX, localY } = getLocalPosition(
      worldCoords.worldX, worldCoords.worldY,
      gridX, gridY, cellSize
    );
    
    const corner = getNearestCorner(localX, localY);
    
    // Touch confirmation mode: check if tap is confirm or cancel
    if (isTouch && isEndLocked && fillEnd) {
      // Check if tap is near the end point (confirm) or away (cancel)
      const distToEnd = Math.sqrt(
        Math.pow(gridX - fillEnd.x, 2) + Math.pow(gridY - fillEnd.y, 2)
      );
      
      if (distToEnd <= 1.5) {
        // Near end point - confirm and execute fill
        executeFill();
        return true;
      } else {
        // Away from end point - cancel end, keep start
        setFillEnd(null);
        setIsEndLocked(false);
        setPreviewEnd(null);
        return true;
      }
    }
    
    // No start point yet - try to set start
    if (!fillStart) {
      // Find the valid concave corner for this cell
      // Use click position as hint, but auto-detect if that corner isn't valid
      const validCorner = findValidCornerForCell(cellMap, gridX, gridY, corner);
      
      if (!validCorner) {
        return false; // No valid concave corner in this cell
      }
      
      setFillStart({ x: gridX, y: gridY, corner: validCorner });
      setPreviewEnd(null);
      return true;
    }
    
    // Have start point - set end point
    // Validate the diagonal path
    const validation = validateDiagonalPath(cellMap, fillStart, gridX, gridY);
    
    if (!validation || !validation.valid) {
      // Invalid end point - on touch, try generous snapping
      if (isTouch) {
        const snapped = findNearestValidCorner(cellMap, gridX, gridY, fillStart.corner, 3);
        if (snapped) {
          const revalidation = validateDiagonalPath(cellMap, fillStart, snapped.x, snapped.y);
          if (revalidation && revalidation.valid) {
            if (isTouch) {
              // Touch: set end and wait for confirm
              setFillEnd({ x: revalidation.endX, y: revalidation.endY });
              setIsEndLocked(true);
            } else {
              // Mouse: execute immediately
              executeFillPath(fillStart, { x: revalidation.endX, y: revalidation.endY });
              resetState();
            }
            return true;
          }
        }
      }
      return false;
    }
    
    if (isTouch) {
      // Touch: set end and wait for confirmation tap
      setFillEnd({ x: validation.endX, y: validation.endY });
      setIsEndLocked(true);
    } else {
      // Mouse: execute immediately
      executeFillPath(fillStart, { x: validation.endX, y: validation.endY });
      resetState();
    }
    
    return true;
  }, [currentTool, geometry, mapData, cellMap, fillStart, fillEnd, isEndLocked, getClientCoords, screenToWorld, screenToGrid, executeFillPath, resetState]);
  
  /**
   * Handle pointer move for hover preview
   * Only updates preview on desktop (mouse), not during touch
   * 
   * @param {Event} e - Pointer event
   */
  const handleDiagonalFillMove = dc.useCallback((e) => {
    if (currentTool !== 'diagonalFill' || !geometry || !fillStart || isEndLocked) {
      return;
    }
    
    const { clientX, clientY } = getClientCoords(e);
    const gridCoords = screenToGrid(clientX, clientY);
    
    if (!gridCoords) {
      setPreviewEnd(null);
      return;
    }
    
    const { gridX, gridY } = gridCoords;
    
    // Validate path to this position
    const validation = validateDiagonalPath(cellMap, fillStart, gridX, gridY);
    
    if (validation && validation.valid) {
      setPreviewEnd({ x: validation.endX, y: validation.endY });
    } else {
      setPreviewEnd(null);
    }
  }, [currentTool, geometry, fillStart, isEndLocked, cellMap, getClientCoords, screenToGrid]);
  
  /**
   * Execute the fill operation with current start/end
   */
  const executeFill = dc.useCallback(() => {
    if (!fillStart || !fillEnd) return;
    executeFillPath(fillStart, fillEnd);
    resetState();
  }, [fillStart, fillEnd, executeFillPath, resetState]);
  
  /**
   * Cancel current operation (e.g., on Escape key)
   */
  const cancelFill = dc.useCallback(() => {
    resetState();
  }, [resetState]);
  
  /**
   * Get screen position for a cell corner
   * Used by overlay for rendering preview
   * 
   * @param {number} cellX - Cell X coordinate
   * @param {number} cellY - Cell Y coordinate
   * @param {string} corner - Corner name
   * @param {Object} viewState - View state with zoom and center
   * @param {number} canvasWidth - Canvas width
   * @param {number} canvasHeight - Canvas height
   * @returns {{x: number, y: number}} Screen position
   */
  const getCornerScreenPosition = dc.useCallback((cellX, cellY, corner, viewState, canvasWidth, canvasHeight) => {
    if (!geometry) return { x: 0, y: 0 };
    
    const { zoom, center } = viewState;
    const cellSize = geometry.cellSize;
    const scaledCellSize = cellSize * zoom;
    
    // Calculate offset (same as renderer)
    const offsetX = canvasWidth / 2 - center.x * scaledCellSize;
    const offsetY = canvasHeight / 2 - center.y * scaledCellSize;
    
    // Get cell top-left screen position
    const { screenX, screenY } = geometry.gridToScreen(
      cellX, cellY, offsetX, offsetY, zoom
    );
    
    // Offset to corner
    const cornerOffsets = {
      'TL': { x: 0, y: 0 },
      'TR': { x: scaledCellSize, y: 0 },
      'BR': { x: scaledCellSize, y: scaledCellSize },
      'BL': { x: 0, y: scaledCellSize }
    };
    
    const offset = cornerOffsets[corner] || { x: 0, y: 0 };
    
    return {
      x: screenX + offset.x,
      y: screenY + offset.y
    };
  }, [geometry]);
  
  return {
    // State
    fillStart,
    fillEnd,
    isEndLocked,
    previewEnd,
    
    // Handlers
    handleDiagonalFillClick,
    handleDiagonalFillMove,
    executeFill,
    cancelFill,
    
    // Utilities
    getCornerScreenPosition,
    resetState
  };
};

return { useDiagonalFill };
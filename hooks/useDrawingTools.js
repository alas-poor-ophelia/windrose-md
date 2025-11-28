/**
 * useDrawingTools.js
 * 
 * Custom hook for managing drawing tools (paint, rectangle, circle, clear area).
 * Handles all drawing-related state and operations including:
 * - Paint tool (draw/erase) with cell tracking
 * - Rectangle drawing
 * - Circle drawing
 * - Clear area tool
 * - Batched history management for strokes
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useMapState, useMapOperations } = await requireModuleByName("MapContext.jsx");

/**
 * Hook for managing drawing tools
 * @param {string} currentTool - Current active tool
 * @param {string} selectedColor - Currently selected color
 */
const useDrawingTools = (
  currentTool,
  selectedColor
) => {
  // Get all required state and operations from Context
  const {
    geometry,
    canvasRef,
    mapData,
    screenToGrid,
    screenToWorld,
    getClientCoords,
    GridGeometry
  } = useMapState();
  
  const {
    onCellsChange,
    onObjectsChange,
    onTextLabelsChange,
    getTextLabelAtPosition,
    removeTextLabel,
    getObjectAtPosition,
    removeObjectAtPosition,
    removeObjectsInRectangle
  } = useMapOperations();
  
  // Drawing state
  // Drawing state
  const [isDrawing, setIsDrawing] = dc.useState(false);
  const [processedCells, setProcessedCells] = dc.useState(new Set());
  const [rectangleStart, setRectangleStart] = dc.useState(null);
  const [circleStart, setCircleStart] = dc.useState(null);
  
  // Track initial cell state at start of drag stroke for batched history
  // This allows immediate visual updates while creating a single undo entry
  const strokeInitialStateRef = dc.useRef(null);
  
  /**
   * Toggle a single cell (paint or erase)
   * Handles painting cells, erasing cells, objects, and text labels
   */
  const toggleCell = (coords, shouldFill, dragStart = null) => {
    if (!mapData || !geometry) return;
    
    // Check bounds for hex maps (only applies to hex geometry with bounds set)
    // Handle both coordinate formats: {gridX, gridY} from screenToGrid and {q, r} from cells
    const q = coords.q !== undefined ? coords.q : coords.gridX;
    const r = coords.r !== undefined ? coords.r : coords.gridY;
    
    if (geometry.isWithinBounds && !geometry.isWithinBounds(q, r)) {
      return; // Silently reject cells outside bounds
    }
    
    // Check if we're in a batched stroke (suppress history for intermediate updates)
    const isBatchedStroke = strokeInitialStateRef.current !== null;
    
    const existingCellIndex = mapData.cells.findIndex(
      cell => geometry.cellMatchesCoords(cell, coords)
    );
    
    if (shouldFill) {
      if (existingCellIndex !== -1) {
        // Cell exists - update its color (paint over)
        const newCells = [...mapData.cells];
        newCells[existingCellIndex] = {
          ...newCells[existingCellIndex],
          color: selectedColor
        };
        onCellsChange(newCells, isBatchedStroke);
      } else {
        // Cell doesn't exist - create new with selected color
        const newCells = [
          ...mapData.cells, 
          geometry.createCellObject(coords, selectedColor)
        ];
        onCellsChange(newCells, isBatchedStroke);
      }
    } else if (!shouldFill) {
      // When erasing: check text first, then objects, then cells
      // First check for text label (requires world coordinates)
      const { clientX, clientY } = dragStart || { clientX: 0, clientY: 0 };
      const worldCoords = screenToWorld(clientX, clientY);
      if (worldCoords) {
        const canvas = canvasRef.current;
        const ctx = canvas ? canvas.getContext('2d') : null;
        const textLabel = getTextLabelAtPosition(
          mapData.textLabels || [],
          worldCoords.worldX,
          worldCoords.worldY,
          ctx
        );
        if (textLabel) {
          const newLabels = removeTextLabel(mapData.textLabels || [], textLabel.id);
          onTextLabelsChange(newLabels);
          return;
        }
      }
      
      // Then check for object (extract coordinates based on map type)
      const coordX = coords.gridX !== undefined ? coords.gridX : coords.q;
      const coordY = coords.gridY !== undefined ? coords.gridY : coords.r;
      const obj = getObjectAtPosition(mapData.objects || [], coordX, coordY);
      if (obj) {
        const newObjects = removeObjectAtPosition(mapData.objects || [], coordX, coordY);
        onObjectsChange(newObjects);
      } else if (existingCellIndex !== -1) {
        // Finally remove cell if no text or object
        const newCells = mapData.cells.filter(
          cell => !geometry.cellMatchesCoords(cell, coords)
        );
        onCellsChange(newCells, isBatchedStroke);
      }
    }
  };
  
  /**
   * Fill a rectangle of cells
   */
  const fillRectangle = (x1, y1, x2, y2) => {
    if (!mapData) return;
    if (!geometry) return;
    
    // Use geometry from context (passed via MapState)
    const cellsInRect = geometry.getCellsInRectangle(x1, y1, x2, y2);
    
    const newCells = [...mapData.cells];
    
    for (const cellCoords of cellsInRect) {
      // Convert {x, y} coordinates to proper coords format for geometry
      const coords = { gridX: cellCoords.x, gridY: cellCoords.y };
      const existingIndex = newCells.findIndex(c => geometry.cellMatchesCoords(c, coords));
      
      if (existingIndex !== -1) {
        // Cell exists - update its color (paint over)
        newCells[existingIndex] = {
          ...newCells[existingIndex],
          color: selectedColor
        };
      } else {
        // Cell doesn't exist - create new
        newCells.push(geometry.createCellObject(coords, selectedColor));
      }
    }
    
    onCellsChange(newCells);
  };
  
  /**
   * Fill a circle of cells
   */
  const fillCircle = (edgeX, edgeY, centerX, centerY) => {
    if (!mapData) return;
    
    if (!geometry) return;
    // Use geometry from context (passed via MapState)
    const radius = geometry.getEuclideanDistance(centerX, centerY, edgeX, edgeY);
    const cellsInCircle = geometry.getCellsInCircle(centerX, centerY, radius);
    
    const newCells = [...mapData.cells];
    
    for (const cellCoords of cellsInCircle) {
      // Convert {x, y} coordinates to proper coords format for geometry
      const coords = { gridX: cellCoords.x, gridY: cellCoords.y };
      const existingIndex = newCells.findIndex(c => geometry.cellMatchesCoords(c, coords));
      
      if (existingIndex !== -1) {
        // Cell exists - update its color (paint over)
        newCells[existingIndex] = {
          ...newCells[existingIndex],
          color: selectedColor
        };
      } else {
        // Cell doesn't exist - create new
        newCells.push(geometry.createCellObject(coords, selectedColor));
      }
    }
    
    onCellsChange(newCells);
  };
  
  /**
   * Clear a rectangle of cells, objects, and text labels
   */
  const clearRectangle = (x1, y1, x2, y2) => {
    if (!mapData) return;
    
    if (!geometry) return;
    // Use geometry from context (passed via MapState)
    const cellsInRect = geometry.getCellsInRectangle(x1, y1, x2, y2);
    
    // Remove all objects within the rectangle (grid coordinates)
    const newObjects = removeObjectsInRectangle(mapData.objects || [], x1, y1, x2, y2);
    onObjectsChange(newObjects);
    
    // Remove all text labels within the rectangle (need to convert to world coordinates)
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    
    const { worldX: worldMinX, worldY: worldMinY } = geometry.gridToWorld(minX, minY);
    const { worldX: worldMaxX, worldY: worldMaxY } = geometry.gridToWorld(maxX + 1, maxY + 1);
    
    const newTextLabels = (mapData.textLabels || []).filter(label => {
      return !(label.position.x >= worldMinX && label.position.x <= worldMaxX && 
               label.position.y >= worldMinY && label.position.y <= worldMaxY);
    });
    onTextLabelsChange(newTextLabels);
    
    // Remove all cells within the rectangle - check against each cell coordinate
    const newCells = mapData.cells.filter(cell => {
      // Check if this cell is within the rectangle bounds
      // For grid cells with {x, y}, check directly
      if (cell.x !== undefined) {
        return !(cell.x >= minX && cell.x <= maxX && cell.y >= minY && cell.y <= maxY);
      }
      // For hex cells with {q, r}, this tool shouldn't be available anyway
      return true;
    });
    
    onCellsChange(newCells);
  };
  
  /**
   * Process cell during drag (for draw/erase tools)
   */
  const processCellDuringDrag = (e, dragStart = null) => {
    const { clientX, clientY } = getClientCoords(e);
    const coords = screenToGrid(clientX, clientY);
    if (!coords) return;
    
    // Generate cell key based on coordinate type
    const cellKey = coords.gridX !== undefined 
      ? `${coords.gridX},${coords.gridY}` 
      : `${coords.q},${coords.r}`;
    
    if (processedCells.has(cellKey)) return;
    
    setProcessedCells(prev => new Set([...prev, cellKey]));
    
    const shouldFill = currentTool === 'draw';
    toggleCell(coords, shouldFill, dragStart);
  };
  const startDrawing = (e, dragStart = null) => {
    if (!mapData) return;
    
    setIsDrawing(true);
    setProcessedCells(new Set());
    // Store initial cell state for batched history entry at stroke end
    strokeInitialStateRef.current = [...mapData.cells];
    processCellDuringDrag(e, dragStart);
  };
  
  /**
   * Stop a drawing stroke and create history entry
   */
  const stopDrawing = () => {
    if (!isDrawing) return;
    
    setIsDrawing(false);
    setProcessedCells(new Set());
    
    // Add single history entry for the completed stroke
    if (strokeInitialStateRef.current !== null && mapData) {
      onCellsChange(mapData.cells, false);
      strokeInitialStateRef.current = null;
    }
  };
  
  /**
   * Handle pointer down for drawing tools
   * Returns true if the event was handled by drawing tools
   */
  const handleDrawingPointerDown = (e, gridX, gridY) => {
    if (!mapData) return false;
    
    // Handle rectangle and circle tools
    if (currentTool === 'rectangle' || currentTool === 'clearArea' || currentTool === 'circle') {
      if (currentTool === 'circle') {
        if (!circleStart) {
          setCircleStart({ x: gridX, y: gridY });
        } else {
          fillCircle(circleStart.x, circleStart.y, gridX, gridY);
          setCircleStart(null);
        }
      } else if (!rectangleStart) {
        const { clientX, clientY } = getClientCoords(e);
        setRectangleStart({ x: gridX, y: gridY });
      } else {
        if (currentTool === 'rectangle') {
          fillRectangle(rectangleStart.x, rectangleStart.y, gridX, gridY);
        } else {
          clearRectangle(rectangleStart.x, rectangleStart.y, gridX, gridY);
        }
        setRectangleStart(null);
      }
      return true;
    }
    
    // Handle paint/erase tools
    if (currentTool === 'draw' || currentTool === 'erase') {
      startDrawing(e);
      return true;
    }
    
    return false;
  };
  
  /**
   * Handle pointer move for drawing tools
   * Returns true if the event was handled by drawing tools
   */
  const handleDrawingPointerMove = (e, dragStart = null) => {
    if (isDrawing && (currentTool === 'draw' || currentTool === 'erase')) {
      processCellDuringDrag(e, dragStart);
      return true;
    }
    return false;
  };
  
  /**
   * Cancel any active drawing operation
   */
  const cancelDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      setProcessedCells(new Set());
      strokeInitialStateRef.current = null;
    }
  };
  
  /**
   * Reset drawing state (called when tool changes)
   */
  const resetDrawingState = () => {
    setRectangleStart(null);
    setCircleStart(null);
    cancelDrawing();
  };
  
  // Reset drawing state when tool changes
  dc.useEffect(() => {
    resetDrawingState();
  }, [currentTool]);
  
  return {
    // State
    isDrawing,
    rectangleStart,
    circleStart,
    
    // Functions
    toggleCell,
    fillRectangle,
    fillCircle,
    clearRectangle,
    processCellDuringDrag,
    startDrawing,
    stopDrawing,
    handleDrawingPointerDown,
    handleDrawingPointerMove,
    cancelDrawing,
    resetDrawingState,
    
    // Setters (for advanced use cases)
    setIsDrawing,
    setProcessedCells,
    setRectangleStart,
    setCircleStart
  };
};


return { useDrawingTools };
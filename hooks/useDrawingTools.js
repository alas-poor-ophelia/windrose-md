/**
 * useDrawingTools.js
 * 
 * Custom hook for managing drawing tools (paint, rectangle, circle, clear area, edge paint).
 * Handles all drawing-related state and operations including:
 * - Paint tool (draw/erase) with cell tracking
 * - Edge paint tool for painting grid edges
 * - Rectangle drawing
 * - Circle drawing
 * - Clear area tool
 * - Batched history management for strokes
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useMapState, useMapOperations } = await requireModuleByName("MapContext.jsx");
const { addEdge, removeEdge, getEdgeAt, generateEdgeLine, mergeEdges } = await requireModuleByName("edgeOperations.js");

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
    onEdgesChange,
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
  const [processedEdges, setProcessedEdges] = dc.useState(new Set()); // Track processed edges for edge paint
  const [rectangleStart, setRectangleStart] = dc.useState(null);
  const [circleStart, setCircleStart] = dc.useState(null);
  const [edgeLineStart, setEdgeLineStart] = dc.useState(null); // For edge line tool (two-click)
  
  // Track initial state at start of drag stroke for batched history
  // This allows immediate visual updates while creating a single undo entry
  const strokeInitialStateRef = dc.useRef(null);
  const strokeInitialEdgesRef = dc.useRef(null); // For edge strokes
  
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
      // When erasing: check text first, then objects, then edges, then cells
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
        
        // Check for edge if this is a grid map and we're near an edge
        if (geometry instanceof GridGeometry && onEdgesChange) {
          const edgeInfo = geometry.screenToEdge(worldCoords.worldX, worldCoords.worldY, 0.15);
          if (edgeInfo) {
            // Create edge key for tracking processed edges during drag
            const edgeKey = `${edgeInfo.x},${edgeInfo.y},${edgeInfo.side}`;
            
            // Skip if already processed this edge during current stroke
            if (!processedEdges.has(edgeKey)) {
              const existingEdge = getEdgeAt(mapData.edges || [], edgeInfo.x, edgeInfo.y, edgeInfo.side);
              if (existingEdge) {
                setProcessedEdges(prev => new Set([...prev, edgeKey]));
                const newEdges = removeEdge(mapData.edges || [], edgeInfo.x, edgeInfo.y, edgeInfo.side);
                onEdgesChange(newEdges, isBatchedStroke);
                return;
              }
            }
          }
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
   * Paint or erase a single edge
   * Only works for grid maps (edges are a grid-only feature)
   * @param {number} worldX - World X coordinate
   * @param {number} worldY - World Y coordinate
   * @param {boolean} shouldPaint - True to paint, false to erase
   */
  const toggleEdge = (worldX, worldY, shouldPaint) => {
    if (!mapData || !geometry || !onEdgesChange) return;
    
    // Edge painting only works for grid geometry
    if (!(geometry instanceof GridGeometry)) return;
    
    // Use screenToEdge to detect which edge was clicked
    const edgeInfo = geometry.screenToEdge(worldX, worldY, 0.15);
    if (!edgeInfo) return; // Click was in cell center, not near an edge
    
    const { x, y, side } = edgeInfo;
    
    // Check if we're in a batched stroke (suppress history for intermediate updates)
    const isBatchedStroke = strokeInitialEdgesRef.current !== null;
    
    if (shouldPaint) {
      // Paint the edge with selected color
      const newEdges = addEdge(mapData.edges || [], x, y, side, selectedColor);
      onEdgesChange(newEdges, isBatchedStroke);
    } else {
      // Erase the edge
      const newEdges = removeEdge(mapData.edges || [], x, y, side);
      onEdgesChange(newEdges, isBatchedStroke);
    }
  };
  
  /**
   * Process edge during drag (for edgeDraw/edgeErase tools)
   */
  const processEdgeDuringDrag = (e) => {
    if (!geometry || !(geometry instanceof GridGeometry)) return;
    
    const { clientX, clientY } = getClientCoords(e);
    const worldCoords = screenToWorld(clientX, clientY);
    if (!worldCoords) return;
    
    // Detect edge at this position
    const edgeInfo = geometry.screenToEdge(worldCoords.worldX, worldCoords.worldY, 0.15);
    if (!edgeInfo) return;
    
    // Generate unique key for this edge (using normalized position)
    const edgeKey = `${edgeInfo.x},${edgeInfo.y},${edgeInfo.side}`;
    
    if (processedEdges.has(edgeKey)) return;
    
    setProcessedEdges(prev => new Set([...prev, edgeKey]));
    
    const shouldPaint = currentTool === 'edgeDraw';
    toggleEdge(worldCoords.worldX, worldCoords.worldY, shouldPaint);
  };
  
  /**
   * Start edge drawing stroke
   */
  const startEdgeDrawing = (e) => {
    if (!mapData) return;
    
    setIsDrawing(true);
    setProcessedEdges(new Set());
    // Store initial edge state for batched history entry at stroke end
    strokeInitialEdgesRef.current = [...(mapData.edges || [])];
    processEdgeDuringDrag(e);
  };
  
  /**
   * Stop edge drawing stroke and create history entry
   */
  const stopEdgeDrawing = () => {
    if (!isDrawing) return;
    
    setIsDrawing(false);
    setProcessedEdges(new Set());
    
    // Add single history entry for the completed stroke
    if (strokeInitialEdgesRef.current !== null && mapData && onEdgesChange) {
      onEdgesChange(mapData.edges || [], false);
      strokeInitialEdgesRef.current = null;
    }
  };
  
  /**
   * Fill edges along a line between two grid intersections
   * Constrains to horizontal or vertical based on dominant axis
   * @param {number} x1 - Start grid x
   * @param {number} y1 - Start grid y
   * @param {number} x2 - End grid x
   * @param {number} y2 - End grid y
   */
  const fillEdgeLine = (x1, y1, x2, y2) => {
    if (!mapData || !onEdgesChange) return;
    if (!(geometry instanceof GridGeometry)) return;
    
    // Determine if this is more horizontal or vertical
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    
    let lineX1, lineY1, lineX2, lineY2;
    
    if (dx >= dy) {
      // Horizontal line - constrain y to start point
      lineX1 = x1;
      lineY1 = y1;
      lineX2 = x2;
      lineY2 = y1; // Same y as start
    } else {
      // Vertical line - constrain x to start point
      lineX1 = x1;
      lineY1 = y1;
      lineX2 = x1; // Same x as start
      lineY2 = y2;
    }
    
    // Generate the edges for this line
    const newEdgesData = generateEdgeLine(lineX1, lineY1, lineX2, lineY2, selectedColor);
    
    // Merge with existing edges
    const newEdges = mergeEdges(mapData.edges || [], newEdgesData);
    onEdgesChange(newEdges);
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
    // Pass the current event coordinates for edge/text detection during erase
    toggleCell(coords, shouldFill, { clientX, clientY });
  };
  const startDrawing = (e, dragStart = null) => {
    if (!mapData) return;
    
    setIsDrawing(true);
    setProcessedCells(new Set());
    setProcessedEdges(new Set()); // Also reset processed edges for erase strokes
    // Store initial cell state for batched history entry at stroke end
    strokeInitialStateRef.current = [...mapData.cells];
    // Also store initial edge state for erase strokes that may remove edges
    strokeInitialEdgesRef.current = mapData.edges ? [...mapData.edges] : [];
    processCellDuringDrag(e, dragStart);
  };
  
  /**
   * Stop a drawing stroke and create history entry
   */
  const stopDrawing = () => {
    if (!isDrawing) return;
    
    setIsDrawing(false);
    setProcessedCells(new Set());
    setProcessedEdges(new Set());
    
    // Add single history entry for the completed stroke (cells)
    if (strokeInitialStateRef.current !== null && mapData) {
      onCellsChange(mapData.cells, false);
      strokeInitialStateRef.current = null;
    }
    // Add single history entry for edges if any were erased
    if (strokeInitialEdgesRef.current !== null && mapData && onEdgesChange) {
      onEdgesChange(mapData.edges || [], false);
      strokeInitialEdgesRef.current = null;
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
    
    // Handle edge line tool (two-click, grid maps only)
    // Snaps to nearest grid intersection point
    if (currentTool === 'edgeLine') {
      if (!(geometry instanceof GridGeometry)) return false;
      
      // Get world coordinates to find nearest intersection
      const { clientX, clientY } = getClientCoords(e);
      const worldCoords = screenToWorld(clientX, clientY);
      if (!worldCoords) return false;
      
      // Find nearest grid intersection by rounding world coords to cell size
      const cellSize = geometry.cellSize;
      const nearestX = Math.round(worldCoords.worldX / cellSize);
      const nearestY = Math.round(worldCoords.worldY / cellSize);
      
      if (!edgeLineStart) {
        setEdgeLineStart({ x: nearestX, y: nearestY });
      } else {
        fillEdgeLine(edgeLineStart.x, edgeLineStart.y, nearestX, nearestY);
        setEdgeLineStart(null);
      }
      return true;
    }
    
    // Handle edge paint/erase tools (grid maps only)
    if (currentTool === 'edgeDraw' || currentTool === 'edgeErase') {
      startEdgeDrawing(e);
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
    // Handle edge paint/erase during drag
    if (isDrawing && (currentTool === 'edgeDraw' || currentTool === 'edgeErase')) {
      processEdgeDuringDrag(e);
      return true;
    }
    
    // Handle cell paint/erase during drag
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
      setProcessedEdges(new Set());
      strokeInitialStateRef.current = null;
      strokeInitialEdgesRef.current = null;
    }
  };
  
  /**
   * Reset drawing state (called when tool changes)
   */
  const resetDrawingState = () => {
    setRectangleStart(null);
    setCircleStart(null);
    setEdgeLineStart(null);
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
    edgeLineStart,
    
    // Cell Functions
    toggleCell,
    fillRectangle,
    fillCircle,
    clearRectangle,
    processCellDuringDrag,
    startDrawing,
    stopDrawing,
    
    // Edge Functions
    toggleEdge,
    processEdgeDuringDrag,
    startEdgeDrawing,
    stopEdgeDrawing,
    fillEdgeLine,
    
    // Handler Functions
    handleDrawingPointerDown,
    handleDrawingPointerMove,
    cancelDrawing,
    resetDrawingState,
    
    // Setters (for advanced use cases)
    setIsDrawing,
    setProcessedCells,
    setProcessedEdges,
    setRectangleStart,
    setCircleStart,
    setEdgeLineStart
  };
};


return { useDrawingTools };
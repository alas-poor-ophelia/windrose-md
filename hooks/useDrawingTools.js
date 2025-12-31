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
const { addEdge, removeEdge, getEdgeAt, generateEdgeLine, mergeEdges } = await requireModuleByName("edgeOperations.ts");
const { eraseObjectAt } = await requireModuleByName("objectOperations.ts");
const { getActiveLayer } = await requireModuleByName("layerAccessor.ts");
const { 
  setCell: accessorSetCell, 
  removeCell: accessorRemoveCell,
  setCells,
  removeCellsInBounds,
  getCellIndex,
  setSegments,
  removeSegments,
  getSegmentAtPosition,
  getLocalCellPosition
} = await requireModuleByName("cellAccessor.ts");

/**
 * Hook for managing drawing tools
 * @param {string} currentTool - Current active tool
 * @param {string} selectedColor - Currently selected color
 * @param {number} selectedOpacity - Currently selected opacity (0-1)
 * @param {Object} previewSettings - Shape preview settings
 * @param {boolean} previewSettings.kbmEnabled - Enable hover preview for keyboard/mouse
 * @param {boolean} previewSettings.touchEnabled - Enable 3-tap confirmation for touch
 */
const useDrawingTools = (
  currentTool,
  selectedColor,
  selectedOpacity = 1,
  previewSettings = { kbmEnabled: true, touchEnabled: false }
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
  const [isDrawing, setIsDrawing] = dc.useState(false);
  const [processedCells, setProcessedCells] = dc.useState(new Set());
  const [processedEdges, setProcessedEdges] = dc.useState(new Set()); // Track processed edges for edge paint
  const [processedSegments, setProcessedSegments] = dc.useState(new Set()); // Track processed segments for segment paint
  const [rectangleStart, setRectangleStart] = dc.useState(null);
  const [circleStart, setCircleStart] = dc.useState(null);
  const [edgeLineStart, setEdgeLineStart] = dc.useState(null); // For edge line tool (two-click)
  
  // Shape preview state (for KBM hover and touch confirmation)
  const [shapeHoverPosition, setShapeHoverPosition] = dc.useState(null);
  const [touchConfirmPending, setTouchConfirmPending] = dc.useState(false);
  const [pendingEndPoint, setPendingEndPoint] = dc.useState(null);
  
  // Segment picker state (for mobile/touch segment painting)
  const [segmentPickerOpen, setSegmentPickerOpen] = dc.useState(false);
  const [segmentPickerCell, setSegmentPickerCell] = dc.useState(null); // {x, y} cell coords
  const [segmentPickerExistingCell, setSegmentPickerExistingCell] = dc.useState(null); // existing cell data
  
  // "Remember selection" feature - saves segments to pre-populate new cells
  const [savedSegments, setSavedSegments] = dc.useState([]); // Array of segment names
  const [rememberSegments, setRememberSegments] = dc.useState(true); // Checkbox state (default checked)
  
  // Segment hover state (for desktop hover preview)
  const [segmentHoverInfo, setSegmentHoverInfo] = dc.useState(null); // {cellX, cellY, segment}
  
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
    
    // Get active layer data for reading
    const activeLayer = getActiveLayer(mapData);
    
    // Check bounds for hex maps (only applies to hex geometry with bounds set)
    // Handle both coordinate formats: {x, y} from screenToGrid and {q, r} from cells
    const q = coords.q !== undefined ? coords.q : coords.x;
    const r = coords.r !== undefined ? coords.r : coords.y;
    
    if (geometry.isWithinBounds && !geometry.isWithinBounds(q, r)) {
      return; // Silently reject cells outside bounds
    }
    
    // Check if we're in a batched stroke (suppress history for intermediate updates)
    const isBatchedStroke = strokeInitialStateRef.current !== null;
    
    if (shouldFill) {
      // Use accessor to set cell (handles both create and update)
      const newCells = accessorSetCell(activeLayer.cells, coords, selectedColor, selectedOpacity, geometry);
      onCellsChange(newCells, isBatchedStroke);
    } else {
      // When erasing: check text first, then objects, then edges, then cells
      // First check for text label (requires world coordinates)
      const { clientX, clientY } = dragStart || { clientX: 0, clientY: 0 };
      const worldCoords = screenToWorld(clientX, clientY);
      if (worldCoords) {
        const canvas = canvasRef.current;
        const ctx = canvas ? canvas.getContext('2d') : null;
        const textLabel = getTextLabelAtPosition(
          activeLayer.textLabels || [],
          worldCoords.worldX,
          worldCoords.worldY,
          ctx
        );
        if (textLabel) {
          const newLabels = removeTextLabel(activeLayer.textLabels || [], textLabel.id);
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
              const existingEdge = getEdgeAt(activeLayer.edges || [], edgeInfo.x, edgeInfo.y, edgeInfo.side);
              if (existingEdge) {
                // Store initial edge state on first edge erase of this stroke
                if (strokeInitialEdgesRef.current === null) {
                  strokeInitialEdgesRef.current = [...(activeLayer.edges || [])];
                }
                setProcessedEdges(prev => new Set([...prev, edgeKey]));
                const newEdges = removeEdge(activeLayer.edges || [], edgeInfo.x, edgeInfo.y, edgeInfo.side);
                onEdgesChange(newEdges, isBatchedStroke);
                return;
              }
            }
          }
        }
      }
      
      // Then check for object (extract coordinates based on map type)
      const coordX = coords.x !== undefined ? coords.x : coords.q;
      const coordY = coords.y !== undefined ? coords.y : coords.r;
      const obj = getObjectAtPosition(activeLayer.objects || [], coordX, coordY);
      if (obj) {
        // Use unified API - handles hex (one at a time) vs grid (all at position)
        const mapType = mapData.mapType || 'grid';
        const result = eraseObjectAt(activeLayer.objects || [], coordX, coordY, mapType);
        if (result.success) {
          onObjectsChange(result.objects);
        }
      } else if (getCellIndex(activeLayer.cells, coords, geometry) !== -1) {
        // Finally remove cell if no text or object
        const newCells = accessorRemoveCell(activeLayer.cells, coords, geometry);
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
    
    // Get active layer data for reading
    const activeLayer = getActiveLayer(mapData);
    
    // Use screenToEdge to detect which edge was clicked
    const edgeInfo = geometry.screenToEdge(worldX, worldY, 0.15);
    if (!edgeInfo) return; // Click was in cell center, not near an edge
    
    const { x, y, side } = edgeInfo;
    
    // Check if we're in a batched stroke (suppress history for intermediate updates)
    const isBatchedStroke = strokeInitialEdgesRef.current !== null;
    
    if (shouldPaint) {
      // Paint the edge with selected color and opacity
      const newEdges = addEdge(activeLayer.edges || [], x, y, side, selectedColor, selectedOpacity);
      onEdgesChange(newEdges, isBatchedStroke);
    } else {
      // Erase the edge
      const newEdges = removeEdge(activeLayer.edges || [], x, y, side);
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
    
    // Get active layer data for reading
    const activeLayer = getActiveLayer(mapData);
    
    setIsDrawing(true);
    setProcessedEdges(new Set());
    // Store initial edge state for batched history entry at stroke end
    strokeInitialEdgesRef.current = [...(activeLayer.edges || [])];
    processEdgeDuringDrag(e);
  };
  
  /**
   * Stop edge drawing stroke and create history entry
   */
  const stopEdgeDrawing = () => {
    if (!isDrawing) return;
    
    // Get active layer data for reading
    const activeLayer = getActiveLayer(mapData);
    
    setIsDrawing(false);
    setProcessedEdges(new Set());
    
    // Add single history entry for the completed stroke
    if (strokeInitialEdgesRef.current !== null && mapData && onEdgesChange) {
      onEdgesChange(activeLayer.edges || [], false);
      strokeInitialEdgesRef.current = null;
    }
  };
  
  // ============================================================================
  // SEGMENT DRAWING (Partial Cell Painting)
  // ============================================================================
  
  /**
   * Paint a single segment in a cell
   * Determines which triangle segment the pointer is in and paints it
   * 
   * @param {number} worldX - World X coordinate
   * @param {number} worldY - World Y coordinate
   */
  const toggleSegment = (worldX, worldY) => {
    if (!mapData || !geometry) return;
    
    // Segment painting only works for grid geometry
    if (!(geometry instanceof GridGeometry)) return;
    
    // Get active layer data for reading
    const activeLayer = getActiveLayer(mapData);
    
    // Get the grid cell coordinates
    const gridCoords = geometry.worldToGrid(worldX, worldY);
    const cellX = gridCoords.x;
    const cellY = gridCoords.y;
    
    // Calculate local position within the cell (0-1)
    const cellWorldX = cellX * geometry.cellSize;
    const cellWorldY = cellY * geometry.cellSize;
    const localX = (worldX - cellWorldX) / geometry.cellSize;
    const localY = (worldY - cellWorldY) / geometry.cellSize;
    
    // Determine which segment this position falls into
    const segment = getSegmentAtPosition(localX, localY);
    
    // Create unique key for tracking during drag
    const segmentKey = `${cellX},${cellY},${segment}`;
    
    if (processedSegments.has(segmentKey)) return;
    
    setProcessedSegments(prev => new Set([...prev, segmentKey]));
    
    // Check if we're in a batched stroke
    const isBatchedStroke = strokeInitialStateRef.current !== null;
    
    // Paint the segment
    const newCells = setSegments(
      activeLayer.cells, 
      { x: cellX, y: cellY }, 
      [segment], 
      selectedColor, 
      selectedOpacity, 
      geometry
    );
    onCellsChange(newCells, isBatchedStroke);
  };
  
  /**
   * Process segment during drag (for segmentDraw tool)
   */
  const processSegmentDuringDrag = (e) => {
    if (!geometry || !(geometry instanceof GridGeometry)) return;
    
    const { clientX, clientY } = getClientCoords(e);
    const worldCoords = screenToWorld(clientX, clientY);
    if (!worldCoords) return;
    
    toggleSegment(worldCoords.worldX, worldCoords.worldY);
  };
  
  /**
   * Start segment drawing stroke
   */
  const startSegmentDrawing = (e) => {
    if (!mapData) return;
    
    // Get active layer data for reading
    const activeLayer = getActiveLayer(mapData);
    
    setIsDrawing(true);
    setProcessedSegments(new Set());
    // Store initial cell state for batched history entry at stroke end
    strokeInitialStateRef.current = [...activeLayer.cells];
    processSegmentDuringDrag(e);
  };
  
  /**
   * Stop segment drawing stroke and create history entry
   */
  const stopSegmentDrawing = () => {
    if (!isDrawing) return;
    
    // Get active layer data for reading
    const activeLayer = getActiveLayer(mapData);
    
    setIsDrawing(false);
    setProcessedSegments(new Set());
    
    // Add single history entry for the completed stroke
    if (strokeInitialStateRef.current !== null && mapData) {
      onCellsChange(activeLayer.cells, false);
      strokeInitialStateRef.current = null;
    }
  };
  
  // ============================================================================
  // SEGMENT PICKER (Mobile/Touch UI for segment painting)
  // ============================================================================
  
  /**
   * Open the segment picker for a specific cell
   * Called on touch devices when tapping a cell with segmentDraw tool
   * 
   * @param {number} cellX - Cell X coordinate
   * @param {number} cellY - Cell Y coordinate
   */
  const openSegmentPicker = (cellX, cellY) => {
    if (!mapData || !geometry) return;
    
    // Get active layer data
    const activeLayer = getActiveLayer(mapData);
    
    // Find existing cell at this position
    const existingCell = activeLayer.cells.find(c => c.x === cellX && c.y === cellY);
    
    setSegmentPickerCell({ x: cellX, y: cellY });
    setSegmentPickerExistingCell(existingCell || null);
    setSegmentPickerOpen(true);
  };
  
  /**
   * Close the segment picker without applying changes
   */
  const closeSegmentPicker = () => {
    setSegmentPickerOpen(false);
    setSegmentPickerCell(null);
    setSegmentPickerExistingCell(null);
  };
  
  /**
   * Apply segment selection from the picker
   * Called when user confirms their selection in the picker UI
   * 
   * Note: This REPLACES the cell's segments entirely, unlike the drag-painting
   * which adds segments. This allows the picker to toggle segments off.
   * 
   * @param {Array<string>} selectedSegments - Array of segment names to fill
   * @param {boolean} shouldRemember - Whether to save these segments for future cells
   */
  const applySegmentSelection = (selectedSegments, shouldRemember = true) => {
    if (!mapData || !geometry || !segmentPickerCell) return;
    
    // Save segments for future cells if "remember" is checked
    if (shouldRemember) {
      setSavedSegments(selectedSegments);
      setRememberSegments(true);
    } else {
      setRememberSegments(false);
    }
    
    // Get active layer data
    const activeLayer = getActiveLayer(mapData);
    
    // First, remove any existing cell at this position
    let newCells = activeLayer.cells.filter(c => 
      !(c.x === segmentPickerCell.x && c.y === segmentPickerCell.y)
    );
    
    // If segments are selected, create a new cell
    if (selectedSegments.length > 0) {
      const coords = { x: segmentPickerCell.x, y: segmentPickerCell.y };
      
      // Use setSegments on the filtered array (without existing cell)
      // This will create a fresh cell with exactly the selected segments
      newCells = setSegments(
        newCells,
        coords,
        selectedSegments,
        selectedColor,
        selectedOpacity,
        geometry
      );
    }
    
    onCellsChange(newCells);
    
    // Close the picker
    closeSegmentPicker();
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
    
    // Get active layer data for reading
    const activeLayer = getActiveLayer(mapData);
    
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
    const newEdges = mergeEdges(activeLayer.edges || [], newEdgesData);
    onEdgesChange(newEdges);
  };
  
  /**
   * Fill a rectangle of cells
   */
  const fillRectangle = (x1, y1, x2, y2) => {
    if (!mapData) return;
    if (!geometry) return;
    
    // Get active layer data for reading
    const activeLayer = getActiveLayer(mapData);
    
    // Use geometry from context (passed via MapState)
    const cellsInRect = geometry.getCellsInRectangle(x1, y1, x2, y2);
    
    // Build batch updates array
    const cellUpdates = cellsInRect.map(cellCoords => ({
      coords: cellCoords,
      color: selectedColor,
      opacity: selectedOpacity
    }));
    
    // Use batch setter for efficiency
    const newCells = setCells(activeLayer.cells, cellUpdates, geometry);
    onCellsChange(newCells);
  };
  
  /**
   * Fill a circle of cells
   */
  const fillCircle = (edgeX, edgeY, centerX, centerY) => {
    if (!mapData) return;
    
    if (!geometry) return;
    
    // Get active layer data for reading
    const activeLayer = getActiveLayer(mapData);
    
    // Use geometry from context (passed via MapState)
    const radius = geometry.getEuclideanDistance(centerX, centerY, edgeX, edgeY);
    const cellsInCircle = geometry.getCellsInCircle(centerX, centerY, radius);
    
    // Build batch updates array
    const cellUpdates = cellsInCircle.map(cellCoords => ({
      coords: cellCoords,
      color: selectedColor,
      opacity: selectedOpacity
    }));
    
    // Use batch setter for efficiency
    const newCells = setCells(activeLayer.cells, cellUpdates, geometry);
    onCellsChange(newCells);
  };
  
  /**
   * Clear a rectangle of cells, objects, and text labels
   */
  const clearRectangle = (x1, y1, x2, y2) => {
    if (!mapData) return;
    
    if (!geometry) return;
    
    // Get active layer data for reading
    const activeLayer = getActiveLayer(mapData);
    
    // Remove all objects within the rectangle (grid coordinates)
    const newObjects = removeObjectsInRectangle(activeLayer.objects || [], x1, y1, x2, y2);
    onObjectsChange(newObjects);
    
    // Remove all text labels within the rectangle (need to convert to world coordinates)
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    
    const { worldX: worldMinX, worldY: worldMinY } = geometry.gridToWorld(minX, minY);
    const { worldX: worldMaxX, worldY: worldMaxY } = geometry.gridToWorld(maxX + 1, maxY + 1);
    
    const newTextLabels = (activeLayer.textLabels || []).filter(label => {
      return !(label.position.x >= worldMinX && label.position.x <= worldMaxX && 
               label.position.y >= worldMinY && label.position.y <= worldMaxY);
    });
    onTextLabelsChange(newTextLabels);
    
    // Remove all cells within the rectangle using accessor
    const newCells = removeCellsInBounds(activeLayer.cells, x1, y1, x2, y2, geometry);
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
    const cellKey = coords.x !== undefined 
      ? `${coords.x},${coords.y}` 
      : `${coords.q},${coords.r}`;
    
    if (processedCells.has(cellKey)) return;
    
    setProcessedCells(prev => new Set([...prev, cellKey]));
    
    const shouldFill = currentTool === 'draw';
    // Pass the current event coordinates for edge/text detection during erase
    toggleCell(coords, shouldFill, { clientX, clientY });
  };
  
  const startDrawing = (e, dragStart = null) => {
    if (!mapData) return;
    
    // Get active layer data for reading
    const activeLayer = getActiveLayer(mapData);
    
    setIsDrawing(true);
    setProcessedCells(new Set());
    setProcessedEdges(new Set()); // Also reset processed edges for erase strokes
    // Store initial cell state for batched history entry at stroke end
    strokeInitialStateRef.current = [...activeLayer.cells];
    // Don't initialize edge state here - only when we actually erase an edge
    strokeInitialEdgesRef.current = null;
    processCellDuringDrag(e, dragStart);
  };
  
  /**
   * Stop a drawing stroke and create history entry
   */
  const stopDrawing = () => {
    if (!isDrawing) return;
    
    // Get active layer data for reading
    const activeLayer = getActiveLayer(mapData);
    
    setIsDrawing(false);
    setProcessedCells(new Set());
    setProcessedEdges(new Set());
    
    // Add single history entry for the completed stroke (cells)
    if (strokeInitialStateRef.current !== null && mapData) {
      onCellsChange(activeLayer.cells, false);
      strokeInitialStateRef.current = null;
    }
    // Add single history entry for edges if any were erased
    if (strokeInitialEdgesRef.current !== null && mapData && onEdgesChange) {
      onEdgesChange(activeLayer.edges || [], false);
      strokeInitialEdgesRef.current = null;
    }
  };
  
  // ============================================================================
  // SHAPE PREVIEW METHODS
  // ============================================================================
  
  /**
   * Update hover position for shape preview (KBM mode)
   * Called during mouse move when a shape tool has a start point set
   * @param {number} gridX - Grid X coordinate
   * @param {number} gridY - Grid Y coordinate
   */
  const updateShapeHover = dc.useCallback((gridX, gridY) => {
    // Only update if we have a start point and not in touch confirm mode
    if (touchConfirmPending) return;
    
    const hasStart = (currentTool === 'circle' && circleStart) ||
                     ((currentTool === 'rectangle' || currentTool === 'clearArea') && rectangleStart) ||
                     (currentTool === 'edgeLine' && edgeLineStart);
    
    if (hasStart) {
      setShapeHoverPosition({ x: gridX, y: gridY });
    }
  }, [currentTool, circleStart, rectangleStart, edgeLineStart, touchConfirmPending]);
  
  /**
   * Update hover position for edge line tool (uses intersection coords)
   * @param {number} intX - Intersection X coordinate
   * @param {number} intY - Intersection Y coordinate
   */
  const updateEdgeLineHover = dc.useCallback((intX, intY) => {
    if (touchConfirmPending) return;
    if (currentTool === 'edgeLine' && edgeLineStart) {
      setShapeHoverPosition({ x: intX, y: intY });
    }
  }, [currentTool, edgeLineStart, touchConfirmPending]);
  
  /**
   * Update hover state for segment painting tool
   * Called during mouse move when segment paint tool is active
   * 
   * @param {number} cellX - Cell X coordinate
   * @param {number} cellY - Cell Y coordinate
   * @param {number} localX - Local X position within cell (0-1)
   * @param {number} localY - Local Y position within cell (0-1)
   */
  const updateSegmentHover = dc.useCallback((cellX, cellY, localX, localY) => {
    // Don't show hover while actively drawing
    if (isDrawing) {
      setSegmentHoverInfo(null);
      return;
    }
    
    if (currentTool !== 'segmentDraw') {
      setSegmentHoverInfo(null);
      return;
    }
    
    // Determine which segment is under the cursor
    const segment = getSegmentAtPosition(localX, localY);
    
    if (segment) {
      setSegmentHoverInfo({ cellX, cellY, segment });
    } else {
      setSegmentHoverInfo(null);
    }
  }, [currentTool, isDrawing]);
  
  // Clear segment hover when tool changes away from segmentDraw
  dc.useEffect(() => {
    if (currentTool !== 'segmentDraw') {
      setSegmentHoverInfo(null);
    }
  }, [currentTool]);
  
  /**
   * Clear segment hover (e.g., when mouse leaves canvas)
   */
  const clearSegmentHover = dc.useCallback(() => {
    setSegmentHoverInfo(null);
  }, []);
  
  /**
   * Check if a point is inside the shape bounds (for touch confirmation)
   * @param {number} x - X coordinate to check
   * @param {number} y - Y coordinate to check
   * @returns {boolean} True if point is inside shape bounds
   */
  const isPointInShapeBounds = dc.useCallback((x, y) => {
    if (!pendingEndPoint) return false;
    
    if (currentTool === 'circle' && circleStart) {
      // For circle, check if point is within the radius
      const dx = pendingEndPoint.x - circleStart.x;
      const dy = pendingEndPoint.y - circleStart.y;
      const radius = Math.sqrt(dx * dx + dy * dy);
      
      const distFromCenter = Math.sqrt(
        Math.pow(x - circleStart.x, 2) + Math.pow(y - circleStart.y, 2)
      );
      return distFromCenter <= radius;
    }
    
    if ((currentTool === 'rectangle' || currentTool === 'clearArea') && rectangleStart) {
      // For rectangle, check if point is within bounds
      const minX = Math.min(rectangleStart.x, pendingEndPoint.x);
      const maxX = Math.max(rectangleStart.x, pendingEndPoint.x);
      const minY = Math.min(rectangleStart.y, pendingEndPoint.y);
      const maxY = Math.max(rectangleStart.y, pendingEndPoint.y);
      
      return x >= minX && x <= maxX && y >= minY && y <= maxY;
    }
    
    if (currentTool === 'edgeLine' && edgeLineStart) {
      // For edge line, be lenient - accept taps near either end or on the line
      // This is harder to calculate precisely, so just check if within bounding box
      const minX = Math.min(edgeLineStart.x, pendingEndPoint.x) - 1;
      const maxX = Math.max(edgeLineStart.x, pendingEndPoint.x) + 1;
      const minY = Math.min(edgeLineStart.y, pendingEndPoint.y) - 1;
      const maxY = Math.max(edgeLineStart.y, pendingEndPoint.y) + 1;
      
      return x >= minX && x <= maxX && y >= minY && y <= maxY;
    }
    
    return false;
  }, [currentTool, circleStart, rectangleStart, edgeLineStart, pendingEndPoint]);
  
  /**
   * Confirm and commit the touch preview shape
   */
  const confirmTouchShape = dc.useCallback(() => {
    if (!touchConfirmPending || !pendingEndPoint) return;
    
    if (currentTool === 'circle' && circleStart) {
      fillCircle(pendingEndPoint.x, pendingEndPoint.y, circleStart.x, circleStart.y);
      setCircleStart(null);
    } else if (currentTool === 'rectangle' && rectangleStart) {
      fillRectangle(rectangleStart.x, rectangleStart.y, pendingEndPoint.x, pendingEndPoint.y);
      setRectangleStart(null);
    } else if (currentTool === 'clearArea' && rectangleStart) {
      clearRectangle(rectangleStart.x, rectangleStart.y, pendingEndPoint.x, pendingEndPoint.y);
      setRectangleStart(null);
    } else if (currentTool === 'edgeLine' && edgeLineStart) {
      fillEdgeLine(edgeLineStart.x, edgeLineStart.y, pendingEndPoint.x, pendingEndPoint.y);
      setEdgeLineStart(null);
    }
    
    // Clear preview state
    setTouchConfirmPending(false);
    setPendingEndPoint(null);
    setShapeHoverPosition(null);
  }, [touchConfirmPending, pendingEndPoint, currentTool, circleStart, rectangleStart, edgeLineStart,
      fillCircle, fillRectangle, clearRectangle, fillEdgeLine]);
  
  /**
   * Cancel shape preview (for escape key, right-click, or tap outside)
   */
  const cancelShapePreview = dc.useCallback(() => {
    setRectangleStart(null);
    setCircleStart(null);
    setEdgeLineStart(null);
    setShapeHoverPosition(null);
    setTouchConfirmPending(false);
    setPendingEndPoint(null);
  }, []);
  
  /**
   * Handle pointer down for drawing tools
   * Returns true if the event was handled by drawing tools
   * @param {Event} e - Pointer/touch event
   * @param {number} gridX - Grid X coordinate
   * @param {number} gridY - Grid Y coordinate
   */
  const handleDrawingPointerDown = (e, gridX, gridY, isTouchEvent = false) => {
    if (!mapData) return false;
    
    // Ignore right-clicks - they're handled by contextmenu for cancellation
    if (e.button === 2) return false;
    
    // Use passed isTouchEvent flag (from event coordinator) or fallback to event detection
    const isTouch = isTouchEvent || e.touches !== undefined || e.pointerType === 'touch';
    const touchPreviewEnabled = previewSettings.touchEnabled && isTouch;
    
    // Handle rectangle and circle tools
    if (currentTool === 'rectangle' || currentTool === 'clearArea' || currentTool === 'circle') {
      
      // If we're in touch confirmation mode, check if tap is inside or outside
      if (touchConfirmPending && pendingEndPoint) {
        if (isPointInShapeBounds(gridX, gridY)) {
          confirmTouchShape();
        } else {
          cancelShapePreview();
        }
        return true;
      }
      
      if (currentTool === 'circle') {
        if (!circleStart) {
          // First tap/click: set start point
          setCircleStart({ x: gridX, y: gridY });
          setShapeHoverPosition(null);
        } else if (touchPreviewEnabled) {
          // Touch with preview: second tap shows preview, doesn't commit yet
          setPendingEndPoint({ x: gridX, y: gridY });
          setTouchConfirmPending(true);
          setShapeHoverPosition({ x: gridX, y: gridY });
        } else {
          // Mouse or touch without preview: commit immediately
          fillCircle(gridX, gridY, circleStart.x, circleStart.y);
          setCircleStart(null);
          setShapeHoverPosition(null);
        }
      } else if (!rectangleStart) {
        // First tap/click: set start point
        setRectangleStart({ x: gridX, y: gridY });
        setShapeHoverPosition(null);
      } else if (touchPreviewEnabled) {
        // Touch with preview: second tap shows preview, doesn't commit yet
        setPendingEndPoint({ x: gridX, y: gridY });
        setTouchConfirmPending(true);
        setShapeHoverPosition({ x: gridX, y: gridY });
      } else {
        // Mouse or touch without preview: commit immediately
        if (currentTool === 'rectangle') {
          fillRectangle(rectangleStart.x, rectangleStart.y, gridX, gridY);
        } else {
          clearRectangle(rectangleStart.x, rectangleStart.y, gridX, gridY);
        }
        setRectangleStart(null);
        setShapeHoverPosition(null);
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
      
      // If we're in touch confirmation mode, check if tap is inside or outside
      if (touchConfirmPending && pendingEndPoint) {
        if (isPointInShapeBounds(nearestX, nearestY)) {
          confirmTouchShape();
        } else {
          cancelShapePreview();
        }
        return true;
      }
      
      if (!edgeLineStart) {
        // First tap/click: set start point
        setEdgeLineStart({ x: nearestX, y: nearestY });
        setShapeHoverPosition(null);
      } else if (touchPreviewEnabled) {
        // Touch with preview: second tap shows preview
        setPendingEndPoint({ x: nearestX, y: nearestY });
        setTouchConfirmPending(true);
        setShapeHoverPosition({ x: nearestX, y: nearestY });
      } else {
        // Mouse or touch without preview: commit immediately
        fillEdgeLine(edgeLineStart.x, edgeLineStart.y, nearestX, nearestY);
        setEdgeLineStart(null);
        setShapeHoverPosition(null);
      }
      return true;
    }
    
    // Handle edge paint/erase tools (grid maps only)
    if (currentTool === 'edgeDraw' || currentTool === 'edgeErase') {
      startEdgeDrawing(e);
      return true;
    }
    
    // Handle segment paint tool (grid maps only)
    if (currentTool === 'segmentDraw') {
      if (isTouch) {
        // Touch: Open the segment picker for this cell
        if (geometry instanceof GridGeometry) {
          openSegmentPicker(gridX, gridY);
        }
      } else {
        // Mouse/pen: Use direct segment drawing
        startSegmentDrawing(e);
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
    // Handle edge paint/erase during drag
    if (isDrawing && (currentTool === 'edgeDraw' || currentTool === 'edgeErase')) {
      processEdgeDuringDrag(e);
      return true;
    }
    
    // Handle segment paint during drag
    if (isDrawing && currentTool === 'segmentDraw') {
      processSegmentDuringDrag(e);
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
      setProcessedSegments(new Set());
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
    setShapeHoverPosition(null);
    setTouchConfirmPending(false);
    setPendingEndPoint(null);
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
    
    // Shape preview state
    shapeHoverPosition,
    touchConfirmPending,
    pendingEndPoint,
    
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
    
    // Segment Functions (partial cell painting)
    toggleSegment,
    processSegmentDuringDrag,
    startSegmentDrawing,
    stopSegmentDrawing,
    
    // Segment Picker (mobile/touch UI)
    segmentPickerOpen,
    segmentPickerCell,
    segmentPickerExistingCell,
    openSegmentPicker,
    closeSegmentPicker,
    applySegmentSelection,
    savedSegments,
    rememberSegments,
    
    // Handler Functions
    handleDrawingPointerDown,
    handleDrawingPointerMove,
    cancelDrawing,
    resetDrawingState,
    
    // Shape preview functions
    updateShapeHover,
    updateEdgeLineHover,
    isPointInShapeBounds,
    confirmTouchShape,
    cancelShapePreview,
    
    // Segment hover (desktop preview)
    segmentHoverInfo,
    updateSegmentHover,
    clearSegmentHover,
    
    // Setters (for advanced use cases)
    setIsDrawing,
    setProcessedCells,
    setProcessedEdges,
    setProcessedSegments,
    setRectangleStart,
    setCircleStart,
    setEdgeLineStart,
    setShapeHoverPosition,
    setTouchConfirmPending,
    setPendingEndPoint
  };
};


return { useDrawingTools };
/**
 * useCanvasInteraction.js
 * 
 * Custom hook that handles all canvas interaction state and logic including:
 * - Pan state (mouse pan, touch pan, space key pan)
 * - Zoom state (wheel zoom, pinch zoom)
 * - Coordinate transformation helpers
 * - Touch event helpers
 * 
 * This hook manages the viewport state (zoom, center) and provides
 * helper functions for coordinate conversions that depend on viewport.
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { DEFAULTS } = await requireModuleByName("dmtConstants.ts");
const { GridGeometry } = await requireModuleByName("GridGeometry.js");


function useCanvasInteraction(canvasRef, mapData, geometry, onViewStateChange = () => {}, focused) {
  // Pan state
  const [isPanning, setIsPanning] = dc.useState(false);
  const [isTouchPanning, setIsTouchPanning] = dc.useState(false);
  const [panStart, setPanStart] = dc.useState(null);
  const [touchPanStart, setTouchPanStart] = dc.useState(null);
  
  // Zoom state
  const [initialPinchDistance, setInitialPinchDistance] = dc.useState(null);
  
  // Space key panning state
  const [spaceKeyPressed, setSpaceKeyPressed] = dc.useState(false);
  
  // Track recent touch to ignore synthetic mouse events
  const lastTouchTimeRef = dc.useRef(0);
  
  // Get client coordinates from mouse or touch event
  const getClientCoords = (e) => {
    if (e.touches && e.touches.length > 0) {
      return {
        clientX: e.touches[0].clientX,
        clientY: e.touches[0].clientY
      };
    } else if (e.changedTouches && e.changedTouches.length > 0) {
      return {
        clientX: e.changedTouches[0].clientX,
        clientY: e.changedTouches[0].clientY
      };
    } else {
      return {
        clientX: e.clientX,
        clientY: e.clientY
      };
    }
  };
  
  // Get center point of two touches for two-finger pan
  const getTouchCenter = (touches) => {
    if (touches.length < 2) return null;
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2
    };
  };
  
  // Calculate distance between two touches for pinch-to-zoom
  const getTouchDistance = (touches) => {
    if (touches.length < 2) return null;
    const dx = touches[1].clientX - touches[0].clientX;
    const dy = touches[1].clientY - touches[0].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };
  
  // Convert screen coordinates to grid coordinates
  const screenToGrid = (clientX, clientY) => {
    if (!mapData) return null;
    if (!geometry) return null;
    if (!canvasRef.current) return null;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    let x = clientX - rect.left;
    let y = clientY - rect.top;
    
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    x *= scaleX;
    y *= scaleY;
    
    const { gridSize, viewState, northDirection } = mapData;
    const { zoom, center } = viewState;
    
    if (northDirection !== 0) {
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      
      x -= centerX;
      y -= centerY;
      
      const angleRad = (-northDirection * Math.PI) / 180;
      const rotatedX = x * Math.cos(angleRad) - y * Math.sin(angleRad);
      const rotatedY = x * Math.sin(angleRad) + y * Math.cos(angleRad);
      
      x = rotatedX + centerX;
      y = rotatedY + centerY;
    }
    
    // Calculate offset based on geometry type
    let offsetX, offsetY;
    if (geometry instanceof GridGeometry) {
      // Grid: center is in grid cell coordinates
      const scaledCellSize = geometry.getScaledCellSize(zoom);
      offsetX = canvas.width / 2 - center.x * scaledCellSize;
      offsetY = canvas.height / 2 - center.y * scaledCellSize;
    } else {
      // Hex: center is in world pixel coordinates
      offsetX = canvas.width / 2 - center.x * zoom;
      offsetY = canvas.height / 2 - center.y * zoom;
    }
    
    // Convert canvas coordinates to world coordinates
    const worldX = (x - offsetX) / zoom;
    const worldY = (y - offsetY) / zoom;
    
    // Convert world coordinates to grid coordinates
    return geometry.worldToGrid(worldX, worldY);
  };
  
  // Convert screen coordinates to world coordinates (for text labels)
  const screenToWorld = (clientX, clientY) => {
    if (!mapData) return null;
    if (!geometry) return null;
    if (!canvasRef.current) return null;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    let x = clientX - rect.left;
    let y = clientY - rect.top;
    
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    x *= scaleX;
    y *= scaleY;
    
    const { gridSize, viewState, northDirection } = mapData;
    const { zoom, center } = viewState;
    
    // Calculate offset based on geometry type
    let offsetX, offsetY;
    if (geometry instanceof GridGeometry) {
      // Grid: center is in grid cell coordinates
      const scaledCellSize = geometry.getScaledCellSize(zoom);
      offsetX = canvas.width / 2 - center.x * scaledCellSize;
      offsetY = canvas.height / 2 - center.y * scaledCellSize;
    } else {
      // Hex: center is in world pixel coordinates
      offsetX = canvas.width / 2 - center.x * zoom;
      offsetY = canvas.height / 2 - center.y * zoom;
    }
    
    if (northDirection !== 0) {
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      
      x -= centerX;
      y -= centerY;
      
      const angleRad = (-northDirection * Math.PI) / 180;
      const rotatedX = x * Math.cos(angleRad) - y * Math.sin(angleRad);
      const rotatedY = x * Math.sin(angleRad) + y * Math.cos(angleRad);
      
      x = rotatedX + centerX;
      y = rotatedY + centerY;
    }
    
    const worldX = (x - offsetX) / zoom;
    const worldY = (y - offsetY) / zoom;
    
    return { worldX, worldY };
  };
  
  // Handle wheel zoom
  const handleWheel = (e) => {
    e.preventDefault();
    
    if (!mapData) return;
    if (!geometry) return;
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newZoom = Math.max(DEFAULTS.minZoom, Math.min(4, mapData.viewState.zoom + delta));
    
    const { gridSize, viewState } = mapData;
    const { zoom: oldZoom, center: oldCenter } = viewState;
    

    const scaledGridSize = geometry.getScaledCellSize(oldZoom);
    const offsetX = canvas.width / 2 - oldCenter.x * scaledGridSize;
    const offsetY = canvas.height / 2 - oldCenter.y * scaledGridSize;
    
    const worldX = (mouseX - offsetX) / scaledGridSize;
    const worldY = (mouseY - offsetY) / scaledGridSize;
    
    const newScaledGridSize = geometry.getScaledCellSize(newZoom);
    const newOffsetX = mouseX - worldX * newScaledGridSize;
    const newOffsetY = mouseY - worldY * newScaledGridSize;
    
    const newCenterX = (canvas.width / 2 - newOffsetX) / newScaledGridSize;
    const newCenterY = (canvas.height / 2 - newOffsetY) / newScaledGridSize;
    
    onViewStateChange({
      zoom: newZoom,
      center: { x: newCenterX, y: newCenterY }
    });
  };
  
  // Start panning
  const startPan = (clientX, clientY) => {
    if (!mapData) return;
    setIsPanning(true);
    setPanStart({ 
      x: clientX, 
      y: clientY, 
      centerX: mapData.viewState.center.x, 
      centerY: mapData.viewState.center.y 
    });
  };
  
  // Update pan (mouse/space key pan)
  const updatePan = (clientX, clientY) => {
    if (!isPanning || !panStart || !mapData) return;
    if (!geometry) return;
    
    const deltaX = clientX - panStart.x;
    const deltaY = clientY - panStart.y;
    
    const { gridSize, viewState, northDirection } = mapData;
    const { zoom, center } = viewState;
    
    const angleRad = (-northDirection * Math.PI) / 180;
    const rotatedDeltaX = deltaX * Math.cos(angleRad) - deltaY * Math.sin(angleRad);
    const rotatedDeltaY = deltaX * Math.sin(angleRad) + deltaY * Math.cos(angleRad);
    
    // Calculate delta based on geometry type
    let gridDeltaX, gridDeltaY;
    if (geometry instanceof GridGeometry) {
      // Grid: center is in grid cells, divide by scaledGridSize
      const scaledGridSize = geometry.getScaledCellSize(zoom);
      gridDeltaX = -rotatedDeltaX / scaledGridSize;
      gridDeltaY = -rotatedDeltaY / scaledGridSize;
    } else {
      // Hex: center is in world pixels, divide by zoom only
      gridDeltaX = -rotatedDeltaX / zoom;
      gridDeltaY = -rotatedDeltaY / zoom;
    }
    
    onViewStateChange({
      zoom: viewState.zoom,
      center: {
        x: center.x + gridDeltaX,
        y: center.y + gridDeltaY
      }
    });
    
    setPanStart({ x: clientX, y: clientY, centerX: center.x + gridDeltaX, centerY: center.y + gridDeltaY });
  };
  
  // Stop panning
  const stopPan = () => {
    setIsPanning(false);
    setPanStart(null);
  };
  
  // Start touch pan
  const startTouchPan = (center) => {
    setIsTouchPanning(true);
    setTouchPanStart(center);
  };
  
  // Update touch pan with pinch zoom
  const updateTouchPan = (touches) => {
    if (!isTouchPanning || !touchPanStart || !mapData) return;
    if (!geometry) return;
    
    const center = getTouchCenter(touches);
    const distance = getTouchDistance(touches);
    if (!center || !distance) return;
    
    const deltaX = center.x - touchPanStart.x;
    const deltaY = center.y - touchPanStart.y;
    
    const { gridSize, viewState, northDirection } = mapData;
    const { zoom, center: viewCenter } = viewState;
    

    
    const angleRad = (-northDirection * Math.PI) / 180;
    const rotatedDeltaX = deltaX * Math.cos(angleRad) - deltaY * Math.sin(angleRad);
    const rotatedDeltaY = deltaX * Math.sin(angleRad) + deltaY * Math.cos(angleRad);
    
    // Calculate delta based on geometry type
    let gridDeltaX, gridDeltaY;
    if (geometry instanceof GridGeometry) {
      // Grid: center is in grid cells, divide by scaledGridSize
      const scaledGridSize = geometry.getScaledCellSize(zoom);
      gridDeltaX = -rotatedDeltaX / scaledGridSize;
      gridDeltaY = -rotatedDeltaY / scaledGridSize;
    } else {
      // Hex: center is in world pixels, divide by zoom only
      gridDeltaX = -rotatedDeltaX / zoom;
      gridDeltaY = -rotatedDeltaY / zoom;
    }
    let newZoom = zoom;
    if (initialPinchDistance) {
      const scale = distance / initialPinchDistance;
      newZoom = Math.max(DEFAULTS.minZoom, Math.min(4, zoom * scale));
    }
    
    onViewStateChange({
      zoom: newZoom,
      center: {
        x: viewCenter.x + gridDeltaX,
        y: viewCenter.y + gridDeltaY
      }
    });
    
    setTouchPanStart(center);
    setInitialPinchDistance(distance);
  };
  
  // Stop touch pan
  const stopTouchPan = () => {
    setIsTouchPanning(false);
    setTouchPanStart(null);
    setInitialPinchDistance(null);
  };
  
  // Space key handlers
  dc.useEffect(() => {
    // Don't attach listeners if not focused
    if (!focused) {
      // Clear space key state when losing focus
      if (spaceKeyPressed) {
        setSpaceKeyPressed(false);
        if (isPanning) {
          stopPan();
        }
      }
      return;
    }
    
    const handleSpaceDown = (e) => {
      // Only track space key when focused, and only if not typing in an input
      if (e.key === ' ' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        setSpaceKeyPressed(true);
      }
    };
    
    const handleSpaceUp = (e) => {
      if (e.key === ' ') {
        setSpaceKeyPressed(false);
        // If we were panning with space, stop panning
        if (isPanning) {
          stopPan();
        }
      }
    };
    
    window.addEventListener('keydown', handleSpaceDown);
    window.addEventListener('keyup', handleSpaceUp);
    return () => {
      window.removeEventListener('keydown', handleSpaceDown);
      window.removeEventListener('keyup', handleSpaceUp);
    };
  }, [focused, isPanning, spaceKeyPressed]);
  
  return {
    // State
    isPanning,
    isTouchPanning,
    panStart,
    touchPanStart,
    spaceKeyPressed,
    initialPinchDistance,
    lastTouchTimeRef,
    
    // Coordinate helpers
    getClientCoords,
    getTouchCenter,
    getTouchDistance,
    screenToGrid,
    screenToWorld,
    
    // Zoom handlers
    handleWheel,
    
    // Pan handlers
    startPan,
    updatePan,
    stopPan,
    startTouchPan,
    updateTouchPan,
    stopTouchPan,
    
    // Setters (for external control)
    setIsPanning,
    setIsTouchPanning,
    setPanStart,
    setTouchPanStart,
    setInitialPinchDistance,
    setSpaceKeyPressed
  };
}

return { useCanvasInteraction };
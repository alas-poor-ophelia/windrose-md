/**
 * useImageAlignment.js
 * 
 * Hook for handling interactive background image alignment.
 * Provides drag-to-position functionality for background images
 * while preserving pan/zoom interactions.
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useEventHandlerRegistration } = await requireModuleByName("EventHandlerContext.jsx");

function useImageAlignment({
  mapData,
  geometry,
  canvasRef,
  isAlignmentMode,
  imageOffsetX,
  imageOffsetY,
  onOffsetChange
}) {
  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();
  
  // Track dragging state
  const [isDraggingImage, setIsDraggingImage] = dc.useState(false);
  const [dragStartOffset, setDragStartOffset] = dc.useState({ x: 0, y: 0 });
  const [dragStartClient, setDragStartClient] = dc.useState({ x: 0, y: 0 });
  
  /**
   * Check if a screen point is over the background image
   */
  const isPointOverImage = dc.useCallback((clientX, clientY) => {
    if (!mapData?.backgroundImage?.path) return false;
    if (!canvasRef.current) return false;
    if (!geometry) return false;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    // For now, we'll check if the point is within the canvas
    // The image is rendered and we just need to detect if user is clicking on it
    // Since the image is typically centered and visible, we can use a simple check
    
    // TODO: Could make this more precise by checking actual image bounds
    // For now, assume any click on canvas in alignment mode is for image dragging
    return isAlignmentMode && x >= 0 && y >= 0 && x <= canvas.width && y <= canvas.height;
  }, [mapData, canvasRef, geometry, isAlignmentMode]);
  
  /**
   * Handle mouse/touch start for image dragging
   */
  const handleImageDragStart = dc.useCallback((e) => {
    if (!isAlignmentMode) return null;
    
    // Check for two-finger touch - let pan/zoom handle it
    if (e.touches && e.touches.length > 1) {
      return null;
    }
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    if (!isPointOverImage(clientX, clientY)) {
      return null;
    }
    
    setIsDraggingImage(true);
    setDragStartOffset({ x: imageOffsetX, y: imageOffsetY });
    setDragStartClient({ x: clientX, y: clientY });
    
    return { handled: true };
  }, [isAlignmentMode, imageOffsetX, imageOffsetY, isPointOverImage]);
  
  /**
   * Handle mouse/touch move for image dragging
   */
  const handleImageDragMove = dc.useCallback((e) => {
    if (!isDraggingImage) return null;
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    const dx = clientX - dragStartClient.x;
    const dy = clientY - dragStartClient.y;
    
    // Update offset in real-time
    const newOffsetX = Math.round(dragStartOffset.x + dx);
    const newOffsetY = Math.round(dragStartOffset.y + dy);
    
    onOffsetChange(newOffsetX, newOffsetY);
    
    return { handled: true };
  }, [isDraggingImage, dragStartClient, dragStartOffset, onOffsetChange]);
  
  /**
   * Handle mouse/touch end for image dragging
   */
  const handleImageDragEnd = dc.useCallback((e) => {
    if (!isDraggingImage) return null;
    
    setIsDraggingImage(false);
    
    return { handled: true };
  }, [isDraggingImage]);
  
  // Register handlers when in alignment mode
  dc.useEffect(() => {
    if (!isAlignmentMode) {
      unregisterHandlers('imageAlignment');
      return;
    }
    
    registerHandlers('imageAlignment', {
      handlePointerDown: handleImageDragStart,
      handlePointerMove: handleImageDragMove,
      handlePointerUp: handleImageDragEnd
    });
    
    return () => {
      unregisterHandlers('imageAlignment');
    };
  }, [isAlignmentMode, handleImageDragStart, handleImageDragMove, handleImageDragEnd, registerHandlers, unregisterHandlers]);
  
  return {
    isDraggingImage
  };
}

return { useImageAlignment };
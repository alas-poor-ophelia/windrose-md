/**
 * useImageAlignment.ts
 *
 * Hook for handling interactive background image alignment.
 * Provides drag-to-position functionality for background images
 * while preserving pan/zoom interactions.
 */

// Type-only imports
import type { MapData } from '#types/core/map.types';
import type { IGeometry } from '#types/core/geometry.types';
import type {
  UseImageAlignmentOptions,
  UseImageAlignmentResult,
  DragOffset,
  DragClientPosition,
  ImageDragHandlerResult,
} from '#types/hooks/imageAlignment.types';

// Datacore imports
const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useEventHandlerRegistration } = await requireModuleByName("EventHandlerContext.jsx") as {
  useEventHandlerRegistration: () => {
    registerHandlers: (layer: string, handlers: Record<string, unknown>) => void;
    unregisterHandlers: (layer: string) => void;
  };
};

function useImageAlignment({
  mapData,
  geometry,
  canvasRef,
  isAlignmentMode,
  imageOffsetX,
  imageOffsetY,
  onOffsetChange
}: UseImageAlignmentOptions): UseImageAlignmentResult {
  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();

  // Track dragging state
  const [isDraggingImage, setIsDraggingImage] = dc.useState<boolean>(false);
  const [dragStartOffset, setDragStartOffset] = dc.useState<DragOffset>({ x: 0, y: 0 });
  const [dragStartClient, setDragStartClient] = dc.useState<DragClientPosition>({ x: 0, y: 0 });

  /**
   * Check if a screen point is over the background image
   */
  const isPointOverImage = dc.useCallback((clientX: number, clientY: number): boolean => {
    if (!mapData?.backgroundImage?.path) return false;
    if (!canvasRef.current) return false;
    if (!geometry) return false;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    // For now, assume any click on canvas in alignment mode is for image dragging
    return isAlignmentMode && x >= 0 && y >= 0 && x <= canvas.width && y <= canvas.height;
  }, [mapData, canvasRef, geometry, isAlignmentMode]);

  /**
   * Handle mouse/touch start for image dragging
   */
  const handleImageDragStart = dc.useCallback((e: MouseEvent | TouchEvent): ImageDragHandlerResult | null => {
    if (!isAlignmentMode) return null;

    // Check for two-finger touch - let pan/zoom handle it
    if ('touches' in e && e.touches.length > 1) {
      return null;
    }

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

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
  const handleImageDragMove = dc.useCallback((e: MouseEvent | TouchEvent): ImageDragHandlerResult | null => {
    if (!isDraggingImage) return null;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

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
  const handleImageDragEnd = dc.useCallback((e: MouseEvent | TouchEvent): ImageDragHandlerResult | null => {
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

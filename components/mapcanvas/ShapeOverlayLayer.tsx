/**
 * ShapeOverlayLayer.tsx
 *
 * Interaction layer for placing shape overlays (square/circle).
 * Registers handlers with EventHandlerContext and renders
 * a preview overlay canvas during 2-click placement.
 */

import type { ToolId } from '#types/tools/tool.types';
import type { ShapeOverlay } from '#types/core/map.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useMapState } = await requireModuleByName("MapContext.tsx");
const { useMapSelection } = await requireModuleByName("MapSelectionContext.tsx");
const { useEventHandlerRegistration } = await requireModuleByName("EventHandlerContext.tsx");
const { useShapeOverlayTools } = await requireModuleByName("useShapeOverlayTools.ts");
const { buildShapeOverlayActions } = await requireModuleByName("useSelectionActions.ts");
const { SelectionActionsOverlay } = await requireModuleByName("SelectionActionsOverlay.tsx");
const { ShapePreviewOverlay } = await requireModuleByName("ShapePreviewOverlay.tsx");

interface ShapeOverlayLayerProps {
  currentTool: ToolId;
  selectedColor: string;
  selectedOpacity: number;
  onShapeOverlaysChange: (shapeOverlays: ShapeOverlay[]) => void;
}

const ShapeOverlayLayer = ({
  currentTool,
  selectedColor,
  selectedOpacity,
  onShapeOverlaysChange
}: ShapeOverlayLayerProps): React.ReactElement | null => {
  const { canvasRef, containerRef, mapData, geometry, screenToWorld } = useMapState();
  const { selectedItem, isDraggingSelection } = useMapSelection();
  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();

  const isShapeTool = currentTool === 'shape';
  const isShapeSelected = selectedItem?.type === 'shapeOverlay' && !isDraggingSelection;

  const {
    preview,
    handlePointerDown,
    handlePointerMove,
    cancelPlacement,
    handleShapeSelection,
    handleShapeDragging,
    stopShapeDragging,
    deleteShapeOverlay,
    updateShapeOverlay,
    activeShape,
    setActiveShape
  } = useShapeOverlayTools({
    currentTool,
    selectedColor,
    selectedOpacity,
    mapData,
    geometry,
    screenToWorld,
    onShapeOverlaysChange
  });

  // Register handlers via Proxy pattern — always expose handleShapeSelection for select tool
  const shapeHandlersRef = dc.useRef<Record<string, unknown> | null>(null);
  shapeHandlersRef.current = isShapeTool
    ? { handlePointerDown, handlePointerMove, handleShapeSelection, handleShapeDragging, stopShapeDragging }
    : { handleShapeSelection, handleShapeDragging, stopShapeDragging };

  dc.useEffect(() => {
    const proxy = new Proxy({} as Record<string, unknown>, {
      get(_target, prop: string) {
        return shapeHandlersRef.current?.[prop];
      }
    });
    registerHandlers('shapeOverlay', proxy);
    return () => unregisterHandlers('shapeOverlay');
  }, []);

  // ESC to cancel placement
  dc.useEffect(() => {
    if (!isShapeTool) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelPlacement();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isShapeTool, cancelPlacement]);

  const distanceSettings = dc.useMemo(() => {
    if (!mapData) return null;
    const settings = mapData.settings?.overrides || {};
    return {
      distancePerCell: (settings.distancePerCell as number) || 5,
      distanceUnit: (settings.distanceUnit as string) || 'ft'
    };
  }, [mapData]);

  const [showShapeColorPicker, setShowShapeColorPicker] = dc.useState(false);
  const shapeColorBtnRef = dc.useRef<HTMLButtonElement>(null);

  const handleShapeColorClick = dc.useCallback(() => {
    setShowShapeColorPicker(prev => !prev);
  }, []);

  const handleShapeColorSelect = dc.useCallback((color: string) => {
    if (selectedItem?.type === 'shapeOverlay') {
      updateShapeOverlay(selectedItem.id, { color });
    }
  }, [selectedItem, updateShapeOverlay]);

  const handleShapeColorPickerClose = dc.useCallback(() => {
    setShowShapeColorPicker(false);
  }, []);

  const handleShapeDelete = dc.useCallback(() => {
    if (selectedItem?.type === 'shapeOverlay') {
      deleteShapeOverlay(selectedItem.id);
    }
  }, [selectedItem, deleteShapeOverlay]);

  const handleShapeFreeformToggle = dc.useCallback(() => {
    if (selectedItem?.type === 'shapeOverlay') {
      const shape = mapData?.shapeOverlays?.find(s => s.id === selectedItem.id);
      if (shape) {
        updateShapeOverlay(selectedItem.id, { freeform: !shape.freeform });
      }
    }
  }, [selectedItem, mapData, updateShapeOverlay]);

  // Shape tool options bar (follows region toolbar pattern) + preview overlay
  if (isShapeTool) {
    return (
      <>
      {preview && preview.corner1 && preview.corner2 && (
        <ShapePreviewOverlay
          shapeType="shapeSquare"
          startPoint={preview.corner1}
          endPoint={preview.corner2}
          geometry={geometry}
          mapData={mapData}
          canvasRef={canvasRef}
          containerRef={containerRef}
          distanceSettings={distanceSettings}
        />
      )}
      {preview && !preview.corner1 && (
        <ShapePreviewOverlay
          shapeType="shapeCircle"
          startPoint={preview.circleEdge || preview.center}
          endPoint={preview.circleCenter || preview.center}
          geometry={geometry}
          mapData={mapData}
          canvasRef={canvasRef}
          containerRef={containerRef}
          distanceSettings={distanceSettings}
        />
      )}
      <div style={{
        position: 'fixed',
        bottom: '100px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: '10px',
        background: 'var(--background-secondary)',
        border: '1px solid var(--background-modifier-border)',
        borderRadius: '8px',
        padding: '8px 16px',
        zIndex: 1000,
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        whiteSpace: 'nowrap'
      }}>
        <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Shape:</span>
        <button
          onClick={() => setActiveShape('square')}
          title="Square"
          style={{
            padding: '4px 12px',
            background: activeShape === 'square' ? 'var(--interactive-accent)' : 'transparent',
            color: activeShape === 'square' ? 'var(--text-on-accent)' : 'var(--text-accent)',
            borderRadius: '4px',
            border: '1px solid var(--background-modifier-border)',
            cursor: 'pointer',
            fontSize: '12px',
            minHeight: '32px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          <dc.Icon icon="lucide-square" />
        </button>
        <button
          onClick={() => setActiveShape('circle')}
          title="Circle"
          style={{
            padding: '4px 12px',
            background: activeShape === 'circle' ? 'var(--interactive-accent)' : 'transparent',
            color: activeShape === 'circle' ? 'var(--text-on-accent)' : 'var(--text-accent)',
            borderRadius: '4px',
            border: '1px solid var(--background-modifier-border)',
            cursor: 'pointer',
            fontSize: '12px',
            minHeight: '32px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          <dc.Icon icon="lucide-circle" />
        </button>
        <span style={{ color: 'var(--text-faint)', fontSize: '11px', margin: '0 4px' }}>|</span>
        <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
          {activeShape === 'square' ? 'Click two corners' : 'Click edge, then center'}
        </span>
      </div>
      </>
    );
  }

  // Selection overlay when a shape is selected
  if (!isShapeSelected || !selectedItem || !mapData || !geometry) return null;

  const shapeActions = buildShapeOverlayActions(selectedItem, {
    onColorClick: handleShapeColorClick,
    onDelete: handleShapeDelete,
    onFreeformToggle: handleShapeFreeformToggle
  });

  const selectedShape = mapData?.shapeOverlays?.find(s => s.id === selectedItem.id);

  return h(SelectionActionsOverlay, {
    selectedItems: [selectedItem],
    actions: shapeActions,
    mapData,
    canvasRef,
    containerRef,
    geometry,
    selectionType: 'shapeOverlay',
    showColorPicker: showShapeColorPicker,
    currentColor: selectedShape?.color,
    onColorSelect: handleShapeColorSelect,
    onColorPickerClose: handleShapeColorPickerClose,
    colorButtonRef: shapeColorBtnRef
  });
};

return { ShapeOverlayLayer };

/**
 * LayerControls.tsx
 *
 * Floating panel for z-layer management.
 * Provides controls for switching, adding, deleting, and reordering layers.
 */

import type { JSX } from 'preact';
import type { MapData, MapLayer } from '#types/core/map.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { getLayersOrdered } = await requireModuleByName("layerAccessor.ts");

/** Drag state for layer reordering */
interface DragState {
  layerId: string;
  index: number;
}

/** Props for LayerControls component */
export interface LayerControlsProps {
  /** Full map data object */
  mapData: MapData | null;
  /** Callback when layer is selected */
  onLayerSelect: (layerId: string) => void;
  /** Callback to add a new layer */
  onLayerAdd: () => void;
  /** Callback to delete a layer */
  onLayerDelete: (layerId: string) => void;
  /** Callback to reorder a layer */
  onLayerReorder: (layerId: string, newIndex: number) => void;
  /** Callback to toggle show layer below */
  onToggleShowLayerBelow: (layerId: string) => void;
  /** Callback to set layer below opacity */
  onSetLayerBelowOpacity: (layerId: string, opacity: number) => void;
  /** Whether object sidebar is collapsed */
  sidebarCollapsed: boolean;
  /** Whether the layer controls panel is open */
  isOpen?: boolean;
}

const LayerControls = ({
  mapData,
  onLayerSelect,
  onLayerAdd,
  onLayerDelete,
  onLayerReorder,
  onToggleShowLayerBelow,
  onSetLayerBelowOpacity,
  sidebarCollapsed,
  isOpen = true
}: LayerControlsProps): React.ReactElement => {
  const [expandedLayerId, setExpandedLayerId] = dc.useState<string | null>(null);
  const [dragState, setDragState] = dc.useState<DragState | null>(null);
  const [dragOverIndex, setDragOverIndex] = dc.useState<number | null>(null);
  const [sliderHoveredLayerId, setSliderHoveredLayerId] = dc.useState<string | null>(null);

  const longPressTimerRef = dc.useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = dc.useRef(false);
  const sliderHideTimeoutRef = dc.useRef<ReturnType<typeof setTimeout> | null>(null);

  const layers = getLayersOrdered(mapData) as MapLayer[];
  const reversedLayers = [...layers].reverse();
  const activeLayerId = mapData?.activeLayerId;

  const handleOverlayClick = (e: JSX.TargetedMouseEvent<HTMLDivElement> | JSX.TargetedTouchEvent<HTMLDivElement>): void => {
    e.stopPropagation();
    e.preventDefault();
    setExpandedLayerId(null);
  };

  dc.useEffect(() => {
    if (!expandedLayerId) return;

    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setExpandedLayerId(null);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [expandedLayerId]);

  const handleLayerClick = (layerId: string, e: JSX.TargetedMouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation();

    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }

    if (expandedLayerId === layerId) {
      setExpandedLayerId(null);
      return;
    }

    setExpandedLayerId(null);

    if (layerId !== activeLayerId) {
      onLayerSelect(layerId);
    }
  };

  const handleContextMenu = (layerId: string, e: JSX.TargetedMouseEvent<HTMLButtonElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    setExpandedLayerId(expandedLayerId === layerId ? null : layerId);
  };

  const handleTouchStart = (layerId: string): void => {
    longPressTriggeredRef.current = false;

    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      setExpandedLayerId(expandedLayerId === layerId ? null : layerId);
    }, 500);
  };

  const handleTouchEnd = (): void => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleDelete = (layerId: string, e: JSX.TargetedMouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation();

    if (layers.length <= 1) {
      return;
    }

    setExpandedLayerId(null);
    onLayerDelete(layerId);
  };

  const handleDragStart = (layerId: string, index: number, e: JSX.TargetedDragEvent<HTMLDivElement>): void => {
    setDragState({ layerId, index });
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', layerId);
    }
  };

  const handleDragOver = (index: number, e: JSX.TargetedDragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    setDragOverIndex(index);
  };

  const handleDragLeave = (): void => {
    setDragOverIndex(null);
  };

  const handleDrop = (targetIndex: number, e: JSX.TargetedDragEvent<HTMLDivElement>): void => {
    e.preventDefault();

    if (dragState && dragState.index !== targetIndex) {
      const visualLength = reversedLayers.length;
      const toOrderIndex = visualLength - 1 - targetIndex;
      onLayerReorder(dragState.layerId, toOrderIndex);
    }

    setDragState(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = (): void => {
    setDragState(null);
    setDragOverIndex(null);
  };

  const getLayerDisplayNumber = (layer: MapLayer): number => {
    return layer.order + 1;
  };

  const handleTransparencyToggle = (layerId: string, e: JSX.TargetedMouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation();
    onToggleShowLayerBelow(layerId);
  };

  const handleOpacityChange = (layerId: string, e: JSX.TargetedEvent<HTMLInputElement>): void => {
    const value = parseFloat((e.target as HTMLInputElement).value);
    onSetLayerBelowOpacity(layerId, value);
  };

  const handleSliderAreaEnter = (layerId: string): void => {
    if (sliderHideTimeoutRef.current) {
      clearTimeout(sliderHideTimeoutRef.current);
      sliderHideTimeoutRef.current = null;
    }
    setSliderHoveredLayerId(layerId);
  };

  const handleSliderAreaLeave = (): void => {
    sliderHideTimeoutRef.current = setTimeout(() => {
      setSliderHoveredLayerId(null);
    }, 150);
  };

  return (
    <>
      {expandedLayerId && (
        <div
          className="dmt-layer-overlay"
          onClick={handleOverlayClick}
          onContextMenu={handleOverlayClick}
          onMouseDown={handleOverlayClick}
          onTouchStart={handleOverlayClick}
        />
      )}

      <div
        className={`dmt-layer-controls ${sidebarCollapsed ? 'sidebar-closed' : 'sidebar-open'} ${isOpen ? 'dmt-layer-controls-open' : ''}`}
      >
        {reversedLayers.map((layer, visualIndex) => {
          const isActive = layer.id === activeLayerId;
          const isExpanded = layer.id === expandedLayerId;
          const isDragging = dragState?.layerId === layer.id;
          const isDragOver = dragOverIndex === visualIndex && dragState?.layerId !== layer.id;
          const canDelete = layers.length > 1;

          return (
            <div
              key={layer.id}
              className="dmt-layer-btn-wrapper"
              draggable
              onDragStart={(e) => handleDragStart(layer.id, visualIndex, e)}
              onDragOver={(e) => handleDragOver(visualIndex, e)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(visualIndex, e)}
              onDragEnd={handleDragEnd}
            >
              <button
                className={`dmt-layer-btn ${isActive ? 'dmt-layer-btn-active' : ''} ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
                onClick={(e) => handleLayerClick(layer.id, e)}
                onContextMenu={(e) => handleContextMenu(layer.id, e)}
                onTouchStart={() => handleTouchStart(layer.id)}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
                title={`${layer.name}${isActive ? ' (active)' : ''} - Right-click for options`}
              >
                {getLayerDisplayNumber(layer)}
              </button>

              <div className={`dmt-layer-options ${isExpanded ? 'expanded' : ''}`}>
                {canDelete && (
                  <button
                    className="dmt-layer-option-btn delete"
                    onClick={(e) => handleDelete(layer.id, e)}
                    title="Delete layer"
                  >
                    <dc.Icon icon="lucide-trash-2" />
                  </button>
                )}
                <div
                  className="dmt-layer-transparency-wrapper"
                  onMouseEnter={() => handleSliderAreaEnter(layer.id)}
                  onMouseLeave={handleSliderAreaLeave}
                >
                  <button
                    className={`dmt-layer-option-btn transparency ${layer.showLayerBelow ? 'active' : ''}`}
                    onClick={(e) => handleTransparencyToggle(layer.id, e)}
                    title={layer.showLayerBelow ? 'Hide layer below' : 'Show layer below'}
                  >
                    <dc.Icon icon="lucide-layers" />
                  </button>
                  {sliderHoveredLayerId === layer.id && layer.showLayerBelow && (
                    <div
                      className="dmt-opacity-slider-popup"
                      onMouseEnter={() => handleSliderAreaEnter(layer.id)}
                      onMouseLeave={handleSliderAreaLeave}
                    >
                      <input
                        type="range"
                        min="0.1"
                        max="0.5"
                        step="0.05"
                        value={layer.layerBelowOpacity ?? 0.25}
                        onChange={(e) => handleOpacityChange(layer.id, e)}
                        className="dmt-opacity-slider"
                      />
                      <span className="dmt-opacity-value">
                        {Math.round((layer.layerBelowOpacity ?? 0.25) * 100)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        <button
          className="dmt-layer-add-btn"
          onClick={onLayerAdd}
          title="Add new layer"
        >
          <dc.Icon icon="lucide-plus" />
        </button>
      </div>
    </>
  );
};

return { LayerControls };

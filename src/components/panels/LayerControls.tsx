/**
 * LayerControls.tsx
 *
 * Floating panel for z-layer management.
 * Provides controls for switching, adding, deleting, and reordering layers.
 */

import type { TargetedDragEvent, TargetedEvent, TargetedMouseEvent, VNode } from 'preact';
import type { MapData, MapLayer } from '#types/core/map.types';

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { getLayersOrdered } from '../../persistence/layerAccessor';
import { getIconInfo } from '../../assets/rpgAwesomeIcons';
import { Icon } from '../shared/Icon';






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
  /** Callback to open layer edit modal */
  onEditLayer: (layerId: string) => void;
  /** Callback to clone a layer */
  onLayerClone: (layerId: string) => void;
  /** Whether object sidebar is collapsed */
  sidebarCollapsed: boolean;
  /** Whether the layer controls panel is open */
  isOpen?: boolean;
  /** Optional pop-out button rendered in panel header */
  popoutButton?: VNode;
}



const LAYER_NAME_MAX_LENGTH = 25;
const LAYER_NAME_TRUNCATE_AT = 22;

const LayerControls = ({
  mapData,
  onLayerSelect,
  onLayerAdd,
  onLayerDelete,
  onLayerReorder,
  onToggleShowLayerBelow,
  onSetLayerBelowOpacity,
  onEditLayer,
  onLayerClone,
  sidebarCollapsed,
  isOpen = true,
  popoutButton
}: LayerControlsProps): VNode => {
  const [expandedLayerId, setExpandedLayerId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [sliderHoveredLayerId, setSliderHoveredLayerId] = useState<string | null>(null);

  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const sliderHideTimeoutRef = useRef<number | null>(null);

  const layers = getLayersOrdered(mapData);
  const reversedLayers = [...layers].reverse();
  const activeLayerId = mapData?.activeLayerId;

  const controlsRef = useRef<HTMLDivElement>(null);

  useEffect((): (() => void) | undefined => {
    if (expandedLayerId == null || expandedLayerId === '') return undefined;

    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setExpandedLayerId(null);
      }
    };

    const handleClickOutside = (e: PointerEvent): void => {
      if (controlsRef.current && !controlsRef.current.contains(e.target as Node)) {
        setExpandedLayerId(null);
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.addEventListener('pointerdown', handleClickOutside, true);
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('pointerdown', handleClickOutside, true);
    };
  }, [expandedLayerId]);

  const handleLayerClick = (layerId: string, e: TargetedMouseEvent<HTMLButtonElement>): void => {
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

  const handleContextMenu = (layerId: string, e: TargetedMouseEvent<HTMLButtonElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    setExpandedLayerId(expandedLayerId === layerId ? null : layerId);
  };

  const handleTouchStart = (layerId: string): void => {
    longPressTriggeredRef.current = false;

    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      setExpandedLayerId(expandedLayerId === layerId ? null : layerId);
    }, 500);
  };

  const handleTouchEnd = (): void => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleDelete = (layerId: string, e: TargetedMouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation();

    if (layers.length <= 1) {
      return;
    }

    setExpandedLayerId(null);
    onLayerDelete(layerId);
  };

  const handleDragStart = (layerId: string, index: number, e: TargetedDragEvent<HTMLDivElement>): void => {
    setDragState({ layerId, index });
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', layerId);
    }
  };

  const handleDragOver = (index: number, e: TargetedDragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    setDragOverIndex(index);
  };

  const handleDragLeave = (): void => {
    setDragOverIndex(null);
  };

  const handleDrop = (targetIndex: number, e: TargetedDragEvent<HTMLDivElement>): void => {
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

  const getLayerNumber = (layer: MapLayer): string => {
    return String(layer.order + 1);
  };

  const isDefaultName = (layer: MapLayer): boolean => {
    const num = getLayerNumber(layer);
    return !layer.name || layer.name === num;
  };

  const getLayerDisplayName = (layer: MapLayer): string => {
    if (isDefaultName(layer)) {
      return getLayerNumber(layer);
    }
    return layer.name.length > LAYER_NAME_MAX_LENGTH
      ? layer.name.slice(0, LAYER_NAME_TRUNCATE_AT) + '...'
      : layer.name;
  };

  const shouldShowPill = (layer: MapLayer): boolean => {
    return !isDefaultName(layer) || (layer.icon != null && layer.icon !== '');
  };

  const getLayerIcon = (layer: MapLayer): { char: string; isRpgAwesome: boolean } | null => {
    if (layer.icon == null || layer.icon === '') return null;
    if (layer.icon.startsWith('ra-')) {
      const info = getIconInfo(layer.icon);
      return info ? { char: info.char, isRpgAwesome: true } : null;
    }
    return { char: layer.icon, isRpgAwesome: false };
  };

  const layerDisplayInfo = useMemo(() => {
    return new Map(layers.map(layer => [
      layer.id,
      {
        isPill: shouldShowPill(layer),
        icon: getLayerIcon(layer),
        displayName: getLayerDisplayName(layer)
      }
    ]));
  }, [layers]);

  const handleEdit = (layerId: string, e: TargetedMouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation();
    setExpandedLayerId(null);
    onEditLayer(layerId);
  };

  const handleClone = (layerId: string, e: TargetedMouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation();
    setExpandedLayerId(null);
    onLayerClone(layerId);
  };

  const handleTransparencyToggle = (layerId: string, e: TargetedMouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation();
    onToggleShowLayerBelow(layerId);
  };

  const handleOpacityChange = (layerId: string, e: TargetedEvent<HTMLInputElement>): void => {
    const value = parseFloat((e.target as HTMLInputElement).value);
    onSetLayerBelowOpacity(layerId, value);
  };

  const handleSliderAreaEnter = (layerId: string): void => {
    if (sliderHideTimeoutRef.current) {
      window.clearTimeout(sliderHideTimeoutRef.current);
      sliderHideTimeoutRef.current = null;
    }
    setSliderHoveredLayerId(layerId);
  };

  const handleSliderAreaLeave = (): void => {
    sliderHideTimeoutRef.current = window.setTimeout(() => {
      setSliderHoveredLayerId(null);
    }, 150);
  };

  return (
      <div
        ref={controlsRef}
        className={`windrose-layer-controls ${sidebarCollapsed ? 'sidebar-closed' : 'sidebar-open'} ${isOpen ? 'windrose-layer-controls-open' : ''}`}
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
              className="windrose-layer-btn-wrapper"
              draggable
              onDragStart={(e) => handleDragStart(layer.id, visualIndex, e)}
              onDragOver={(e) => handleDragOver(visualIndex, e)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(visualIndex, e)}
              onDragEnd={handleDragEnd}
            >
              {(() => {
                const info = layerDisplayInfo.get(layer.id);
                if (info == null) return null;
                return (
                  <button
                    className={`windrose-layer-btn ${info.isPill ? 'windrose-layer-btn-pill' : ''} ${isActive ? 'windrose-layer-btn-active' : ''} ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
                    onClick={(e) => handleLayerClick(layer.id, e)}
                    onContextMenu={(e) => handleContextMenu(layer.id, e)}
                    onTouchStart={() => handleTouchStart(layer.id)}
                    onTouchEnd={handleTouchEnd}
                    onTouchCancel={handleTouchEnd}
                    title={`${layer.name}${isActive ? ' (active)' : ''} - Right-click for options`}
                  >
                    {info.icon && (
                      <span className={`windrose-layer-icon ${info.icon.isRpgAwesome ? 'ra' : ''}`}>
                        {info.icon.char}
                      </span>
                    )}
                    <span className="windrose-layer-name">{info.displayName}</span>
                  </button>
                );
              })()}

              <div className={`windrose-layer-options ${isExpanded ? 'expanded' : ''}`}>
                <button
                  className="windrose-layer-option-btn edit"
                  onClick={(e) => handleEdit(layer.id, e)}
                  title="Edit layer"
                >
                  <Icon icon="lucide-pencil" />
                </button>
                <button
                  className="windrose-layer-option-btn clone"
                  onClick={(e) => handleClone(layer.id, e)}
                  title="Clone layer"
                >
                  <Icon icon="lucide-copy" />
                </button>
                {canDelete && (
                  <button
                    className="windrose-layer-option-btn delete"
                    onClick={(e) => handleDelete(layer.id, e)}
                    title="Delete layer"
                  >
                    <Icon icon="lucide-trash-2" />
                  </button>
                )}
                <div
                  className="windrose-layer-transparency-wrapper"
                  onMouseEnter={() => handleSliderAreaEnter(layer.id)}
                  onMouseLeave={handleSliderAreaLeave}
                >
                  <button
                    className={`windrose-layer-option-btn transparency ${layer.showLayerBelow === true ? 'active' : ''}`}
                    onClick={(e) => handleTransparencyToggle(layer.id, e)}
                    title={layer.showLayerBelow === true ? 'Hide layer below' : 'Show layer below'}
                  >
                    <Icon icon="lucide-layers" />
                  </button>
                  {sliderHoveredLayerId === layer.id && layer.showLayerBelow === true && (
                    <div
                      className="windrose-opacity-slider-popup"
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
                        className="windrose-opacity-slider"
                      />
                      <span className="windrose-opacity-value">
                        {Math.round((layer.layerBelowOpacity ?? 0.25) * 100)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        <div className="windrose-layer-controls-footer">
          <button
            className="windrose-layer-add-btn"
            onClick={onLayerAdd}
            title="Add new layer"
          >
            <Icon icon="lucide-plus" />
          </button>
          {popoutButton}
        </div>
      </div>
  );
};

export { LayerControls };
import type { JSX, VNode } from 'preact';
import type { MapData, MapLayer } from '#types/core/map.types';

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { getLayersOrdered } from '../../persistence/layerAccessor';
import { getIconInfo } from '../../assets/rpgAwesomeIcons';
import { Icon } from '../shared/Icon';

interface DragState {
  layerId: string;
  index: number;
}

interface DockLayerListProps {
  mapData: MapData | null;
  onLayerSelect: (layerId: string) => void;
  onLayerAdd: () => void;
  onLayerDelete: (layerId: string) => void;
  onLayerReorder: (layerId: string, newIndex: number) => void;
  onToggleShowLayerBelow: (layerId: string) => void;
  onSetLayerBelowOpacity: (layerId: string, opacity: number) => void;
  onEditLayer: (layerId: string) => void;
  onLayerClone: (layerId: string) => void;
}

const DockLayerList = ({
  mapData,
  onLayerSelect,
  onLayerAdd,
  onLayerDelete,
  onLayerReorder,
  onToggleShowLayerBelow,
  onSetLayerBelowOpacity,
  onEditLayer,
  onLayerClone,
}: DockLayerListProps): VNode => {
  const [expandedLayerId, setExpandedLayerId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const listRef = useRef<HTMLDivElement>(null);

  const layers = getLayersOrdered(mapData);
  const reversedLayers = [...layers].reverse();
  const activeLayerId = mapData?.activeLayerId;

  useEffect((): (() => void) | undefined => {
    if (expandedLayerId == null) return undefined;

    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setExpandedLayerId(null);
    };
    const handleClickOutside = (e: PointerEvent): void => {
      if (listRef.current && !listRef.current.contains(e.target as Node)) {
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

  const getLayerIcon = (layer: MapLayer): { char: string; isRpgAwesome: boolean } | null => {
    if (layer.icon == null || layer.icon === '') return null;
    if (layer.icon.startsWith('ra-')) {
      const info = getIconInfo(layer.icon);
      return info ? { char: info.char, isRpgAwesome: true } : null;
    }
    return { char: layer.icon, isRpgAwesome: false };
  };

  const layerInfo = useMemo(() => {
    return new Map(layers.map(layer => [
      layer.id,
      {
        icon: getLayerIcon(layer),
        displayName: layer.name || String(layer.order + 1),
      }
    ]));
  }, [layers]);

  const handleRowClick = (layerId: string): void => {
    if (layerId !== activeLayerId) {
      onLayerSelect(layerId);
    }
  };

  const handleExpandToggle = (layerId: string, e: JSX.TargetedMouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation();
    setExpandedLayerId(expandedLayerId === layerId ? null : layerId);
  };

  const handleDelete = (layerId: string, e: JSX.TargetedMouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation();
    if (layers.length <= 1) return;
    setExpandedLayerId(null);
    onLayerDelete(layerId);
  };

  const handleEdit = (layerId: string, e: JSX.TargetedMouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation();
    setExpandedLayerId(null);
    onEditLayer(layerId);
  };

  const handleClone = (layerId: string, e: JSX.TargetedMouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation();
    setExpandedLayerId(null);
    onLayerClone(layerId);
  };

  const handleTransparencyToggle = (layerId: string, e: JSX.TargetedMouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation();
    onToggleShowLayerBelow(layerId);
  };

  const handleOpacityChange = (layerId: string, e: JSX.TargetedEvent<HTMLInputElement>): void => {
    const value = parseFloat((e.target as HTMLInputElement).value);
    onSetLayerBelowOpacity(layerId, value);
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
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDrop = (targetIndex: number, e: JSX.TargetedDragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    if (dragState && dragState.index !== targetIndex) {
      const toOrderIndex = reversedLayers.length - 1 - targetIndex;
      onLayerReorder(dragState.layerId, toOrderIndex);
    }
    setDragState(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = (): void => {
    setDragState(null);
    setDragOverIndex(null);
  };

  return (
    <div ref={listRef} className="windrose-dock-layers">
      {reversedLayers.map((layer, visualIndex) => {
        const isActive = layer.id === activeLayerId;
        const isExpanded = expandedLayerId === layer.id;
        const isDragging = dragState?.layerId === layer.id;
        const isDragOver = dragOverIndex === visualIndex && dragState?.layerId !== layer.id;
        const canDelete = layers.length > 1;
        const info = layerInfo.get(layer.id);
        if (info == null) return null;

        return (
          <div
            key={layer.id}
            className={`windrose-dock-layer-row${isActive ? ' active' : ''}${isDragging ? ' dragging' : ''}${isDragOver ? ' drag-over' : ''}`}
            draggable
            onDragStart={(e) => handleDragStart(layer.id, visualIndex, e)}
            onDragOver={(e) => handleDragOver(visualIndex, e)}
            onDragLeave={() => setDragOverIndex(null)}
            onDrop={(e) => handleDrop(visualIndex, e)}
            onDragEnd={handleDragEnd}
            onClick={() => handleRowClick(layer.id)}
          >
            <div className="windrose-dock-layer-main">
              <span className="windrose-dock-layer-grip">
                <Icon icon="lucide-grip-vertical" size={12} />
              </span>

              {info.icon && (
                <span className={`windrose-dock-layer-icon ${info.icon.isRpgAwesome ? 'ra' : ''}`}>
                  {info.icon.char}
                </span>
              )}

              <span className="windrose-dock-layer-name">{info.displayName}</span>

              <button
                className={`windrose-dock-layer-action transparency${layer.showLayerBelow === true ? ' active' : ''}`}
                onClick={(e) => handleTransparencyToggle(layer.id, e)}
                title={layer.showLayerBelow === true ? 'Hide layer below' : 'Show layer below'}
              >
                <Icon icon="lucide-layers" size={14} />
              </button>

              <button
                className={`windrose-dock-layer-action more${isExpanded ? ' active' : ''}`}
                onClick={(e) => handleExpandToggle(layer.id, e)}
                title="Layer actions"
              >
                <Icon icon="lucide-more-horizontal" size={14} />
              </button>
            </div>

            {isExpanded && (
              <div className="windrose-dock-layer-expanded">
                <div className="windrose-dock-layer-actions">
                  <button
                    className="windrose-dock-layer-action-btn"
                    onClick={(e) => handleEdit(layer.id, e)}
                    title="Edit layer"
                  >
                    <Icon icon="lucide-pencil" size={12} />
                    <span>Edit</span>
                  </button>
                  <button
                    className="windrose-dock-layer-action-btn"
                    onClick={(e) => handleClone(layer.id, e)}
                    title="Clone layer"
                  >
                    <Icon icon="lucide-copy" size={12} />
                    <span>Clone</span>
                  </button>
                  {canDelete && (
                    <button
                      className="windrose-dock-layer-action-btn delete"
                      onClick={(e) => handleDelete(layer.id, e)}
                      title="Delete layer"
                    >
                      <Icon icon="lucide-trash-2" size={12} />
                      <span>Delete</span>
                    </button>
                  )}
                </div>

                {layer.showLayerBelow === true && (
                  <div className="windrose-dock-layer-opacity">
                    <span className="windrose-dock-layer-opacity-label">Below opacity</span>
                    <input
                      type="range"
                      min="0.1"
                      max="0.5"
                      step="0.05"
                      value={layer.layerBelowOpacity ?? 0.25}
                      onChange={(e) => handleOpacityChange(layer.id, e)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className="windrose-dock-layer-opacity-value">
                      {Math.round((layer.layerBelowOpacity ?? 0.25) * 100)}%
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div className="windrose-dock-layer-footer">
        <button
          className="windrose-dock-layer-add"
          onClick={onLayerAdd}
          title="Add new layer"
        >
          <Icon icon="lucide-plus" size={14} />
          <span>Add Layer</span>
        </button>
      </div>
    </div>
  );
};

export { DockLayerList };
export type { DockLayerListProps };

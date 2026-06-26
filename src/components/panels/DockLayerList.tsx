import type { TargetedDragEvent, TargetedEvent, TargetedMouseEvent, VNode } from 'preact';
import type { MapData, MapLayer } from '#types/core/map.types';
import type { TileLayerRole } from '#types/tiles/tile.types';

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { getLayersOrdered, getActiveBoardId, getActiveBoardLayers, getBoardsOrdered } from '../../persistence/layerAccessor';
import { ROLE_META } from '../../assets/tileRoles';
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
  // Board / strata projection (Phase 7) — optional; when absent the panel is a flat list.
  onToggleStrataMode?: () => void;
  onBoardAdd?: () => void;
  onBoardSelect?: (boardId: string) => void;
  onBoardDelete?: (boardId: string) => void;
  onAddLayerToStratum?: (role: TileLayerRole) => void;
  onToggleLayerVisible?: (layerId: string) => void;
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
  onToggleStrataMode,
  onBoardAdd,
  onBoardSelect,
  onBoardDelete,
  onAddLayerToStratum,
  onToggleLayerVisible,
}: DockLayerListProps): VNode => {
  const [expandedLayerId, setExpandedLayerId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const listRef = useRef<HTMLDivElement>(null);

  const isStrata = mapData?.layerMode === 'strata' && onBoardSelect != null;
  const layers = getLayersOrdered(mapData);
  const reversedLayers = [...layers].reverse();
  const activeLayerId = mapData?.activeLayerId;

  const boards = getBoardsOrdered(mapData);
  const activeBoardId = getActiveBoardId(mapData);
  const boardLayers = getActiveBoardLayers(mapData);

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

    activeDocument.addEventListener('keydown', handleEscape);
    activeDocument.addEventListener('pointerdown', handleClickOutside, true);
    return () => {
      activeDocument.removeEventListener('keydown', handleEscape);
      activeDocument.removeEventListener('pointerdown', handleClickOutside, true);
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

  const handleExpandToggle = (layerId: string, e: TargetedMouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation();
    setExpandedLayerId(expandedLayerId === layerId ? null : layerId);
  };

  const handleDelete = (layerId: string, e: TargetedMouseEvent<HTMLButtonElement>, canDelete: boolean): void => {
    e.stopPropagation();
    if (!canDelete) return;
    setExpandedLayerId(null);
    onLayerDelete(layerId);
  };

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

  const handleVisibleToggle = (layerId: string, e: TargetedMouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation();
    onToggleLayerVisible?.(layerId);
  };

  const handleOpacityChange = (layerId: string, e: TargetedEvent<HTMLInputElement>): void => {
    const value = parseFloat((e.target as HTMLInputElement).value);
    onSetLayerBelowOpacity(layerId, value);
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
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDrop = (targetIndex: number, e: TargetedDragEvent<HTMLDivElement>): void => {
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

  // Shared layer-row renderer. `draggable` is enabled only in the flat (simple) list,
  // where reorder indices are well defined; `canDelete` gates the delete affordance.
  const renderRow = (layer: MapLayer, visualIndex: number, draggable: boolean, canDelete: boolean): VNode | null => {
    const isActive = layer.id === activeLayerId;
    const isExpanded = expandedLayerId === layer.id;
    const isDragging = dragState?.layerId === layer.id;
    const isDragOver = dragOverIndex === visualIndex && dragState?.layerId !== layer.id;
    const info = layerInfo.get(layer.id);
    if (info == null) return null;
    const isHidden = layer.visible === false;

    const dragProps = draggable
      ? {
          draggable: true,
          onDragStart: (e: TargetedDragEvent<HTMLDivElement>) => handleDragStart(layer.id, visualIndex, e),
          onDragOver: (e: TargetedDragEvent<HTMLDivElement>) => handleDragOver(visualIndex, e),
          onDragLeave: () => setDragOverIndex(null),
          onDrop: (e: TargetedDragEvent<HTMLDivElement>) => handleDrop(visualIndex, e),
          onDragEnd: handleDragEnd,
        }
      : {};

    return (
      <div
        key={layer.id}
        className={`windrose-dock-layer-row${isActive ? ' active' : ''}${isDragging ? ' dragging' : ''}${isDragOver ? ' drag-over' : ''}${isHidden ? ' hidden' : ''}`}
        {...dragProps}
        onClick={() => handleRowClick(layer.id)}
      >
        <div className="windrose-dock-layer-main">
          {draggable && (
            <span className="windrose-dock-layer-grip">
              <Icon icon="lucide-grip-vertical" size={12} />
            </span>
          )}

          {onToggleLayerVisible != null && (
            <button
              className={`windrose-dock-layer-action eye${isHidden ? '' : ' active'}`}
              onClick={(e) => handleVisibleToggle(layer.id, e)}
              title={isHidden ? 'Show layer' : 'Hide layer'}
            >
              <Icon icon={isHidden ? 'lucide-eye-off' : 'lucide-eye'} size={14} />
            </button>
          )}

          {info.icon && (
            <span className={`windrose-dock-layer-icon ${info.icon.isRpgAwesome ? 'ra' : ''}`}>
              {info.icon.char}
            </span>
          )}

          <span className="windrose-dock-layer-name">{info.displayName}</span>

          {!isStrata && (
            <button
              className={`windrose-dock-layer-action transparency${layer.showLayerBelow === true ? ' active' : ''}`}
              onClick={(e) => handleTransparencyToggle(layer.id, e)}
              title={layer.showLayerBelow === true ? 'Hide layer below' : 'Show layer below'}
            >
              <Icon icon="lucide-layers" size={14} />
            </button>
          )}

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
                  onClick={(e) => handleDelete(layer.id, e, canDelete)}
                  title="Delete layer"
                >
                  <Icon icon="lucide-trash-2" size={12} />
                  <span>Delete</span>
                </button>
              )}
            </div>

            {!isStrata && layer.showLayerBelow === true && (
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
  };

  // ---- Strata projection (Board → Stratum → Layer) ----
  if (isStrata) {
    const canDeleteBoard = boards.length > 1;
    return (
      <div ref={listRef} className="windrose-dock-layers strata">
        {/* Board (floor) switcher */}
        <div className="windrose-dock-board-bar">
          <select
            className="windrose-dock-board-select"
            value={activeBoardId}
            onChange={(e) => {
              const id = e.currentTarget.value;
              const board = boards.find(b => b.id === id);
              if (board) onBoardSelect?.(board.id);
            }}
            title="Switch floor"
          >
            {boards.map(board => (
              <option key={board.id} value={board.id}>{board.name}</option>
            ))}
          </select>
          <div className="windrose-dock-board-actions">
            {onBoardAdd != null && (
              <button className="windrose-dock-board-btn" onClick={onBoardAdd} title="Add floor">
                <Icon icon="lucide-plus" size={14} />
              </button>
            )}
            {canDeleteBoard && onBoardDelete != null && (
              <button
                className="windrose-dock-board-btn delete"
                onClick={() => onBoardDelete(activeBoardId)}
                title="Delete this floor"
              >
                <Icon icon="lucide-trash-2" size={14} />
              </button>
            )}
            {onToggleStrataMode != null && (
              <button className="windrose-dock-board-btn mode active" onClick={onToggleStrataMode} title="Switch to Simple layers">
                <Icon icon="lucide-list" size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Strata sections, one per canonical role */}
        {ROLE_META.map(role => {
          const stratumLayers = boardLayers
            .filter(l => (l.tileRole ?? 'ground') === role.id)
            .reverse(); // top-most first, matching the flat list's reverse
          return (
            <div key={role.id} className="windrose-dock-stratum" style={{ '--role-tint': `var(--windrose-depth-${role.id})` }}>
              <div className="windrose-dock-stratum-header">
                <span className="windrose-dock-stratum-dot" />
                <span className="windrose-dock-stratum-label">{role.label}</span>
                <span className="windrose-dock-stratum-count">{stratumLayers.length}</span>
                {onAddLayerToStratum != null && (
                  <button
                    className="windrose-dock-stratum-add"
                    onClick={() => onAddLayerToStratum(role.id)}
                    title={`Add a ${role.label} layer`}
                  >
                    <Icon icon="lucide-plus" size={12} />
                  </button>
                )}
              </div>
              {stratumLayers.length > 0 && (
                <div className="windrose-dock-stratum-layers">
                  {stratumLayers.map(layer => renderRow(layer, 0, false, boardLayers.length > 1))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ---- Simple mode: Boards-only floor list ----
  // For board-capable (tile) maps, Simple shows just the floors — pick / add /
  // delete a floor — with no per-layer rows; layer management lives in Strata.
  if (onBoardSelect != null) {
    const canDeleteBoard = boards.length > 1;
    return (
      <div ref={listRef} className="windrose-dock-layers simple-floors">
        <div className="windrose-dock-board-bar simple">
          <span className="windrose-dock-mode-label">Floors</span>
          {onToggleStrataMode != null && (
            <button className="windrose-dock-board-btn mode" onClick={onToggleStrataMode} title="Switch to Strata (layers)">
              <Icon icon="lucide-layers-3" size={14} />
            </button>
          )}
        </div>

        <div className="windrose-dock-floor-list">
          {boards.map(board => (
            <div
              key={board.id}
              className={`windrose-dock-floor-row ${board.id === activeBoardId ? 'active' : ''}`}
              onClick={() => onBoardSelect?.(board.id)}
              title={board.name}
            >
              <Icon icon="lucide-square-stack" size={14} />
              <span className="windrose-dock-floor-name">{board.name}</span>
              {canDeleteBoard && onBoardDelete != null && (
                <button
                  className="windrose-dock-floor-del"
                  onClick={(e) => { e.stopPropagation(); onBoardDelete(board.id); }}
                  title="Delete this floor"
                >
                  <Icon icon="lucide-trash-2" size={12} />
                </button>
              )}
            </div>
          ))}
        </div>

        {onBoardAdd != null && (
          <div className="windrose-dock-layer-footer">
            <button className="windrose-dock-layer-add" onClick={onBoardAdd} title="Add floor">
              <Icon icon="lucide-plus" size={14} />
              <span>Add Floor</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  // ---- Flat layer list — non-board maps keep today's behavior ----
  return (
    <div ref={listRef} className="windrose-dock-layers">
      {reversedLayers.map((layer, visualIndex) => renderRow(layer, visualIndex, true, layers.length > 1))}

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

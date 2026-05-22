/**
 * MultiSelectToolbar.tsx
 *
 * Simplified toolbar for multiple selected items.
 * Shows count badge + rotate all / duplicate all / delete all.
 */








/**
 * Calculate bounding box that encompasses all selected items
 */

import type { MapData } from '#types/core/map.types';
import type { ExtendedGeometry, SelectedItem } from '#types/contexts/context.types';

import type { VNode } from 'preact';
import { calculateObjectScreenPosition } from '../../objects/screenPositionUtils';
import { getActiveLayer } from '../../persistence/layerAccessor';
import { useToolbarPosition } from '../../hooks/interactions/useToolbarPosition';
import { Icon } from '../shared/Icon';
import { Z_INDEX } from '../../core/dmtConstants';

interface MultiSelectToolbarProps {
  selectedItems: SelectedItem[];
  selectionCount?: number;
  mapData: MapData | null;
  canvasRef: { current: HTMLCanvasElement | null } | null;
  containerRef: { current: HTMLElement | null } | null;
  geometry: ExtendedGeometry | null;
  onRotateAll?: () => void;
  onDuplicateAll?: () => void;
  onDeleteAll?: () => void;
}

function calculateMultiSelectBounds(
  selectedItems: SelectedItem[],
  mapData: MapData | null,
  canvasRef: { current: HTMLCanvasElement | null } | null,
  containerRef: { current: HTMLElement | null } | null,
  geometry: ExtendedGeometry | null
): { screenX: number; screenY: number; width: number; height: number } | null {
  if (!selectedItems?.length || !canvasRef?.current || !containerRef?.current || !mapData || !geometry) return null;

  const canvas = canvasRef.current;
  const { gridSize, viewState, northDirection } = mapData;
  if (!viewState) return null;
  const { zoom, center } = viewState;
  const scaledGridSize = (gridSize ?? 32) * zoom;

  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const offsetX = centerX - center.x * scaledGridSize;
  const offsetY = centerY - center.y * scaledGridSize;

  const rect = canvas.getBoundingClientRect();
  const containerRect = containerRef.current.getBoundingClientRect();
  const canvasOffsetX = rect.left - containerRect.left;
  const canvasOffsetY = rect.top - containerRect.top;
  const scaleX = rect.width / canvas.width;
  const scaleY = rect.height / canvas.height;

  const activeLayer = getActiveLayer(mapData);

  let minScreenX = Infinity;
  let minScreenY = Infinity;
  let maxScreenX = -Infinity;
  let maxScreenY = -Infinity;

  for (const item of selectedItems) {
    if (item.type === 'object') {
      const obj = activeLayer.objects?.find(o => o.id === item.id);
      if (!obj) continue;

      const pos = calculateObjectScreenPosition(obj, canvas, mapData, geometry, containerRef);
      if (!pos) continue;

      const left = pos.screenX - pos.objectWidth / 2;
      const right = pos.screenX + pos.objectWidth / 2;
      const top = pos.screenY - pos.objectHeight / 2;
      const bottom = pos.screenY + pos.objectHeight / 2;

      minScreenX = Math.min(minScreenX, left);
      maxScreenX = Math.max(maxScreenX, right);
      minScreenY = Math.min(minScreenY, top);
      maxScreenY = Math.max(maxScreenY, bottom);
    } else if (item.type === 'text') {
      const label = activeLayer.textLabels?.find(l => l.id === item.id);
      if (!label) continue;

      let screenX = offsetX + label.position.x * zoom;
      let screenY = offsetY + label.position.y * zoom;

      if (northDirection != null && northDirection !== 0) {
        const relX = screenX - centerX;
        const relY = screenY - centerY;
        const angleRad = (northDirection * Math.PI) / 180;
        const rotatedX = relX * Math.cos(angleRad) - relY * Math.sin(angleRad);
        const rotatedY = relX * Math.sin(angleRad) + relY * Math.cos(angleRad);
        screenX = centerX + rotatedX;
        screenY = centerY + rotatedY;
      }

      const fontSize = (label.fontSize || 16) * zoom;
      const approxWidth = fontSize * 3;
      const approxHeight = fontSize * 1.5;

      const left = (screenX * scaleX) + canvasOffsetX - approxWidth / 2;
      const right = (screenX * scaleX) + canvasOffsetX + approxWidth / 2;
      const top = (screenY * scaleY) + canvasOffsetY - approxHeight / 2;
      const bottom = (screenY * scaleY) + canvasOffsetY + approxHeight / 2;

      minScreenX = Math.min(minScreenX, left);
      maxScreenX = Math.max(maxScreenX, right);
      minScreenY = Math.min(minScreenY, top);
      maxScreenY = Math.max(maxScreenY, bottom);
    }
  }

  if (minScreenX === Infinity) return null;

  return {
    screenX: (minScreenX + maxScreenX) / 2,
    screenY: (minScreenY + maxScreenY) / 2,
    width: maxScreenX - minScreenX,
    height: maxScreenY - minScreenY
  };
}

const MultiSelectToolbar = ({
  selectedItems,
  selectionCount,
  mapData,
  canvasRef,
  containerRef,
  geometry,
  onRotateAll,
  onDuplicateAll,
  onDeleteAll
}: MultiSelectToolbarProps): VNode | null => {
  const hasRequiredRefs = !!selectedItems?.length && !!mapData && !!canvasRef?.current && !!containerRef?.current;
  const bounds = hasRequiredRefs
    ? calculateMultiSelectBounds(selectedItems, mapData, canvasRef, containerRef, geometry)
    : null;

  const buttonSize = 44;
  const buttonGap = 4;
  const countBadgeWidth = 80;
  const buttonCount = 3;
  const toolbarWidth = countBadgeWidth + buttonGap + buttonCount * buttonSize + (buttonCount - 1) * buttonGap;
  const toolbarHeight = buttonSize;

  const pos = useToolbarPosition({ bounds, containerRef: containerRef ?? { current: null }, toolbarWidth, toolbarHeight });
  if (!hasRequiredRefs || !bounds || !pos) return null;

  return (
    <div
      className="dmt-selection-toolbar dmt-multi-select-toolbar"
      style={{
        position: 'absolute',
        left: `${pos.toolbarX}px`,
        top: `${pos.toolbarY}px`,
        pointerEvents: 'auto',
        zIndex: Z_INDEX.TOOLBAR
      }}
    >
      <div className="dmt-selection-count">
        <Icon icon="lucide-box-select" size={14} />
        <span>{selectionCount ?? selectedItems.length} selected</span>
      </div>

      <button className="dmt-toolbar-button" onClick={onRotateAll} title="Rotate All 90°">
        <Icon icon="lucide-rotate-cw" />
      </button>

      <button className="dmt-toolbar-button" onClick={onDuplicateAll} title="Duplicate All">
        <Icon icon="lucide-copy" />
      </button>

      <button className="dmt-toolbar-button dmt-toolbar-delete-button" onClick={onDeleteAll} title="Delete All">
        <Icon icon="lucide-trash-2" />
      </button>
    </div>
  );
};

export { MultiSelectToolbar };
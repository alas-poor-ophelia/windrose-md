/**
 * TextSelectionToolbar.tsx
 *
 * Toolbar for selected text labels. Shows edit, rotate, copy link, delete.
 * Consumer: TextLayer only.
 */







/**
 * Calculate bounding box for a text label in screen coordinates
 */

import type { TargetedMouseEvent, VNode } from 'preact';
import type { MapData } from '#types/core/map.types';
import type { TextLabel } from '#types/objects/note.types';
import type { SelectedItem } from '#types/contexts/context.types';

import { getActiveLayer } from '../../persistence/layerAccessor';
import { useToolbarPosition } from '../../hooks/interactions/useToolbarPosition';
import { Icon } from '../shared/Icon';
import { Z_INDEX } from '../../core/dmtConstants';

type MouseClickEvent = TargetedMouseEvent<HTMLButtonElement>;

interface TextSelectionToolbarProps {
  selectedItem: SelectedItem | null;
  mapData: MapData | null;
  canvasRef: { current: HTMLCanvasElement | null } | null;
  containerRef: { current: HTMLElement | null } | null;
  onEdit?: (e?: MouseClickEvent) => void;
  onRotate?: (e?: MouseClickEvent) => void;
  onCopyLink?: (e?: MouseClickEvent) => void;
  onDelete?: (e?: MouseClickEvent) => void;
}

function calculateTextLabelBounds(
  label: TextLabel,
  canvasRef: { current: HTMLCanvasElement | null },
  containerRef: { current: HTMLElement | null } | null,
  mapData: MapData | null
): { screenX: number; screenY: number; width: number; height: number } | null {
  if (canvasRef.current == null || containerRef?.current == null || mapData == null) return null;

  const canvas = canvasRef.current;
  const { gridSize, viewState, northDirection } = mapData;
  if (viewState == null) return null;
  const { zoom, center } = viewState;
  const scaledGridSize = (gridSize ?? 32) * zoom;

  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const offsetX = centerX - center.x * scaledGridSize;
  const offsetY = centerY - center.y * scaledGridSize;

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

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const fontSize = label.fontSize * zoom;
  ctx.font = `${fontSize}px sans-serif`;
  const metrics = ctx.measureText(label.content);
  const textWidth = metrics.width;
  const textHeight = fontSize * 1.2;

  const labelAngle = ((label.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(labelAngle));
  const sin = Math.abs(Math.sin(labelAngle));
  const rotatedWidth = textWidth * cos + textHeight * sin;
  const rotatedHeight = textWidth * sin + textHeight * cos;

  const rect = canvas.getBoundingClientRect();
  const containerRect = containerRef.current.getBoundingClientRect();
  const canvasOffsetX = rect.left - containerRect.left;
  const canvasOffsetY = rect.top - containerRect.top;
  const scaleX = rect.width / canvas.width;
  const scaleY = rect.height / canvas.height;

  const paddingX = 4;
  const paddingY = 2;

  return {
    screenX: (screenX * scaleX) + canvasOffsetX,
    screenY: (screenY * scaleY) + canvasOffsetY,
    width: (rotatedWidth + paddingX * 2) * scaleX,
    height: (rotatedHeight + paddingY * 2) * scaleY
  };
}

const TextSelectionToolbar = ({
  selectedItem,
  mapData,
  canvasRef,
  containerRef,
  onEdit,
  onRotate,
  onCopyLink,
  onDelete
}: TextSelectionToolbarProps): VNode | null => {
  const hasRequiredInputs = !!selectedItem && selectedItem.type === 'text' && !!mapData && !!canvasRef?.current && !!containerRef?.current;

  const label = hasRequiredInputs
    ? getActiveLayer(mapData).textLabels?.find(l => l.id === selectedItem.id) ?? null
    : null;

  const bounds = hasRequiredInputs && label != null
    ? calculateTextLabelBounds(label, canvasRef, containerRef, mapData)
    : null;

  const buttonSize = 44;
  const buttonGap = 4;
  const buttons = [
    { id: 'edit', icon: 'lucide-pencil', title: 'Edit Text Label', onClick: onEdit },
    { id: 'rotate', icon: 'lucide-rotate-cw', title: 'Rotate 45° (or press R)', onClick: onRotate },
    { id: 'copyLink', icon: 'lucide-link', title: 'Copy link to clipboard', onClick: onCopyLink },
    { id: 'delete', icon: 'lucide-trash-2', title: 'Delete (or press Delete/Backspace)', onClick: onDelete, isDelete: true }
  ];

  const toolbarWidth = buttons.length * buttonSize + (buttons.length - 1) * buttonGap;
  const toolbarHeight = buttonSize;

  const pos = useToolbarPosition({ bounds, containerRef: containerRef ?? { current: null }, toolbarWidth, toolbarHeight });
  if (!hasRequiredInputs || !label || !bounds || !pos) return null;

  return (
    <div
      className="windrose-selection-toolbar"
      style={{
        position: 'absolute',
        left: `${pos.toolbarX}px`,
        top: `${pos.toolbarY}px`,
        width: `${toolbarWidth}px`,
        pointerEvents: 'auto',
        zIndex: Z_INDEX.TOOLBAR
      }}
    >
      {buttons.map((btn) => (
        <button
          key={btn.id}
          className={`windrose-toolbar-button${btn.isDelete === true ? ' windrose-toolbar-delete-button' : ''}`}
          onClick={(e) => btn.onClick?.(e)}
          title={btn.title}
        >
          <Icon icon={btn.icon} />
        </button>
      ))}
    </div>
  );
};

export { TextSelectionToolbar };
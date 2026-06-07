import type { ComponentChildren, VNode } from 'preact';
import type { TileLayerRole } from '#types/tiles/tile.types';

import { useCallback, useRef, useEffect, useState } from 'preact/hooks';
import { Icon } from '../shared/Icon';
import { DepthRibbon } from './DepthBar';

interface DrawerDockProps {
  open: boolean;
  onCollapse: () => void;
  onExpand: () => void;
  drawerWidth: number;
  onWidthChange?: (width: number) => void;
  minWidth?: number;
  maxWidth?: number;
  ribbonWidth: number;
  fold: boolean;
  compact: boolean;
  depth: TileLayerRole;
  onDepthChange: (depth: TileLayerRole) => void;
  hidden: Set<TileLayerRole>;
  onToggleHide: (depth: TileLayerRole) => void;
  tileCounts?: Record<TileLayerRole, number>;
  selectedTileName?: string | null;
  selectedTileThumb?: HTMLCanvasElement | null;
  children: ComponentChildren;
}

function SpineRibbon({ depth, onDepthChange, hidden, onToggleHide, tileCounts, onExpand, selectedTileName, selectedTileThumb, ribbonWidth }: {
  depth: TileLayerRole;
  onDepthChange: (d: TileLayerRole) => void;
  hidden: Set<TileLayerRole>;
  onToggleHide: (d: TileLayerRole) => void;
  tileCounts?: Record<TileLayerRole, number>;
  onExpand: () => void;
  selectedTileName?: string | null;
  selectedTileThumb?: HTMLCanvasElement | null;
  ribbonWidth: number;
}): VNode {
  const chipRef = useRef<HTMLDivElement>(null);
  const chipSize = ribbonWidth - 18;

  useEffect(() => {
    const el = chipRef.current;
    if (!el) return;
    el.innerHTML = '';
    if (selectedTileThumb) {
      const canvas = selectedTileThumb.cloneNode(true) as HTMLCanvasElement;
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.objectFit = 'cover';
      canvas.style.borderRadius = '3px';
      el.appendChild(canvas);
    }
  }, [selectedTileThumb]);

  return (
    <div className="windrose-tile-spine">
      <button
        className="windrose-tile-spine-expand"
        title="Expand tiles"
        onClick={onExpand}
      >
        <Icon icon="lucide-panel-left-open" size={15} />
      </button>
      <DepthRibbon
        active={depth}
        onPick={onDepthChange}
        hidden={hidden}
        onToggleHide={onToggleHide}
        tileCounts={tileCounts}
      />
      {selectedTileName && (
        <div
          className="windrose-tile-spine-loaded"
          title={`Loaded: ${selectedTileName}`}
        >
          <div
            ref={chipRef}
            className="windrose-tile-spine-chip"
            style={{ width: chipSize, height: chipSize }}
          />
        </div>
      )}
    </div>
  );
}

function DrawerDock({
  open,
  onCollapse,
  onExpand,
  drawerWidth,
  onWidthChange,
  minWidth = 180,
  maxWidth = 392,
  ribbonWidth,
  fold,
  compact,
  depth,
  onDepthChange,
  hidden,
  onToggleHide,
  tileCounts,
  selectedTileName,
  selectedTileThumb,
  children,
}: DrawerDockProps): VNode {
  const [resizing, setResizing] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const dockWidth = open ? drawerWidth : ribbonWidth;

  const handleResizeStart = useCallback((e: MouseEvent) => {
    if (!onWidthChange) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: drawerWidth };
    setResizing(true);
  }, [drawerWidth, onWidthChange]);

  useEffect(() => {
    if (!resizing) return;

    const handleMove = (e: MouseEvent) => {
      if (!dragRef.current || !onWidthChange) return;
      const delta = dragRef.current.startX - e.clientX;
      const newWidth = Math.round(
        Math.min(maxWidth, Math.max(minWidth, dragRef.current.startWidth + delta))
      );
      onWidthChange(newWidth);
    };

    const handleUp = () => {
      dragRef.current = null;
      setResizing(false);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
  }, [resizing, onWidthChange, minWidth, maxWidth]);

  const cls = [
    'windrose-tile-drawer',
    compact ? 'is-compact' : '',
    open ? 'is-open' : 'is-collapsed',
    resizing ? 'is-resizing' : '',
  ].filter(Boolean).join(' ');

  const transition = fold && !resizing
    ? 'width .42s cubic-bezier(.2,.8,.2,1)'
    : 'none';

  return (
    <div
      className={cls}
      style={{ width: dockWidth, transition }}
    >
      {/* Resize handle — left edge, only when open */}
      {open && onWidthChange && (
        <div
          className="windrose-tile-resize-handle"
          onMouseDown={handleResizeStart}
        />
      )}

      {/* Spine — always rendered underneath, right-pinned */}
      <div
        className="windrose-tile-spine-layer"
        style={{ width: ribbonWidth }}
      >
        <SpineRibbon
          depth={depth}
          onDepthChange={onDepthChange}
          hidden={hidden}
          onToggleHide={onToggleHide}
          tileCounts={tileCounts}
          onExpand={onExpand}
          selectedTileName={selectedTileName}
          selectedTileThumb={selectedTileThumb}
          ribbonWidth={ribbonWidth}
        />
      </div>

      {/* Full panel — right-pinned, clips off left edge as dock narrows */}
      <div
        className="windrose-tile-panel-layer"
        style={{
          width: drawerWidth,
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: fold && !resizing ? 'opacity .26s ease' : 'none',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export { DrawerDock };
export type { DrawerDockProps };

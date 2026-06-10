import type { ComponentChildren, VNode } from 'preact';
import type { TileLayerRole } from '#types/tiles/tile.types';

import { useCallback, useRef, useEffect, useState } from 'preact/hooks';
import { useApp } from '../../context/AppContext';
import { Icon } from '../shared/Icon';
import { DepthRibbon } from './DepthBar';

interface FlyoutTile {
  tilesetId: string;
  tileId: string;
  filename: string;
  vaultPath: string;
}

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
  flyoutRecent?: FlyoutTile[];
  flyoutStarred?: FlyoutTile[];
  onFlyoutSelect?: (tilesetId: string, tileId: string) => void;
  children: ComponentChildren;
}

function FlyoutThumb({ vaultPath }: { vaultPath: string }): VNode {
  const app = useApp();
  const src = app.vault.adapter.getResourcePath(vaultPath);
  return <img className="windrose-flyout-img" src={src} loading="lazy" />;
}

function FlyoutPreview({ tile }: { tile: FlyoutTile }): VNode {
  const app = useApp();
  const src = app.vault.adapter.getResourcePath(tile.vaultPath);

  return (
    <div className="windrose-flyout-preview">
      <img src={src} className="windrose-flyout-preview-img" />
      <div className="windrose-flyout-preview-label">{tile.filename}</div>
    </div>
  );
}

function FlyoutPanel({ tiles, onSelect, onClose, label }: {
  tiles: FlyoutTile[];
  onSelect: (tilesetId: string, tileId: string) => void;
  onClose: () => void;
  label: string;
}): VNode {
  const panelRef = useRef<HTMLDivElement>(null);
  const [hoveredTile, setHoveredTile] = useState<FlyoutTile | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', handler);
    };
  }, [onClose]);

  return (
    <div ref={panelRef} className="windrose-spine-flyout">
      <div className="windrose-spine-flyout-head">
        <span>{label}</span>
        <button className="windrose-spine-flyout-close" onClick={onClose}>
          <Icon icon="lucide-x" size={12} />
        </button>
      </div>
      {tiles.length === 0 ? (
        <div className="windrose-spine-flyout-empty">
          No {label.toLowerCase()} tiles
        </div>
      ) : (
        <div className="windrose-spine-flyout-grid">
          {tiles.map(tile => (
            <div
              key={tile.vaultPath}
              className="windrose-spine-flyout-tile"
              title={tile.filename}
              onClick={() => {
                onSelect(tile.tilesetId, tile.tileId);
                onClose();
              }}
              onMouseEnter={() => setHoveredTile(tile)}
              onMouseLeave={() => setHoveredTile(null)}
            >
              <FlyoutThumb vaultPath={tile.vaultPath} />
            </div>
          ))}
        </div>
      )}
      {hoveredTile && <FlyoutPreview tile={hoveredTile} />}
    </div>
  );
}

function SpineRibbon({ depth, onDepthChange, hidden, onToggleHide, tileCounts, onExpand, selectedTileName, selectedTileThumb, ribbonWidth, spineFlyout, onSpineFlyout }: {
  depth: TileLayerRole;
  onDepthChange: (d: TileLayerRole) => void;
  hidden: Set<TileLayerRole>;
  onToggleHide: (d: TileLayerRole) => void;
  tileCounts?: Record<TileLayerRole, number>;
  onExpand: () => void;
  selectedTileName?: string | null;
  selectedTileThumb?: HTMLCanvasElement | null;
  ribbonWidth: number;
  spineFlyout: 'recent' | 'starred' | null;
  onSpineFlyout: (v: 'recent' | 'starred' | null) => void;
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

  const toggleFlyout = (which: 'recent' | 'starred') => {
    onSpineFlyout(spineFlyout === which ? null : which);
  };

  return (
    <div className="windrose-tile-spine">
      <button
        className="windrose-tile-spine-expand"
        title="Expand tiles"
        onClick={onExpand}
      >
        <Icon icon="lucide-panel-left-open" size={15} />
      </button>
      <div className="windrose-tile-spine-flyout-btns">
        <button
          className={`windrose-tile-spine-fbtn ${spineFlyout === 'starred' ? 'active' : ''}`}
          title="Starred tiles"
          onClick={() => toggleFlyout('starred')}
        >
          <Icon icon="lucide-star" size={14} />
        </button>
        <button
          className={`windrose-tile-spine-fbtn ${spineFlyout === 'recent' ? 'active' : ''}`}
          title="Recent tiles"
          onClick={() => toggleFlyout('recent')}
        >
          <Icon icon="lucide-clock" size={14} />
        </button>
      </div>
      <div className="windrose-tile-spine-div" />
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
  flyoutRecent,
  flyoutStarred,
  onFlyoutSelect,
  children,
}: DrawerDockProps): VNode {
  const [resizing, setResizing] = useState(false);
  const [spineFlyout, setSpineFlyout] = useState<'recent' | 'starred' | null>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const dockWidth = open ? drawerWidth : ribbonWidth;

  // Close flyout when drawer opens
  useEffect(() => {
    if (open) setSpineFlyout(null);
  }, [open]);

  const closeFlyout = useCallback(() => setSpineFlyout(null), []);

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
    spineFlyout != null && !open ? 'has-flyout' : '',
  ].filter(Boolean).join(' ');

  const transition = fold && !resizing
    ? 'width .42s cubic-bezier(.2,.8,.2,1)'
    : 'none';

  const flyoutTiles = spineFlyout === 'recent' ? flyoutRecent
    : spineFlyout === 'starred' ? flyoutStarred
    : undefined;

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
          spineFlyout={spineFlyout}
          onSpineFlyout={setSpineFlyout}
        />
      </div>

      {/* Flyout panel — positioned to left of spine, outside both layers */}
      {spineFlyout != null && flyoutTiles != null && onFlyoutSelect != null && !open && (
        <div
          className="windrose-tile-flyout-layer"
          style={{ right: ribbonWidth }}
        >
          <FlyoutPanel
            tiles={flyoutTiles}
            onSelect={onFlyoutSelect}
            onClose={closeFlyout}
            label={spineFlyout === 'recent' ? 'Recent' : 'Starred'}
          />
        </div>
      )}

      {/* Full panel — right-pinned, clips off left edge as dock narrows.
          When collapsed it goes visibility:hidden (delayed past the fold) so the
          browser stops painting it entirely — an opacity-0 panel still runs its
          contents' CSS animations (thumbnail shimmer) as per-frame main-thread
          paint work, which saturates weaker devices. */}
      <div
        className="windrose-tile-panel-layer"
        style={{
          width: drawerWidth,
          opacity: open ? 1 : 0,
          visibility: open ? 'visible' : 'hidden',
          pointerEvents: open ? 'auto' : 'none',
          transition: fold && !resizing
            ? (open ? 'opacity .26s ease' : 'opacity .26s ease, visibility 0s linear .45s')
            : 'none',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export { DrawerDock };
export type { DrawerDockProps, FlyoutTile };

/**
 * TileAssetBrowser.tsx
 *
 * Full drawer content for the tile browser panel.
 * Structure: header → depth band → filter → tag chips →
 * body (jump rail + tile grid) → loaded-brush footer.
 */

import type { TilesetDef, TileEntry, TilesetOverrides, TileLayerRole } from '#types/tiles/tile.types';
import type { ToolId } from '#types/tools/tool.types';
import type { VNode } from 'preact';
import { TFile } from 'obsidian';

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useApp } from '../../context/AppContext';
import { Icon } from '../shared/Icon';
import { CornerBrackets } from '../shared/CornerBrackets';
import { DepthBar, depthMeta } from './DepthBar';

// ===========================================
// Content-bounds detection for tile thumbnails
// ===========================================

const boundsCache = new Map<string, { x: number; y: number; w: number; h: number }>();
const scratchCanvas = document.createElement('canvas');

function getContentBounds(img: HTMLImageElement): { x: number; y: number; w: number; h: number } {
  const key = img.src;
  const cached = boundsCache.get(key);
  if (cached) return cached;

  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w === 0 || h === 0) return { x: 0, y: 0, w, h };

  scratchCanvas.width = w;
  scratchCanvas.height = h;
  const ctx = scratchCanvas.getContext('2d');
  if (ctx == null) return { x: 0, y: 0, w, h };
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;

  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX) {
    const bounds = { x: 0, y: 0, w, h };
    boundsCache.set(key, bounds);
    return bounds;
  }

  const pad = 2;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);

  const bounds = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  boundsCache.set(key, bounds);
  return bounds;
}

// ===========================================
// Tile thumbnail with content cropping
// ===========================================

const THUMB_SIZE = 64;
const PREVIEW_SIZE = 192;

interface TileThumbnailProps {
  tile: TileEntry;
  getCachedImage?: (path: string) => HTMLImageElement | null;
}

function drawTileToCanvas(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  size: number,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, size, size);
  try {
    const bounds = getContentBounds(img);
    const scale = Math.min(size / bounds.w, size / bounds.h);
    const dw = bounds.w * scale;
    const dh = bounds.h * scale;
    ctx.drawImage(img, bounds.x, bounds.y, bounds.w, bounds.h,
      (size - dw) / 2, (size - dh) / 2, dw, dh);
  } catch {
    const scale = Math.min(size / img.naturalWidth, size / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
  }
}

function loadVaultImage(
  vaultPath: string,
  getCachedImage: ((path: string) => HTMLImageElement | null) | undefined,
  onDraw: (img: HTMLImageElement) => void,
): (() => void) | undefined {
  const cached = getCachedImage?.(vaultPath);
  if (cached?.complete === true) {
    onDraw(cached);
    return undefined;
  }
  let blobUrl: string | null = null;
  const file = app.vault.getAbstractFileByPath(vaultPath);
  if (file instanceof TFile) {
    void app.vault.readBinary(file).then((binary: ArrayBuffer) => {
      const blob = new Blob([binary]);
      blobUrl = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        if (blobUrl != null) URL.revokeObjectURL(blobUrl);
        blobUrl = null;
        onDraw(img);
      };
      img.src = blobUrl;
    });
  }
  return () => {
    if (blobUrl != null) URL.revokeObjectURL(blobUrl);
  };
}

const TileThumbnail = ({ tile, getCachedImage }: TileThumbnailProps): VNode => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    return loadVaultImage(tile.vaultPath, getCachedImage, (img) => {
      if (canvasRef.current) drawTileToCanvas(canvasRef.current, img, THUMB_SIZE);
    });
  }, [tile.vaultPath]);

  return (
    <canvas ref={canvasRef} className="windrose-tile-thumb-img" width={THUMB_SIZE} height={THUMB_SIZE} />
  );
};

// ===========================================
// Horizontal scroller (wheel→sideways + drag)
// ===========================================

function HScroll({ className, children }: { className?: string; children: any }): VNode {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ down: false, x: 0, sl: 0, moved: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      if (el.scrollWidth <= el.clientWidth) return;
      const d = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (d === 0) return;
      el.scrollLeft += d;
      e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const down = (e: PointerEvent): void => {
    const el = ref.current;
    if (!el) return;
    drag.current = { down: true, x: e.clientX, sl: el.scrollLeft, moved: false };
  };
  const move = (e: PointerEvent): void => {
    if (!drag.current.down) return;
    const el = ref.current;
    if (!el) return;
    const dx = e.clientX - drag.current.x;
    if (Math.abs(dx) > 3) drag.current.moved = true;
    el.scrollLeft = drag.current.sl - dx;
  };
  const up = (): void => { drag.current.down = false; };
  const clickCapture = (e: MouseEvent): void => {
    if (drag.current.moved) {
      e.stopPropagation();
      e.preventDefault();
      drag.current.moved = false;
    }
  };

  return (
    <div
      ref={ref}
      className={className}
      style={{ cursor: 'grab' }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerLeave={up}
      onClickCapture={clickCapture}
    >
      {children}
    </div>
  );
}

// ===========================================
// Loaded-brush chip thumbnail
// ===========================================

function LoadedChipThumb({ tile, getCachedImage }: { tile: TileEntry; getCachedImage?: (path: string) => HTMLImageElement | null }): VNode {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    return loadVaultImage(tile.vaultPath, getCachedImage, (img) => {
      if (canvasRef.current) drawTileToCanvas(canvasRef.current, img, 38);
    });
  }, [tile.vaultPath]);

  return (
    <canvas ref={canvasRef} width={38} height={38} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
  );
}

// ===========================================
// Main component
// ===========================================

interface TileAssetBrowserProps {
  tilesets: TilesetDef[];
  selectedTilesetId: string | null;
  selectedTileId: string | null;
  onTileSelect: (tilesetId: string, tileId: string) => void;
  onTileDeselect: () => void;
  onToolChange: (tool: ToolId) => void;
  onCollapse?: () => void;
  rotation: number;
  flipH: boolean;
  onRotationChange: (rotation: number) => void;
  onFlipChange: (flipH: boolean) => void;
  tileLayer: 'base' | 'overlay';
  onTileLayerChange: (layer: 'base' | 'overlay') => void;
  tileDepth: TileLayerRole;
  onTileDepthChange: (depth: TileLayerRole) => void;
  hidden?: Set<TileLayerRole>;
  onToggleHide?: (depth: TileLayerRole) => void;
  mapType?: string;
  tileFitMode: 'fill' | 'contain' | 'auto';
  onTileFitModeChange: (mode: 'fill' | 'contain' | 'auto') => void;
  stampMode: boolean;
  onStampModeChange: (stamp: boolean) => void;
  tileScale: number;
  onTileScaleChange: (scale: number) => void;
  getCachedImage?: (path: string) => HTMLImageElement | null;
  tilesetOverrides?: Record<string, TilesetOverrides>;
  onTilesetOverrideChange?: (tilesetId: string, overrides: TilesetOverrides) => void;
  showRail?: boolean;
  compact?: boolean;
  recentTiles?: Array<{ tilesetId: string; tileId: string }>;
}

type RailSelection = 'all' | 'recent' | 'starred' | string;

const ROTATION_STEPS = [0, 60, 120, 180, 240, 300];

const TileAssetBrowser = ({
  tilesets,
  selectedTilesetId,
  selectedTileId,
  onTileSelect,
  onTileDeselect,
  onToolChange,
  onCollapse,
  rotation,
  flipH,
  onRotationChange,
  onFlipChange,
  tileLayer,
  tileDepth,
  onTileDepthChange,
  hidden,
  onToggleHide,
  mapType,
  tileFitMode,
  onTileFitModeChange,
  stampMode,
  onStampModeChange,
  tileScale,
  onTileScaleChange,
  getCachedImage,
  tilesetOverrides,
  onTilesetOverrideChange,
  showRail = false,
  compact = false,
  recentTiles,
}: TileAssetBrowserProps): VNode | null => {
  const app = useApp();
  const [activeTilesetIndex, setActiveTilesetIndex] = useState<number>(0);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [showTilesetConfig, setShowTilesetConfig] = useState<boolean>(false);
  const [hoveredTile, setHoveredTile] = useState<TileEntry | null>(null);
  const [railSel, setRailSel] = useState<RailSelection>('all');
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const previewRef = useRef<HTMLCanvasElement>(null);
  const browserRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement | null>(null);

  // Clamp activeTilesetIndex when tilesets shrink
  useEffect(() => {
    if (activeTilesetIndex >= tilesets.length && tilesets.length > 0) {
      setActiveTilesetIndex(tilesets.length - 1);
    } else if (tilesets.length === 0) {
      setActiveTilesetIndex(0);
    }
  }, [tilesets.length]);

  // Reset rail and tags when depth changes
  useEffect(() => {
    setRailSel('all');
    setActiveTags(new Set());
  }, [tileDepth]);

  const handleTileClick = (tilesetId: string, tileId: string): void => {
    if (selectedTilesetId === tilesetId && selectedTileId === tileId) {
      onTileDeselect();
    } else {
      onTileSelect(tilesetId, tileId);
      onToolChange('tilePaint');
    }
  };

  const handleRotateCW = (): void => {
    const currentIdx = ROTATION_STEPS.indexOf(rotation);
    const nextIdx = (currentIdx + 1) % ROTATION_STEPS.length;
    onRotationChange(ROTATION_STEPS[nextIdx]);
  };

  const handleRotateCCW = (): void => {
    const currentIdx = ROTATION_STEPS.indexOf(rotation);
    const nextIdx = (currentIdx - 1 + ROTATION_STEPS.length) % ROTATION_STEPS.length;
    onRotationChange(ROTATION_STEPS[nextIdx]);
  };

  // Manage hover preview portal on document.body
  useEffect(() => {
    if (!hoveredTile) {
      if (portalRef.current) {
        portalRef.current.style.display = 'none';
      }
      return undefined;
    }

    if (!portalRef.current) {
      const div = document.createElement('div');
      div.className = 'windrose-tile-preview-portal';
      const canvas = document.createElement('canvas');
      canvas.width = PREVIEW_SIZE;
      canvas.height = PREVIEW_SIZE;
      canvas.classList.add('windrose-tile-preview-canvas');
      const label = document.createElement('div');
      label.className = 'windrose-tile-preview-label';
      div.appendChild(canvas);
      div.appendChild(label);
      document.body.appendChild(div);
      portalRef.current = div;
      previewRef.current = canvas;
    }

    const portal = portalRef.current;
    const canvas = previewRef.current;
    if (canvas == null) return undefined;
    const label = portal.querySelector('.windrose-tile-preview-label') as HTMLElement;

    if (browserRef.current) {
      const rect = browserRef.current.getBoundingClientRect();
      portal.style.display = 'block';
      const topVal = (rect.top + rect.height / 2 - (PREVIEW_SIZE + 24) / 2) + 'px';
      const leftVal = (rect.left - PREVIEW_SIZE - 16) + 'px';
      portal.style.setProperty('top', topVal);
      portal.style.setProperty('left', leftVal);
    }

    label.textContent = hoveredTile.filename + (rotation ? ` (${rotation}°)` : '') + (flipH ? ' [flipped]' : '');

    const isHoveredSelected = selectedTilesetId === activeTileset?.id && selectedTileId === hoveredTile.id;
    if (isHoveredSelected && (rotation || flipH)) {
      const transformVal = `rotate(${rotation}deg)${flipH ? ' scaleX(-1)' : ''}`;
      canvas.style.setProperty('transform', transformVal);
    } else {
      canvas.style.removeProperty('transform');
    }

    return loadVaultImage(hoveredTile.vaultPath, getCachedImage, (img) => {
      drawTileToCanvas(canvas, img, PREVIEW_SIZE);
    });
  }, [hoveredTile, rotation, flipH, selectedTilesetId, selectedTileId]);

  // Cleanup portal on unmount
  useEffect(() => {
    return () => {
      if (portalRef.current) {
        document.body.removeChild(portalRef.current);
        portalRef.current = null;
      }
    };
  }, []);

  const handleToggleCategory = (category: string): void => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const toggleTag = (tag: string): void => {
    setActiveTags(prev => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  };

  const activeTileset = tilesets[activeTilesetIndex] ?? null;

  // Collect available tags from tiles in the active tileset
  const availableTags = useMemo(() => {
    if (activeTileset == null) return [];
    const tagSet = new Set<string>();
    for (const tile of activeTileset.tiles) {
      if (tile.tags) {
        for (const tag of tile.tags) tagSet.add(tag);
      }
    }
    return Array.from(tagSet).sort();
  }, [activeTileset]);

  const filteredTiles = useMemo(() => {
    if (activeTileset == null) return [];
    let tiles = activeTileset.tiles;

    // Text search
    if (searchFilter != null && searchFilter !== '') {
      const lower = searchFilter.toLowerCase();
      tiles = tiles.filter((t: TileEntry) =>
        t.filename.toLowerCase().includes(lower) ||
        (t.category != null && t.category !== '' && t.category.toLowerCase().includes(lower)) ||
        (t.tags != null && t.tags.some((tag: string) => tag.toLowerCase().includes(lower)))
      );
    }

    // Tag filter (AND logic)
    if (activeTags.size > 0) {
      tiles = tiles.filter((t: TileEntry) =>
        t.tags != null && Array.from(activeTags).every(tag => t.tags!.includes(tag))
      );
    }

    return tiles;
  }, [activeTileset, searchFilter, activeTags]);

  const groupedTiles = useMemo(() => {
    const groups = new Map<string, TileEntry[]>();
    for (const tile of filteredTiles) {
      const cat = tile.category ?? 'Uncategorized';
      if (!groups.has(cat)) groups.set(cat, []);
      const group = groups.get(cat);
      if (group != null) group.push(tile);
    }
    return groups;
  }, [filteredTiles]);

  // Resolve which groups to show based on rail selection
  const shownGroups = useMemo((): Array<[string, TileEntry[]]> => {
    const entries = Array.from(groupedTiles.entries());
    if (railSel === 'all' || railSel === 'recent' || railSel === 'starred') return entries;
    return entries.filter(([cat]) => cat === railSel);
  }, [groupedTiles, railSel]);

  // Resolve the selected tile entry for the loaded-brush footer
  const selectedTile = useMemo((): TileEntry | null => {
    if (selectedTileId == null || activeTileset == null) return null;
    if (selectedTilesetId !== activeTileset.id) return null;
    return activeTileset.tiles.find(t => t.id === selectedTileId) ?? null;
  }, [selectedTileId, selectedTilesetId, activeTileset]);

  // Resolve recent tiles that belong to the active tileset
  const recentTileEntries = useMemo((): TileEntry[] => {
    if (!recentTiles || activeTileset == null) return [];
    return recentTiles
      .filter(r => r.tilesetId === activeTileset.id)
      .map(r => activeTileset.tiles.find(t => t.id === r.tileId))
      .filter((t): t is TileEntry => t != null);
  }, [recentTiles, activeTileset]);

  // Grid sizing
  const tileMin = compact ? 42 : 56;
  const gridGap = compact ? 3 : 6;
  const secGap = compact ? 5 : 11;
  const gridStyle = { gridTemplateColumns: `repeat(auto-fill, minmax(${tileMin}px, 1fr))`, gap: gridGap };

  // ---- Empty state: no tilesets ----

  if (tilesets.length === 0) {
    const openTilesetSettings = (): void => {
      (app as any).setting.open();
      (app as any).setting.openTabById('windrose-md');
    };

    return (
      <div className="windrose-tile-browser windrose-tile-browser-empty-state">
        <div className="windrose-tile-browser-empty-message">
          <Icon icon="lucide-image" size={24} />
          <span>No tilesets configured</span>
          <button
            className="windrose-tile-browser-configure-btn"
            onClick={openTilesetSettings}
          >
            <Icon icon="lucide-settings" size={14} />
            <span>Configure Tilesets</span>
          </button>
        </div>
      </div>
    );
  }

  // ---- Main render ----

  const isGrid = mapType === 'grid';
  const depthLabel = isGrid ? depthMeta(tileDepth).label.toLowerCase() : tileLayer;

  return (
    <div ref={browserRef} className="windrose-tile-browser">
      <CornerBrackets classPrefix="windrose-tb-bracket" variant="minimal" filterId="tb-bracket" />

      {/* Header */}
      <div className="windrose-tb-head">
        <div className="windrose-tb-title">Tiles</div>
        <span className="windrose-tb-cap" style={{ marginRight: 'auto', marginLeft: 2 }}>
          {activeTileset?.name ?? ''}
        </span>
        {onTilesetOverrideChange != null && activeTileset != null && (
          <button
            className="windrose-tb-iconbtn ghost"
            title="Tileset settings"
            onClick={() => setShowTilesetConfig(!showTilesetConfig)}
          >
            <Icon icon="lucide-sliders-horizontal" size={15} />
          </button>
        )}
        {onCollapse && (
          <button className="windrose-tb-iconbtn ghost" title="Collapse to edge" onClick={onCollapse}>
            <Icon icon="lucide-panel-right" size={15} />
          </button>
        )}
      </div>

      {/* Depth band */}
      {hidden != null && onToggleHide != null && (
        <div className="windrose-tb-band">
          <DepthBar
            active={tileDepth}
            onPick={onTileDepthChange}
            hidden={hidden}
            onToggleHide={onToggleHide}
            compact={compact}
          />
        </div>
      )}

      {/* Tileset selector (when multiple tilesets) */}
      {tilesets.length > 1 && (
        <div className="windrose-tb-tileset">
          <select
            value={activeTilesetIndex}
            onChange={(e: Event) => setActiveTilesetIndex(parseInt((e.target as HTMLSelectElement).value, 10))}
            className="windrose-tb-tileset-select"
          >
            {tilesets.map((ts: TilesetDef, i: number) => (
              <option key={ts.id} value={i}>{ts.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Tileset config panel (inline) */}
      {showTilesetConfig && activeTileset != null && onTilesetOverrideChange != null && (() => {
        const currentOverrides = tilesetOverrides?.[activeTileset.id] || {};
        const threshold = currentOverrides.stampThreshold ?? activeTileset.stampThreshold ?? 0.5;
        const minScale = currentOverrides.minStampScale ?? activeTileset.minStampScale ?? 0.2;
        const fitMode = currentOverrides.fitMode ?? activeTileset.fitMode;

        const handleOverrideChange = (field: keyof TilesetOverrides, value: number | string | undefined): void => {
          const updated = { ...currentOverrides, [field]: value };
          if (value === undefined) delete updated[field];
          onTilesetOverrideChange(activeTileset.id, updated);
        };

        return (
          <div className="windrose-tb-config">
            <div className="windrose-tile-config-row">
              <label>Fit Mode</label>
              <select
                value={fitMode || 'auto'}
                onChange={(e: Event) => {
                  const v = (e.target as HTMLSelectElement).value;
                  handleOverrideChange('fitMode', v === 'auto' ? undefined : v as 'fill' | 'contain');
                }}
                className="windrose-tile-config-select"
              >
                <option value="auto">Auto</option>
                <option value="fill">Fill</option>
                <option value="contain">Contain</option>
              </select>
            </div>
            <div className="windrose-tile-config-row">
              <label>Stamp threshold</label>
              <input
                type="range"
                min="0.1"
                max="0.9"
                step="0.05"
                value={threshold}
                onInput={(e: Event) => handleOverrideChange('stampThreshold', parseFloat((e.target as HTMLInputElement).value))}
                className="windrose-tile-config-slider"
              />
              <span className="windrose-tile-config-value">{(threshold * 100).toFixed(0)}%</span>
            </div>
            <div className="windrose-tile-config-row">
              <label>Min stamp size</label>
              <input
                type="range"
                min="0.05"
                max="0.5"
                step="0.05"
                value={minScale}
                onInput={(e: Event) => handleOverrideChange('minStampScale', parseFloat((e.target as HTMLInputElement).value))}
                className="windrose-tile-config-slider"
              />
              <span className="windrose-tile-config-value">{(minScale * 100).toFixed(0)}%</span>
            </div>
          </div>
        );
      })()}

      {/* Filter */}
      <div className="windrose-tb-filter">
        <div className="windrose-tb-search">
          <Icon icon="lucide-search" size={14} />
          <input
            placeholder={`Filter ${depthLabel}…`}
            value={searchFilter}
            onInput={(e: Event) => setSearchFilter((e.target as HTMLInputElement).value)}
          />
        </div>
      </div>

      {/* Tag chips */}
      {availableTags.length > 0 && (
        <div className="windrose-tb-chips">
          <HScroll className="windrose-tb-chips-scroll">
            {availableTags.map(t => (
              <button
                key={t}
                className={`windrose-tb-chip ${activeTags.has(t) ? 'active' : ''}`}
                onClick={() => toggleTag(t)}
              >
                {t}
                {activeTags.has(t) && (
                  <span className="x"><Icon icon="lucide-x" size={10} /></span>
                )}
              </button>
            ))}
          </HScroll>
        </div>
      )}

      {/* Body: rail + grid */}
      <div className="windrose-tb-body">
        {showRail && (
          <div className="windrose-tb-rail">
            <button
              className={`windrose-tb-railbtn ${railSel === 'recent' ? 'on' : ''}`}
              onClick={() => setRailSel('recent')}
            >
              <Icon icon="lucide-clock" size={14} />
              Recent
            </button>
            <button
              className={`windrose-tb-railbtn ${railSel === 'starred' ? 'on' : ''}`}
              onClick={() => setRailSel('starred')}
            >
              <Icon icon="lucide-star" size={14} />
              Starred
            </button>
            <div className="windrose-tb-raildiv" />
            {isGrid && (
              <div className="windrose-tb-raillabel">
                <Icon icon={depthMeta(tileDepth).icon} size={11} />
                {depthMeta(tileDepth).label}
              </div>
            )}
            <button
              className={`windrose-tb-railbtn ${railSel === 'all' ? 'on' : ''}`}
              onClick={() => setRailSel('all')}
            >
              <Icon icon="lucide-grid-2x2" size={14} />
              All
              <span className="c">{filteredTiles.length}</span>
            </button>
            {Array.from(groupedTiles.entries()).map(([cat, tiles]) => (
              <button
                key={cat}
                className={`windrose-tb-railbtn ${railSel === cat ? 'on' : ''}`}
                onClick={() => setRailSel(cat)}
                title={cat}
              >
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cat}</span>
                <span className="c">{tiles.length}</span>
              </button>
            ))}
          </div>
        )}

        <div className="windrose-tb-grid-wrap">
          {/* Recent tiles section */}
          {railSel === 'recent' && recentTileEntries.length > 0 && (
            <div style={{ marginBottom: secGap }}>
              <div className="windrose-tb-seclabel" style={{ cursor: 'default' }}>
                <Icon icon="lucide-clock" size={11} /> Recently used
              </div>
              <div className="windrose-tb-grid" style={gridStyle}>
                {recentTileEntries.map(tile => {
                  const isSelected = selectedTilesetId === activeTileset?.id && selectedTileId === tile.id;
                  return (
                    <div
                      key={tile.id}
                      className={`windrose-tile-thumb ${isSelected ? 'sel' : ''}`}
                      onClick={() => handleTileClick(activeTileset?.id ?? '', tile.id)}
                      onMouseEnter={() => setHoveredTile(tile)}
                      onMouseLeave={() => setHoveredTile(null)}
                      title={tile.filename}
                    >
                      <TileThumbnail tile={tile} getCachedImage={getCachedImage} />
                      <span className="tname">{tile.filename}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Category groups */}
          {railSel !== 'recent' && shownGroups.map(([category, tiles]) => (
            <div key={category} style={{ marginBottom: secGap }}>
              <button
                className="windrose-tb-seclabel"
                onClick={() => handleToggleCategory(category)}
              >
                <Icon
                  icon={collapsedCategories.has(category) ? 'lucide-chevron-right' : 'lucide-chevron-down'}
                  size={10}
                />
                {category}
                <span className="count">{tiles.length}</span>
              </button>

              {!collapsedCategories.has(category) && (
                <div className="windrose-tb-grid" style={gridStyle}>
                  {tiles.map((tile: TileEntry) => {
                    const isSelected = selectedTilesetId === activeTileset?.id && selectedTileId === tile.id;
                    return (
                      <div
                        key={tile.id}
                        className={`windrose-tile-thumb ${isSelected ? 'sel' : ''}`}
                        onClick={() => handleTileClick(activeTileset?.id ?? '', tile.id)}
                        onMouseEnter={() => setHoveredTile(tile)}
                        onMouseLeave={() => setHoveredTile(null)}
                        title={tile.filename}
                      >
                        <TileThumbnail tile={tile} getCachedImage={getCachedImage} />
                        <span className="tname">{tile.filename}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

          {filteredTiles.length === 0 && (
            <div className="windrose-tb-empty">
              {searchFilter != null && searchFilter !== '' ? 'No matching tiles' : 'No tiles in this tileset'}
            </div>
          )}
        </div>
      </div>

      {/* Loaded-brush footer */}
      {selectedTile != null && (
        <div className="windrose-tb-footer">
          <div className="windrose-tb-loaded">
            <div className="chip-tile">
              <LoadedChipThumb tile={selectedTile} getCachedImage={getCachedImage} />
            </div>
            <div className="meta">
              <div className="n">{selectedTile.filename}</div>
              <div className="s">
                {selectedTile.category ?? 'Uncategorized'} · loaded on {isGrid ? depthMeta(tileDepth).label : tileLayer}
              </div>
            </div>
            <button
              className="windrose-tb-iconbtn ghost"
              title="Clear brush"
              onClick={onTileDeselect}
            >
              <Icon icon="lucide-x" size={14} />
            </button>
          </div>
          <div className="windrose-tb-brushbar">
            <button className="windrose-tb-iconbtn" title="Rotate counter-clockwise" onClick={handleRotateCCW}>
              <Icon icon="lucide-rotate-ccw" size={14} />
            </button>
            <span className="windrose-tb-cap" style={{ minWidth: 28, textAlign: 'center' }}>{rotation}°</span>
            <button className="windrose-tb-iconbtn" title="Rotate clockwise" onClick={handleRotateCW}>
              <Icon icon="lucide-rotate-cw" size={14} />
            </button>
            <button
              className={`windrose-tb-iconbtn ${flipH ? 'active' : ''}`}
              onClick={() => onFlipChange(!flipH)}
              title="Flip horizontal"
            >
              <Icon icon="lucide-flip-horizontal" size={14} />
            </button>
            <span className="sep" />
            <button
              className={`windrose-tb-iconbtn ${stampMode ? 'active' : ''}`}
              onClick={() => onStampModeChange(!stampMode)}
              title={stampMode ? 'Stamp mode: ON' : 'Stamp mode: OFF'}
            >
              <Icon icon="lucide-stamp" size={14} />
            </button>
            <button
              className="windrose-tb-iconbtn"
              onClick={() => {
                const modes: Array<'auto' | 'fill' | 'contain'> = ['auto', 'fill', 'contain'];
                const idx = modes.indexOf(tileFitMode);
                onTileFitModeChange(modes[(idx + 1) % modes.length]);
              }}
              title={`Fit: ${tileFitMode}`}
            >
              <Icon icon={tileFitMode === 'contain' ? 'lucide-minimize-2' : tileFitMode === 'fill' ? 'lucide-maximize-2' : 'lucide-scan'} size={14} />
            </button>
            <span className="sep" />
            <span className="label">Scale</span>
            <input
              className="windrose-tb-range"
              type="range"
              min="0.25"
              max="3"
              step="0.25"
              value={tileScale}
              onInput={(e: Event) => onTileScaleChange(parseFloat((e.target as HTMLInputElement).value))}
              style={{ flex: 1, minWidth: 60 }}
            />
            <span className="windrose-tb-cap" style={{ minWidth: 24, textAlign: 'right' }}>{tileScale}×</span>
          </div>
        </div>
      )}

    </div>
  );
};

export { TileAssetBrowser };

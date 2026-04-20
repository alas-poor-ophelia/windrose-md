/**
 * TileAssetBrowser.tsx
 *
 * Right-side collapsible panel for browsing and selecting hex tile assets.
 * Displays tile thumbnails from imported tilesets, grouped by category.
 * Selecting a tile sets it as the active brush for placement.
 */

import type { TilesetDef, TileEntry, TilesetOverrides } from '#types/tiles/tile.types';

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
  const ctx = scratchCanvas.getContext('2d')!;
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

const TileThumbnail = ({ tile, getCachedImage }: TileThumbnailProps): React.ReactElement => {
  const canvasRef = dc.useRef<HTMLCanvasElement>(null);

  dc.useEffect(() => {
    let blobUrl: string | null = null;
    const draw = (img: HTMLImageElement) => {
      if (canvasRef.current) drawTileToCanvas(canvasRef.current, img, THUMB_SIZE);
    };
    const img = getCachedImage?.(tile.vaultPath);
    if (img?.complete) {
      draw(img);
      return;
    }
    const file = dc.app.vault.getAbstractFileByPath(tile.vaultPath);
    if (file) {
      dc.app.vault.readBinary(file).then((binary: ArrayBuffer) => {
        const blob = new Blob([binary]);
        blobUrl = URL.createObjectURL(blob);
        const fallbackImg = new Image();
        fallbackImg.onload = () => {
          URL.revokeObjectURL(blobUrl!);
          blobUrl = null;
          draw(fallbackImg);
        };
        fallbackImg.src = blobUrl;
      });
    }
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [tile.vaultPath]);

  return (
    <canvas ref={canvasRef} className="dmt-tile-thumb-img" width={THUMB_SIZE} height={THUMB_SIZE} />
  );
};

// ===========================================
// Main component
// ===========================================

interface TileAssetBrowserProps {
  tilesets: TilesetDef[];
  selectedTilesetId: string | null;
  selectedTileId: string | null;
  onTileSelect: (tilesetId: string, tileId: string) => void;
  onTileDeselect: () => void;
  onToolChange: (tool: string) => void;
  isCollapsed: boolean;
  onCollapseChange: (collapsed: boolean) => void;
  rotation: number;
  flipH: boolean;
  onRotationChange: (rotation: number) => void;
  onFlipChange: (flipH: boolean) => void;
  tileLayer: 'base' | 'overlay';
  onTileLayerChange: (layer: 'base' | 'overlay') => void;
  tileFitMode: 'fill' | 'contain' | 'auto';
  onTileFitModeChange: (mode: 'fill' | 'contain' | 'auto') => void;
  stampMode: boolean;
  onStampModeChange: (stamp: boolean) => void;
  tileScale: number;
  onTileScaleChange: (scale: number) => void;
  getCachedImage?: (path: string) => HTMLImageElement | null;
  tilesetOverrides?: Record<string, TilesetOverrides>;
  onTilesetOverrideChange?: (tilesetId: string, overrides: TilesetOverrides) => void;
}

const ROTATION_STEPS = [0, 60, 120, 180, 240, 300];

const TileAssetBrowser = ({
  tilesets,
  selectedTilesetId,
  selectedTileId,
  onTileSelect,
  onTileDeselect,
  onToolChange,
  isCollapsed,
  onCollapseChange,
  rotation,
  flipH,
  onRotationChange,
  onFlipChange,
  tileLayer,
  onTileLayerChange,
  tileFitMode,
  onTileFitModeChange,
  stampMode,
  onStampModeChange,
  tileScale,
  onTileScaleChange,
  getCachedImage,
  tilesetOverrides,
  onTilesetOverrideChange,
}: TileAssetBrowserProps): React.ReactElement => {
  const [activeTilesetIndex, setActiveTilesetIndex] = dc.useState<number>(0);
  const [searchFilter, setSearchFilter] = dc.useState<string>('');
  const [collapsedCategories, setCollapsedCategories] = dc.useState<Set<string>>(new Set());
  const [showTilesetConfig, setShowTilesetConfig] = dc.useState<boolean>(false);
  const [hoveredTile, setHoveredTile] = dc.useState<TileEntry | null>(null);
  const previewRef = dc.useRef<HTMLCanvasElement>(null);
  const browserRef = dc.useRef<HTMLDivElement>(null);
  const portalRef = dc.useRef<HTMLDivElement | null>(null);

  // Clamp activeTilesetIndex when tilesets shrink
  dc.useEffect(() => {
    if (activeTilesetIndex >= tilesets.length && tilesets.length > 0) {
      setActiveTilesetIndex(tilesets.length - 1);
    } else if (tilesets.length === 0) {
      setActiveTilesetIndex(0);
    }
  }, [tilesets.length]);

  const handleToggleCollapse = () => {
    onCollapseChange(!isCollapsed);
  };

  const handleTileClick = (tilesetId: string, tileId: string) => {
    if (selectedTilesetId === tilesetId && selectedTileId === tileId) {
      onTileDeselect();
    } else {
      onTileSelect(tilesetId, tileId);
      onToolChange('tilePaint');
    }
  };

  const handleRotateCW = () => {
    const currentIdx = ROTATION_STEPS.indexOf(rotation);
    const nextIdx = (currentIdx + 1) % ROTATION_STEPS.length;
    onRotationChange(ROTATION_STEPS[nextIdx]);
  };

  const handleRotateCCW = () => {
    const currentIdx = ROTATION_STEPS.indexOf(rotation);
    const nextIdx = (currentIdx - 1 + ROTATION_STEPS.length) % ROTATION_STEPS.length;
    onRotationChange(ROTATION_STEPS[nextIdx]);
  };

  // Manage hover preview portal on document.body
  dc.useEffect(() => {
    if (!hoveredTile || isCollapsed) {
      if (portalRef.current) {
        portalRef.current.style.display = 'none';
      }
      return;
    }

    // Create portal div if needed
    if (!portalRef.current) {
      const div = document.createElement('div');
      div.className = 'dmt-tile-preview-portal';
      const canvas = document.createElement('canvas');
      canvas.width = PREVIEW_SIZE;
      canvas.height = PREVIEW_SIZE;
      canvas.style.display = 'block';
      canvas.style.imageRendering = 'pixelated';
      const label = document.createElement('div');
      label.className = 'dmt-tile-preview-label';
      div.appendChild(canvas);
      div.appendChild(label);
      document.body.appendChild(div);
      portalRef.current = div;
      previewRef.current = canvas;
    }

    const portal = portalRef.current;
    const canvas = previewRef.current!;
    const label = portal.querySelector('.dmt-tile-preview-label') as HTMLElement;

    // Position to the left of the browser panel
    if (browserRef.current) {
      const rect = browserRef.current.getBoundingClientRect();
      portal.style.display = 'block';
      portal.style.top = (rect.top + rect.height / 2 - (PREVIEW_SIZE + 24) / 2) + 'px';
      portal.style.left = (rect.left - PREVIEW_SIZE - 16) + 'px';
    }

    label.textContent = hoveredTile.filename + (rotation ? ` (${rotation}°)` : '') + (flipH ? ' [flipped]' : '');

    // Apply rotation/flip preview when this is the selected tile
    const isHoveredSelected = selectedTilesetId === activeTileset?.id && selectedTileId === hoveredTile.id;
    if (isHoveredSelected && (rotation || flipH)) {
      canvas.style.transform = `rotate(${rotation}deg)${flipH ? ' scaleX(-1)' : ''}`;
    } else {
      canvas.style.transform = '';
    }

    // Draw preview
    let previewBlobUrl: string | null = null;
    const img = getCachedImage?.(hoveredTile.vaultPath);
    if (img?.complete) {
      drawTileToCanvas(canvas, img, PREVIEW_SIZE);
      return;
    }
    const file = dc.app.vault.getAbstractFileByPath(hoveredTile.vaultPath);
    if (file) {
      dc.app.vault.readBinary(file).then((binary: ArrayBuffer) => {
        const blob = new Blob([binary]);
        previewBlobUrl = URL.createObjectURL(blob);
        const fallbackImg = new Image();
        fallbackImg.onload = () => {
          URL.revokeObjectURL(previewBlobUrl!);
          previewBlobUrl = null;
          drawTileToCanvas(canvas, fallbackImg, PREVIEW_SIZE);
        };
        fallbackImg.src = previewBlobUrl;
      });
    }
    return () => {
      if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
    };
  }, [hoveredTile, isCollapsed, rotation, flipH, selectedTilesetId, selectedTileId]);

  // Cleanup portal on unmount
  dc.useEffect(() => {
    return () => {
      if (portalRef.current) {
        document.body.removeChild(portalRef.current);
        portalRef.current = null;
      }
    };
  }, []);

  const handleToggleCategory = (category: string) => {
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

  const activeTileset = tilesets[activeTilesetIndex] || null;

  const filteredTiles = dc.useMemo(() => {
    if (!activeTileset) return [];
    const tiles = activeTileset.tiles;
    if (!searchFilter) return tiles;
    const lower = searchFilter.toLowerCase();
    return tiles.filter((t: TileEntry) =>
      t.filename.toLowerCase().includes(lower) ||
      (t.category && t.category.toLowerCase().includes(lower)) ||
      (t.tags && t.tags.some((tag: string) => tag.toLowerCase().includes(lower)))
    );
  }, [activeTileset, searchFilter]);

  const groupedTiles = dc.useMemo(() => {
    const groups = new Map<string, TileEntry[]>();
    for (const tile of filteredTiles) {
      const cat = tile.category || 'Uncategorized';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(tile);
    }
    return groups;
  }, [filteredTiles]);

  if (tilesets.length === 0) return null as unknown as React.ReactElement;

  if (isCollapsed) {
    return (
      <div className="dmt-tile-browser dmt-tile-browser-collapsed">
        <button
          className="dmt-tile-browser-toggle interactive-child"
          onClick={handleToggleCollapse}
          title="Show tiles"
        >
          <dc.Icon icon="lucide-layout-grid" size={14} />
        </button>
      </div>
    );
  }

  return (
    <div ref={browserRef} className="dmt-tile-browser">
      <div className="dmt-tile-browser-header">
        <span>Tiles</span>
        <div className="dmt-tile-browser-layer-toggle">
          <button
            className={`dmt-tile-browser-layer-btn ${tileLayer === 'base' ? 'dmt-tile-browser-layer-active' : ''}`}
            onClick={() => onTileLayerChange('base')}
            title="Base layer: terrain tiles"
          >
            Base
          </button>
          <button
            className={`dmt-tile-browser-layer-btn ${tileLayer === 'overlay' ? 'dmt-tile-browser-layer-active' : ''}`}
            onClick={() => onTileLayerChange('overlay')}
            title="Overlay layer: stamp tiles atop base"
          >
            Overlay
          </button>
        </div>
        <button
          className="dmt-sidebar-collapse-btn interactive-child"
          onClick={handleToggleCollapse}
          title="Hide tile browser"
        >
          <dc.Icon icon="lucide-panel-right-close" size={14} />
        </button>
      </div>

      {/* Tileset selector + config gear */}
      <div className="dmt-tile-browser-tileset-selector">
        {tilesets.length > 1 && (
          <select
            value={activeTilesetIndex}
            onChange={(e: Event) => setActiveTilesetIndex(parseInt((e.target as HTMLSelectElement).value, 10))}
            className="dmt-tile-browser-select"
          >
            {tilesets.map((ts: TilesetDef, i: number) => (
              <option key={ts.id} value={i}>{ts.name}</option>
            ))}
          </select>
        )}
        {tilesets.length === 1 && (
          <span className="dmt-tile-browser-tileset-name">{tilesets[0].name}</span>
        )}
        {onTilesetOverrideChange && activeTileset && (
          <button
            className="dmt-tile-browser-config-btn clickable-icon"
            onClick={() => setShowTilesetConfig(!showTilesetConfig)}
            title="Tileset rendering settings"
          >
            <dc.Icon icon="lucide-settings-2" size={14} />
          </button>
        )}
      </div>

      {/* Tileset config panel (inline, toggled by gear icon) */}
      {showTilesetConfig && activeTileset && onTilesetOverrideChange && (() => {
        const currentOverrides = tilesetOverrides?.[activeTileset.id] || {};
        const threshold = currentOverrides.stampThreshold ?? activeTileset.stampThreshold ?? 0.5;
        const minScale = currentOverrides.minStampScale ?? activeTileset.minStampScale ?? 0.2;
        const fitMode = currentOverrides.fitMode ?? activeTileset.fitMode;

        const handleOverrideChange = (field: keyof TilesetOverrides, value: number | string | undefined) => {
          const updated = { ...currentOverrides, [field]: value };
          // Remove undefined fields to keep data clean
          if (value === undefined) delete updated[field];
          onTilesetOverrideChange(activeTileset.id, updated);
        };

        return (
          <div className="dmt-tile-browser-config">
            <div className="dmt-tile-config-row">
              <label>Fit Mode</label>
              <select
                value={fitMode || 'auto'}
                onChange={(e: Event) => {
                  const v = (e.target as HTMLSelectElement).value;
                  handleOverrideChange('fitMode', v === 'auto' ? undefined : v as 'fill' | 'contain');
                }}
                className="dmt-tile-config-select"
              >
                <option value="auto">Auto</option>
                <option value="fill">Fill</option>
                <option value="contain">Contain</option>
              </select>
            </div>
            <div className="dmt-tile-config-row">
              <label>Stamp threshold</label>
              <input
                type="range"
                min="0.1"
                max="0.9"
                step="0.05"
                value={threshold}
                onInput={(e: Event) => handleOverrideChange('stampThreshold', parseFloat((e.target as HTMLInputElement).value))}
                className="dmt-tile-config-slider"
              />
              <span className="dmt-tile-config-value">{(threshold * 100).toFixed(0)}%</span>
            </div>
            <div className="dmt-tile-config-row">
              <label>Min stamp size</label>
              <input
                type="range"
                min="0.05"
                max="0.5"
                step="0.05"
                value={minScale}
                onInput={(e: Event) => handleOverrideChange('minStampScale', parseFloat((e.target as HTMLInputElement).value))}
                className="dmt-tile-config-slider"
              />
              <span className="dmt-tile-config-value">{(minScale * 100).toFixed(0)}%</span>
            </div>
          </div>
        );
      })()}

      {/* Search filter */}
      <div className="dmt-tile-browser-search">
        <input
          type="text"
          placeholder="Filter tiles..."
          value={searchFilter}
          onInput={(e: Event) => setSearchFilter((e.target as HTMLInputElement).value)}
          className="dmt-tile-browser-search-input"
        />
      </div>

      {/* Tile grid, grouped by category */}
      <div className="dmt-tile-browser-content">
        {Array.from(groupedTiles.entries()).map(([category, tiles]) => (
          <div key={category} className="dmt-tile-browser-category">
            <button
              className="dmt-tile-browser-category-label"
              onClick={() => handleToggleCategory(category)}
            >
              <dc.Icon
                icon={collapsedCategories.has(category) ? 'lucide-chevron-right' : 'lucide-chevron-down'}
                size={10}
              />
              <span>{category}</span>
              <span className="dmt-tile-browser-category-count">{tiles.length}</span>
            </button>

            {!collapsedCategories.has(category) && (
              <div className="dmt-tile-browser-grid">
                {tiles.map((tile: TileEntry) => {
                  const isSelected = selectedTilesetId === activeTileset?.id && selectedTileId === tile.id;
                  return (
                    <div
                      key={tile.id}
                      className={`dmt-tile-thumb ${isSelected ? 'dmt-tile-thumb-selected' : ''}`}
                      onClick={() => handleTileClick(activeTileset!.id, tile.id)}
                      onMouseEnter={() => setHoveredTile(tile)}
                      onMouseLeave={() => setHoveredTile(null)}
                      title={tile.filename}
                      style={isSelected && (rotation || flipH)
                        ? { transform: `rotate(${rotation}deg)${flipH ? ' scaleX(-1)' : ''}` }
                        : undefined}
                    >
                      <TileThumbnail tile={tile} getCachedImage={getCachedImage} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        {filteredTiles.length === 0 && (
          <div className="dmt-tile-browser-empty">
            {searchFilter ? 'No matching tiles' : 'No tiles in this tileset'}
          </div>
        )}
      </div>

      {/* Footer: rotation/flip controls */}
      {selectedTileId && (
        <div className="dmt-tile-browser-footer">
          <button
            className="dmt-tile-browser-action-btn"
            onClick={handleRotateCCW}
            title="Rotate counter-clockwise (60°)"
          >
            <dc.Icon icon="lucide-rotate-ccw" size={14} />
          </button>
          <span className="dmt-tile-browser-rotation-label">{rotation}°</span>
          <button
            className="dmt-tile-browser-action-btn"
            onClick={handleRotateCW}
            title="Rotate clockwise (60°)"
          >
            <dc.Icon icon="lucide-rotate-cw" size={14} />
          </button>
          <button
            className={`dmt-tile-browser-action-btn ${flipH ? 'dmt-tile-browser-action-active' : ''}`}
            onClick={() => onFlipChange(!flipH)}
            title="Flip horizontal"
          >
            <dc.Icon icon="lucide-flip-horizontal" size={14} />
          </button>
          <div className="dmt-tile-browser-separator" />
          <button
            className={`dmt-tile-browser-action-btn ${stampMode ? 'dmt-tile-browser-action-active' : ''}`}
            onClick={() => onStampModeChange(!stampMode)}
            title={stampMode ? 'Stamp mode: ON (free placement)' : 'Stamp mode: OFF (grid-snapped)'}
          >
            <dc.Icon icon="lucide-stamp" size={14} />
          </button>
          <button
            className={`dmt-tile-browser-action-btn ${tileFitMode === 'auto' ? '' : tileFitMode === 'contain' ? 'dmt-tile-browser-action-active' : ''}`}
            onClick={() => {
              const modes: Array<'auto' | 'fill' | 'contain'> = ['auto', 'fill', 'contain'];
              const idx = modes.indexOf(tileFitMode);
              onTileFitModeChange(modes[(idx + 1) % modes.length]);
            }}
            title={`Fit mode: ${tileFitMode} (click to cycle: auto → fill → contain)`}
          >
            <dc.Icon icon={tileFitMode === 'contain' ? 'lucide-minimize-2' : tileFitMode === 'fill' ? 'lucide-maximize-2' : 'lucide-scan'} size={14} />
          </button>
          <button
            className="dmt-tile-browser-action-btn"
            onClick={onTileDeselect}
            title="Deselect tile"
          >
            <dc.Icon icon="lucide-x" size={14} />
          </button>
        </div>
      )}

      {/* Tile scale slider */}
      {selectedTileId && (
        <div className="dmt-tile-browser-scale-row">
          <dc.Icon icon="lucide-scaling" size={12} />
          <input
            type="range"
            min="0.25"
            max="3"
            step="0.25"
            value={tileScale}
            onInput={(e: Event) => onTileScaleChange(parseFloat((e.target as HTMLInputElement).value))}
            className="dmt-tile-config-slider"
            title={`Scale: ${tileScale}x`}
          />
          <span className="dmt-tile-config-value">{tileScale}x</span>
          {tileScale !== 1 && (
            <button
              className="dmt-tile-browser-action-btn"
              onClick={() => onTileScaleChange(1)}
              title="Reset to 1x"
            >
              <dc.Icon icon="lucide-rotate-ccw" size={12} />
            </button>
          )}
        </div>
      )}

    </div>
  );
};

return { TileAssetBrowser };

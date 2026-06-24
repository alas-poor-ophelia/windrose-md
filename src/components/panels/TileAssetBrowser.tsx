/**
 * TileAssetBrowser.tsx
 *
 * Full drawer content for the tile browser panel.
 * Structure: header → depth band → filter → tag chips →
 * body (jump rail + tile grid) → loaded-brush footer.
 */

import type { TilesetDef, TileEntry, TilesetOverrides, TileLayerRole, TileMetadataStore } from '#types/tiles/tile.types';
import type { ToolId } from '#types/tools/tool.types';
import type { FlyoutTile } from './DrawerDock';
import type { VNode, ComponentChildren } from 'preact';
import { TFile } from 'obsidian';
import type { App } from 'obsidian';

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { memo } from 'preact/compat';
import { useApp } from '../../context/AppContext';
import { useThumbnailPipeline } from '../../hooks/state/useThumbnailPipeline';
import { THUMB_SIZE } from '../../assets/thumbnailCache';
import { usePreactVirtualizer } from '../../hooks/state/useVirtualizer';
import { Icon } from '../shared/Icon';
import { CornerBrackets } from '../shared/CornerBrackets';
import { DepthBar, depthMeta } from './DepthBar';
import {
  loadTileMetadata,
  saveTileMetadataDebounced,
  setTileMetadataForRender,
  bulkAddTag,
  bulkToggleStar,
  bulkSetDepthAffinity,
  bulkSetDetectionSignals,
  bulkSetDefaultSpan,
  isStarred,
  collectUniqueTags,
  collectDepthAwareTags,
  getAllTags,
} from '../../persistence/tileMetadata';
import { predictDepthTier } from '../../assets/depthPredictor';
import { clusterCategories } from '../../assets/categoryMerge';
import type { FolderInput } from '../../assets/categoryMerge';
import { predictSpan, DEFAULT_PIXELS_PER_CELL } from '../../assets/spanPredictor';
import { runDetectionScan } from '../../assets/tileImageScan';

// ===========================================
// Content-bounds detection for tile thumbnails
// ===========================================

const boundsCache = new Map<string, { x: number; y: number; w: number; h: number }>();
// eslint-disable-next-line obsidianmd/prefer-active-doc -- detached offscreen scratch canvas for content-bounds detection; never attached to DOM, document-agnostic.
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
  // willReadFrequently: software-backed canvas so getImageData doesn't stall the GPU.
  const ctx = scratchCanvas.getContext('2d', { willReadFrequently: true });
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

const PREVIEW_SIZE = 192;

interface TileThumbnailProps {
  url: string | null;
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
  app: App,
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

const TileThumbnail = memo(({ url }: TileThumbnailProps): VNode => {
  if (url != null && url !== '') {
    return <img src={url} className="windrose-tile-thumb-img" width={THUMB_SIZE} height={THUMB_SIZE} alt="" />;
  }
  // '' = terminal load failure (static placeholder); null = still loading (shimmer).
  const failed = url === '';
  return (
    <div
      className={failed ? 'windrose-tile-thumb-placeholder is-failed' : 'windrose-tile-thumb-placeholder'}
      style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
    />
  );
});

// ===========================================
// Horizontal scroller (wheel→sideways + drag)
// ===========================================

function HScroll({ className, children }: { className?: string; children: ComponentChildren }): VNode {
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

const LoadedChipThumb = memo(({ url }: { url: string | null }): VNode => {
  return url != null && url !== ''
    ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
    : <div style={{ width: '100%', height: '100%' }} />;
});

// ===========================================
// Category card with 2×2 mosaic preview
// ===========================================

function MosaicCard({ category, tiles, count, getThumbUrl, onClick }: {
  category: string;
  tiles: TileEntry[];
  count: number;
  getThumbUrl: (path: string) => string | null;
  onClick: () => void;
}): VNode {
  const preview = tiles.slice(0, 4);
  return (
    <button className="windrose-tb-card" onClick={onClick}>
      <div className="windrose-tb-mosaic">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="windrose-tb-mosaic-cell">
            {preview[i] != null && <TileThumbnail url={getThumbUrl(preview[i].vaultPath)} />}
          </div>
        ))}
      </div>
      <div className="windrose-tb-card-meta">
        <span className="windrose-tb-card-name">{category}</span>
        <span className="windrose-tb-card-count">
          {count}<Icon icon="lucide-chevron-right" size={11} />
        </span>
      </div>
    </button>
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
  /** False while the hosting drawer is collapsed — suspends thumbnail generation for the hidden grid. */
  active?: boolean;
  recentTiles?: Array<{ tilesetId: string; tileId: string }>;
  onStarredChange?: (tiles: FlyoutTile[]) => void;
}

// `string & {}` keeps the literal autocomplete hints while still allowing any
// dynamic tileset id (set via setRailSel(cat)) without collapsing to bare string.
type RailSelection = 'all' | 'recent' | 'starred' | (string & {});

type FullModeRow =
  | { type: 'recentHeader' }
  | { type: 'tileRow'; tiles: TileEntry[] }
  | { type: 'catHeader'; category: string; count: number; collapsed: boolean }
  | { type: 'empty'; message: string };

function displayCategory(category: string): string {
  const parts = category.split('/');
  if (parts.length <= 2) return category;
  return parts.slice(-2).join('/');
}

const ROTATION_STEPS = [0, 60, 120, 180, 240, 300];

// memo: the map root re-renders on EVERY pointermove (viewState lives in its
// state). Without memo, this entire tree — hundreds of tile nodes when any
// tileset is configured — re-renders and re-diffs per touch event, which is
// the dominant per-gesture CPU cost on tablets. All props must stay
// identity-stable across pan renders (no inline arrows at call sites).
const TileAssetBrowser = memo(({
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
  active = true,
  recentTiles,
  onStarredChange,
}: TileAssetBrowserProps): VNode | null => {
  const app = useApp();
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [showTilesetConfig, setShowTilesetConfig] = useState<boolean>(false);
  // Which tileset the config panel targets (null = follow the current selection).
  const [configTilesetId, setConfigTilesetId] = useState<string | null>(null);
  const [hoveredTile, setHoveredTile] = useState<TileEntry | null>(null);
  const [railSel, setRailSel] = useState<RailSelection>('all');
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [packFilter, setPackFilter] = useState<Set<string>>(new Set());
  const [openCat, setOpenCat] = useState<string | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const browserRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement | null>(null);
  const [organize, setOrganize] = useState(false);
  const [orgSelection, setOrgSelection] = useState<Set<string>>(new Set());
  const [orgSearch, setOrgSearch] = useState('');
  const [orgShowTag, setOrgShowTag] = useState(false);
  const [orgTagInput, setOrgTagInput] = useState('');
  const [orgShowTier, setOrgShowTier] = useState(false);
  const [tileMetadata, setTileMetadata] = useState<TileMetadataStore>({});
  const { getThumbUrl, requestThumbs } = useThumbnailPipeline();
  const orgScrollRef = useRef<HTMLDivElement>(null);
  const gridWrapRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Reset rail, tags, and drill-down when depth changes
  useEffect(() => {
    setRailSel('all');
    setActiveTags(new Set());
    setPackFilter(new Set());
    setOpenCat(null);
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
        portalRef.current.hide();
      }
      return undefined;
    }

    if (!portalRef.current) {
      const div = activeDocument.createElement('div');
      div.className = 'windrose-tile-preview-portal';
      const canvas = activeDocument.createElement('canvas');
      canvas.width = PREVIEW_SIZE;
      canvas.height = PREVIEW_SIZE;
      canvas.classList.add('windrose-tile-preview-canvas');
      const label = activeDocument.createElement('div');
      label.className = 'windrose-tile-preview-label';
      div.appendChild(canvas);
      div.appendChild(label);
      activeDocument.body.appendChild(div);
      portalRef.current = div;
      previewRef.current = canvas;
    }

    const portal = portalRef.current;
    const canvas = previewRef.current;
    if (canvas == null) return undefined;
    const label = portal.querySelector('.windrose-tile-preview-label') as HTMLElement;

    if (browserRef.current) {
      const rect = browserRef.current.getBoundingClientRect();
      portal.show();
      const topVal = (rect.top + rect.height / 2 - (PREVIEW_SIZE + 24) / 2) + 'px';
      const leftVal = (rect.left - PREVIEW_SIZE - 16) + 'px';
      portal.style.setProperty('top', topVal);
      portal.style.setProperty('left', leftVal);
    }

    label.textContent = hoveredTile.filename + (rotation ? ` (${rotation}°)` : '') + (flipH ? ' [flipped]' : '');

    const isHoveredSelected = selectedTilesetId === tileToTilesetId.get(hoveredTile.vaultPath) && selectedTileId === hoveredTile.id;
    if (isHoveredSelected && (rotation || flipH)) {
      const transformVal = `rotate(${rotation}deg)${flipH ? ' scaleX(-1)' : ''}`;
      canvas.style.setProperty('transform', transformVal);
    } else {
      canvas.style.removeProperty('transform');
    }

    return loadVaultImage(app, hoveredTile.vaultPath, getCachedImage, (img) => {
      drawTileToCanvas(canvas, img, PREVIEW_SIZE);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- app stable, getCachedImage low-churn; tileToTilesetId is a memo declared later (forward ref); exact-field hover effect
  }, [hoveredTile, rotation, flipH, selectedTilesetId, selectedTileId]);

  // Cleanup portal on unmount
  useEffect(() => {
    return () => {
      if (portalRef.current) {
        activeDocument.body.removeChild(portalRef.current);
        portalRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const target = organize ? orgScrollRef.current : gridWrapRef.current;
    if (!target) return;
    const ro = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry != null) setContainerWidth(entry.contentRect.width);
    });
    ro.observe(target);
    return () => ro.disconnect();
  }, [organize]);

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

  const togglePack = (id: string): void => {
    setPackFilter(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ---- Organize mode ----

  useEffect(() => {
    void loadTileMetadata(app).then(setTileMetadata);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-once metadata load; app is the immutable Obsidian singleton
  }, []);

  // Keep the renderer's global metadata accessor in sync with browser edits
  // (detection scans, render-mode toggles) so placed tiles resolve their mode
  // from the latest classification.
  useEffect(() => {
    setTileMetadataForRender(tileMetadata);
  }, [tileMetadata]);

  // Report starred tiles to parent for spine flyout
  const prevStarredRef = useRef<string>('');
  useEffect(() => {
    if (!onStarredChange) return;
    const starred: FlyoutTile[] = [];
    for (const ts of tilesets) {
      for (const t of ts.tiles) {
        if (isStarred(tileMetadata, t.vaultPath)) {
          starred.push({ tilesetId: ts.id, tileId: t.id, filename: t.filename, vaultPath: t.vaultPath });
        }
      }
    }
    const top = starred.slice(0, 20);
    const key = top.map(t => t.vaultPath).join('\n');
    if (key === prevStarredRef.current) return;
    prevStarredRef.current = key;
    onStarredChange(top);
  }, [tileMetadata, tilesets, onStarredChange]);

  // Thumbnail requests are driven by virtualizer visibility — see effect after virtualizer setup

  // Auto-predict depth affinity for tiles that don't have one yet (deferred to idle)
  const predictionRanRef = useRef(false);
  useEffect(() => {
    if (predictionRanRef.current) return;
    if (tilesets.length === 0) return;

    const run = (): void => {
      if (predictionRanRef.current) return;
      const allTiles = tilesets.flatMap(ts => ts.tiles);
      if (allTiles.length === 0) return;
      const missing: Array<{ vaultPath: string; depth: TileLayerRole }> = [];
      for (const tile of allTiles) {
        const entry = tileMetadata[tile.vaultPath];
        if (entry?.depthAffinity != null) continue;
        const { tier, confidence } = predictDepthTier(tile, entry);
        if (confidence >= 0.4) {
          missing.push({ vaultPath: tile.vaultPath, depth: tier });
        }
      }
      if (missing.length > 0) {
        predictionRanRef.current = true;
        const updated = bulkSetDepthAffinity(tileMetadata, missing);
        setTileMetadata(updated);
        saveTileMetadataDebounced(app, updated);
      } else if (allTiles.some(t => tileMetadata[t.vaultPath]?.depthAffinity != null)) {
        predictionRanRef.current = true;
      }
    };

    const id = typeof requestIdleCallback === 'function'
      ? requestIdleCallback(run)
      : window.setTimeout(run, 200) as unknown as number;
    return () => {
      if (typeof cancelIdleCallback === 'function') { cancelIdleCallback(id); } else { window.clearTimeout(id); }
    };
  }, [tilesets, tileMetadata, app]);

  // Eager detection scan: caches per-tile alpha coverage + opaque bounds + natural
  // dims (decoupled from thumbnails, which are lazy + LRU-evicted). Signals only —
  // render-mode/footprint predictions are applied at import time, never bulk-persisted
  // for an existing library (see comment inside).
  const detectionScanRanRef = useRef(false);
  useEffect(() => {
    if (detectionScanRanRef.current) return;
    if (tilesets.length === 0) return;

    const controller = new AbortController();
    const run = async (): Promise<void> => {
      if (detectionScanRanRef.current) return;
      detectionScanRanRef.current = true;

      const allTiles = tilesets.flatMap(ts => ts.tiles);
      const needsScan = allTiles
        .filter(t => {
          const e = tileMetadata[t.vaultPath];
          // Re-scan entries missing either signal — older scans cached
          // alphaCoverage/opaque bounds but not the natural dims footprint needs.
          return e?.alphaCoverage == null || e?.srcW == null;
        })
        .map(t => t.vaultPath);
      const scanned = needsScan.length > 0
        ? await runDetectionScan(app, needsScan, { concurrency: 4, signal: controller.signal })
        : [];
      if (controller.signal.aborted) return;

      setTileMetadata(prev => {
        // Signals only. Render-mode and footprint PREDICTIONS must not be
        // persisted here: per-tile metadata outranks the per-tileset setting in
        // resolveTileRender, so bulk-writing predictions for an existing library
        // retroactively changes how already-placed tiles render on every device
        // the metadata file syncs to (2026-06-09: 304 tiles silently flipped to
        // 'region', breaking placed terrain). Predictions are applied at import
        // time (DungeondraftImportModal), where no placements exist yet.
        if (scanned.length === 0) return prev;
        const updated = bulkSetDetectionSignals(prev, scanned);
        saveTileMetadataDebounced(app, updated);
        return updated;
      });
    };

    const id = typeof requestIdleCallback === 'function'
      ? requestIdleCallback(() => void run())
      : window.setTimeout(() => void run(), 400) as unknown as number;
    return () => {
      controller.abort();
      if (typeof cancelIdleCallback === 'function') { cancelIdleCallback(id); } else { window.clearTimeout(id); }
    };
  }, [tilesets, tileMetadata, app]);

  // Merge all tileset tiles into a single pool
  const allTiles = useMemo(() => {
    const tiles: TileEntry[] = [];
    for (const ts of tilesets) tiles.push(...ts.tiles);
    return tiles;
  }, [tilesets]);

  // Map vaultPath → tilesetId for click handlers
  const tileToTilesetId = useMemo(() => {
    const map = new Map<string, string>();
    for (const ts of tilesets) {
      for (const t of ts.tiles) map.set(t.vaultPath, ts.id);
    }
    return map;
  }, [tilesets]);

  const orgFilteredTiles = useMemo((): TileEntry[] => {
    if (!organize) return [];
    if (orgSearch === '') return allTiles;
    const lower = orgSearch.toLowerCase();
    return allTiles.filter(t =>
      t.filename.toLowerCase().includes(lower) ||
      (t.category != null && t.category.toLowerCase().includes(lower)) ||
      (t.tags != null && t.tags.some(tag => tag.toLowerCase().includes(lower)))
    );
  }, [organize, allTiles, orgSearch]);

  const orgAllOn = orgFilteredTiles.length > 0 && orgFilteredTiles.every(t => orgSelection.has(t.vaultPath));

  const orgTagSuggestions = useMemo((): string[] => {
    if (!organize) return [];
    return collectUniqueTags(allTiles, tileMetadata).slice(0, 12);
  }, [organize, allTiles, tileMetadata]);

  const toggleOrgSelect = (vaultPath: string): void => {
    setOrgSelection(prev => {
      const next = new Set(prev);
      if (next.has(vaultPath)) next.delete(vaultPath);
      else next.add(vaultPath);
      return next;
    });
  };

  const selectAllOrg = (): void => {
    const allPaths = orgFilteredTiles.map(t => t.vaultPath);
    setOrgSelection(orgAllOn ? new Set() : new Set(allPaths));
  };

  const handleBulkTag = (): void => {
    if (orgTagInput.trim() === '' || orgSelection.size === 0) return;
    const paths = Array.from(orgSelection);
    const updated = bulkAddTag(tileMetadata, paths, orgTagInput.trim());
    setTileMetadata(updated);
    saveTileMetadataDebounced(app, updated);
    setOrgTagInput('');
    setOrgShowTag(false);
  };

  const handleBulkStar = (): void => {
    if (orgSelection.size === 0) return;
    const paths = Array.from(orgSelection);
    const anyUnstarred = paths.some(p => !isStarred(tileMetadata, p));
    const updated = bulkToggleStar(tileMetadata, paths, anyUnstarred);
    setTileMetadata(updated);
    saveTileMetadataDebounced(app, updated);
  };

  const handleBulkTier = (tier: TileLayerRole): void => {
    if (orgSelection.size === 0) return;
    const entries = Array.from(orgSelection).map(vaultPath => ({ vaultPath, depth: tier }));
    const updated = bulkSetDepthAffinity(tileMetadata, entries);
    setTileMetadata(updated);
    saveTileMetadataDebounced(app, updated);
    setOrgShowTier(false);
  };

  const exitOrganize = (): void => {
    setOrganize(false);
    setOrgSelection(new Set());
    setOrgSearch('');
    setOrgShowTag(false);
    setOrgShowTier(false);
    setOrgTagInput('');
  };

  // Collect available tags, sorted by depth relevance when on grid maps
  const availableTags = useMemo(() => {
    if (allTiles.length === 0) return [];
    if (mapType === 'grid') {
      return collectDepthAwareTags(allTiles, tileMetadata, tileDepth);
    }
    return collectUniqueTags(allTiles, tileMetadata);
  }, [allTiles, tileMetadata, tileDepth, mapType]);

  const filteredTiles = useMemo(() => {
    if (allTiles.length === 0) return [];
    let tiles = allTiles;

    // Text search (includes import + user tags via metadata)
    if (searchFilter != null && searchFilter !== '') {
      const lower = searchFilter.toLowerCase();
      tiles = tiles.filter((t: TileEntry) => {
        if (t.filename.toLowerCase().includes(lower)) return true;
        if (t.category != null && t.category !== '' && t.category.toLowerCase().includes(lower)) return true;
        const tags = getAllTags(t, tileMetadata);
        return tags.some(tag => tag.toLowerCase().includes(lower));
      });
    }

    // Tag filter (AND logic, includes import + user tags)
    if (activeTags.size > 0) {
      tiles = tiles.filter((t: TileEntry) => {
        const tags = getAllTags(t, tileMetadata);
        const lowerTags = tags.map(tag => tag.toLowerCase());
        return Array.from(activeTags).every(tag => lowerTags.includes(tag.toLowerCase()));
      });
    }

    // Pack filter (OR within packs, AND with the other facets)
    if (packFilter.size > 0) {
      tiles = tiles.filter((t: TileEntry) => packFilter.has(tileToTilesetId.get(t.vaultPath) ?? 'unknown'));
    }

    return tiles;
  }, [allTiles, searchFilter, activeTags, packFilter, tileToTilesetId, tileMetadata]);

  // Packs present in the current tile set, for the Pack filter facet (Phase 3).
  const availablePacks = useMemo((): Array<{ id: string; name: string }> => {
    const present = new Set<string>();
    for (const tile of allTiles) {
      const id = tileToTilesetId.get(tile.vaultPath);
      if (id != null) present.add(id);
    }
    return tilesets.filter(ts => present.has(ts.id)).map(ts => ({ id: ts.id, name: ts.name }));
  }, [allTiles, tileToTilesetId, tilesets]);

  // Cross-pack category merge (Phase 2): collapse messy import-time folders into
  // one canonical category, with cross-pack duplicates merged. Built over ALL tiles
  // so the category set stays stable regardless of search/tag filtering. Keyed by
  // `${pack}|${rawCategory}` so the same folder name in different packs resolves
  // independently. Replaces the old pack-name-prefix disambiguation.
  const mergedCategories = useMemo(() => {
    const seen = new Set<string>();
    const folders: FolderInput[] = [];
    for (const tile of allTiles) {
      const raw = tile.category ?? 'Uncategorized';
      const pack = tileToTilesetId.get(tile.vaultPath) ?? 'unknown';
      const key = `${pack}|${raw}`;
      if (!seen.has(key)) {
        seen.add(key);
        folders.push({ raw, pack });
      }
    }
    const lookup = new Map<string, string>();
    // Per-canonical-label provenance for the merge banner (only where a merge happened).
    const meta = new Map<string, { folders: number; packs: number }>();
    for (const c of clusterCategories(folders)) {
      for (const m of c.members) lookup.set(`${m.pack}|${m.raw}`, c.label);
      if (c.merged) {
        const packs = new Set(c.members.map(m => m.pack));
        meta.set(c.label, { folders: c.members.length, packs: packs.size });
      }
    }
    return { lookup, meta };
  }, [allTiles, tileToTilesetId]);

  const groupedTiles = useMemo(() => {
    const groups = new Map<string, TileEntry[]>();
    for (const tile of filteredTiles) {
      const raw = tile.category ?? 'Uncategorized';
      const pack = tileToTilesetId.get(tile.vaultPath) ?? 'unknown';
      const cat = mergedCategories.lookup.get(`${pack}|${raw}`) ?? raw;
      const bucket = groups.get(cat);
      if (bucket === undefined) {
        groups.set(cat, [tile]);
      } else {
        bucket.push(tile);
      }
    }
    return groups;
  }, [filteredTiles, mergedCategories, tileToTilesetId]);

  // Merge banner (Option B): provenance for the currently-open single category.
  const openCategoryMerge = useMemo(() => {
    if (railSel === 'all' || railSel === 'recent' || railSel === 'starred') return null;
    return mergedCategories.meta.get(railSel) ?? null;
  }, [railSel, mergedCategories]);

  // Resolve which groups to show based on rail selection
  const shownGroups = useMemo((): Array<[string, TileEntry[]]> => {
    const entries = Array.from(groupedTiles.entries());
    if (railSel === 'all' || railSel === 'recent' || railSel === 'starred') return entries;
    return entries.filter(([cat]) => cat === railSel);
  }, [groupedTiles, railSel]);

  // Resolve the selected tile entry for the loaded-brush footer
  const selectedTile = useMemo((): TileEntry | null => {
    if (selectedTileId == null || selectedTilesetId == null) return null;
    const ts = tilesets.find(t => t.id === selectedTilesetId);
    return ts?.tiles.find(t => t.id === selectedTileId) ?? null;
  }, [selectedTileId, selectedTilesetId, tilesets]);

  // Resolve recent tiles across all tilesets
  const recentTileEntries = useMemo((): TileEntry[] => {
    if (!recentTiles || tilesets.length === 0) return [];
    return recentTiles
      .map(r => {
        const ts = tilesets.find(t => t.id === r.tilesetId);
        return ts?.tiles.find(t => t.id === r.tileId);
      })
      .filter((t): t is TileEntry => t != null);
  }, [recentTiles, tilesets]);

  // Grid sizing
  const tileMin = compact ? 42 : 56;
  const gridGap = compact ? 3 : 6;

  // Virtualization: column counts and cell sizes
  const orgColCount = organize && containerWidth > 0
    ? Math.max(1, Math.floor((containerWidth + 6) / (52 + 6)))
    : 1;
  const orgCellWidth = orgColCount > 0 && containerWidth > 0
    ? (containerWidth - (orgColCount - 1) * 6) / orgColCount
    : 52;

  const fullColCount = !compact && !organize && containerWidth > 0
    ? Math.max(1, Math.floor((containerWidth + gridGap) / (tileMin + gridGap)))
    : 1;
  const fullCellWidth = fullColCount > 0 && containerWidth > 0
    ? (containerWidth - (fullColCount - 1) * gridGap) / fullColCount
    : tileMin;

  const orgRows = useMemo((): TileEntry[][] => {
    if (!organize || containerWidth <= 0) return [];
    const rows: TileEntry[][] = [];
    for (let i = 0; i < orgFilteredTiles.length; i += orgColCount) {
      rows.push(orgFilteredTiles.slice(i, i + orgColCount));
    }
    return rows;
  }, [organize, containerWidth, orgFilteredTiles, orgColCount]);

  const fullRows = useMemo((): FullModeRow[] => {
    if (compact || organize || containerWidth <= 0) return [];
    const rows: FullModeRow[] = [];

    if (railSel === 'recent' && recentTileEntries.length > 0) {
      rows.push({ type: 'recentHeader' });
      for (let i = 0; i < recentTileEntries.length; i += fullColCount) {
        rows.push({ type: 'tileRow', tiles: recentTileEntries.slice(i, i + fullColCount) });
      }
    }

    if (railSel !== 'recent') {
      for (const [category, tiles] of shownGroups) {
        const collapsed = collapsedCategories.has(category);
        rows.push({ type: 'catHeader', category, count: tiles.length, collapsed });
        if (!collapsed) {
          for (let i = 0; i < tiles.length; i += fullColCount) {
            rows.push({ type: 'tileRow', tiles: tiles.slice(i, i + fullColCount) });
          }
        }
      }
    }

    if (filteredTiles.length === 0) {
      rows.push({
        type: 'empty',
        message: searchFilter !== '' ? 'No matching tiles' : 'No tiles loaded',
      });
    }

    return rows;
  }, [compact, organize, containerWidth, railSel, recentTileEntries, shownGroups, collapsedCategories, filteredTiles.length, searchFilter, fullColCount]);

  const orgVirtualizer = usePreactVirtualizer({
    count: orgRows.length,
    getScrollElement: () => orgScrollRef.current,
    estimateSize: () => orgCellWidth,
    gap: 6,
    enabled: organize && containerWidth > 0,
    overscan: 5,
  });

  const fullVirtualizer = usePreactVirtualizer({
    count: fullRows.length,
    getScrollElement: () => gridWrapRef.current,
    estimateSize: (index: number) => {
      const row = fullRows[index];
      if (row == null) return fullCellWidth;
      switch (row.type) {
        case 'catHeader':
        case 'recentHeader':
          return 24;
        case 'empty':
          return 40;
        default:
          return fullCellWidth;
      }
    },
    gap: gridGap,
    enabled: !compact && !organize && containerWidth > 0,
    overscan: 5,
  });

  // Request thumbnails only for visible tiles (virtualizer-driven)
  const orgRange = orgVirtualizer.range;
  const fullRange = fullVirtualizer.range;
  useEffect(() => {
    // A collapsed drawer keeps this component mounted for its fold animation;
    // generating thumbnails for an invisible grid re-decodes + rescans the whole
    // tile library on every parent re-render (i.e. every map interaction).
    if (!active || tilesets.length === 0) return;

    const paths: string[] = [];

    if (organize) {
      for (const v of orgVirtualizer.getVirtualItems()) {
        const row = orgRows[v.index];
        if (row != null) for (const t of row) paths.push(t.vaultPath);
      }
    } else if (!compact) {
      for (const v of fullVirtualizer.getVirtualItems()) {
        const row = fullRows[v.index];
        if (row?.type === 'tileRow') {
          for (const t of row.tiles) paths.push(t.vaultPath);
        }
      }
    } else {
      // Compact mode: no virtualization, request all filtered tiles
      for (const t of filteredTiles) paths.push(t.vaultPath);
    }

    if (paths.length > 0) requestThumbs(paths);
  }, [active, tilesets, organize, compact, orgRows, fullRows, orgRange, fullRange, filteredTiles, requestThumbs, fullVirtualizer, orgVirtualizer]);

  // ---- Empty state: no tilesets ----

  if (tilesets.length === 0) {
    const openTilesetSettings = (): void => {
      // Obsidian's settings opener is an internal (untyped) API.
      const settingApp = app as typeof app & {
        setting: { open(): void; openTabById(id: string): void };
      };
      settingApp.setting.open();
      settingApp.setting.openTabById('windrose-md');
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

      {organize ? (
        <>
          <div className="windrose-tb-head windrose-tb-head-organize">
            <Icon icon="lucide-check-square" size={16} />
            <div className="windrose-tb-title">Organize</div>
            <span className="windrose-tb-cap" style={{ marginRight: 'auto', marginLeft: 4 }}>
              tag & sort the library
            </span>
            <button className="windrose-tb-iconbtn ghost" title="Done" onClick={exitOrganize}>
              <Icon icon="lucide-check" size={16} />
            </button>
          </div>

          <div className="windrose-tb-org-search">
            <div className="windrose-tb-search">
              <Icon icon="lucide-search" size={15} />
              <input
                value={orgSearch}
                onInput={(e: Event) => setOrgSearch((e.target as HTMLInputElement).value)}
                placeholder="Search to narrow…"
                style={{ fontSize: 13 }}
              />
              <span className="windrose-tb-cap">{orgFilteredTiles.length}</span>
            </div>
          </div>

          <div className="windrose-tb-org-bar">
            <button
              className={`windrose-tb-chip ${orgAllOn ? 'active' : ''}`}
              style={{ fontWeight: 600 }}
              onClick={selectAllOrg}
            >
              <Icon icon="lucide-check-square" size={12} />
              {orgAllOn ? 'Deselect all' : `Select all ${orgFilteredTiles.length}`}
            </button>
            <span
              className="windrose-tb-cap"
              style={{ marginLeft: 'auto', color: orgSelection.size > 0 ? 'var(--windrose-gold-bright)' : undefined }}
            >
              <b>{orgSelection.size}</b> selected
            </span>
          </div>

          <div className="windrose-tb-org-body" ref={orgScrollRef}>
            <div style={{ height: orgVirtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
              {orgVirtualizer.getVirtualItems().map(virtualRow => {
                const rowTiles = orgRows[virtualRow.index];
                if (rowTiles == null) return null;
                return (
                  <div
                    key={virtualRow.key}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${orgColCount}, 1fr)`, gap: 6 }}>
                      {rowTiles.map(tile => {
                        const on = orgSelection.has(tile.vaultPath);
                        return (
                          <div
                            key={tile.vaultPath}
                            className={`windrose-tile-thumb ${on ? 'sel' : 'dim'}`}
                            onClick={() => toggleOrgSelect(tile.vaultPath)}
                            title={tile.filename}
                          >
                            <TileThumbnail url={getThumbUrl(tile.vaultPath)} />
                            <div className={`windrose-tb-check ${on ? 'on' : ''}`}>
                              {on && <Icon icon="lucide-check" size={12} />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            {orgFilteredTiles.length === 0 && (
              <div className="windrose-tb-empty">No matching tiles</div>
            )}
          </div>

          {orgShowTag && (
            <div className="windrose-tb-tag-pop">
              <div style={{ fontSize: 11, color: 'var(--windrose-text-secondary)', marginBottom: 8 }}>
                Add tag to <b style={{ color: 'var(--windrose-gold-bright)' }}>{orgSelection.size}</b> tiles
              </div>
              <div className="windrose-tb-search" style={{ marginBottom: 9 }}>
                <Icon icon="lucide-tag" size={13} />
                <input
                  placeholder="New tag…"
                  value={orgTagInput}
                  onInput={(e: Event) => setOrgTagInput((e.target as HTMLInputElement).value)}
                />
              </div>
              <div className="windrose-tb-chips-scroll" style={{ flexWrap: 'wrap' }}>
                {orgTagSuggestions.map(t => (
                  <button key={t} className="windrose-tb-chip" onClick={() => setOrgTagInput(t)}>
                    {t}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 7, marginTop: 11 }}>
                <button
                  className="windrose-tb-act windrose-tb-act-cancel"
                  onClick={() => { setOrgShowTag(false); setOrgTagInput(''); }}
                >
                  Cancel
                </button>
                <button
                  className="windrose-tb-act windrose-tb-act-apply"
                  onClick={handleBulkTag}
                >
                  Apply
                </button>
              </div>
            </div>
          )}

          {orgShowTier && (
            <div className="windrose-tb-org-tier">
              <div className="windrose-tb-org-tier-label">Assign depth tier:</div>
              <div className="windrose-tb-org-tier-btns">
                {(['ground', 'structure', 'props', 'decoration'] as TileLayerRole[]).map(role => (
                  <button
                    key={role}
                    className="windrose-tb-act"
                    onClick={() => handleBulkTier(role)}
                  >
                    <Icon icon={depthMeta(role).icon} size={14} />
                    {depthMeta(role).label}
                  </button>
                ))}
              </div>
              <button
                className="windrose-tb-act"
                onClick={() => setOrgShowTier(false)}
              >
                Cancel
              </button>
            </div>
          )}

          <div className="windrose-tb-org-actions">
            <button className="windrose-tb-act" disabled={orgSelection.size === 0} onClick={() => setOrgShowTag(true)}>
              <Icon icon="lucide-tag" size={14} /> Tag…
            </button>
            <button
              className="windrose-tb-act"
              disabled={orgSelection.size === 0}
              onClick={() => setOrgShowTier(!orgShowTier)}
            >
              <Icon icon="lucide-layers" size={14} /> Tier…
            </button>
            <button className="windrose-tb-act" disabled={true}>
              <Icon icon="lucide-folder-input" size={14} /> Move…
            </button>
            <button
              className="windrose-tb-act windrose-tb-act-star"
              disabled={orgSelection.size === 0}
              onClick={handleBulkStar}
              title="Star selection"
            >
              <Icon icon="lucide-star" size={14} />
            </button>
          </div>
        </>
      ) : (<>

      {/* Header */}
      <div className="windrose-tb-head">
        <div className="windrose-tb-title">Tiles</div>
        <span className="windrose-tb-cap" style={{ marginRight: 'auto', marginLeft: 2 }}>
          {tilesets.length === 1 ? tilesets[0].name : `${tilesets.length} packs`}
        </span>
        {onTilesetOverrideChange != null && tilesets.length > 0 && (
          <button
            className="windrose-tb-iconbtn ghost"
            title="Tileset settings"
            onClick={() => setShowTilesetConfig(!showTilesetConfig)}
          >
            <Icon icon="lucide-sliders-horizontal" size={15} />
          </button>
        )}
        {!compact && (
          <button
            className="windrose-tb-iconbtn ghost"
            title="Organize tiles"
            onClick={() => setOrganize(true)}
          >
            <Icon icon="lucide-check-square" size={15} />
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

      {/* Tileset config panel (inline) */}
      {showTilesetConfig && tilesets.length > 0 && onTilesetOverrideChange != null && (() => {
        // Configure the explicitly-picked set, else the selected tile's set, else the first.
        const configTileset =
          tilesets.find(t => t.id === configTilesetId) ??
          tilesets.find(t => t.id === selectedTilesetId) ??
          tilesets[0];
        const currentOverrides = tilesetOverrides?.[configTileset.id] ?? {};
        const threshold = currentOverrides.stampThreshold ?? configTileset.stampThreshold ?? 0.5;
        const minScale = currentOverrides.minStampScale ?? configTileset.minStampScale ?? 0.2;
        const fitMode = currentOverrides.fitMode ?? configTileset.fitMode;
        const renderMode = currentOverrides.renderMode ?? configTileset.renderMode ?? 'cell';
        const worldRepeat = currentOverrides.worldRepeat ?? configTileset.worldRepeat ?? 4;
        const edgeFeather = currentOverrides.edgeFeather ?? configTileset.edgeFeather ?? 0.25;
        const pixelsPerCell = currentOverrides.pixelsPerCell ?? configTileset.pixelsPerCell ?? DEFAULT_PIXELS_PER_CELL;

        const handleOverrideChange = (field: keyof TilesetOverrides, value: number | string | undefined): void => {
          const updated = { ...currentOverrides, [field]: value };
          if (value === undefined) delete updated[field];
          onTilesetOverrideChange(configTileset.id, updated);
        };

        // pixelsPerCell is the footprint divisor (first ruler). Changing it must
        // recompute every baked span in this tileset from the cached natural dims —
        // pure arithmetic, no image re-decode.
        const handlePixelsPerCellChange = (value: number | undefined): void => {
          const updated = { ...currentOverrides, pixelsPerCell: value };
          if (value === undefined) delete updated.pixelsPerCell;
          onTilesetOverrideChange(configTileset.id, updated);
          const ppc = value ?? DEFAULT_PIXELS_PER_CELL;
          setTileMetadata(prev => {
            const spanEntries: Array<{ vaultPath: string; spanW: number; spanH: number }> = [];
            for (const tile of configTileset.tiles) {
              const e = prev[tile.vaultPath];
              if (e == null || e.renderMode === 'region') continue;
              if (e.srcW == null || e.srcH == null) continue;
              const { spanW, spanH } = predictSpan(e.srcW, e.srcH, ppc);
              spanEntries.push({ vaultPath: tile.vaultPath, spanW, spanH });
            }
            if (spanEntries.length === 0) return prev;
            const next = bulkSetDefaultSpan(prev, spanEntries);
            saveTileMetadataDebounced(app, next);
            return next;
          });
        };

        return (
          <div className="windrose-tb-config">
            {tilesets.length > 1 && (
              <div className="windrose-tile-config-row">
                <label>Tileset</label>
                <select
                  value={configTileset.id}
                  onChange={(e: Event) => setConfigTilesetId((e.target as HTMLSelectElement).value)}
                  className="windrose-tile-config-select"
                >
                  {tilesets.map(ts => (
                    <option key={ts.id} value={ts.id}>{ts.name}</option>
                  ))}
                </select>
              </div>
            )}
            {isGrid && (
              <div className="windrose-tile-config-row">
                <label>Terrain fill</label>
                <select
                  value={renderMode}
                  onChange={(e: Event) => {
                    const v = (e.target as HTMLSelectElement).value;
                    handleOverrideChange('renderMode', v === 'region' ? 'region' : undefined);
                  }}
                  className="windrose-tile-config-select"
                >
                  <option value="cell">Per-cell</option>
                  <option value="region">Tiled (seamless)</option>
                </select>
              </div>
            )}
            {isGrid && renderMode === 'region' && (
              <div className="windrose-tile-config-row">
                <label>Texture size</label>
                <input
                  type="range"
                  min="1"
                  max="12"
                  step="1"
                  value={worldRepeat}
                  onInput={(e: Event) => handleOverrideChange('worldRepeat', parseInt((e.target as HTMLInputElement).value, 10))}
                  className="windrose-tile-config-slider"
                />
                <span className="windrose-tile-config-value">{worldRepeat} {worldRepeat === 1 ? 'cell' : 'cells'}</span>
              </div>
            )}
            {isGrid && renderMode === 'region' && (
              <div className="windrose-tile-config-row">
                <label>Edge feather</label>
                <input
                  type="range"
                  min="0"
                  max="0.6"
                  step="0.05"
                  value={edgeFeather}
                  onInput={(e: Event) => handleOverrideChange('edgeFeather', parseFloat((e.target as HTMLInputElement).value))}
                  className="windrose-tile-config-slider"
                />
                <span className="windrose-tile-config-value">{edgeFeather === 0 ? 'Hard' : `${(edgeFeather * 100).toFixed(0)}%`}</span>
              </div>
            )}
            <div className="windrose-tile-config-row">
              <label>Fit Mode</label>
              <select
                value={fitMode ?? 'auto'}
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
            <div className="windrose-tile-config-row">
              <label>Px / cell</label>
              <input
                type="number"
                min="16"
                max="2048"
                step="1"
                value={pixelsPerCell}
                onChange={(e: Event) => {
                  const raw = parseInt((e.target as HTMLInputElement).value, 10);
                  const v = Number.isFinite(raw) && raw > 0 ? raw : undefined;
                  handlePixelsPerCellChange(v === DEFAULT_PIXELS_PER_CELL ? undefined : v);
                }}
                className="windrose-tile-config-select"
              />
              <span className="windrose-tile-config-value">footprint scale</span>
            </div>
          </div>
        );
      })()}

      {/* Filter / breadcrumb */}
      {compact && openCat != null ? (
        <div className="windrose-tb-breadcrumb">
          <button className="windrose-tb-iconbtn" style={{ width: 22, height: 22 }} onClick={() => setOpenCat(null)}>
            <Icon icon="lucide-arrow-left" size={12} />
          </button>
          <div className="windrose-tb-crumb-path">
            {isGrid ? depthMeta(tileDepth).label : 'Tiles'}
            <Icon icon="lucide-chevron-right" size={9} />
            <b>{openCat}</b>
          </div>
        </div>
      ) : (
        <div className="windrose-tb-filter">
          <div className="windrose-tb-search">
            <Icon icon="lucide-search" size={14} />
            <input
              placeholder={compact ? `Search ${depthLabel}…` : `Filter ${depthLabel}…`}
              value={searchFilter}
              onInput={(e: Event) => setSearchFilter((e.target as HTMLInputElement).value)}
            />
          </div>
        </div>
      )}

      {/* Tag chips — full mode only */}
      {!compact && availableTags.length > 0 && (
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

      {/* Pack chips — full mode only, when more than one pack is present */}
      {!compact && availablePacks.length > 1 && (
        <div className="windrose-tb-chips windrose-tb-packs">
          <HScroll className="windrose-tb-chips-scroll">
            {availablePacks.map(p => (
              <button
                key={p.id}
                className={`windrose-tb-chip ${packFilter.has(p.id) ? 'active' : ''}`}
                onClick={() => togglePack(p.id)}
              >
                {p.name}
                {packFilter.has(p.id) && (
                  <span className="x"><Icon icon="lucide-x" size={10} /></span>
                )}
              </button>
            ))}
          </HScroll>
        </div>
      )}

      {/* Body: rail + grid */}
      {!compact && openCategoryMerge != null && (
        <div className="windrose-tb-merge-banner">
          <span className="windrose-tb-merge-text">
            Merged from {openCategoryMerge.folders} folders
            {openCategoryMerge.packs > 1 && <> across {openCategoryMerge.packs} packs</>}
          </span>
          <button
            type="button"
            className="windrose-tb-merge-adjust"
            onClick={() => setOrganize(true)}
          >
            Adjust
          </button>
        </div>
      )}
      <div className="windrose-tb-body">
        {showRail && !compact && (
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

        <div className="windrose-tb-grid-wrap" ref={gridWrapRef}>
          {compact ? (
            openCat != null ? (
              // Compact leaf grid — drilled into a category
              <>
                <div className="windrose-tb-leaf-grid">
                  {(groupedTiles.get(openCat) ?? []).map((tile: TileEntry) => {
                    const tsId = tileToTilesetId.get(tile.vaultPath) ?? '';
                    const isSelected = selectedTilesetId === tsId && selectedTileId === tile.id;
                    return (
                      <div
                        key={tile.vaultPath}
                        className={`windrose-tile-thumb ${isSelected ? 'sel' : ''}`}
                        onClick={() => handleTileClick(tsId, tile.id)}
                        onMouseEnter={() => setHoveredTile(tile)}
                        onMouseLeave={() => setHoveredTile(null)}
                        title={tile.filename}
                      >
                        <TileThumbnail url={getThumbUrl(tile.vaultPath)} />
                        <span className="tname">{tile.filename}</span>
                      </div>
                    );
                  })}
                </div>
                {(groupedTiles.get(openCat) ?? []).length === 0 && (
                  <div className="windrose-tb-empty">No tiles in this category</div>
                )}
              </>
            ) : (
              // Compact category cards view
              <>
                <div className="windrose-tb-cards">
                  {Array.from(groupedTiles.entries()).map(([cat, tiles]) => (
                    <MosaicCard
                      key={cat}
                      category={cat}
                      tiles={tiles}
                      count={tiles.length}
                      getThumbUrl={getThumbUrl}
                      onClick={() => { setOpenCat(cat); setSearchFilter(''); }}
                    />
                  ))}
                </div>
                {groupedTiles.size === 0 && (
                  <div className="windrose-tb-empty">
                    {searchFilter !== '' ? 'No matching tiles' : 'No tiles loaded'}
                  </div>
                )}
              </>
            )
          ) : (
            // Full mode — virtualized grid
            <div style={{ height: fullVirtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
              {fullVirtualizer.getVirtualItems().map(virtualRow => {
                const row = fullRows[virtualRow.index];
                if (row == null) return null;
                return (
                  <div
                    key={virtualRow.key}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    {row.type === 'recentHeader' && (
                      <div className="windrose-tb-seclabel" style={{ cursor: 'default' }}>
                        <Icon icon="lucide-clock" size={11} /> Recently used
                      </div>
                    )}
                    {row.type === 'catHeader' && (
                      <button
                        className="windrose-tb-seclabel"
                        onClick={() => handleToggleCategory(row.category)}
                        title={row.category}
                      >
                        <Icon
                          icon={row.collapsed ? 'lucide-chevron-right' : 'lucide-chevron-down'}
                          size={10}
                        />
                        <span className="catname">{displayCategory(row.category)}</span>
                        <span className="count">{row.count}</span>
                      </button>
                    )}
                    {row.type === 'tileRow' && (
                      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${fullColCount}, 1fr)`, gap: gridGap }}>
                        {row.tiles.map((tile: TileEntry) => {
                          const tsId = tileToTilesetId.get(tile.vaultPath) ?? '';
                          const isSelected = selectedTilesetId === tsId && selectedTileId === tile.id;
                          return (
                            <div
                              key={tile.vaultPath}
                              className={`windrose-tile-thumb ${isSelected ? 'sel' : ''}`}
                              onClick={() => handleTileClick(tsId, tile.id)}
                              onMouseEnter={() => setHoveredTile(tile)}
                              onMouseLeave={() => setHoveredTile(null)}
                              title={tile.filename}
                            >
                              <TileThumbnail url={getThumbUrl(tile.vaultPath)} />
                              <span className="tname">{tile.filename}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {row.type === 'empty' && (
                      <div className="windrose-tb-empty">{row.message}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Loaded-brush footer */}
      {selectedTile != null && (compact ? (
        <div className="windrose-tb-footer">
          <div className="windrose-tb-brushbar windrose-tb-brushbar-compact">
            <div className="chip-tile compact">
              <LoadedChipThumb url={getThumbUrl(selectedTile.vaultPath)} />
            </div>
            <button className="windrose-tb-iconbtn" title="Rotate" onClick={handleRotateCW}>
              <Icon icon="lucide-rotate-cw" size={12} />
            </button>
            <button
              className={`windrose-tb-iconbtn ${stampMode ? 'active' : ''}`}
              onClick={() => onStampModeChange(!stampMode)}
              title={stampMode ? 'Stamp: ON' : 'Stamp: OFF'}
            >
              <Icon icon="lucide-stamp" size={12} />
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
              style={{ flex: 1, minWidth: 0 }}
            />
            <button
              className="windrose-tb-iconbtn ghost"
              title="Clear brush"
              onClick={onTileDeselect}
              style={{ width: 22, height: 22 }}
            >
              <Icon icon="lucide-x" size={12} />
            </button>
          </div>
        </div>
      ) : (
        <div className="windrose-tb-footer">
          <div className="windrose-tb-loaded">
            <div className="chip-tile">
              <LoadedChipThumb url={getThumbUrl(selectedTile.vaultPath)} />
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
      ))}

      </>)}
    </div>
  );
});

export { TileAssetBrowser };

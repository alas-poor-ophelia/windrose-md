/**
 * TileAssetBrowser.tsx
 *
 * Full drawer content for the tile browser panel.
 * Structure: header → depth band → filter → tag chips →
 * body (jump rail + tile grid) → loaded-brush footer.
 */

import type { TilesetDef, TileEntry, TileForm, TilesetOverrides, TileLayerRole, TileMetadataStore, TilesetOrigin } from '#types/tiles/tile.types';
import type { ToolId } from '#types/tools/tool.types';
import type { WallToolSurface } from '#types/core/wallpath.types';
import type { FlyoutTile } from './DrawerDock';
import type { VNode, ComponentChildren } from 'preact';

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { memo } from 'preact/compat';
import { useApp } from '../../context/AppContext';
import { useThumbnailPipeline } from '../../hooks/state/useThumbnailPipeline';
import { usePreactVirtualizer } from '../../hooks/state/useVirtualizer';
import { Icon } from '../shared/Icon';
import { DrawerPaneHead, DrawerSearch } from './drawerChrome';
import { DepthBar, depthMeta } from './DepthBar';
import {
  loadTileMetadata,
  saveTileMetadataDebounced,
  setTileMetadataForRender,
  bulkSetDepthAffinity,
  bulkSetDetectionSignals,
  isStarred,
  collectUniqueTags,
  collectDepthAwareTags,
  getAllTags,
} from '../../persistence/tileMetadata';
import { predictDepthTier } from '../../assets/depthPredictor';
import { deriveTileForm, formDef } from '../../assets/tileForm';
import type { TileSubtoolId } from '../../assets/tileForm';
import { clusterCategories, NOISE, humanizePackName, detectTileGeometry } from '../../assets/categoryMerge';
import { useFeatureFlags } from '../../hooks/state/useFeatureFlags';
import type { FolderInput } from '../../assets/categoryMerge';
import { runDetectionScan } from '../../assets/tileImageScan';
import { drawTileToCanvas, loadVaultImage, observeWidth, TileThumbnail, PREVIEW_SIZE } from './tileBrowserCommon';
import { TileOrganizePane } from './TileOrganizePane';
import { TileFilterScreen } from './TileFilterScreen';
import type { FilterFacet } from './TileFilterScreen';
import { TilesetConfigPanel } from './TilesetConfigPanel';

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
  /** Armed placement subtool (ribbon state; the footer stamp button mirrors it). */
  activeSubtool: TileSubtoolId | null;
  onSubtoolChange: (id: TileSubtoolId) => void;
  tileScale: number;
  onTileScaleChange: (scale: number) => void;
  /** Soft-brush size in cells of diameter; footer shows size/softness sliders
   *  when the 'brush' subtool is armed (controls hidden when unwired). */
  brushSize?: number;
  onBrushSizeChange?: (size: number) => void;
  /** Soft-brush edge softness as a fraction of one cell (0 = hard). */
  brushSoftness?: number;
  onBrushSoftnessChange?: (softness: number) => void;
  /** Edge blend for region paint/fill — captured onto each placement at paint
   *  time (never rewrites tile metadata or already-painted cells). */
  paintEdgeBlend?: boolean;
  onPaintEdgeBlendChange?: (on: boolean) => void;
  /** Wall-tool control surface (published by WallLayer). When present the footer
   *  renders the wall tool's draw/edit controls as an extra row alongside the
   *  standard transform controls. */
  wallSurface?: WallToolSurface | null;
  getCachedImage?: (path: string) => HTMLImageElement | null;
  tilesetOverrides?: Record<string, TilesetOverrides>;
  onTilesetOverrideChange?: (tilesetId: string, overrides: TilesetOverrides) => void;
  showRail?: boolean;
  compact?: boolean;
  /** Suppress the internal header — block mode hoists a shared compact header
      (segmented Tiles/Objects + view toggle) above both panes instead. */
  hideHeader?: boolean;
  /** False while the hosting drawer is collapsed — suspends thumbnail generation for the hidden grid. */
  active?: boolean;
  recentTiles?: Array<{ tilesetId: string; tileId: string }>;
  onStarredChange?: (tiles: FlyoutTile[]) => void;
  /** Reports the selected tile's derived render-form (for the drawer subtool ribbon). */
  onSelectedFormChange?: (form: TileForm | null) => void;
  /**
   * Category-rail / view selection. When provided (with onRailSelChange) the
   * component is controlled by the host so the Recent/Starred view-filters can
   * live on the drawer ribbon; omitted = uncontrolled (internal state).
   */
  railSel?: RailSelection;
  onRailSelChange?: (sel: RailSelection) => void;
  /**
   * Grid vs list tile view. When provided (with onViewModeChange) the host owns
   * it so the choice survives the Objects-pane swap and persists per map;
   * omitted = uncontrolled (internal state).
   */
  viewMode?: TileViewMode;
  onViewModeChange?: (mode: TileViewMode) => void;
  /**
   * The vertical drawer ribbon (Tiles/Objects + subtools), rendered by the host.
   * Placed as the left column INSIDE the body so the header/depth/filter/chip rows
   * span the panel's full width above it (per the design handoff's `.fd-body`).
   */
  ribbon?: VNode;
}

export type TileViewMode = 'grid' | 'list';

// `string & {}` keeps the literal autocomplete hints while still allowing any
// dynamic tileset id (set via setRailSel(cat)) without collapsing to bare string.
export type RailSelection = 'all' | 'recent' | 'starred' | (string & {});

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
  activeSubtool,
  onSubtoolChange,
  tileScale,
  onTileScaleChange,
  brushSize,
  onBrushSizeChange,
  brushSoftness,
  onBrushSoftnessChange,
  paintEdgeBlend,
  onPaintEdgeBlendChange,
  wallSurface,
  getCachedImage,
  tilesetOverrides,
  onTilesetOverrideChange,
  showRail = false,
  compact = false,
  hideHeader = false,
  active = true,
  recentTiles,
  onStarredChange,
  onSelectedFormChange,
  railSel: railSelProp,
  onRailSelChange,
  viewMode: viewModeProp,
  onViewModeChange,
  ribbon,
}: TileAssetBrowserProps): VNode | null => {
  const app = useApp();
  const featureFlags = useFeatureFlags();
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [showTilesetConfig, setShowTilesetConfig] = useState<boolean>(false);
  const [hoveredTile, setHoveredTile] = useState<TileEntry | null>(null);
  // Controlled/uncontrolled hybrid: when the host supplies railSel + onRailSelChange
  // (so Recent/Starred can live on the drawer ribbon) we defer to it; otherwise we
  // own the selection locally. Every railSel/setRailSel call site is identical either way.
  const [railSelLocal, setRailSelLocal] = useState<RailSelection>('all');
  const railSel = railSelProp ?? railSelLocal;
  const setRailSel = onRailSelChange ?? setRailSelLocal;
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [packFilter, setPackFilter] = useState<Set<string>>(new Set());
  const [openCat, setOpenCat] = useState<string | null>(null);
  // Power-user Filter drill-down screen: null = closed, 'types' = top level, else a facet id ('tags' | 'packs').
  const [filterView, setFilterView] = useState<string | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const previewLabelRef = useRef<HTMLDivElement | null>(null);
  const browserRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement | null>(null);
  const [organize, setOrganize] = useState(false);
  // Controlled/uncontrolled hybrid (mirrors railSel): host-owned when supplied,
  // so the grid/list choice survives the Objects swap and persists per map.
  const [viewModeLocal, setViewModeLocal] = useState<TileViewMode>('grid');
  const viewMode = viewModeProp ?? viewModeLocal;
  const setViewMode = onViewModeChange ?? setViewModeLocal;
  const [tileMetadata, setTileMetadata] = useState<TileMetadataStore>({});
  const { getThumbUrl, requestThumbs } = useThumbnailPipeline();
  const gridWrapRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Reset rail, tags, and drill-down when depth changes
  useEffect(() => {
    setRailSel('all');
    setActiveTags(new Set());
    setPackFilter(new Set());
    setOpenCat(null);
    setFilterView(null);
  }, [tileDepth, setRailSel]);

  const handleTileClick = (tilesetId: string, tileId: string): void => {
    if (selectedTilesetId === tilesetId && selectedTileId === tileId) {
      onTileDeselect();
    } else {
      onTileSelect(tilesetId, tileId);
      // Wall/path strips arm the wall tool (WallLayer reads the same tile
      // selection); everything else arms tile placement. Portals derive as
      // stamps, not strips, so they route to tilePaint like other tiles.
      const src = tileMetadata[
        tilesets.find(t => t.id === tilesetId)?.tiles.find(t => t.id === tileId)?.vaultPath ?? ''
      ]?.ddSourceType?.toLowerCase();
      onToolChange(src === 'walls' || src === 'paths' ? 'wall' : 'tilePaint');
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
        portalRef.current.classList.remove('windrose-tile-preview-portal-visible');
      }
      return undefined;
    }

    if (!portalRef.current) {
      const div = activeWindow.createDiv();
      div.className = 'windrose-tile-preview-portal';
      const canvas = activeWindow.createEl('canvas');
      canvas.width = PREVIEW_SIZE;
      canvas.height = PREVIEW_SIZE;
      canvas.classList.add('windrose-tile-preview-canvas');
      const label = activeWindow.createDiv();
      label.className = 'windrose-tile-preview-label';
      div.appendChild(canvas);
      div.appendChild(label);
      activeDocument.body.appendChild(div);
      portalRef.current = div;
      previewRef.current = canvas;
      previewLabelRef.current = label;
    }

    const portal = portalRef.current;
    const canvas = previewRef.current;
    const label = previewLabelRef.current;
    if (canvas == null || label == null) return undefined;

    if (browserRef.current) {
      const rect = browserRef.current.getBoundingClientRect();
      portal.classList.add('windrose-tile-preview-portal-visible');
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
      drawTileToCanvas(canvas, img, PREVIEW_SIZE, hoveredTile.vaultPath);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- app stable, getCachedImage low-churn; tileToTilesetId is a memo declared later (forward ref); exact-field hover effect
  }, [hoveredTile, rotation, flipH, selectedTilesetId, selectedTileId]);

  // Cleanup portal on unmount
  useEffect(() => {
    return () => {
      if (portalRef.current) {
        activeDocument.body.removeChild(portalRef.current);
        portalRef.current = null;
        previewLabelRef.current = null;
      }
    };
  }, []);

  // Callback refs (not a mount effect): the first render after a map switch is
  // often the no-tilesets empty state while the tileset scan is still in
  // flight, so the wrapper node doesn't exist yet — a mount-time observer
  // would find null and never retry, leaving containerWidth stuck at 0 and the
  // grid permanently empty. Attaching per-node catches whenever it appears.
  const gridRoRef = useRef<ResizeObserver | null>(null);
  const attachGridWrap = useCallback((node: HTMLDivElement | null): void => {
    observeWidth(gridWrapRef, gridRoRef, setContainerWidth, node);
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

  const togglePack = (id: string): void => {
    setPackFilter(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ---- Tile metadata ----

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

  // Merge all tileset tiles into a single pool. Wall/path strips are browsable
  // (selecting one arms the wall tool); their `_end` caps stay hidden — caps
  // are referenced indirectly via the strip's wallEndCapPath metadata.
  const allTiles = useMemo(() => {
    const tiles: TileEntry[] = [];
    for (const ts of tilesets) {
      for (const t of ts.tiles) {
        const e = tileMetadata[t.vaultPath];
        if (e?.isWallEndCap === true) continue;
        tiles.push(t);
      }
    }
    return tiles;
  }, [tilesets, tileMetadata]);

  // Map vaultPath → tilesetId for click handlers
  const tileToTilesetId = useMemo(() => {
    const map = new Map<string, string>();
    for (const ts of tilesets) {
      for (const t of ts.tiles) map.set(t.vaultPath, ts.id);
    }
    return map;
  }, [tilesets]);

  const exitOrganize = useCallback((): void => {
    setOrganize(false);
  }, []);

  // Collect available tags for the filter chips, then drop folder/pack noise.
  // A tag is junk if it contains a grid/packaging NOISE word (hex/set/pack/… —
  // semantic tags never do, only folder & pack names) or matches a pack/dev-id
  // pattern (e.g. "FCWallsDev1": no spaces, mixes letters + digits). Clean tags
  // like "walls"/"wooden" survive. Search still matches every tag (getAllTags).
  const availableTags = useMemo(() => {
    if (allTiles.length === 0) return [];
    const raw = mapType === 'grid'
      ? collectDepthAwareTags(allTiles, tileMetadata, tileDepth)
      : collectUniqueTags(allTiles, tileMetadata);
    return raw.filter(tag => {
      if (!/\s/.test(tag) && /[a-z]/i.test(tag) && /\d/.test(tag)) return false;
      for (const piece of tag.toLowerCase().split(/[/_\-\s&,()]+/)) {
        const tok = piece.replace(/[^a-z]/g, '');
        if (tok !== '' && NOISE.has(tok)) return false;
      }
      return true;
    });
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

    // Role filter: on grid maps the depth selector scopes the rail to the active
    // role. A classified tile shows under its role; an unclassified tile (no
    // depthAffinity yet) is treated as 'ground' — the base role per
    // DEFAULT_TILE_LAYERS — so the non-ground roles stay clean and untagged
    // tiles land on Terrain rather than bleeding across every role.
    // Read-only use of depthAffinity (no persistence → no RCA risk).
    if (mapType === 'grid') {
      tiles = tiles.filter((t: TileEntry) => {
        const affinity = tileMetadata[t.vaultPath]?.depthAffinity ?? 'ground';
        return affinity === tileDepth;
      });
    }

    // Silent geometry scope: hide a tile only when its own folder/tags EXPLICITLY
    // declare the other geometry (a "Hex Forest" terrain on a grid map). Tiles with
    // no geometry signal are agnostic and show everywhere. Read-only derivation — no
    // metadata write, so it never touches placed-tile rendering. Backs the Filter
    // panel's "auto · {mapType} map" note row.
    tiles = tiles.filter((t: TileEntry) => {
      const geom = detectTileGeometry(t.category ?? '', getAllTags(t, tileMetadata));
      return geom == null || geom === mapType;
    });

    // Feature gate: wall/path strips arm the wall tool on select, so hide them
    // entirely when the walls feature is disabled (placed walls still render).
    if (!featureFlags.walls) {
      tiles = tiles.filter((t: TileEntry) => {
        const src = tileMetadata[t.vaultPath]?.ddSourceType?.toLowerCase();
        return src !== 'walls' && src !== 'paths';
      });
    }

    return tiles;
  }, [allTiles, searchFilter, activeTags, packFilter, tileToTilesetId, tileMetadata, tileDepth, mapType, featureFlags.walls]);

  // Packs present in the current role, for the Pack filter facet — with a
  // humanized short label and a per-pack count, scoped to the active depth on
  // grid maps (mirrors filteredTiles' role filter) so chips match the spec's
  // `packsHere`. Count ignores search/tag/pack filters so it stays stable.
  const availablePacks = useMemo((): Array<{ id: string; name: string; short: string; count: number; origin: TilesetOrigin }> => {
    const counts = new Map<string, number>();
    for (const tile of allTiles) {
      if (mapType === 'grid') {
        const affinity = tileMetadata[tile.vaultPath]?.depthAffinity ?? 'ground';
        if (affinity !== tileDepth) continue;
      }
      const id = tileToTilesetId.get(tile.vaultPath);
      if (id == null) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return tilesets
      .filter(ts => counts.has(ts.id))
      .map(ts => ({
        id: ts.id,
        name: ts.name,
        short: humanizePackName(ts.name),
        count: counts.get(ts.id) ?? 0,
        origin: ts.origin ?? 'native',
      }));
  }, [allTiles, tileToTilesetId, tilesets, tileMetadata, tileDepth, mapType]);

  // Cross-pack category merge (Phase 2): collapse messy import-time folders into
  // one canonical category, with cross-pack duplicates merged. Built over ALL tiles
  // so the category set stays stable regardless of search/tag filtering. Keyed by
  // `${pack}|${rawCategory}` so the same folder name in different packs resolves
  // independently. Replaces the old pack-name-prefix disambiguation.
  const mergedCategories = useMemo(() => {
    const seen = new Set<string>();
    const folders: FolderInput[] = [];
    for (const tile of allTiles) {
      // Organize's Move… reassigns the category home read-time; the raw
      // folder-derived category is never rewritten (lossless).
      const raw = tileMetadata[tile.vaultPath]?.categoryOverride ?? tile.category ?? 'Uncategorized';
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
  }, [allTiles, tileToTilesetId, tileMetadata]);

  const groupedTiles = useMemo(() => {
    const groups = new Map<string, TileEntry[]>();
    for (const tile of filteredTiles) {
      const raw = tileMetadata[tile.vaultPath]?.categoryOverride ?? tile.category ?? 'Uncategorized';
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
  }, [filteredTiles, mergedCategories, tileToTilesetId, tileMetadata]);

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

  // The selected tile's derived render-form: reported upward for the drawer
  // subtool ribbon, and used locally by the footer stamp-mirror button.
  const selectedForm = useMemo((): TileForm | null => {
    if (selectedTile == null || selectedTilesetId == null) return null;
    const ts = tilesets.find(t => t.id === selectedTilesetId);
    return deriveTileForm(tileMetadata[selectedTile.vaultPath], ts);
  }, [selectedTile, selectedTilesetId, tilesets, tileMetadata]);

  useEffect(() => {
    onSelectedFormChange?.(selectedForm);
  }, [selectedForm, onSelectedFormChange]);

  // Footer stamp button: mirrors the subtool state for modes with no ribbon
  // (floating/compact) — toggles between 'stamp' and the form's default.
  // Full mode has the ribbon, so its footer no longer shows this mirror.
  const toggleStampSubtool = useCallback(() => {
    onSubtoolChange(
      activeSubtool === 'stamp'
        ? (selectedForm != null ? formDef(selectedForm).defaultSubtool : 'paint')
        : 'stamp'
    );
  }, [activeSubtool, selectedForm, onSubtoolChange]);


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
  const fullColCount = !compact && !organize && containerWidth > 0
    ? Math.max(1, Math.floor((containerWidth + gridGap) / (tileMin + gridGap)))
    : 1;
  const fullCellWidth = fullColCount > 0 && containerWidth > 0
    ? (containerWidth - (fullColCount - 1) * gridGap) / fullColCount
    : tileMin;

  // List view: one tile per row, rendered as a dense [thumb | name | pack] strip.
  const listMode = !compact && !organize && viewMode === 'list';
  const rowSlice = listMode ? 1 : fullColCount;
  const LIST_ROW_H = 44;

  const fullRows = useMemo((): FullModeRow[] => {
    if (compact || organize || containerWidth <= 0) return [];
    const rows: FullModeRow[] = [];

    if (railSel === 'recent' && recentTileEntries.length > 0) {
      rows.push({ type: 'recentHeader' });
      for (let i = 0; i < recentTileEntries.length; i += rowSlice) {
        rows.push({ type: 'tileRow', tiles: recentTileEntries.slice(i, i + rowSlice) });
      }
    }

    if (railSel !== 'recent') {
      for (const [category, tiles] of shownGroups) {
        const collapsed = collapsedCategories.has(category);
        rows.push({ type: 'catHeader', category, count: tiles.length, collapsed });
        if (!collapsed) {
          for (let i = 0; i < tiles.length; i += rowSlice) {
            rows.push({ type: 'tileRow', tiles: tiles.slice(i, i + rowSlice) });
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
  }, [compact, organize, containerWidth, railSel, recentTileEntries, shownGroups, collapsedCategories, filteredTiles.length, searchFilter, rowSlice]);

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
          return listMode ? LIST_ROW_H : fullCellWidth;
      }
    },
    gap: gridGap,
    enabled: !compact && !organize && containerWidth > 0,
    overscan: 5,
  });

  // virtual-core memoizes row measurements on count/enabled but NOT on
  // estimateSize. On initial load the ResizeObserver reports the container width
  // more than once (mid drawer-open animation, then again once settled); each
  // fire updates fullCellWidth but the cached measurements keep the first,
  // wrong height — so category rows render stacked/overlapping until some
  // unrelated re-render busts the cache (the "scroll fixes it" symptom). Force a
  // re-measure whenever a size input changes so positions track the current estimate.
  useEffect(() => {
    fullVirtualizer.measure();
  }, [fullVirtualizer, fullCellWidth, listMode, gridGap]);

  // Request thumbnails only for visible tiles (virtualizer-driven).
  // Organize mode requests its own visible rows (TileOrganizePane).
  const fullRange = fullVirtualizer.range;
  useEffect(() => {
    // A collapsed drawer keeps this component mounted for its fold animation;
    // generating thumbnails for an invisible grid re-decodes + rescans the whole
    // tile library on every parent re-render (i.e. every map interaction).
    if (!active || organize || tilesets.length === 0) return;

    const paths: string[] = [];

    if (!compact) {
      for (const v of fullVirtualizer.getVirtualItems()) {
        const row = fullRows[v.index];
        if (row?.type === 'tileRow') {
          for (const t of row.tiles) paths.push(t.vaultPath);
        }
      }
      // Rail category mosaics: each row shows a 2×2 preview of its first 4 tiles.
      // Those tiles live outside the grid's virtual window, so request them
      // explicitly or the mosaic stays blank until the category is opened (#12).
      if (showRail) {
        for (const group of groupedTiles.values()) {
          const n = Math.min(4, group.length);
          for (let i = 0; i < n; i++) paths.push(group[i].vaultPath);
        }
      }
    } else {
      // Compact mode: no virtualization, request all filtered tiles
      for (const t of filteredTiles) paths.push(t.vaultPath);
    }

    if (paths.length > 0) requestThumbs(paths);
  }, [active, tilesets, organize, compact, fullRows, fullRange, filteredTiles, requestThumbs, fullVirtualizer, showRail, groupedTiles]);

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

  // Unified facet model — the quick chips AND the dedicated Filter screen share one filter state.
  const activeFilterCount = activeTags.size + packFilter.size;
  const filterTypes: FilterFacet[] = [
    { id: 'tags', label: 'Tags', icon: 'lucide-tag', values: availableTags,
      has: (v: string): boolean => activeTags.has(v), toggle: toggleTag, size: activeTags.size },
    { id: 'packs', label: 'Packs', icon: 'lucide-folder-input', values: availablePacks.map(p => p.id),
      labelFor: (id: string): string => availablePacks.find(p => p.id === id)?.short ?? id,
      has: (v: string): boolean => packFilter.has(v), toggle: togglePack, size: packFilter.size },
  ];
  const clearAllFilters = (): void => { setActiveTags(new Set()); setPackFilter(new Set()); };

  // Wall-tool footer controls (relocated from the old floating bar). Rendered in
  // the loaded-brush footer whenever the wall tool publishes a control surface.
  const renderWallBar = (surface: WallToolSurface): VNode => {
    if (!surface.hasAsset) {
      return <span className="windrose-tb-cap">Pick a wall or path strip</span>;
    }
    if (surface.mode === 'edit' && surface.edit != null) {
      const edit = surface.edit;
      return (
        <>
          <span className="windrose-tb-cap" style={{ minWidth: 34 }}>{edit.vertexCount} pts</span>
          <span className="label">Width</span>
          <input
            className="windrose-tb-range"
            type="range"
            min="0.25"
            max="3"
            step="0.25"
            value={edit.widthScale}
            onInput={(e: Event) => edit.setWidth(parseFloat((e.target as HTMLInputElement).value))}
            style={{ flex: 1, minWidth: 40 }}
          />
          <span className="windrose-tb-cap" style={{ minWidth: 24, textAlign: 'right' }}>{edit.widthScale}×</span>
          <button
            className={`windrose-tb-iconbtn ${edit.flip ? 'active' : ''}`}
            title="Flip texture direction"
            onClick={edit.toggleFlip}
          >
            <Icon icon="lucide-flip-vertical" size={14} />
          </button>
          <button className="windrose-tb-iconbtn" title="Delete wall (Delete)" onClick={edit.deleteWall}>
            <Icon icon="lucide-trash-2" size={14} />
          </button>
          <button className="windrose-tb-iconbtn" title="Deselect (Escape)" onClick={edit.deselect}>
            <Icon icon="lucide-x" size={14} />
          </button>
        </>
      );
    }
    // Draw mode (also covers idle-with-asset: the action buttons disable until drawing).
    return (
      <>
        <span className="windrose-tb-cap" style={{ minWidth: 34 }}>{surface.vertexCount} pts</span>
        <button
          className={`windrose-tb-iconbtn ${surface.snapEnabled ? 'active' : ''}`}
          title={surface.snapEnabled ? 'Grid snap: ON' : 'Grid snap: OFF'}
          onClick={surface.toggleSnap}
        >
          <Icon icon="lucide-magnet" size={14} />
        </button>
        <button
          className={`windrose-tb-iconbtn ${surface.angleSnapEnabled ? 'active' : ''}`}
          title={surface.angleSnapEnabled ? '45° angle snap: ON (or hold Alt)' : '45° angle snap: OFF (or hold Alt)'}
          onClick={surface.toggleAngleSnap}
        >
          <Icon icon="lucide-triangle-right" size={14} />
        </button>
        <span className="sep" />
        <button
          className="windrose-tb-iconbtn"
          title="Undo last point (Backspace)"
          disabled={!surface.isDrawing}
          onClick={surface.undoLastPoint}
        >
          <Icon icon="lucide-undo-2" size={14} />
        </button>
        <button
          className="windrose-tb-iconbtn"
          title="Cancel (Escape)"
          disabled={!surface.isDrawing}
          onClick={surface.cancelDrawing}
        >
          <Icon icon="lucide-x" size={14} />
        </button>
        <button
          className="windrose-tb-iconbtn active"
          title="Finish wall (Enter or double-click)"
          disabled={!surface.canFinish}
          onClick={surface.finishWall}
        >
          <Icon icon="lucide-check" size={14} />
        </button>
      </>
    );
  };

  return (
    <div ref={browserRef} className="windrose-tile-browser">
      {organize ? (
        <TileOrganizePane
          tilesets={tilesets}
          allTiles={allTiles}
          tileToTilesetId={tileToTilesetId}
          tileMetadata={tileMetadata}
          setTileMetadata={setTileMetadata}
          mergedCategoryLookup={mergedCategories.lookup}
          getThumbUrl={getThumbUrl}
          requestThumbs={requestThumbs}
          active={active}
          onExit={exitOrganize}
        />
      ) : (<>

      {/* Header — shared with the objects pane via DrawerPaneHead */}
      {!hideHeader && (
        <DrawerPaneHead
          title="Tiles"
          viewMode={compact ? undefined : viewMode}
          onViewModeChange={compact ? undefined : setViewMode}
          actions={
            <>
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
                  <Icon icon="lucide-panel-left-open" size={15} />
                </button>
              )}
            </>
          }
        />
      )}

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
      {showTilesetConfig && tilesets.length > 0 && onTilesetOverrideChange != null && (
        <TilesetConfigPanel
          tilesets={tilesets}
          selectedTilesetId={selectedTilesetId}
          tilesetOverrides={tilesetOverrides}
          onTilesetOverrideChange={onTilesetOverrideChange}
          isGrid={isGrid}
          setTileMetadata={setTileMetadata}
        />
      )}

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
          <DrawerSearch
            value={searchFilter}
            placeholder={compact ? `Search ${depthLabel}…` : `Filter ${depthLabel}…`}
            onInput={setSearchFilter}
          />
          <button
            className={`windrose-tb-filtbtn ${compact ? 'icon' : ''} ${activeFilterCount > 0 ? 'on' : ''}`}
            title="All filters"
            onClick={() => { setFilterView('types'); }}
          >
            <Icon icon="lucide-filter" size={13} />
            {!compact && 'Filter'}
            {activeFilterCount > 0 && <span className="fc">{activeFilterCount}</span>}
          </button>
        </div>
      )}

      {/* Tag chips — full mode only; curated to the first 8 (full set via Filter) */}
      {!compact && availableTags.length > 0 && (
        <div className="windrose-tb-chips">
          <HScroll className="windrose-tb-chips-scroll">
            {availableTags.slice(0, 8).map(t => (
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

      {/* Pack chips — full mode only, when more than one pack is present in the role */}
      {!compact && availablePacks.length > 1 && (
        <div className="windrose-tb-packs">
          <span className="windrose-tb-packlbl">
            <Icon icon="lucide-folder-input" size={10} />Packs
          </span>
          {availablePacks.map(p => (
            <button
              key={p.id}
              className={`windrose-tb-packchip ${packFilter.has(p.id) ? 'on' : ''}`}
              onClick={() => togglePack(p.id)}
              title={p.name}
            >
              <span
                className="dot"
                style={{ background: p.origin === 'dungeondraft' ? 'var(--windrose-accent-blue)' : 'var(--windrose-depth-ground)' }}
              />
              {p.short}
              <span className="pc">{p.count}</span>
            </button>
          ))}
          {packFilter.size > 0 && (
            <button className="windrose-tb-packclear" onClick={() => setPackFilter(new Set())}>
              clear
            </button>
          )}
        </div>
      )}

      {/* Dedicated Filter screen (power-user) — drills Tags / Packs, searchable; shares state with the quick chips */}
      {filterView != null && (
        <TileFilterScreen
          view={filterView}
          onViewChange={setFilterView}
          facets={filterTypes}
          activeFilterCount={activeFilterCount}
          onClearAll={clearAllFilters}
          isGrid={isGrid}
          mapType={mapType}
        />
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
        {ribbon}
        {showRail && !compact && (
          <div className="windrose-tb-rail">
            {/* Recent/Starred view-filters live on the drawer ribbon (see renderDrawerRibbon); the rail is categories only. */}
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
              <Icon icon="lucide-layout-dashboard" size={14} />
              All
              <span className="c">{filteredTiles.length}</span>
            </button>
            {Array.from(groupedTiles.entries()).map(([cat, tiles]) => (
              <button
                key={cat}
                className={`windrose-tb-railbtn windrose-tb-railbtn-cat ${railSel === cat ? 'on' : ''}`}
                onClick={() => setRailSel(cat)}
                title={cat}
              >
                <span className="windrose-tb-railmosaic">
                  {[0, 1, 2, 3].map(i => (
                    <span key={i} className="windrose-tb-mosaic-cell">
                      {tiles[i] != null && <TileThumbnail url={getThumbUrl(tiles[i].vaultPath)} />}
                    </span>
                  ))}
                </span>
                <span className="windrose-tb-railname">{cat}</span>
                <span className="c">{tiles.length}</span>
              </button>
            ))}
          </div>
        )}

        <div className="windrose-tb-grid-wrap" ref={attachGridWrap}>
          {compact ? (
            openCat != null ? (
              // Compact leaf — drilled into a category. Grid or list per viewMode.
              <>
                {viewMode === 'list' ? (
                  <div className="windrose-tb-list">
                    {(groupedTiles.get(openCat) ?? []).map((tile: TileEntry) => {
                      const tsId = tileToTilesetId.get(tile.vaultPath) ?? '';
                      const isSelected = selectedTilesetId === tsId && selectedTileId === tile.id;
                      return (
                        <button
                          key={tile.vaultPath}
                          className={`windrose-tb-listrow ${isSelected ? 'sel' : ''}`}
                          onClick={() => handleTileClick(tsId, tile.id)}
                          onMouseEnter={() => setHoveredTile(tile)}
                          onMouseLeave={() => setHoveredTile(null)}
                          title={tile.filename}
                        >
                          <span className="lthumb">
                            <TileThumbnail url={getThumbUrl(tile.vaultPath)} />
                          </span>
                          <span className="lname">{tile.filename}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
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
                )}
                {(groupedTiles.get(openCat) ?? []).length === 0 && (
                  <div className="windrose-tb-empty">No tiles in this category</div>
                )}
              </>
            ) : viewMode === 'list' ? (
              // Compact top-level list — every tile as a row, under category headers.
              // (The card view drills into one category; list view flattens them all.)
              <>
                <div className="windrose-tb-list">
                  {Array.from(groupedTiles.entries()).flatMap(([cat, tiles]) => [
                    <div key={`h-${cat}`} className="windrose-tb-seclabel" style={{ cursor: 'default' }}>
                      <span className="catname">{displayCategory(cat)}</span>
                      <span className="count">{tiles.length}</span>
                    </div>,
                    ...tiles.map((tile: TileEntry) => {
                      const tsId = tileToTilesetId.get(tile.vaultPath) ?? '';
                      const isSelected = selectedTilesetId === tsId && selectedTileId === tile.id;
                      return (
                        <button
                          key={tile.vaultPath}
                          className={`windrose-tb-listrow ${isSelected ? 'sel' : ''}`}
                          onClick={() => handleTileClick(tsId, tile.id)}
                          onMouseEnter={() => setHoveredTile(tile)}
                          onMouseLeave={() => setHoveredTile(null)}
                          title={tile.filename}
                        >
                          <span className="lthumb">
                            <TileThumbnail url={getThumbUrl(tile.vaultPath)} />
                          </span>
                          <span className="lname">{tile.filename}</span>
                        </button>
                      );
                    }),
                  ])}
                </div>
                {groupedTiles.size === 0 && (
                  <div className="windrose-tb-empty">
                    {searchFilter !== '' ? 'No matching tiles' : 'No tiles loaded'}
                  </div>
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
                    {row.type === 'tileRow' && listMode && (
                      <div className="windrose-tb-list">
                        {row.tiles.map((tile: TileEntry) => {
                          const tsId = tileToTilesetId.get(tile.vaultPath) ?? '';
                          const isSelected = selectedTilesetId === tsId && selectedTileId === tile.id;
                          return (
                            <button
                              key={tile.vaultPath}
                              className={`windrose-tb-listrow ${isSelected ? 'sel' : ''}`}
                              onClick={() => handleTileClick(tsId, tile.id)}
                              onMouseEnter={() => setHoveredTile(tile)}
                              onMouseLeave={() => setHoveredTile(null)}
                              title={tile.filename}
                            >
                              <span className="lthumb">
                                <TileThumbnail url={getThumbUrl(tile.vaultPath)} />
                              </span>
                              <span className="lname">{tile.filename}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {row.type === 'tileRow' && !listMode && (
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
              className={`windrose-tb-iconbtn ${activeSubtool === 'stamp' ? 'active' : ''}`}
              onClick={toggleStampSubtool}
              title={activeSubtool === 'stamp' ? 'Stamp: ON' : 'Stamp: OFF'}
            >
              <Icon icon="lucide-stamp" size={12} />
            </button>
            <span className="sep" />
            {activeSubtool === 'brush' && onBrushSizeChange != null ? (
              <>
                <span className="label">Size</span>
                <input
                  className="windrose-tb-range"
                  type="range"
                  min="0.5"
                  max="8"
                  step="0.5"
                  value={brushSize ?? 1}
                  onInput={(e: Event) => onBrushSizeChange(parseFloat((e.target as HTMLInputElement).value))}
                  style={{ flex: 1, minWidth: 0 }}
                />
              </>
            ) : (
              <>
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
              </>
            )}
            <button
              className="windrose-tb-iconbtn ghost"
              title="Clear brush"
              onClick={onTileDeselect}
              style={{ width: 22, height: 22 }}
            >
              <Icon icon="lucide-x" size={12} />
            </button>
          </div>
          {/* Wall tool row: joins (not replaces) the transform row so every
              control lives in the footer. */}
          {wallSurface != null && (
            <div className="windrose-tb-brushbar windrose-tb-brushbar-compact">
              {renderWallBar(wallSurface)}
            </div>
          )}
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
          {/* Brushbar: context-sensitive per armed subtool. Brush swaps the
              transform controls for size/softness; the ribbon owns subtool
              selection in full mode, so no stamp mirror here. */}
          <div className="windrose-tb-brushbar">
            {activeSubtool === 'brush' && onBrushSizeChange != null ? (
              <>
                <span className="label">Size</span>
                <input
                  className="windrose-tb-range"
                  type="range"
                  min="0.5"
                  max="8"
                  step="0.5"
                  value={brushSize ?? 1}
                  onInput={(e: Event) => onBrushSizeChange(parseFloat((e.target as HTMLInputElement).value))}
                  style={{ flex: 1, minWidth: 40 }}
                />
                <span className="windrose-tb-cap" style={{ minWidth: 30, textAlign: 'right' }}>{brushSize ?? 1}c</span>
                <span className="sep" />
                <span className="label">Soft</span>
                <input
                  className="windrose-tb-range"
                  type="range"
                  min="0"
                  max="1.5"
                  step="0.05"
                  value={brushSoftness ?? 0.5}
                  onInput={(e: Event) => onBrushSoftnessChange?.(parseFloat((e.target as HTMLInputElement).value))}
                  style={{ flex: 1, minWidth: 40 }}
                />
                <span className="windrose-tb-cap" style={{ minWidth: 26, textAlign: 'right' }}>
                  {Math.round((brushSoftness ?? 0.5) * 100)}
                </span>
              </>
            ) : (
              <>
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
                {selectedForm === 'region' && onPaintEdgeBlendChange != null && (
                  <button
                    className={`windrose-tb-iconbtn ${paintEdgeBlend === true ? 'active' : ''}`}
                    onClick={() => onPaintEdgeBlendChange(paintEdgeBlend !== true)}
                    title={paintEdgeBlend === true ? 'Edge blend: ON — new cells paint with soft edges' : 'Edge blend: OFF — new cells paint with hard edges'}
                  >
                    <Icon icon="lucide-droplet" size={14} />
                  </button>
                )}
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
              </>
            )}
          </div>
          {/* Wall tool row: joins (not replaces) the transform brushbar so
              every control lives in the footer. */}
          {wallSurface != null && (
            <div className="windrose-tb-brushbar">
              {renderWallBar(wallSurface)}
            </div>
          )}
        </div>
      ))}

      </>)}
    </div>
  );
});

export { TileAssetBrowser };

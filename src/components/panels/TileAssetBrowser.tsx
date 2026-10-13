/**
 * TileAssetBrowser.tsx
 *
 * Full drawer content for the tile browser panel.
 * Structure: header → depth band → filter → tag chips →
 * body (jump rail + tile grid) → loaded-brush footer.
 *
 * Split (STRUCT-A-14): the filter pipeline lives in hooks/tiles/useTileFilterPipeline,
 * per-tile cells in TileCell.tsx, the footer + wall-tool row in TileBrowserFooter.tsx.
 * Tile metadata is read ONLY through the shared store (useTileMetadata) and written
 * only through updateTileMetadata — never a private copy (the 2026-07-30 wipe).
 */

import type { TilesetDef, TileEntry, TileForm, TilesetOverrides, TileLayerRole } from '#types/tiles/tile.types';
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
  ensureTileMetadataLoaded,
  updateTileMetadata,
  bulkSetDepthAffinity,
  bulkSetDetectionSignals,
  isStarred,
} from '../../persistence/tileMetadata';
import { predictDepthTier } from '../../assets/depthPredictor';
import { deriveTileForm, formDef } from '../../assets/tileForm';
import type { TileSubtoolId } from '#types/tiles/tile.types';
import { useFeatureFlags } from '../../hooks/state/useFeatureFlags';
import { runDetectionScan, claimDetectionScanPaths, releaseDetectionScanPaths } from '../../assets/tileImageScan';
import { useTileMetadata } from '../../hooks/state/useTileMetadata';
import { resolveTileEntry } from '../../assets/tilesetOperations';
import { drawTileToCanvas, loadVaultImage, observeWidth, TileThumbnail, PREVIEW_SIZE } from './tileBrowserCommon';
import { TileCell, TileListRow, MosaicCard } from './TileCell';
import { LoadedBrushFooter } from './TileBrowserFooter';
import { useTileFilterPipeline } from '../../hooks/tiles/useTileFilterPipeline';
import { TileOrganizePane } from './TileOrganizePane';
import { TileFilterScreen } from './TileFilterScreen';
import type { FilterFacet } from './TileFilterScreen';
import { TilesetConfigPanel } from './TilesetConfigPanel';
import { tooltipRef } from '../shared/obsidianTooltip';
import { assertNever } from '../../utils/assertNever';

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
  /** Global per-tileset art nudge (world px, positive raises); undefined clears. */
  onTilesetArtOffsetChange?: (tilesetId: string, value: number | undefined) => void;
  /** Global per-tileset art scale multiplier (1 = auto); undefined clears. */
  onTilesetArtScaleChange?: (tilesetId: string, value: number | undefined) => void;
  /** Controlled tileset-config visibility: block mode hoists the toggle into
      the compact drawer head (the internal header that carries the button is
      hidden there). Omit both to let the browser own the state. */
  tilesetConfigOpen?: boolean;
  onTilesetConfigOpenChange?: (open: boolean) => void;
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
  onTilesetArtOffsetChange,
  onTilesetArtScaleChange,
  tilesetConfigOpen,
  onTilesetConfigOpenChange,
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
  // Controlled/uncontrolled hybrid (same contract as railSel): block mode
  // hoists the toggle into the compact drawer head, full-pane keeps it local.
  const [localTilesetConfig, setLocalTilesetConfig] = useState<boolean>(false);
  const showTilesetConfig = tilesetConfigOpen ?? localTilesetConfig;
  const setShowTilesetConfig = onTilesetConfigOpenChange ?? setLocalTilesetConfig;
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
  const tileMetadata = useTileMetadata(app);
  const { getThumbUrl, requestThumbs } = useThumbnailPipeline();
  const gridWrapRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Reset rail, tags, and drill-down when depth changes. Skips the first run
  // (and any re-run where depth is unchanged, e.g. a new setRailSel identity):
  // the rail selection is host-owned precisely so it survives the remount
  // caused by the Objects/Tiles pane swap, and a mount-time reset would wipe it.
  const prevDepthRef = useRef(tileDepth);
  useEffect(() => {
    if (prevDepthRef.current === tileDepth) return;
    prevDepthRef.current = tileDepth;
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
        resolveTileEntry(tilesets.find(t => t.id === tilesetId), tileId)?.vaultPath ?? ''
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
  // One shared store (persistence/tileMetadata.ts) across every mount and the
  // renderer; writes go through updateTileMetadata, never a local copy.

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

  // Auto-predict depth affinity for tiles that don't have one yet (deferred to
  // idle). Runs against the LOADED shared store and fills only missing rows
  // inside the mutator, so it can never save a stale or empty copy over the
  // library (the 2026-07-30 wipe).
  const predictionRanRef = useRef(false);
  useEffect(() => {
    if (predictionRanRef.current) return;
    if (tilesets.length === 0) return;

    let cancelled = false;
    const run = (): void => {
      void ensureTileMetadataLoaded(app).then(() => {
        if (cancelled || predictionRanRef.current) return;
        const allTiles = tilesets.flatMap(ts => ts.tiles);
        if (allTiles.length === 0) return;
        predictionRanRef.current = true;
        updateTileMetadata(app, store => {
          const missing: Array<{ vaultPath: string; depth: TileLayerRole }> = [];
          for (const tile of allTiles) {
            const entry = store[tile.vaultPath];
            if (entry?.depthAffinity != null) continue;
            const { tier, confidence } = predictDepthTier(tile, entry);
            if (confidence >= 0.4) missing.push({ vaultPath: tile.vaultPath, depth: tier });
          }
          return missing.length > 0 ? bulkSetDepthAffinity(store, missing) : store;
        });
      });
    };

    const id = typeof requestIdleCallback === 'function'
      ? requestIdleCallback(run)
      : window.setTimeout(run, 200);
    return () => {
      cancelled = true;
      if (typeof cancelIdleCallback === 'function') { cancelIdleCallback(id); } else { window.clearTimeout(id); }
    };
  }, [tilesets, app]);

  // Eager detection scan: caches per-tile alpha coverage + opaque bounds + natural
  // dims (decoupled from thumbnails, which are lazy + LRU-evicted). Signals only —
  // render-mode/footprint predictions are applied at import time, never bulk-persisted
  // for an existing library (2026-06-09: 304 tiles silently flipped to 'region',
  // breaking placed terrain; per-tile metadata outranks the per-tileset setting).
  // Keyed on tilesets only (STRUCT-A-12): a metadata change mid-scan no longer
  // aborts it. Paths are claimed module-wide so several mounts scan each tile once.
  useEffect(() => {
    if (tilesets.length === 0) return;

    const controller = new AbortController();
    let claimed: string[] = [];
    const run = async (): Promise<void> => {
      const store = await ensureTileMetadataLoaded(app);
      if (controller.signal.aborted) return;
      const needsScan = tilesets
        .flatMap(ts => ts.tiles)
        .filter(t => {
          const e = store[t.vaultPath];
          // Re-scan entries missing either signal — older scans cached
          // alphaCoverage/opaque bounds but not the natural dims footprint needs.
          return e?.alphaCoverage == null || e?.srcW == null;
        })
        .map(t => t.vaultPath);
      claimed = claimDetectionScanPaths(needsScan);
      if (claimed.length === 0) return;
      const scanned = await runDetectionScan(app, claimed, { concurrency: 4, signal: controller.signal });
      if (controller.signal.aborted) return;
      claimed = [];
      if (scanned.length === 0) return;
      updateTileMetadata(app, prev => bulkSetDetectionSignals(prev, scanned));
    };

    const id = typeof requestIdleCallback === 'function'
      ? requestIdleCallback(() => void run())
      : window.setTimeout(() => void run(), 400);
    return () => {
      controller.abort();
      releaseDetectionScanPaths(claimed);
      claimed = [];
      if (typeof cancelIdleCallback === 'function') { cancelIdleCallback(id); } else { window.clearTimeout(id); }
    };
  }, [tilesets, app]);

  const exitOrganize = useCallback((): void => {
    setOrganize(false);
  }, []);

  // Search / filter / sort / group pipeline (pure derivation over the shared
  // metadata snapshot; see hooks/tiles/useTileFilterPipeline.ts).
  const {
    allTiles,
    tileToTilesetId,
    availableTags,
    filteredTiles,
    availablePacks,
    mergedCategories,
    groupedTiles,
    openCategoryMerge,
    shownGroups,
  } = useTileFilterPipeline({
    tilesets,
    tileMetadata,
    searchFilter,
    activeTags,
    packFilter,
    tileDepth,
    mapType,
    railSel,
    wallsEnabled: featureFlags.walls,
  });

  // Resolve the selected tile entry for the loaded-brush footer
  const selectedTile = useMemo((): TileEntry | null => {
    if (selectedTileId == null || selectedTilesetId == null) return null;
    const ts = tilesets.find(t => t.id === selectedTilesetId);
    // resolveTileEntry also accepts legacy basename ids (recents / MCP selects);
    // the grid highlights below compare against this resolved entry's id.
    return resolveTileEntry(ts, selectedTileId) ?? null;
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
        return resolveTileEntry(ts, r.tileId);
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
        case 'tileRow':
          return listMode ? LIST_ROW_H : fullCellWidth;
        default:
          return assertNever(row);
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

    // Render the full drawer frame, not just the message. This branch used to
    // return the message alone, which skipped DrawerPaneHead (the collapse
    // button) and the {ribbon} slot (the Tiles/Objects switch) — and because an
    // open drawer hides the spine layer that carries the only other copy of
    // both, a user with no tilesets had no way to collapse the drawer or reach
    // the Objects pane. The frame stays; only the body content differs.
    return (
      <div ref={browserRef} className="windrose-tile-browser windrose-tile-browser-empty-state">
        {!hideHeader && (
          <DrawerPaneHead
            title="Tiles"
            actions={onCollapse && (
              <button className="windrose-tb-iconbtn ghost" ref={tooltipRef('Collapse to edge')} onClick={onCollapse}>
                <Icon icon="lucide-panel-left-open" size={15} />
              </button>
            )}
          />
        )}
        <div className="windrose-tb-body">
          {ribbon}
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

  return (
    <div ref={browserRef} className="windrose-tile-browser">
      {organize ? (
        <TileOrganizePane
          tilesets={tilesets}
          allTiles={allTiles}
          tileToTilesetId={tileToTilesetId}
          tileMetadata={tileMetadata}
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
                  ref={tooltipRef('Tileset settings')}
                  onClick={() => setShowTilesetConfig(!showTilesetConfig)}
                >
                  <Icon icon="lucide-sliders-horizontal" size={15} />
                </button>
              )}
              {!compact && (
                <button
                  className="windrose-tb-iconbtn ghost"
                  ref={tooltipRef('Organize tiles')}
                  onClick={() => setOrganize(true)}
                >
                  <Icon icon="lucide-check-square" size={15} />
                </button>
              )}
              {onCollapse && (
                <button className="windrose-tb-iconbtn ghost" ref={tooltipRef('Collapse to edge')} onClick={onCollapse}>
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
          onArtOffsetChange={onTilesetArtOffsetChange}
          onArtScaleChange={onTilesetArtScaleChange}
          isGrid={isGrid}
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
            ref={tooltipRef('All filters')}
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
              ref={tooltipRef(p.name)}
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
                ref={tooltipRef(cat)}
              >
                <span className="windrose-tb-railmosaic">
                  {[0, 1, 2, 3].map(i => (
                    <span key={i} className="windrose-tb-mosaic-cell">
                      {tiles[i] != null && <TileThumbnail url={getThumbUrl(tiles[i].vaultPath)} />}
                    </span>
                  ))}
                </span>
                {/* <wbr> after each '/' lets path-style merged names ("patterns/normal")
                    break at the slash instead of mid-word (overflow-wrap: break-word). */}
                <span className="windrose-tb-railname">
                  {cat.split('/').map((seg, i, segs) =>
                    i < segs.length - 1 ? [seg, '/', <wbr key={i} />] : seg)}
                </span>
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
                      return (
                        <TileListRow
                          key={tile.vaultPath}
                          tile={tile}
                          tilesetId={tsId}
                          selected={selectedTilesetId === tsId && selectedTile?.id === tile.id}
                          thumbUrl={getThumbUrl(tile.vaultPath)}
                          onTileClick={handleTileClick}
                          onHover={setHoveredTile}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div className="windrose-tb-leaf-grid">
                    {(groupedTiles.get(openCat) ?? []).map((tile: TileEntry) => {
                      const tsId = tileToTilesetId.get(tile.vaultPath) ?? '';
                      return (
                        <TileCell
                          key={tile.vaultPath}
                          tile={tile}
                          tilesetId={tsId}
                          selected={selectedTilesetId === tsId && selectedTile?.id === tile.id}
                          thumbUrl={getThumbUrl(tile.vaultPath)}
                          onTileClick={handleTileClick}
                          onHover={setHoveredTile}
                        />
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
                      return (
                        <TileListRow
                          key={tile.vaultPath}
                          tile={tile}
                          tilesetId={tsId}
                          selected={selectedTilesetId === tsId && selectedTile?.id === tile.id}
                          thumbUrl={getThumbUrl(tile.vaultPath)}
                          onTileClick={handleTileClick}
                          onHover={setHoveredTile}
                        />
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
                        ref={tooltipRef(row.category)}
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
                          return (
                            <TileListRow
                              key={tile.vaultPath}
                              tile={tile}
                              tilesetId={tsId}
                              selected={selectedTilesetId === tsId && selectedTile?.id === tile.id}
                              thumbUrl={getThumbUrl(tile.vaultPath)}
                              onTileClick={handleTileClick}
                              onHover={setHoveredTile}
                            />
                          );
                        })}
                      </div>
                    )}
                    {row.type === 'tileRow' && !listMode && (
                      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${fullColCount}, 1fr)`, gap: gridGap }}>
                        {row.tiles.map((tile: TileEntry) => {
                          const tsId = tileToTilesetId.get(tile.vaultPath) ?? '';
                          return (
                            <TileCell
                              key={tile.vaultPath}
                              tile={tile}
                              tilesetId={tsId}
                              selected={selectedTilesetId === tsId && selectedTile?.id === tile.id}
                              thumbUrl={getThumbUrl(tile.vaultPath)}
                              onTileClick={handleTileClick}
                              onHover={setHoveredTile}
                            />
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
      {selectedTile != null && (
        <LoadedBrushFooter
          compact={compact}
          selectedTile={selectedTile}
          thumbUrl={getThumbUrl(selectedTile.vaultPath)}
          loadedOnLabel={isGrid ? depthMeta(tileDepth).label : tileLayer}
          selectedForm={selectedForm}
          rotation={rotation}
          onRotateCW={handleRotateCW}
          onRotateCCW={handleRotateCCW}
          flipH={flipH}
          onFlipChange={onFlipChange}
          activeSubtool={activeSubtool}
          onToggleStamp={toggleStampSubtool}
          tileFitMode={tileFitMode}
          onTileFitModeChange={onTileFitModeChange}
          tileScale={tileScale}
          onTileScaleChange={onTileScaleChange}
          brushSize={brushSize}
          onBrushSizeChange={onBrushSizeChange}
          brushSoftness={brushSoftness}
          onBrushSoftnessChange={onBrushSoftnessChange}
          paintEdgeBlend={paintEdgeBlend}
          onPaintEdgeBlendChange={onPaintEdgeBlendChange}
          wallSurface={wallSurface}
          onTileDeselect={onTileDeselect}
        />
      )}

      </>)}
    </div>
  );
});

export { TileAssetBrowser };

// Organize mode — bulk tag/star/tier/mode/move editing over the whole tile
// library. Replaces the browse tree inside TileAssetBrowser while active;
// selection, popover, and search state all live here and reset on exit.

import type { TilesetDef, TileEntry, TileLayerRole, TileMetadataStore } from '#types/tiles/tile.types';
import type { VNode } from 'preact';
import type { Dispatch, StateUpdater } from 'preact/hooks';

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useApp } from '../../context/AppContext';
import { usePreactVirtualizer } from '../../hooks/state/useVirtualizer';
import { Icon } from '../shared/Icon';
import { depthMeta } from './DepthBar';
import {
  saveTileMetadataDebounced,
  bulkAddTag,
  bulkToggleStar,
  bulkSetDepthAffinity,
  bulkSetCategoryOverride,
  bulkSetDefaultSpan,
  bulkSetRenderMode,
  bulkClearRenderMode,
  bulkClearDefaultSpan,
  isStarred,
  collectUniqueTags,
} from '../../persistence/tileMetadata';
import { predictRenderMode } from '../../assets/renderModePredictor';
import { DEFAULT_PIXELS_PER_CELL } from '../../assets/spanPredictor';
import { MAX_TILE_SPAN } from '../../assets/tileRenderResolution';
import { observeWidth, predictSpanFromMeta, TileThumbnail } from './tileBrowserCommon';

export interface TileOrganizePaneProps {
  tilesets: TilesetDef[];
  /** The browsable pool (wall end-caps already excluded). */
  allTiles: TileEntry[];
  tileToTilesetId: Map<string, string>;
  tileMetadata: TileMetadataStore;
  setTileMetadata: Dispatch<StateUpdater<TileMetadataStore>>;
  /** Canonical merged-category lookup (`${pack}|${raw}` → label) for Move… suggestions. */
  mergedCategoryLookup: Map<string, string>;
  getThumbUrl: (path: string) => string | null;
  requestThumbs: (paths: string[]) => void;
  /** False while the hosting drawer is collapsed — suspends thumbnail generation. */
  active: boolean;
  onExit: () => void;
}

const TileOrganizePane = ({
  tilesets,
  allTiles,
  tileToTilesetId,
  tileMetadata,
  setTileMetadata,
  mergedCategoryLookup,
  getThumbUrl,
  requestThumbs,
  active,
  onExit,
}: TileOrganizePaneProps): VNode => {
  const app = useApp();
  const [orgSelection, setOrgSelection] = useState<Set<string>>(new Set());
  const [orgSearch, setOrgSearch] = useState('');
  const [orgShowTag, setOrgShowTag] = useState(false);
  const [orgShowMode, setOrgShowMode] = useState(false);
  const [orgSpanW, setOrgSpanW] = useState('');
  const [orgSpanH, setOrgSpanH] = useState('');
  const [orgTagInput, setOrgTagInput] = useState('');
  const [orgShowTier, setOrgShowTier] = useState(false);
  const [orgShowMove, setOrgShowMove] = useState(false);
  const [orgMoveInput, setOrgMoveInput] = useState('');
  const orgScrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Callback ref (not a mount effect) — see attachGridWrap in TileAssetBrowser.
  const orgRoRef = useRef<ResizeObserver | null>(null);
  const attachOrgScroll = useCallback((node: HTMLDivElement | null): void => {
    observeWidth(orgScrollRef, orgRoRef, setContainerWidth, node);
  }, []);

  const orgFilteredTiles = useMemo((): TileEntry[] => {
    if (orgSearch === '') return allTiles;
    const lower = orgSearch.toLowerCase();
    return allTiles.filter(t =>
      t.filename.toLowerCase().includes(lower) ||
      (t.category != null && t.category.toLowerCase().includes(lower)) ||
      (t.tags != null && t.tags.some(tag => tag.toLowerCase().includes(lower)))
    );
  }, [allTiles, orgSearch]);

  const orgAllOn = orgFilteredTiles.length > 0 && orgFilteredTiles.every(t => orgSelection.has(t.vaultPath));

  const orgTagSuggestions = useMemo((): string[] => {
    return collectUniqueTags(allTiles, tileMetadata).slice(0, 12);
  }, [allTiles, tileMetadata]);

  // Destination chips for Move… — the canonical (merged) category labels.
  const orgMoveSuggestions = useMemo((): string[] => {
    return Array.from(new Set(mergedCategoryLookup.values())).sort((a, b) => a.localeCompare(b)).slice(0, 12);
  }, [mergedCategoryLookup]);

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

  // Per-tile render-mode / footprint overrides. Predictions are shown live but
  // NEVER bulk-persisted — writes happen only on an explicit user click.
  const handleBulkRenderMode = (mode: 'cell' | 'region' | undefined): void => {
    if (orgSelection.size === 0) return;
    const paths = Array.from(orgSelection);
    const updated = mode == null
      ? bulkClearRenderMode(tileMetadata, paths)
      : bulkSetRenderMode(tileMetadata, paths.map(vaultPath => ({ vaultPath, mode })));
    setTileMetadata(updated);
    saveTileMetadataDebounced(app, updated);
  };

  const handleBulkSpanApply = (): void => {
    if (orgSelection.size === 0) return;
    const w = Math.min(Math.max(parseInt(orgSpanW, 10) || 1, 1), MAX_TILE_SPAN);
    const h = Math.min(Math.max(parseInt(orgSpanH, 10) || 1, 1), MAX_TILE_SPAN);
    const entries = Array.from(orgSelection).map(vaultPath => ({ vaultPath, spanW: w, spanH: h }));
    const updated = bulkSetDefaultSpan(tileMetadata, entries);
    setTileMetadata(updated);
    saveTileMetadataDebounced(app, updated);
  };

  const handleBulkSpanAuto = (): void => {
    if (orgSelection.size === 0) return;
    const updated = bulkClearDefaultSpan(tileMetadata, Array.from(orgSelection));
    setTileMetadata(updated);
    saveTileMetadataDebounced(app, updated);
    setOrgSpanW('');
    setOrgSpanH('');
  };

  // Move… reassigns the category home via a read-time metadata override;
  // undefined clears it, restoring the folder-derived category (lossless).
  const handleBulkMove = (category: string | undefined): void => {
    if (orgSelection.size === 0) return;
    const updated = bulkSetCategoryOverride(tileMetadata, Array.from(orgSelection), category);
    setTileMetadata(updated);
    saveTileMetadataDebounced(app, updated);
    setOrgMoveInput('');
    setOrgShowMove(false);
  };

  // Detection preview for the Mode… popover: current override state across the
  // selection, plus live predictions when exactly one tile is selected.
  const orgModeInfo = useMemo(() => {
    if (!orgShowMode || orgSelection.size === 0) return null;
    const paths = Array.from(orgSelection);
    const modes = new Set(paths.map(p => tileMetadata[p]?.renderMode ?? 'auto'));
    const currentMode: string = modes.size === 1 ? Array.from(modes)[0] : 'mixed';
    let detectedModeLabel: string | null = null;
    let detectedSpanLabel: string | null = null;
    if (paths.length === 1) {
      const vaultPath = paths[0];
      const tile = allTiles.find(t => t.vaultPath === vaultPath);
      const meta = tileMetadata[vaultPath];
      if (tile != null) {
        const pred = predictRenderMode(tile, meta);
        detectedModeLabel = `Auto (detected ${pred.mode === 'region' ? 'Region' : 'Cell'} ${Math.round(pred.confidence * 100)}%)`;
      }
      const tsId = tileToTilesetId.get(vaultPath);
      const ts = tilesets.find(t => t.id === tsId);
      const span = predictSpanFromMeta(meta, ts?.pixelsPerCell ?? DEFAULT_PIXELS_PER_CELL);
      if (span != null) {
        detectedSpanLabel = `Auto (detected ${span.spanW}×${span.spanH})`;
      }
    }
    return { currentMode, detectedModeLabel, detectedSpanLabel };
  }, [orgShowMode, orgSelection, tileMetadata, allTiles, tileToTilesetId, tilesets]);

  // Virtualization: column count and cell size
  const orgColCount = containerWidth > 0
    ? Math.max(1, Math.floor((containerWidth + 6) / (52 + 6)))
    : 1;
  const orgCellWidth = orgColCount > 0 && containerWidth > 0
    ? (containerWidth - (orgColCount - 1) * 6) / orgColCount
    : 52;

  const orgRows = useMemo((): TileEntry[][] => {
    if (containerWidth <= 0) return [];
    const rows: TileEntry[][] = [];
    for (let i = 0; i < orgFilteredTiles.length; i += orgColCount) {
      rows.push(orgFilteredTiles.slice(i, i + orgColCount));
    }
    return rows;
  }, [containerWidth, orgFilteredTiles, orgColCount]);

  const orgVirtualizer = usePreactVirtualizer({
    count: orgRows.length,
    getScrollElement: () => orgScrollRef.current,
    estimateSize: () => orgCellWidth,
    gap: 6,
    enabled: containerWidth > 0,
    overscan: 5,
  });

  // virtual-core memoizes row measurements on count/enabled but NOT on
  // estimateSize — force a re-measure when the cell size changes (see the
  // matching effect in TileAssetBrowser for the full symptom description).
  useEffect(() => {
    orgVirtualizer.measure();
  }, [orgVirtualizer, orgCellWidth]);

  // Request thumbnails only for visible tiles (virtualizer-driven)
  const orgRange = orgVirtualizer.range;
  useEffect(() => {
    if (!active || tilesets.length === 0) return;
    const paths: string[] = [];
    for (const v of orgVirtualizer.getVirtualItems()) {
      const row = orgRows[v.index];
      if (row != null) for (const t of row) paths.push(t.vaultPath);
    }
    if (paths.length > 0) requestThumbs(paths);
  }, [active, tilesets, orgRows, orgRange, requestThumbs, orgVirtualizer]);

  return (
    <>
      <div className="windrose-tb-head">
        <Icon icon="lucide-check-square" size={16} />
        <div className="windrose-tb-title">Organize</div>
        <span className="windrose-tb-cap" style={{ marginRight: 'auto', marginLeft: 4 }}>
          tag & sort the library
        </span>
        <button className="windrose-tb-iconbtn ghost" title="Done" onClick={onExit}>
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

      <div className="windrose-tb-org-body" ref={attachOrgScroll}>
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

      {orgShowMove && (
        <div className="windrose-tb-tag-pop">
          <div style={{ fontSize: 11, color: 'var(--windrose-text-secondary)', marginBottom: 8 }}>
            Move <b style={{ color: 'var(--windrose-gold-bright)' }}>{orgSelection.size}</b> tiles to
          </div>
          <div className="windrose-tb-search" style={{ marginBottom: 9 }}>
            <Icon icon="lucide-folder-input" size={13} />
            <input
              placeholder="Category…"
              value={orgMoveInput}
              onInput={(e: Event) => setOrgMoveInput((e.target as HTMLInputElement).value)}
            />
          </div>
          <div className="windrose-tb-chips-scroll" style={{ flexWrap: 'wrap' }}>
            {orgMoveSuggestions.map(c => (
              <button key={c} className="windrose-tb-chip" onClick={() => setOrgMoveInput(c)}>
                {c}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 7, marginTop: 11 }}>
            <button
              className="windrose-tb-act windrose-tb-act-cancel"
              onClick={() => { setOrgShowMove(false); setOrgMoveInput(''); }}
            >
              Cancel
            </button>
            <button
              className="windrose-tb-act"
              onClick={() => handleBulkMove(undefined)}
              title="Clear the override — restore each tile's folder-derived category"
            >
              Reset to folder
            </button>
            <button
              className="windrose-tb-act windrose-tb-act-apply"
              disabled={orgMoveInput.trim() === ''}
              onClick={() => handleBulkMove(orgMoveInput.trim())}
            >
              Move
            </button>
          </div>
        </div>
      )}

      {orgShowMode && (
        <div className="windrose-tb-tag-pop">
          <div style={{ fontSize: 11, color: 'var(--windrose-text-secondary)', marginBottom: 8 }}>
            Render mode for <b style={{ color: 'var(--windrose-gold-bright)' }}>{orgSelection.size}</b> tiles
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            <button
              className={`windrose-tb-act ${orgModeInfo?.currentMode === 'auto' ? 'windrose-tb-act-apply' : ''}`}
              onClick={() => handleBulkRenderMode(undefined)}
              title="Clear the override — detection decides at import/read time"
            >
              {orgModeInfo?.detectedModeLabel ?? 'Auto'}
            </button>
            <button
              className={`windrose-tb-act ${orgModeInfo?.currentMode === 'cell' ? 'windrose-tb-act-apply' : ''}`}
              onClick={() => handleBulkRenderMode('cell')}
            >
              Cell
            </button>
            <button
              className={`windrose-tb-act ${orgModeInfo?.currentMode === 'region' ? 'windrose-tb-act-apply' : ''}`}
              onClick={() => handleBulkRenderMode('region')}
            >
              Region
            </button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--windrose-text-secondary)', margin: '11px 0 6px' }}>
            Footprint (cells)
          </div>
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              className="windrose-tb-spanin"
              type="number"
              min={1}
              max={MAX_TILE_SPAN}
              placeholder="W"
              value={orgSpanW}
              onInput={(e: Event) => setOrgSpanW((e.target as HTMLInputElement).value)}
              style={{ width: 46 }}
            />
            <span style={{ color: 'var(--windrose-text-muted)' }}>×</span>
            <input
              className="windrose-tb-spanin"
              type="number"
              min={1}
              max={MAX_TILE_SPAN}
              placeholder="H"
              value={orgSpanH}
              onInput={(e: Event) => setOrgSpanH((e.target as HTMLInputElement).value)}
              style={{ width: 46 }}
            />
            <button
              className="windrose-tb-act windrose-tb-act-apply"
              disabled={orgSpanW.trim() === '' && orgSpanH.trim() === ''}
              onClick={handleBulkSpanApply}
            >
              Apply
            </button>
            <button
              className="windrose-tb-act"
              onClick={handleBulkSpanAuto}
              title="Clear the override — new placements re-detect from image size"
            >
              {orgModeInfo?.detectedSpanLabel ?? 'Auto'}
            </button>
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--windrose-text-muted)', marginTop: 9 }}>
            Render mode affects existing placements of these tiles; footprint applies to new placements.
          </div>
          <div style={{ display: 'flex', gap: 7, marginTop: 11 }}>
            <button
              className="windrose-tb-act windrose-tb-act-cancel"
              onClick={() => setOrgShowMode(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      <div className="windrose-tb-org-actions">
        <button className="windrose-tb-act" disabled={orgSelection.size === 0} onClick={() => setOrgShowTag(true)}>
          <Icon icon="lucide-tag" size={14} /> Tag…
        </button>
        <button
          className="windrose-tb-act"
          disabled={orgSelection.size === 0}
          onClick={() => setOrgShowMode(!orgShowMode)}
        >
          <Icon icon="lucide-wand-2" size={14} /> Mode…
        </button>
        <button
          className="windrose-tb-act"
          disabled={orgSelection.size === 0}
          onClick={() => setOrgShowTier(!orgShowTier)}
        >
          <Icon icon="lucide-layers" size={14} /> Tier…
        </button>
        <button
          className="windrose-tb-act"
          disabled={orgSelection.size === 0}
          onClick={() => setOrgShowMove(!orgShowMove)}
        >
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
  );
};

export { TileOrganizePane };

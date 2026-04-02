/**
 * TileAssetBrowser.tsx
 *
 * Right-side collapsible panel for browsing and selecting hex tile assets.
 * Displays tile thumbnails from imported tilesets, grouped by category.
 * Selecting a tile sets it as the active brush for placement.
 */

import type { TilesetDef, TileEntry } from '#types/tiles/tile.types';

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
}: TileAssetBrowserProps): React.ReactElement => {
  const [activeTilesetIndex, setActiveTilesetIndex] = dc.useState<number>(0);
  const [searchFilter, setSearchFilter] = dc.useState<string>('');
  const [collapsedCategories, setCollapsedCategories] = dc.useState<Set<string>>(new Set());

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

  const getTileImageUrl = (tile: TileEntry): string => {
    return dc.app.vault.adapter.getResourcePath(tile.vaultPath);
  };

  if (tilesets.length === 0) return null as unknown as React.ReactElement;

  if (isCollapsed) {
    return (
      <div className="dmt-tile-browser dmt-tile-browser-collapsed">
        <button
          className="dmt-tile-browser-toggle interactive-child"
          onClick={handleToggleCollapse}
          title="Show tiles"
        >
          <dc.Icon icon="lucide-grid-3x3" size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="dmt-tile-browser">
      <div className="dmt-tile-browser-header">
        <span>Tiles</span>
        <button
          className="dmt-sidebar-collapse-btn interactive-child"
          onClick={handleToggleCollapse}
          title="Hide tile browser"
        >
          <dc.Icon icon="lucide-panel-right-close" size={14} />
        </button>
      </div>

      {/* Tileset selector (when multiple tilesets) */}
      {tilesets.length > 1 && (
        <div className="dmt-tile-browser-tileset-selector">
          <select
            value={activeTilesetIndex}
            onChange={(e: Event) => setActiveTilesetIndex(parseInt((e.target as HTMLSelectElement).value, 10))}
            className="dmt-tile-browser-select"
          >
            {tilesets.map((ts: TilesetDef, i: number) => (
              <option key={ts.id} value={i}>{ts.name}</option>
            ))}
          </select>
        </div>
      )}

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
                    <button
                      key={tile.id}
                      className={`dmt-tile-thumb ${isSelected ? 'dmt-tile-thumb-selected' : ''}`}
                      onClick={() => handleTileClick(activeTileset!.id, tile.id)}
                      title={tile.filename}
                    >
                      <img
                        src={getTileImageUrl(tile)}
                        alt={tile.filename}
                        className="dmt-tile-thumb-img"
                        loading="lazy"
                      />
                    </button>
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
            title="Rotate counter-clockwise (60\u00B0)"
          >
            <dc.Icon icon="lucide-rotate-ccw" size={14} />
          </button>
          <span className="dmt-tile-browser-rotation-label">{rotation}\u00B0</span>
          <button
            className="dmt-tile-browser-action-btn"
            onClick={handleRotateCW}
            title="Rotate clockwise (60\u00B0)"
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
          <button
            className="dmt-tile-browser-action-btn"
            onClick={onTileDeselect}
            title="Deselect tile"
          >
            <dc.Icon icon="lucide-x" size={14} />
          </button>
        </div>
      )}
    </div>
  );
};

return { TileAssetBrowser };

/**
 * TileCell.tsx
 *
 * Per-tile cells for TileAssetBrowser (STRUCT-A-14): the grid thumbnail
 * (`TileCell`), the dense list row (`TileListRow`), and the compact-mode
 * category card (`MosaicCard`). One markup source for every grid/list the
 * browser renders (compact leaf, compact list, virtualized full grid/list).
 * Stateless: selection, hover and click handling stay with the browser.
 */

import type { TileEntry } from '#types/tiles/tile.types';
import type { VNode } from 'preact';

import { Icon } from '../shared/Icon';
import { TileThumbnail } from './tileBrowserCommon';
import { tooltipRef } from '../shared/obsidianTooltip';

interface TileCellProps {
  tile: TileEntry;
  tilesetId: string;
  selected: boolean;
  thumbUrl: string | null;
  onTileClick: (tilesetId: string, tileId: string) => void;
  onHover: (tile: TileEntry | null) => void;
}

/** Grid thumbnail cell: content-cropped thumb + filename caption. */
function TileCell({ tile, tilesetId, selected, thumbUrl, onTileClick, onHover }: TileCellProps): VNode {
  return (
    <div
      className={`windrose-tile-thumb ${selected ? 'sel' : ''}`}
      onClick={() => onTileClick(tilesetId, tile.id)}
      onMouseEnter={() => onHover(tile)}
      onMouseLeave={() => onHover(null)}
      ref={tooltipRef(tile.filename)}
    >
      <TileThumbnail url={thumbUrl} />
      <span className="tname">{tile.filename}</span>
    </div>
  );
}

/** List-view row: [thumb | name] strip. */
function TileListRow({ tile, tilesetId, selected, thumbUrl, onTileClick, onHover }: TileCellProps): VNode {
  return (
    <button
      className={`windrose-tb-listrow ${selected ? 'sel' : ''}`}
      onClick={() => onTileClick(tilesetId, tile.id)}
      onMouseEnter={() => onHover(tile)}
      onMouseLeave={() => onHover(null)}
      ref={tooltipRef(tile.filename)}
    >
      <span className="lthumb">
        <TileThumbnail url={thumbUrl} />
      </span>
      <span className="lname">{tile.filename}</span>
    </button>
  );
}

/** Category card with a 2×2 mosaic preview (compact top-level view). */
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

export { TileCell, TileListRow, MosaicCard };


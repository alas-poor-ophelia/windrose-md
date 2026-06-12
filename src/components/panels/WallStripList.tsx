/**
 * WallStripList.tsx
 *
 * Wall & path strip picker for the tile browser drawer. Strips are wide
 * horizontal textures (e.g. 1500×29) swept along wall paths, so they get
 * wide row previews instead of square tile thumbnails.
 */

import type { TileEntry } from '#types/tiles/tile.types';
import type { VNode } from 'preact';
import { TFile } from 'obsidian';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useApp } from '../../context/AppContext';
import { usePreactVirtualizer } from '../../hooks/state/useVirtualizer';
import { Icon } from '../shared/Icon';

interface WallStripAsset {
  tile: TileEntry;
  tilesetId: string;
  kind: 'wall' | 'path';
  srcW?: number;
  srcH?: number;
}

type StripRow =
  | { type: 'header'; label: string; count: number }
  | { type: 'strip'; asset: WallStripAsset };

const ROW_HEIGHT = 40;
const HEADER_HEIGHT = 24;
const PREVIEW_W = 360;
const PREVIEW_H = 26;

// Small decode cache for row previews. Separate from the renderer's image
// cache; bounded so a long scroll through 500+ strips can't hold every decode.
const previewCache = new Map<string, HTMLImageElement>();
const PREVIEW_CACHE_MAX = 80;

function cachePreview(path: string, img: HTMLImageElement): void {
  if (previewCache.size >= PREVIEW_CACHE_MAX) {
    const oldest = previewCache.keys().next().value;
    if (oldest != null) previewCache.delete(oldest);
  }
  previewCache.set(path, img);
}

function drawStrip(canvas: HTMLCanvasElement, img: HTMLImageElement): void {
  const ctx = canvas.getContext('2d');
  if (ctx == null) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const scale = canvas.height / img.naturalHeight;
  const visibleSrcW = Math.min(img.naturalWidth, canvas.width / scale);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(
    img,
    0, 0, visibleSrcW, img.naturalHeight,
    0, 0, visibleSrcW * scale, canvas.height,
  );
}

function StripPreview({ vaultPath }: { vaultPath: string }): VNode {
  const app = useApp();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas == null) return;

    const cached = previewCache.get(vaultPath);
    if (cached != null) {
      drawStrip(canvas, cached);
      return;
    }

    let cancelled = false;
    let blobUrl: string | null = null;
    const file = app.vault.getAbstractFileByPath(vaultPath);
    if (file instanceof TFile) {
      void app.vault.readBinary(file).then((binary: ArrayBuffer) => {
        if (cancelled) return;
        blobUrl = URL.createObjectURL(new Blob([binary]));
        const img = new Image();
        img.onload = () => {
          if (blobUrl != null) URL.revokeObjectURL(blobUrl);
          blobUrl = null;
          if (cancelled) return;
          cachePreview(vaultPath, img);
          const c = canvasRef.current;
          if (c != null) drawStrip(c, img);
        };
        img.src = blobUrl;
      });
    }
    return () => {
      cancelled = true;
      if (blobUrl != null) URL.revokeObjectURL(blobUrl);
    };
  }, [vaultPath, app]);

  return (
    <canvas
      ref={canvasRef}
      width={PREVIEW_W}
      height={PREVIEW_H}
      className="windrose-wallstrip-preview"
    />
  );
}

interface WallStripListProps {
  strips: WallStripAsset[];
  selectedTilesetId: string | null;
  selectedTileId: string | null;
  onSelect: (asset: WallStripAsset) => void;
}

function WallStripList({
  strips,
  selectedTilesetId,
  selectedTileId,
  onSelect,
}: WallStripListProps): VNode {
  const [search, setSearch] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const rows = useMemo((): StripRow[] => {
    let filtered = strips;
    if (search !== '') {
      const lower = search.toLowerCase();
      filtered = strips.filter(s => s.tile.filename.toLowerCase().includes(lower));
    }
    const walls = filtered.filter(s => s.kind === 'wall');
    const paths = filtered.filter(s => s.kind === 'path');
    const result: StripRow[] = [];
    if (walls.length > 0) {
      result.push({ type: 'header', label: 'Walls', count: walls.length });
      for (const asset of walls) result.push({ type: 'strip', asset });
    }
    if (paths.length > 0) {
      result.push({ type: 'header', label: 'Paths', count: paths.length });
      for (const asset of paths) result.push({ type: 'strip', asset });
    }
    return result;
  }, [strips, search]);

  const virtualizer = usePreactVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index: number) => (rows[index]?.type === 'header' ? HEADER_HEIGHT : ROW_HEIGHT),
    overscan: 8,
  });

  return (
    <div className="windrose-wallstrip-list">
      <div className="windrose-tb-filter">
        <div className="windrose-tb-search">
          <Icon icon="lucide-search" size={14} />
          <input
            placeholder="Filter walls & paths…"
            value={search}
            onInput={(e: Event) => setSearch((e.target as HTMLInputElement).value)}
          />
          <span className="windrose-tb-cap">{strips.length}</span>
        </div>
      </div>

      <div className="windrose-wallstrip-scroll" ref={scrollRef}>
        {rows.length === 0 ? (
          <div className="windrose-tb-empty">
            {search !== ''
              ? 'No matching walls or paths'
              : 'No wall or path assets. Import a Dungeondraft pack with walls (Settings → Tilesets → Import Pack).'}
          </div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
            {virtualizer.getVirtualItems().map(virtualRow => {
              const row = rows[virtualRow.index];
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
                  {row.type === 'header' ? (
                    <div className="windrose-tb-seclabel" style={{ cursor: 'default' }}>
                      <Icon icon={row.label === 'Walls' ? 'lucide-brick-wall' : 'lucide-route'} size={11} />
                      <span className="catname">{row.label}</span>
                      <span className="count">{row.count}</span>
                    </div>
                  ) : (
                    <button
                      className={`windrose-wallstrip-row ${
                        selectedTilesetId === row.asset.tilesetId && selectedTileId === row.asset.tile.id ? 'sel' : ''
                      }`}
                      onClick={() => onSelect(row.asset)}
                      title={row.asset.tile.filename}
                    >
                      <StripPreview vaultPath={row.asset.tile.vaultPath} />
                      <span className="windrose-wallstrip-name">
                        {row.asset.tile.filename.replace(/\.(webp|png)$/i, '')}
                      </span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export { WallStripList };
export type { WallStripAsset };

// Inline tileset-config panel — per-tileset override editing (render mode,
// fit, stamp threshold/size, pixels-per-cell). Overrides layer over the
// tileset defaults; clearing a field falls back to the scanned value.

import type { TilesetDef, TilesetOverrides, TileMetadataStore } from '#types/tiles/tile.types';
import type { VNode } from 'preact';
import type { Dispatch, StateUpdater } from 'preact/hooks';

import { useCallback, useMemo, useState } from 'preact/hooks';
import { useApp } from '../../context/AppContext';
import { saveTileMetadataDebounced, bulkSetDefaultSpan } from '../../persistence/tileMetadata';
import { DEFAULT_PIXELS_PER_CELL } from '../../assets/spanPredictor';
import { predictSpanFromMeta } from './tileBrowserCommon';

export interface TilesetConfigPanelProps {
  tilesets: TilesetDef[];
  selectedTilesetId: string | null;
  tilesetOverrides?: Record<string, TilesetOverrides>;
  onTilesetOverrideChange: (tilesetId: string, overrides: TilesetOverrides) => void;
  isGrid: boolean;
  setTileMetadata: Dispatch<StateUpdater<TileMetadataStore>>;
}

const TilesetConfigPanel = ({
  tilesets,
  selectedTilesetId,
  tilesetOverrides,
  onTilesetOverrideChange,
  isGrid,
  setTileMetadata,
}: TilesetConfigPanelProps): VNode => {
  const app = useApp();
  // Which tileset the panel targets (null = follow the current selection).
  const [configTilesetId, setConfigTilesetId] = useState<string | null>(null);

  // Configure the explicitly-picked set, else the selected tile's set, else the first.
  const configTileset = useMemo((): TilesetDef =>
    tilesets.find(t => t.id === configTilesetId) ??
    tilesets.find(t => t.id === selectedTilesetId) ??
    tilesets[0],
  [tilesets, configTilesetId, selectedTilesetId]);

  const currentOverrides = useMemo((): TilesetOverrides =>
    tilesetOverrides?.[configTileset.id] ?? {},
  [tilesetOverrides, configTileset.id]);

  const threshold = currentOverrides.stampThreshold ?? configTileset.stampThreshold ?? 0.5;
  const minScale = currentOverrides.minStampScale ?? configTileset.minStampScale ?? 0.2;
  const fitMode = currentOverrides.fitMode ?? configTileset.fitMode;
  const renderMode = currentOverrides.renderMode ?? configTileset.renderMode ?? 'cell';
  const worldRepeat = currentOverrides.worldRepeat ?? configTileset.worldRepeat ?? 4;
  const edgeFeather = currentOverrides.edgeFeather ?? configTileset.edgeFeather ?? 0.25;
  const pixelsPerCell = currentOverrides.pixelsPerCell ?? configTileset.pixelsPerCell ?? DEFAULT_PIXELS_PER_CELL;

  const handleOverrideChange = useCallback((field: keyof TilesetOverrides, value: number | string | undefined): void => {
    const updated = { ...currentOverrides, [field]: value };
    if (value === undefined) delete updated[field];
    onTilesetOverrideChange(configTileset.id, updated);
  }, [currentOverrides, onTilesetOverrideChange, configTileset.id]);

  // pixelsPerCell is the footprint divisor (first ruler). Changing it must
  // recompute every baked span in this tileset from the cached natural dims —
  // pure arithmetic, no image re-decode.
  const handlePixelsPerCellChange = useCallback((value: number | undefined): void => {
    const updated = { ...currentOverrides, pixelsPerCell: value };
    if (value === undefined) delete updated.pixelsPerCell;
    onTilesetOverrideChange(configTileset.id, updated);
    const ppc = value ?? DEFAULT_PIXELS_PER_CELL;
    setTileMetadata(prev => {
      const spanEntries: Array<{ vaultPath: string; spanW: number; spanH: number }> = [];
      for (const tile of configTileset.tiles) {
        const e = prev[tile.vaultPath];
        if (e == null || e.renderMode === 'region') continue;
        const span = predictSpanFromMeta(e, ppc);
        if (span == null) continue;
        spanEntries.push({ vaultPath: tile.vaultPath, spanW: span.spanW, spanH: span.spanH });
      }
      if (spanEntries.length === 0) return prev;
      const next = bulkSetDefaultSpan(prev, spanEntries);
      saveTileMetadataDebounced(app, next);
      return next;
    });
  }, [currentOverrides, onTilesetOverrideChange, configTileset, setTileMetadata, app]);

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
};

export { TilesetConfigPanel };

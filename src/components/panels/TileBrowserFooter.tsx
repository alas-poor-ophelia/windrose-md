/**
 * TileBrowserFooter.tsx
 *
 * TileAssetBrowser's loaded-brush footer (STRUCT-A-14): the loaded-tile chip,
 * the per-subtool brushbar (transform controls, or size/softness when the soft
 * brush is armed), and the wall-tool row (`WallToolBar`) that joins it when
 * WallLayer publishes a control surface. Stateless apart from the scale
 * readout's edit toggle; every value and callback comes from the browser.
 */

import type { TileEntry, TileForm } from '#types/tiles/tile.types';
import type { WallToolSurface } from '#types/core/wallpath.types';
import type { TileSubtoolId } from '#types/tiles/tile.types';
import type { VNode } from 'preact';

import { useCallback, useState } from 'preact/hooks';
import { memo } from 'preact/compat';
import { Icon } from '../shared/Icon';
import { tooltipRef } from '../shared/obsidianTooltip';

// ===========================================
// Per-tile scale control (slider + editable readout)
// ===========================================

const TILE_SCALE_MIN = 0.25;
const TILE_SCALE_MAX = 3;
const TILE_SCALE_STEP = 0.25;

/** Direct entry allows finer precision (0.05) than the slider detents. */
function clampTileScale(v: number): number {
  return Math.min(TILE_SCALE_MAX, Math.max(TILE_SCALE_MIN, Math.round(v * 20) / 20));
}

/** Scale slider with a live readout: the mouse wheel steps the value over the
 *  slider, and clicking the readout swaps it for a direct numeric input
 *  (Enter/blur commits, Esc cancels). Drop-in for a bare range+cap pair.
 *  In compact (block) mode the range bar is too cramped to be useful, so it is
 *  dropped and only the click-to-edit readout remains. */
function TileScaleSlider({ value, onChange, compact = false }: {
  value: number;
  onChange: (v: number) => void;
  compact?: boolean;
}): VNode {
  const [editing, setEditing] = useState(false);
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1 : -1;
    onChange(clampTileScale(value + dir * TILE_SCALE_STEP));
  }, [value, onChange]);
  const commit = (raw: string): void => {
    const v = parseFloat(raw);
    if (Number.isFinite(v)) onChange(clampTileScale(v));
    setEditing(false);
  };
  return (
    <>
      {!compact && (
        <input
          className="windrose-tb-range"
          type="range"
          min={TILE_SCALE_MIN}
          max={TILE_SCALE_MAX}
          step={TILE_SCALE_STEP}
          value={value}
          onInput={(e: Event) => onChange(parseFloat((e.target as HTMLInputElement).value))}
          onWheel={handleWheel}
          style={{ flex: 1, minWidth: 0 }}
        />
      )}
      {editing ? (
        <input
          className="windrose-tb-scale-input"
          type="number"
          min={TILE_SCALE_MIN}
          max={TILE_SCALE_MAX}
          step={0.05}
          defaultValue={String(value)}
          ref={(el: HTMLInputElement | null) => { el?.focus(); el?.select(); }}
          onKeyDown={(e: KeyboardEvent) => {
            const el = e.target as HTMLInputElement;
            if (e.key === 'Enter') commit(el.value);
            else if (e.key === 'Escape') { el.dataset.cancel = '1'; setEditing(false); }
          }}
          onBlur={(e: Event) => {
            const el = e.target as HTMLInputElement;
            if (el.dataset.cancel !== '1') commit(el.value);
          }}
        />
      ) : (
        <button
          className="windrose-tb-cap windrose-tb-cap-edit"
          ref={tooltipRef('Edit scale')}
          onClick={() => setEditing(true)}
        >{value}×</button>
      )}
    </>
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
// Wall-tool footer controls
// ===========================================

/** Wall-tool footer controls (relocated from the old floating bar). Rendered in
 *  the loaded-brush footer whenever the wall tool publishes a control surface. */
function WallToolBar({ surface }: { surface: WallToolSurface }): VNode {
  // A selected gap wins over the opening-mode placement hint: portal mode's
  // click-to-edit selects doors, and the footer must edit the door it selects.
  if (surface.assetForm === 'opening' && !(surface.mode === 'edit' && surface.edit?.gap != null)) {
    return <span className="windrose-tb-cap">Click a wall to place a door · Click a placed door to edit it · Alt-click for a bare opening</span>;
  }
  if (!surface.hasAsset && surface.assetForm !== 'opening') {
    return <span className="windrose-tb-cap">Pick a wall or path strip</span>;
  }
  if (surface.mode === 'edit' && surface.edit?.gap != null) {
    // A gap handle is selected → the footer edits the door, not the wall.
    const g = surface.edit.gap;
    return (
      <>
        <span className="windrose-tb-cap" style={{ minWidth: 34 }}>{g.bound ? 'Door' : 'Opening'}</span>
        <span className="label">Width</span>
        <input
          className="windrose-tb-range"
          type="range"
          min="0.25"
          max="6"
          step="0.25"
          value={g.widthCells}
          onInput={(e: Event) => g.setWidth(parseFloat((e.target as HTMLInputElement).value))}
          style={{ flex: 1, minWidth: 40 }}
        />
        <span className="windrose-tb-cap" style={{ minWidth: 40, textAlign: 'right' }}>{g.widthCells} cell</span>
        <button
          className={`windrose-tb-iconbtn ${g.flip ? 'active' : ''}`}
          ref={tooltipRef('Flip door (mirror across the wall)')}
          disabled={!g.bound}
          onClick={g.toggleFlip}
        >
          <Icon icon="lucide-flip-horizontal" size={14} />
        </button>
        <button
          className="windrose-tb-iconbtn"
          ref={tooltipRef('Remove door art (leave a bare opening)')}
          disabled={!g.bound}
          onClick={g.unbind}
        >
          <Icon icon="lucide-unlink" size={14} />
        </button>
        <button className="windrose-tb-iconbtn" ref={tooltipRef('Delete opening (Delete)')} onClick={g.deleteGap}>
          <Icon icon="lucide-trash-2" size={14} />
        </button>
        <button className="windrose-tb-iconbtn" ref={tooltipRef('Done editing opening (Escape)')} onClick={g.deselectGap}>
          <Icon icon="lucide-x" size={14} />
        </button>
      </>
    );
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
          ref={tooltipRef('Flip texture direction')}
          onClick={edit.toggleFlip}
        >
          <Icon icon="lucide-flip-vertical" size={14} />
        </button>
        <button className="windrose-tb-iconbtn" ref={tooltipRef('Delete wall (Delete)')} onClick={edit.deleteWall}>
          <Icon icon="lucide-trash-2" size={14} />
        </button>
        <button className="windrose-tb-iconbtn" ref={tooltipRef('Deselect (Escape)')} onClick={edit.deselect}>
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
        ref={tooltipRef(surface.snapEnabled ? 'Grid snap: ON' : 'Grid snap: OFF')}
        onClick={surface.toggleSnap}
      >
        <Icon icon="lucide-magnet" size={14} />
      </button>
      <button
        className={`windrose-tb-iconbtn ${surface.angleSnapEnabled ? 'active' : ''}`}
        ref={tooltipRef(surface.angleSnapEnabled ? '45° angle snap: ON (or hold Alt)' : '45° angle snap: OFF (or hold Alt)')}
        onClick={surface.toggleAngleSnap}
      >
        <Icon icon="lucide-triangle-right" size={14} />
      </button>
      <span className="sep" />
      <button
        className="windrose-tb-iconbtn"
        ref={tooltipRef('Undo last point (Backspace)')}
        disabled={!surface.isDrawing}
        onClick={surface.undoLastPoint}
      >
        <Icon icon="lucide-undo-2" size={14} />
      </button>
      <button
        className="windrose-tb-iconbtn"
        ref={tooltipRef('Cancel (Escape)')}
        disabled={!surface.isDrawing}
        onClick={surface.cancelDrawing}
      >
        <Icon icon="lucide-x" size={14} />
      </button>
      <button
        className="windrose-tb-iconbtn active"
        ref={tooltipRef('Finish wall (Enter or double-click)')}
        disabled={!surface.canFinish}
        onClick={surface.finishWall}
      >
        <Icon icon="lucide-check" size={14} />
      </button>
    </>
  );
}

// ===========================================
// Loaded-brush footer
// ===========================================

interface LoadedBrushFooterProps {
  compact: boolean;
  selectedTile: TileEntry;
  thumbUrl: string | null;
  /** "loaded on …" target: the depth label on grid maps, else the tile layer. */
  loadedOnLabel: string;
  selectedForm: TileForm | null;
  rotation: number;
  onRotateCW: () => void;
  onRotateCCW: () => void;
  flipH: boolean;
  onFlipChange: (flipH: boolean) => void;
  activeSubtool: TileSubtoolId | null;
  onToggleStamp: () => void;
  tileFitMode: 'fill' | 'contain' | 'auto';
  onTileFitModeChange: (mode: 'fill' | 'contain' | 'auto') => void;
  tileScale: number;
  onTileScaleChange: (scale: number) => void;
  brushSize?: number;
  onBrushSizeChange?: (size: number) => void;
  brushSoftness?: number;
  onBrushSoftnessChange?: (softness: number) => void;
  paintEdgeBlend?: boolean;
  onPaintEdgeBlendChange?: (on: boolean) => void;
  wallSurface?: WallToolSurface | null;
  onTileDeselect: () => void;
}

function LoadedBrushFooter({
  compact,
  selectedTile,
  thumbUrl,
  loadedOnLabel,
  selectedForm,
  rotation,
  onRotateCW,
  onRotateCCW,
  flipH,
  onFlipChange,
  activeSubtool,
  onToggleStamp,
  tileFitMode,
  onTileFitModeChange,
  tileScale,
  onTileScaleChange,
  brushSize,
  onBrushSizeChange,
  brushSoftness,
  onBrushSoftnessChange,
  paintEdgeBlend,
  onPaintEdgeBlendChange,
  wallSurface,
  onTileDeselect,
}: LoadedBrushFooterProps): VNode {
  if (compact) {
    return (
      <div className="windrose-tb-footer">
        <div className="windrose-tb-brushbar windrose-tb-brushbar-compact">
          <div className="chip-tile compact">
            <LoadedChipThumb url={thumbUrl} />
          </div>
          <button className="windrose-tb-iconbtn" ref={tooltipRef('Rotate')} onClick={onRotateCW}>
            <Icon icon="lucide-rotate-cw" size={12} />
          </button>
          <button
            className={`windrose-tb-iconbtn ${activeSubtool === 'stamp' ? 'active' : ''}`}
            onClick={onToggleStamp}
            ref={tooltipRef(activeSubtool === 'stamp' ? 'Stamp: ON' : 'Stamp: OFF')}
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
              <TileScaleSlider value={tileScale} onChange={onTileScaleChange} compact />
            </>
          )}
          <button
            className="windrose-tb-iconbtn ghost"
            ref={tooltipRef('Clear brush')}
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
            <WallToolBar surface={wallSurface} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="windrose-tb-footer">
      <div className="windrose-tb-loaded">
        <div className="chip-tile">
          <LoadedChipThumb url={thumbUrl} />
        </div>
        <div className="meta">
          <div className="n">{selectedTile.filename}</div>
          <div className="s">
            {selectedTile.category ?? 'Uncategorized'} · loaded on {loadedOnLabel}
          </div>
        </div>
        <button
          className="windrose-tb-iconbtn ghost"
          ref={tooltipRef('Clear brush')}
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
            <button className="windrose-tb-iconbtn" ref={tooltipRef('Rotate counter-clockwise')} onClick={onRotateCCW}>
              <Icon icon="lucide-rotate-ccw" size={14} />
            </button>
            <span className="windrose-tb-cap" style={{ minWidth: 28, textAlign: 'center' }}>{rotation}°</span>
            <button className="windrose-tb-iconbtn" ref={tooltipRef('Rotate clockwise')} onClick={onRotateCW}>
              <Icon icon="lucide-rotate-cw" size={14} />
            </button>
            <button
              className={`windrose-tb-iconbtn ${flipH ? 'active' : ''}`}
              onClick={() => onFlipChange(!flipH)}
              ref={tooltipRef('Flip horizontal')}
            >
              <Icon icon="lucide-flip-horizontal" size={14} />
            </button>
            <span className="sep" />
            {selectedForm === 'region' && onPaintEdgeBlendChange != null && (
              <button
                className={`windrose-tb-iconbtn ${paintEdgeBlend === true ? 'active' : ''}`}
                onClick={() => onPaintEdgeBlendChange(paintEdgeBlend !== true)}
                ref={tooltipRef(paintEdgeBlend === true ? 'Edge blend: ON — new cells paint with soft edges' : 'Edge blend: OFF — new cells paint with hard edges')}
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
              ref={tooltipRef(`Fit: ${tileFitMode}`)}
            >
              <Icon icon={tileFitMode === 'contain' ? 'lucide-minimize-2' : tileFitMode === 'fill' ? 'lucide-maximize-2' : 'lucide-scan'} size={14} />
            </button>
            <span className="sep" />
            <span className="label">Scale</span>
            <TileScaleSlider value={tileScale} onChange={onTileScaleChange} />
          </>
        )}
      </div>
      {/* Wall tool row: joins (not replaces) the transform brushbar so
          every control lives in the footer. */}
      {wallSurface != null && (
        <div className="windrose-tb-brushbar">
          <WallToolBar surface={wallSurface} />
        </div>
      )}
    </div>
  );
}

export { LoadedBrushFooter };


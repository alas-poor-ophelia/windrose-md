// WindroseHoverPreview.tsx
// Small static map preview rendered in a hover popover when the user
// hovers a windrose: deep link. Uses the production canvas renderer
// so the preview matches what the full map looks like.

import type { MapData } from '#types/index';
import type { ExtendedGeometry } from '#types/contexts/context.types';
import type { RendererTheme } from '#types/hooks/canvasRenderer.types';

import type { VNode } from 'preact';
import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { loadMapData } from '../persistence/fileOperations';
import { renderCanvas } from '../hooks/canvas/useCanvasRenderer';
import { GridGeometry } from '../geometry/core/GridGeometry';
import { HexGeometry } from '../geometry/core/HexGeometry';
import { getApp, getSettings, getTheme, getEffectiveSettings } from '../core/settingsAccessor';
import { DEFAULTS } from '../core/dmtConstants';







const BASE_WIDTH = 240;
const BASE_HEIGHT = 180;
const DEFAULT_PREVIEW_SCALE = 1.0;
const DEFAULT_PREVIEW_ZOOM = 0.5;

function getPreviewDimensions(): { width: number; height: number; zoom: number } {
  try {
    const s = getSettings();
    const scale = Math.max(0.5, Math.min(2.0, Number(s.hoverPreviewScale) || DEFAULT_PREVIEW_SCALE));
    const zoom = Math.max(0.1, Math.min(2.0, Number(s.hoverPreviewZoom) || DEFAULT_PREVIEW_ZOOM));
    return { width: Math.round(BASE_WIDTH * scale), height: Math.round(BASE_HEIGHT * scale), zoom };
  } catch {
    return { width: BASE_WIDTH, height: BASE_HEIGHT, zoom: DEFAULT_PREVIEW_ZOOM };
  }
}

interface WindroseHoverPreviewProps {
  mapId: string;
  x: number;
  y: number;
  zoom?: number;
  layerId?: string;
  notePath?: string;
}

function noteBasename(notePath?: string): string {
  if (notePath == null || notePath === '') return '';
  const slash = Math.max(notePath.lastIndexOf('/'), notePath.lastIndexOf('\\'));
  const base = slash >= 0 ? notePath.slice(slash + 1) : notePath;
  return base.replace(/\.md$/i, '');
}

function WindroseHoverPreview({ mapId, x, y, zoom: zoomProp, layerId, notePath }: WindroseHoverPreviewProps): VNode {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [mapName, setMapName] = useState<string>('');

  const preview = getPreviewDimensions();
  const zoom = zoomProp ?? preview.zoom;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const mapData = await loadMapData(getApp(), mapId);
        if (cancelled) return;

        if (mapData == null || !mapData.mapType) {
          setStatus('missing');
          return;
        }

        setMapName((mapData.name) ?? mapId);

        const focused: MapData = {
          ...mapData,
          viewState: { zoom, center: { x, y } },
          activeLayerId: (layerId != null && layerId !== '') ? layerId : mapData.activeLayerId,
          northDirection: 0,
        };

        const geometry: ExtendedGeometry = focused.mapType === 'hex'
          ? new HexGeometry(
              (focused.hexSize as number) || (DEFAULTS.hexSize),
              ((focused.orientation as string) || (DEFAULTS.hexOrientation as string)) as 'flat' | 'pointy',
              focused.hexBounds || null
            )
          : new GridGeometry((focused.gridSize as number) || (DEFAULTS.gridSize));

        const effective = getEffectiveSettings(focused.settings);
        const theme = {
          grid: {
            lines: effective.gridLineColor,
            lineWidth: effective.gridLineWidth,
            background: effective.backgroundColor
          },
          cells: {
            border: effective.borderColor,
            borderWidth: getTheme().cells.borderWidth
          },
        } as RendererTheme;

        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = preview.width;
        canvas.height = preview.height;

        renderCanvas(canvas, null, focused, geometry, [], {
          theme,
          layerVisibility: { grid: true, objects: true, textLabels: true, hexCoordinates: false, regions: false, outlines: false }
        });

        // Corner brackets framing the target (viewState.center). Spread wide
        // enough to surround the zoomed object rather than sit on top of it.
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const cx = preview.width / 2;
          const cy = preview.height / 2;
          const offset = 34; // distance from center to each bracket corner
          const arm = 14;    // length of each bracket arm
          const drawBrackets = (): void => {
            ctx.beginPath();
            // Top-left
            ctx.moveTo(cx - offset + arm, cy - offset); ctx.lineTo(cx - offset, cy - offset); ctx.lineTo(cx - offset, cy - offset + arm);
            // Top-right
            ctx.moveTo(cx + offset - arm, cy - offset); ctx.lineTo(cx + offset, cy - offset); ctx.lineTo(cx + offset, cy - offset + arm);
            // Bottom-left
            ctx.moveTo(cx - offset, cy + offset - arm); ctx.lineTo(cx - offset, cy + offset); ctx.lineTo(cx - offset + arm, cy + offset);
            // Bottom-right
            ctx.moveTo(cx + offset, cy + offset - arm); ctx.lineTo(cx + offset, cy + offset); ctx.lineTo(cx + offset - arm, cy + offset);
            ctx.stroke();
          };
          ctx.save();
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          // Halo stroke for drama/contrast against any background.
          ctx.lineWidth = 5;
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
          drawBrackets();
          // Main stroke.
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = '#ff3b3b';
          drawBrackets();
          // Center pin dot.
          ctx.fillStyle = '#ff3b3b';
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(cx, cy, 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }

        setStatus('ready');
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[WindroseHoverPreview] render failed', err);
        if (!cancelled) setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [mapId, x, y, zoom, layerId]);

  const noteLabel = noteBasename(notePath);
  const headerMapName = mapName || mapId;
  const showHeader = status === 'ready' && (headerMapName !== '' || noteLabel !== '');

  return (
    <div className="windrose-hover-preview">
      {showHeader && (
        <div className="windrose-hover-preview-header">
          {headerMapName && <div className="windrose-hover-preview-header-map">{headerMapName}</div>}
          {noteLabel && <div className="windrose-hover-preview-header-note">{noteLabel}</div>}
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={preview.width}
        height={preview.height}
        style={{ display: status === 'ready' ? 'block' : 'none' }}
      />
      {status === 'loading' && <div className="windrose-hover-preview-state">Loading…</div>}
      {status === 'missing' && <div className="windrose-hover-preview-state">Map not found</div>}
      {status === 'error' && <div className="windrose-hover-preview-state">Preview failed</div>}
    </div>
  );
}

function renderHoverPreview(el: HTMLElement, params: WindroseHoverPreviewProps): void {
  try {
    render(<WindroseHoverPreview {...params} />, el);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[WindroseHoverPreview] renderPreview failed', err);
  }
}

function unmountHoverPreview(el: HTMLElement): void {
  try { render(null, el); } catch { /* ignore */ }
}

export { WindroseHoverPreview, renderHoverPreview, unmountHoverPreview };
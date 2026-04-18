// WindroseHoverPreview.tsx
// Small static map preview rendered in a hover popover when the user
// hovers a windrose: deep link. Uses the production canvas renderer
// so the preview matches what the full map looks like.

import type { MapData, IGeometry } from '#types/index';

const { requireModuleByName } = await dc.require(`${window.__dmtBasePath}/core/pathResolver.ts`);

const { loadMapData } = await requireModuleByName("fileOperations.ts") as {
  loadMapData: (mapId: string, mapName?: string, mapType?: 'grid' | 'hex') => Promise<MapData>;
};
const { renderCanvas } = await requireModuleByName("useCanvasRenderer.ts") as {
  renderCanvas: (
    canvas: HTMLCanvasElement,
    fogCanvas: HTMLCanvasElement | null,
    mapData: MapData,
    geometry: IGeometry,
    selectedItems?: unknown[],
    options?: Record<string, unknown>
  ) => void;
};
const { GridGeometry } = await requireModuleByName("GridGeometry.ts") as { GridGeometry: new (size: number) => IGeometry };
const { HexGeometry } = await requireModuleByName("HexGeometry.ts") as { HexGeometry: new (size: number, orientation: string, bounds: unknown) => IGeometry };
const { DEFAULTS } = await requireModuleByName("dmtConstants.ts") as { DEFAULTS: Record<string, unknown> };
const { getTheme, getEffectiveSettings } = await requireModuleByName("settingsAccessor.ts") as {
  getTheme: () => Record<string, unknown>;
  getEffectiveSettings: (settings: MapData['settings']) => Record<string, unknown>;
};

const PREVIEW_WIDTH = 240;
const PREVIEW_HEIGHT = 180;

interface WindroseHoverPreviewProps {
  mapId: string;
  x: number;
  y: number;
  zoom: number;
  layerId?: string;
}

function WindroseHoverPreview({ mapId, x, y, zoom, layerId }: WindroseHoverPreviewProps): React.ReactElement {
  const canvasRef = dc.useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = dc.useState<'loading' | 'ready' | 'missing' | 'error'>('loading');

  dc.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mapData = await loadMapData(mapId);
        if (cancelled) return;

        if (!mapData || !mapData.mapType) {
          setStatus('missing');
          return;
        }

        const focused: MapData = {
          ...mapData,
          viewState: { zoom, center: { x, y } },
          activeLayerId: layerId || mapData.activeLayerId,
          northDirection: 0,
        };

        const geometry: IGeometry = focused.mapType === 'hex'
          ? new HexGeometry(
              (focused.hexSize as number) || (DEFAULTS.hexSize as number),
              (focused.orientation as string) || (DEFAULTS.hexOrientation as string),
              focused.hexBounds || null
            )
          : new GridGeometry((focused.gridSize as number) || (DEFAULTS.gridSize as number));

        const effective = getEffectiveSettings(focused.settings);
        const theme = {
          grid: {
            lines: effective.gridLineColor,
            lineWidth: effective.gridLineWidth,
            background: effective.backgroundColor
          },
          cells: {
            fill: (getTheme().cells as Record<string, unknown>).fill,
            border: effective.borderColor,
            borderWidth: (getTheme().cells as Record<string, unknown>).borderWidth
          },
          compass: getTheme().compass,
          decorativeBorder: getTheme().decorativeBorder,
          coordinateKey: effective.coordinateKeyColor
        };

        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = PREVIEW_WIDTH;
        canvas.height = PREVIEW_HEIGHT;

        renderCanvas(canvas, null, focused, geometry, [], {
          theme,
          layerVisibility: { grid: true, objects: true, textLabels: true, hexCoordinates: false }
        });

        // Crosshair at canvas center (viewState.center is the target).
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const cx = PREVIEW_WIDTH / 2;
          const cy = PREVIEW_HEIGHT / 2;
          const arm = 8;
          const gap = 3;
          ctx.save();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#ff4444';
          ctx.beginPath();
          ctx.moveTo(cx - arm, cy); ctx.lineTo(cx - gap, cy);
          ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + arm, cy);
          ctx.moveTo(cx, cy - arm); ctx.lineTo(cx, cy - gap);
          ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + arm);
          ctx.stroke();
          ctx.restore();
        }

        setStatus('ready');
      } catch (err) {
        console.error('[WindroseHoverPreview] render failed', err);
        if (!cancelled) setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [mapId, x, y, zoom, layerId]);

  return (
    <div className="windrose-hover-preview">
      <canvas
        ref={canvasRef}
        width={PREVIEW_WIDTH}
        height={PREVIEW_HEIGHT}
        style={{ display: status === 'ready' ? 'block' : 'none' }}
      />
      {status === 'loading' && <div className="windrose-hover-preview-state">Loading…</div>}
      {status === 'missing' && <div className="windrose-hover-preview-state">Map not found</div>}
      {status === 'error' && <div className="windrose-hover-preview-state">Preview failed</div>}
    </div>
  );
}

// Register a bridge function so the settings plugin can render previews into
// any container without needing its own Datacore execution context. Called
// once at module load; overwriting is safe across reloads.
function registerHoverPreviewBridge(): void {
  const bridge = (window.__windrose = window.__windrose || ({} as NonNullable<Window['__windrose']>));
  (bridge as unknown as { renderPreview?: (el: HTMLElement, params: WindroseHoverPreviewProps) => void }).renderPreview = (el, params) => {
    try {
      dc.preact.render(<WindroseHoverPreview {...params} />, el);
    } catch (err) {
      console.error('[WindroseHoverPreview] renderPreview failed', err);
    }
  };
  (bridge as unknown as { unmountPreview?: (el: HTMLElement) => void }).unmountPreview = (el) => {
    try { dc.preact.render(null, el); } catch { /* ignore */ }
  };
}

registerHoverPreviewBridge();

return { WindroseHoverPreview, registerHoverPreviewBridge };

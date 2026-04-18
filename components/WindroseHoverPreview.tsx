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
  notePath?: string;
}

function noteBasename(notePath?: string): string {
  if (!notePath) return '';
  const slash = Math.max(notePath.lastIndexOf('/'), notePath.lastIndexOf('\\'));
  const base = slash >= 0 ? notePath.slice(slash + 1) : notePath;
  return base.replace(/\.md$/i, '');
}

function WindroseHoverPreview({ mapId, x, y, zoom, layerId, notePath }: WindroseHoverPreviewProps): React.ReactElement {
  const canvasRef = dc.useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = dc.useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [mapName, setMapName] = dc.useState<string>('');

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

        setMapName((mapData.name as string) || mapId);

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

        // Corner brackets framing the target (viewState.center). Spread wide
        // enough to surround the zoomed object rather than sit on top of it.
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const cx = PREVIEW_WIDTH / 2;
          const cy = PREVIEW_HEIGHT / 2;
          const offset = 34; // distance from center to each bracket corner
          const arm = 14;    // length of each bracket arm
          const drawBrackets = () => {
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
        console.error('[WindroseHoverPreview] render failed', err);
        if (!cancelled) setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [mapId, x, y, zoom, layerId]);

  const noteLabel = noteBasename(notePath);
  const headerMapName = mapName || mapId;
  const showHeader = status === 'ready' && (headerMapName || noteLabel);

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

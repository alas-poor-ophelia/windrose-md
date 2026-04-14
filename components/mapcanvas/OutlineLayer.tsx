/**
 * OutlineLayer.tsx
 *
 * Interaction layer for drawing and editing polygon outlines on hex maps.
 * Registers handlers with EventHandlerContext and renders:
 * - Overlay canvas for in-progress drawing
 * - Configuration toolbar when the outline tool is active
 * - Context menu via Obsidian Menu API
 */

import type { ToolId } from '#types/tools/tool.types';
import type { Outline } from '#types/core/map.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useMapState } = await requireModuleByName("MapContext.tsx");
const { useEventHandlerRegistration } = await requireModuleByName("EventHandlerContext.tsx");
const { useOutlineTools } = await requireModuleByName("useOutlineTools.ts");
const { isBridgeAvailable, getObsidianModule } = await requireModuleByName("obsidianBridge.ts");

interface OutlineLayerProps {
  currentTool: ToolId;
  selectedColor: string;
  onOutlinesChange: (outlines: Outline[]) => void;
}

const OutlineLayer = ({
  currentTool,
  selectedColor,
  onOutlinesChange
}: OutlineLayerProps): React.ReactElement | null => {
  const { canvasRef, mapData, geometry, screenToWorld } = useMapState();
  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();

  const isOutlineTool = currentTool === 'outline';

  const {
    drawingVertices,
    selectedOutlineId,
    isActive,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleDoubleClick,
    cancelDrawing,
    deleteOutline,
    updateOutline,
    deselectOutline,
    outlineSettings,
    setOutlineSettings
  } = useOutlineTools({
    currentTool,
    selectedColor,
    mapData,
    geometry,
    screenToWorld,
    onOutlinesChange
  });

  // Register handlers via Proxy pattern
  const outlineHandlersRef = dc.useRef<Record<string, unknown> | null>(null);
  outlineHandlersRef.current = isOutlineTool
    ? { handlePointerDown, handlePointerMove, handlePointerUp, handleDoubleClick }
    : {};

  dc.useEffect(() => {
    const proxy = new Proxy({} as Record<string, unknown>, {
      get(_target, prop: string) {
        return outlineHandlersRef.current?.[prop];
      }
    });
    registerHandlers('outline', proxy);
    return () => unregisterHandlers('outline');
  }, []);

  // ESC to cancel drawing
  dc.useEffect(() => {
    if (!isOutlineTool) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelDrawing();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOutlineTool, cancelDrawing]);

  // Context menu via windrose:hex-context-menu
  dc.useEffect(() => {
    if (!isOutlineTool || !isBridgeAvailable()) return;

    const handler = (e: CustomEvent) => {
      const { screenX, screenY } = e.detail;
      if (!mapData?.outlines || !screenToWorld) return;

      const world = screenToWorld(screenX, screenY);
      if (!world) return;

      // Find outline at this point
      let hitOutline: Outline | null = null;
      for (let i = (mapData.outlines.length - 1); i >= 0; i--) {
        const outline = mapData.outlines[i];
        if (!outline.visible || outline.vertices.length < 3) continue;
        for (let j = 0; j < outline.vertices.length; j++) {
          const a = outline.vertices[j];
          const b = outline.vertices[(j + 1) % outline.vertices.length];
          const dx = b.x - a.x, dy = b.y - a.y;
          const lenSq = dx * dx + dy * dy;
          let t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((world.worldX - a.x) * dx + (world.worldY - a.y) * dy) / lenSq));
          const dist = Math.sqrt((world.worldX - (a.x + t * dx)) ** 2 + (world.worldY - (a.y + t * dy)) ** 2);
          if (dist < ((geometry as any)?.hexSize || 30) * 0.5) {
            hitOutline = outline;
            break;
          }
        }
        if (hitOutline) break;
      }

      if (!hitOutline) return;

      const obs = getObsidianModule();
      const MenuClass = obs.Menu as new () => {
        addItem: (cb: (item: any) => void) => any;
        addSeparator: () => any;
        showAtPosition: (pos: { x: number; y: number }) => void;
      };

      const menu = new MenuClass();
      const outlineRef = hitOutline;

      menu.addItem((item: any) => {
        item.setTitle(outlineRef.visible ? 'Hide Outline' : 'Show Outline');
        item.setIcon(outlineRef.visible ? 'lucide-eye-off' : 'lucide-eye');
        item.onClick(() => updateOutline(outlineRef.id, { visible: !outlineRef.visible }));
      });

      menu.addItem((item: any) => {
        item.setTitle('Duplicate');
        item.setIcon('lucide-copy');
        item.onClick(() => {
          const dup: Outline = {
            ...outlineRef,
            id: `outline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            order: (mapData.outlines || []).length
          };
          onOutlinesChange([...(mapData.outlines || []), dup]);
        });
      });

      menu.addSeparator();

      menu.addItem((item: any) => {
        item.setTitle('Delete Outline');
        item.setIcon('lucide-trash-2');
        item.setWarning(true);
        item.onClick(() => deleteOutline(outlineRef.id));
      });

      menu.showAtPosition({ x: screenX, y: screenY });
    };

    document.addEventListener('windrose:hex-context-menu', handler as EventListener);
    return () => document.removeEventListener('windrose:hex-context-menu', handler as EventListener);
  }, [isOutlineTool, mapData?.outlines, geometry, screenToWorld, deleteOutline, updateOutline, onOutlinesChange]);

  // ── Overlay canvas for in-progress drawing ────────────────────────
  const overlayRef = dc.useRef<HTMLCanvasElement | null>(null);

  dc.useEffect(() => {
    const mainCanvas = canvasRef.current;
    if (!mainCanvas || !mainCanvas.parentElement || !isOutlineTool) {
      if (overlayRef.current && overlayRef.current.parentElement) {
        overlayRef.current.parentElement.removeChild(overlayRef.current);
        overlayRef.current = null;
      }
      return;
    }

    if (!overlayRef.current) {
      const overlay = document.createElement('canvas');
      overlay.style.position = 'absolute';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.pointerEvents = 'none';
      mainCanvas.parentElement.appendChild(overlay);
      overlayRef.current = overlay;
    }

    return () => {
      if (overlayRef.current && overlayRef.current.parentElement) {
        overlayRef.current.parentElement.removeChild(overlayRef.current);
        overlayRef.current = null;
      }
    };
  }, [canvasRef, isOutlineTool]);

  // Render drawing vertices and selected outline vertices on overlay
  dc.useEffect(() => {
    const overlay = overlayRef.current;
    const mainCanvas = canvasRef.current;
    if (!overlay || !mainCanvas || !geometry || geometry.type !== 'hex' || !mapData) return;

    overlay.width = mainCanvas.width;
    overlay.height = mainCanvas.height;

    const ctx = overlay.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const viewState = mapData.viewState;
    if (!viewState) return;

    const offsetX = overlay.width / 2 - viewState.center.x * viewState.zoom;
    const offsetY = overlay.height / 2 - viewState.center.y * viewState.zoom;
    const hexGeom = geometry as any;

    const northDirection = mapData.northDirection || 0;
    if (northDirection !== 0) {
      ctx.save();
      ctx.translate(overlay.width / 2, overlay.height / 2);
      ctx.rotate((northDirection * Math.PI) / 180);
      ctx.translate(-overlay.width / 2, -overlay.height / 2);
    }

    // Draw in-progress outline
    if (drawingVertices.length > 0) {
      const screenVerts = drawingVertices.map(v =>
        hexGeom.worldToScreen(v.x, v.y, offsetX, offsetY, viewState.zoom)
      );

      ctx.strokeStyle = selectedColor;
      ctx.lineWidth = outlineSettings.lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      switch (outlineSettings.lineStyle) {
        case 'dotted': ctx.setLineDash([0.5, 8]); break;
        case 'dashed': ctx.setLineDash([12, 6]); break;
        default: ctx.setLineDash([]); break;
      }
      ctx.beginPath();
      ctx.moveTo(screenVerts[0].screenX, screenVerts[0].screenY);
      for (let i = 1; i < screenVerts.length; i++) {
        ctx.lineTo(screenVerts[i].screenX, screenVerts[i].screenY);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Vertex dots — sized relative to line width
      const dotRadius = Math.max(viewState.zoom * 1.5, 2);
      ctx.fillStyle = selectedColor;
      for (const sv of screenVerts) {
        ctx.beginPath();
        ctx.arc(sv.screenX, sv.screenY, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw vertex handles for selected outline
    if (selectedOutlineId && mapData.outlines) {
      const outline = mapData.outlines.find(o => o.id === selectedOutlineId);
      if (outline && outline.vertices.length >= 3) {
        const screenVerts = outline.vertices.map(v =>
          hexGeom.worldToScreen(v.x, v.y, offsetX, offsetY, viewState.zoom)
        );

        const handleRadius = Math.max(outline.lineWidth * viewState.zoom * 1.2, 2.5);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = outline.color;
        ctx.lineWidth = 1.5;
        for (const sv of screenVerts) {
          ctx.beginPath();
          ctx.arc(sv.screenX, sv.screenY, handleRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
    }

    if (northDirection !== 0) ctx.restore();
  }, [drawingVertices, selectedOutlineId, canvasRef, geometry, mapData, selectedColor, outlineSettings]);

  // ── Toolbar styles ─────────────────────────────────────────────────
  const barStyle = {
    position: 'fixed' as const,
    bottom: '100px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: '8px',
    background: 'var(--background-secondary)',
    border: '1px solid var(--background-modifier-border)',
    borderRadius: '8px',
    padding: '8px 14px',
    zIndex: 1000,
    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
    whiteSpace: 'nowrap' as const
  };

  const btnStyle = (active?: boolean) => ({
    padding: '4px 10px',
    background: active ? 'var(--interactive-accent)' : 'transparent',
    color: active ? 'var(--text-on-accent)' : 'var(--text-muted)',
    borderRadius: '4px',
    border: '1px solid var(--background-modifier-border)',
    cursor: 'pointer' as const,
    fontSize: '12px',
    minHeight: '30px'
  });

  // ── JSX ────────────────────────────────────────────────────────────
  return (
    <div className="dmt-outline-ui" style={{ position: 'relative' }}>
      {/* Drawing mode: vertex count */}
      {isOutlineTool && drawingVertices.length > 0 && (
        <div style={barStyle}>
          <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
            {drawingVertices.length} vertices — double-click to close
          </span>
          <button onClick={cancelDrawing} style={btnStyle()}>
            Cancel
          </button>
        </div>
      )}

      {/* Config toolbar: shown when tool is active and not drawing */}
      {isOutlineTool && drawingVertices.length === 0 && !selectedOutlineId && (
        <div style={barStyle}>
          {/* Line style */}
          <select
            value={outlineSettings.lineStyle}
            onChange={(e: any) => setOutlineSettings({ lineStyle: e.target.value })}
            style={{
              background: 'var(--background-primary)',
              color: 'var(--text-normal)',
              border: '1px solid var(--background-modifier-border)',
              borderRadius: '4px',
              padding: '4px 6px',
              fontSize: '12px',
              minHeight: '30px'
            }}
          >
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="dotted">Dotted</option>
          </select>

          {/* Color */}
          <input
            type="color"
            value={selectedColor}
            disabled
            title="Uses selected color"
            style={{
              width: '28px', height: '28px', borderRadius: '4px',
              border: '2px solid var(--background-modifier-border)',
              cursor: 'default', padding: 0, background: 'none'
            }}
          />

          {/* Fill toggle */}
          <button
            onClick={() => setOutlineSettings({ filled: !outlineSettings.filled })}
            title={outlineSettings.filled ? 'Filled' : 'Stroke only'}
            style={btnStyle(outlineSettings.filled)}
          >
            {outlineSettings.filled ? 'Filled' : 'No Fill'}
          </button>

          {/* Snap mode */}
          <button
            onClick={() => setOutlineSettings({ snapMode: outlineSettings.snapMode === 'straight' ? 'hex' : 'straight' })}
            title={outlineSettings.snapMode === 'straight' ? 'Straight lines' : 'Snap to hex edges'}
            style={btnStyle(outlineSettings.snapMode === 'hex')}
          >
            {outlineSettings.snapMode === 'straight' ? 'Straight' : 'Hex Snap'}
          </button>

          <span style={{ color: 'var(--text-faint)', fontSize: '11px' }}>
            Click to place vertices
          </span>
        </div>
      )}

      {/* Selected outline toolbar */}
      {isOutlineTool && selectedOutlineId && mapData?.outlines && (() => {
        const outline = mapData.outlines.find(o => o.id === selectedOutlineId);
        if (!outline) return null;
        return (
          <div style={barStyle}>
            {/* Line style */}
            <select
              value={outline.lineStyle}
              onChange={(e: any) => updateOutline(outline.id, { lineStyle: e.target.value })}
              style={{
                background: 'var(--background-primary)',
                color: 'var(--text-normal)',
                border: '1px solid var(--background-modifier-border)',
                borderRadius: '4px',
                padding: '4px 6px',
                fontSize: '12px',
                minHeight: '30px'
              }}
            >
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
            </select>

            {/* Color */}
            <input
              type="color"
              value={outline.color}
              onInput={(e: any) => updateOutline(outline.id, { color: e.target.value })}
              title="Outline color"
              style={{
                width: '28px', height: '28px', borderRadius: '4px',
                border: '2px solid var(--background-modifier-border)',
                cursor: 'pointer', padding: 0, background: 'none'
              }}
            />

            {/* Fill toggle */}
            <button
              onClick={() => updateOutline(outline.id, { filled: !outline.filled })}
              title={outline.filled ? 'Filled' : 'Stroke only'}
              style={btnStyle(outline.filled)}
            >
              {outline.filled ? 'Filled' : 'No Fill'}
            </button>

            {/* Snap mode */}
            <button
              onClick={() => updateOutline(outline.id, { snapMode: outline.snapMode === 'straight' ? 'hex' : 'straight' })}
              title={outline.snapMode === 'straight' ? 'Straight lines' : 'Snap to hex edges'}
              style={btnStyle(outline.snapMode === 'hex')}
            >
              {outline.snapMode === 'straight' ? 'Straight' : 'Hex Snap'}
            </button>

            <span style={{ color: 'var(--text-faint)', fontSize: '11px', margin: '0 2px' }}>|</span>

            <button onClick={() => deleteOutline(outline.id)} style={{ ...btnStyle(), color: 'var(--text-error)' }}>
              Delete
            </button>
            <button onClick={deselectOutline} style={btnStyle()}>
              Done
            </button>
          </div>
        );
      })()}
    </div>
  );
};

return { OutlineLayer };

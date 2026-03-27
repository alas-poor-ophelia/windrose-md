/**
 * RegionLayer.tsx
 *
 * Interaction layer for hex region creation and editing.
 * Registers handlers with EventHandlerContext and renders
 * a pending-hex selection overlay and region management UI.
 */

import type { ToolId } from '#types/tools/tool.types';
import type { Region } from '#types/core/map.types';
import type { Point } from '#types/core/geometry.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useMapState } = await requireModuleByName("MapContext.tsx");
const { useEventHandlerRegistration } = await requireModuleByName("EventHandlerContext.tsx");
const { useRegionTools } = await requireModuleByName("useRegionTools.ts");
const { getObsidianModule, isBridgeAvailable } = await requireModuleByName("obsidianBridge.ts");

interface RegionLayerProps {
  currentTool: ToolId;
  selectedColor: string;
  selectedOpacity: number;
  onRegionsChange: (regions: Region[]) => void;
}

const RegionLayer = ({
  currentTool,
  selectedColor,
  selectedOpacity,
  onRegionsChange
}: RegionLayerProps): React.ReactElement | null => {
  const { canvasRef, containerRef, mapData, geometry, screenToWorld, screenToGrid } = useMapState();
  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();

  const isRegionTool = currentTool === 'regionPaint' || currentTool === 'regionBoundary';

  const {
    pendingHexes,
    boundaryVertices,
    isActive,
    editingRegionId,
    editingRegion,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleDoubleClick,
    handleContextMenu,
    confirmRegion,
    cancelRegion,
    deleteRegion,
    updateRegion,
    startEditingRegion,
    stopEditingRegion,
    contextMenu,
    dismissContextMenu
  } = useRegionTools({
    currentTool,
    selectedColor,
    selectedOpacity,
    mapData,
    geometry,
    screenToWorld,
    screenToGrid,
    onRegionsChange
  });

  // Register handlers — always register context menu, tool handlers only when active
  dc.useEffect(() => {
    const handlers: Record<string, any> = {
      handleContextMenu
    };

    if (isRegionTool) {
      handlers.handlePointerDown = handlePointerDown;
      handlers.handlePointerMove = handlePointerMove;
      handlers.handlePointerUp = handlePointerUp;
      handlers.handleDoubleClick = handleDoubleClick;
    }

    registerHandlers('region', handlers);

    return () => unregisterHandlers('region');
  }, [isRegionTool, registerHandlers, unregisterHandlers,
    handlePointerDown, handlePointerMove, handlePointerUp, handleDoubleClick, handleContextMenu]);

  // Name input state
  const [showNameInput, setShowNameInput] = dc.useState(false);
  const [regionName, setRegionName] = dc.useState('');

  const handleCreateClick = dc.useCallback(() => {
    setShowNameInput(true);
    setRegionName('');
  }, []);

  const handleConfirmName = dc.useCallback(() => {
    if (!regionName.trim()) return;

    if (editingRegionId) {
      updateRegion(editingRegionId, { name: regionName.trim() });
    } else {
      confirmRegion(regionName.trim());
    }
    setShowNameInput(false);
    setRegionName('');
  }, [regionName, confirmRegion, editingRegionId, updateRegion]);

  const handleCancelName = dc.useCallback(() => {
    setShowNameInput(false);
    setRegionName('');
  }, []);

  const handleNameKeyDown = dc.useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirmName();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelName();
    }
  }, [handleConfirmName, handleCancelName]);

  // Color change handler for the inline <input type="color">
  const handleColorChange = dc.useCallback((e: any) => {
    if (!editingRegion) return;
    const newColor = e.target.value;
    updateRegion(editingRegion.id, { color: newColor, borderColor: newColor });
  }, [editingRegion, updateRegion]);

  // ── Overlay canvas (same as FreehandLayer pattern) ─────────────────
  const overlayRef = dc.useRef<HTMLCanvasElement | null>(null);

  dc.useEffect(() => {
    const mainCanvas = canvasRef.current;
    if (!mainCanvas || !mainCanvas.parentElement || !isRegionTool) {
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
  }, [canvasRef, isRegionTool]);

  // Render pending/editing hexes on the overlay
  dc.useEffect(() => {
    const overlay = overlayRef.current;
    const mainCanvas = canvasRef.current;
    if (!overlay || !mainCanvas || !geometry || geometry.type !== 'hex' || !mapData) return;

    overlay.width = mainCanvas.width;
    overlay.height = mainCanvas.height;

    const ctx = overlay.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const hexesToHighlight = editingRegion ? editingRegion.hexes : pendingHexes;
    const highlightColor = editingRegion ? editingRegion.color : selectedColor;

    if (hexesToHighlight.length === 0 && boundaryVertices.length === 0) return;

    const hexGeom = geometry as any;
    const viewState = mapData.viewState;
    if (!viewState) return;

    const northDirection = mapData.northDirection || 0;

    if (northDirection !== 0) {
      ctx.save();
      ctx.translate(overlay.width / 2, overlay.height / 2);
      ctx.rotate((northDirection * Math.PI) / 180);
      ctx.translate(-overlay.width / 2, -overlay.height / 2);
    }

    const offsetX = overlay.width / 2 - viewState.center.x * viewState.zoom;
    const offsetY = overlay.height / 2 - viewState.center.y * viewState.zoom;

    if (hexesToHighlight.length > 0) {
      ctx.globalAlpha = editingRegion ? 0.15 : 0.4;
      ctx.fillStyle = highlightColor;
      ctx.beginPath();
      for (const h of hexesToHighlight) {
        const vertices = hexGeom.getHexVertices(h.x, h.y);
        const sv = vertices.map((v: any) => hexGeom.worldToScreen(v.worldX, v.worldY, offsetX, offsetY, viewState.zoom));
        ctx.moveTo(sv[0].screenX, sv[0].screenY);
        for (let i = 1; i < sv.length; i++) ctx.lineTo(sv[i].screenX, sv[i].screenY);
        ctx.closePath();
      }
      ctx.fill();

      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = highlightColor;
      ctx.lineWidth = 2 * viewState.zoom;
      ctx.beginPath();
      for (const h of hexesToHighlight) {
        const vertices = hexGeom.getHexVertices(h.x, h.y);
        const sv = vertices.map((v: any) => hexGeom.worldToScreen(v.worldX, v.worldY, offsetX, offsetY, viewState.zoom));
        ctx.moveTo(sv[0].screenX, sv[0].screenY);
        for (let i = 1; i < sv.length; i++) ctx.lineTo(sv[i].screenX, sv[i].screenY);
        ctx.closePath();
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (boundaryVertices.length > 0) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      const s0 = hexGeom.worldToScreen(boundaryVertices[0].x, boundaryVertices[0].y, offsetX, offsetY, viewState.zoom);
      ctx.moveTo(s0.screenX, s0.screenY);
      for (let i = 1; i < boundaryVertices.length; i++) {
        const s = hexGeom.worldToScreen(boundaryVertices[i].x, boundaryVertices[i].y, offsetX, offsetY, viewState.zoom);
        ctx.lineTo(s.screenX, s.screenY);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#ffffff';
      for (const v of boundaryVertices) {
        const s = hexGeom.worldToScreen(v.x, v.y, offsetX, offsetY, viewState.zoom);
        ctx.beginPath();
        ctx.arc(s.screenX, s.screenY, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (northDirection !== 0) ctx.restore();
  }, [pendingHexes, boundaryVertices, canvasRef, geometry, mapData, selectedColor, editingRegion]);

  // ── Context menu via Obsidian's native Menu API ────────────────────
  dc.useEffect(() => {
    if (!contextMenu || !mapData?.regions || !isBridgeAvailable()) {
      if (contextMenu) dismissContextMenu();
      return;
    }

    const region = mapData.regions.find(r => r.id === contextMenu.regionId);
    if (!region) { dismissContextMenu(); return; }

    const obs = getObsidianModule();
    const MenuClass = obs.Menu as new () => {
      addItem: (cb: (item: any) => void) => any;
      addSeparator: () => any;
      showAtPosition: (pos: { x: number; y: number }) => void;
    };

    const menu = new MenuClass();

    menu.addItem((item: any) => {
      item.setTitle('Edit Region');
      item.setIcon('lucide-pencil');
      item.onClick(() => startEditingRegion(region.id));
    });

    menu.addItem((item: any) => {
      item.setTitle('Rename');
      item.setIcon('lucide-type');
      item.onClick(() => {
        startEditingRegion(region.id);
        setShowNameInput(true);
        setRegionName(region.name);
      });
    });

    menu.addItem((item: any) => {
      item.setTitle(region.visible ? 'Hide Region' : 'Show Region');
      item.setIcon(region.visible ? 'lucide-eye-off' : 'lucide-eye');
      item.onClick(() => updateRegion(region.id, { visible: !region.visible }));
    });

    menu.addSeparator();

    menu.addItem((item: any) => {
      item.setTitle('Delete Region');
      item.setIcon('lucide-trash-2');
      item.setWarning(true);
      item.onClick(() => deleteRegion(region.id));
    });

    menu.showAtPosition({ x: contextMenu.screenX, y: contextMenu.screenY });
    dismissContextMenu();
  }, [contextMenu, mapData?.regions]);

  // ── Long-press touch support for context menu (500ms) ──────────────
  const longPressTimerRef = dc.useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressPosRef = dc.useRef<{ x: number; y: number } | null>(null);

  dc.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      longPressPosRef.current = { x: touch.clientX, y: touch.clientY };

      longPressTimerRef.current = setTimeout(() => {
        if (!longPressPosRef.current) return;
        const synth = new MouseEvent('contextmenu', {
          clientX: longPressPosRef.current.x,
          clientY: longPressPosRef.current.y,
          bubbles: true
        });
        const hex = screenToGrid ? screenToGrid(longPressPosRef.current.x, longPressPosRef.current.y) : null;
        if (hex && mapData?.regions) {
          const key = `${hex.x},${hex.y}`;
          const region = mapData.regions.find(r => r.hexes.some(h => `${h.x},${h.y}` === key));
          if (region) {
            handleContextMenu(synth);
          }
        }
        longPressPosRef.current = null;
      }, 500);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (longPressPosRef.current && e.touches.length === 1) {
        const touch = e.touches[0];
        const dx = touch.clientX - longPressPosRef.current.x;
        const dy = touch.clientY - longPressPosRef.current.y;
        if (dx * dx + dy * dy > 100) {
          if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
          longPressPosRef.current = null;
        }
      }
    };

    const handleTouchEnd = () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      longPressPosRef.current = null;
    };

    canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: true });
    canvas.addEventListener('touchend', handleTouchEnd);
    canvas.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
      canvas.removeEventListener('touchcancel', handleTouchEnd);
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, [canvasRef, screenToGrid, mapData?.regions, handleContextMenu]);

  // ── JSX ────────────────────────────────────────────────────────────
  return (
    <div className="dmt-region-ui" style={{ position: 'relative' }}>
      {/* Editing existing region bar */}
      {editingRegion && pendingHexes.length === 0 && !showNameInput && (
        <div style={{
          position: 'fixed',
          bottom: '100px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: '10px',
          background: 'var(--background-secondary)',
          border: '1px solid var(--background-modifier-border)',
          borderRadius: '8px',
          padding: '8px 16px',
          zIndex: 1000,
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          whiteSpace: 'nowrap'
        }}>
          <input
            type="color"
            value={editingRegion.color}
            onInput={handleColorChange}
            title="Change region color"
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '4px',
              border: '2px solid var(--background-modifier-border)',
              cursor: 'pointer',
              flexShrink: 0,
              padding: 0,
              background: 'none'
            }}
          />
          <span style={{ color: 'var(--text-normal)', fontSize: '13px', fontWeight: '600' }}>
            {editingRegion.name}
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
            {editingRegion.hexes.length} hex{editingRegion.hexes.length !== 1 ? 'es' : ''}
          </span>
          <span style={{ color: 'var(--text-faint)', fontSize: '11px', margin: '0 4px' }}>|</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
            Click hexes to add/remove
          </span>
          <button
            onClick={() => {
              setShowNameInput(true);
              setRegionName(editingRegion.name);
            }}
            style={{
              padding: '4px 12px',
              background: 'transparent',
              color: 'var(--text-accent)',
              borderRadius: '4px',
              border: '1px solid var(--background-modifier-border)',
              cursor: 'pointer',
              fontSize: '12px',
              minHeight: '32px'
            }}
          >
            Rename
          </button>
          <button
            onClick={() => deleteRegion(editingRegion.id)}
            style={{
              padding: '4px 12px',
              background: 'transparent',
              color: 'var(--text-error)',
              borderRadius: '4px',
              border: '1px solid var(--background-modifier-border)',
              cursor: 'pointer',
              fontSize: '12px',
              minHeight: '32px'
            }}
          >
            Delete
          </button>
          <button
            onClick={stopEditingRegion}
            style={{
              padding: '4px 12px',
              background: 'transparent',
              color: 'var(--text-muted)',
              borderRadius: '4px',
              border: '1px solid var(--background-modifier-border)',
              cursor: 'pointer',
              fontSize: '12px',
              minHeight: '32px'
            }}
          >
            Done
          </button>
        </div>
      )}

      {/* Create Region bar */}
      {isRegionTool && pendingHexes.length > 0 && !showNameInput && !editingRegionId && (
        <div style={{
          position: 'fixed',
          bottom: '100px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: '10px',
          background: 'var(--background-secondary)',
          border: '1px solid var(--background-modifier-border)',
          borderRadius: '8px',
          padding: '8px 16px',
          zIndex: 1000,
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          whiteSpace: 'nowrap'
        }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '13px', marginRight: '4px' }}>
            {pendingHexes.length} hex{pendingHexes.length !== 1 ? 'es' : ''}
          </span>
          <button
            onClick={handleCreateClick}
            style={{
              padding: '6px 16px',
              background: 'var(--interactive-accent)',
              color: 'var(--text-on-accent)',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '600',
              minHeight: '36px'
            }}
          >
            Create Region
          </button>
          <button
            onClick={cancelRegion}
            style={{
              padding: '6px 12px',
              background: 'transparent',
              color: 'var(--text-muted)',
              borderRadius: '6px',
              border: '1px solid var(--background-modifier-border)',
              cursor: 'pointer',
              fontSize: '13px',
              minHeight: '36px'
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Name input */}
      {showNameInput && (
        <div style={{
          position: 'fixed',
          bottom: '100px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: '8px',
          background: 'var(--background-secondary)',
          border: '1px solid var(--background-modifier-border)',
          borderRadius: '8px',
          padding: '8px 12px',
          zIndex: 1000,
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          whiteSpace: 'nowrap'
        }}>
          <input
            type="text"
            placeholder="Region name..."
            value={regionName}
            onInput={(e: any) => setRegionName(e.target.value)}
            onKeyDown={handleNameKeyDown}
            autoFocus
            style={{
              background: 'var(--background-primary)',
              color: 'var(--text-normal)',
              border: '1px solid var(--background-modifier-border)',
              borderRadius: '4px',
              padding: '6px 10px',
              fontSize: '14px',
              width: '200px'
            }}
          />
          <button
            onClick={handleConfirmName}
            disabled={!regionName.trim()}
            style={{
              padding: '6px 16px',
              background: regionName.trim() ? 'var(--interactive-accent)' : 'var(--background-modifier-border)',
              color: regionName.trim() ? 'var(--text-on-accent)' : 'var(--text-muted)',
              borderRadius: '6px',
              border: 'none',
              cursor: regionName.trim() ? 'pointer' : 'default',
              fontSize: '13px',
              minHeight: '36px'
            }}
          >
            OK
          </button>
          <button
            onClick={handleCancelName}
            style={{
              padding: '6px 12px',
              background: 'transparent',
              color: 'var(--text-muted)',
              borderRadius: '6px',
              border: '1px solid var(--background-modifier-border)',
              cursor: 'pointer',
              fontSize: '13px',
              minHeight: '36px'
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
};

return { RegionLayer };

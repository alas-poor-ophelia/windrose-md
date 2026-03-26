/**
 * RegionLayer.tsx
 *
 * Interaction layer for hex region creation.
 * Registers handlers with EventHandlerContext and renders
 * a pending-hex selection overlay and "Create Region" button.
 */

import type { ToolId } from '#types/tools/tool.types';
import type { Region } from '#types/core/map.types';
import type { Point } from '#types/core/geometry.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useMapState } = await requireModuleByName("MapContext.tsx");
const { useEventHandlerRegistration } = await requireModuleByName("EventHandlerContext.tsx");
const { useRegionTools } = await requireModuleByName("useRegionTools.ts");

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
    confirmRegion,
    cancelRegion,
    deleteRegion,
    updateRegion,
    startEditingRegion,
    stopEditingRegion
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

  // Register/unregister handlers with event coordinator
  dc.useEffect(() => {
    if (!isRegionTool) {
      unregisterHandlers('region');
      return;
    }

    registerHandlers('region', {
      handlePointerDown,
      handlePointerMove,
      handlePointerUp,
      handleDoubleClick
    });

    return () => unregisterHandlers('region');
  }, [isRegionTool, registerHandlers, unregisterHandlers,
    handlePointerDown, handlePointerMove, handlePointerUp, handleDoubleClick]);

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
      // Renaming an existing region
      updateRegion(editingRegionId, { name: regionName.trim() });
    } else {
      // Creating a new region
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

  // Overlay canvas — appended to mainCanvas.parentElement (same as FreehandLayer)
  const overlayRef = dc.useRef<HTMLCanvasElement | null>(null);

  dc.useEffect(() => {
    const mainCanvas = canvasRef.current;
    if (!mainCanvas || !mainCanvas.parentElement || !isRegionTool) {
      // Cleanup overlay when tool deactivated
      if (overlayRef.current && overlayRef.current.parentElement) {
        overlayRef.current.parentElement.removeChild(overlayRef.current);
        overlayRef.current = null;
      }
      return;
    }

    // Create overlay if needed
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

  // Render pending hexes on the overlay canvas
  dc.useEffect(() => {
    const overlay = overlayRef.current;
    const mainCanvas = canvasRef.current;
    if (!overlay || !mainCanvas || !geometry || geometry.type !== 'hex' || !mapData) return;

    overlay.width = mainCanvas.width;
    overlay.height = mainCanvas.height;

    const ctx = overlay.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, overlay.width, overlay.height);

    // Determine what to draw: pending hexes (new region) OR editing region hexes
    const hexesToHighlight = editingRegion ? editingRegion.hexes : pendingHexes;
    const highlightColor = editingRegion ? editingRegion.color : selectedColor;

    if (hexesToHighlight.length === 0 && boundaryVertices.length === 0) return;

    const hexGeom = geometry as any;
    const viewState = mapData.viewState;
    if (!viewState) return;

    const northDirection = mapData.northDirection || 0;

    // Apply north direction rotation (same as main renderer)
    if (northDirection !== 0) {
      ctx.save();
      ctx.translate(overlay.width / 2, overlay.height / 2);
      ctx.rotate((northDirection * Math.PI) / 180);
      ctx.translate(-overlay.width / 2, -overlay.height / 2);
    }

    // Viewport offset (same formula as hex renderer)
    const offsetX = overlay.width / 2 - viewState.center.x * viewState.zoom;
    const offsetY = overlay.height / 2 - viewState.center.y * viewState.zoom;

    // Draw highlighted hexes (pending or editing)
    if (hexesToHighlight.length > 0) {
      ctx.globalAlpha = editingRegion ? 0.15 : 0.4;
      ctx.fillStyle = highlightColor;

      ctx.beginPath();
      for (const h of hexesToHighlight) {
        const vertices = hexGeom.getHexVertices(h.x, h.y);
        const screenVerts = vertices.map((v: any) =>
          hexGeom.worldToScreen(v.worldX, v.worldY, offsetX, offsetY, viewState.zoom)
        );
        ctx.moveTo(screenVerts[0].screenX, screenVerts[0].screenY);
        for (let i = 1; i < screenVerts.length; i++) {
          ctx.lineTo(screenVerts[i].screenX, screenVerts[i].screenY);
        }
        ctx.closePath();
      }
      ctx.fill();

      // Selection border
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = highlightColor;
      ctx.lineWidth = 2 * viewState.zoom;

      ctx.beginPath();
      for (const h of hexesToHighlight) {
        const vertices = hexGeom.getHexVertices(h.x, h.y);
        const screenVerts = vertices.map((v: any) =>
          hexGeom.worldToScreen(v.worldX, v.worldY, offsetX, offsetY, viewState.zoom)
        );
        ctx.moveTo(screenVerts[0].screenX, screenVerts[0].screenY);
        for (let i = 1; i < screenVerts.length; i++) {
          ctx.lineTo(screenVerts[i].screenX, screenVerts[i].screenY);
        }
        ctx.closePath();
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Draw boundary polygon
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

      // Vertex dots
      ctx.fillStyle = '#ffffff';
      for (const v of boundaryVertices) {
        const s = hexGeom.worldToScreen(v.x, v.y, offsetX, offsetY, viewState.zoom);
        ctx.beginPath();
        ctx.arc(s.screenX, s.screenY, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (northDirection !== 0) {
      ctx.restore();
    }
  }, [pendingHexes, boundaryVertices, canvasRef, geometry, mapData, selectedColor, editingRegion]);

  if (!isRegionTool) return null;

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
          <div style={{
            width: '12px',
            height: '12px',
            borderRadius: '3px',
            background: editingRegion.color,
            flexShrink: 0
          }} />
          <span style={{ color: 'var(--text-normal)', fontSize: '13px', fontWeight: '600' }}>
            {editingRegion.name}
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
            {editingRegion.hexes.length} hex{editingRegion.hexes.length !== 1 ? 'es' : ''}
          </span>
          <span style={{ color: 'var(--text-faint)', fontSize: '11px', margin: '0 4px' }}>|</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
            Click to add/remove hexes
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
      {pendingHexes.length > 0 && !showNameInput && !editingRegionId && (
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

/**
 * RegionLayer.tsx
 *
 * Interaction layer for hex region creation and editing.
 * Registers handlers with EventHandlerContext and renders
 * a pending-hex selection overlay and region management UI.
 */

import type { ToolId } from '#types/tools/tool.types';
import type { VNode } from 'preact';
import type { Region } from '#types/core/map.types';

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useApp } from '../../context/AppContext';
import { useMapState } from '../../context/MapContext';
import { useLayerHandlers } from '../../hooks/canvas/useLayerHandlers';
import { calculateViewportOffset } from '../../geometry/core/BaseGeometry';
import { useRegionTools } from '../../hooks/interactions/useRegionTools';
import type { MenuItem } from 'obsidian';
import { Menu } from 'obsidian';
import { openNativeNoteLinkModal } from '../modals/NoteLinkModal';
import { Icon } from '../shared/Icon';
import type { RegionIdDetail } from '../../core/windroseEvents';










export interface RegionLayerProps {
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
}: RegionLayerProps): VNode | null => {
  const app = useApp();
  const { canvasRef, mapData, geometry, screenToWorld, screenToGrid } = useMapState();

  const isRegionTool = currentTool === 'regionPaint' || currentTool === 'regionBoundary';

  const {
    pendingHexes,
    boundaryVertices,
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

  // Context menu handler is always present; tool handlers resolve to undefined when inactive
  useLayerHandlers('region', {
    handleContextMenu,
    ...(isRegionTool ? { handlePointerDown, handlePointerMove, handlePointerUp, handleDoubleClick } : {})
  });

  // Listen for edit-region events from sidebar panel
  useEffect(() => {
    const handler = (e: CustomEvent<RegionIdDetail>): void => {
      const { regionId } = e.detail;
      if (regionId !== '') {
        startEditingRegion(regionId);
      }
    };
    activeDocument.addEventListener('windrose:edit-region', handler);
    return () => activeDocument.removeEventListener('windrose:edit-region', handler);
  }, [startEditingRegion]);

  // Name input state
  const [showNameInput, setShowNameInput] = useState(false);
  const [regionName, setRegionName] = useState('');

  // Intercept undo when region creation/editing is in progress — cancel instead
  useEffect(() => {
    const handler = (e: Event): void => {
      if (pendingHexes.length > 0 || (editingRegionId != null && editingRegionId !== '') || showNameInput) {
        e.preventDefault();
        cancelRegion();
        setShowNameInput(false);
        setRegionName('');
      }
    };
    activeDocument.addEventListener('windrose:before-undo', handler);
    return () => activeDocument.removeEventListener('windrose:before-undo', handler);
  }, [pendingHexes.length, editingRegionId, showNameInput, cancelRegion]);

  const handleCreateClick = useCallback(() => {
    setShowNameInput(true);
    setRegionName('');
  }, []);

  const handleConfirmName = useCallback(() => {
    if (!regionName.trim()) return;

    if (editingRegionId != null && editingRegionId !== '') {
      updateRegion(editingRegionId, { name: regionName.trim() });
    } else {
      confirmRegion(regionName.trim());
    }
    setShowNameInput(false);
    setRegionName('');
  }, [regionName, confirmRegion, editingRegionId, updateRegion]);

  const handleCancelName = useCallback(() => {
    setShowNameInput(false);
    setRegionName('');
  }, []);

  const handleNameKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirmName();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelName();
    }
  }, [handleConfirmName, handleCancelName]);

  // Color change handler for the inline <input type="color">
  const handleColorChange = useCallback((e: Event) => {
    if (!editingRegion) return;
    const newColor = (e.target as HTMLInputElement).value;
    updateRegion(editingRegion.id, { color: newColor, borderColor: newColor });
  }, [editingRegion, updateRegion]);

  // ── Overlay canvas (same as FreehandLayer pattern) ─────────────────
  const overlayRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const mainCanvas = canvasRef.current;
    if (!mainCanvas || !mainCanvas.parentElement || !isRegionTool) {
      if (overlayRef.current && overlayRef.current.parentElement) {
        overlayRef.current.parentElement.removeChild(overlayRef.current);
        overlayRef.current = null;
      }
      return undefined;
    }

    if (!overlayRef.current) {
      const overlay = activeWindow.createEl('canvas');
      overlay.classList.add('windrose-overlay-layer');
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
  useEffect(() => {
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

    if (geometry.type !== 'hex') return;
    const hexGeom = geometry;
    const viewState = mapData.viewState;
    if (!viewState) return;

    const northDirection = mapData.northDirection ?? 0;

    if (northDirection !== 0) {
      ctx.save();
      ctx.translate(overlay.width / 2, overlay.height / 2);
      ctx.rotate((northDirection * Math.PI) / 180);
      ctx.translate(-overlay.width / 2, -overlay.height / 2);
    }

    const { offsetX, offsetY } = calculateViewportOffset(
      geometry, viewState.center, { width: overlay.width, height: overlay.height }, viewState.zoom
    );

    if (hexesToHighlight.length > 0) {
      const hexPath = new Path2D();
      for (const h of hexesToHighlight) {
        const vertices = hexGeom.getHexVertices(h.x, h.y);
        const sv = vertices.map((v: { worldX: number; worldY: number }) => hexGeom.worldToScreen(v.worldX, v.worldY, offsetX, offsetY, viewState.zoom));
        hexPath.moveTo(sv[0].screenX, sv[0].screenY);
        for (let i = 1; i < sv.length; i++) hexPath.lineTo(sv[i].screenX, sv[i].screenY);
        hexPath.closePath();
      }

      ctx.globalAlpha = editingRegion ? 0.15 : 0.4;
      ctx.fillStyle = highlightColor;
      ctx.fill(hexPath);

      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = highlightColor;
      ctx.lineWidth = 2 * viewState.zoom;
      ctx.stroke(hexPath);
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
  useEffect(() => {
    if (!contextMenu || !mapData?.regions) {
      if (contextMenu) dismissContextMenu();
      return;
    }

    const region = mapData.regions.find(r => r.id === contextMenu.regionId);
    if (!region) { dismissContextMenu(); return; }

    const menu = new Menu();

    menu.addItem((item: MenuItem) => {
      item.setTitle('Edit region');
      item.setIcon('lucide-pencil');
      item.onClick(() => startEditingRegion(region.id));
    });

    menu.addItem((item: MenuItem) => {
      item.setTitle('Rename');
      item.setIcon('lucide-type');
      item.onClick(() => {
        startEditingRegion(region.id);
        setShowNameInput(true);
        setRegionName(region.name);
      });
    });

    menu.addItem((item: MenuItem) => {
      item.setTitle(region.visible ? 'Hide Region' : 'Show Region');
      item.setIcon(region.visible ? 'lucide-eye-off' : 'lucide-eye');
      item.onClick(() => updateRegion(region.id, { visible: !region.visible }));
    });

    if (region.linkedNote != null && region.linkedNote !== '') {
      menu.addItem((item: MenuItem) => {
        item.setTitle('Open linked note');
        item.setIcon('lucide-external-link');
        item.onClick(() => {
          const linkPath = (region.linkedNote ?? '').replace(/\.md$/, '');
          void app.workspace.openLinkText(linkPath, '', false);
        });
      });
    }

    menu.addItem((item: MenuItem) => {
      item.setTitle(region.linkedNote != null && region.linkedNote !== '' ? 'Change linked note' : 'Link note');
      item.setIcon('lucide-link');
      item.onClick(() => {
        openNativeNoteLinkModal(app, {
          onSave: (notePath: string | null) => updateRegion(region.id, { linkedNote: notePath ?? undefined }),
          onClose: () => {},
          currentNotePath: region.linkedNote ?? null,
          objectType: null
        });
      });
    });

    if (region.linkedNote != null && region.linkedNote !== '') {
      menu.addItem((item: MenuItem) => {
        item.setTitle('Remove note link');
        item.setIcon('lucide-unlink');
        item.onClick(() => updateRegion(region.id, { linkedNote: undefined }));
      });
    }

    if (region.labelPosition) {
      menu.addItem((item: MenuItem) => {
        item.setTitle('Reset label position');
        item.setIcon('lucide-undo-2');
        item.onClick(() => updateRegion(region.id, { labelPosition: undefined }));
      });
    }

    menu.addSeparator();

    menu.addItem((item: MenuItem) => {
      item.setTitle('Delete region');
      item.setIcon('lucide-trash-2');
      item.setWarning(true);
      item.onClick(() => deleteRegion(region.id));
    });

    menu.showAtPosition({ x: contextMenu.screenX, y: contextMenu.screenY });
    dismissContextMenu();
  }, [contextMenu, mapData?.regions, app, deleteRegion, dismissContextMenu, startEditingRegion, updateRegion]);

  // ── Long-press touch support for context menu (500ms) ──────────────
  const longPressTimerRef = useRef<number | null>(null);
  const longPressPosRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const handleTouchStart = (e: TouchEvent): void => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      longPressPosRef.current = { x: touch.clientX, y: touch.clientY };

      longPressTimerRef.current = window.setTimeout(() => {
        if (!longPressPosRef.current) return;
        const synth = new MouseEvent('contextmenu', {
          clientX: longPressPosRef.current.x,
          clientY: longPressPosRef.current.y,
          bubbles: true
        });
        const hex = screenToGrid != null ? screenToGrid(longPressPosRef.current.x, longPressPosRef.current.y) : null;
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

    const handleTouchMove = (e: TouchEvent): void => {
      if (longPressPosRef.current && e.touches.length === 1) {
        const touch = e.touches[0];
        const dx = touch.clientX - longPressPosRef.current.x;
        const dy = touch.clientY - longPressPosRef.current.y;
        if (dx * dx + dy * dy > 100) {
          if (longPressTimerRef.current != null) window.clearTimeout(longPressTimerRef.current);
          longPressPosRef.current = null;
        }
      }
    };

    const handleTouchEnd = (): void => {
      if (longPressTimerRef.current != null) {
        window.clearTimeout(longPressTimerRef.current);
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
      if (longPressTimerRef.current != null) window.clearTimeout(longPressTimerRef.current);
    };
  }, [canvasRef, screenToGrid, mapData?.regions, handleContextMenu]);

  // ── JSX ────────────────────────────────────────────────────────────
  return (
    <div className="windrose-region-ui" style={{ position: 'relative' }}>
      {/* Editing existing region bar */}
      {editingRegion && pendingHexes.length === 0 && !showNameInput && (
        <div className="windrose-floating-bar">
          <input
            type="color"
            value={editingRegion.color}
            onInput={handleColorChange}
            title="Change region color"
            className="windrose-color-swatch-btn"
          />
          <span className="windrose-floating-bar-name">
            {editingRegion.name}
          </span>
          <span className="windrose-floating-bar-label">
            {editingRegion.hexes.length} hex{editingRegion.hexes.length !== 1 ? 'es' : ''}
          </span>
          <span className="windrose-floating-bar-separator">|</span>
          <span className="windrose-floating-bar-label">
            Click hexes to add/remove
          </span>
          <button
            onClick={() => {
              const region = editingRegion;
              openNativeNoteLinkModal(app, {
                onSave: (notePath: string | null) => {
                  updateRegion(region.id, { linkedNote: notePath ?? undefined });
                },
                onClose: () => {},
                currentNotePath: region.linkedNote ?? null,
                objectType: null
              });
            }}
            title={editingRegion.linkedNote != null && editingRegion.linkedNote !== '' ? 'Change linked note' : 'Link note'}
            className={`windrose-floating-bar-btn${editingRegion.linkedNote != null && editingRegion.linkedNote !== '' ? ' is-accent' : ''}`}
            style={{ display: 'flex', alignItems: 'center' }}
          >
            <Icon icon={editingRegion.linkedNote != null && editingRegion.linkedNote !== '' ? 'lucide-file-check' : 'lucide-link'} />
          </button>
          <button
            onClick={() => {
              setShowNameInput(true);
              setRegionName(editingRegion.name);
            }}
            className="windrose-floating-bar-btn is-accent"
          >
            Rename
          </button>
          <button
            onClick={() => deleteRegion(editingRegion.id)}
            className="windrose-floating-bar-btn is-danger"
          >
            Delete
          </button>
          <button
            onClick={stopEditingRegion}
            className="windrose-floating-bar-btn"
          >
            Done
          </button>
        </div>
      )}

      {/* Create Region bar */}
      {isRegionTool && pendingHexes.length > 0 && !showNameInput && (editingRegionId == null || editingRegionId === '') && (
        <div className="windrose-floating-bar">
          <span className="windrose-floating-bar-label" style={{ marginRight: '4px' }}>
            {pendingHexes.length} hex{pendingHexes.length !== 1 ? 'es' : ''}
          </span>
          <button
            onClick={handleCreateClick}
            className="windrose-floating-bar-btn is-active"
            style={{ fontWeight: '600' }}
          >
            Create Region
          </button>
          <button
            onClick={cancelRegion}
            className="windrose-floating-bar-btn"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Name input */}
      {showNameInput && (
        <div className="windrose-floating-bar">
          <input
            type="text"
            placeholder="Region name..."
            value={regionName}
            onInput={(e: Event) => setRegionName((e.target as HTMLInputElement).value)}
            onKeyDown={handleNameKeyDown}
            ref={(el: HTMLInputElement | null) => { if (el) window.setTimeout(() => el.focus(), 0); }}
            className="windrose-floating-bar-input"
            style={{ width: '200px', padding: '6px 10px', fontSize: '14px' }}
          />
          <button
            onClick={handleConfirmName}
            disabled={!regionName.trim()}
            className={`windrose-floating-bar-btn${regionName.trim() ? ' is-active' : ''}`}
            style={{ cursor: regionName.trim() ? 'pointer' : 'default' }}
          >
            OK
          </button>
          <button
            onClick={handleCancelName}
            className="windrose-floating-bar-btn"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
};

export { RegionLayer };
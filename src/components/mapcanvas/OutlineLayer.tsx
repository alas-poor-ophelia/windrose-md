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
import type { VNode } from 'preact';
import type { Outline } from '#types/core/map.types';

import { useCallback, useEffect, useRef } from 'preact/hooks';
import { useMapState } from '../../context/MapContext';
import { useEventHandlerRegistration } from '../../context/EventHandlerContext';
import { useOutlineTools } from '../../hooks/interactions/useOutlineTools';
import type { MenuItem } from 'obsidian';
import { Modal, Menu } from 'obsidian';
import { useApp } from '../../context/AppContext';






export interface OutlineLayerProps {
  currentTool: ToolId;
  selectedColor: string;
  onColorChange: (color: string) => void;
  onOutlinesChange: (outlines: Outline[]) => void;
}

const OutlineLayer = ({
  currentTool,
  selectedColor,
  onColorChange,
  onOutlinesChange
}: OutlineLayerProps): VNode | null => {
  const app = useApp();
  const { canvasRef, mapData, geometry, screenToWorld } = useMapState();
  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();

  const isOutlineTool = currentTool === 'outline';

  const {
    drawingVertices,
    selectedOutlineId,
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

  const showClearAllConfirm = useCallback((count: number) => {
    const modal = new Modal(app);
    modal.titleEl.setText('Clear all outlines');

    const content = modal.contentEl;
    content.createEl('p', {
      text: `This will permanently delete ${count} outline${count !== 1 ? 's' : ''}. This cannot be undone.`
    });

    const buttonRow = content.createDiv({ cls: 'modal-button-container' });

    const cancelBtn = buttonRow.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => modal.close());

    const deleteBtn = buttonRow.createEl('button', {
      text: 'Delete all',
      cls: 'mod-warning'
    });
    deleteBtn.addEventListener('click', () => {
      modal.close();
      onOutlinesChange([]);
    });

    modal.open();
  }, [app, onOutlinesChange]);

  // Register handlers via Proxy pattern
  const outlineHandlersRef = useRef<Record<string, unknown> | null>(null);
  outlineHandlersRef.current = isOutlineTool
    ? { handlePointerDown, handlePointerMove, handlePointerUp, handleDoubleClick }
    : {};

  useEffect(() => {
    const proxy = new Proxy({} as Record<string, unknown>, {
      get(_target, prop: string) {
        return outlineHandlersRef.current?.[prop];
      }
    });
    registerHandlers('outline', proxy);
    return () => unregisterHandlers('outline');
  }, []);

  // ESC to cancel drawing, Delete/Backspace to delete selected
  useEffect(() => {
    if (!isOutlineTool) return undefined;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelDrawing();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedOutlineId != null && selectedOutlineId !== '') {
        e.preventDefault();
        deleteOutline(selectedOutlineId);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOutlineTool, cancelDrawing, selectedOutlineId, deleteOutline]);

  // Context menu via windrose:hex-context-menu
  useEffect(() => {
    if (!isOutlineTool) return undefined;

    const handler = (e: CustomEvent): void => {
      const { screenX, screenY } = e.detail;
      if (!mapData?.outlines) return;

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
          const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((world.worldX - a.x) * dx + (world.worldY - a.y) * dy) / lenSq));
          const dist = Math.sqrt((world.worldX - (a.x + t * dx)) ** 2 + (world.worldY - (a.y + t * dy)) ** 2);
          if (dist < (geometry?.cellSize ?? 30) * 0.5) {
            hitOutline = outline;
            break;
          }
        }
        if (hitOutline) break;
      }

      if (!hitOutline) return;

      const menu = new Menu();
      const outlineRef = hitOutline;

      menu.addItem((item: MenuItem) => {
        item.setTitle(outlineRef.visible ? 'Hide Outline' : 'Show Outline');
        item.setIcon(outlineRef.visible ? 'lucide-eye-off' : 'lucide-eye');
        item.onClick(() => updateOutline(outlineRef.id, { visible: !outlineRef.visible }));
      });

      menu.addItem((item: MenuItem) => {
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

      menu.addItem((item: MenuItem) => {
        item.setTitle('Delete outline');
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
  const overlayRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const mainCanvas = canvasRef.current;
    if (!mainCanvas || !mainCanvas.parentElement || !isOutlineTool) {
      if (overlayRef.current && overlayRef.current.parentElement) {
        overlayRef.current.parentElement.removeChild(overlayRef.current);
        overlayRef.current = null;
      }
      return undefined;
    }

    if (!overlayRef.current) {
      const overlay = document.createElement('canvas');
      overlay.style.position = 'absolute';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.pointerEvents = 'none';
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
  }, [canvasRef, isOutlineTool]);

  // Render drawing vertices and selected outline vertices on overlay
  useEffect(() => {
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
    const hexGeom = geometry;

    const northDirection = mapData.northDirection ?? 0;
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

      ctx.fillStyle = selectedColor;
      for (const sv of screenVerts) {
        ctx.beginPath();
        ctx.arc(sv.screenX, sv.screenY, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw vertex handles for selected outline
    if (selectedOutlineId != null && selectedOutlineId !== '' && mapData.outlines) {
      const outline = mapData.outlines.find(o => o.id === selectedOutlineId);
      if (outline && outline.vertices.length >= 3) {
        const screenVerts = outline.vertices.map(v =>
          hexGeom.worldToScreen(v.x, v.y, offsetX, offsetY, viewState.zoom)
        );

        const handleRadius = Math.max(outline.lineWidth * 1.2, 3);
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

  const btnClass = (active?: boolean): string =>
    `windrose-floating-bar-btn${active === true ? ' is-active' : ''}`;

  // ── JSX ────────────────────────────────────────────────────────────
  return (
    <div className="windrose-outline-ui" style={{ position: 'relative' }}>
      {/* Drawing mode: vertex count */}
      {isOutlineTool && drawingVertices.length > 0 && (
        <div className="windrose-floating-bar">
          <span className="windrose-floating-bar-label">
            {drawingVertices.length} vertices — double-click to close
          </span>
          <button onClick={cancelDrawing} className="windrose-floating-bar-btn">
            Cancel
          </button>
        </div>
      )}

      {/* Config toolbar: shown when tool is active and not drawing */}
      {isOutlineTool && drawingVertices.length === 0 && (selectedOutlineId == null || selectedOutlineId === '') && (
        <div className="windrose-floating-bar">
          {/* Line style */}
          <select
            value={outlineSettings.lineStyle}
            onChange={(e: Event) => setOutlineSettings({ lineStyle: (e.target as HTMLSelectElement).value as 'solid' | 'dashed' | 'dotted' })}
            className="windrose-floating-bar-input"
          >
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="dotted">Dotted</option>
          </select>

          {/* Color */}
          <input
            type="color"
            value={selectedColor}
            onInput={(e: Event) => onColorChange((e.target as HTMLInputElement).value)}
            title="Outline color"
            className="windrose-color-swatch-btn"
          />

          {/* Fill toggle */}
          <button
            onClick={() => setOutlineSettings({ filled: !outlineSettings.filled })}
            title={outlineSettings.filled ? 'Filled' : 'Stroke only'}
            className={btnClass(outlineSettings.filled)}
          >
            {outlineSettings.filled ? 'Filled' : 'No Fill'}
          </button>

          {outlineSettings.filled && (
            <input
              type="range"
              min="0.05" max="1" step="0.05"
              value={outlineSettings.fillOpacity}
              onInput={(e: Event) => setOutlineSettings({ fillOpacity: parseFloat((e.target as HTMLInputElement).value) })}
              title={`Fill opacity: ${Math.round(outlineSettings.fillOpacity * 100)}%`}
              style={{ width: '60px', minHeight: '28px' }}
            />
          )}

          {/* Snap mode */}
          <button
            onClick={() => setOutlineSettings({ snapMode: outlineSettings.snapMode === 'straight' ? 'hex' : 'straight' })}
            title={outlineSettings.snapMode === 'straight' ? 'Straight lines' : 'Snap to hex edges'}
            className={btnClass(outlineSettings.snapMode === 'hex')}
          >
            {outlineSettings.snapMode === 'straight' ? 'Straight' : 'Hex Snap'}
          </button>

          <span className="windrose-floating-bar-label-faint">
            Click to place vertices
          </span>

          {mapData?.outlines && mapData.outlines.length > 0 && (
            <>
              <span className="windrose-floating-bar-separator">|</span>
              <button
                onClick={() => showClearAllConfirm((mapData.outlines ?? []).length)}
                className="windrose-floating-bar-btn is-danger"
                title="Delete all outlines"
              >
                Clear All ({mapData.outlines.length})
              </button>
            </>
          )}
        </div>
      )}

      {/* Selected outline toolbar */}
      {isOutlineTool && selectedOutlineId != null && selectedOutlineId !== '' && mapData?.outlines && (() => {
        const outline = mapData.outlines.find(o => o.id === selectedOutlineId);
        if (!outline) return null;
        return (
          <div className="windrose-floating-bar">
            {/* Line style */}
            <select
              value={outline.lineStyle}
              onChange={(e: Event) => updateOutline(outline.id, { lineStyle: (e.target as HTMLSelectElement).value as 'solid' | 'dashed' | 'dotted' })}
              className="windrose-floating-bar-input"
            >
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
            </select>

            {/* Color */}
            <input
              type="color"
              value={outline.color}
              onInput={(e: Event) => updateOutline(outline.id, { color: (e.target as HTMLInputElement).value })}
              title="Outline color"
              className="windrose-color-swatch-btn"
            />

            {/* Fill toggle */}
            <button
              onClick={() => updateOutline(outline.id, { filled: !outline.filled })}
              title={outline.filled ? 'Filled' : 'Stroke only'}
              className={btnClass(outline.filled)}
            >
              {outline.filled ? 'Filled' : 'No Fill'}
            </button>

            {outline.filled && (
              <input
                type="range"
                min="0.05" max="1" step="0.05"
                value={outline.fillOpacity}
                onInput={(e: Event) => updateOutline(outline.id, { fillOpacity: parseFloat((e.target as HTMLInputElement).value) })}
                title={`Fill opacity: ${Math.round(outline.fillOpacity * 100)}%`}
                style={{ width: '60px', minHeight: '28px' }}
              />
            )}

            {/* Snap mode */}
            <button
              onClick={() => updateOutline(outline.id, { snapMode: outline.snapMode === 'straight' ? 'hex' : 'straight' })}
              title={outline.snapMode === 'straight' ? 'Straight lines' : 'Snap to hex edges'}
              className={btnClass(outline.snapMode === 'hex')}
            >
              {outline.snapMode === 'straight' ? 'Straight' : 'Hex Snap'}
            </button>

            <span className="windrose-floating-bar-separator">|</span>

            <button onClick={() => deleteOutline(outline.id)} className="windrose-floating-bar-btn is-danger">
              Delete
            </button>
            <button onClick={deselectOutline} className="windrose-floating-bar-btn">
              Done
            </button>
          </div>
        );
      })()}
    </div>
  );
};

export { OutlineLayer };
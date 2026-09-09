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
import type { Outline, StoredViewState } from '#types/core/map.types';

import { useCallback, useEffect, useMemo, useRef } from 'preact/hooks';
import { useMapState } from '../../context/MapContext';
import { useLayerHandlers } from '../../hooks/canvas/useLayerHandlers';
import { useLiveOverlayRedraw } from '../../hooks/canvas/useLiveOverlayRedraw';
import { calculateViewportOffset } from '../../geometry/core/BaseGeometry';
import { useOutlineTools } from '../../hooks/interactions/useOutlineTools';
import type { MenuItem } from 'obsidian';
import { Modal, Menu } from 'obsidian';
import { useApp } from '../../context/AppContext';
import type { HexContextMenuDetail } from '../../core/windroseEvents';
import { isForeignInstanceEvent } from '../../core/windroseEvents';
import { tooltipRef } from '../shared/obsidianTooltip';






export interface OutlineLayerProps {
  currentTool: ToolId;
  selectedColor: string;
  onColorChange: (color: string) => void;
  onOutlinesChange: (outlines: Outline[]) => void;
}

interface LiveInputCommit {
  /** `onInput` handler — records the live value, touches no shared state. */
  handleInput: (e: Event) => void;
  /** Ref callback — capture the element and protect an in-flight drag. */
  attachRef: (el: HTMLInputElement | null) => void;
  /** Live value while a drag is in flight, null otherwise. */
  pendingRef: { current: string | null };
}

/**
 * Keeps a continuously-firing <input> off the per-move commit path.
 *
 * `input` fires on every pointer move — for the native colour dialog's
 * hue/saturation square that is hundreds of events per second, and a range
 * slider is no better. Routing each one into updateOutline() replaced the
 * whole mapData object (rebroadcast to every layer) AND pushed a full
 * active-layer snapshot onto the undo stack, which addToHistory dedupes with
 * two JSON.stringify passes over that snapshot. One drag therefore cost
 * hundreds of whole-layer serialisations and buried the user's real undo
 * history under itself.
 *
 * A drag now only records its live value in a ref — optionally repainting the
 * overlay once per animation frame, the useLiveOverlayRedraw gate, so canvas
 * feedback still tracks it — and commits exactly once, on the native `change`
 * event. That event carries the authoritative final value, so no last sample
 * is dropped, and an unchanged value commits nothing. Clicking is unchanged.
 *
 * Two DOM details this leans on:
 * - The commit MUST be a native listener. preact/compat is in this bundle and
 *   its global vnode hook rewrites an `onChange` prop on any non-checkbox
 *   <input> — colour and range included — to `oninput`, which would put the
 *   commit straight back on the per-move path this exists to remove.
 * - Preact force-syncs the `value` prop onto the DOM node whenever it differs
 *   from the live DOM value, so a re-render from anywhere else mid-drag would
 *   snap the control back to the last committed value. Refs are applied after
 *   props are diffed, so restoring the in-flight value there undoes that.
 */
function useLiveInputCommit(
  commit: (value: string) => void,
  onPreviewFrame?: () => void
): LiveInputCommit {
  const elementRef = useRef<HTMLInputElement | null>(null);
  const pendingRef = useRef<string | null>(null);
  const frameRef = useRef<number | null>(null);
  const commitRef = useRef(commit);
  const previewRef = useRef(onPreviewFrame);

  commitRef.current = commit;
  previewRef.current = onPreviewFrame;

  const handleInput = useCallback((e: Event) => {
    pendingRef.current = (e.target as HTMLInputElement).value;
    if (previewRef.current == null || frameRef.current != null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      previewRef.current?.();
    });
  }, []);

  const attachRef = useCallback((el: HTMLInputElement | null) => {
    // Composed ref callbacks are re-invoked with null on every render (see
    // tooltipRef); only a real element is worth recording.
    if (el == null) return;
    elementRef.current = el;
    if (pendingRef.current != null) el.value = pendingRef.current;
  }, []);

  useEffect((): (() => void) | undefined => {
    const el = elementRef.current;
    if (!el) return undefined;

    const handleCommit = (): void => {
      if (frameRef.current != null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      const value = el.value;
      pendingRef.current = null;
      // Repaint from committed data — the last preview frame would otherwise
      // stay on the overlay when the value comes back unchanged.
      previewRef.current?.();
      commitRef.current(value);
    };

    el.addEventListener('change', handleCommit);
    el.addEventListener('blur', handleCommit);
    return () => {
      el.removeEventListener('change', handleCommit);
      el.removeEventListener('blur', handleCommit);
    };
  });

  // Stable identity: this object is a dependency of the overlay draw callback,
  // and a fresh one per render would make that callback (and the effect that
  // repaints from it) churn on every render.
  return useMemo(
    () => ({ handleInput, attachRef, pendingRef }),
    [handleInput, attachRef]
  );
}

const OutlineLayer = ({
  currentTool,
  selectedColor,
  onColorChange,
  onOutlinesChange
}: OutlineLayerProps): VNode | null => {
  const app = useApp();
  const { canvasRef, mapData, geometry, screenToWorld, instanceId, viewController } = useMapState();

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

  useLayerHandlers('outline', isOutlineTool
    ? { handlePointerDown, handlePointerMove, handlePointerUp, handleDoubleClick }
    : {});

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
    activeDocument.addEventListener('keydown', handler);
    return () => activeDocument.removeEventListener('keydown', handler);
  }, [isOutlineTool, cancelDrawing, selectedOutlineId, deleteOutline]);

  // Context menu via windrose:hex-context-menu
  useEffect(() => {
    if (!isOutlineTool) return undefined;

    const handler = (e: CustomEvent<HexContextMenuDetail>): void => {
      if (isForeignInstanceEvent(e.detail, instanceId)) return;
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
            order: (mapData.outlines ?? []).length
          };
          onOutlinesChange([...(mapData.outlines ?? []), dup]);
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

    activeDocument.addEventListener('windrose:hex-context-menu', handler);
    return () => activeDocument.removeEventListener('windrose:hex-context-menu', handler);
  }, [isOutlineTool, mapData?.outlines, geometry, screenToWorld, deleteOutline, updateOutline, onOutlinesChange, instanceId]);

  // ── Live-drag inputs (colour dialog, fill-opacity sliders) ────────
  // See useLiveInputCommit: each of these fires `input` on every pointer move
  // and used to commit — with a history push — on every one of them.
  const selectedOutline = mapData?.outlines?.find(o => o.id === selectedOutlineId) ?? null;

  const repaintOverlayRef = useRef<() => void>(() => undefined);
  const repaintOverlayFrame = useCallback(() => { repaintOverlayRef.current(); }, []);

  const commitOutlineColor = useCallback((value: string) => {
    if (!selectedOutline || value === '' || value === selectedOutline.color) return;
    updateOutline(selectedOutline.id, { color: value });
  }, [selectedOutline, updateOutline]);

  const commitOutlineFillOpacity = useCallback((value: string) => {
    const parsed = parseFloat(value);
    if (!selectedOutline || Number.isNaN(parsed) || parsed === selectedOutline.fillOpacity) return;
    updateOutline(selectedOutline.id, { fillOpacity: parsed });
  }, [selectedOutline, updateOutline]);

  const commitSettingsFillOpacity = useCallback((value: string) => {
    const parsed = parseFloat(value);
    if (Number.isNaN(parsed) || parsed === outlineSettings.fillOpacity) return;
    setOutlineSettings({ fillOpacity: parsed });
  }, [outlineSettings.fillOpacity, setOutlineSettings]);

  // Only the colour drag has anything to preview per frame: the overlay draws
  // the selected outline's vertex handles stroked in its colour.
  const outlineColorDrag = useLiveInputCommit(commitOutlineColor, repaintOverlayFrame);
  const outlineFillOpacityDrag = useLiveInputCommit(commitOutlineFillOpacity);
  const settingsFillOpacityDrag = useLiveInputCommit(commitSettingsFillOpacity);

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
  }, [canvasRef, isOutlineTool]);

  // Render drawing vertices and selected outline vertices on overlay.
  // View basis is a parameter so the live-pan subscription below can
  // redraw mid-gesture (same fix as RegionLayer/FreehandLayer).
  const drawOutlineOverlay = useCallback((viewState: StoredViewState) => {
    const overlay = overlayRef.current;
    const mainCanvas = canvasRef.current;
    if (!overlay || !mainCanvas || !geometry || geometry.type !== 'hex' || !mapData) return;

    overlay.width = mainCanvas.width;
    overlay.height = mainCanvas.height;

    const ctx = overlay.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const { offsetX, offsetY } = calculateViewportOffset(
      geometry, viewState.center, { width: overlay.width, height: overlay.height }, viewState.zoom
    );
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
        ctx.strokeStyle = outlineColorDrag.pendingRef.current ?? outline.color;
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
  }, [drawingVertices, selectedOutlineId, canvasRef, geometry, mapData, selectedColor, outlineSettings, outlineColorDrag]);

  const repaintOverlay = useCallback(() => {
    const vs = viewController?.getLive() ?? mapData?.viewState;
    if (vs) drawOutlineOverlay(vs);
  }, [drawOutlineOverlay, viewController, mapData?.viewState]);

  // Colour-drag frames repaint through this ref, so a drag never has to
  // re-render the component to get the preview colour onto the overlay.
  repaintOverlayRef.current = repaintOverlay;

  useEffect(() => {
    repaintOverlay();
  }, [repaintOverlay]);

  useLiveOverlayRedraw(viewController, drawOutlineOverlay);

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
            ref={tooltipRef('Outline color')}
            className="windrose-color-swatch-btn"
          />

          {/* Fill toggle */}
          <button
            onClick={() => setOutlineSettings({ filled: !outlineSettings.filled })}
            ref={tooltipRef(outlineSettings.filled ? 'Filled' : 'Stroke only')}
            className={btnClass(outlineSettings.filled)}
          >
            {outlineSettings.filled ? 'Filled' : 'No Fill'}
          </button>

          {outlineSettings.filled && (
            <input
              type="range"
              min="0.05" max="1" step="0.05"
              value={outlineSettings.fillOpacity}
              onInput={settingsFillOpacityDrag.handleInput}
              ref={(el: HTMLInputElement | null) => {
                settingsFillOpacityDrag.attachRef(el);
                tooltipRef(`Fill opacity: ${Math.round(outlineSettings.fillOpacity * 100)}%`)(el);
              }}
              style={{ width: '60px', minHeight: '28px' }}
            />
          )}

          {/* Snap mode */}
          <button
            onClick={() => setOutlineSettings({ snapMode: outlineSettings.snapMode === 'straight' ? 'hex' : 'straight' })}
            ref={tooltipRef(outlineSettings.snapMode === 'straight' ? 'Straight lines' : 'Snap to hex edges')}
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
                ref={tooltipRef('Delete all outlines')}
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
              onInput={outlineColorDrag.handleInput}
              ref={(el: HTMLInputElement | null) => {
                outlineColorDrag.attachRef(el);
                tooltipRef('Outline color')(el);
              }}
              className="windrose-color-swatch-btn"
            />

            {/* Fill toggle */}
            <button
              onClick={() => updateOutline(outline.id, { filled: !outline.filled })}
              ref={tooltipRef(outline.filled ? 'Filled' : 'Stroke only')}
              className={btnClass(outline.filled)}
            >
              {outline.filled ? 'Filled' : 'No Fill'}
            </button>

            {outline.filled && (
              <input
                type="range"
                min="0.05" max="1" step="0.05"
                value={outline.fillOpacity}
                onInput={outlineFillOpacityDrag.handleInput}
                ref={(el: HTMLInputElement | null) => {
                  outlineFillOpacityDrag.attachRef(el);
                  tooltipRef(`Fill opacity: ${Math.round(outline.fillOpacity * 100)}%`)(el);
                }}
                style={{ width: '60px', minHeight: '28px' }}
              />
            )}

            {/* Snap mode */}
            <button
              onClick={() => updateOutline(outline.id, { snapMode: outline.snapMode === 'straight' ? 'hex' : 'straight' })}
              ref={tooltipRef(outline.snapMode === 'straight' ? 'Straight lines' : 'Snap to hex edges')}
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
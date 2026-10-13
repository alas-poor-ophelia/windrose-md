/**
 * RegionLayer.tsx
 *
 * Interaction layer for hex region creation and editing.
 * Registers handlers with EventHandlerContext and renders
 * a pending-hex selection overlay and region management UI.
 */

import type { ToolId } from '#types/tools/tool.types';
import type { VNode } from 'preact';
import type { Region, StoredViewState } from '#types/core/map.types';

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useApp } from '../../context/AppContext';
import { useMapState } from '../../context/MapContext';
import { useLayerHandlers } from '../../hooks/canvas/useLayerHandlers';
import { useLiveOverlayRedraw } from '../../hooks/canvas/useLiveOverlayRedraw';
import { useOverlayCanvas } from '../../hooks/canvas/useOverlayCanvas';
import { calculateViewportOffset } from '../../geometry/core/BaseGeometry';
import { useRegionTools } from '../../hooks/interactions/useRegionTools';
import type { MenuItem } from 'obsidian';
import { Menu } from 'obsidian';
import { openNativeNoteLinkModal } from '../modals/NoteLinkModal';
import { Icon } from '../shared/Icon';
import type { InstanceScopedDetail, RegionIdDetail } from '../../core/windroseEvents';
import { isForeignInstanceEvent } from '../../core/windroseEvents';
import { tooltipRef } from '../shared/obsidianTooltip';










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
  const { canvasRef, mapData, geometry, screenToWorld, screenToGrid, instanceId, viewController } = useMapState();

  const isRegionTool = currentTool === 'regionPaint' || currentTool === 'regionBoundary';

  const {
    pendingHexes,
    boundaryVertices,
    editingRegionId,
    editingRegion,
    handlePointerDown,
    handlePointerMove,
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
    ...(isRegionTool ? { handlePointerDown, handlePointerMove, handleDoubleClick } : {})
  });

  // Listen for edit-region events from sidebar panel
  useEffect(() => {
    const handler = (e: CustomEvent<RegionIdDetail>): void => {
      if (isForeignInstanceEvent(e.detail, instanceId)) return;
      const { regionId } = e.detail;
      if (regionId !== '') {
        startEditingRegion(regionId);
      }
    };
    activeDocument.addEventListener('windrose:edit-region', handler);
    return () => activeDocument.removeEventListener('windrose:edit-region', handler);
  }, [startEditingRegion, instanceId]);

  // Name input state
  const [showNameInput, setShowNameInput] = useState(false);
  const [regionName, setRegionName] = useState('');

  // Intercept undo when region creation/editing is in progress — cancel instead
  useEffect(() => {
    const handler = (e: CustomEvent<InstanceScopedDetail | null>): void => {
      // Ctrl+Z in another co-mounted map must not cancel THIS map's
      // in-progress region draw (before-undo is cancelable — a foreign
      // handler claiming it would also swallow that map's undo).
      if (isForeignInstanceEvent(e.detail, instanceId)) return;
      if (pendingHexes.length > 0 || (editingRegionId != null && editingRegionId !== '') || showNameInput) {
        e.preventDefault();
        cancelRegion();
        setShowNameInput(false);
        setRegionName('');
      }
    };
    activeDocument.addEventListener('windrose:before-undo', handler);
    return () => activeDocument.removeEventListener('windrose:before-undo', handler);
  }, [pendingHexes.length, editingRegionId, showNameInput, cancelRegion, instanceId]);

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

  // ── Region colour drag (inline <input type="color">) ───────────────
  // The native colour dialog fires `input` on every pointer move inside its
  // hue/saturation square — hundreds per second on a high-poll mouse. Routing
  // each one straight to updateRegion() replaced the entire mapData object
  // (broadcast to every layer) AND pushed a full active-layer snapshot onto
  // the undo stack per move (addToHistory's dedupe, now the reference-based
  // isSameHistoryState, cannot collapse a changing colour). One drag therefore
  // cost hundreds of whole-map rebroadcasts and buried the user's real undo
  // history under itself.
  //
  // The drag now repaints the overlay from a preview colour held in a REF,
  // coalesced to one repaint per animation frame (the useLiveOverlayRedraw
  // gate), and commits to map data exactly once — when the dialog commits the
  // value. Holding the preview outside Preact state matters twice over: no
  // layer re-renders mid-drag, and Preact never re-syncs a stale `value` back
  // into the input that the open dialog is driving. Clicking is unchanged —
  // `change` fires there too and commits the exact final value.
  const previewColorRef = useRef<string | null>(null);
  const previewFrameRef = useRef<number | null>(null);
  const repaintOverlayRef = useRef<() => void>(() => undefined);

  const cancelPreviewFrame = useCallback(() => {
    if (previewFrameRef.current != null) {
      window.cancelAnimationFrame(previewFrameRef.current);
      previewFrameRef.current = null;
    }
  }, []);

  const handleColorInput = useCallback((e: Event) => {
    previewColorRef.current = (e.target as HTMLInputElement).value;
    if (previewFrameRef.current != null) return;
    previewFrameRef.current = window.requestAnimationFrame(() => {
      previewFrameRef.current = null;
      repaintOverlayRef.current();
    });
  }, []);

  const commitColor = useCallback((finalColor: string) => {
    cancelPreviewFrame();
    previewColorRef.current = null;
    // Repaint once from committed data — the last preview frame is otherwise
    // left on the overlay when the colour comes back unchanged (no re-render).
    repaintOverlayRef.current();
    if (!editingRegion || finalColor === '' || finalColor === editingRegion.color) return;
    updateRegion(editingRegion.id, { color: finalColor, borderColor: finalColor });
  }, [editingRegion, updateRegion, cancelPreviewFrame]);

  // The commit MUST hang off a native `change` listener: preact/compat is in
  // this bundle, and its global vnode hook rewrites an `onChange` prop on a
  // non-checkbox <input> to `oninput` — which would put the commit straight
  // back on the per-move path this fix exists to remove. (ColorPicker.tsx does
  // the same thing for the same reason.) `blur` is a backstop for a dialog
  // dismissed without committing; commitColor is a no-op when nothing changed.
  const colorInputRef = useRef<HTMLInputElement | null>(null);
  const commitColorRef = useRef(commitColor);
  commitColorRef.current = commitColor;

  useEffect((): (() => void) | undefined => {
    const input = colorInputRef.current;
    if (!input || !editingRegion) return undefined;

    const handleCommit = (): void => commitColorRef.current(input.value);

    input.addEventListener('change', handleCommit);
    input.addEventListener('blur', handleCommit);
    return () => {
      input.removeEventListener('change', handleCommit);
      input.removeEventListener('blur', handleCommit);
    };
  });

  // Abandon an uncommitted preview when the edit target changes or goes away.
  useEffect(() => {
    previewColorRef.current = null;
    return cancelPreviewFrame;
  }, [editingRegionId, cancelPreviewFrame]);

  // ── Overlay canvas (same as FreehandLayer pattern) ─────────────────
  // Present while the tool is active; resizing clears it, so repaint.
  const { sized: sizedOverlay } = useOverlayCanvas(canvasRef, {
    active: isRegionTool,
    onResize: () => { repaintOverlayRef.current(); },
  });

  // Render pending/editing hexes on the overlay. The view basis is a
  // PARAMETER: during a pan/zoom gesture the ViewController's live state
  // updates without touching React (mapData.viewState only changes at
  // commit), so the live subscription below re-runs this with getLive()
  // and the overlay tracks the gesture instead of freezing until release.
  const drawRegionOverlay = useCallback((viewState: StoredViewState) => {
    if (!geometry || geometry.type !== 'hex' || !mapData) return;
    // Only resizes when the size changed: assigning width/height resets the
    // context and can reallocate the backing store on every live frame (MEM-18).
    const overlay = sizedOverlay();
    if (!overlay) return;

    const ctx = overlay.getContext('2d');
    if (!ctx) return;
    // The size assignment no longer resets context state, so do it explicitly.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const hexesToHighlight = editingRegion ? editingRegion.hexes : pendingHexes;
    const highlightColor = editingRegion ? (previewColorRef.current ?? editingRegion.color) : selectedColor;

    if (hexesToHighlight.length === 0 && boundaryVertices.length === 0) return;

    if (geometry.type !== 'hex') return;
    const hexGeom = geometry;

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
  }, [pendingHexes, boundaryVertices, sizedOverlay, geometry, mapData, selectedColor, editingRegion]);

  const repaintOverlay = useCallback(() => {
    const vs = viewController?.getLive() ?? mapData?.viewState;
    if (vs) drawRegionOverlay(vs);
  }, [drawRegionOverlay, viewController, mapData?.viewState]);

  // Colour-drag frames repaint through this ref, so a drag never has to
  // re-render the component to get the preview colour onto the overlay.
  repaintOverlayRef.current = repaintOverlay;

  useEffect(() => {
    repaintOverlay();
  }, [repaintOverlay]);

  useLiveOverlayRedraw(viewController, drawRegionOverlay);

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

  // Touch long-press needs no timer here: the event coordinator's long-press
  // synthesizes a contextmenu that reaches the same handlers as a right-click
  // (the hex menu carries the region items; non-hex maps fall back to the
  // 'region' handleContextMenu registered above).

  // ── JSX ────────────────────────────────────────────────────────────
  return (
    <div className="windrose-region-ui" style={{ position: 'relative' }}>
      {/* Editing existing region bar */}
      {editingRegion && pendingHexes.length === 0 && !showNameInput && (
        <div className="windrose-floating-bar">
          <input
            type="color"
            value={editingRegion.color}
            onInput={handleColorInput}
            ref={(el: HTMLInputElement | null) => {
              if (el != null) {
                colorInputRef.current = el;
                // Preact force-syncs the value prop onto the DOM on any re-render;
                // restore the in-flight drag value so an open dialog never snaps back.
                if (previewColorRef.current != null) el.value = previewColorRef.current;
              }
              tooltipRef('Change region color')(el);
            }}
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
            ref={tooltipRef(editingRegion.linkedNote != null && editingRegion.linkedNote !== '' ? 'Change linked note' : 'Link note')}
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
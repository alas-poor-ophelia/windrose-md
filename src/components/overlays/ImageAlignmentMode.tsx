




/**
 * Image Alignment Mode - Interactive image positioning control panel
 * 
 * Renders a draggable floating panel that allows users to adjust background image
 * offset in real-time without closing the settings modal.
 * 
 * Features:
 * - Drag image directly on canvas
 * - Arrow keys for 1px nudges
 * - Shift+Arrow for 10px jumps
 * - Live offset display
 * - Apply/Reset/Cancel actions
 */

import type { VNode } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { ModalPortal } from '../modals/ModalPortal';
import { Z_INDEX } from '../../core/dmtConstants';

interface ImageAlignmentModeProps {
  isActive: boolean;
  offsetX: number;
  offsetY: number;
  onOffsetChange: (x: number, y: number) => void;
  onApply: (x: number, y: number) => void;
  onCancel: (x: number, y: number) => void;
  gridSize?: number;
  onGridSizeChange?: (size: number) => void;
}

function ImageAlignmentMode({ isActive, offsetX, offsetY, onOffsetChange, onApply, onCancel, gridSize, onGridSizeChange }: ImageAlignmentModeProps): VNode | null {
  const [panelPosition, setPanelPosition] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [initialOffset, setInitialOffset] = useState({ x: offsetX, y: offsetY });
  
  // Initialize panel position and store initial offset
  useEffect(() => {
    if (isActive && panelPosition.x === null) {
      // Position in bottom-right corner, 10% inset from edges
      const panelWidth = 280;
      setPanelPosition({
        x: window.innerWidth - panelWidth - Math.max(20, window.innerWidth * 0.05),
        y: Math.max(20, window.innerHeight * 0.45)
      });
      
      // Store initial offset for reset/cancel
      setInitialOffset({ x: offsetX, y: offsetY });
    }
  }, [isActive]);
  
  // Use refs to avoid stale closures in event handlers
  const isDraggingRef = useRef(false);
  const dragStartOffsetRef = useRef({ x: 0, y: 0 });
  const dragStartClientRef = useRef({ x: 0, y: 0 });
  
  // Canvas drag event handlers - use useCallback to stabilize
  const handleCanvasPointerDown = useCallback((e: PointerEvent | TouchEvent) => {
    // Only handle events on the canvas
    const canvas = document.querySelector('[class^="windrose-canvas"]');
    const target = e.target as HTMLElement | null;
    if (canvas == null || !target?.closest('[class^="windrose-canvas"]')) {
      return;
    }    // Only handle single-finger/mouse events (let two-finger pan through)
    const touches = (e as TouchEvent).touches;
    if (touches != null && touches.length > 1) {      return;
    }

    const clientX = touches != null ? touches[0].clientX : (e as PointerEvent).clientX;
    const clientY = touches != null ? touches[0].clientY : (e as PointerEvent).clientY;    isDraggingRef.current = true;
    dragStartOffsetRef.current = { x: offsetX, y: offsetY };
    dragStartClientRef.current = { x: clientX, y: clientY };
    
    e.preventDefault();
    e.stopPropagation();
  }, [offsetX, offsetY]);
  
  const handleCanvasPointerMove = useCallback((e: PointerEvent | TouchEvent) => {
    if (!isDraggingRef.current) return;

    const touches = (e as TouchEvent).touches;
    const clientX = touches != null ? touches[0].clientX : (e as PointerEvent).clientX;
    const clientY = touches != null ? touches[0].clientY : (e as PointerEvent).clientY;

    const dx = clientX - dragStartClientRef.current.x;
    const dy = clientY - dragStartClientRef.current.y;

    const newOffsetX = Math.round(dragStartOffsetRef.current.x + dx);
    const newOffsetY = Math.round(dragStartOffsetRef.current.y + dy);    onOffsetChange(newOffsetX, newOffsetY);
  }, [onOffsetChange]);
  
  const handleCanvasPointerUp = useCallback(() => {
    if (isDraggingRef.current) {      isDraggingRef.current = false;
    }
  }, []);
  
  // Attach event listeners - only when isActive changes
  useEffect(() => {    if (!isActive) {      return undefined;
    }

    const canvas = document.querySelector('[class^="windrose-canvas"]');
    if (!canvas) return undefined;

    // Attach to document instead of canvas to avoid CodeMirror interception
    document.addEventListener('pointerdown', handleCanvasPointerDown);
    document.addEventListener('pointermove', handleCanvasPointerMove);
    document.addEventListener('pointerup', handleCanvasPointerUp);
    document.addEventListener('pointercancel', handleCanvasPointerUp);
    
    // Also handle touch events for better mobile support
    document.addEventListener('touchstart', handleCanvasPointerDown);
    document.addEventListener('touchmove', handleCanvasPointerMove);
    document.addEventListener('touchend', handleCanvasPointerUp);
    document.addEventListener('touchcancel', handleCanvasPointerUp);
    
    return () => {      document.removeEventListener('pointerdown', handleCanvasPointerDown);
      document.removeEventListener('pointermove', handleCanvasPointerMove);
      document.removeEventListener('pointerup', handleCanvasPointerUp);
      document.removeEventListener('pointercancel', handleCanvasPointerUp);
      document.removeEventListener('touchstart', handleCanvasPointerDown);
      document.removeEventListener('touchmove', handleCanvasPointerMove);
      document.removeEventListener('touchend', handleCanvasPointerUp);
      document.removeEventListener('touchcancel', handleCanvasPointerUp);
    };
  }, [isActive, handleCanvasPointerDown, handleCanvasPointerMove, handleCanvasPointerUp]);
  
  // Keyboard shortcuts
  useEffect(() => {
    if (!isActive) return undefined;

    const handleKeyDown = (e: KeyboardEvent): void => {
      // Ignore if typing in input field
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      
      const step = e.shiftKey ? 10 : 1;
      const safeX = typeof offsetX === 'number' && !isNaN(offsetX) ? offsetX : 0;
      const safeY = typeof offsetY === 'number' && !isNaN(offsetY) ? offsetY : 0;
      let handled = false;

      switch (e.key) {
        case 'ArrowLeft':
          onOffsetChange(safeX - step, safeY);
          handled = true;
          break;
        case 'ArrowRight':
          onOffsetChange(safeX + step, safeY);
          handled = true;
          break;
        case 'ArrowUp':
          onOffsetChange(safeX, safeY - step);
          handled = true;
          break;
        case 'ArrowDown':
          onOffsetChange(safeX, safeY + step);
          handled = true;
          break;
        case 'Enter':
          handleApply();
          handled = true;
          break;
        case 'Escape':
          handleCancel();
          handled = true;
          break;
      }
      
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isActive, offsetX, offsetY, onOffsetChange]);
  
  // Panel dragging (mouse + touch)
  const handlePanelPointerDown = useCallback((e: MouseEvent | TouchEvent) => {
    // Only drag from header
    const target = e.target as HTMLElement | null;
    if (!target?.closest('.alignment-panel-header')) return;

    const touches = (e as TouchEvent).touches;
    const clientX = touches != null ? touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = touches != null ? touches[0].clientY : (e as MouseEvent).clientY;

    setIsDragging(true);
    setDragStart({
      x: clientX - (panelPosition.x ?? 0),
      y: clientY - (panelPosition.y ?? 0)
    });
    e.preventDefault();
  }, [panelPosition]);

  useEffect(() => {
    if (!isDragging) return undefined;

    const handleMove = (e: MouseEvent | TouchEvent): void => {
      const touches = (e as TouchEvent).touches;
      const clientX = touches != null ? touches[0].clientX : (e as MouseEvent).clientX;
      const clientY = touches != null ? touches[0].clientY : (e as MouseEvent).clientY;
      setPanelPosition({
        x: clientX - dragStart.x,
        y: clientY - dragStart.y
      });
    };

    const handleEnd = (): void => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchmove', handleMove, { passive: false });
    document.addEventListener('touchend', handleEnd);

    return () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleMove);
      document.removeEventListener('touchend', handleEnd);
    };
  }, [isDragging, dragStart]);
  
  const handleApply = useCallback(() => {
    onApply(offsetX, offsetY);
  }, [offsetX, offsetY, onApply]);
  
  const handleReset = useCallback(() => {
    onOffsetChange(0, 0);
  }, [onOffsetChange]);
  
  const handleCancel = useCallback(() => {
    // Revert to initial offset
    onCancel(initialOffset.x, initialOffset.y);
  }, [initialOffset, onCancel]);
  
  const handleOffsetXChange = useCallback((e: Event) => {
    const value = parseInt((e.target as HTMLInputElement).value, 10) || 0;
    onOffsetChange(value, offsetY);
  }, [offsetY, onOffsetChange]);

  const handleOffsetYChange = useCallback((e: Event) => {
    const value = parseInt((e.target as HTMLInputElement).value, 10) || 0;
    onOffsetChange(offsetX, value);
  }, [offsetX, onOffsetChange]);

  const handleGridSizeChange = useCallback((e: Event) => {
    const value = parseInt((e.target as HTMLInputElement).value, 10);
    if (onGridSizeChange && value > 0) {
      onGridSizeChange(value);
    }
  }, [onGridSizeChange]);
  
  if (!isActive || panelPosition.x === null) return null;
  
  return (
    <ModalPortal>
      <div
        class="alignment-mode-panel"
        style={{
          position: 'fixed',
          left: `${panelPosition.x}px`,
          top: `${panelPosition.y}px`,
          width: '280px',
          maxHeight: 'calc(100vh - 40px)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--background-primary)',
          border: '1px solid var(--background-modifier-border)',
          borderRadius: '8px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
          zIndex: Z_INDEX.MODAL_OVERLAY,
          cursor: isDragging ? 'grabbing' : 'default',
          userSelect: 'none'
        }}
        onMouseDown={handlePanelPointerDown}
        onTouchStart={handlePanelPointerDown}
      >
        {/* Header - Draggable */}
        <div
          class="alignment-panel-header"
          style={{
            padding: '12px 16px',
            background: 'var(--background-modifier-hover)',
            borderBottom: '1px solid var(--background-modifier-border)',
            borderRadius: '8px 8px 0 0',
            cursor: 'grab',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <span style={{ fontSize: '16px' }}>📍</span>
          <span style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-normal)' }}>
            Image Alignment
          </span>
        </div>
        
        {/* Content */}
        <div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
          {/* Offset Display */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Offset X
                </label>
                <input
                  type="number"
                  value={offsetX}
                  onChange={handleOffsetXChange}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: '13px',
                    background: 'var(--background-primary)',
                    border: '1px solid var(--background-modifier-border)',
                    borderRadius: '4px',
                    color: 'var(--text-normal)'
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                  Offset Y
                </label>
                <input
                  type="number"
                  value={offsetY}
                  onChange={handleOffsetYChange}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    fontSize: '13px',
                    background: 'var(--background-primary)',
                    border: '1px solid var(--background-modifier-border)',
                    borderRadius: '4px',
                    color: 'var(--text-normal)'
                  }}
                />
              </div>
            </div>
          </div>
          
          {/* Grid Size */}
          {onGridSizeChange && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Background Grid Size (px)
              </label>
              <input
                type="number"
                value={gridSize != null ? gridSize : ''}
                min="1"
                onChange={handleGridSizeChange}
                placeholder="e.g. 140"
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  fontSize: '13px',
                  background: 'var(--background-primary)',
                  border: '1px solid var(--background-modifier-border)',
                  borderRadius: '4px',
                  color: 'var(--text-normal)'
                }}
              />
            </div>
          )}

          {/* Instructions */}
          <div
            style={{
              padding: '12px',
              background: 'var(--background-secondary)',
              borderRadius: '4px',
              marginBottom: '16px'
            }}
          >
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
              <div style={{ marginBottom: '4px' }}>• Drag image to reposition</div>
              <div style={{ marginBottom: '4px' }}>• Arrow keys: 1px nudge</div>
              <div>• Shift+Arrow: 10px jump</div>
            </div>
          </div>
          
          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              class="windrose-alignment-apply"
              onClick={handleApply}
              style={{
                flex: 1,
                padding: '8px 12px',
                fontSize: '13px',
                fontWeight: '500',
                background: 'var(--interactive-accent)',
                color: 'var(--text-on-accent)',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Apply
            </button>
            <button
              onClick={handleReset}
              style={{
                padding: '8px 12px',
                fontSize: '13px',
                background: 'var(--background-modifier-hover)',
                color: 'var(--text-normal)',
                border: '1px solid var(--background-modifier-border)',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Reset
            </button>
            <button
              onClick={handleCancel}
              style={{
                padding: '8px 12px',
                fontSize: '13px',
                background: 'var(--background-modifier-hover)',
                color: 'var(--text-normal)',
                border: '1px solid var(--background-modifier-border)',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

export { ImageAlignmentMode };
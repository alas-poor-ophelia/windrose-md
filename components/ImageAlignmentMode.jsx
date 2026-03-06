const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { ModalPortal } = await requireModuleByName("ModalPortal.tsx");

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
function ImageAlignmentMode({ dc, isActive, offsetX, offsetY, onOffsetChange, onApply, onCancel, gridSize, onGridSizeChange }) {
  const [panelPosition, setPanelPosition] = dc.useState({ x: null, y: null });
  const [isDragging, setIsDragging] = dc.useState(false);
  const [dragStart, setDragStart] = dc.useState({ x: 0, y: 0 });
  const [initialOffset, setInitialOffset] = dc.useState({ x: offsetX, y: offsetY });
  
  // Initialize panel position and store initial offset
  dc.useEffect(() => {
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
  const isDraggingRef = dc.useRef(false);
  const dragStartOffsetRef = dc.useRef({ x: 0, y: 0 });
  const dragStartClientRef = dc.useRef({ x: 0, y: 0 });
  
  // Canvas drag event handlers - use useCallback to stabilize
  const handleCanvasPointerDown = dc.useCallback((e) => {
    // Only handle events on the canvas
    const canvas = document.querySelector('[class^="dmt-canvas"]');
    if (!canvas || !e.target.closest('[class^="dmt-canvas"]')) {
      return;
    }    // Only handle single-finger/mouse events (let two-finger pan through)
    if (e.touches && e.touches.length > 1) {      return;
    }
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;    isDraggingRef.current = true;
    dragStartOffsetRef.current = { x: offsetX, y: offsetY };
    dragStartClientRef.current = { x: clientX, y: clientY };
    
    e.preventDefault();
    e.stopPropagation();
  }, [offsetX, offsetY]);
  
  const handleCanvasPointerMove = dc.useCallback((e) => {
    if (!isDraggingRef.current) return;
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    const dx = clientX - dragStartClientRef.current.x;
    const dy = clientY - dragStartClientRef.current.y;
    
    const newOffsetX = Math.round(dragStartOffsetRef.current.x + dx);
    const newOffsetY = Math.round(dragStartOffsetRef.current.y + dy);    onOffsetChange(newOffsetX, newOffsetY);
  }, [onOffsetChange]);
  
  const handleCanvasPointerUp = dc.useCallback(() => {
    if (isDraggingRef.current) {      isDraggingRef.current = false;
    }
  }, []);
  
  // Attach event listeners - only when isActive changes
  dc.useEffect(() => {    if (!isActive) {      return;
    }
    
    const canvas = document.querySelector('[class^="dmt-canvas"]');
    if (!canvas) return;

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
  dc.useEffect(() => {
    if (!isActive) return;
    
    const handleKeyDown = (e) => {
      // Ignore if typing in input field
      if (e.target.tagName === 'INPUT') return;
      
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
  const handlePanelPointerDown = dc.useCallback((e) => {
    // Only drag from header
    if (!e.target.closest('.alignment-panel-header')) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    setIsDragging(true);
    setDragStart({
      x: clientX - panelPosition.x,
      y: clientY - panelPosition.y
    });
    e.preventDefault();
  }, [panelPosition]);

  dc.useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e) => {
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      setPanelPosition({
        x: clientX - dragStart.x,
        y: clientY - dragStart.y
      });
    };

    const handleEnd = () => {
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
  
  const handleApply = dc.useCallback(() => {
    onApply(offsetX, offsetY);
  }, [offsetX, offsetY, onApply]);
  
  const handleReset = dc.useCallback(() => {
    onOffsetChange(0, 0);
  }, [onOffsetChange]);
  
  const handleCancel = dc.useCallback(() => {
    // Revert to initial offset
    onCancel(initialOffset.x, initialOffset.y);
  }, [initialOffset, onCancel]);
  
  const handleOffsetXChange = dc.useCallback((e) => {
    const value = parseInt(e.target.value, 10) || 0;
    onOffsetChange(value, offsetY);
  }, [offsetY, onOffsetChange]);
  
  const handleOffsetYChange = dc.useCallback((e) => {
    const value = parseInt(e.target.value, 10) || 0;
    onOffsetChange(offsetX, value);
  }, [offsetX, onOffsetChange]);

  const handleGridSizeChange = dc.useCallback((e) => {
    const value = parseInt(e.target.value, 10);
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
          zIndex: 10000,
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
                value={gridSize || ''}
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
              onMouseEnter={(e) => e.target.style.background = 'var(--interactive-accent-hover)'}
              onMouseLeave={(e) => e.target.style.background = 'var(--interactive-accent)'}
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

return { ImageAlignmentMode };
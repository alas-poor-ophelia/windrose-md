/**
 * MapSettingsModal.jsx
 * 
 * Modal for configuring per-map settings and UI preferences.
 * Organized into tabs:
 * 1. Appearance - Color customization
 * 2. Hex Grid (hex maps only) - Bounds, coordinate display, and background image
 * 3. Measurement - Distance settings
 * 4. Preferences - UI state persistence options
 * 
 * Features:
 * - Draggable by header
 * - Resizable (size persists across sessions)
 * 
 * This is the orchestrator component that composes all settings tabs
 * using the shared MapSettingsContext.
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { ModalPortal } = await requireModuleByName("ModalPortal.jsx");
const { MapSettingsProvider, useMapSettings } = await requireModuleByName("MapSettingsContext.jsx");
const { AppearanceTab } = await requireModuleByName("AppearanceTab.jsx");
const { HexGridTab } = await requireModuleByName("HexGridTab.jsx");
const { MeasurementTab } = await requireModuleByName("MeasurementTab.jsx");
const { PreferencesTab } = await requireModuleByName("PreferencesTab.jsx");
const { ResizeConfirmDialog } = await requireModuleByName("ResizeConfirmDialog.jsx");

// Storage key for persisting modal size
const MODAL_SIZE_KEY = 'windrose-settings-modal-size';

// Default and constraint values
const DEFAULT_WIDTH = 480;
const DEFAULT_HEIGHT = 500;
const MIN_WIDTH = 380;
const MIN_HEIGHT = 350;
const MAX_WIDTH = 800;
const MAX_HEIGHT = 800;

/**
 * Load persisted modal size from localStorage
 */
function loadPersistedSize() {
  try {
    const stored = localStorage.getItem(MODAL_SIZE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        width: Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, parsed.width || DEFAULT_WIDTH)),
        height: Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, parsed.height || DEFAULT_HEIGHT))
      };
    }
  } catch (e) {
    // Ignore parse errors
  }
  return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
}

/**
 * Save modal size to localStorage
 */
function savePersistedSize(width, height) {
  try {
    localStorage.setItem(MODAL_SIZE_KEY, JSON.stringify({ width, height }));
  } catch (e) {
    // Ignore storage errors
  }
}

/**
 * Inner modal content that uses the settings context
 */
function MapSettingsModalContent() {
  const {
    isOpen,
    activeTab,
    setActiveTab,
    tabs,
    mapType,
    isLoading,
    handleSave,
    handleCancel,
    mouseDownTargetRef
  } = useMapSettings();
  
  // Modal position and size state
  const [position, setPosition] = dc.useState({ x: null, y: null }); // null = centered
  const [size, setSize] = dc.useState(loadPersistedSize);
  
  // Drag state
  const [isDragging, setIsDragging] = dc.useState(false);
  const [dragOffset, setDragOffset] = dc.useState({ x: 0, y: 0 });
  
  // Resize state
  const [isResizing, setIsResizing] = dc.useState(false);
  const [resizeEdge, setResizeEdge] = dc.useState(null); // 'e', 'w', 's', 'se', 'sw'
  const resizeStartRef = dc.useRef({ x: 0, y: 0, width: 0, height: 0, posX: 0, posY: 0 });
  
  // Ref for the modal content element
  const modalRef = dc.useRef(null);
  
  // Reset position when modal opens (so it centers again)
  dc.useEffect(() => {
    if (isOpen) {
      setPosition({ x: null, y: null });
    }
  }, [isOpen]);
  
  // Handle drag start
  const handleDragStart = dc.useCallback((e) => {
    // Only drag from header
    if (!e.target.closest('.dmt-modal-header')) return;
    
    e.preventDefault();
    
    const modalRect = modalRef.current?.getBoundingClientRect();
    if (!modalRect) return;
    
    // If position is null (centered), calculate actual position
    const actualX = position.x ?? (window.innerWidth - modalRect.width) / 2;
    const actualY = position.y ?? (window.innerHeight - modalRect.height) / 2;
    
    setDragOffset({
      x: e.clientX - actualX,
      y: e.clientY - actualY
    });
    setIsDragging(true);
  }, [position]);
  
  // Handle drag move
  dc.useEffect(() => {
    if (!isDragging) return;
    
    const handleMouseMove = (e) => {
      const newX = e.clientX - dragOffset.x;
      const newY = e.clientY - dragOffset.y;
      
      // Constrain to viewport
      const maxX = window.innerWidth - size.width;
      const maxY = window.innerHeight - size.height;
      
      setPosition({
        x: Math.max(0, Math.min(maxX, newX)),
        y: Math.max(0, Math.min(maxY, newY))
      });
    };
    
    const handleMouseUp = () => {
      setIsDragging(false);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset, size]);
  
  // Handle resize start
  const handleResizeStart = dc.useCallback((e, edge) => {
    e.preventDefault();
    e.stopPropagation();
    
    const modalRect = modalRef.current?.getBoundingClientRect();
    if (!modalRect) return;
    
    // Calculate actual position
    const actualX = position.x ?? (window.innerWidth - modalRect.width) / 2;
    const actualY = position.y ?? (window.innerHeight - modalRect.height) / 2;
    
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height,
      posX: actualX,
      posY: actualY
    };
    
    setResizeEdge(edge);
    setIsResizing(true);
  }, [position, size]);
  
  // Handle resize move
  dc.useEffect(() => {
    if (!isResizing || !resizeEdge) return;
    
    const handleMouseMove = (e) => {
      const start = resizeStartRef.current;
      const deltaX = e.clientX - start.x;
      const deltaY = e.clientY - start.y;
      
      let newWidth = start.width;
      let newHeight = start.height;
      let newX = start.posX;
      let newY = start.posY;
      
      // Handle different resize edges
      if (resizeEdge.includes('e')) {
        newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, start.width + deltaX));
      }
      if (resizeEdge.includes('w')) {
        const widthDelta = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, start.width - deltaX)) - start.width;
        newWidth = start.width + widthDelta;
        newX = start.posX - widthDelta;
      }
      if (resizeEdge.includes('s')) {
        newHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, start.height + deltaY));
      }
      
      // Constrain position to viewport
      newX = Math.max(0, Math.min(window.innerWidth - newWidth, newX));
      newY = Math.max(0, Math.min(window.innerHeight - newHeight, newY));
      
      setSize({ width: newWidth, height: newHeight });
      setPosition({ x: newX, y: newY });
    };
    
    const handleMouseUp = () => {
      setIsResizing(false);
      setResizeEdge(null);
      // Persist size
      savePersistedSize(size.width, size.height);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, resizeEdge, size]);
  
  if (!isOpen) return null;
  
  // Calculate actual position (centered if position is null)
  const actualLeft = position.x ?? `calc(50% - ${size.width / 2}px)`;
  const actualTop = position.y ?? `calc(50% - ${size.height / 2}px)`;
  
  return (
    <ModalPortal>
      <div 
        class="dmt-modal-overlay" 
        onMouseDown={(e) => mouseDownTargetRef.current = e.target}
        onClick={(e) => {
          if (mouseDownTargetRef.current === e.target) {
            handleCancel();
          }
          mouseDownTargetRef.current = null;
        }}
        style={{
          cursor: isDragging ? 'grabbing' : (isResizing ? 
            (resizeEdge === 'e' || resizeEdge === 'w' ? 'ew-resize' : 
             resizeEdge === 's' ? 'ns-resize' : 'nwse-resize') : 'default')
        }}
      >
        <div 
          ref={modalRef}
          class="dmt-modal-content dmt-settings-modal" 
          onClick={(e) => e.stopPropagation()}
          style={{ 
            position: 'fixed',
            left: typeof actualLeft === 'number' ? `${actualLeft}px` : actualLeft,
            top: typeof actualTop === 'number' ? `${actualTop}px` : actualTop,
            width: `${size.width}px`,
            height: `${size.height}px`,
            maxWidth: '95vw',
            maxHeight: '95vh',
            transform: 'none', // Override any centering transform
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* Header - Draggable */}
          <div 
            class="dmt-modal-header"
            onMouseDown={handleDragStart}
            style={{ 
              cursor: isDragging ? 'grabbing' : 'grab',
              userSelect: 'none',
              flexShrink: 0
            }}
          >
            <h3>Map Settings</h3>
          </div>
          
          {/* Tab Bar */}
          <div class="dmt-settings-tab-bar" style={{ flexShrink: 0 }}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                class={`dmt-settings-tab ${activeTab === tab.id ? 'dmt-settings-tab-active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          
          {/* Tab Content - Scrollable */}
          <div class="dmt-modal-body" style={{ 
            paddingTop: '16px',
            flex: 1,
            overflowY: 'auto',
            minHeight: 0
          }}>
            {activeTab === 'appearance' && <AppearanceTab />}
            {activeTab === 'hexgrid' && mapType === 'hex' && <HexGridTab />}
            {activeTab === 'measurement' && <MeasurementTab />}
            {activeTab === 'preferences' && <PreferencesTab />}
          </div>
          
          {/* Footer */}
          <div class="dmt-modal-footer" style={{ flexShrink: 0 }}>
            <button 
              class="dmt-modal-btn dmt-modal-btn-cancel"
              onClick={handleCancel}
              disabled={isLoading}
            >
              Cancel
            </button>
            
            <button 
              class="dmt-modal-btn dmt-modal-btn-submit"
              onClick={handleSave}
              disabled={isLoading}
            >
              {isLoading ? 'Saving...' : 'Save'}
            </button>
          </div>
          
          {/* Resize handles */}
          {/* Right edge */}
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: '40px',
              bottom: '8px',
              width: '6px',
              cursor: 'ew-resize'
            }}
            onMouseDown={(e) => handleResizeStart(e, 'e')}
          />
          {/* Left edge */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: '40px',
              bottom: '8px',
              width: '6px',
              cursor: 'ew-resize'
            }}
            onMouseDown={(e) => handleResizeStart(e, 'w')}
          />
          {/* Bottom edge */}
          <div
            style={{
              position: 'absolute',
              left: '8px',
              right: '8px',
              bottom: 0,
              height: '6px',
              cursor: 'ns-resize'
            }}
            onMouseDown={(e) => handleResizeStart(e, 's')}
          />
          {/* Bottom-right corner */}
          <div
            style={{
              position: 'absolute',
              right: 0,
              bottom: 0,
              width: '12px',
              height: '12px',
              cursor: 'nwse-resize'
            }}
            onMouseDown={(e) => handleResizeStart(e, 'se')}
          />
          {/* Bottom-left corner */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              bottom: 0,
              width: '12px',
              height: '12px',
              cursor: 'nesw-resize'
            }}
            onMouseDown={(e) => handleResizeStart(e, 'sw')}
          />
        </div>
      </div>
      
      {/* Resize Confirmation Dialog */}
      <ResizeConfirmDialog />
    </ModalPortal>
  );
}

/**
 * Main MapSettingsModal component
 * Wraps content in the settings context provider
 */
function MapSettingsModal(props) {
  return (
    <MapSettingsProvider {...props}>
      <MapSettingsModalContent />
    </MapSettingsProvider>
  );
}

return { MapSettingsModal };
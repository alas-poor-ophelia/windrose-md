/**
 * LayerControls.jsx
 * 
 * Floating panel for z-layer management.
 * Provides controls for:
 * - Switching between layers (click)
 * - Adding new layers (+)
 * - Deleting layers (long-press/right-click options)
 * - Reordering layers (drag)
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { getLayersOrdered } = await requireModuleByName("layerAccessor.js");

/**
 * LayerControls Component
 * 
 * @param {Object} props
 * @param {Object} props.mapData - Full map data object
 * @param {Function} props.onLayerSelect - (layerId) => void
 * @param {Function} props.onLayerAdd - () => void
 * @param {Function} props.onLayerDelete - (layerId) => void
 * @param {Function} props.onLayerReorder - (layerId, newIndex) => void
 * @param {boolean} props.sidebarCollapsed - Whether object sidebar is collapsed
 */
const LayerControls = ({
  mapData,
  onLayerSelect,
  onLayerAdd,
  onLayerDelete,
  onLayerReorder,
  sidebarCollapsed,
  isOpen = true
}) => {
  // Track which layer has options expanded
  const [expandedLayerId, setExpandedLayerId] = dc.useState(null);
  
  // Drag state for reordering
  const [dragState, setDragState] = dc.useState(null);
  const [dragOverIndex, setDragOverIndex] = dc.useState(null);
  
  // Long-press timer for touch devices
  const longPressTimerRef = dc.useRef(null);
  const longPressTriggeredRef = dc.useRef(false);
  
  // Get layers sorted by order (highest order = top of visual stack, shown at top of list)
  const layers = getLayersOrdered(mapData);
  const reversedLayers = [...layers].reverse(); // Display top layer at top
  const activeLayerId = mapData?.activeLayerId;
  
  // Close options when clicking the overlay or pressing Escape
  const handleOverlayClick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setExpandedLayerId(null);
  };
  
  dc.useEffect(() => {
    if (!expandedLayerId) return;
    
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        setExpandedLayerId(null);
      }
    };
    
    document.addEventListener('keydown', handleEscape);
    
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [expandedLayerId]);
  
  // Handle layer button click (switch to layer)
  const handleLayerClick = (layerId, e) => {
    e.stopPropagation();
    
    // Don't switch if we just triggered a long-press
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    
    // If options are expanded for this layer, close them
    if (expandedLayerId === layerId) {
      setExpandedLayerId(null);
      return;
    }
    
    // Close any open options
    setExpandedLayerId(null);
    
    // Switch to this layer
    if (layerId !== activeLayerId) {
      onLayerSelect(layerId);
    }
  };
  
  // Handle right-click to show options
  const handleContextMenu = (layerId, e) => {
    e.preventDefault();
    e.stopPropagation();
    setExpandedLayerId(expandedLayerId === layerId ? null : layerId);
  };
  
  // Handle long-press start (touch devices)
  const handleTouchStart = (layerId, e) => {
    longPressTriggeredRef.current = false;
    
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      setExpandedLayerId(expandedLayerId === layerId ? null : layerId);
    }, 500);
  };
  
  // Handle long-press end
  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };
  
  // Handle delete layer
  const handleDelete = (layerId, e) => {
    e.stopPropagation();
    
    // Can't delete last layer
    if (layers.length <= 1) {
      return;
    }
    
    setExpandedLayerId(null);
    onLayerDelete(layerId);
  };
  
  // Drag handlers for reordering
  const handleDragStart = (layerId, index, e) => {
    setDragState({ layerId, index });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', layerId);
  };
  
  const handleDragOver = (index, e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };
  
  const handleDragLeave = () => {
    setDragOverIndex(null);
  };
  
  const handleDrop = (targetIndex, e) => {
    e.preventDefault();
    
    if (dragState && dragState.index !== targetIndex) {
      // Convert visual index back to layer order index
      // Visual list is reversed, so we need to convert
      const visualLength = reversedLayers.length;
      const fromOrderIndex = visualLength - 1 - dragState.index;
      const toOrderIndex = visualLength - 1 - targetIndex;
      
      onLayerReorder(dragState.layerId, toOrderIndex);
    }
    
    setDragState(null);
    setDragOverIndex(null);
  };
  
  const handleDragEnd = () => {
    setDragState(null);
    setDragOverIndex(null);
  };
  
  // Get display number for layer (1-indexed, top layer = highest number)
  const getLayerDisplayNumber = (layer) => {
    return layer.order + 1;
  };
  
  return (
    <>
      {/* Invisible overlay to capture clicks when context menu is open */}
      {expandedLayerId && (
        <div 
          className="dmt-layer-overlay"
          onClick={handleOverlayClick}
          onContextMenu={handleOverlayClick}
          onMouseDown={handleOverlayClick}
          onTouchStart={handleOverlayClick}
        />
      )}
      
      <div 
        className={`dmt-layer-controls ${sidebarCollapsed ? 'sidebar-closed' : 'sidebar-open'} ${isOpen ? 'dmt-layer-controls-open' : ''}`}
      >
        {/* Layer Buttons (top layer first visually) */}
      {reversedLayers.map((layer, visualIndex) => {
        const isActive = layer.id === activeLayerId;
        const isExpanded = layer.id === expandedLayerId;
        const isDragging = dragState?.layerId === layer.id;
        const isDragOver = dragOverIndex === visualIndex && dragState?.layerId !== layer.id;
        const canDelete = layers.length > 1;
        
        return (
          <div
            key={layer.id}
            className="dmt-layer-btn-wrapper"
            draggable
            onDragStart={(e) => handleDragStart(layer.id, visualIndex, e)}
            onDragOver={(e) => handleDragOver(visualIndex, e)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(visualIndex, e)}
            onDragEnd={handleDragEnd}
          >
            <button
              className={`dmt-layer-btn ${isActive ? 'dmt-layer-btn-active' : ''} ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
              onClick={(e) => handleLayerClick(layer.id, e)}
              onContextMenu={(e) => handleContextMenu(layer.id, e)}
              onTouchStart={(e) => handleTouchStart(layer.id, e)}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchEnd}
              title={`${layer.name}${isActive ? ' (active)' : ''} - Right-click for options`}
            >
              {getLayerDisplayNumber(layer)}
            </button>
            
            {/* Options Slide-out */}
            <div className={`dmt-layer-options ${isExpanded ? 'expanded' : ''}`}>
              {canDelete && (
                <button
                  className="dmt-layer-option-btn delete"
                  onClick={(e) => handleDelete(layer.id, e)}
                  title="Delete layer"
                >
                  <dc.Icon icon="lucide-trash-2" size={14} />
                </button>
              )}
            </div>
          </div>
        );
      })}
      
      {/* Add Layer Button (at bottom) */}
      <button
        className="dmt-layer-add-btn"
        onClick={onLayerAdd}
        title="Add new layer"
      >
        <dc.Icon icon="lucide-plus" size={16} />
      </button>
    </div>
    </>
  );
};

return { LayerControls };
/**
 * SelectionToolbar.jsx
 * 
 * Unified toolbar component that appears below (or above) selected objects/text labels.
 * Consolidates all action buttons into a single horizontal toolbar with context-aware buttons.
 */

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { calculateObjectScreenPosition } = await requireModuleByName("screenPositionUtils.ts");
const { openNoteInNewTab } = await requireModuleByName("noteOperations.ts");
const { ColorPicker } = await requireModuleByName("ColorPicker.tsx");
const { getActiveLayer } = await requireModuleByName("layerAccessor.ts");

/**
 * Calculate bounding box that encompasses all selected items
 */
function calculateMultiSelectBounds(selectedItems, mapData, canvasRef, containerRef, geometry) {
  if (!selectedItems?.length || !canvasRef?.current || !containerRef?.current || !mapData) return null;
  
  const canvas = canvasRef.current;
  const { gridSize, viewState, northDirection } = mapData;
  const { zoom, center } = viewState;
  const scaledGridSize = gridSize * zoom;
  
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const offsetX = centerX - center.x * scaledGridSize;
  const offsetY = centerY - center.y * scaledGridSize;
  
  // Account for canvas position within container - use containerRef for consistency
  const rect = canvas.getBoundingClientRect();
  const containerRect = containerRef.current.getBoundingClientRect();
  const canvasOffsetX = rect.left - containerRect.left;
  const canvasOffsetY = rect.top - containerRect.top;
  const scaleX = rect.width / canvas.width;
  const scaleY = rect.height / canvas.height;
  
  const activeLayer = getActiveLayer(mapData);
  
  let minScreenX = Infinity;
  let minScreenY = Infinity;
  let maxScreenX = -Infinity;
  let maxScreenY = -Infinity;
  
  for (const item of selectedItems) {
    if (item.type === 'object') {
      const obj = activeLayer.objects?.find(o => o.id === item.id);
      if (!obj) continue;
      
      const pos = calculateObjectScreenPosition(obj, canvas, mapData, geometry, containerRef);
      if (!pos) continue;
      
      const left = pos.screenX - pos.objectWidth / 2;
      const right = pos.screenX + pos.objectWidth / 2;
      const top = pos.screenY - pos.objectHeight / 2;
      const bottom = pos.screenY + pos.objectHeight / 2;
      
      minScreenX = Math.min(minScreenX, left);
      maxScreenX = Math.max(maxScreenX, right);
      minScreenY = Math.min(minScreenY, top);
      maxScreenY = Math.max(maxScreenY, bottom);
    } else if (item.type === 'text') {
      const label = activeLayer.textLabels?.find(l => l.id === item.id);
      if (!label) continue;
      
      // Get label position in screen space
      let screenX = offsetX + label.position.x * zoom;
      let screenY = offsetY + label.position.y * zoom;
      
      // Apply canvas rotation if present
      if (northDirection !== 0) {
        const relX = screenX - centerX;
        const relY = screenY - centerY;
        const angleRad = (northDirection * Math.PI) / 180;
        const rotatedX = relX * Math.cos(angleRad) - relY * Math.sin(angleRad);
        const rotatedY = relX * Math.sin(angleRad) + relY * Math.cos(angleRad);
        screenX = centerX + rotatedX;
        screenY = centerY + rotatedY;
      }
      
      // Approximate label bounds
      const fontSize = (label.fontSize || 16) * zoom;
      const approxWidth = fontSize * 3; // Rough estimate
      const approxHeight = fontSize * 1.5;
      
      const left = (screenX * scaleX) + canvasOffsetX - approxWidth / 2;
      const right = (screenX * scaleX) + canvasOffsetX + approxWidth / 2;
      const top = (screenY * scaleY) + canvasOffsetY - approxHeight / 2;
      const bottom = (screenY * scaleY) + canvasOffsetY + approxHeight / 2;
      
      minScreenX = Math.min(minScreenX, left);
      maxScreenX = Math.max(maxScreenX, right);
      minScreenY = Math.min(minScreenY, top);
      maxScreenY = Math.max(maxScreenY, bottom);
    }
  }
  
  if (minScreenX === Infinity) return null;
  
  return {
    screenX: (minScreenX + maxScreenX) / 2,
    screenY: (minScreenY + maxScreenY) / 2,
    width: maxScreenX - minScreenX,
    height: maxScreenY - minScreenY,
    top: minScreenY,
    bottom: maxScreenY
  };
}

/**
 * MultiSelectToolbar Component
 * Shows simplified toolbar for multiple selected items
 */
const MultiSelectToolbar = ({
  selectedItems,
  selectionCount,
  mapData,
  canvasRef,
  containerRef,
  geometry,
  onRotateAll,
  onDuplicateAll,
  onDeleteAll
}) => {
  if (!selectedItems?.length || !mapData || !canvasRef?.current || !containerRef?.current) {
    return null;
  }
  
  // Calculate bounding box of all selected items
  const bounds = calculateMultiSelectBounds(selectedItems, mapData, canvasRef, containerRef, geometry);
  if (!bounds) return null;
  
  // Calculate toolbar dimensions
  const buttonSize = 44;
  const buttonGap = 4;
  const toolbarGap = 4;
  const countBadgeWidth = 80;
  
  // Buttons: Count badge + Rotate All + Duplicate All + Delete All
  const buttonCount = 3;
  const toolbarWidth = countBadgeWidth + buttonGap + buttonCount * buttonSize + (buttonCount - 1) * buttonGap;
  const toolbarHeight = buttonSize;
  
  // Get container bounds for edge detection
  const containerRect = containerRef.current.getBoundingClientRect();
  const containerHeight = containerRect.height;
  
  // Determine if we need to flip above
  const spaceBelow = containerHeight - bounds.bottom;
  const shouldFlipAbove = spaceBelow < toolbarHeight + toolbarGap + 20;
  
  // Calculate toolbar position
  let toolbarX = bounds.screenX - toolbarWidth / 2;
  let toolbarY;
  
  if (shouldFlipAbove) {
    toolbarY = bounds.top - toolbarGap - toolbarHeight;
  } else {
    toolbarY = bounds.bottom + toolbarGap;
  }
  
  // Clamp horizontal position to container bounds
  const minX = 4;
  const maxX = containerRect.width - toolbarWidth - 4;
  toolbarX = Math.max(minX, Math.min(maxX, toolbarX));
  
  // Count objects and text labels
  const objectCount = selectedItems.filter(i => i.type === 'object').length;
  const textCount = selectedItems.filter(i => i.type === 'text').length;
  
  return (
    <div 
      className="dmt-selection-toolbar dmt-multi-select-toolbar"
      style={{
        position: 'absolute',
        left: `${toolbarX}px`,
        top: `${toolbarY}px`,
        pointerEvents: 'auto',
        zIndex: 150
      }}
    >
      {/* Selection count badge */}
      <div className="dmt-selection-count">
        <dc.Icon icon="lucide-box-select" size={14} />
        <span>{selectionCount || selectedItems.length} selected</span>
      </div>
      
      {/* Rotate All */}
      <button
        className="dmt-toolbar-button"
        onClick={onRotateAll}
        title="Rotate All 90°"
      >
        <dc.Icon icon="lucide-rotate-cw" />
      </button>
      
      {/* Duplicate All */}
      <button
        className="dmt-toolbar-button"
        onClick={onDuplicateAll}
        title="Duplicate All"
      >
        <dc.Icon icon="lucide-copy" />
      </button>
      
      {/* Delete All */}
      <button
        className="dmt-toolbar-button dmt-toolbar-delete-button"
        onClick={onDeleteAll}
        title="Delete All"
      >
        <dc.Icon icon="lucide-trash-2" />
      </button>
    </div>
  );
};

/**
 * Calculate bounding box for a text label in screen coordinates
 */
function calculateTextLabelBounds(label, canvasRef, containerRef, mapData) {
  if (!label || !canvasRef.current || !containerRef?.current || !mapData) return null;
  
  const canvas = canvasRef.current;
  const { gridSize, viewState, northDirection } = mapData;
  const { zoom, center } = viewState;
  const scaledGridSize = gridSize * zoom;
  
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const offsetX = centerX - center.x * scaledGridSize;
  const offsetY = centerY - center.y * scaledGridSize;
  
  // Get label position in screen space
  let screenX = offsetX + label.position.x * zoom;
  let screenY = offsetY + label.position.y * zoom;
  
  // Apply canvas rotation if present
  if (northDirection !== 0) {
    const relX = screenX - centerX;
    const relY = screenY - centerY;
    const angleRad = (northDirection * Math.PI) / 180;
    const rotatedX = relX * Math.cos(angleRad) - relY * Math.sin(angleRad);
    const rotatedY = relX * Math.sin(angleRad) + relY * Math.cos(angleRad);
    screenX = centerX + rotatedX;
    screenY = centerY + rotatedY;
  }
  
  // Measure text to get bounding box
  const ctx = canvas.getContext('2d');
  const fontSize = label.fontSize * zoom;
  ctx.font = `${fontSize}px sans-serif`;
  const metrics = ctx.measureText(label.content);
  const textWidth = metrics.width;
  const textHeight = fontSize * 1.2;
  
  // Calculate rotated bounding box for the label itself
  const labelAngle = ((label.rotation || 0) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(labelAngle));
  const sin = Math.abs(Math.sin(labelAngle));
  const rotatedWidth = textWidth * cos + textHeight * sin;
  const rotatedHeight = textWidth * sin + textHeight * cos;
  
  // Account for canvas position within container - use containerRef for consistency
  const rect = canvas.getBoundingClientRect();
  const containerRect = containerRef.current.getBoundingClientRect();
  const canvasOffsetX = rect.left - containerRect.left;
  const canvasOffsetY = rect.top - containerRect.top;
  const scaleX = rect.width / canvas.width;
  const scaleY = rect.height / canvas.height;
  
  // Selection box padding
  const paddingX = 4;
  const paddingY = 2;
  
  return {
    screenX: (screenX * scaleX) + canvasOffsetX,
    screenY: (screenY * scaleY) + canvasOffsetY,
    width: (rotatedWidth + paddingX * 2) * scaleX,
    height: (rotatedHeight + paddingY * 2) * scaleY
  };
}

/**
 * SelectionToolbar Component
 */
const SelectionToolbar = ({
  // Selection info
  selectedItem,
  selectedItems,      // Array of all selected items for multi-select
  hasMultiSelection,  // True when multiple items selected
  selectionCount,     // Number of selected items
  mapData,
  canvasRef,
  containerRef,
  geometry,
  
  // Object-specific handlers
  onRotate,
  onLabel,
  onLinkNote,
  onCopyLink,
  onColorClick,
  onResize,
  onDelete,
  onScaleChange,  // handler for scale slider
  onDuplicate,    // handler for duplicating object
  
  // Multi-select handlers
  onRotateAll,
  onDuplicateAll,
  onDeleteAll,
  
  // Text-specific handlers
  onEdit,
  
  // State
  isResizeMode,
  showColorPicker,
  
  // Color picker props
  currentColor,
  onColorSelect,
  onColorPickerClose,
  onColorReset,
  customColors,
  onAddCustomColor,
  onDeleteCustomColor,
  pendingCustomColorRef,
  colorButtonRef
}) => {
  // Handle multi-select mode
  if (hasMultiSelection && selectedItems?.length > 1) {
    return (
      <MultiSelectToolbar
        selectedItems={selectedItems}
        selectionCount={selectionCount}
        mapData={mapData}
        canvasRef={canvasRef}
        containerRef={containerRef}
        geometry={geometry}
        onRotateAll={onRotateAll}
        onDuplicateAll={onDuplicateAll}
        onDeleteAll={onDeleteAll}
      />
    );
  }
  
  // Don't render if no selection or missing dependencies
  if (!selectedItem || !mapData || !canvasRef?.current || !containerRef?.current) {
    return null;
  }
  
  const isObject = selectedItem.type === 'object';
  const isText = selectedItem.type === 'text';
  
  // Calculate selection bounding box based on type
  let bounds = null;
  
  if (isObject) {
    const object = getActiveLayer(mapData).objects?.find(obj => obj.id === selectedItem.id);
    if (!object) return null;
    
    const pos = calculateObjectScreenPosition(object, canvasRef.current, mapData, geometry, containerRef);
    if (!pos) return null;
    
    bounds = {
      screenX: pos.screenX,
      screenY: pos.screenY,
      width: pos.objectWidth,
      height: pos.objectHeight
    };
  } else if (isText) {
    const label = getActiveLayer(mapData).textLabels?.find(l => l.id === selectedItem.id);
    if (!label) return null;
    
    bounds = calculateTextLabelBounds(label, canvasRef, containerRef, mapData);
    if (!bounds) return null;
  }
  
  if (!bounds) return null;
  
  // Calculate toolbar dimensions
  const buttonSize = 44;
  const buttonGap = 4;
  const toolbarGap = 4; // Gap between selection and toolbar
  
  // Count buttons for this selection type
  let buttonCount = 0;
  if (isObject) {
    buttonCount = 8; // Rotate, Label, Duplicate, Link Note, Copy Link, Color, Resize, Delete
    // Hide label button for note_pin objects
    if (selectedItem.data?.type === 'note_pin') {
      buttonCount = 7;
    }
  } else if (isText) {
    buttonCount = 4; // Edit, Rotate, Copy Link, Delete
  }
  
  const toolbarWidth = buttonCount * buttonSize + (buttonCount - 1) * buttonGap;
  const toolbarHeight = buttonSize;
  
  // Get container bounds for edge detection
  const containerRect = containerRef.current.getBoundingClientRect();
  const containerHeight = containerRect.height;
  
  // Calculate linked note display height (if applicable)
  const hasLinkedNote = isObject && selectedItem.data?.linkedNote && typeof selectedItem.data.linkedNote === 'string';
  const linkedNoteHeight = hasLinkedNote ? 32 : 0; // Approximate height of note display
  const linkedNoteGap = hasLinkedNote ? 4 : 0;
  
  // Calculate total height needed below selection
  const totalHeightBelow = toolbarGap + toolbarHeight + linkedNoteGap + linkedNoteHeight;
  
  // Selection box edges
  const selectionBottom = bounds.screenY + bounds.height / 2;
  const selectionTop = bounds.screenY - bounds.height / 2;
  
  // Determine if we need to flip above
  const spaceBelow = containerHeight - selectionBottom;
  const shouldFlipAbove = spaceBelow < totalHeightBelow + 20; // 20px margin
  
  // Calculate toolbar position
  let toolbarX = bounds.screenX - toolbarWidth / 2;
  let toolbarY;
  let linkedNoteY;
  
  if (shouldFlipAbove) {
    toolbarY = selectionTop - toolbarGap - toolbarHeight;
    linkedNoteY = toolbarY - linkedNoteGap - linkedNoteHeight;
  } else {
    toolbarY = selectionBottom + toolbarGap;
    linkedNoteY = toolbarY + toolbarHeight + linkedNoteGap;
  }
  
  // Clamp horizontal position to container bounds
  const minX = 4;
  const maxX = containerRect.width - toolbarWidth - 4;
  toolbarX = Math.max(minX, Math.min(maxX, toolbarX));
  
  // During resize mode, show scale slider instead of action buttons
  if (isResizeMode && isObject) {
    // Read scale from actual object in mapData, not from selectedItem.data which may be stale
    const actualObject = getActiveLayer(mapData).objects?.find(obj => obj.id === selectedItem.id);
    const currentScale = actualObject?.scale ?? 1.0;
    const sliderWidth = 140;
    const sliderHeight = 36;
    const sliderGap = 8;
    
    // Position slider above the selection
    const sliderX = bounds.screenX - sliderWidth / 2;
    const sliderY = selectionTop - sliderGap - sliderHeight;
    
    // Clamp horizontal position
    const clampedSliderX = Math.max(4, Math.min(containerRect.width - sliderWidth - 4, sliderX));
    
    return (
      <div 
        className="dmt-scale-slider-container"
        style={{
          position: 'absolute',
          left: `${clampedSliderX}px`,
          top: `${sliderY}px`,
          width: `${sliderWidth}px`,
          height: `${sliderHeight}px`,
          pointerEvents: 'auto',
          zIndex: 150
        }}
      >
        <div className="dmt-scale-slider-inner">
          <dc.Icon icon="lucide-scaling" size={14} />
          <input
            type="range"
            className="dmt-scale-slider"
            min="25"
            max="130"
            step="5"
            value={Math.round(currentScale * 100)}
            onInput={(e) => {
              const newScale = parseInt(e.target.value) / 100;
              onScaleChange?.(newScale);
            }}
            title={`Scale: ${Math.round(currentScale * 100)}%`}
          />
          <span className="dmt-scale-value">{Math.round(currentScale * 100)}%</span>
        </div>
      </div>
    );
  }
  
  // Don't show toolbar during resize mode for non-objects
  if (isResizeMode) {
    return null;
  }
  
  return (
    <>
      {/* Linked Note Display (for objects with linked notes) */}
      {hasLinkedNote && (
        <div 
          className="dmt-selection-linked-note"
          style={{
            position: 'absolute',
            left: `${bounds.screenX}px`,
            top: `${linkedNoteY}px`,
            transform: 'translateX(-50%)',
            pointerEvents: 'auto',
            zIndex: 150
          }}
        >
          <div className="dmt-note-display-link">
            <dc.Icon icon="lucide-scroll-text" />
            <dc.Link 
              link={dc.resolvePath(selectedItem.data.linkedNote.replace(/\.md$/, ''))}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openNoteInNewTab(selectedItem.data.linkedNote);
              }}
            />
            <dc.Icon icon="lucide-external-link" />
          </div>
        </div>
      )}
      
      {/* Toolbar */}
      <div 
        className="dmt-selection-toolbar"
        style={{
          position: 'absolute',
          left: `${toolbarX}px`,
          top: `${toolbarY}px`,
          pointerEvents: 'auto',
          zIndex: 150
        }}
      >
        {/* Object buttons */}
        {isObject && (
          <>
            {/* Rotate */}
            <button
              className="dmt-toolbar-button"
              onClick={(e) => {
                if (onRotate) onRotate(e);
              }}
              title="Rotate 90° (or press R)"
            >
              <dc.Icon icon="lucide-rotate-cw" />
            </button>
            
            {/* Label (not for note_pin) */}
            {selectedItem.data?.type !== 'note_pin' && (
              <button
                className="dmt-toolbar-button"
                onClick={(e) => {
                  if (onLabel) onLabel(e);
                }}
                title="Add/Edit Label"
              >
                <dc.Icon icon="lucide-sticky-note" />
              </button>
            )}
            
            {/* Duplicate */}
            <button
              className="dmt-toolbar-button"
              onClick={(e) => {
                if (onDuplicate) onDuplicate(e);
              }}
              title="Duplicate Object"
            >
              <dc.Icon icon="lucide-copy" />
            </button>
            
            {/* Link Note */}
            <button
              className="dmt-toolbar-button"
              onClick={(e) => {
                if (onLinkNote) onLinkNote(e);
              }}
              title={selectedItem.data?.linkedNote ? "Edit linked note" : "Link note"}
            >
              <dc.Icon icon="lucide-scroll-text" />
            </button>

            {/* Copy Link */}
            <button
              className="dmt-toolbar-button"
              onClick={(e) => {
                if (onCopyLink) onCopyLink(e);
              }}
              title="Copy link to clipboard"
            >
              <dc.Icon icon="lucide-link" />
            </button>

            {/* Color */}
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <button
                ref={colorButtonRef}
                className="dmt-toolbar-button dmt-toolbar-color-button"
                onClick={(e) => {
                  if (onColorClick) onColorClick(e);
                }}
                title="Change Object Color"
                style={{
                  backgroundColor: currentColor || '#ffffff'
                }}
              >
                <dc.Icon icon="lucide-palette" />
              </button>
              
              {showColorPicker && (
                <ColorPicker
                  isOpen={showColorPicker}
                  selectedColor={currentColor || '#ffffff'}
                  onColorSelect={onColorSelect}
                  onClose={onColorPickerClose}
                  onReset={onColorReset}
                  customColors={customColors || []}
                  onAddCustomColor={onAddCustomColor}
                  onDeleteCustomColor={onDeleteCustomColor}
                  pendingCustomColorRef={pendingCustomColorRef}
                  title="Object Color"
                  position="above"
                />
              )}
            </div>
            
            {/* Resize */}
            <button
              className="dmt-toolbar-button"
              onClick={(e) => {
                if (onResize) onResize(e);
              }}
              title="Resize Object"
            >
              <dc.Icon icon="lucide-scaling" />
            </button>
            
            {/* Delete */}
            <button
              className="dmt-toolbar-button dmt-toolbar-delete-button"
              onClick={(e) => {
                if (onDelete) onDelete(e);
              }}
              title="Delete (or press Delete/Backspace)"
            >
              <dc.Icon icon="lucide-trash-2" />
            </button>
          </>
        )}
        
        {/* Text label buttons */}
        {isText && (
          <>
            {/* Edit */}
            <button
              className="dmt-toolbar-button"
              onClick={onEdit}
              title="Edit Text Label"
            >
              <dc.Icon icon="lucide-pencil" />
            </button>

            {/* Rotate */}
            <button
              className="dmt-toolbar-button"
              onClick={onRotate}
              title="Rotate 90° (or press R)"
            >
              <dc.Icon icon="lucide-rotate-cw" />
            </button>

            {/* Copy Link */}
            <button
              className="dmt-toolbar-button"
              onClick={(e) => {
                if (onCopyLink) onCopyLink(e);
              }}
              title="Copy link to clipboard"
            >
              <dc.Icon icon="lucide-link" />
            </button>

            {/* Delete */}
            <button
              className="dmt-toolbar-button dmt-toolbar-delete-button"
              onClick={onDelete}
              title="Delete (or press Delete/Backspace)"
            >
              <dc.Icon icon="lucide-trash-2" />
            </button>
          </>
        )}
      </div>
    </>
  );
};

return { SelectionToolbar };
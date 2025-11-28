/**
 * SelectionToolbar.jsx
 * 
 * Unified toolbar component that appears below (or above) selected objects/text labels.
 * Consolidates all action buttons into a single horizontal toolbar with context-aware buttons.
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { calculateObjectScreenPosition } = await requireModuleByName("screenPositionUtils.js");
const { openNoteInNewTab } = await requireModuleByName("noteOperations.js");
const { ColorPicker } = await requireModuleByName("ColorPicker.jsx");

/**
 * Calculate bounding box for a text label in screen coordinates
 */
function calculateTextLabelBounds(label, canvasRef, mapData) {
  if (!label || !canvasRef.current || !mapData) return null;
  
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
  
  // Account for canvas position within container
  const rect = canvas.getBoundingClientRect();
  const containerRect = canvas.parentElement.getBoundingClientRect();
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
  mapData,
  canvasRef,
  containerRef,
  geometry,
  
  // Object-specific handlers
  onRotate,
  onLabel,
  onLinkNote,
  onColorClick,
  onResize,
  onDelete,
  
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
  // Don't render if no selection or missing dependencies
  if (!selectedItem || !mapData || !canvasRef?.current || !containerRef?.current) {
    return null;
  }
  
  const isObject = selectedItem.type === 'object';
  const isText = selectedItem.type === 'text';
  
  // Calculate selection bounding box based on type
  let bounds = null;
  
  if (isObject) {
    const object = mapData.objects?.find(obj => obj.id === selectedItem.id);
    if (!object) return null;
    
    const pos = calculateObjectScreenPosition(object, canvasRef.current, mapData, geometry);
    if (!pos) return null;
    
    bounds = {
      screenX: pos.screenX,
      screenY: pos.screenY,
      width: pos.objectWidth,
      height: pos.objectHeight
    };
  } else if (isText) {
    const label = mapData.textLabels?.find(l => l.id === selectedItem.id);
    if (!label) return null;
    
    bounds = calculateTextLabelBounds(label, canvasRef, mapData);
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
    buttonCount = 6; // Rotate, Label, Link Note, Color, Resize, Delete
    // Hide label button for note_pin objects
    if (selectedItem.data?.type === 'note_pin') {
      buttonCount = 5;
    }
  } else if (isText) {
    buttonCount = 3; // Edit, Rotate, Delete
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
    // Position above: Linked Note (top) â†’ Toolbar â†’ Selection (bottom)
    toolbarY = selectionTop - toolbarGap - toolbarHeight;
    linkedNoteY = toolbarY - linkedNoteGap - linkedNoteHeight;
  } else {
    // Position below: Selection (top) â†’ Toolbar â†’ Linked Note (bottom)
    toolbarY = selectionBottom + toolbarGap;
    linkedNoteY = toolbarY + toolbarHeight + linkedNoteGap;
  }
  
  // Clamp horizontal position to container bounds
  const minX = 4;
  const maxX = containerRect.width - toolbarWidth - 4;
  toolbarX = Math.max(minX, Math.min(maxX, toolbarX));
  
  // Don't show action buttons during resize mode (only show resize handles)
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
              title="Rotate 90Â° (or press R)"
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
              title="Rotate 90Â° (or press R)"
            >
              <dc.Icon icon="lucide-rotate-cw" />
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
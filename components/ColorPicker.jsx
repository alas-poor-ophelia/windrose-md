// components/ColorPicker.jsx - With custom color delete functionality
const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);
const { COLOR_PALETTE, DEFAULT_COLOR } = await requireModuleByName("colorOperations.js");

const ColorPicker = ({ 
  isOpen, 
  selectedColor, 
  onColorSelect, 
  onClose, 
  onReset,
  customColors = [],
  onAddCustomColor,
  onDeleteCustomColor,
  pendingCustomColorRef,
  title = 'Color',
  position = 'below' // 'below' or 'above'
}) => {
  const [previewColor, setPreviewColor] = dc.useState(null);
  const [deleteTargetId, setDeleteTargetId] = dc.useState(null);
  const colorInputRef = dc.useRef(null);
  const longPressTimerRef = dc.useRef(null);
  
  if (!isOpen) return null;
  
  // Prevent clicks inside picker from closing it
  const handlePickerClick = (e) => {
    e.stopPropagation();
  };
  
  // Prevent touch events from propagating to canvas (which would trigger panning)
  const handlePickerTouch = (e) => {
    e.stopPropagation();
  };
  
  const handleColorClick = (colorHex) => {
    onColorSelect(colorHex);
  };
  
  const handleReset = (e) => {
    e.stopPropagation();
    onReset();
  };
  
  // Handle live color preview
  const handleColorInput = (e) => {
    setPreviewColor(e.target.value);
    if (pendingCustomColorRef) {
      pendingCustomColorRef.current = e.target.value;
    }
  };
  
  // When the color input loses focus, SAVE THE PREVIEW
  const handleColorBlur = (e) => {
    if (previewColor && onAddCustomColor) {
      // Convert preview to actual custom color
      onAddCustomColor(previewColor);
      onColorSelect(previewColor);
      setPreviewColor(null);
    }
  };
  
  // Handle click on the add button to show preview immediately
  const handleAddClick = () => {
    setPreviewColor('#888888');
  };
  
  // Handle right-click on custom color to show delete option
  const handleColorContextMenu = (e, colorDef) => {
    if (!colorDef.isCustom) return; // Only allow deleting custom colors
    e.preventDefault();
    e.stopPropagation();
    setDeleteTargetId(colorDef.id);
  };
  
  // Handle long-press start for touch devices
  const handleLongPressStart = (colorDef) => {
    if (!colorDef.isCustom) return;
    longPressTimerRef.current = setTimeout(() => {
      setDeleteTargetId(colorDef.id);
    }, 500); // 500ms for long press
  };
  
  // Handle long-press cancel
  const handleLongPressCancel = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };
  
  // Handle delete button click
  const handleDeleteClick = (e, colorId) => {
    e.preventDefault();
    e.stopPropagation();
    if (onDeleteCustomColor) {
      onDeleteCustomColor(colorId);
    }
    setDeleteTargetId(null);
  };
  
  // Close delete UI when clicking elsewhere
  dc.useEffect(() => {
    if (deleteTargetId) {
      const handleClickOutside = () => {
        setDeleteTargetId(null);
      };
      
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('touchstart', handleClickOutside);
      };
    }
  }, [deleteTargetId]);
  
  // Combine all colors into a single array for rendering
  const allColors = [
    { id: 'reset', color: null, label: 'Reset to default', isReset: true },
    ...COLOR_PALETTE,
    ...customColors.map(c => ({ ...c, isCustom: true })),
    // Add preview color if one exists
    ...(previewColor ? [{
      id: 'preview',
      color: previewColor,
      label: 'Selecting...',
      isPreview: true
    }] : []),
    { id: 'add-custom', color: null, label: 'Add custom color', isAddButton: true }
  ];
  
  return (
    <div 
      className="dmt-color-picker" 
      onClick={handlePickerClick}
      onTouchStart={handlePickerTouch}
      onTouchMove={handlePickerTouch}
      onTouchEnd={handlePickerTouch}
      style={{
        position: 'absolute',
        ...(position === 'above' 
          ? { bottom: 'calc(100% + 8px)', top: 'auto' }
          : { top: 'calc(100% + 8px)' }
        ),
        left: '0',
        zIndex: 1501
      }}
    >
      <div className="dmt-color-picker-header">
        <span className="dmt-color-picker-title">{title}</span>
      </div>
      
      <div className="dmt-color-grid">
        {allColors.map(colorDef => {
          if (colorDef.isReset) {
            return (
              <button
                key={colorDef.id}
                className="dmt-color-swatch dmt-color-swatch-reset"
                onClick={handleReset}
                title={colorDef.label}
              >
                <dc.Icon icon="lucide-circle-x" />
              </button>
            );
          } else if (colorDef.isPreview) {
            // Render preview color swatch
            return (
              <div
                key={colorDef.id}
                className="dmt-color-swatch dmt-color-swatch-preview"
                style={{ backgroundColor: colorDef.color }}
                title={colorDef.label}
              >
                <span className="dmt-color-preview-spinner">
                  <dc.Icon icon="lucide-loader" />
                </span>
              </div>
            );
          } else if (colorDef.isAddButton) {
            // Add button with hidden color input
            return (
              <div
                key={colorDef.id}
                className="dmt-color-swatch dmt-color-swatch-add"
                title={colorDef.label}
                onClick={handleAddClick}
              >
                <input
                  ref={colorInputRef}
                  type="color"
                  className="dmt-color-input-as-button"
                  onInput={handleColorInput}
                  onBlur={handleColorBlur}
                  defaultValue={selectedColor || '#ffffff'}
                  aria-label="Add custom color"
                />
                <span className="dmt-color-add-icon-overlay">+</span>
              </div>
            );
          } else {
            // Regular color swatch with optional delete button
            const isShowingDelete = deleteTargetId === colorDef.id;
            
            return (
              <div key={colorDef.id} style={{ position: 'relative', display: 'inline-block' }}>
                <button
                  className={`dmt-color-swatch ${selectedColor === colorDef.color ? 'dmt-color-swatch-selected' : ''}`}
                  style={{ backgroundColor: colorDef.color }}
                  onClick={() => handleColorClick(colorDef.color)}
                  onContextMenu={(e) => handleColorContextMenu(e, colorDef)}
                  onTouchStart={() => handleLongPressStart(colorDef)}
                  onTouchEnd={handleLongPressCancel}
                  onTouchMove={handleLongPressCancel}
                  onMouseDown={colorDef.isCustom ? handleLongPressCancel : undefined}
                  title={colorDef.label}
                >
                  {selectedColor === colorDef.color && (
                    <span className="dmt-color-checkmark">            
                    <dc.Icon icon="lucide-check" />
                    </span>
                  )}
                </button>
                
                {isShowingDelete && colorDef.isCustom && (
                  <div
                    className="dmt-color-delete-button"
                    onClick={(e) => handleDeleteClick(e, colorDef.id)}
                    onMouseDown={(e) => e.stopPropagation()}
                    title="Delete custom color"
                  >
                    <dc.Icon icon="lucide-trash-2" />
                  </div>
                )}
              </div>
            );
          }
        })}
      </div>
    </div>
  );
};

return { ColorPicker };
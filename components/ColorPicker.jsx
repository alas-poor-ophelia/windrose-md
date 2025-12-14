// components/ColorPicker.jsx - With custom color delete functionality
const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);
const { getColorPalette, DEFAULT_COLOR } = await requireModuleByName("colorOperations.js");

const ColorPicker = ({ 
  isOpen, 
  selectedColor, 
  onColorSelect, 
  onClose, 
  onReset,
  customColors = [],
  paletteColorOpacityOverrides = {},  // Per-map opacity overrides for palette colors
  onAddCustomColor,
  onDeleteCustomColor,
  onUpdateColorOpacity,  // Callback to update any color's opacity (custom or palette)
  pendingCustomColorRef,
  title = 'Color',
  position = 'below', // 'below' or 'above'
  align = 'left',     // 'left' or 'right'
  opacity = 1,  // Current opacity value (0-1), optional
  onOpacityChange = null  // Callback when opacity changes, optional
}) => {
  const [previewColor, setPreviewColor] = dc.useState(null);
  const [editTargetId, setEditTargetId] = dc.useState(null);  // Which custom color is being edited
  const [editingOpacity, setEditingOpacity] = dc.useState(1); // Opacity value while editing
  const colorInputRef = dc.useRef(null);
  const longPressTimerRef = dc.useRef(null);
  const editingOpacityRef = dc.useRef(editingOpacity);
  const editTargetIdRef = dc.useRef(editTargetId);
  const justOpenedEditRef = dc.useRef(false); // Prevents immediate close after opening
  const longPressTriggeredRef = dc.useRef(false); // Prevents click after long press
  
  // Keep refs in sync with state
  editingOpacityRef.current = editingOpacity;
  editTargetIdRef.current = editTargetId;
  
  // Helper to save opacity changes
  const saveOpacityChanges = dc.useCallback(() => {
    const targetId = editTargetIdRef.current;
    const currentOpacity = editingOpacityRef.current;
    
    console.log('[ColorPicker] saveOpacityChanges called:', { 
      targetId, 
      currentOpacity,
      hasUpdateHandler: !!onUpdateColorOpacity,
      hasOpacityHandler: !!onOpacityChange
    });
    
    if (!targetId) {
      console.log('[ColorPicker] No targetId, aborting save');
      return;
    }
    
    // Get the original opacity to check if it changed
    const customColor = customColors.find(c => c.id === targetId);
    const paletteOverride = paletteColorOpacityOverrides[targetId];
    const originalOpacity = customColor?.opacity ?? paletteOverride ?? 1;
    
    console.log('[ColorPicker] Opacity check:', { 
      currentOpacity, 
      originalOpacity, 
      isCustomColor: !!customColor,
      willSave: currentOpacity !== originalOpacity 
    });
    
    // Persist opacity change if it differs from original
    if (onUpdateColorOpacity && currentOpacity !== originalOpacity) {
      console.log('[ColorPicker] Calling onUpdateColorOpacity');
      onUpdateColorOpacity(targetId, currentOpacity);
    }
    
    // Also apply to brush opacity
    if (onOpacityChange) {
      console.log('[ColorPicker] Applying to brush opacity');
      onOpacityChange(currentOpacity);
    }
  }, [customColors, paletteColorOpacityOverrides, onUpdateColorOpacity, onOpacityChange]);
  
  // Helper to save and close edit panel
  const saveAndCloseEditPanel = dc.useCallback(() => {
    console.log('[ColorPicker] saveAndCloseEditPanel called:', {
      editTargetId: editTargetIdRef.current,
      justOpened: justOpenedEditRef.current
    });
    
    if (!editTargetIdRef.current) return;
    if (justOpenedEditRef.current) return; // Don't close immediately after opening
    
    saveOpacityChanges();
    setEditTargetId(null);
  }, [saveOpacityChanges]);
  
  // Save when picker closes from outside (e.g., clicking outside entirely)
  dc.useEffect(() => {
    console.log('[ColorPicker] isOpen effect:', { isOpen, editTargetId: editTargetIdRef.current });
    if (!isOpen && editTargetIdRef.current) {
      console.log('[ColorPicker] Picker closing with edit open, saving...');
      saveOpacityChanges();
      setEditTargetId(null);
    }
  }, [isOpen, saveOpacityChanges]);
  
  if (!isOpen) return null;
  
  // Prevent clicks inside picker from closing it (the picker itself)
  const handlePickerClick = (e) => {
    e.stopPropagation();
  };
  
  // Handle mousedown - close edit panel if clicking outside it, but keep picker open
  const handlePickerMouseDown = (e) => {
    e.stopPropagation();
    
    console.log('[ColorPicker] handlePickerMouseDown:', {
      editTargetId,
      isEditPanel: !!e.target.closest('.dmt-color-edit-panel'),
      justOpened: justOpenedEditRef.current
    });
    
    // If edit panel is open and click is outside it, close and save
    if (editTargetId && !e.target.closest('.dmt-color-edit-panel')) {
      if (!justOpenedEditRef.current) {
        saveAndCloseEditPanel();
      }
    }
  };
  
  // Handle touch - close edit panel if touching outside it, prevent propagation to canvas
  const handlePickerTouch = (e) => {
    e.stopPropagation();
    
    console.log('[ColorPicker] handlePickerTouch:', {
      editTargetId,
      isEditPanel: !!e.target.closest('.dmt-color-edit-panel'),
      justOpened: justOpenedEditRef.current
    });
    
    // If edit panel is open and touch is outside it, close and save
    // But not if it was just opened (from long press)
    if (editTargetId && !e.target.closest('.dmt-color-edit-panel')) {
      if (!justOpenedEditRef.current) {
        saveAndCloseEditPanel();
      }
    }
  };
  
  const handleColorClick = (colorDef) => {
    // Skip if this click is from releasing a long press
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    
    onColorSelect(colorDef.color);
    
    // Apply stored opacity if this color has one
    if (onOpacityChange && colorDef.opacity !== undefined) {
      onOpacityChange(colorDef.opacity);
    }
  };
  
  const handleReset = (e) => {
    e.stopPropagation();
    onReset();
  };
  
  // Handle live color preview - value includes alpha from native picker
  const handleColorInput = (e) => {
    setPreviewColor(e.target.value);
    if (pendingCustomColorRef) {
      pendingCustomColorRef.current = e.target.value;
    }
  };
  
  // When the color input loses focus, don't save yet - let the picker-close handler do it
  const handleColorBlur = (e) => {
    // Actual save happens on picker close via ToolPalette
  };
  
  // Handle click on the add button to show preview immediately
  const handleAddClick = () => {
    setPreviewColor('#888888');
    if (pendingCustomColorRef) {
      pendingCustomColorRef.current = '#888888';
    }
  };
  
  // Handle right-click on color to show edit options
  const handleColorContextMenu = (e, colorDef) => {
    if (colorDef.isReset || colorDef.isAddButton || colorDef.isPreview) return;
    e.preventDefault();
    e.stopPropagation();
    console.log('[ColorPicker] Context menu opening edit panel:', { 
      colorId: colorDef.id, 
      colorOpacity: colorDef.opacity,
      settingOpacityTo: colorDef.opacity ?? 1 
    });
    setEditTargetId(colorDef.id);
    setEditingOpacity(colorDef.opacity ?? 1);
    // Brief protection against immediate close
    justOpenedEditRef.current = true;
    setTimeout(() => { justOpenedEditRef.current = false; }, 100);
  };
  
  // Handle long-press start for touch devices
  const handleLongPressStart = (colorDef) => {
    if (colorDef.isReset || colorDef.isAddButton || colorDef.isPreview) return;
    longPressTriggeredRef.current = false; // Reset at start
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true; // Mark that long press completed
      console.log('[ColorPicker] Long press opening edit panel:', { 
        colorId: colorDef.id, 
        colorOpacity: colorDef.opacity,
        settingOpacityTo: colorDef.opacity ?? 1 
      });
      setEditTargetId(colorDef.id);
      setEditingOpacity(colorDef.opacity ?? 1);
      // Protection against immediate close from touch release
      justOpenedEditRef.current = true;
      setTimeout(() => { justOpenedEditRef.current = false; }, 300);
    }, 500); // 500ms for long press
  };
  
  // Handle long-press cancel (finger moved or lifted before 500ms)
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
    setEditTargetId(null);
  };
  
  // Handle opacity change while editing
  const handleEditOpacityChange = (e, colorId) => {
    e.stopPropagation();
    const newOpacity = parseInt(e.target.value, 10) / 100;
    console.log('[ColorPicker] Slider onChange:', { colorId, newOpacity, rawValue: e.target.value });
    setEditingOpacity(newOpacity);
  };
  
  // Combine all colors into a single array for rendering
  // getColorPalette() returns built-in + global custom colors from settings
  const paletteColors = getColorPalette();
  
  // Apply per-map opacity overrides to palette colors
  const paletteColorsWithOverrides = paletteColors.map(c => {
    const override = paletteColorOpacityOverrides[c.id];
    return override !== undefined ? { ...c, opacity: override } : c;
  });
  
  const allColors = [
    { id: 'reset', color: null, label: 'Reset to default', isReset: true },
    ...paletteColorsWithOverrides,
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
  
  // Determine horizontal alignment
  const horizontalStyle = align === 'right' 
    ? { right: '0', left: 'auto' }
    : { left: '0' };
  
  return (
    <div 
      className="dmt-color-picker" 
      onClick={handlePickerClick}
      onMouseDown={handlePickerMouseDown}
      onTouchStart={handlePickerTouch}
      onTouchMove={handlePickerTouch}
      onTouchEnd={handlePickerTouch}
      style={{
        position: 'absolute',
        ...(position === 'above' 
          ? { bottom: 'calc(100% + 8px)', top: 'auto' }
          : { top: 'calc(100% + 8px)' }
        ),
        ...horizontalStyle,
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
            // Render preview color swatch - color value includes alpha from native picker
            return (
              <div
                key={colorDef.id}
                className="dmt-color-swatch dmt-color-swatch-preview"
                style={{ backgroundColor: colorDef.color }}
                title="Selecting..."
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
            // Regular color swatch with optional edit panel
            const isEditing = editTargetId === colorDef.id;
            const displayOpacity = isEditing ? editingOpacity : (colorDef.opacity ?? 1);
            const hasStoredOpacity = (colorDef.opacity ?? 1) < 1;
            
            return (
              <div key={colorDef.id} style={{ position: 'relative', display: 'inline-block' }}>
                <button
                  className={`dmt-color-swatch interactive-child ${selectedColor === colorDef.color ? 'dmt-color-swatch-selected' : ''}`}
                  style={{ 
                    backgroundColor: colorDef.color,
                    opacity: displayOpacity
                  }}
                  onClick={() => handleColorClick(colorDef)}
                  onContextMenu={(e) => handleColorContextMenu(e, colorDef)}
                  onTouchStart={() => handleLongPressStart(colorDef)}
                  onTouchEnd={handleLongPressCancel}
                  onTouchMove={handleLongPressCancel}
                  onMouseDown={handleLongPressCancel}
                  title={colorDef.label + (hasStoredOpacity ? ` (${Math.round((colorDef.opacity ?? 1) * 100)}%)` : '')}
                >
                  {selectedColor === colorDef.color && (
                    <span className="dmt-color-checkmark">            
                    <dc.Icon icon="lucide-check" />
                    </span>
                  )}
                </button>
                
                {/* Edit panel - opacity slider for all colors, delete only for custom */}
                {isEditing && (
                  <div
                    className="dmt-color-edit-panel"
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                  >
                    <div className="dmt-color-edit-opacity">
                      <span className="dmt-color-edit-opacity-label">Opacity</span>
                      <input
                        type="range"
                        min="10"
                        max="100"
                        value={Math.round(editingOpacity * 100)}
                        onChange={(e) => handleEditOpacityChange(e, colorDef.id)}
                        onInput={(e) => handleEditOpacityChange(e, colorDef.id)}
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                      />
                      <span className="dmt-color-edit-opacity-value">{Math.round(editingOpacity * 100)}%</span>
                    </div>
                    {colorDef.isCustom && (
                      <button
                        className="dmt-color-edit-delete"
                        onClick={(e) => handleDeleteClick(e, colorDef.id)}
                        title="Delete custom color"
                      >
                        <dc.Icon icon="lucide-trash-2" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          }
        })}
      </div>
      
      {/* Opacity slider - only show when onOpacityChange is provided */}
      {onOpacityChange && (
        <div className="dmt-color-opacity-section">
          <div className="dmt-color-opacity-header">
            <span className="dmt-color-opacity-label">Opacity</span>
            <span className="dmt-color-opacity-value">{Math.round(opacity * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round(opacity * 100)}
            onChange={(e) => onOpacityChange(parseInt(e.target.value, 10) / 100)}
            className="dmt-color-opacity-slider"
          />
        </div>
      )}
    </div>
  );
};

return { ColorPicker };
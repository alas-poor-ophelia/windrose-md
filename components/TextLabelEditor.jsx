// components/TextLabelEditor.jsx - Comprehensive text label editor with styling options

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { FONT_OPTIONS, DEFAULT_FONT, DEFAULT_FONT_SIZE, DEFAULT_TEXT_COLOR, FONT_SIZE_MIN, FONT_SIZE_MAX, FONT_SIZE_STEP, getFontOption } = await requireModuleByName("fontOptions.js");
const { ColorPicker } = await requireModuleByName("ColorPicker.jsx");
const { COLOR_PALETTE } = await requireModuleByName("colorOperations.js");

const TextLabelEditor = ({ 
  initialValue = '', 
  initialFontSize = DEFAULT_FONT_SIZE,
  initialFontFace = DEFAULT_FONT,
  initialColor = DEFAULT_TEXT_COLOR,
  onSubmit, 
  onCancel, 
  isEditing = false,
  customColors = [],
  onAddCustomColor,
  onDeleteCustomColor
}) => {
  const [text, setText] = dc.useState(initialValue);
  const [fontSize, setFontSize] = dc.useState(initialFontSize);
  const [fontSizeInput, setFontSizeInput] = dc.useState(String(initialFontSize)); // Raw input for typing
  const [fontFace, setFontFace] = dc.useState(initialFontFace);
  const [color, setColor] = dc.useState(initialColor);
  const [isColorPickerOpen, setIsColorPickerOpen] = dc.useState(false);
  const [showPreview, setShowPreview] = dc.useState(false);
  
  const inputRef = dc.useRef(null);
  const colorBtnRef = dc.useRef(null);
  const pendingCustomColorRef = dc.useRef(null);
  
  // Auto-focus input when modal opens
  dc.useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      // Select all text if editing existing label
      if (initialValue) {
        inputRef.current.select();
      }
    }
  }, []);
  
  // Handle keyboard shortcuts
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };
  
  const handleSubmit = () => {
    const trimmed = text.trim();
    if (trimmed.length > 0 && trimmed.length <= 200) {
      const labelData = {
        content: trimmed,
        fontSize: fontSize,
        fontFace: fontFace,
        color: color
      };
      onSubmit(labelData);
    }
  };
  
  // Prevent clicks inside modal from closing it
  const handleModalClick = (e) => {
    e.stopPropagation();
  };
  
  // Handle font size input change (no clamping during typing)
  const handleFontSizeInputChange = (e) => {
    setFontSizeInput(e.target.value);
  };
  
  // Handle font size blur - clamp and apply
  const handleFontSizeBlur = () => {
    const value = parseInt(fontSizeInput, 10);
    if (!isNaN(value) && value > 0) {
      const clamped = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, value));
      setFontSize(clamped);
      setFontSizeInput(String(clamped));
    } else {
      // Invalid input - reset to current fontSize
      setFontSizeInput(String(fontSize));
    }
  };
  
  // Handle font face change
  const handleFontFaceChange = (e) => {
    setFontFace(e.target.value);
  };
  
  // Color picker handlers
  const handleColorPickerToggle = (e) => {
    e.stopPropagation();
    setIsColorPickerOpen(!isColorPickerOpen);
  };
  
  const handleColorSelect = (newColor) => {
    setColor(newColor);
  };
  
  const handleColorReset = () => {
    setColor(DEFAULT_TEXT_COLOR);
    setIsColorPickerOpen(false);
  };
  
  const handleCloseColorPicker = () => {
    setIsColorPickerOpen(false);
  };
  
  const handleAddCustomColor = (newColor) => {
    if (onAddCustomColor) {
      // Pass raw color string - parent handles wrapping into color object
      onAddCustomColor(newColor);
    }
  };
  
  const handleDeleteCustomColor = (colorId) => {
    if (onDeleteCustomColor) {
      onDeleteCustomColor(colorId);
    }
  };
  
  // Close color picker when clicking outside
  dc.useEffect(() => {
    if (isColorPickerOpen) {
      const handleClickOutside = (e) => {
        // Check if click is inside the color picker or the color button
        const pickerElement = e.target.closest('.dmt-color-picker');
        const buttonElement = e.target.closest('.dmt-text-editor-color-button');
        
        if (!pickerElement && !buttonElement) {
          // Click is outside - save any pending color and close the picker
          if (pendingCustomColorRef.current) {
            handleAddCustomColor(pendingCustomColorRef.current);
            setColor(pendingCustomColorRef.current);
            pendingCustomColorRef.current = null;
          }
          
          handleCloseColorPicker();
        }
      };
      
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('touchstart', handleClickOutside);
      };
    }
  }, [isColorPickerOpen]);
  
  return (
    <div className="dmt-modal-overlay" onClick={onCancel}>
      <div 
        className="dmt-modal-content dmt-text-editor-modal" 
        onClick={handleModalClick}
      >
        <h3 className="dmt-modal-title">
          {isEditing ? 'Edit Text Label' : 'Add Text Label'}
        </h3>
        
        {/* Text input */}
        <div className="dmt-text-editor-section">
          <label className="dmt-text-editor-label">Text</label>
          <input
            ref={inputRef}
            type="text"
            className="dmt-modal-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={200}
            placeholder="Enter label text..."
          />
        </div>
        
        {/* Font controls row */}
        <div className="dmt-text-editor-row">
          {/* Font face dropdown */}
          <div className="dmt-text-editor-section dmt-text-editor-section-grow">
            <label className="dmt-text-editor-label">Font</label>
            <select 
              className="dmt-text-editor-select"
              value={fontFace}
              onChange={handleFontFaceChange}
            >
              {FONT_OPTIONS.map(font => (
                <option key={font.id} value={font.id}>
                  {font.name}
                </option>
              ))}
            </select>
          </div>
          
          {/* Font size input */}
          <div className="dmt-text-editor-section dmt-text-editor-section-small">
            <label className="dmt-text-editor-label">Size</label>
            <input
              type="number"
              className="dmt-text-editor-number"
              value={fontSizeInput}
              onChange={handleFontSizeInputChange}
              onBlur={handleFontSizeBlur}
              min={FONT_SIZE_MIN}
              max={FONT_SIZE_MAX}
              step={FONT_SIZE_STEP}
            />
          </div>
        </div>
        
        {/* Color picker section */}
        <div className="dmt-text-editor-section">
          <label className="dmt-text-editor-label">Color</label>
          <div style={{ position: 'relative' }}>
            <button
              ref={colorBtnRef}
              className="dmt-text-editor-color-button"
              onClick={handleColorPickerToggle}
              style={{ backgroundColor: color }}
              title="Select text color"
            >
              <span className="dmt-text-editor-color-label">
                {color.toUpperCase()}
              </span>
            </button>
            
            {isColorPickerOpen && (
              <ColorPicker
                isOpen={isColorPickerOpen}
                selectedColor={color}
                onColorSelect={handleColorSelect}
                onClose={handleCloseColorPicker}
                onReset={handleColorReset}
                customColors={customColors}
                onAddCustomColor={handleAddCustomColor}
                onDeleteCustomColor={handleDeleteCustomColor}
                pendingCustomColorRef={pendingCustomColorRef}
                title="Text Color"
              />
            )}
          </div>
        </div>
        
        {/* Live Preview Toggle & Section */}
        {text.trim().length > 0 && (
          <div className="dmt-text-editor-section">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <label className="dmt-text-editor-label">Preview</label>
              <button
                type="button"
                className="dmt-text-editor-preview-toggle"
                onClick={() => setShowPreview(!showPreview)}
                title={showPreview ? 'Hide preview' : 'Show preview'}
              >
                <dc.Icon icon="lucide-eye" />
              </button>
            </div>
            
            {showPreview && (
              <div 
                className="dmt-text-editor-preview"
                style={{
                  fontSize: `${fontSize}px`,
                  fontFamily: getFontOption(fontFace)?.css || 'sans-serif',
                  color: color,
                  textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000'
                }}
              >
                {text}
              </div>
            )}
          </div>
        )}
        
        {/* Action buttons */}
        <div className="dmt-modal-buttons">
          <button 
            className="dmt-modal-btn dmt-modal-btn-cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button 
            className="dmt-modal-btn dmt-modal-btn-submit"
            onClick={handleSubmit}
            disabled={text.trim().length === 0}
          >
            {isEditing ? 'Update' : 'Add Label'}
          </button>
        </div>
        
        <div className="dmt-modal-hint">
          Press Enter to confirm, Esc to cancel
        </div>
      </div>
    </div>
  );
};

return { TextLabelEditor };
// components/TextLabelEditor.jsx - Comprehensive text label editor with styling options

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { FONT_OPTIONS, DEFAULT_FONT, DEFAULT_FONT_SIZE, DEFAULT_TEXT_COLOR, FONT_SIZE_MIN, FONT_SIZE_MAX, FONT_SIZE_STEP, getFontOption } = await requireModuleByName("fontOptions.ts");
const { ColorPicker } = await requireModuleByName("ColorPicker.tsx");
const { COLOR_PALETTE, getColorPalette } = await requireModuleByName("colorOperations.ts");
const { isBridgeAvailable, getObsidianModule } = await requireModuleByName("obsidianBridge.ts");

/**
 * Opens a native Obsidian Modal for text label editing.
 * Uses native DOM for all UI including color palette.
 * Returns true if native modal opened, false to fall back to Preact.
 */
function openNativeTextLabelEditor(options) {
  if (!isBridgeAvailable()) return false;

  try {
    const obs = getObsidianModule();
    const ModalClass = obs.Modal;
    const SettingClass = obs.Setting;
    const app = dc.app;

    const {
      initialValue = '',
      initialFontSize = DEFAULT_FONT_SIZE,
      initialFontFace = DEFAULT_FONT,
      initialColor = DEFAULT_TEXT_COLOR,
      initialOpacity = 1,
      isEditing = false,
      customColors = [],
      onAddCustomColor,
      onDeleteCustomColor,
      onSubmit,
      onCancel
    } = options;

    let currentText = initialValue;
    let currentFontSize = initialFontSize;
    let currentFontFace = initialFontFace;
    let currentColor = initialColor;
    let currentOpacity = initialOpacity;

    const modal = new (class extends ModalClass {
      submitted = false;
      inputEl = null;
      fontSizeInput = null;
      opacityInput = null;
      opacityValueEl = null;
      previewEl = null;
      colorBtnEl = null;
      swatchContainerEl = null;

      onOpen() {
        const { contentEl, titleEl } = this;
        titleEl.setText(isEditing ? 'Edit Text Label' : 'Add Text Label');
        contentEl.addClass('dmt-text-editor-native');
        this.modalEl.style.width = '520px';

        // Text input
        const textSection = contentEl.createDiv('dmt-text-editor-section');
        textSection.createEl('label', { text: 'Text', cls: 'dmt-text-editor-label' });
        this.inputEl = textSection.createEl('input', {
          type: 'text',
          placeholder: 'Enter label text...',
          cls: 'dmt-modal-input',
          value: initialValue
        });
        this.inputEl.maxLength = 200;
        this.inputEl.style.width = '100%';
        this.inputEl.addEventListener('input', (e) => {
          currentText = e.target.value;
          this.updatePreview();
        });
        this.inputEl.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.submit();
          }
        });

        // Font controls row
        const controlsRow = contentEl.createDiv();
        controlsRow.style.display = 'flex';
        controlsRow.style.gap = '12px';
        controlsRow.style.marginBottom = '12px';

        // Font dropdown
        const fontSection = controlsRow.createDiv();
        fontSection.style.flex = '1';
        fontSection.createEl('label', { text: 'Font', cls: 'dmt-text-editor-label' });
        const fontSelect = fontSection.createEl('select', { cls: 'dmt-text-editor-select' });
        fontSelect.style.width = '100%';
        for (const font of FONT_OPTIONS) {
          const opt = fontSelect.createEl('option', { text: font.name, value: font.id });
          if (font.id === initialFontFace) opt.selected = true;
        }
        fontSelect.addEventListener('change', (e) => {
          currentFontFace = e.target.value;
          this.updatePreview();
        });

        // Font size
        const sizeSection = controlsRow.createDiv();
        sizeSection.style.width = '80px';
        sizeSection.createEl('label', { text: 'Size', cls: 'dmt-text-editor-label' });
        this.fontSizeInput = sizeSection.createEl('input', {
          type: 'number',
          cls: 'dmt-text-editor-number',
          value: String(initialFontSize)
        });
        this.fontSizeInput.min = String(FONT_SIZE_MIN);
        this.fontSizeInput.max = String(FONT_SIZE_MAX);
        this.fontSizeInput.step = String(FONT_SIZE_STEP);
        this.fontSizeInput.style.width = '100%';
        this.fontSizeInput.addEventListener('change', (e) => {
          const val = parseInt(e.target.value, 10);
          if (!isNaN(val) && val > 0) {
            currentFontSize = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, val));
            this.fontSizeInput.value = String(currentFontSize);
          }
          this.updatePreview();
        });

        // Color section
        const colorSection = contentEl.createDiv('dmt-text-editor-section');
        colorSection.createEl('label', { text: 'Color', cls: 'dmt-text-editor-label' });

        this.colorBtnEl = colorSection.createEl('button', { cls: 'dmt-text-editor-color-button' });
        this.colorBtnEl.style.backgroundColor = currentColor;
        this.colorBtnEl.createSpan({ text: currentColor.toUpperCase(), cls: 'dmt-text-editor-color-label' });
        this.colorBtnEl.title = 'Select text color';
        this.colorBtnEl.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleSwatches();
        });

        // Color swatches (hidden by default)
        this.swatchContainerEl = colorSection.createDiv('dmt-native-color-swatches');
        this.swatchContainerEl.style.display = 'none';
        this.buildSwatches();

        // Opacity slider
        const opacitySection = contentEl.createDiv('dmt-text-editor-section');
        opacitySection.createEl('label', { text: 'Opacity', cls: 'dmt-text-editor-label' });
        const opacityRow = opacitySection.createDiv();
        opacityRow.style.display = 'flex';
        opacityRow.style.alignItems = 'center';
        opacityRow.style.gap = '8px';
        this.opacityInput = opacityRow.createEl('input', { type: 'range' });
        this.opacityInput.min = '0';
        this.opacityInput.max = '1';
        this.opacityInput.step = '0.05';
        this.opacityInput.value = String(currentOpacity);
        this.opacityInput.style.flex = '1';
        this.opacityValueEl = opacityRow.createSpan({ text: `${Math.round(currentOpacity * 100)}%` });
        this.opacityValueEl.style.minWidth = '36px';
        this.opacityValueEl.style.textAlign = 'right';
        this.opacityInput.addEventListener('input', (e) => {
          currentOpacity = parseFloat(e.target.value);
          this.opacityValueEl.textContent = `${Math.round(currentOpacity * 100)}%`;
          this.updatePreview();
        });

        // Preview
        this.previewEl = contentEl.createDiv('dmt-text-editor-preview');
        this.previewEl.style.display = 'none';
        this.updatePreview();

        // Buttons
        const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

        const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
        cancelBtn.addEventListener('click', () => this.close());

        const submitBtn = buttonContainer.createEl('button', {
          text: isEditing ? 'Update' : 'Add Label',
          cls: 'mod-cta'
        });
        submitBtn.addEventListener('click', () => this.submit());

        const hint = contentEl.createDiv('dmt-modal-hint');
        hint.setText('Press Enter to confirm, Esc to cancel');

        setTimeout(() => {
          this.inputEl.focus();
          if (initialValue) this.inputEl.select();
        }, 0);
      }

      buildSwatches() {
        this.swatchContainerEl.empty();

        const palette = getColorPalette();
        const allCustom = customColors || [];

        // Built-in palette
        const paletteRow = this.swatchContainerEl.createDiv();
        paletteRow.style.display = 'flex';
        paletteRow.style.flexWrap = 'wrap';
        paletteRow.style.gap = '4px';
        paletteRow.style.marginBottom = '8px';

        for (const c of palette) {
          const swatch = paletteRow.createEl('button');
          swatch.style.width = '24px';
          swatch.style.height = '24px';
          swatch.style.borderRadius = '4px';
          swatch.style.border = c.color === currentColor ? '2px solid var(--text-accent)' : '1px solid var(--background-modifier-border)';
          swatch.style.backgroundColor = c.color;
          swatch.style.cursor = 'pointer';
          swatch.style.padding = '0';
          swatch.title = c.label;
          swatch.addEventListener('click', () => this.selectColor(c.color));
        }

        // Custom colors
        if (allCustom.length > 0) {
          const customRow = this.swatchContainerEl.createDiv();
          customRow.style.display = 'flex';
          customRow.style.flexWrap = 'wrap';
          customRow.style.gap = '4px';
          customRow.style.marginBottom = '8px';

          for (const c of allCustom) {
            const swatch = customRow.createEl('button');
            swatch.style.width = '24px';
            swatch.style.height = '24px';
            swatch.style.borderRadius = '4px';
            swatch.style.border = c.color === currentColor ? '2px solid var(--text-accent)' : '1px solid var(--background-modifier-border)';
            swatch.style.backgroundColor = c.color;
            swatch.style.cursor = 'pointer';
            swatch.style.padding = '0';
            swatch.title = c.label || c.color;
            swatch.addEventListener('click', () => this.selectColor(c.color));
          }
        }

        // Native color input for custom colors
        const customRow = this.swatchContainerEl.createDiv();
        customRow.style.display = 'flex';
        customRow.style.alignItems = 'center';
        customRow.style.gap = '8px';

        const colorInput = customRow.createEl('input', { type: 'color' });
        colorInput.value = currentColor;
        colorInput.style.width = '32px';
        colorInput.style.height = '32px';
        colorInput.style.border = 'none';
        colorInput.style.padding = '0';
        colorInput.style.cursor = 'pointer';
        colorInput.addEventListener('input', (e) => {
          this.selectColor(e.target.value);
        });

        const addBtn = customRow.createEl('button', { text: 'Save Color', cls: 'dmt-modal-btn' });
        addBtn.style.fontSize = '12px';
        addBtn.style.padding = '4px 8px';
        addBtn.addEventListener('click', () => {
          if (onAddCustomColor) onAddCustomColor(currentColor);
          this.buildSwatches();
        });

        // Reset button
        const resetBtn = customRow.createEl('button', { text: 'Reset', cls: 'dmt-modal-btn' });
        resetBtn.style.fontSize = '12px';
        resetBtn.style.padding = '4px 8px';
        resetBtn.addEventListener('click', () => {
          this.selectColor(DEFAULT_TEXT_COLOR);
        });
      }

      selectColor(color) {
        currentColor = color;
        this.colorBtnEl.style.backgroundColor = color;
        this.colorBtnEl.querySelector('.dmt-text-editor-color-label').textContent = color.toUpperCase();
        this.updatePreview();
      }

      toggleSwatches() {
        const visible = this.swatchContainerEl.style.display !== 'none';
        this.swatchContainerEl.style.display = visible ? 'none' : 'block';
      }

      updatePreview() {
        if (!this.previewEl) return;
        const text = currentText.trim();
        if (text.length > 0) {
          this.previewEl.style.display = 'flex';
          this.previewEl.style.padding = '16px';
          this.previewEl.textContent = text;
          const fontOption = getFontOption(currentFontFace);
          this.previewEl.style.fontSize = `${currentFontSize}px`;
          this.previewEl.style.fontFamily = fontOption?.css || 'sans-serif';
          this.previewEl.style.color = currentColor;
          this.previewEl.style.opacity = String(currentOpacity);
          this.previewEl.style.textShadow = '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000';
        } else {
          this.previewEl.style.display = 'none';
        }
      }

      submit() {
        const trimmed = currentText.trim();
        if (trimmed.length > 0 && trimmed.length <= 200) {
          this.submitted = true;
          onSubmit({
            content: trimmed,
            fontSize: currentFontSize,
            fontFace: currentFontFace,
            color: currentColor,
            opacity: currentOpacity
          });
          this.close();
        }
      }

      onClose() {
        if (!this.submitted && onCancel) {
          onCancel();
        }
        this.contentEl.empty();
      }
    })(app);

    modal.open();
    return true;
  } catch (e) {
    console.warn('[Windrose] Failed to open native TextLabelEditor, falling back to Preact:', e.message);
    return false;
  }
}

const TextLabelEditor = ({
  initialValue = '',
  initialFontSize = DEFAULT_FONT_SIZE,
  initialFontFace = DEFAULT_FONT,
  initialColor = DEFAULT_TEXT_COLOR,
  initialOpacity = 1,
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
  const [opacity, setOpacity] = dc.useState(initialOpacity);
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
        color: color,
        opacity: opacity
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
      document.addEventListener('touchstart', handleClickOutside, { passive: true });

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
        
        {/* Opacity slider */}
        <div className="dmt-text-editor-section">
          <label className="dmt-text-editor-label">Opacity</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={opacity}
              onChange={(e) => setOpacity(parseFloat(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={{ minWidth: '36px', textAlign: 'right' }}>
              {Math.round(opacity * 100)}%
            </span>
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
                  opacity: opacity,
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

return { TextLabelEditor, openNativeTextLabelEditor };
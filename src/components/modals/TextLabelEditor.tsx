// components/TextLabelEditor.jsx - Comprehensive text label editor with styling options









/**
 * Opens a native Obsidian Modal for text label editing.
 * Uses native DOM for all UI including color palette.
 * Returns true if native modal opened, false to fall back to Preact.
 */

import { render as preactRender, h } from 'preact';
import type { JSX, VNode } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { FONT_OPTIONS, DEFAULT_FONT, DEFAULT_FONT_SIZE, DEFAULT_TEXT_COLOR, FONT_SIZE_MIN, FONT_SIZE_MAX, FONT_SIZE_STEP, getFontOption } from '../../text/fontOptions';
import { ColorPicker } from '../shared/ColorPicker';
import type { CustomColor } from '#types/core/common.types';
import { Modal } from 'obsidian';
import type { App } from 'obsidian';
import { Icon } from '../shared/Icon';
import type { HexColor } from '#types/core/common.types';

interface TextLabelSubmission {
  content: string;
  fontSize: number;
  fontFace: string;
  color: string;
  opacity: number;
}

interface OpenNativeTextLabelEditorOptions {
  initialValue?: string;
  initialFontSize?: number;
  initialFontFace?: string;
  initialColor?: string;
  initialOpacity?: number;
  isEditing?: boolean;
  customColors?: CustomColor[];
  onAddCustomColor?: (color: HexColor) => void;
  onDeleteCustomColor?: (colorId: string) => void;
  onSubmit: (data: TextLabelSubmission) => void;
  onCancel: () => void;
}

function openNativeTextLabelEditor(app: App, options: OpenNativeTextLabelEditorOptions): boolean {
  try {
    const ModalClass = Modal;

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
      inputEl!: HTMLInputElement;
      fontSizeInput!: HTMLInputElement;
      opacityInput!: HTMLInputElement;
      opacityValueEl!: HTMLSpanElement;
      previewEl!: HTMLDivElement;
      colorBtnEl!: HTMLButtonElement;
      colorPickerContainerEl!: HTMLDivElement;
      isPickerOpen = false;
      pendingCustomColorRef = { current: null as string | null };
      clickOutsideHandler: ((e: MouseEvent) => void) | null = null;

      onOpen(): void {
        const { contentEl, titleEl } = this;
        titleEl.setText(isEditing ? 'Edit Text Label' : 'Add Text Label');
        contentEl.addClass('dmt-text-editor-native');
        this.modalEl.addClass('windrose-tle-modal');

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
        this.inputEl.addEventListener('input', (e: Event) => {
          currentText = (e.target as HTMLInputElement).value;
          this.updatePreview();
        });
        this.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.submit();
          }
        });

        // Font controls row
        const controlsRow = contentEl.createDiv('windrose-tle-controls-row');

        // Font dropdown
        const fontSection = controlsRow.createDiv('dmt-text-editor-section-grow');
        fontSection.createEl('label', { text: 'Font', cls: 'dmt-text-editor-label' });
        const fontSelect = fontSection.createEl('select', { cls: 'dmt-text-editor-select' });
        for (const font of FONT_OPTIONS) {
          const opt = fontSelect.createEl('option', { text: font.name, value: font.id });
          if (font.id === initialFontFace) opt.selected = true;
        }
        fontSelect.addEventListener('change', (e: Event) => {
          currentFontFace = (e.target as HTMLSelectElement).value;
          this.updatePreview();
        });

        // Font size
        const sizeSection = controlsRow.createDiv('dmt-text-editor-section-small');
        sizeSection.createEl('label', { text: 'Size', cls: 'dmt-text-editor-label' });
        this.fontSizeInput = sizeSection.createEl('input', {
          type: 'number',
          cls: 'dmt-text-editor-number',
          value: String(initialFontSize)
        });
        this.fontSizeInput.min = String(FONT_SIZE_MIN);
        this.fontSizeInput.max = String(FONT_SIZE_MAX);
        this.fontSizeInput.step = String(FONT_SIZE_STEP);
        this.fontSizeInput.addEventListener('change', (e: Event) => {
          const val = parseInt((e.target as HTMLInputElement).value, 10);
          if (!isNaN(val) && val > 0) {
            currentFontSize = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, val));
            this.fontSizeInput.value = String(currentFontSize);
          }
          this.updatePreview();
        });

        // Color section
        const colorSection = contentEl.createDiv('dmt-text-editor-section');
        colorSection.createEl('label', { text: 'Color', cls: 'dmt-text-editor-label' });

        const colorWrapper = colorSection.createDiv('windrose-tle-color-wrapper');

        this.colorBtnEl = colorWrapper.createEl('button', { cls: 'dmt-text-editor-color-button' });
        this.colorBtnEl.style.setProperty('background-color', currentColor);
        this.colorBtnEl.createSpan({ text: currentColor.toUpperCase(), cls: 'dmt-text-editor-color-label' });
        this.colorBtnEl.title = 'Select text color';
        this.colorBtnEl.addEventListener('click', (e: MouseEvent) => {
          e.stopPropagation();
          this.isPickerOpen = !this.isPickerOpen;
          this.renderColorPicker();
        });

        this.colorPickerContainerEl = colorWrapper.createDiv();

        // Opacity slider
        const opacitySection = contentEl.createDiv('dmt-text-editor-section');
        opacitySection.createEl('label', { text: 'Opacity', cls: 'dmt-text-editor-label' });
        const opacityRow = opacitySection.createDiv('windrose-tle-flex-row');
        this.opacityInput = opacityRow.createEl('input', { type: 'range', cls: 'windrose-tle-flex-fill' });
        this.opacityInput.min = '0';
        this.opacityInput.max = '1';
        this.opacityInput.step = '0.05';
        this.opacityInput.value = String(currentOpacity);
        this.opacityValueEl = opacityRow.createSpan({ text: `${Math.round(currentOpacity * 100)}%`, cls: 'windrose-tle-opacity-value' });
        this.opacityInput.addEventListener('input', (e: Event) => {
          currentOpacity = parseFloat((e.target as HTMLInputElement).value);
          this.opacityValueEl.textContent = `${Math.round(currentOpacity * 100)}%`;
          this.updatePreview();
        });

        // Preview
        this.previewEl = contentEl.createDiv('dmt-text-editor-preview windrose-tle-preview-hidden');
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
        hint.setText('Press enter to confirm, esc to cancel');

        setTimeout(() => {
          this.inputEl.focus();
          if (initialValue) this.inputEl.select();
        }, 0);
      }

      renderColorPicker(): void {
        if (this.clickOutsideHandler) {
          document.removeEventListener('mousedown', this.clickOutsideHandler);
          this.clickOutsideHandler = null;
        }

        if (this.isPickerOpen) {
          this.clickOutsideHandler = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (target.closest('.dmt-color-picker') || target.closest('.dmt-text-editor-color-button')) {
              return;
            }
            this.isPickerOpen = false;
            this.renderColorPicker();
          };
          document.addEventListener('mousedown', this.clickOutsideHandler);

          preactRender(
            h(ColorPicker, {
              isOpen: true,
              selectedColor: currentColor,
              onColorSelect: (c: string) => {
                this.selectColor(c);
                this.renderColorPicker();
              },
              onClose: () => {
                this.isPickerOpen = false;
                this.renderColorPicker();
              },
              onReset: () => {
                this.selectColor(DEFAULT_TEXT_COLOR);
                this.isPickerOpen = false;
                this.renderColorPicker();
              },
              customColors: customColors,
              onAddCustomColor: onAddCustomColor,
              onDeleteCustomColor: onDeleteCustomColor,
              pendingCustomColorRef: this.pendingCustomColorRef,
              title: 'Text color',
              portalled: true,
              anchorRef: { current: this.colorBtnEl }
            }),
            this.colorPickerContainerEl
          );
        } else {
          preactRender(null, this.colorPickerContainerEl);
        }
      }

      selectColor(color: string): void {
        currentColor = color;
        this.colorBtnEl.style.setProperty('background-color', color);
        const label = this.colorBtnEl.querySelector('.dmt-text-editor-color-label');
        if (label) label.textContent = color.toUpperCase();
        this.updatePreview();
      }

      updatePreview(): void {
        if (this.previewEl == null) return;
        const text = currentText.trim();
        if (text.length > 0) {
          this.previewEl.removeClass('windrose-tle-preview-hidden');
          this.previewEl.addClass('windrose-tle-preview-visible');
          this.previewEl.empty();
          const textSpan = this.previewEl.createSpan({ text });
          const fontOption = getFontOption(currentFontFace);
          textSpan.setCssStyles({
            fontSize: `${currentFontSize}px`,
            lineHeight: 'normal',
            fontFamily: fontOption?.css ?? 'sans-serif',
            color: currentColor,
            opacity: String(currentOpacity),
          });
        } else {
          this.previewEl.removeClass('windrose-tle-preview-visible');
          this.previewEl.addClass('windrose-tle-preview-hidden');
        }
      }

      submit(): void {
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

      onClose(): void {
        if (this.clickOutsideHandler) {
          document.removeEventListener('mousedown', this.clickOutsideHandler);
          this.clickOutsideHandler = null;
        }
        if (this.colorPickerContainerEl != null) {
          preactRender(null, this.colorPickerContainerEl);
        }
        if (!this.submitted) {
          onCancel();
        }
        this.contentEl.empty();
      }
    })(app);

    modal.open();
    return true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[Windrose] Failed to open native TextLabelEditor, falling back to Preact:', (e as Error).message);
    return false;
  }
}

interface TextLabelEditorProps {
  initialValue?: string;
  initialFontSize?: number;
  initialFontFace?: string;
  initialColor?: string;
  initialOpacity?: number;
  onSubmit: (data: TextLabelSubmission) => void;
  onCancel: () => void;
  isEditing?: boolean;
  customColors?: CustomColor[];
  onAddCustomColor?: (color: HexColor) => void;
  onDeleteCustomColor?: (colorId: string) => void;
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
}: TextLabelEditorProps): VNode => {
  const [text, setText] = useState(initialValue);
  const [fontSize, setFontSize] = useState(initialFontSize);
  const [fontSizeInput, setFontSizeInput] = useState(String(initialFontSize)); // Raw input for typing
  const [fontFace, setFontFace] = useState(initialFontFace);
  const [color, setColor] = useState(initialColor);
  const [opacity, setOpacity] = useState(initialOpacity);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const colorBtnRef = useRef<HTMLButtonElement>(null);
  const pendingCustomColorRef = useRef<HexColor | null>(null);
  
  // Auto-focus input when modal opens
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      // Select all text if editing existing label
      if (initialValue) {
        inputRef.current.select();
      }
    }
  }, []);
  
  // Handle keyboard shortcuts
  const handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };
  
  const handleSubmit = (): void => {
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
  const handleModalClick = (e: MouseEvent): void => {
    e.stopPropagation();
  };

  // Handle font size input change (no clamping during typing)
  const handleFontSizeInputChange = (e: JSX.TargetedEvent<HTMLInputElement>): void => {
    setFontSizeInput((e.target as HTMLInputElement).value);
  };
  
  // Handle font size blur - clamp and apply
  const handleFontSizeBlur = (): void => {
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
  const handleFontFaceChange = (e: JSX.TargetedEvent<HTMLSelectElement>): void => {
    setFontFace((e.target as HTMLSelectElement).value);
  };

  // Color picker handlers
  const handleColorPickerToggle = (e: MouseEvent): void => {
    e.stopPropagation();
    setIsColorPickerOpen(!isColorPickerOpen);
  };

  const handleColorSelect = (newColor: HexColor): void => {
    setColor(newColor);
  };
  
  const handleColorReset = (): void => {
    setColor(DEFAULT_TEXT_COLOR);
    setIsColorPickerOpen(false);
  };
  
  const handleCloseColorPicker = (): void => {
    setIsColorPickerOpen(false);
  };
  
  const handleAddCustomColor = (newColor: HexColor): void => {
    if (onAddCustomColor) {
      // Pass raw color string - parent handles wrapping into color object
      onAddCustomColor(newColor);
    }
  };

  const handleDeleteCustomColor = (colorId: string): void => {
    if (onDeleteCustomColor) {
      onDeleteCustomColor(colorId);
    }
  };
  
  // Close color picker when clicking outside
  useEffect((): (() => void) | undefined => {
    if (!isColorPickerOpen) return undefined;

    const handleClickOutside = (e: Event): void => {
      // Check if click is inside the color picker or the color button
      const target = e.target as HTMLElement | null;
      const pickerElement = target?.closest('.dmt-color-picker');
      const buttonElement = target?.closest('.dmt-text-editor-color-button');

      if (!pickerElement && !buttonElement) {
        // Click is outside - save any pending color and close the picker
        if (pendingCustomColorRef.current != null && pendingCustomColorRef.current !== '') {
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
            onChange={(e) => setText((e.target as HTMLInputElement).value)}
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
              onChange={(e) => setOpacity(parseFloat((e.target as HTMLInputElement).value))}
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
                <Icon icon="lucide-eye" />
              </button>
            </div>
            
            {showPreview && (
              <div
                className="dmt-text-editor-preview"
                style={{
                  fontSize: `${fontSize}px`,
                  fontFamily: getFontOption(fontFace)?.css ?? 'sans-serif',
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

export { TextLabelEditor, openNativeTextLabelEditor };
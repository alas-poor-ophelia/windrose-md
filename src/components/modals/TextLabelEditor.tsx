/**
 * TextLabelEditor.tsx
 *
 * Native Obsidian Modal for text label editing with font, color, and opacity controls.
 * Uses Preact's render/h for ColorPicker portalling inside the native modal.
 */

import { render as preactRender, h } from 'preact';
import { FONT_OPTIONS, DEFAULT_FONT, DEFAULT_FONT_SIZE, DEFAULT_TEXT_COLOR, FONT_SIZE_MIN, FONT_SIZE_MAX, FONT_SIZE_STEP, getFontOption } from '../../text/fontOptions';
import { ColorPicker } from '../shared/ColorPicker';
import { Modal } from 'obsidian';
import type { App } from 'obsidian';
import type { CustomColor, HexColor } from '#types/core/common.types';

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

    const modal = new (class extends Modal {
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
        contentEl.addClass('windrose-text-editor-native');
        this.modalEl.addClass('windrose-tle-modal');

        // Text input
        const textSection = contentEl.createDiv('windrose-text-editor-section');
        textSection.createEl('label', { text: 'Text', cls: 'windrose-text-editor-label' });
        this.inputEl = textSection.createEl('input', {
          type: 'text',
          placeholder: 'Enter label text...',
          cls: 'windrose-modal-input',
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
        const fontSection = controlsRow.createDiv('windrose-text-editor-section-grow');
        fontSection.createEl('label', { text: 'Font', cls: 'windrose-text-editor-label' });
        const fontSelect = fontSection.createEl('select', { cls: 'windrose-text-editor-select' });
        for (const font of FONT_OPTIONS) {
          const opt = fontSelect.createEl('option', { text: font.name, value: font.id });
          if (font.id === initialFontFace) opt.selected = true;
        }
        fontSelect.addEventListener('change', (e: Event) => {
          currentFontFace = (e.target as HTMLSelectElement).value;
          this.updatePreview();
        });

        // Font size
        const sizeSection = controlsRow.createDiv('windrose-text-editor-section-small');
        sizeSection.createEl('label', { text: 'Size', cls: 'windrose-text-editor-label' });
        this.fontSizeInput = sizeSection.createEl('input', {
          type: 'number',
          cls: 'windrose-text-editor-number',
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
        const colorSection = contentEl.createDiv('windrose-text-editor-section');
        colorSection.createEl('label', { text: 'Color', cls: 'windrose-text-editor-label' });

        const colorWrapper = colorSection.createDiv('windrose-tle-color-wrapper');

        this.colorBtnEl = colorWrapper.createEl('button', { cls: 'windrose-text-editor-color-button' });
        this.colorBtnEl.style.setProperty('background-color', currentColor);
        this.colorBtnEl.createSpan({ text: currentColor.toUpperCase(), cls: 'windrose-text-editor-color-label' });
        this.colorBtnEl.title = 'Select text color';
        this.colorBtnEl.addEventListener('click', (e: MouseEvent) => {
          e.stopPropagation();
          this.isPickerOpen = !this.isPickerOpen;
          this.renderColorPicker();
        });

        this.colorPickerContainerEl = colorWrapper.createDiv();

        // Opacity slider
        const opacitySection = contentEl.createDiv('windrose-text-editor-section');
        opacitySection.createEl('label', { text: 'Opacity', cls: 'windrose-text-editor-label' });
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
        this.previewEl = contentEl.createDiv('windrose-text-editor-preview windrose-tle-preview-hidden');
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

        const hint = contentEl.createDiv('windrose-modal-hint');
        hint.setText('Press enter to confirm, esc to cancel');

        window.setTimeout(() => {
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
            if (target.closest('.windrose-color-picker') || target.closest('.windrose-text-editor-color-button')) {
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
        const label = this.colorBtnEl.querySelector('.windrose-text-editor-color-label');
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
    console.warn('[Windrose] Failed to open native TextLabelEditor:', (e as Error).message);
    return false;
  }
}

export { openNativeTextLabelEditor };
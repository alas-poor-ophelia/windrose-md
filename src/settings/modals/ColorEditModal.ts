import type { App} from 'obsidian';
import { Modal, Setting, Notice } from 'obsidian';
import type { PluginSettings, BuiltInColor, ColorOverride, PaletteColor } from '#types/settings/settings.types';
import { BUILT_IN_COLORS } from '../../core/settingsAccessor';

interface WindrosePlugin {
  settings: PluginSettings;
  saveSettings(): Promise<void>;
}

interface ExistingColorParam extends BuiltInColor {
  opacity?: number;
  isBuiltIn?: boolean;
}

class ColorEditModal extends Modal {
  private plugin: WindrosePlugin;
  private existingColor: ExistingColorParam | null;
  private onSave: () => void;
  private isBuiltIn: boolean;

  constructor(app: App, plugin: WindrosePlugin, existingColor: ExistingColorParam | null, onSave: () => void) {
    super(app);
    this.plugin = plugin;
    this.existingColor = existingColor;
    this.onSave = onSave;
    this.isBuiltIn = existingColor?.isBuiltIn || false;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('windrose-color-edit-modal');

    const isEdit = !!this.existingColor;
    const isBuiltIn = this.isBuiltIn;

    contentEl.createEl('h2', {
      text: isEdit
        ? (isBuiltIn ? `Edit: ${this.existingColor!.label}` : 'Edit Custom Color')
        : 'Add Custom Color'
    });

    // Get original built-in values if editing a built-in
    const originalBuiltIn = isBuiltIn
      ? BUILT_IN_COLORS.find((c: BuiltInColor) => c.id === this.existingColor!.id)
      : null;

    // Initialize form values
    let colorValue = this.existingColor?.color || '#808080';
    let labelValue = this.existingColor?.label || '';
    let opacityValue = this.existingColor?.opacity ?? 1;

    // Color picker
    let hexInput: HTMLInputElement | null = null;

    new Setting(contentEl)
      .setName('Color')
      .setDesc('Choose the color value')
      .addColorPicker(picker => picker
        .setValue(colorValue)
        .onChange((value: string) => {
          colorValue = value;
          if (hexInput) hexInput.value = value;
        }))
      .addText(text => {
        text.inputEl.addClass('windrose-color-hex-input');
        hexInput = text.inputEl;
        text.setPlaceholder('#RRGGBB')
          .setValue(colorValue)
          .onChange((value: string) => {
            const normalized = value.startsWith('#') ? value : '#' + value;
            if (/^#[0-9A-Fa-f]{6}$/.test(normalized)) {
              colorValue = normalized;
              if (hexInput) hexInput.value = normalized;
            }
          });
      });

    // Label input
    new Setting(contentEl)
      .setName('Label')
      .setDesc('Display name for this color')
      .addText(text => text
        .setPlaceholder('E.g., ocean blue')
        .setValue(labelValue)
        .onChange((value: string) => {
          labelValue = value;
        }));

    // Opacity slider
    const opacitySetting = new Setting(contentEl)
      .setName('Opacity')
      .setDesc('Default opacity when selecting this color');

    const opacityContainer = opacitySetting.controlEl.createEl('div', { cls: 'windrose-opacity-control' });
    const opacitySlider = opacityContainer.createEl('input', {
      type: 'range',
      attr: { min: '10', max: '100', value: String(Math.round(opacityValue * 100)) }
    });
    const opacityDisplay = opacityContainer.createEl('span', {
      text: `${Math.round(opacityValue * 100)}%`,
      cls: 'windrose-opacity-value'
    });

    opacitySlider.addEventListener('input', (e: Event) => {
      opacityValue = parseInt((e.target as HTMLInputElement).value, 10) / 100;
      opacityDisplay.textContent = `${Math.round(opacityValue * 100)}%`;
    });

    // Show original values for built-ins
    if (isBuiltIn && originalBuiltIn) {
      const origInfo = contentEl.createEl('div', { cls: 'windrose-color-original-info' });
      origInfo.createEl('span', { text: 'Original: ' });
      origInfo.createEl('span', {
        cls: 'windrose-color-mini-swatch',
        attr: { style: `background-color: ${originalBuiltIn.color}` }
      });
      origInfo.createEl('span', { text: ` ${originalBuiltIn.label} (${originalBuiltIn.color})` });
    }

    // Action buttons
    const btnContainer = contentEl.createEl('div', { cls: 'windrose-modal-buttons' });

    const saveBtn = btnContainer.createEl('button', {
      text: 'Save',
      cls: 'mod-cta'
    });
    saveBtn.addEventListener('click', () => {
      // Validate
      if (!labelValue.trim()) {
        new Notice('Please enter a label for this color.');
        return;
      }
      if (!/^#[0-9A-Fa-f]{6}$/.test(colorValue)) {
        new Notice('Please enter a valid hex color (e.g., #4A9EFF)');
        return;
      }

      if (isBuiltIn) {
        // Save as override
        if (!this.plugin.settings.colorPaletteOverrides) {
          this.plugin.settings.colorPaletteOverrides = {};
        }
        const existingOverride = this.plugin.settings.colorPaletteOverrides[this.existingColor!.id] || {};
        this.plugin.settings.colorPaletteOverrides[this.existingColor!.id] = {
          ...existingOverride,
          color: colorValue,
          label: labelValue,
          opacity: opacityValue
        } as ColorOverride;
      } else if (isEdit) {
        // Update existing custom color
        const idx = this.plugin.settings.customPaletteColors!.findIndex((c: PaletteColor) => c.id === this.existingColor!.id);
        if (idx !== -1) {
          this.plugin.settings.customPaletteColors![idx] = {
            ...this.plugin.settings.customPaletteColors![idx],
            color: colorValue,
            label: labelValue,
            opacity: opacityValue
          } as PaletteColor;
        }
      } else {
        // Add new custom color
        if (!this.plugin.settings.customPaletteColors) {
          this.plugin.settings.customPaletteColors = [];
        }
        this.plugin.settings.customPaletteColors.push({
          id: 'custom-' + Date.now(),
          color: colorValue,
          label: labelValue,
          opacity: opacityValue
        } as PaletteColor);
      }

      this.onSave();
      this.close();
    });

    const cancelBtn = btnContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => this.close());
  }

  onClose() {
    this.contentEl.empty();
  }
}

export { ColorEditModal };

import { Setting } from 'obsidian';
import { BUILT_IN_COLORS } from '../../core/settingsAccessor';
import { IconHelpers } from '../helpers/iconHelpers';
import { ColorHelpers } from '../helpers/colorHelpers';
import { ColorEditModal } from '../modals/ColorEditModal';
import { ConfirmModal } from '../modals/ConfirmModal';
import type { SettingsTabThis } from './settingsTabContext';

// settingsPlugin-TabRenderColors.js
// WindroseMDSettingsTab render methods - Color palette
// This file is concatenated into the settings plugin template by the assembler

/** Shape of the color object passed to renderColorRow */
interface DisplayColor {
  id: string;
  color: string;
  label: string;
  opacity?: number;
  isBuiltIn?: boolean;
  isModified?: boolean;
  isCustom?: boolean;
}

export const TabRenderColorsMethods = {
  renderColorPaletteContent(this: SettingsTabThis, containerEl: HTMLElement): void {
    containerEl.createEl('p', {
      text: 'Customize the color palette used for drawing cells and objects. Edit built-in colors, add custom colors, or hide colors you don\'t use.',
      cls: 'setting-item-description'
    });

    // Add Custom Color button
    new Setting(containerEl)
      .setName('Add custom color')
      .setDesc('Create a new color for your palette')
      .addButton(btn => btn
        .setButtonText('+ Add Color')
        .setCta()
        .onClick(() => {
          new ColorEditModal(this.app, this.plugin, null, () => {
            this.settingsChanged = true;
            void this.plugin.saveSettings();
            this.display();
          }).open();
        }));

    // Reset All Colors button
    new Setting(containerEl)
      .setName('Reset palette')
      .setDesc('Restore all built-in colors to defaults and remove custom colors')
      .addButton(btn => btn
        .setButtonText('Reset all')
        .setWarning()
        .onClick(async () => {
          if (await new ConfirmModal(this.app, {
              message: 'Reset all colors to defaults? This will remove all customizations.',
              confirmText: 'Reset All',
              isDestructive: true
            }).openAndGetValue()) {
            this.plugin.settings.colorPaletteOverrides = {};
            this.plugin.settings.customPaletteColors = [];
            this.settingsChanged = true;
            await this.plugin.saveSettings();
            this.display();
          }
        }));

    // Render color list
    this.renderColorList(containerEl);
  },
  renderColorList(this: SettingsTabThis, containerEl: HTMLElement): void {
    const resolvedColors = ColorHelpers.getResolved(this.plugin.settings as unknown as Record<string, unknown>);
    const hiddenColors = ColorHelpers.getHidden(this.plugin.settings as unknown as Record<string, unknown>);

    // Separate into visible and hidden
    const visibleColors = resolvedColors.filter(c => !hiddenColors.has(c.id));
    const hiddenBuiltIns = BUILT_IN_COLORS.filter(c => hiddenColors.has(c.id));

    // Visible colors container
    const visibleContainer = containerEl.createEl('div', { cls: 'windrose-settings-category' });
    const visibleHeader = visibleContainer.createEl('div', { cls: 'windrose-settings-category-header' });
    visibleHeader.createEl('span', { text: `Active Colors (${visibleColors.length})`, cls: 'windrose-settings-category-label' });

    const visibleList = visibleContainer.createEl('div', { cls: 'windrose-color-list' });

    visibleColors.forEach((color, index) => {
      this.renderColorRow(visibleList, color as unknown as Record<string, unknown>, index, false);
    });

    if (visibleColors.length === 0) {
      visibleList.createEl('div', {
        text: 'No colors visible. Use "show" to restore hidden colors.',
        cls: 'windrose-settings-empty-message'
      });
    }

    // Hidden colors (if any)
    if (hiddenBuiltIns.length > 0) {
      const hiddenContainer = containerEl.createEl('div', { cls: 'windrose-settings-category windrose-settings-category-muted' });
      const hiddenHeader = hiddenContainer.createEl('div', { cls: 'windrose-settings-category-header' });
      hiddenHeader.createEl('span', { text: `Hidden Colors (${hiddenBuiltIns.length})`, cls: 'windrose-settings-category-label' });

      const hiddenList = hiddenContainer.createEl('div', { cls: 'windrose-color-list' });

      hiddenBuiltIns.forEach((color, index) => {
        // Build display version with override if exists
        const override = this.plugin.settings.colorPaletteOverrides?.[color.id];
        const displayColor: DisplayColor = override ? { ...color, ...override, isBuiltIn: true, isModified: true } : { ...color, isBuiltIn: true };
        this.renderColorRow(hiddenList, displayColor as unknown as Record<string, unknown>, index, true);
      });
    }
  },
  renderColorRow(this: SettingsTabThis, containerEl: HTMLElement, colorRecord: Record<string, unknown>, _index: number, isHidden: boolean): void {
    const color = colorRecord as unknown as DisplayColor;
    const row = containerEl.createEl('div', { cls: 'windrose-color-row' });

    // Color swatch - apply opacity if set
    const swatchOpacity = color.opacity ?? 1;
    row.createEl('div', {
      cls: 'windrose-color-row-swatch',
      attr: { style: `background-color: ${color.color}; opacity: ${swatchOpacity}` }
    });

    // Label with modified indicator
    const labelContainer = row.createEl('div', { cls: 'windrose-color-row-label' });
    labelContainer.createEl('span', { text: color.label, cls: 'windrose-color-row-name' });

    if (color.isModified === true) {
      labelContainer.createEl('span', { text: ' (modified)', cls: 'windrose-color-row-modified' });
    }
    if (color.isCustom === true) {
      labelContainer.createEl('span', { text: ' (custom)', cls: 'windrose-color-row-custom' });
    }

    // Hex value + opacity if not 100%
    const hexText = swatchOpacity < 1
      ? `${color.color} @ ${Math.round(swatchOpacity * 100)}%`
      : color.color;
    row.createEl('code', { text: hexText, cls: 'windrose-color-row-hex' });

    // Actions
    const actions = row.createEl('div', { cls: 'windrose-color-row-actions' });

    // Edit button
    const editBtn = actions.createEl('button', { cls: 'windrose-btn-icon', attr: { 'aria-label': 'Edit color' } });
    IconHelpers.set(editBtn, 'pencil');
    editBtn.addEventListener('click', () => {
      new ColorEditModal(this.app, this.plugin, color, () => {
        this.settingsChanged = true;
        void this.plugin.saveSettings();
        this.display();
      }).open();
    });

    // Show/Hide button (for built-in colors only)
    if (color.isBuiltIn === true) {
      const visBtn = actions.createEl('button', { cls: 'windrose-btn-icon', attr: { 'aria-label': isHidden ? 'Show color' : 'Hide color' } });
      IconHelpers.set(visBtn, isHidden ? 'eye' : 'eye-off');
      visBtn.addEventListener('click', () => {
        if (!this.plugin.settings.colorPaletteOverrides) {
          this.plugin.settings.colorPaletteOverrides = {};
        }
        this.plugin.settings.colorPaletteOverrides[color.id] ??= {};
        this.plugin.settings.colorPaletteOverrides[color.id].hidden = !isHidden;

        // Clean up empty override
        if (Object.keys(this.plugin.settings.colorPaletteOverrides[color.id]).length === 1
            && !this.plugin.settings.colorPaletteOverrides[color.id].hidden !== true) {
          delete this.plugin.settings.colorPaletteOverrides[color.id];
        }

        this.settingsChanged = true;
        void this.plugin.saveSettings();
        this.display();
      });

      // Reset button (if modified)
      if (color.isModified === true) {
        const resetBtn = actions.createEl('button', { cls: 'windrose-btn-icon', attr: { 'aria-label': 'Reset to default' } });
        IconHelpers.set(resetBtn, 'rotate-ccw');
        resetBtn.addEventListener('click', () => {
          if (this.plugin.settings.colorPaletteOverrides) {
            delete this.plugin.settings.colorPaletteOverrides[color.id];
          }
          this.settingsChanged = true;
          void this.plugin.saveSettings();
          this.display();
        });
      }
    }

    // Delete button (for custom colors only)
    if (color.isCustom === true) {
      const delBtn = actions.createEl('button', { cls: 'windrose-btn-icon windrose-btn-danger', attr: { 'aria-label': 'Delete color' } });
      IconHelpers.set(delBtn, 'trash-2');
      delBtn.addEventListener('click', () => {
        this.plugin.settings.customPaletteColors = (this.plugin.settings.customPaletteColors ?? []).filter(c => c.id !== color.id);
        this.settingsChanged = true;
        void this.plugin.saveSettings();
        this.display();
      });
    }
  }

};

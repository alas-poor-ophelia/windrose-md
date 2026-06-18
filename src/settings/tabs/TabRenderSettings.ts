import { Setting } from 'obsidian';
import { THEME, DEFAULTS } from '../../core/dmtConstants';
import type { SettingsTabThis } from './settingsTabContext';
import { ContentPackBrowserModal } from '../../content-packs/ContentPackBrowserModal';
import { getInstalledPacks } from '../../content-packs/installedPacksService';

const SETTING_DEFAULTS = {
  DEFAULT_HEX_ORIENTATION: DEFAULTS.hexOrientation,
  DEFAULT_GRID_LINE_COLOR: THEME.grid.lines,
  DEFAULT_BACKGROUND_COLOR: THEME.grid.background,
  DEFAULT_BORDER_COLOR: THEME.cells.border,
  DEFAULT_COORDINATE_KEY_COLOR: THEME.coordinateKey.color,
  DEFAULT_COORDINATE_TEXT_COLOR: THEME.coordinateText.color,
  DEFAULT_COORDINATE_TEXT_SHADOW: THEME.coordinateText.shadow,
};

// settingsPlugin-TabRenderSettings.js
// WindroseMDSettingsTab render methods - Settings sections
// This file is concatenated into the settings plugin template by the assembler

export const TabRenderSettingsMethods = {
  renderHexSettingsContent(this: SettingsTabThis, containerEl: HTMLElement): void {
    // Hex Orientation
    new Setting(containerEl)
      .setName('Hex grid orientation')
      .setDesc('Default orientation for hex grids (flat-top or pointy-top)')
      .addDropdown(dropdown => dropdown
        .addOption('flat', 'Flat-top')
        .addOption('pointy', 'Pointy-top')
        .setValue(this.plugin.settings.hexOrientation)
        .onChange(async (value: string) => {
          this.plugin.settings.hexOrientation = value as 'flat' | 'pointy';
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }));

    // Coordinate Key Mode
    new Setting(containerEl)
      .setName('Coordinate overlay mode')
      .setDesc('How the C key activates coordinate labels: hold to show temporarily, or toggle on/off')
      .addDropdown(dropdown => dropdown
        .addOption('hold', 'Hold to show')
        .addOption('toggle', 'Toggle On/Off')
        .setValue(this.plugin.settings.coordinateKeyMode || 'hold')
        .onChange(async (value: string) => {
          this.plugin.settings.coordinateKeyMode = value as 'hold' | 'toggle';
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }));

    // Coordinate Text Color
    new Setting(containerEl)
      .setName('Coordinate text color')
      .setDesc('Primary color for hex coordinate overlay text (hex format: #RRGGBB)')
      .addColorPicker(color => color
        .setValue(this.plugin.settings.coordinateTextColor)
        .onChange(async (value: string) => {
          this.plugin.settings.coordinateTextColor = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }))
      .addText(text => text
        .setPlaceholder(SETTING_DEFAULTS.DEFAULT_COORDINATE_TEXT_COLOR)
        .setValue(this.plugin.settings.coordinateTextColor)
        .onChange(async (value: string) => {
          if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
            this.plugin.settings.coordinateTextColor = value;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }))
      .addExtraButton(btn => btn
        .setIcon('rotate-ccw')
        .setTooltip('Reset to default')
        .onClick(async () => {
          this.plugin.settings.coordinateTextColor = SETTING_DEFAULTS.DEFAULT_COORDINATE_TEXT_COLOR;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));

    // Coordinate Text Shadow
    new Setting(containerEl)
      .setName('Coordinate text shadow')
      .setDesc('Shadow/outline color for hex coordinate overlay text (hex format: #RRGGBB)')
      .addColorPicker(color => color
        .setValue(this.plugin.settings.coordinateTextShadow)
        .onChange(async (value: string) => {
          this.plugin.settings.coordinateTextShadow = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }))
      .addText(text => text
        .setPlaceholder(SETTING_DEFAULTS.DEFAULT_COORDINATE_TEXT_SHADOW)
        .setValue(this.plugin.settings.coordinateTextShadow)
        .onChange(async (value: string) => {
          if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
            this.plugin.settings.coordinateTextShadow = value;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }))
      .addExtraButton(btn => btn
        .setIcon('rotate-ccw')
        .setTooltip('Reset to default')
        .onClick(async () => {
          this.plugin.settings.coordinateTextShadow = SETTING_DEFAULTS.DEFAULT_COORDINATE_TEXT_SHADOW;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));
  },
  renderColorSettingsContent(this: SettingsTabThis, containerEl: HTMLElement): void {
    containerEl.createEl('p', {
      text: 'These settings control default colors and behavior for all windrosemd maps in this vault.',
      cls: 'setting-item-description'
    });

    // Grid Line Color
    new Setting(containerEl)
      .setName('Grid line color')
      .setDesc('Color for grid lines (hex format: #RRGGBB)')
      .addColorPicker(color => color
        .setValue(this.plugin.settings.gridLineColor)
        .onChange(async (value: string) => {
          this.plugin.settings.gridLineColor = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }))
      .addText(text => text
        .setPlaceholder(SETTING_DEFAULTS.DEFAULT_GRID_LINE_COLOR)
        .setValue(this.plugin.settings.gridLineColor)
        .onChange(async (value: string) => {
          if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
            this.plugin.settings.gridLineColor = value;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }))
      .addExtraButton(btn => btn
        .setIcon('rotate-ccw')
        .setTooltip('Reset to default')
        .onClick(async () => {
          this.plugin.settings.gridLineColor = SETTING_DEFAULTS.DEFAULT_GRID_LINE_COLOR;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));

    // Grid Line Width (grid maps only)
    new Setting(containerEl)
      .setName('Grid line width')
      .setDesc('Thickness of grid lines in pixels (1-5). Applies to grid maps only.')
      .addSlider(slider => slider
        .setLimits(1, 5, 1)
        .setValue(this.plugin.settings.gridLineWidth ?? 1)
        .setDynamicTooltip()
        .onChange(async (value: number) => {
          this.plugin.settings.gridLineWidth = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }))
      .addExtraButton(btn => btn
        .setIcon('rotate-ccw')
        .setTooltip('Reset to default (1px)')
        .onClick(async () => {
          this.plugin.settings.gridLineWidth = 1;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));

    // Background Color
    new Setting(containerEl)
      .setName('Background color')
      .setDesc('Canvas background color (hex format: #RRGGBB)')
      .addColorPicker(color => color
        .setValue(this.plugin.settings.backgroundColor)
        .onChange(async (value: string) => {
          this.plugin.settings.backgroundColor = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }))
      .addText(text => text
        .setPlaceholder(SETTING_DEFAULTS.DEFAULT_BACKGROUND_COLOR)
        .setValue(this.plugin.settings.backgroundColor)
        .onChange(async (value: string) => {
          if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
            this.plugin.settings.backgroundColor = value;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }))
      .addExtraButton(btn => btn
        .setIcon('rotate-ccw')
        .setTooltip('Reset to default')
        .onClick(async () => {
          this.plugin.settings.backgroundColor = SETTING_DEFAULTS.DEFAULT_BACKGROUND_COLOR;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));

    // Border Color
    new Setting(containerEl)
      .setName('Border color')
      .setDesc('Color for painted cell borders (hex format: #RRGGBB)')
      .addColorPicker(color => color
        .setValue(this.plugin.settings.borderColor)
        .onChange(async (value: string) => {
          this.plugin.settings.borderColor = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }))
      .addText(text => text
        .setPlaceholder(SETTING_DEFAULTS.DEFAULT_BORDER_COLOR)
        .setValue(this.plugin.settings.borderColor)
        .onChange(async (value: string) => {
          if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
            this.plugin.settings.borderColor = value;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }))
      .addExtraButton(btn => btn
        .setIcon('rotate-ccw')
        .setTooltip('Reset to default')
        .onClick(async () => {
          this.plugin.settings.borderColor = SETTING_DEFAULTS.DEFAULT_BORDER_COLOR;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));

    // Coordinate Key Color
    new Setting(containerEl)
      .setName('Coordinate key color')
      .setDesc('Background color for coordinate key indicator (hex format: #RRGGBB)')
      .addColorPicker(color => color
        .setValue(this.plugin.settings.coordinateKeyColor)
        .onChange(async (value: string) => {
          this.plugin.settings.coordinateKeyColor = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }))
      .addText(text => text
        .setPlaceholder(SETTING_DEFAULTS.DEFAULT_COORDINATE_KEY_COLOR)
        .setValue(this.plugin.settings.coordinateKeyColor)
        .onChange(async (value: string) => {
          if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
            this.plugin.settings.coordinateKeyColor = value;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }))
      .addExtraButton(btn => btn
        .setIcon('rotate-ccw')
        .setTooltip('Reset to default')
        .onClick(async () => {
          this.plugin.settings.coordinateKeyColor = SETTING_DEFAULTS.DEFAULT_COORDINATE_KEY_COLOR;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));
  },
  renderFogOfWarSettingsContent(this: SettingsTabThis, containerEl: HTMLElement): void {
    containerEl.createEl('p', {
      text: 'Default fog of war appearance settings for new maps. Individual maps can override these in their settings.',
      cls: 'setting-item-description'
    });

    // Soft Edges Toggle
    new Setting(containerEl)
      .setName('Soft edges')
      .setDesc('Enable a blur effect at fog boundaries for a softer, more atmospheric look')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.fogOfWarBlurEnabled)
        .onChange(async (value: boolean) => {
          this.plugin.settings.fogOfWarBlurEnabled = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display(); // Refresh to show/hide blur intensity slider
        }));

    // Blur Intensity Slider (only show when blur is enabled)
    if (this.plugin.settings.fogOfWarBlurEnabled) {
      const blurPercent = Math.round((this.plugin.settings.fogOfWarBlurFactor || 0.20) * 100);

      new Setting(containerEl)
        .setName('Blur intensity')
        .setDesc(`Size of blur effect as percentage of cell size (currently ${blurPercent}%)`)
        .addSlider(slider => slider
          .setLimits(5, 50, 1)
          .setValue(blurPercent)
          .setDynamicTooltip()
          .onChange(async (value: number) => {
            this.plugin.settings.fogOfWarBlurFactor = value / 100;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }))
        .addExtraButton(btn => btn
          .setIcon('rotate-ccw')
          .setTooltip('Reset to default (20%)')
          .onClick(async () => {
            this.plugin.settings.fogOfWarBlurFactor = 0.20;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
            this.display();
          }));
    }

    // Installed fog textures
    const fogPacks = getInstalledPacks(this.plugin).filter(p => p.type === 'fog-pack');
    if (fogPacks.length > 0) {
      containerEl.createEl('div', { text: 'Installed fog textures', cls: 'setting-item-heading' });

      const currentFogImage = this.plugin.settings.fogOfWarImage;

      for (const pack of fogPacks) {
        const imagePath = pack.vaultPath + '/' + pack.id + '.jpg';
        const isActive = currentFogImage === imagePath;

        const setting = new Setting(containerEl)
          .setName(pack.name + (isActive ? ' (active)' : ''))
          .setDesc('v' + pack.version);

        if (!isActive) {
          setting.addButton(btn => btn
            .setButtonText('Set as default')
            .onClick(async () => {
              this.plugin.settings.fogOfWarImage = imagePath;
              this.settingsChanged = true;
              await this.plugin.saveSettings();
              this.display();
            }));
        }

        setting.addExtraButton(btn => btn
          .setIcon('trash-2')
          .setTooltip('Remove')
          .onClick(async () => {
            const packs = this.plugin.settings.installedContentPacks ?? [];
            this.plugin.settings.installedContentPacks = packs.filter(p => p.id !== pack.id);
            if (isActive) {
              this.plugin.settings.fogOfWarImage = null;
            }
            await this.plugin.saveSettings();
            this.settingsChanged = true;
            this.display();
          }));
      }
    }

    // Browse Fog Content Packs
    new Setting(containerEl)
      .setName('Browse fog textures')
      .setDesc('Download tileable fog of war textures from the Windrose content library')
      .addButton(btn => btn
        .setButtonText('Browse')
        .onClick(() => {
          new ContentPackBrowserModal(this.app, this.plugin, 'fog-pack', () => {
            this.settingsChanged = true;
            this.display();
          }).open();
        }));
  },
  renderMapBehaviorSettingsContent(this: SettingsTabThis, containerEl: HTMLElement): void {
    // Expanded by Default
    new Setting(containerEl)
      .setName('Start maps expanded')
      .setDesc('When enabled, maps will start in expanded (fullscreen) mode by default')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.expandedByDefault)
        .onChange(async (value: boolean) => {
          this.plugin.settings.expandedByDefault = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }));

    // Always Show Controls
    new Setting(containerEl)
      .setName('Always show controls')
      .setDesc('Keep map controls visible at all times instead of auto-hiding')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.alwaysShowControls)
        .onChange(async (value: boolean) => {
          this.plugin.settings.alwaysShowControls = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }));

    // Canvas Height (Desktop)
    new Setting(containerEl)
      .setName('Canvas height (desktop)')
      .setDesc('Default height in pixels for map canvas on desktop devices')
      .addText(text => text
        .setPlaceholder('600')
        .setValue(String(this.plugin.settings.canvasHeight))
        .onChange(async (value: string) => {
          const num = parseInt(value);
          if (!isNaN(num)) {
            this.plugin.settings.canvasHeight = num;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }));

    // Canvas Height (Mobile)
    new Setting(containerEl)
      .setName('Canvas Height (Mobile/Touch)')
      .setDesc('Default height in pixels for map canvas on mobile and touch devices')
      .addText(text => text
        .setPlaceholder('400')
        .setValue(String(this.plugin.settings.canvasHeightMobile))
        .onChange(async (value: string) => {
          const num = parseInt(value);
          if (!isNaN(num)) {
            this.plugin.settings.canvasHeightMobile = num;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }));

    // Hover Preview Size
    const previewScalePercent = Math.round((this.plugin.settings.hoverPreviewScale || 1.0) * 100);
    new Setting(containerEl)
      .setName('Link preview size')
      .setDesc(`Scale of the hover preview panel (currently ${previewScalePercent}%)`)
      .addSlider(slider => slider
        .setLimits(50, 200, 10)
        .setValue(previewScalePercent)
        .setDynamicTooltip()
        .onChange(async (value: number) => {
          this.plugin.settings.hoverPreviewScale = value / 100;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }))
      .addExtraButton(btn => btn
        .setIcon('rotate-ccw')
        .setTooltip('Reset to default (100%)')
        .onClick(async () => {
          this.plugin.settings.hoverPreviewScale = 1.0;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));

    // Hover Preview Zoom
    const previewZoom = this.plugin.settings.hoverPreviewZoom || 0.5;
    const previewZoomPercent = Math.round(previewZoom * 100);
    new Setting(containerEl)
      .setName('Link preview zoom')
      .setDesc(`How zoomed in the preview map appears (currently ${previewZoomPercent}%)`)
      .addSlider(slider => slider
        .setLimits(10, 200, 10)
        .setValue(previewZoomPercent)
        .setDynamicTooltip()
        .onChange(async (value: number) => {
          this.plugin.settings.hoverPreviewZoom = value / 100;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }))
      .addExtraButton(btn => btn
        .setIcon('rotate-ccw')
        .setTooltip('Reset to default (50%)')
        .onClick(async () => {
          this.plugin.settings.hoverPreviewZoom = 0.5;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));
  },
  renderDistanceMeasurementSettingsContent(this: SettingsTabThis, containerEl: HTMLElement): void {
    // Grid: Distance per cell
    new Setting(containerEl)
      .setName('Grid map: Distance per cell')
      .setDesc('Distance each cell represents on grid maps (default: 5 ft for d&d)')
      .addText(text => text
        .setPlaceholder('5')
        .setValue(String(this.plugin.settings.distancePerCellGrid))
        .onChange(async (value: string) => {
          const num = parseFloat(value);
          if (!isNaN(num) && num > 0) {
            this.plugin.settings.distancePerCellGrid = num;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }))
      .addDropdown(dropdown => dropdown
        .addOption('ft', 'Feet')
        .addOption('m', 'Meters')
        .addOption('mi', 'Miles')
        .addOption('km', 'Kilometers')
        .addOption('yd', 'Yards')
        .setValue(this.plugin.settings.distanceUnitGrid)
        .onChange(async (value: string) => {
          this.plugin.settings.distanceUnitGrid = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }));

    // Hex: Distance per cell
    new Setting(containerEl)
      .setName('Hex map: Distance per hex')
      .setDesc('Distance each hex represents on hex maps (default: 6 miles for world maps)')
      .addText(text => text
        .setPlaceholder('6')
        .setValue(String(this.plugin.settings.distancePerCellHex))
        .onChange(async (value: string) => {
          const num = parseFloat(value);
          if (!isNaN(num) && num > 0) {
            this.plugin.settings.distancePerCellHex = num;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }))
      .addDropdown(dropdown => dropdown
        .addOption('mi', 'Miles')
        .addOption('km', 'Kilometers')
        .addOption('ft', 'Feet')
        .addOption('m', 'Meters')
        .addOption('yd', 'Yards')
        .setValue(this.plugin.settings.distanceUnitHex)
        .onChange(async (value: string) => {
          this.plugin.settings.distanceUnitHex = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }));

    // Grid diagonal rule
    new Setting(containerEl)
      .setName('Grid diagonal movement')
      .setDesc('How to calculate diagonal distance on grid maps')
      .addDropdown(dropdown => dropdown
        .addOption('alternating', 'Alternating (5-10-5-10, d&d 5e)')
        .addOption('equal', 'Equal (chebyshev, all moves = 1)')
        .addOption('euclidean', 'True distance (euclidean)')
        .setValue(this.plugin.settings.gridDiagonalRule)
        .onChange(async (value: string) => {
          this.plugin.settings.gridDiagonalRule = value as 'alternating' | 'equal' | 'euclidean';
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }));

    // Display format
    new Setting(containerEl)
      .setName('Distance display format')
      .setDesc('How to display measured distances')
      .addDropdown(dropdown => dropdown
        .addOption('both', 'Cells and units (e.g., "3 cells (15 ft)")')
        .addOption('cells', 'Cells only (e.g., "3 cells")')
        .addOption('units', 'Units only (e.g., "15 ft")')
        .setValue(this.plugin.settings.distanceDisplayFormat)
        .onChange(async (value: string) => {
          this.plugin.settings.distanceDisplayFormat = value as 'cells' | 'units' | 'both';
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }));
  }

};

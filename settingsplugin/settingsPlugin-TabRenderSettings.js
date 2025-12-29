return `// settingsPlugin-TabRenderSettings.js
// WindroseMDSettingsTab render methods - Settings sections
// This file is concatenated into the settings plugin template by the assembler

const TabRenderSettingsMethods = {
  renderHexSettingsContent(containerEl) {
    // Hex Orientation
    new Setting(containerEl)
      .setName('Hex Grid Orientation')
      .setDesc('Default orientation for hex grids (flat-top or pointy-top)')
      .addDropdown(dropdown => dropdown
        .addOption('flat', 'Flat-Top')
        .addOption('pointy', 'Pointy-Top')
        .setValue(this.plugin.settings.hexOrientation)
        .onChange(async (value) => {
          this.plugin.settings.hexOrientation = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }));

    // Coordinate Key Mode
    new Setting(containerEl)
      .setName('Coordinate Overlay Mode')
      .setDesc('How the C key activates coordinate labels: hold to show temporarily, or toggle on/off')
      .addDropdown(dropdown => dropdown
        .addOption('hold', 'Hold to Show')
        .addOption('toggle', 'Toggle On/Off')
        .setValue(this.plugin.settings.coordinateKeyMode || 'hold')
        .onChange(async (value) => {
          this.plugin.settings.coordinateKeyMode = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }));

    // Coordinate Text Color
    new Setting(containerEl)
      .setName('Coordinate Text Color')
      .setDesc('Primary color for hex coordinate overlay text (hex format: #RRGGBB)')
      .addColorPicker(color => color
        .setValue(this.plugin.settings.coordinateTextColor)
        .onChange(async (value) => {
          this.plugin.settings.coordinateTextColor = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }))
      .addText(text => text
        .setPlaceholder('{{DEFAULT_COORDINATE_TEXT_COLOR}}')
        .setValue(this.plugin.settings.coordinateTextColor)
        .onChange(async (value) => {
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
          this.plugin.settings.coordinateTextColor = '{{DEFAULT_COORDINATE_TEXT_COLOR}}';
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));

    // Coordinate Text Shadow
    new Setting(containerEl)
      .setName('Coordinate Text Shadow')
      .setDesc('Shadow/outline color for hex coordinate overlay text (hex format: #RRGGBB)')
      .addColorPicker(color => color
        .setValue(this.plugin.settings.coordinateTextShadow)
        .onChange(async (value) => {
          this.plugin.settings.coordinateTextShadow = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }))
      .addText(text => text
        .setPlaceholder('{{DEFAULT_COORDINATE_TEXT_SHADOW}}')
        .setValue(this.plugin.settings.coordinateTextShadow)
        .onChange(async (value) => {
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
          this.plugin.settings.coordinateTextShadow = '{{DEFAULT_COORDINATE_TEXT_SHADOW}}';
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));
  },
  renderColorSettingsContent(containerEl) {
    containerEl.createEl('p', { 
      text: 'These settings control default colors and behavior for all WindroseMD maps in this vault.',
      cls: 'setting-item-description'
    });
    
    // Grid Line Color
    new Setting(containerEl)
      .setName('Grid Line Color')
      .setDesc('Color for grid lines (hex format: #RRGGBB)')
      .addColorPicker(color => color
        .setValue(this.plugin.settings.gridLineColor)
        .onChange(async (value) => {
          this.plugin.settings.gridLineColor = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }))
      .addText(text => text
        .setPlaceholder('{{DEFAULT_GRID_LINE_COLOR}}')
        .setValue(this.plugin.settings.gridLineColor)
        .onChange(async (value) => {
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
          this.plugin.settings.gridLineColor = '{{DEFAULT_GRID_LINE_COLOR}}';
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));

    // Grid Line Width (grid maps only)
    new Setting(containerEl)
      .setName('Grid Line Width')
      .setDesc('Thickness of grid lines in pixels (1-5). Applies to grid maps only.')
      .addSlider(slider => slider
        .setLimits(1, 5, 1)
        .setValue(this.plugin.settings.gridLineWidth ?? 1)
        .setDynamicTooltip()
        .onChange(async (value) => {
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
      .setName('Background Color')
      .setDesc('Canvas background color (hex format: #RRGGBB)')
      .addColorPicker(color => color
        .setValue(this.plugin.settings.backgroundColor)
        .onChange(async (value) => {
          this.plugin.settings.backgroundColor = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }))
      .addText(text => text
        .setPlaceholder('{{DEFAULT_BACKGROUND_COLOR}}')
        .setValue(this.plugin.settings.backgroundColor)
        .onChange(async (value) => {
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
          this.plugin.settings.backgroundColor = '{{DEFAULT_BACKGROUND_COLOR}}';
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));

    // Border Color
    new Setting(containerEl)
      .setName('Border Color')
      .setDesc('Color for painted cell borders (hex format: #RRGGBB)')
      .addColorPicker(color => color
        .setValue(this.plugin.settings.borderColor)
        .onChange(async (value) => {
          this.plugin.settings.borderColor = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }))
      .addText(text => text
        .setPlaceholder('{{DEFAULT_BORDER_COLOR}}')
        .setValue(this.plugin.settings.borderColor)
        .onChange(async (value) => {
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
          this.plugin.settings.borderColor = '{{DEFAULT_BORDER_COLOR}}';
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));

    // Coordinate Key Color
    new Setting(containerEl)
      .setName('Coordinate Key Color')
      .setDesc('Background color for coordinate key indicator (hex format: #RRGGBB)')
      .addColorPicker(color => color
        .setValue(this.plugin.settings.coordinateKeyColor)
        .onChange(async (value) => {
          this.plugin.settings.coordinateKeyColor = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }))
      .addText(text => text
        .setPlaceholder('{{DEFAULT_COORDINATE_KEY_COLOR}}')
        .setValue(this.plugin.settings.coordinateKeyColor)
        .onChange(async (value) => {
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
          this.plugin.settings.coordinateKeyColor = '{{DEFAULT_COORDINATE_KEY_COLOR}}';
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));
  },
  renderFogOfWarSettingsContent(containerEl) {
    containerEl.createEl('p', { 
      text: 'Default fog of war appearance settings for new maps. Individual maps can override these in their settings.',
      cls: 'setting-item-description'
    });
    
    // Soft Edges Toggle
    new Setting(containerEl)
      .setName('Soft Edges')
      .setDesc('Enable a blur effect at fog boundaries for a softer, more atmospheric look')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.fogOfWarBlurEnabled)
        .onChange(async (value) => {
          this.plugin.settings.fogOfWarBlurEnabled = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display(); // Refresh to show/hide blur intensity slider
        }));
    
    // Blur Intensity Slider (only show when blur is enabled)
    if (this.plugin.settings.fogOfWarBlurEnabled) {
      const blurPercent = Math.round((this.plugin.settings.fogOfWarBlurFactor || 0.20) * 100);
      
      new Setting(containerEl)
        .setName('Blur Intensity')
        .setDesc(\`Size of blur effect as percentage of cell size (currently \${blurPercent}%)\`)
        .addSlider(slider => slider
          .setLimits(5, 50, 1)
          .setValue(blurPercent)
          .setDynamicTooltip()
          .onChange(async (value) => {
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
  },
  renderMapBehaviorSettingsContent(containerEl) {
    // Expanded by Default
    new Setting(containerEl)
      .setName('Start Maps Expanded')
      .setDesc('When enabled, maps will start in expanded (fullscreen) mode by default')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.expandedByDefault)
        .onChange(async (value) => {
          this.plugin.settings.expandedByDefault = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }));

    // Always Show Controls
    new Setting(containerEl)
      .setName('Always Show Controls')
      .setDesc('Keep map controls visible at all times instead of auto-hiding')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.alwaysShowControls)
        .onChange(async (value) => {
          this.plugin.settings.alwaysShowControls = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }));

    // Canvas Height (Desktop)
    new Setting(containerEl)
      .setName('Canvas Height (Desktop)')
      .setDesc('Default height in pixels for map canvas on desktop devices')
      .addText(text => text
        .setPlaceholder('600')
        .setValue(String(this.plugin.settings.canvasHeight))
        .onChange(async (value) => {
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
        .onChange(async (value) => {
          const num = parseInt(value);
          if (!isNaN(num)) {
            this.plugin.settings.canvasHeightMobile = num;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }));
  },
  renderDistanceMeasurementSettingsContent(containerEl) {
    // Grid: Distance per cell
    new Setting(containerEl)
      .setName('Grid Map: Distance per Cell')
      .setDesc('Distance each cell represents on grid maps (default: 5 ft for D&D)')
      .addText(text => text
        .setPlaceholder('5')
        .setValue(String(this.plugin.settings.distancePerCellGrid))
        .onChange(async (value) => {
          const num = parseFloat(value);
          if (!isNaN(num) && num > 0) {
            this.plugin.settings.distancePerCellGrid = num;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }))
      .addDropdown(dropdown => dropdown
        .addOption('ft', 'feet')
        .addOption('m', 'meters')
        .addOption('mi', 'miles')
        .addOption('km', 'kilometers')
        .addOption('yd', 'yards')
        .setValue(this.plugin.settings.distanceUnitGrid)
        .onChange(async (value) => {
          this.plugin.settings.distanceUnitGrid = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }));

    // Hex: Distance per cell
    new Setting(containerEl)
      .setName('Hex Map: Distance per Hex')
      .setDesc('Distance each hex represents on hex maps (default: 6 miles for world maps)')
      .addText(text => text
        .setPlaceholder('6')
        .setValue(String(this.plugin.settings.distancePerCellHex))
        .onChange(async (value) => {
          const num = parseFloat(value);
          if (!isNaN(num) && num > 0) {
            this.plugin.settings.distancePerCellHex = num;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }))
      .addDropdown(dropdown => dropdown
        .addOption('mi', 'miles')
        .addOption('km', 'kilometers')
        .addOption('ft', 'feet')
        .addOption('m', 'meters')
        .addOption('yd', 'yards')
        .setValue(this.plugin.settings.distanceUnitHex)
        .onChange(async (value) => {
          this.plugin.settings.distanceUnitHex = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }));

    // Grid diagonal rule
    new Setting(containerEl)
      .setName('Grid Diagonal Movement')
      .setDesc('How to calculate diagonal distance on grid maps')
      .addDropdown(dropdown => dropdown
        .addOption('alternating', 'Alternating (5-10-5-10, D&D 5e)')
        .addOption('equal', 'Equal (Chebyshev, all moves = 1)')
        .addOption('euclidean', 'True Distance (Euclidean)')
        .setValue(this.plugin.settings.gridDiagonalRule)
        .onChange(async (value) => {
          this.plugin.settings.gridDiagonalRule = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }));

    // Display format
    new Setting(containerEl)
      .setName('Distance Display Format')
      .setDesc('How to display measured distances')
      .addDropdown(dropdown => dropdown
        .addOption('both', 'Cells and Units (e.g., "3 cells (15 ft)")')
        .addOption('cells', 'Cells Only (e.g., "3 cells")')
        .addOption('units', 'Units Only (e.g., "15 ft")')
        .setValue(this.plugin.settings.distanceDisplayFormat)
        .onChange(async (value) => {
          this.plugin.settings.distanceDisplayFormat = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }));
  }

};`;
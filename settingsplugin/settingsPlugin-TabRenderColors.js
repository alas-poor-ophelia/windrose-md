// settingsPlugin-TabRenderColors.js
// WindroseMDSettingsTab render methods - Color palette
// This file is concatenated into the settings plugin template by the assembler

const TabRenderColorsMethods = {
  renderColorPaletteContent(containerEl) {
    containerEl.createEl('p', { 
      text: 'Customize the color palette used for drawing cells and objects. Edit built-in colors, add custom colors, or hide colors you don\'t use.',
      cls: 'setting-item-description'
    });
    
    // Add Custom Color button
    new Setting(containerEl)
      .setName('Add Custom Color')
      .setDesc('Create a new color for your palette')
      .addButton(btn => btn
        .setButtonText('+ Add Color')
        .setCta()
        .onClick(() => {
          new ColorEditModal(this.app, this.plugin, null, async () => {
            this.settingsChanged = true;
            await this.plugin.saveSettings();
            this.display();
          }).open();
        }));
    
    // Reset All Colors button  
    new Setting(containerEl)
      .setName('Reset Palette')
      .setDesc('Restore all built-in colors to defaults and remove custom colors')
      .addButton(btn => btn
        .setButtonText('Reset All')
        .setWarning()
        .onClick(async () => {
          if (confirm('Reset all colors to defaults? This will remove all customizations.')) {
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
  renderColorList(containerEl) {
    const resolvedColors = ColorHelpers.getResolved(this.plugin.settings);
    const hiddenColors = ColorHelpers.getHidden(this.plugin.settings);
    
    // Separate into visible and hidden
    const visibleColors = resolvedColors.filter(c => !hiddenColors.has(c.id));
    const hiddenBuiltIns = BUILT_IN_COLORS.filter(c => hiddenColors.has(c.id));
    
    // Visible colors container
    const visibleContainer = containerEl.createEl('div', { cls: 'dmt-settings-category' });
    const visibleHeader = visibleContainer.createEl('div', { cls: 'dmt-settings-category-header' });
    visibleHeader.createEl('span', { text: `Active Colors (${visibleColors.length})`, cls: 'dmt-settings-category-label' });
    
    const visibleList = visibleContainer.createEl('div', { cls: 'dmt-color-list' });
    
    visibleColors.forEach(color => {
      this.renderColorRow(visibleList, color, false);
    });
    
    if (visibleColors.length === 0) {
      visibleList.createEl('div', { 
        text: 'No colors visible. Use "Show" to restore hidden colors.',
        cls: 'dmt-settings-empty-message'
      });
    }
    
    // Hidden colors (if any)
    if (hiddenBuiltIns.length > 0) {
      const hiddenContainer = containerEl.createEl('div', { cls: 'dmt-settings-category dmt-settings-category-muted' });
      const hiddenHeader = hiddenContainer.createEl('div', { cls: 'dmt-settings-category-header' });
      hiddenHeader.createEl('span', { text: `Hidden Colors (${hiddenBuiltIns.length})`, cls: 'dmt-settings-category-label' });
      
      const hiddenList = hiddenContainer.createEl('div', { cls: 'dmt-color-list' });
      
      hiddenBuiltIns.forEach(color => {
        // Build display version with override if exists
        const override = this.plugin.settings.colorPaletteOverrides?.[color.id];
        const displayColor = override ? { ...color, ...override, isBuiltIn: true, isModified: true } : { ...color, isBuiltIn: true };
        this.renderColorRow(hiddenList, displayColor, true);
      });
    }
  },
  renderColorRow(containerEl, color, isHidden) {
    const row = containerEl.createEl('div', { cls: 'dmt-color-row' });
    
    // Color swatch - apply opacity if set
    const swatchOpacity = color.opacity ?? 1;
    const swatch = row.createEl('div', { 
      cls: 'dmt-color-row-swatch',
      attr: { style: `background-color: ${color.color}; opacity: ${swatchOpacity}` }
    });
    
    // Label with modified indicator
    const labelContainer = row.createEl('div', { cls: 'dmt-color-row-label' });
    labelContainer.createEl('span', { text: color.label, cls: 'dmt-color-row-name' });
    
    if (color.isModified) {
      labelContainer.createEl('span', { text: ' (modified)', cls: 'dmt-color-row-modified' });
    }
    if (color.isCustom) {
      labelContainer.createEl('span', { text: ' (custom)', cls: 'dmt-color-row-custom' });
    }
    
    // Hex value + opacity if not 100%
    const hexText = swatchOpacity < 1 
      ? `${color.color} @ ${Math.round(swatchOpacity * 100)}%`
      : color.color;
    row.createEl('code', { text: hexText, cls: 'dmt-color-row-hex' });
    
    // Actions
    const actions = row.createEl('div', { cls: 'dmt-color-row-actions' });
    
    // Edit button
    const editBtn = actions.createEl('button', { cls: 'dmt-btn-icon', attr: { 'aria-label': 'Edit color' } });
    IconHelpers.set(editBtn, 'pencil');
    editBtn.addEventListener('click', () => {
      new ColorEditModal(this.app, this.plugin, color, async () => {
        this.settingsChanged = true;
        await this.plugin.saveSettings();
        this.display();
      }).open();
    });
    
    // Show/Hide button (for built-in colors only)
    if (color.isBuiltIn) {
      const visBtn = actions.createEl('button', { cls: 'dmt-btn-icon', attr: { 'aria-label': isHidden ? 'Show color' : 'Hide color' } });
      IconHelpers.set(visBtn, isHidden ? 'eye' : 'eye-off');
      visBtn.addEventListener('click', async () => {
        if (!this.plugin.settings.colorPaletteOverrides) {
          this.plugin.settings.colorPaletteOverrides = {};
        }
        if (!this.plugin.settings.colorPaletteOverrides[color.id]) {
          this.plugin.settings.colorPaletteOverrides[color.id] = {};
        }
        this.plugin.settings.colorPaletteOverrides[color.id].hidden = !isHidden;
        
        // Clean up empty override
        if (Object.keys(this.plugin.settings.colorPaletteOverrides[color.id]).length === 1 
            && !this.plugin.settings.colorPaletteOverrides[color.id].hidden) {
          delete this.plugin.settings.colorPaletteOverrides[color.id];
        }
        
        this.settingsChanged = true;
        await this.plugin.saveSettings();
        this.display();
      });
      
      // Reset button (if modified)
      if (color.isModified) {
        const resetBtn = actions.createEl('button', { cls: 'dmt-btn-icon', attr: { 'aria-label': 'Reset to default' } });
        IconHelpers.set(resetBtn, 'rotate-ccw');
        resetBtn.addEventListener('click', async () => {
          delete this.plugin.settings.colorPaletteOverrides[color.id];
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        });
      }
    }
    
    // Delete button (for custom colors only)
    if (color.isCustom) {
      const delBtn = actions.createEl('button', { cls: 'dmt-btn-icon dmt-btn-danger', attr: { 'aria-label': 'Delete color' } });
      IconHelpers.set(delBtn, 'trash-2');
      delBtn.addEventListener('click', async () => {
        this.plugin.settings.customPaletteColors = this.plugin.settings.customPaletteColors.filter(c => c.id !== color.id);
        this.settingsChanged = true;
        await this.plugin.saveSettings();
        this.display();
      });
    }
  }

};
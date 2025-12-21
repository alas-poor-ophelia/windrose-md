// settingsPlugin-ColorEditModal.js
// Modal for editing color palette entries
// This file is concatenated into the settings plugin template by the assembler

/**
 * Modal for editing color palette entries
 */
class ColorEditModal extends Modal {
  constructor(app, plugin, existingColor, onSave) {
    super(app);
    this.plugin = plugin;
    this.existingColor = existingColor;
    this.onSave = onSave;
    this.isBuiltIn = existingColor?.isBuiltIn || false;
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dmt-color-edit-modal');
    
    const isEdit = !!this.existingColor;
    const isBuiltIn = this.isBuiltIn;
    
    contentEl.createEl('h2', { 
      text: isEdit 
        ? (isBuiltIn ? `Edit: ${this.existingColor.label}` : 'Edit Custom Color')
        : 'Add Custom Color' 
    });
    
    // Get original built-in values if editing a built-in
    const originalBuiltIn = isBuiltIn 
      ? BUILT_IN_COLORS.find(c => c.id === this.existingColor.id)
      : null;
    
    // Initialize form values
    let colorValue = this.existingColor?.color || '#808080';
    let labelValue = this.existingColor?.label || '';
    let opacityValue = this.existingColor?.opacity ?? 1;
    
    // Color picker
    new Setting(contentEl)
      .setName('Color')
      .setDesc('Choose the color value')
      .addColorPicker(picker => picker
        .setValue(colorValue)
        .onChange(value => {
          colorValue = value;
          hexInput.value = value;
        }))
      .addText(text => {
        text.inputEl.addClass('dmt-color-hex-input');
        text.setPlaceholder('#RRGGBB')
          .setValue(colorValue)
          .onChange(value => {
            if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
              colorValue = value;
            }
          });
        // Store reference for color picker sync
        var hexInput = text.inputEl;
      });
    
    // Label input
    new Setting(contentEl)
      .setName('Label')
      .setDesc('Display name for this color')
      .addText(text => text
        .setPlaceholder('e.g., Ocean Blue')
        .setValue(labelValue)
        .onChange(value => {
          labelValue = value;
        }));
    
    // Opacity slider
    const opacitySetting = new Setting(contentEl)
      .setName('Opacity')
      .setDesc('Default opacity when selecting this color');
    
    const opacityContainer = opacitySetting.controlEl.createEl('div', { cls: 'dmt-opacity-control' });
    const opacitySlider = opacityContainer.createEl('input', {
      type: 'range',
      attr: { min: '10', max: '100', value: String(Math.round(opacityValue * 100)) }
    });
    const opacityDisplay = opacityContainer.createEl('span', { 
      text: `${Math.round(opacityValue * 100)}%`,
      cls: 'dmt-opacity-value'
    });
    
    opacitySlider.addEventListener('input', (e) => {
      opacityValue = parseInt(e.target.value, 10) / 100;
      opacityDisplay.textContent = `${Math.round(opacityValue * 100)}%`;
    });
    
    // Show original values for built-ins
    if (isBuiltIn && originalBuiltIn) {
      const origInfo = contentEl.createEl('div', { cls: 'dmt-color-original-info' });
      origInfo.createEl('span', { text: 'Original: ' });
      const origSwatch = origInfo.createEl('span', { 
        cls: 'dmt-color-mini-swatch',
        attr: { style: `background-color: ${originalBuiltIn.color}` }
      });
      origInfo.createEl('span', { text: ` ${originalBuiltIn.label} (${originalBuiltIn.color})` });
    }
    
    // Action buttons
    const btnContainer = contentEl.createEl('div', { cls: 'dmt-modal-buttons' });
    
    const saveBtn = btnContainer.createEl('button', { 
      text: 'Save', 
      cls: 'mod-cta' 
    });
    saveBtn.addEventListener('click', async () => {
      // Validate
      if (!labelValue.trim()) {
        alert('Please enter a label for this color.');
        return;
      }
      if (!/^#[0-9A-Fa-f]{6}$/.test(colorValue)) {
        alert('Please enter a valid hex color (e.g., #4A9EFF)');
        return;
      }
      
      if (isBuiltIn) {
        // Save as override
        if (!this.plugin.settings.colorPaletteOverrides) {
          this.plugin.settings.colorPaletteOverrides = {};
        }
        const existingOverride = this.plugin.settings.colorPaletteOverrides[this.existingColor.id] || {};
        this.plugin.settings.colorPaletteOverrides[this.existingColor.id] = {
          ...existingOverride,
          color: colorValue,
          label: labelValue,
          opacity: opacityValue
        };
      } else if (isEdit) {
        // Update existing custom color
        const idx = this.plugin.settings.customPaletteColors.findIndex(c => c.id === this.existingColor.id);
        if (idx !== -1) {
          this.plugin.settings.customPaletteColors[idx] = {
            ...this.plugin.settings.customPaletteColors[idx],
            color: colorValue,
            label: labelValue,
            opacity: opacityValue
          };
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
        });
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

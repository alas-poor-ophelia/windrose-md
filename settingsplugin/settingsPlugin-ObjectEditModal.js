return `// settingsPlugin-ObjectEditModal.js
// Modal for editing object properties (symbol, label, category)
// This file is concatenated into the settings plugin template by the assembler

/**
 * Modal for editing object properties (symbol, label, category)
 */
class ObjectEditModal extends Modal {
  constructor(app, plugin, existingObject, onSave, mapType = 'grid') {
    super(app);
    this.plugin = plugin;
    this.existingObject = existingObject;
    this.onSave = onSave;
    this.mapType = mapType;
    
    // Form state
    this.symbol = existingObject?.symbol || '';
    this.iconClass = existingObject?.iconClass || '';
    this.label = existingObject?.label || '';
    this.category = existingObject?.category || 'features';
    
    // UI state - determine initial mode based on existing object
    this.useIcon = !!existingObject?.iconClass;
    this.iconSearchQuery = '';
    this.iconCategory = 'all';
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dmt-object-edit-modal');
    
    const isEditing = !!this.existingObject;
    
    contentEl.createEl('h2', { text: isEditing ? 'Edit Object' : 'Create Custom Object' });
    
    // Icon type toggle
    const toggleContainer = contentEl.createDiv({ cls: 'dmt-icon-type-toggle' });
    
    const unicodeBtn = toggleContainer.createEl('button', { 
      text: 'Unicode Symbol',
      cls: 'dmt-icon-type-btn' + (this.useIcon ? '' : ' active'),
      attr: { type: 'button' }
    });
    
    const iconBtn = toggleContainer.createEl('button', { 
      text: 'RPGAwesome Icon',
      cls: 'dmt-icon-type-btn' + (this.useIcon ? ' active' : ''),
      attr: { type: 'button' }
    });
    
    // Container for symbol input (shown when useIcon is false)
    this.symbolContainer = contentEl.createDiv({ cls: 'dmt-symbol-container' });
    
    // Container for icon picker (shown when useIcon is true)
    this.iconPickerContainer = contentEl.createDiv({ cls: 'dmt-icon-picker-container' });
    
    // Toggle handlers
    unicodeBtn.onclick = () => {
      if (!this.useIcon) return;
      this.useIcon = false;
      unicodeBtn.addClass('active');
      iconBtn.removeClass('active');
      this.renderSymbolInput();
      this.renderIconPicker();
    };
    
    iconBtn.onclick = () => {
      if (this.useIcon) return;
      this.useIcon = true;
      iconBtn.addClass('active');
      unicodeBtn.removeClass('active');
      this.renderSymbolInput();
      this.renderIconPicker();
    };
    
    // Initial render of symbol/icon sections
    this.renderSymbolInput();
    this.renderIconPicker();
    
    // Label input
    new Setting(contentEl)
      .setName('Label')
      .setDesc('Display name for this object')
      .addText(text => text
        .setValue(this.label)
        .setPlaceholder('e.g., Treasure Chest')
        .onChange(value => {
          this.label = value;
        }));
    
    // Category dropdown
    const allCategories = ObjectHelpers.getAllCategories(this.plugin.settings);
    new Setting(contentEl)
      .setName('Category')
      .setDesc('Group this object belongs to')
      .addDropdown(dropdown => {
        for (const cat of allCategories) {
          dropdown.addOption(cat.id, cat.label);
        }
        dropdown.setValue(this.category);
        dropdown.onChange(value => {
          this.category = value;
        });
      });
    
    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: 'dmt-modal-buttons' });
    
    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => this.close();
    
    const saveBtn = buttonContainer.createEl('button', { text: 'Save', cls: 'mod-cta' });
    saveBtn.onclick = () => this.save();
  }
  
  renderSymbolInput() {
    const container = this.symbolContainer;
    container.empty();
    
    if (this.useIcon) {
      container.style.display = 'none';
      return;
    }
    container.style.display = 'block';
    
    // Symbol input with preview
    const symbolSetting = new Setting(container)
      .setName('Symbol')
      .setDesc('Paste any Unicode character or emoji');
    
    const symbolInput = symbolSetting.controlEl.createEl('input', {
      type: 'text',
      cls: 'dmt-symbol-input',
      value: this.symbol,
      attr: { placeholder: 'Paste symbol...' }
    });
    symbolInput.addEventListener('input', (e) => {
      this.symbol = e.target.value.trim();
      this.updateSymbolPreview();
    });
    
    // Focus the symbol input after a short delay
    setTimeout(() => symbolInput.focus(), 50);
    
    // Symbol preview
    const previewEl = symbolSetting.controlEl.createDiv({ cls: 'dmt-symbol-preview' });
    previewEl.textContent = this.symbol || '?';
    this.symbolPreviewEl = previewEl;
    this.symbolInputEl = symbolInput;
    
    // Quick symbols
    const quickSymbolsContainer = container.createDiv({ cls: 'dmt-quick-symbols' });
    quickSymbolsContainer.createEl('label', { text: 'Quick Symbols', cls: 'dmt-quick-symbols-label' });
    const symbolGrid = quickSymbolsContainer.createDiv({ cls: 'dmt-quick-symbols-grid' });
    
    for (const sym of QUICK_SYMBOLS) {
      const symBtn = symbolGrid.createEl('button', { 
        text: sym, 
        cls: 'dmt-quick-symbol-btn',
        attr: { type: 'button' }
      });
      symBtn.onclick = () => {
        this.symbol = sym;
        symbolInput.value = sym;
        this.updateSymbolPreview();
      };
    }
  }
  
  renderIconPicker() {
    const container = this.iconPickerContainer;
    container.empty();
    
    if (!this.useIcon) {
      container.style.display = 'none';
      return;
    }
    container.style.display = 'block';
    
    const picker = container.createDiv({ cls: 'dmt-icon-picker' });
    
    // Search input
    const searchContainer = picker.createDiv({ cls: 'dmt-icon-picker-search' });
    const searchInput = searchContainer.createEl('input', {
      type: 'text',
      value: this.iconSearchQuery,
      attr: { placeholder: 'Search icons...' }
    });
    searchInput.addEventListener('input', (e) => {
      this.iconSearchQuery = e.target.value;
      this.renderIconGrid();
    });
    
    // Category tabs
    const tabsContainer = picker.createDiv({ cls: 'dmt-icon-picker-tabs' });
    
    // "All" tab
    const allTab = tabsContainer.createEl('button', {
      text: 'All',
      cls: 'dmt-icon-picker-tab' + (this.iconCategory === 'all' ? ' active' : ''),
      attr: { type: 'button' }
    });
    allTab.onclick = () => {
      this.iconCategory = 'all';
      this.renderIconTabs(tabsContainer);
      this.renderIconGrid();
    };
    
    // Category tabs
    const categories = RPGAwesomeHelpers.getCategories();
    for (const cat of categories) {
      const tab = tabsContainer.createEl('button', {
        text: cat.label,
        cls: 'dmt-icon-picker-tab' + (this.iconCategory === cat.id ? ' active' : ''),
        attr: { type: 'button', 'data-category': cat.id }
      });
      tab.onclick = () => {
        this.iconCategory = cat.id;
        this.renderIconTabs(tabsContainer);
        this.renderIconGrid();
      };
    }
    this.tabsContainer = tabsContainer;
    
    // Icon grid
    this.iconGridContainer = picker.createDiv({ cls: 'dmt-icon-picker-grid' });
    this.renderIconGrid();
    
    // Selected icon preview
    this.iconPreviewContainer = picker.createDiv({ cls: 'dmt-icon-preview-row' });
    this.updateIconPreview();
  }
  
  renderIconTabs(container) {
    // Update active state on all tabs
    const tabs = container.querySelectorAll('.dmt-icon-picker-tab');
    tabs.forEach(tab => {
      const catId = tab.getAttribute('data-category') || 'all';
      if (catId === this.iconCategory) {
        tab.addClass('active');
      } else {
        tab.removeClass('active');
      }
    });
  }
  
  renderIconGrid() {
    const container = this.iconGridContainer;
    if (!container) return;
    container.empty();
    
    // Get icons based on search or category
    let icons;
    if (this.iconSearchQuery.trim()) {
      icons = RPGAwesomeHelpers.search(this.iconSearchQuery);
    } else {
      icons = RPGAwesomeHelpers.getByCategory(this.iconCategory);
    }
    
    if (icons.length === 0) {
      container.createDiv({ cls: 'dmt-icon-picker-empty', text: 'No icons found' });
      return;
    }
    
    // Render icon buttons
    for (const icon of icons) {
      const iconBtn = container.createEl('button', {
        cls: 'dmt-icon-picker-icon' + (this.iconClass === icon.iconClass ? ' selected' : ''),
        attr: { 
          type: 'button',
          title: icon.label
        }
      });
      
      // Create the icon span with the character
      const iconSpan = iconBtn.createEl('span', { cls: 'ra' });
      iconSpan.textContent = icon.char;
      
      iconBtn.onclick = () => {
        this.iconClass = icon.iconClass;
        // Update selection state
        container.querySelectorAll('.dmt-icon-picker-icon').forEach(btn => btn.removeClass('selected'));
        iconBtn.addClass('selected');
        this.updateIconPreview();
      };
    }
  }
  
  updateSymbolPreview() {
    if (this.symbolPreviewEl) {
      this.symbolPreviewEl.textContent = this.symbol || '?';
    }
  }
  
  updateIconPreview() {
    const container = this.iconPreviewContainer;
    if (!container) return;
    container.empty();
    
    if (!this.iconClass) {
      container.createDiv({ cls: 'dmt-icon-preview-info', text: 'Select an icon above' });
      return;
    }
    
    const iconInfo = RPGAwesomeHelpers.getInfo(this.iconClass);
    if (!iconInfo) {
      container.createDiv({ cls: 'dmt-icon-preview-info', text: 'Invalid icon selected' });
      return;
    }
    
    // Large preview
    const previewBox = container.createDiv({ cls: 'dmt-icon-preview-large' });
    const iconSpan = previewBox.createEl('span', { cls: 'ra' });
    iconSpan.textContent = iconInfo.char;
    
    // Info
    const infoBox = container.createDiv({ cls: 'dmt-icon-preview-info' });
    infoBox.createDiv({ cls: 'dmt-icon-preview-label', text: iconInfo.label });
    infoBox.createDiv({ cls: 'dmt-icon-preview-class', text: this.iconClass });
  }
  
  save() {
    // Validate based on mode
    if (this.useIcon) {
      if (!this.iconClass || !RPGAwesomeHelpers.isValid(this.iconClass)) {
        alert('Please select a valid icon');
        return;
      }
    } else {
      if (!this.symbol || this.symbol.length === 0 || this.symbol.length > 8) {
        alert('Please enter a valid symbol (1-8 characters)');
        return;
      }
    }
    
    if (!this.label || this.label.trim().length === 0) {
      alert('Please enter a label');
      return;
    }
    
    // Get the correct settings keys for this map type
    const overridesKey = this.mapType === 'hex' ? 'hexObjectOverrides' : 'gridObjectOverrides';
    const customObjectsKey = this.mapType === 'hex' ? 'customHexObjects' : 'customGridObjects';
    
    if (this.existingObject?.isBuiltIn) {
      // Modifying a built-in: save as override
      if (!this.plugin.settings[overridesKey]) {
        this.plugin.settings[overridesKey] = {};
      }
      
      const original = BUILT_IN_OBJECTS.find(o => o.id === this.existingObject.id);
      const override = {};
      
      // Handle symbol/iconClass based on mode
      if (this.useIcon) {
        if (this.iconClass !== original.iconClass) override.iconClass = this.iconClass;
        // Clear symbol override if switching to icon
        if (original.symbol && !this.iconClass) override.symbol = null;
      } else {
        if (this.symbol !== original.symbol) override.symbol = this.symbol;
        // Clear iconClass override if switching to symbol
        if (original.iconClass) override.iconClass = null;
      }
      
      if (this.label !== original.label) override.label = this.label;
      if (this.category !== original.category) override.category = this.category;
      
      // Preserve hidden state if it exists
      if (this.plugin.settings[overridesKey][this.existingObject.id]?.hidden) {
        override.hidden = true;
      }
      
      // Preserve order if it exists
      if (this.plugin.settings[overridesKey][this.existingObject.id]?.order !== undefined) {
        override.order = this.plugin.settings[overridesKey][this.existingObject.id].order;
      }
      
      if (Object.keys(override).length > 0) {
        this.plugin.settings[overridesKey][this.existingObject.id] = override;
      } else {
        delete this.plugin.settings[overridesKey][this.existingObject.id];
      }
    } else if (this.existingObject?.isCustom) {
      // Editing existing custom object
      if (!this.plugin.settings[customObjectsKey]) {
        this.plugin.settings[customObjectsKey] = [];
      }
      const idx = this.plugin.settings[customObjectsKey].findIndex(o => o.id === this.existingObject.id);
      if (idx !== -1) {
        const updated = {
          ...this.plugin.settings[customObjectsKey][idx],
          label: this.label.trim(),
          category: this.category
        };
        
        // Set symbol or iconClass based on mode
        if (this.useIcon) {
          updated.iconClass = this.iconClass;
          delete updated.symbol;
        } else {
          updated.symbol = this.symbol;
          delete updated.iconClass;
        }
        
        this.plugin.settings[customObjectsKey][idx] = updated;
      }
    } else {
      // Creating new custom object
      if (!this.plugin.settings[customObjectsKey]) {
        this.plugin.settings[customObjectsKey] = [];
      }
      
      const newObject = {
        id: 'custom-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        label: this.label.trim(),
        category: this.category
      };
      
      // Set symbol or iconClass based on mode
      if (this.useIcon) {
        newObject.iconClass = this.iconClass;
      } else {
        newObject.symbol = this.symbol;
      }
      
      this.plugin.settings[customObjectsKey].push(newObject);
    }
    
    this.onSave();
    this.close();
  }
  
  onClose() {
    this.contentEl.empty();
  }
}
`;
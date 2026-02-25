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
    this.imagePath = existingObject?.imagePath || '';
    this.label = existingObject?.label || '';
    this.category = existingObject?.category || 'features';

    // UI state - determine initial mode based on existing object
    // Modes: 'symbol', 'icon', 'image'
    this.mode = existingObject?.imagePath ? 'image' : (existingObject?.iconClass ? 'icon' : 'symbol');
    this.iconSearchQuery = '';
    this.iconCategory = 'all';
    this.imageSearchQuery = '';
    this.imageSearchResults = [];
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dmt-object-edit-modal');
    
    const isEditing = !!this.existingObject;
    
    contentEl.createEl('h2', { text: isEditing ? 'Edit Object' : 'Create Custom Object' });
    
    // Mode toggle (symbol / icon / image)
    const toggleContainer = contentEl.createDiv({ cls: 'dmt-icon-type-toggle' });

    const unicodeBtn = toggleContainer.createEl('button', {
      text: 'Unicode Symbol',
      cls: 'dmt-icon-type-btn' + (this.mode === 'symbol' ? ' active' : ''),
      attr: { type: 'button' }
    });

    const iconBtn = toggleContainer.createEl('button', {
      text: 'RPGAwesome Icon',
      cls: 'dmt-icon-type-btn' + (this.mode === 'icon' ? ' active' : ''),
      attr: { type: 'button' }
    });

    const imageBtn = toggleContainer.createEl('button', {
      text: 'Custom Image',
      cls: 'dmt-icon-type-btn' + (this.mode === 'image' ? ' active' : ''),
      attr: { type: 'button' }
    });

    // Container for symbol input (shown when mode is 'symbol')
    this.symbolContainer = contentEl.createDiv({ cls: 'dmt-symbol-container' });

    // Container for icon picker (shown when mode is 'icon')
    this.iconPickerContainer = contentEl.createDiv({ cls: 'dmt-icon-picker-container' });

    // Container for image picker (shown when mode is 'image')
    this.imagePickerContainer = contentEl.createDiv({ cls: 'dmt-image-picker-container' });

    // Store button references for updating active state
    this.modeButtons = { symbol: unicodeBtn, icon: iconBtn, image: imageBtn };

    // Toggle handlers
    unicodeBtn.onclick = () => {
      if (this.mode === 'symbol') return;
      this.setMode('symbol');
    };

    iconBtn.onclick = () => {
      if (this.mode === 'icon') return;
      this.setMode('icon');
    };

    imageBtn.onclick = () => {
      if (this.mode === 'image') return;
      this.setMode('image');
    };

    // Initial render of all sections
    this.renderSymbolInput();
    this.renderIconPicker();
    this.renderImagePicker();
    
    // Label input
    this.labelSetting = new Setting(contentEl)
      .setName('Label')
      .setDesc('Display name for this object')
      .addText(text => {
        text
          .setValue(this.label)
          .setPlaceholder('e.g., Treasure Chest')
          .onChange(value => {
            this.label = value;
            // Clear error when user starts typing
            if (this.labelSetting.descEl.hasClass('mod-warning')) {
              this.labelSetting.setDesc('Display name for this object');
              this.labelSetting.descEl.removeClass('mod-warning');
            }
          });
        this.labelInputEl = text.inputEl;
      });
    
    // Category dropdown - use map-type-specific settings
    const mapTypeSettings = this.mapType === 'hex'
      ? { customCategories: this.plugin.settings.customHexCategories || [] }
      : { customCategories: this.plugin.settings.customGridCategories || [] };
    const allCategories = ObjectHelpers.getAllCategories(mapTypeSettings);
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
  
  setMode(newMode) {
    this.mode = newMode;
    // Update button active states
    Object.entries(this.modeButtons).forEach(([mode, btn]) => {
      if (mode === newMode) {
        btn.addClass('active');
      } else {
        btn.removeClass('active');
      }
    });
    // Re-render all mode-specific containers
    this.renderSymbolInput();
    this.renderIconPicker();
    this.renderImagePicker();
  }

  renderSymbolInput() {
    const container = this.symbolContainer;
    container.empty();

    if (this.mode !== 'symbol') {
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

    if (this.mode !== 'icon') {
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

  renderImagePicker() {
    const container = this.imagePickerContainer;
    container.empty();

    if (this.mode !== 'image') {
      container.style.display = 'none';
      return;
    }
    container.style.display = 'block';

    // Info text
    container.createEl('p', {
      text: 'Select an image from your vault to use as this object\\'s icon.',
      cls: 'dmt-image-picker-info'
    });

    // Image search input
    const searchContainer = container.createDiv({ cls: 'dmt-image-picker-search' });
    const searchInput = searchContainer.createEl('input', {
      type: 'text',
      value: this.imageSearchQuery,
      attr: { placeholder: 'Search for image...' }
    });

    // Clear button
    if (this.imagePath) {
      const clearBtn = searchContainer.createEl('button', {
        text: 'x',
        cls: 'dmt-image-clear-btn',
        attr: { type: 'button', title: 'Clear image' }
      });
      clearBtn.onclick = () => {
        this.imagePath = '';
        this.imageSearchQuery = '';
        this.imageSearchResults = [];
        this.renderImagePicker();
      };
    }

    searchInput.addEventListener('input', async (e) => {
      this.imageSearchQuery = e.target.value;
      await this.searchImages(this.imageSearchQuery);
    });

    // Search results dropdown
    this.imageResultsContainer = container.createDiv({ cls: 'dmt-image-search-results' });
    this.renderImageSearchResults();

    // Preview
    if (this.imagePath) {
      const previewContainer = container.createDiv({ cls: 'dmt-image-preview' });
      previewContainer.createEl('p', {
        text: 'Selected: ' + this.getImageDisplayName(this.imagePath),
        cls: 'dmt-image-preview-label'
      });
      // Try to show the image preview
      const imgPreview = previewContainer.createEl('img', {
        cls: 'dmt-image-preview-img',
        attr: { src: this.app.vault.adapter.getResourcePath(this.imagePath) }
      });
      imgPreview.style.maxWidth = '100px';
      imgPreview.style.maxHeight = '100px';
    }
  }

  async searchImages(query) {
    if (!query || query.trim().length < 2) {
      this.imageSearchResults = [];
      this.renderImageSearchResults();
      return;
    }

    const lowerQuery = query.toLowerCase();
    const files = this.app.vault.getFiles();
    const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];

    const matches = files
      .filter(file => {
        const ext = file.extension?.toLowerCase();
        if (!imageExtensions.includes(ext)) return false;
        return file.path.toLowerCase().includes(lowerQuery) ||
               file.basename.toLowerCase().includes(lowerQuery);
      })
      .slice(0, 10);

    this.imageSearchResults = matches.map(f => f.path);
    this.renderImageSearchResults();
  }

  renderImageSearchResults() {
    const container = this.imageResultsContainer;
    if (!container) return;
    container.empty();

    if (this.imageSearchResults.length === 0) return;

    for (const path of this.imageSearchResults) {
      const item = container.createDiv({ cls: 'dmt-image-search-result' });
      item.textContent = this.getImageDisplayName(path);
      item.onclick = () => {
        this.imagePath = path;
        this.imageSearchQuery = this.getImageDisplayName(path);
        this.imageSearchResults = [];
        this.renderImagePicker();
      };
    }
  }

  getImageDisplayName(path) {
    if (!path) return '';
    const parts = path.split('/');
    return parts[parts.length - 1];
  }

  save() {
    // Validate based on mode
    if (this.mode === 'icon') {
      if (!this.iconClass || !RPGAwesomeHelpers.isValid(this.iconClass)) {
        new Notice('Please select a valid icon');
        return;
      }
    } else if (this.mode === 'image') {
      if (!this.imagePath || this.imagePath.trim().length === 0) {
        new Notice('Please select an image');
        return;
      }
    } else {
      // symbol mode
      if (!this.symbol || this.symbol.length === 0 || this.symbol.length > 8) {
        new Notice('Please enter a valid symbol (1-8 characters)');
        return;
      }
    }

    if (!this.label || this.label.trim().length === 0) {
      this.labelSetting.setDesc('Please enter a label');
      this.labelSetting.descEl.addClass('mod-warning');
      this.labelInputEl?.focus();
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

      // Handle symbol/iconClass/imagePath based on mode
      if (this.mode === 'icon') {
        if (this.iconClass !== original.iconClass) override.iconClass = this.iconClass;
        // Clear other visual properties
        if (original.symbol) override.symbol = null;
        if (original.imagePath) override.imagePath = null;
      } else if (this.mode === 'image') {
        override.imagePath = this.imagePath;
        // Clear other visual properties
        if (original.symbol) override.symbol = null;
        if (original.iconClass) override.iconClass = null;
      } else {
        if (this.symbol !== original.symbol) override.symbol = this.symbol;
        // Clear other visual properties
        if (original.iconClass) override.iconClass = null;
        if (original.imagePath) override.imagePath = null;
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

        // Set visual property based on mode, clearing others
        delete updated.symbol;
        delete updated.iconClass;
        delete updated.imagePath;

        if (this.mode === 'icon') {
          updated.iconClass = this.iconClass;
        } else if (this.mode === 'image') {
          updated.imagePath = this.imagePath;
        } else {
          updated.symbol = this.symbol;
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

      // Set visual property based on mode
      if (this.mode === 'icon') {
        newObject.iconClass = this.iconClass;
      } else if (this.mode === 'image') {
        newObject.imagePath = this.imagePath;
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
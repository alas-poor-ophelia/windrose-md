return `// settingsPlugin-ImportModal.js
// Modal for importing object customizations
// This file is concatenated into the settings plugin template by the assembler

/**
 * Modal for importing object customizations
 */
class ImportModal extends Modal {
  constructor(app, plugin, onImport, mapType = 'grid') {
    super(app);
    this.plugin = plugin;
    this.onImport = onImport;
    this.mapType = mapType;
    this.importData = null;
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dmt-import-modal');
    
    const mapTypeLabel = this.mapType === 'hex' ? 'Hex' : 'Grid';
    contentEl.createEl('h2', { text: \`Import \${mapTypeLabel} Object Customizations\` });
    
    contentEl.createEl('p', { 
      text: \`Select a Windrose MD object export file (.json) to import into \${mapTypeLabel} maps.\`,
      cls: 'setting-item-description'
    });
    
    // File picker
    const fileContainer = contentEl.createDiv({ cls: 'dmt-import-file-container' });
    const fileInput = fileContainer.createEl('input', {
      type: 'file',
      attr: { accept: '.json' }
    });
    
    // Preview area (hidden until file selected)
    const previewArea = contentEl.createDiv({ cls: 'dmt-import-preview' });
    previewArea.style.display = 'none';
    
    // Import options (hidden until file validated)
    const optionsArea = contentEl.createDiv({ cls: 'dmt-import-options' });
    optionsArea.style.display = 'none';
    
    let mergeMode = 'merge'; // 'merge' or 'replace'
    
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        // Validate it's a Windrose export
        if (!data.windroseMD_objectExport) {
          previewArea.empty();
          previewArea.createEl('p', { 
            text: 'This file is not a valid Windrose MD object export.',
            cls: 'dmt-import-error'
          });
          previewArea.style.display = 'block';
          optionsArea.style.display = 'none';
          this.importData = null;
          return;
        }
        
        this.importData = data;
        
        // Show preview
        previewArea.empty();
        previewArea.createEl('p', { text: 'Valid Windrose MD export file' });
        if (data.exportedAt) {
          previewArea.createEl('p', { 
            text: \`Exported: \${new Date(data.exportedAt).toLocaleString()}\`,
            cls: 'dmt-import-date'
          });
        }
        
        // Show original map type if present
        if (data.mapType) {
          const sourceType = data.mapType === 'hex' ? 'Hex' : 'Grid';
          if (data.mapType !== this.mapType) {
            previewArea.createEl('p', { 
              text: \`Note: This was exported from \${sourceType} maps but will be imported to \${mapTypeLabel} maps.\`,
              cls: 'dmt-import-note'
            });
          }
        }
        
        const overrideCount = data.objectOverrides ? Object.keys(data.objectOverrides).length : 0;
        const customObjCount = data.customObjects?.length || 0;
        const customCatCount = data.customCategories?.length || 0;
        
        if (overrideCount > 0) {
          previewArea.createEl('p', { text: \`Ã¢â‚¬Â¢ \${overrideCount} built-in modification(s)\` });
        }
        if (customObjCount > 0) {
          previewArea.createEl('p', { text: \`Ã¢â‚¬Â¢ \${customObjCount} custom object(s)\` });
        }
        if (customCatCount > 0) {
          previewArea.createEl('p', { text: \`Ã¢â‚¬Â¢ \${customCatCount} custom category(ies)\` });
        }
        
        previewArea.style.display = 'block';
        
        // Show import options
        optionsArea.empty();
        new Setting(optionsArea)
          .setName('Import Mode')
          .setDesc('How to handle existing customizations')
          .addDropdown(dropdown => dropdown
            .addOption('merge', 'Merge (keep existing, add new)')
            .addOption('replace', 'Replace (remove existing first)')
            .setValue(mergeMode)
            .onChange(v => { mergeMode = v; }));
        
        optionsArea.style.display = 'block';
        
      } catch (err) {
        previewArea.empty();
        previewArea.createEl('p', { 
          text: \`Error reading file: \${err.message}\`,
          cls: 'dmt-import-error'
        });
        previewArea.style.display = 'block';
        optionsArea.style.display = 'none';
        this.importData = null;
      }
    });
    
    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: 'dmt-modal-buttons' });
    
    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => this.close();
    
    const importBtn = buttonContainer.createEl('button', { text: 'Import', cls: 'mod-cta' });
    importBtn.onclick = async () => {
      if (!this.importData) {
        new Notice('Please select a valid export file first.');
        return;
      }
      
      // Get the correct settings keys for this map type
      const overridesKey = this.mapType === 'hex' ? 'hexObjectOverrides' : 'gridObjectOverrides';
      const customObjectsKey = this.mapType === 'hex' ? 'customHexObjects' : 'customGridObjects';
      const categoriesKey = this.mapType === 'hex' ? 'customHexCategories' : 'customGridCategories';
      
      const data = this.importData;
      
      if (mergeMode === 'replace') {
        // Clear existing for this map type
        this.plugin.settings[overridesKey] = {};
        this.plugin.settings[customObjectsKey] = [];
        this.plugin.settings[categoriesKey] = [];
      }
      
      // Import overrides
      if (data.objectOverrides) {
        if (!this.plugin.settings[overridesKey]) {
          this.plugin.settings[overridesKey] = {};
        }
        Object.assign(this.plugin.settings[overridesKey], data.objectOverrides);
      }
      
      // Import custom objects (avoid duplicates by ID)
      if (data.customObjects) {
        if (!this.plugin.settings[customObjectsKey]) {
          this.plugin.settings[customObjectsKey] = [];
        }
        for (const obj of data.customObjects) {
          const existingIdx = this.plugin.settings[customObjectsKey].findIndex(o => o.id === obj.id);
          if (existingIdx !== -1) {
            this.plugin.settings[customObjectsKey][existingIdx] = obj;
          } else {
            this.plugin.settings[customObjectsKey].push(obj);
          }
        }
      }
      
      // Import custom categories (avoid duplicates by ID)
      if (data.customCategories) {
        if (!this.plugin.settings[categoriesKey]) {
          this.plugin.settings[categoriesKey] = [];
        }
        for (const cat of data.customCategories) {
          const existingIdx = this.plugin.settings[categoriesKey].findIndex(c => c.id === cat.id);
          if (existingIdx !== -1) {
            this.plugin.settings[categoriesKey][existingIdx] = cat;
          } else {
            this.plugin.settings[categoriesKey].push(cat);
          }
        }
      }
      
      await this.plugin.saveSettings();
      this.onImport();
      this.close();
    };
  }
  
  onClose() {
    this.contentEl.empty();
  }
}
`;
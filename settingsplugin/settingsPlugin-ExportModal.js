// settingsPlugin-ExportModal.js
// Modal for exporting object customizations
// This file is concatenated into the settings plugin template by the assembler

/**
 * Modal for exporting object customizations
 */
class ExportModal extends Modal {
  constructor(app, plugin, mapType = 'grid') {
    super(app);
    this.plugin = plugin;
    this.mapType = mapType;
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dmt-export-modal');
    
    const mapTypeLabel = this.mapType === 'hex' ? 'Hex' : 'Grid';
    contentEl.createEl('h2', { text: `Export ${mapTypeLabel} Object Customizations` });
    
    // Get the correct settings keys for this map type
    const overridesKey = this.mapType === 'hex' ? 'hexObjectOverrides' : 'gridObjectOverrides';
    const customObjectsKey = this.mapType === 'hex' ? 'customHexObjects' : 'customGridObjects';
    const categoriesKey = this.mapType === 'hex' ? 'customHexCategories' : 'customGridCategories';
    
    const objectOverrides = this.plugin.settings[overridesKey] || {};
    const customObjects = this.plugin.settings[customObjectsKey] || [];
    const customCategories = this.plugin.settings[categoriesKey] || [];
    
    const hasOverrides = Object.keys(objectOverrides).length > 0;
    const hasCustom = customObjects.length > 0 || customCategories.length > 0;
    
    // Selection checkboxes
    let exportOverrides = hasOverrides;
    let exportCustom = hasCustom;
    
    // Explain what will be exported
    if (hasOverrides || hasCustom) {
      contentEl.createEl('p', { 
        text: 'Select what to include in the export file:',
        cls: 'setting-item-description'
      });
    }
    
    if (hasOverrides) {
      new Setting(contentEl)
        .setName(`Built-in modifications (${Object.keys(objectOverrides).length})`)
        .setDesc('Changes to symbol, label, or order of built-in objects')
        .addToggle(toggle => toggle
          .setValue(exportOverrides)
          .onChange(v => { exportOverrides = v; }));
    }
    
    if (hasCustom) {
      const customCount = customObjects.length + customCategories.length;
      new Setting(contentEl)
        .setName(`Custom objects & categories (${customCount})`)
        .setDesc(`${customObjects.length} object(s), ${customCategories.length} category(ies)`)
        .addToggle(toggle => toggle
          .setValue(exportCustom)
          .onChange(v => { exportCustom = v; }));
    }
    
    if (!hasOverrides && !hasCustom) {
      contentEl.createEl('p', { 
        text: `No customizations to export for ${mapTypeLabel} maps. Modify built-in objects or create custom ones first.`,
        cls: 'dmt-export-empty'
      });
      return;
    }
    
    // Filename input
    const defaultFilename = `windrose-${this.mapType}-objects-${new Date().toISOString().split('T')[0]}.json`;
    let filename = defaultFilename;
    
    new Setting(contentEl)
      .setName('Filename')
      .setDesc('Will be saved to your vault root')
      .addText(text => text
        .setValue(filename)
        .onChange(v => { filename = v; }));
    
    // Export button
    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText('Export to Vault')
        .setCta()
        .onClick(async () => {
          const exportData = {
            windroseMD_objectExport: true,
            exportedAt: new Date().toISOString(),
            version: '1.0',
            mapType: this.mapType
          };
          
          if (exportOverrides && hasOverrides) {
            exportData.objectOverrides = objectOverrides;
          }
          if (exportCustom && hasCustom) {
            if (customObjects.length > 0) exportData.customObjects = customObjects;
            if (customCategories.length > 0) exportData.customCategories = customCategories;
          }
          
          // Save to vault
          const json = JSON.stringify(exportData, null, 2);
          const finalFilename = filename.endsWith('.json') ? filename : filename + '.json';
          
          try {
            // Check if file exists
            const existingFile = this.app.vault.getAbstractFileByPath(finalFilename);
            if (existingFile) {
              if (!confirm(`File "${finalFilename}" already exists. Overwrite?`)) {
                return;
              }
              await this.app.vault.modify(existingFile, json);
            } else {
              await this.app.vault.create(finalFilename, json);
            }
            
            alert(`Exported to: ${finalFilename}`);
            this.close();
          } catch (err) {
            alert(`Export failed: ${err.message}`);
          }
        }));
  }
  
  onClose() {
    this.contentEl.empty();
  }
}

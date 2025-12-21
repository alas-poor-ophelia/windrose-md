// settingsPlugin-CategoryEditModal.js
// Modal for editing category properties
// This file is concatenated into the settings plugin template by the assembler

/**
 * Modal for editing category properties
 */
class CategoryEditModal extends Modal {
  constructor(app, plugin, existingCategory, onSave, mapType = 'grid') {
    super(app);
    this.plugin = plugin;
    this.existingCategory = existingCategory;
    this.onSave = onSave;
    this.mapType = mapType;
    
    this.label = existingCategory?.label || '';
    this.order = existingCategory?.order ?? 100;
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dmt-category-edit-modal');
    
    const isEditing = !!this.existingCategory;
    
    contentEl.createEl('h2', { text: isEditing ? 'Edit Category' : 'Create Custom Category' });
    
    let nameInputEl = null;
    new Setting(contentEl)
      .setName('Name')
      .setDesc('Display name for this category')
      .addText(text => {
        nameInputEl = text.inputEl;
        text.setValue(this.label)
          .setPlaceholder('e.g., Alchemy')
          .onChange(value => {
            this.label = value;
          });
      });
    
    // Focus the name input after a short delay
    if (nameInputEl) {
      setTimeout(() => nameInputEl.focus(), 50);
    }
    
    new Setting(contentEl)
      .setName('Sort Order')
      .setDesc('Lower numbers appear first (built-ins use 0-50)')
      .addText(text => text
        .setValue(String(this.order))
        .setPlaceholder('100')
        .onChange(value => {
          const num = parseInt(value, 10);
          if (!isNaN(num)) {
            this.order = num;
          }
        }));
    
    const buttonContainer = contentEl.createDiv({ cls: 'dmt-modal-buttons' });
    
    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => this.close();
    
    const saveBtn = buttonContainer.createEl('button', { text: 'Save', cls: 'mod-cta' });
    saveBtn.onclick = () => this.save();
  }
  
  save() {
    if (!this.label || this.label.trim().length === 0) {
      alert('Please enter a category name');
      return;
    }
    
    // Get the correct settings key for this map type
    const categoriesKey = this.mapType === 'hex' ? 'customHexCategories' : 'customGridCategories';
    
    if (!this.plugin.settings[categoriesKey]) {
      this.plugin.settings[categoriesKey] = [];
    }
    
    if (this.existingCategory) {
      const idx = this.plugin.settings[categoriesKey].findIndex(c => c.id === this.existingCategory.id);
      if (idx !== -1) {
        this.plugin.settings[categoriesKey][idx] = {
          ...this.plugin.settings[categoriesKey][idx],
          label: this.label.trim(),
          order: this.order
        };
      }
    } else {
      const newCategory = {
        id: 'custom-cat-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        label: this.label.trim(),
        order: this.order
      };
      
      this.plugin.settings[categoriesKey].push(newCategory);
    }
    
    this.onSave();
    this.close();
  }
  
  onClose() {
    this.contentEl.empty();
  }
}

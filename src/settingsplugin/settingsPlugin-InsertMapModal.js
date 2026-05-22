return `// settingsPlugin-InsertMapModal.js
// Modal for inserting a new map block into the editor
// This file is concatenated into the settings plugin template by the assembler

/**
 * Modal for inserting a new map block into the editor
 */
class InsertMapModal extends Modal {
  constructor(app, onInsert) {
    super(app);
    this.onInsert = onInsert;
    this.mapName = '';
    this.mapType = null; // 'grid' or 'hex'
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dmt-insert-map-modal');
    
    
    contentEl.createEl('h2', { text: 'Insert New Map' });
    
    // Map name input
    new Setting(contentEl)
      .setName('Map name')
      .setDesc('A display name for this map (can be left blank)')
      .addText(text => {
        this.nameInput = text;
        text
          .setPlaceholder('e.g., Goblin Cave Level 1')
          .onChange(value => {
            this.mapName = value;
          });
        // Focus the input after modal opens
        setTimeout(() => text.inputEl.focus(), 10);
      });
    
    // Map type selection
    const typeContainer = contentEl.createDiv({ cls: 'dmt-map-type-selection' });
    typeContainer.createEl('div', { text: 'Map type', cls: 'setting-item-name' });
    typeContainer.createEl('div', { 
      text: 'Choose the grid style for this map', 
      cls: 'setting-item-description' 
    });
    
    const buttonRow = typeContainer.createDiv({ cls: 'dmt-map-type-buttons' });
    
    const gridBtn = buttonRow.createEl('button', { 
      text: 'Grid',
      cls: 'dmt-map-type-btn',
      attr: { type: 'button' }
    });
    
    const hexBtn = buttonRow.createEl('button', { 
      text: 'Hex',
      cls: 'dmt-map-type-btn',
      attr: { type: 'button' }
    });
    
    gridBtn.onclick = () => {
      this.mapType = 'grid';
      gridBtn.addClass('selected');
      hexBtn.removeClass('selected');
    };
    
    hexBtn.onclick = () => {
      this.mapType = 'hex';
      hexBtn.addClass('selected');
      gridBtn.removeClass('selected');
    };
    
    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: 'dmt-modal-buttons' });
    
    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => this.close();
    
    const insertBtn = buttonContainer.createEl('button', { text: 'Insert', cls: 'mod-cta' });
    insertBtn.onclick = () => {
      if (!this.mapType) {
        // Brief visual feedback that type is required
        buttonRow.addClass('dmt-shake');
        setTimeout(() => buttonRow.removeClass('dmt-shake'), 300);
        return;
      }
      this.onInsert(this.mapName, this.mapType);
      this.close();
    };
    
    // Handle Enter key to submit (if type is selected)
    contentEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && this.mapType) {
        e.preventDefault();
        this.onInsert(this.mapName, this.mapType);
        this.close();
      }
    });
  }
  
  onClose() {
    this.contentEl.empty();
  }
}
`;
return `// settingsPlugin-ObjectSetRenameModal.js
// Simple rename prompt modal for object sets
// This file is concatenated into the settings plugin template by the assembler

class ObjectSetRenameModal extends Modal {
  constructor(app, currentName, onSave) {
    super(app);
    this.currentName = currentName;
    this.onSave = onSave;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Rename Object Set' });

    let newName = this.currentName;
    new Setting(contentEl)
      .setName('Set Name')
      .addText(text => {
        text.setValue(this.currentName);
        text.onChange(v => { newName = v; });
        // Auto-focus and select all
        setTimeout(() => {
          text.inputEl.focus();
          text.inputEl.select();
        }, 50);
      });

    const buttons = contentEl.createDiv({ cls: 'dmt-modal-buttons' });

    const cancelBtn = buttons.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => this.close();

    const saveBtn = buttons.createEl('button', { text: 'Save', cls: 'mod-cta' });
    saveBtn.onclick = () => {
      const trimmed = newName.trim();
      if (!trimmed) {
        new Notice('Name cannot be empty');
        return;
      }
      this.onSave(trimmed);
      this.close();
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}`;

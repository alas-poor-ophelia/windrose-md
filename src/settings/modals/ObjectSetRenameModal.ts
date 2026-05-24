import { App, Modal, Setting, Notice } from 'obsidian';

class ObjectSetRenameModal extends Modal {
  private currentName: string;
  private onSave: (name: string) => void;

  constructor(app: App, currentName: string, onSave: (name: string) => void) {
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
        text.onChange((v: string) => { newName = v; });
        // Auto-focus and select all
        setTimeout(() => {
          text.inputEl.focus();
          text.inputEl.select();
        }, 50);
      });

    const buttons = contentEl.createDiv({ cls: 'windrose-modal-buttons' });

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
}

export { ObjectSetRenameModal };

return `// settingsPlugin-PromptModal.js
// Generic text input modal replacing native prompt() dialogs
// This file is concatenated into the settings plugin template by the assembler

class PromptModal extends Modal {
  constructor(app, options = {}) {
    super(app);
    this.message = options.message || '';
    this.defaultValue = options.defaultValue || '';
    this.placeholder = options.placeholder || '';
    this.inputValue = this.defaultValue;
    this.resolved = false;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    if (this.message) {
      contentEl.createEl('p', { text: this.message });
    }

    new Setting(contentEl)
      .addText(text => {
        text.setValue(this.inputValue);
        if (this.placeholder) text.setPlaceholder(this.placeholder);
        text.onChange(v => { this.inputValue = v; });
        setTimeout(() => {
          text.inputEl.focus();
          text.inputEl.select();
        }, 50);
      });

    const buttons = contentEl.createDiv({ cls: 'dmt-modal-buttons' });

    const cancelBtn = buttons.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => {
      this.resolved = true;
      this.resolvePromise(null);
      this.close();
    };

    const saveBtn = buttons.createEl('button', { text: 'OK', cls: 'mod-cta' });
    saveBtn.onclick = () => {
      const trimmed = this.inputValue.trim();
      if (!trimmed) {
        new Notice('Name cannot be empty');
        return;
      }
      this.resolved = true;
      this.resolvePromise(trimmed);
      this.close();
    };
  }

  onClose() {
    this.contentEl.empty();
    if (!this.resolved && this.resolvePromise) {
      this.resolvePromise(null);
    }
  }

  openAndGetValue() {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.open();
    });
  }
}`;

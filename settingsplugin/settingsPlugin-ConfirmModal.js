return `// settingsPlugin-ConfirmModal.js
// Generic confirmation modal replacing native confirm() dialogs
// This file is concatenated into the settings plugin template by the assembler

class ConfirmModal extends Modal {
  constructor(app, options = {}) {
    super(app);
    this.message = options.message || 'Are you sure?';
    this.confirmText = options.confirmText || 'Confirm';
    this.cancelText = options.cancelText || 'Cancel';
    this.isDestructive = options.isDestructive || false;
    this.resolved = false;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();

    const paragraphs = this.message.split('\\n').filter(s => s.trim());
    for (const p of paragraphs) {
      contentEl.createEl('p', { text: p });
    }

    const buttons = contentEl.createDiv({ cls: 'dmt-modal-buttons' });

    const cancelBtn = buttons.createEl('button', { text: this.cancelText });
    cancelBtn.onclick = () => {
      this.resolved = true;
      this.resolvePromise(false);
      this.close();
    };

    const confirmBtn = buttons.createEl('button', {
      text: this.confirmText,
      cls: this.isDestructive ? 'mod-warning' : 'mod-cta'
    });
    confirmBtn.onclick = () => {
      this.resolved = true;
      this.resolvePromise(true);
      this.close();
    };
  }

  onClose() {
    this.contentEl.empty();
    if (!this.resolved && this.resolvePromise) {
      this.resolvePromise(false);
    }
  }

  openAndGetValue() {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.open();
    });
  }
}`;

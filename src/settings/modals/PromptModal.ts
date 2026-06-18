import type { App} from 'obsidian';
import { Modal, Setting, Notice } from 'obsidian';

interface PromptModalOptions {
  message?: string;
  defaultValue?: string;
  placeholder?: string;
}

class PromptModal extends Modal {
  private message: string;
  private defaultValue: string;
  private placeholder: string;
  private inputValue: string;
  private resolved: boolean;
  private resolvePromise!: (value: string | null) => void;

  constructor(app: App, options: PromptModalOptions = {}) {
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
        text.onChange((v: string) => { this.inputValue = v; });
        window.setTimeout(() => {
          text.inputEl.focus();
          text.inputEl.select();
        }, 50);
      });

    const buttons = contentEl.createDiv({ cls: 'windrose-modal-buttons' });

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

  openAndGetValue(): Promise<string | null> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.open();
    });
  }
}

export { PromptModal };

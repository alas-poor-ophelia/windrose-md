import type { App} from 'obsidian';
import { Modal } from 'obsidian';

interface ConfirmModalOptions {
  message?: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
}

class ConfirmModal extends Modal {
  private message: string;
  private confirmText: string;
  private cancelText: string;
  private isDestructive: boolean;
  private resolved: boolean;
  private resolvePromise!: (value: boolean) => void;

  constructor(app: App, options: ConfirmModalOptions = {}) {
    super(app);
    this.message = options.message != null && options.message !== '' ? options.message : 'Are you sure?';
    this.confirmText = options.confirmText != null && options.confirmText !== '' ? options.confirmText : 'Confirm';
    this.cancelText = options.cancelText != null && options.cancelText !== '' ? options.cancelText : 'Cancel';
    this.isDestructive = options.isDestructive ?? false;
    this.resolved = false;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();

    const paragraphs = this.message.split('\n').filter(s => s.trim());
    for (const p of paragraphs) {
      contentEl.createEl('p', { text: p });
    }

    const buttons = contentEl.createDiv({ cls: 'windrose-modal-buttons' });

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

  onClose(): void {
    this.contentEl.empty();
    if (!this.resolved && this.resolvePromise != null) {
      this.resolvePromise(false);
    }
  }

  openAndGetValue(): Promise<boolean> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.open();
    });
  }
}

export { ConfirmModal };

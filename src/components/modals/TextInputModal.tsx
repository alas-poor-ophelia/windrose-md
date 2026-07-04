/**
 * TextInputModal.tsx
 *
 * Modal dialog for text input (object notes/tooltips).
 * Uses native Obsidian Modal.
 */

import { Modal } from 'obsidian';
import type { App } from 'obsidian';

function openNativeTextInputModal(options: {
  app: App;
  onSubmit: (text: string) => void;
  onCancel?: () => void;
  title?: string;
  placeholder?: string;
  initialValue?: string;
}): boolean {
  try {

    const {
      app,
      onSubmit,
      onCancel,
      title = 'Add Text Label',
      placeholder = 'Enter label text...',
      initialValue = ''
    } = options;

    const modal = new (class extends Modal {
      private inputEl!: HTMLInputElement;
      private submitted = false;

      onOpen(): void {
        const { contentEl, titleEl } = this;
        titleEl.setText(title);

        this.inputEl = contentEl.createEl('input', {
          type: 'text',
          placeholder,
          value: initialValue,
          cls: 'windrose-modal-input windrose-text-input-modal-input'
        });
        this.inputEl.maxLength = 200;

        this.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.submit();
          }
        });

        const buttonContainer = contentEl.createDiv({
          cls: 'windrose-modal-buttons windrose-modal-button-row'
        });

        const cancelBtn = buttonContainer.createEl('button', {
          text: 'Cancel',
          cls: 'windrose-modal-btn windrose-modal-btn-cancel'
        });
        cancelBtn.addEventListener('click', () => this.close());

        const submitBtn = buttonContainer.createEl('button', {
          text: initialValue ? 'Update' : 'Add Label',
          cls: 'windrose-modal-btn windrose-modal-btn-submit'
        });
        submitBtn.addEventListener('click', () => this.submit());

        window.setTimeout(() => {
          this.inputEl.focus();
          if (initialValue) {
            this.inputEl.select();
          }
        }, 0);
      }

      submit(): void {
        const trimmed = this.inputEl.value.trim();
        if (trimmed.length > 0 && trimmed.length <= 200) {
          this.submitted = true;
          onSubmit(trimmed);
          this.close();
        }
      }

      onClose(): void {
        if (!this.submitted && onCancel) {
          onCancel();
        }
        this.contentEl.empty();
      }
    })(app);

    modal.open();
    return true;
  } catch (e) {
    console.warn('[Windrose] Failed to open native TextInputModal:', (e as Error).message);
    return false;
  }
}

export { openNativeTextInputModal };

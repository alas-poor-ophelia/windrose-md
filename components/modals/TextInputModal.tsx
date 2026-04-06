/**
 * TextInputModal.tsx
 *
 * Modal dialog for text input (object notes/tooltips).
 * Uses native Obsidian Modal via the bridge when available,
 * falls back to Preact overlay otherwise.
 */

import type { JSX } from 'preact';
import type { Modal as ObsidianModal, App } from 'obsidian';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { isBridgeAvailable, getObsidianModule } = await requireModuleByName("obsidianBridge.ts") as {
  isBridgeAvailable: () => boolean;
  getObsidianModule: () => Record<string, unknown>;
};

/** Props for TextInputModal Preact component (fallback) */
export interface TextInputModalProps {
  initialValue?: string;
  onSubmit: (text: string) => void;
  onCancel: () => void;
  title?: string;
  placeholder?: string;
}

/**
 * Opens a text input modal using native Obsidian Modal if bridge is available,
 * otherwise returns false so the caller can fall back to the Preact component.
 */
function openNativeTextInputModal(options: {
  onSubmit: (text: string) => void;
  onCancel?: () => void;
  title?: string;
  placeholder?: string;
  initialValue?: string;
}): boolean {
  if (!isBridgeAvailable()) return false;

  try {
    const obs = getObsidianModule();
    const ModalClass = obs.Modal as typeof ObsidianModal;
    const app = (dc as { app: App }).app;

    const {
      onSubmit,
      onCancel,
      title = 'Add Text Label',
      placeholder = 'Enter label text...',
      initialValue = ''
    } = options;

    const modal = new (class extends ModalClass {
      private inputEl!: HTMLInputElement;
      private submitted = false;

      onOpen(): void {
        const { contentEl, titleEl } = this;
        titleEl.setText(title);

        this.inputEl = contentEl.createEl('input', {
          type: 'text',
          placeholder,
          value: initialValue,
          cls: 'dmt-modal-input'
        });
        this.inputEl.maxLength = 200;
        this.inputEl.style.width = '100%';
        this.inputEl.style.marginBottom = '12px';

        this.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.submit();
          }
        });

        const buttonContainer = contentEl.createEl('div', {
          cls: 'dmt-modal-buttons'
        });
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'flex-end';
        buttonContainer.style.gap = '8px';

        const cancelBtn = buttonContainer.createEl('button', {
          text: 'Cancel',
          cls: 'dmt-modal-btn dmt-modal-btn-cancel'
        });
        cancelBtn.addEventListener('click', () => this.close());

        const submitBtn = buttonContainer.createEl('button', {
          text: initialValue ? 'Update' : 'Add Label',
          cls: 'dmt-modal-btn dmt-modal-btn-submit'
        });
        submitBtn.addEventListener('click', () => this.submit());

        setTimeout(() => {
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
    console.warn('[Windrose] Failed to open native modal, falling back to Preact:', (e as Error).message);
    return false;
  }
}

/**
 * Preact fallback component for when the bridge is unavailable.
 */
const TextInputModal = ({
  initialValue = '',
  onSubmit,
  onCancel,
  title = 'Add Text Label',
  placeholder = 'Enter label text...'
}: TextInputModalProps): React.ReactElement => {
  const [text, setText] = dc.useState(initialValue);
  const inputRef = dc.useRef<HTMLInputElement>(null);

  dc.useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      if (initialValue) {
        inputRef.current.select();
      }
    }
  }, []);

  const handleKeyDown = (e: JSX.TargetedKeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const handleSubmit = (): void => {
    const trimmed = text.trim();
    if (trimmed.length > 0 && trimmed.length <= 200) {
      onSubmit(trimmed);
    }
  };

  const handleModalClick = (e: JSX.TargetedMouseEvent<HTMLDivElement>): void => {
    e.stopPropagation();
  };

  return (
    <div className="dmt-modal-overlay" onClick={onCancel}>
      <div
        className="dmt-modal-content"
        onClick={handleModalClick}
      >
        <h3 className="dmt-modal-title">{title}</h3>

        <input
          ref={inputRef}
          type="text"
          className="dmt-modal-input"
          value={text}
          onChange={(e) => setText((e.target as HTMLInputElement).value)}
          onKeyDown={handleKeyDown}
          maxLength={200}
          placeholder={placeholder}
        />

        <div className="dmt-modal-buttons">
          <button
            className="dmt-modal-btn dmt-modal-btn-cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="dmt-modal-btn dmt-modal-btn-submit"
            onClick={handleSubmit}
            disabled={text.trim().length === 0}
          >
            {initialValue ? 'Update' : 'Add Label'}
          </button>
        </div>

        <div className="dmt-modal-hint">
          Press Enter to confirm, Esc to cancel
        </div>
      </div>
    </div>
  );
};

return { TextInputModal, openNativeTextInputModal };

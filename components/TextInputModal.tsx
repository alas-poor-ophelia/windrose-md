/**
 * TextInputModal.tsx
 *
 * Modal dialog for text label entry.
 */

import type { JSX } from 'preact';

/** Props for TextInputModal component */
export interface TextInputModalProps {
  /** Initial text value (for editing existing labels) */
  initialValue?: string;
  /** Callback when text is submitted */
  onSubmit: (text: string) => void;
  /** Callback when modal is cancelled */
  onCancel: () => void;
  /** Modal title */
  title?: string;
  /** Input placeholder text */
  placeholder?: string;
}

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
      // Select all text if editing existing label
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

  // Prevent clicks inside modal from closing it
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

return { TextInputModal };

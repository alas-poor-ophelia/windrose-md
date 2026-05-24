/**
 * CloneLayerModal.tsx
 *
 * Modal for choosing layer clone mode: full clone or map-only.
 * Uses native Obsidian Modal via the bridge when available,
 * falls back to Preact overlay otherwise.
 */

import type { JSX, VNode } from 'preact';

import { Modal } from 'obsidian';
import type { App } from 'obsidian';


export type CloneMode = 'all' | 'mapOnly';

export interface CloneLayerModalProps {
  layerName: string;
  onClone: (mode: CloneMode) => void;
  onCancel: () => void;
}

function openNativeCloneLayerModal(options: {
  app: App;
  layerName: string;
  onClone: (mode: CloneMode) => void;
  onCancel?: () => void;
}): boolean {
  try {

    const { app, layerName, onClone, onCancel } = options;

    const modal = new (class extends Modal {
      private submitted = false;

      onOpen(): void {
        const { contentEl, titleEl } = this;
        titleEl.setText(`Clone Layer: ${layerName}`);

        contentEl.createEl('p', {
          text: 'Choose what to include in the cloned layer:'
        });

        const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

        const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
        cancelBtn.addEventListener('click', () => this.close());

        const mapOnlyBtn = buttonContainer.createEl('button', { text: 'Map only' });
        mapOnlyBtn.addEventListener('click', () => {
          this.submitted = true;
          onClone('mapOnly');
          this.close();
        });

        const cloneAllBtn = buttonContainer.createEl('button', {
          text: 'Clone all',
          cls: 'mod-cta'
        });
        cloneAllBtn.addEventListener('click', () => {
          this.submitted = true;
          onClone('all');
          this.close();
        });
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
    // eslint-disable-next-line no-console
    console.warn('[Windrose] Failed to open native clone modal, falling back to Preact:', (e as Error).message);
    return false;
  }
}

const CloneLayerModal = ({
  layerName,
  onClone,
  onCancel
}: CloneLayerModalProps): VNode => {

  const handleModalClick = (e: JSX.TargetedMouseEvent<HTMLDivElement>): void => {
    e.stopPropagation();
  };

  return (
    <div className="windrose-modal-overlay" onClick={onCancel}>
      <div className="windrose-modal-content" onClick={handleModalClick}>
        <h3 className="windrose-modal-title">{`Clone Layer: ${layerName}`}</h3>

        <p style={{ margin: '0 0 16px 0' }}>
          Choose what to include in the cloned layer:
        </p>

        <div className="windrose-modal-buttons">
          <button
            className="windrose-modal-btn windrose-modal-btn-cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="windrose-modal-btn"
            onClick={() => onClone('mapOnly')}
          >
            Map Only
          </button>
          <button
            className="windrose-modal-btn windrose-modal-btn-submit"
            onClick={() => onClone('all')}
          >
            Clone All
          </button>
        </div>
      </div>
    </div>
  );
};

export { CloneLayerModal, openNativeCloneLayerModal };
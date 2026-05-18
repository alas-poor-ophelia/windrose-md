/**
 * CloneLayerModal.tsx
 *
 * Modal for choosing layer clone mode: full clone or map-only.
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

export type CloneMode = 'all' | 'mapOnly';

export interface CloneLayerModalProps {
  layerName: string;
  onClone: (mode: CloneMode) => void;
  onCancel: () => void;
}

function openNativeCloneLayerModal(options: {
  layerName: string;
  onClone: (mode: CloneMode) => void;
  onCancel?: () => void;
}): boolean {
  if (!isBridgeAvailable()) return false;

  try {
    const obs = getObsidianModule();
    const ModalClass = obs.Modal as typeof ObsidianModal;
    const app = (dc as { app: App }).app;

    const { layerName, onClone, onCancel } = options;

    const modal = new (class extends ModalClass {
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

        const mapOnlyBtn = buttonContainer.createEl('button', { text: 'Map Only' });
        mapOnlyBtn.addEventListener('click', () => {
          this.submitted = true;
          onClone('mapOnly');
          this.close();
        });

        const cloneAllBtn = buttonContainer.createEl('button', {
          text: 'Clone All',
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
    console.warn('[Windrose] Failed to open native clone modal, falling back to Preact:', (e as Error).message);
    return false;
  }
}

const CloneLayerModal = ({
  layerName,
  onClone,
  onCancel
}: CloneLayerModalProps): React.ReactElement => {

  const handleModalClick = (e: JSX.TargetedMouseEvent<HTMLDivElement>): void => {
    e.stopPropagation();
  };

  return (
    <div className="dmt-modal-overlay" onClick={onCancel}>
      <div className="dmt-modal-content" onClick={handleModalClick}>
        <h3 className="dmt-modal-title">{`Clone Layer: ${layerName}`}</h3>

        <p style={{ margin: '0 0 16px 0' }}>
          Choose what to include in the cloned layer:
        </p>

        <div className="dmt-modal-buttons">
          <button
            className="dmt-modal-btn dmt-modal-btn-cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="dmt-modal-btn"
            onClick={() => onClone('mapOnly')}
          >
            Map Only
          </button>
          <button
            className="dmt-modal-btn dmt-modal-btn-submit"
            onClick={() => onClone('all')}
          >
            Clone All
          </button>
        </div>
      </div>
    </div>
  );
};

return { CloneLayerModal, openNativeCloneLayerModal };

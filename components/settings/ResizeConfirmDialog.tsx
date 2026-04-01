/**
 * ResizeConfirmDialog.tsx
 *
 * Confirmation dialog shown when resizing the grid would orphan content.
 * Warns users about cells/objects that will be deleted outside new bounds.
 *
 * Native path: opens an Obsidian Modal imperatively.
 * Fallback path: custom overlay via ModalPortal.
 */

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { ModalPortal } = await requireModuleByName("ModalPortal.tsx");
const { isBridgeAvailable, getObsidianModule } = await requireModuleByName("obsidianBridge.ts");
const { useHexGrid } = await requireModuleByName("MapSettingsContext.tsx");

/** Orphan content info */
interface OrphanInfo {
  cells: number;
  objects: number;
}

/**
 * Native resize confirmation dialog using Obsidian Modal
 */
function NativeResizeConfirmDialog(): React.ReactElement | null {
  const {
    showResizeConfirm,
    orphanInfo,
    handleResizeConfirmDelete,
    handleResizeConfirmCancel
  } = useHexGrid() as {
    showResizeConfirm: boolean;
    orphanInfo: OrphanInfo;
    handleResizeConfirmDelete: () => void;
    handleResizeConfirmCancel: () => void;
  };

  const deleteRef = dc.useRef(handleResizeConfirmDelete);
  deleteRef.current = handleResizeConfirmDelete;
  const cancelRef = dc.useRef(handleResizeConfirmCancel);
  cancelRef.current = handleResizeConfirmCancel;

  dc.useEffect(() => {
    if (!showResizeConfirm || !isBridgeAvailable()) return;

    const obs = getObsidianModule();
    const ModalClass = obs.Modal as new (app: unknown) => {
      contentEl: HTMLElement;
      titleEl: { setText: (t: string) => void };
      open: () => void;
      close: () => void;
      onClose: () => void;
    };
    const app = (dc as unknown as { app: unknown }).app;

    let closedByCode = false;
    const modal = new ModalClass(app);
    modal.titleEl.setText('Content Outside New Grid');

    const content = modal.contentEl;
    content.createEl('p', {
      text: 'Resizing the grid will remove content outside the new boundaries:'
    });

    const list = content.createEl('ul');
    if (orphanInfo.cells > 0) {
      list.createEl('li', {
        text: `${orphanInfo.cells} painted cell${orphanInfo.cells !== 1 ? 's' : ''}`
      });
    }
    if (orphanInfo.objects > 0) {
      list.createEl('li', {
        text: `${orphanInfo.objects} object${orphanInfo.objects !== 1 ? 's' : ''}/pin${orphanInfo.objects !== 1 ? 's' : ''}`
      });
    }

    content.createEl('p', {
      text: 'This content will be permanently deleted when you save. To recover it, cancel and expand the grid bounds instead.',
      cls: 'setting-item-description'
    });

    const buttonRow = content.createDiv({ cls: 'modal-button-container' });

    const cancelBtn = buttonRow.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => {
      closedByCode = true;
      modal.close();
      cancelRef.current();
    });

    const deleteBtn = buttonRow.createEl('button', {
      text: 'Delete & Resize',
      cls: 'mod-warning'
    });
    deleteBtn.addEventListener('click', () => {
      closedByCode = true;
      modal.close();
      deleteRef.current();
    });

    modal.onClose = () => {
      if (!closedByCode) {
        cancelRef.current();
      }
    };

    modal.open();

    return () => {
      closedByCode = true;
      modal.close();
    };
  }, [showResizeConfirm]);

  return null;
}

/**
 * Fallback resize confirmation dialog (deprecation target)
 */
function FallbackResizeConfirmDialog(): React.ReactElement | null {
  const {
    showResizeConfirm,
    orphanInfo,
    handleResizeConfirmDelete,
    handleResizeConfirmCancel
  } = useHexGrid() as {
    showResizeConfirm: boolean;
    orphanInfo: OrphanInfo;
    handleResizeConfirmDelete: () => void;
    handleResizeConfirmCancel: () => void;
  };

  if (!showResizeConfirm) {
    return null;
  }

  return (
    <ModalPortal>
      <div
        class="dmt-modal-backdrop"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10001
        }}
        onClick={(e: Event) => e.stopPropagation()}
      >
        <div
          class="dmt-confirm-dialog"
          style={{
            background: 'var(--background-primary)',
            borderRadius: '8px',
            padding: '20px',
            maxWidth: '400px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
            border: '1px solid var(--background-modifier-border)'
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <span style={{ color: 'var(--text-warning)', display: 'flex' }}>
              <dc.Icon icon="lucide-alert-triangle" />
            </span>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-normal)' }}>
              Content Outside New Grid
            </h3>
          </div>

          {/* Message */}
          <p style={{ fontSize: '14px', color: 'var(--text-normal)', marginBottom: '12px', lineHeight: '1.5' }}>
            Resizing the grid will remove content outside the new boundaries:
          </p>

          {/* Content list */}
          <ul style={{
            fontSize: '13px',
            color: 'var(--text-muted)',
            marginBottom: '16px',
            paddingLeft: '20px',
            lineHeight: '1.6'
          }}>
            {orphanInfo.cells > 0 && (
              <li>{orphanInfo.cells} painted cell{orphanInfo.cells !== 1 ? 's' : ''}</li>
            )}
            {orphanInfo.objects > 0 && (
              <li>{orphanInfo.objects} object{orphanInfo.objects !== 1 ? 's' : ''}/pin{orphanInfo.objects !== 1 ? 's' : ''}</li>
            )}
          </ul>

          {/* Warning */}
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: '1.5' }}>
            This content will be permanently deleted when you save. To recover it, cancel and expand the grid bounds instead.
          </p>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button
              class="dmt-modal-btn"
              onClick={handleResizeConfirmCancel}
              style={{
                padding: '8px 16px',
                borderRadius: '4px',
                border: '1px solid var(--background-modifier-border)',
                background: 'var(--background-secondary)',
                color: 'var(--text-normal)',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              Cancel
            </button>
            <button
              class="dmt-modal-btn"
              onClick={handleResizeConfirmDelete}
              style={{
                padding: '8px 16px',
                borderRadius: '4px',
                border: 'none',
                background: 'var(--text-error)',
                color: 'white',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500
              }}
            >
              Delete & Resize
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/**
 * Resize confirmation dialog — delegates to native or fallback
 */
function ResizeConfirmDialog(): React.ReactElement | null {
  if (isBridgeAvailable()) {
    return h(NativeResizeConfirmDialog, null);
  }
  return h(FallbackResizeConfirmDialog, null);
}

return { ResizeConfirmDialog };

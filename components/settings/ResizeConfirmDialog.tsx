/**
 * ResizeConfirmDialog.tsx
 *
 * Confirmation dialog shown when resizing the grid would orphan content.
 * Warns users about cells/objects that will be deleted outside new bounds.
 */

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { ModalPortal } = await requireModuleByName("ModalPortal.tsx");
const { useMapSettings } = await requireModuleByName("MapSettingsContext.tsx");

/** Orphan content info */
interface OrphanInfo {
  cells: number;
  objects: number;
}

/**
 * Resize confirmation dialog
 */
function ResizeConfirmDialog(): React.ReactElement | null {
  const {
    showResizeConfirm,
    orphanInfo,
    handleResizeConfirmDelete,
    handleResizeConfirmCancel
  } = useMapSettings() as {
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

return { ResizeConfirmDialog };

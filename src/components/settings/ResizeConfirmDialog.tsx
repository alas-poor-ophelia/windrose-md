/**
 * ResizeConfirmDialog.tsx
 *
 * Confirmation dialog shown when resizing the grid would orphan content.
 * Warns users about cells/objects that will be deleted outside new bounds.
 *
 * Native path: opens an Obsidian Modal imperatively.
 * Fallback path: custom overlay via ModalPortal.
 */

import { h } from 'preact';








/** Orphan content info */

import { useEffect, useRef } from 'preact/hooks';
import type { VNode } from 'preact';
import { Modal } from 'obsidian';
import { useApp } from '../../context/AppContext';
import { useHexGrid } from '../../context/MapSettingsContext';
import type { OrphanInfo } from '../../context/MapSettingsContext';

/**
 * Native resize confirmation dialog using Obsidian Modal
 */
function NativeResizeConfirmDialog(): VNode | null {
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

  const app = useApp();
  const deleteRef = useRef(handleResizeConfirmDelete);
  deleteRef.current = handleResizeConfirmDelete;
  const cancelRef = useRef(handleResizeConfirmCancel);
  cancelRef.current = handleResizeConfirmCancel;

  useEffect((): (() => void) | undefined => {
    if (!showResizeConfirm) return undefined;

    let closedByCode = false;
    const modal = new Modal(app);
    modal.titleEl.setText('Content outside new grid');

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
      text: 'Delete & resize',
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
  }, [showResizeConfirm, app, orphanInfo.cells, orphanInfo.objects]);

  return null;
}

/**
 * Resize confirmation dialog — delegates to native or fallback
 */
function ResizeConfirmDialog(): VNode | null {
  return h(NativeResizeConfirmDialog, null) as VNode;
}

export { ResizeConfirmDialog };
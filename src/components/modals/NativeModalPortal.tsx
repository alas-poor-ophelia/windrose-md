/**
 * NativeModalPortal.tsx
 *
 * Preact component that renders children inside a native Obsidian Modal.
 * Uses createPortal to render into the modal's contentEl, maintaining
 * the parent Preact context chain for natural updates.
 */

import { Modal } from 'obsidian';
import type { App } from 'obsidian';
import type { VNode } from 'preact';
import { h, Fragment } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useApp } from '../../context/AppContext';

const MODAL_MIN_WIDTH = 400;
const MODAL_MIN_HEIGHT = 300;
const MODAL_MAX_WIDTH = 900;
const MODAL_MAX_HEIGHT = 800;
const MODAL_SIZE_KEY = 'windrose-native-modal-size';

function loadModalSize(app: App): { width: number; height: number } | null {
  try {
    const stored = app.loadLocalStorage(MODAL_SIZE_KEY) as string | null;
    if (stored != null && stored !== '') {
      const parsed = JSON.parse(stored) as { width: number; height: number };
      return {
        width: Math.max(MODAL_MIN_WIDTH, Math.min(MODAL_MAX_WIDTH, parsed.width)),
        height: Math.max(MODAL_MIN_HEIGHT, Math.min(MODAL_MAX_HEIGHT, parsed.height))
      };
    }
  } catch { /* ignore */ }
  return null;
}

function saveModalSize(app: App, width: number, height: number): void {
  try {
    app.saveLocalStorage(MODAL_SIZE_KEY, JSON.stringify({ width, height }));
  } catch { /* ignore */ }
}

type InteractFn = (target: HTMLElement) => {
  draggable: (opts: unknown) => unknown;
  resizable: (opts: unknown) => unknown;
  unset: () => void;
};

let _interactCache: InteractFn | null = null;
async function loadInteract(): Promise<InteractFn> {
  if (_interactCache) return _interactCache;
  const { interact } = await import('../../core/interactjs');
  _interactCache = interact as unknown as InteractFn;
  return _interactCache;
}

async function setupModalInteract(
  modalEl: HTMLElement,
  options: { draggable?: boolean; resizable?: boolean },
  app: App
): Promise<() => void> {
  const interact = await loadInteract();

  modalEl.classList.add('windrose-native-modal-interactive');

  const savedSize = loadModalSize(app);
  if (savedSize && options.resizable === true) {
    modalEl.style.setProperty('width', `${savedSize.width}px`);
    modalEl.style.setProperty('height', `${savedSize.height}px`);
  }

  const containerEl = modalEl.parentElement;
  if (containerEl) {
    containerEl.classList.add('windrose-modal-portal-container');
  }

  const rect = modalEl.getBoundingClientRect();
  if (containerEl) {
    const containerRect = containerEl.getBoundingClientRect();
    const x = (containerRect.width - rect.width) / 2;
    const y = (containerRect.height - rect.height) / 2;
    modalEl.style.setProperty('left', `${x}px`);
    modalEl.style.setProperty('top', `${y}px`);
    modalEl.classList.add('windrose-modal-centered');
    modalEl.dataset.x = String(x);
    modalEl.dataset.y = String(y);
  }

  if (options.resizable === true) {
    const edges = ['top', 'right', 'bottom', 'left', 'top-right', 'top-left', 'bottom-right', 'bottom-left'];
    for (const edge of edges) {
      const handle = document.createElement('div');
      handle.className = `windrose-resize-handle windrose-resize-${edge}`;
      modalEl.appendChild(handle);
    }
  }

  const interactable = interact(modalEl);

  if (options.draggable === true) {
    interactable.draggable({
      allowFrom: '.modal-header',
      listeners: {
        move(event: { dx: number; dy: number; target: HTMLElement }) {
          const target = event.target;
          const x = (parseFloat(target.dataset.x ?? '0')) + event.dx;
          const y = (parseFloat(target.dataset.y ?? '0')) + event.dy;
          target.style.left = `${x}px`;
          target.style.top = `${y}px`;
          target.dataset.x = String(x);
          target.dataset.y = String(y);
        }
      }
    });
  }

  if (options.resizable === true) {
    interactable.resizable({
      edges: {
        top: '.windrose-resize-top, .windrose-resize-top-left, .windrose-resize-top-right',
        right: '.windrose-resize-right, .windrose-resize-top-right, .windrose-resize-bottom-right',
        bottom: '.windrose-resize-bottom, .windrose-resize-bottom-left, .windrose-resize-bottom-right',
        left: '.windrose-resize-left, .windrose-resize-top-left, .windrose-resize-bottom-left'
      },
      listeners: {
        move(event: {
          target: HTMLElement;
          rect: { width: number; height: number };
          deltaRect: { left: number; top: number };
        }) {
          const target = event.target;
          const { width, height } = event.rect;
          const clampedWidth = Math.max(MODAL_MIN_WIDTH, Math.min(MODAL_MAX_WIDTH, width));
          const clampedHeight = Math.max(MODAL_MIN_HEIGHT, Math.min(MODAL_MAX_HEIGHT, height));
          target.style.width = `${clampedWidth}px`;
          target.style.height = `${clampedHeight}px`;
          const x = (parseFloat(target.dataset.x ?? '0')) + event.deltaRect.left;
          const y = (parseFloat(target.dataset.y ?? '0')) + event.deltaRect.top;
          target.style.left = `${x}px`;
          target.style.top = `${y}px`;
          target.dataset.x = String(x);
          target.dataset.y = String(y);
        },
        end(event: { target: HTMLElement; rect: { width: number; height: number } }) {
          saveModalSize(app, event.rect.width, event.rect.height);
        }
      }
    });
  }

  if (options.draggable === true) {
    const header = modalEl.querySelector('.modal-header');
    if (header) {
      header.classList.add('windrose-modal-drag-handle');
    }
  }

  return () => {
    interactable.unset();
    modalEl.querySelectorAll('.windrose-resize-handle').forEach(el => el.remove());
  };
}

interface NativeModalPortalProps {
  onClose: () => void;
  modalClass?: string;
  title?: string;
  draggable?: boolean;
  resizable?: boolean;
  contextBridge?: (children: unknown) => unknown;
  children?: unknown;
}

function NativeModalPortal({
  onClose,
  modalClass,
  title,
  draggable,
  resizable,
  contextBridge,
  children
}: NativeModalPortalProps): VNode | null {
  const app = useApp();
  const [renderTarget, setRenderTarget] = useState<HTMLDivElement | null>(null);
  const modalRef = useRef<Modal | null>(null);
  const closedByCodeRef = useRef(false);
  const closedExternallyRef = useRef(false);
  const interactCleanupRef = useRef<(() => void) | null>(null);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const modal = new (class extends Modal {
      onOpen(): void {
        if (title != null && title !== '') {
          this.titleEl.setText(title);
        }
        if (modalClass != null && modalClass !== '') {
          this.modalEl.addClass(modalClass);
        }
        const target = this.contentEl.createDiv();
        target.classList.add('windrose-modal-render-target');
        setRenderTarget(target);

        if ((draggable === true || resizable === true) && !('ontouchstart' in window)) {
          setupModalInteract(this.modalEl, { draggable, resizable }, this.app).then(cleanup => {
            interactCleanupRef.current = cleanup;
          }).catch(err => {
            // eslint-disable-next-line no-console
            console.warn('[Windrose] Failed to set up modal drag/resize:', err);
          });
        }
      }
      onClose(): void {
        closedExternallyRef.current = true;
        if (!closedByCodeRef.current) {
          onCloseRef.current();
        }
      }
    })(app);

    modalRef.current = modal;
    modal.open();

    return () => {
      closedByCodeRef.current = true;
      if (interactCleanupRef.current) {
        interactCleanupRef.current();
        interactCleanupRef.current = null;
      }
      if (!closedExternallyRef.current) {
        modal.close();
      }
    };
  }, []);

  if (!renderTarget) return null;

  const content = contextBridge ? contextBridge(children) : children;
  return createPortal(h(Fragment, null, content as VNode), renderTarget);
}

export { NativeModalPortal };

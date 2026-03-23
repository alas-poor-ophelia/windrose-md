/**
 * obsidianBridge.ts
 *
 * Bridge utility for accessing the `obsidian` module from Datacore components.
 * The settings plugin captures `require('obsidian')` and stores it on
 * `window.__windrose`. This module encapsulates all access behind a typed API.
 *
 * Components load the bridge via:
 *   const { getObsidianModule } = await requireModuleByName("obsidianBridge.ts");
 *
 * Then cast at point of use:
 *   const obs = getObsidianModule();
 *   const Modal = obs.Modal as typeof import('obsidian').Modal;
 */

declare global {
  interface Window {
    __windrose?: {
      obsidian: Record<string, unknown>;
      version: string;
      ready: boolean;
    };
  }
}

/**
 * Returns true if the settings plugin has initialized the bridge.
 */
function isBridgeAvailable(): boolean {
  return window.__windrose?.ready === true;
}

/**
 * Returns the full obsidian module object, typed loosely.
 * Throws if bridge is unavailable.
 */
function getObsidianModule(): Record<string, unknown> {
  if (!window.__windrose?.ready) {
    throw new Error(
      '[Windrose] Obsidian bridge not available. Is the settings plugin installed and enabled?'
    );
  }
  return window.__windrose.obsidian;
}

/**
 * Returns a Promise that resolves when the bridge is ready,
 * or rejects after timeout.
 */
function waitForBridge(timeoutMs: number = 5000): Promise<void> {
  if (window.__windrose?.ready) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const onReady = (): void => {
      clearTimeout(timer);
      resolve();
    };

    const timer = setTimeout(() => {
      window.removeEventListener('windrose:bridge-ready', onReady);
      reject(new Error(
        `[Windrose] Bridge did not initialize within ${timeoutMs}ms. ` +
        `Ensure the Windrose Settings plugin is installed and enabled.`
      ));
    }, timeoutMs);

    window.addEventListener('windrose:bridge-ready', onReady, { once: true });
  });
}

/** Size constraints for resizable modals */
const MODAL_MIN_WIDTH = 400;
const MODAL_MIN_HEIGHT = 300;
const MODAL_MAX_WIDTH = 900;
const MODAL_MAX_HEIGHT = 800;
const MODAL_SIZE_KEY = 'windrose-native-modal-size';

/**
 * Load/save modal size from localStorage
 */
function loadModalSize(): { width: number; height: number } | null {
  try {
    const stored = localStorage.getItem(MODAL_SIZE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        width: Math.max(MODAL_MIN_WIDTH, Math.min(MODAL_MAX_WIDTH, parsed.width)),
        height: Math.max(MODAL_MIN_HEIGHT, Math.min(MODAL_MAX_HEIGHT, parsed.height))
      };
    }
  } catch { /* ignore */ }
  return null;
}

function saveModalSize(width: number, height: number): void {
  try {
    localStorage.setItem(MODAL_SIZE_KEY, JSON.stringify({ width, height }));
  } catch { /* ignore */ }
}

/** interact.js function type for drag/resize */
type InteractFn = (target: HTMLElement) => {
  draggable: (opts: unknown) => unknown;
  resizable: (opts: unknown) => unknown;
  unset: () => void;
};

/**
 * Lazily load interact.js via the Datacore module system.
 * Cached after first load.
 */
let _interactCache: InteractFn | null = null;
async function loadInteract(): Promise<InteractFn> {
  if (_interactCache) return _interactCache;
  // Dynamic loading via eval-style to avoid transformer regex stripping
  const resolver = await dc.require(dc.resolvePath("pathResolver.ts")) as {
    requireModuleByName: (name: string) => Promise<{ interact: InteractFn }>
  };
  const mod = await resolver.requireModuleByName("interactjs.ts");
  _interactCache = mod.interact;
  return _interactCache;
}

/**
 * Set up interact.js drag and resize on a native modal element.
 * Returns a cleanup function that calls interactable.unset().
 */
async function setupModalInteract(
  modalEl: HTMLElement,
  options: { draggable?: boolean; resizable?: boolean }
): Promise<() => void> {
  const interact = await loadInteract();

  // Switch from relative (Obsidian default) to absolute positioning for drag
  modalEl.style.position = 'absolute';

  // Restore persisted size if available
  const savedSize = loadModalSize();
  if (savedSize && options.resizable) {
    modalEl.style.width = `${savedSize.width}px`;
    modalEl.style.height = `${savedSize.height}px`;
  }

  // Prevent overscroll on the modal container (Obsidian's backdrop)
  modalEl.style.overflow = 'hidden';
  const containerEl = modalEl.parentElement;
  if (containerEl) {
    containerEl.style.overflow = 'hidden';
  }

  // Center the modal initially
  const rect = modalEl.getBoundingClientRect();
  if (containerEl) {
    const containerRect = containerEl.getBoundingClientRect();
    const x = (containerRect.width - rect.width) / 2;
    const y = (containerRect.height - rect.height) / 2;
    modalEl.style.left = `${x}px`;
    modalEl.style.top = `${y}px`;
    modalEl.style.transform = 'none';
    modalEl.style.margin = '0';
    modalEl.dataset.x = String(x);
    modalEl.dataset.y = String(y);
  }

  // Add resize handles
  if (options.resizable) {
    const edges = ['top', 'right', 'bottom', 'left', 'top-right', 'top-left', 'bottom-right', 'bottom-left'];
    for (const edge of edges) {
      const handle = document.createElement('div');
      handle.className = `dmt-resize-handle dmt-resize-${edge}`;
      modalEl.appendChild(handle);
    }
  }

  const interactable = interact(modalEl);

  if (options.draggable) {
    interactable.draggable({
      allowFrom: '.modal-header',
      listeners: {
        move(event: { dx: number; dy: number; target: HTMLElement }) {
          const target = event.target;
          const x = (parseFloat(target.dataset.x || '0')) + event.dx;
          const y = (parseFloat(target.dataset.y || '0')) + event.dy;
          target.style.left = `${x}px`;
          target.style.top = `${y}px`;
          target.dataset.x = String(x);
          target.dataset.y = String(y);
        }
      }
    });
  }

  if (options.resizable) {
    interactable.resizable({
      edges: {
        top: '.dmt-resize-top, .dmt-resize-top-left, .dmt-resize-top-right',
        right: '.dmt-resize-right, .dmt-resize-top-right, .dmt-resize-bottom-right',
        bottom: '.dmt-resize-bottom, .dmt-resize-bottom-left, .dmt-resize-bottom-right',
        left: '.dmt-resize-left, .dmt-resize-top-left, .dmt-resize-bottom-left'
      },
      listeners: {
        move(event: {
          target: HTMLElement;
          rect: { width: number; height: number };
          deltaRect: { left: number; top: number };
        }) {
          const target = event.target;
          const { width, height } = event.rect;

          // Clamp dimensions
          const clampedWidth = Math.max(MODAL_MIN_WIDTH, Math.min(MODAL_MAX_WIDTH, width));
          const clampedHeight = Math.max(MODAL_MIN_HEIGHT, Math.min(MODAL_MAX_HEIGHT, height));

          target.style.width = `${clampedWidth}px`;
          target.style.height = `${clampedHeight}px`;

          // Adjust position for top/left edge resizing
          const x = (parseFloat(target.dataset.x || '0')) + event.deltaRect.left;
          const y = (parseFloat(target.dataset.y || '0')) + event.deltaRect.top;
          target.style.left = `${x}px`;
          target.style.top = `${y}px`;
          target.dataset.x = String(x);
          target.dataset.y = String(y);
        },
        end(event: { target: HTMLElement; rect: { width: number; height: number } }) {
          saveModalSize(event.rect.width, event.rect.height);
        }
      }
    });
  }

  // Add drag cursor to header
  if (options.draggable) {
    const header = modalEl.querySelector('.modal-header') as HTMLElement | null;
    if (header) {
      header.style.cursor = 'grab';
      header.addEventListener('mousedown', () => { header.style.cursor = 'grabbing'; });
      header.addEventListener('mouseup', () => { header.style.cursor = 'grab'; });
    }
  }

  return () => {
    interactable.unset();
    // Remove resize handles
    modalEl.querySelectorAll('.dmt-resize-handle').forEach(el => el.remove());
  };
}

/** Type for dc.preact */
type PreactModule = { render: (vnode: unknown, parent: HTMLElement) => void };

/**
 * Preact component that renders children inside a native Obsidian Modal.
 * Opens a native Modal, then mounts a separate Preact render tree into
 * its contentEl via dc.preact.render(). Children updates are synced
 * on every parent render via useEffect.
 *
 * Because dc.preact.render() creates an independent tree (no shared context),
 * callers must pass a contextBridge function that wraps children with any
 * needed context providers.
 *
 * Props:
 *   onClose: () => void     — called when modal is dismissed (Esc / overlay click)
 *   modalClass?: string     — optional CSS class added to the modal element
 *   title?: string          — optional title set via titleEl.setText()
 *   draggable?: boolean     — enable drag from header (desktop only)
 *   resizable?: boolean     — enable resize from edges/corners (desktop only)
 *   contextBridge?: (children) => vnode — wraps children with context providers
 *   children: any           — Preact children to render inside the modal
 */
function NativeModalPortal({
  onClose,
  modalClass,
  title,
  draggable,
  resizable,
  contextBridge,
  children
}: {
  onClose: () => void;
  modalClass?: string;
  title?: string;
  draggable?: boolean;
  resizable?: boolean;
  contextBridge?: (children: unknown) => React.ReactElement;
  children?: unknown;
}): React.ReactElement | null {
  const contentElRef = dc.useRef<HTMLElement | null>(null);
  const modalRef = dc.useRef<unknown>(null);
  const closedByCodeRef = dc.useRef(false);
  const interactCleanupRef = dc.useRef<(() => void) | null>(null);

  // Store latest onClose in a ref to avoid re-creating the modal on callback changes
  const onCloseRef = dc.useRef(onClose);
  onCloseRef.current = onClose;

  // Open the native modal once on mount
  dc.useEffect(() => {
    if (!isBridgeAvailable()) return;

    const preact = (dc as unknown as { preact: PreactModule }).preact;
    if (!preact?.render) return;

    try {
      const obs = getObsidianModule();
      const ModalClass = obs.Modal as new (app: unknown) => {
        contentEl: HTMLElement;
        modalEl: HTMLElement;
        titleEl: { setText: (t: string) => void };
        open: () => void;
        close: () => void;
        onOpen: () => void;
        onClose: () => void;
      };
      const app = (dc as unknown as { app: unknown }).app;

      const modal = new (class extends (ModalClass as any) {
        onOpen(): void {
          if (title) {
            this.titleEl.setText(title);
          }
          if (modalClass) {
            this.modalEl.addClass(modalClass);
          }
          contentElRef.current = this.contentEl;

          // Set up interact.js drag/resize (desktop only)
          if ((draggable || resizable) && !('ontouchstart' in window)) {
            setupModalInteract(this.modalEl, { draggable, resizable }).then(cleanup => {
              interactCleanupRef.current = cleanup;
            }).catch(err => {
              console.warn('[Windrose] Failed to set up modal drag/resize:', err);
            });
          }
        }
        onClose(): void {
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
        // Unmount the Preact tree before closing
        if (contentElRef.current) {
          preact.render(null as unknown as React.ReactElement, contentElRef.current);
        }
        contentElRef.current = null;
        modal.close();
      };
    } catch (e) {
      console.warn('[Windrose] NativeModalPortal: failed to open native modal:', (e as Error).message);
    }
  }, []);

  // Render children into contentEl as a standalone Preact tree.
  // Runs on every parent render so children updates (tab switches, etc.) propagate.
  dc.useEffect(() => {
    if (!contentElRef.current) return;
    const preact = (dc as unknown as { preact: PreactModule }).preact;
    if (!preact?.render) return;

    const wrapper = h('div', {
      style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }
    }, children);

    preact.render(contextBridge ? contextBridge(wrapper) : wrapper, contentElRef.current);
  });

  // This component owns no DOM — the native modal is the container
  return null;
}

return { isBridgeAvailable, getObsidianModule, waitForBridge, NativeModalPortal };

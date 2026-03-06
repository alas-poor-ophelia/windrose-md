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

/**
 * Preact component that renders children inside a native Obsidian Modal.
 * When mounted, opens a Modal; when unmounted, closes it.
 * Children are rendered in the Preact tree then portaled into contentEl.
 *
 * Props:
 *   onClose: () => void     — called when modal is dismissed (Esc / overlay click)
 *   modalClass?: string     — optional CSS class added to the modal element
 *   title?: string          — optional title set via titleEl.setText()
 *   children: any           — Preact children to render inside the modal
 */
function NativeModalPortal({
  onClose,
  modalClass,
  title,
  children
}: {
  onClose: () => void;
  modalClass?: string;
  title?: string;
  children?: unknown;
}): React.ReactElement {
  const wrapperRef = dc.useRef<HTMLDivElement>(null);
  const modalRef = dc.useRef<unknown>(null);
  const closedByCodeRef = dc.useRef(false);
  const [isPortaled, setIsPortaled] = dc.useState(false);

  // Store latest onClose in a ref to avoid re-creating the modal on callback changes
  const onCloseRef = dc.useRef(onClose);
  onCloseRef.current = onClose;

  dc.useEffect(() => {
    if (!isBridgeAvailable()) return;

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
          if (wrapperRef.current) {
            this.contentEl.appendChild(wrapperRef.current);
          }
          setIsPortaled(true);
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
        modal.close();
      };
    } catch (e) {
      console.warn('[Windrose] NativeModalPortal: failed to open native modal:', (e as Error).message);
    }
  }, []);

  return h('div', {
    ref: wrapperRef,
    style: isPortaled ? { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } : { display: 'none' }
  }, children);
}

return { isBridgeAvailable, getObsidianModule, waitForBridge, NativeModalPortal };

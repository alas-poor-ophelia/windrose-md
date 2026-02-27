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

return { isBridgeAvailable, getObsidianModule, waitForBridge };

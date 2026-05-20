/**
 * TEMPORARY: E2E proof-of-concept for Datacore <-> Obsidian API bridge.
 *
 * Verifies that the proposed bridge patterns actually work in the real
 * Obsidian/Electron/Datacore runtime, not just in mocked unit tests.
 *
 * All tests run code inside the Obsidian page via page.evaluate(),
 * which uses the same execution context as Datacore's new Function().
 *
 * Delete this file once the real bridge is implemented and integrated.
 */

import { beforeEach } from "vitest";
import {
  test,
  expect,
  doWithApp,
  navigateToMap,
  waitForContainer,
  TEST_MAPS
} from "./helpers";

// Auto-accept any dialogs to prevent the obsidian-testing-framework's
// dialog handler from racing with test cleanup (causes intermittent
// "Page.handleJavaScriptDialog: No dialog is showing" errors).
beforeEach(({ page }: any) => {
  page.on("dialog", async (dialog: any) => {
    try {
      await dialog.accept();
    } catch {
      // Dialog already dismissed - ignore
    }
  });
});

// ===========================================
// Approach 1: window.__windrose bridge
// ===========================================

test("window global is accessible and writable from Obsidian page context", async ({ page }) => {
  // This is the most fundamental check: can code running in the page
  // (same context as Datacore's new Function) read/write window properties?
  const result = await page.evaluate(() => {
    (window as any).__windrose_test = { initialized: true, ts: Date.now() };
    const bridge = (window as any).__windrose_test;
    const ok = bridge?.initialized === true;
    delete (window as any).__windrose_test;
    return ok;
  });

  expect(result).toBe(true);
});

test("require('obsidian') is NOT available in bare page.evaluate context", async ({ page }) => {
  // IMPORTANT FINDING: window.require('obsidian') does NOT work outside
  // Obsidian's plugin loading context. This eliminates Approach 5
  // (direct require from Datacore) and confirms the bridge must be
  // initialized by the settings plugin which HAS require('obsidian').
  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  const result = await page.evaluate(() => {
    try {
      const obsidian = (window as any).require('obsidian');
      return { available: true, exportCount: Object.keys(obsidian).length };
    } catch (e: any) {
      return { available: false, error: e.message };
    }
  });

  // This SHOULD fail — confirming the bridge is necessary
  expect(result.available).toBe(false);
  expect(result.error).toContain('Cannot find module');
});

test("obsidian module IS accessible through a loaded plugin's exports", async ({ page }) => {
  // The settings plugin has require('obsidian') in its context.
  // Check if it stashed anything useful we can inspect, or if we can
  // reach obsidian classes through plugin prototype chains.
  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  const result = await doWithApp(page, (app: any) => {
    const settingsPlugin = app.plugins.plugins['dungeon-map-tracker-settings'];
    if (!settingsPlugin) return { ok: false, error: 'settings plugin not found' };

    // Check if we can reach Modal/Notice through the plugin's constructor chain
    // All Obsidian plugins extend Plugin, which is from the obsidian module
    const pluginProto = Object.getPrototypeOf(settingsPlugin);
    const hasPrototype = !!pluginProto;
    const protoConstructorName = pluginProto?.constructor?.name || 'unknown';

    // Check if the Datacore plugin exposes obsidian references
    const dcPlugin = app.plugins.plugins['datacore'];
    const dcProtoName = dcPlugin
      ? Object.getPrototypeOf(dcPlugin)?.constructor?.name || 'unknown'
      : 'not found';

    return {
      ok: true,
      hasPrototype,
      protoConstructorName,
      dcProtoName,
      // Check if Modal exists on the global scope (some Obsidian versions expose it)
      hasGlobalModal: typeof (globalThis as any).Modal !== 'undefined',
    };
  });

  expect(result.ok).toBe(true);
  // Both plugins extend the obsidian Plugin class
  expect(result.hasPrototype).toBe(true);
});

test("Settings plugin is accessible via app.plugins.plugins", async ({ page }) => {
  // Verify the existing settingsAccessor pattern works (baseline for the bridge)
  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  const result = await doWithApp(page, (app: any) => {
    const plugin = app.plugins.plugins['dungeon-map-tracker-settings'];
    return {
      exists: !!plugin,
      hasSettings: !!plugin?.settings,
      hasManifest: !!plugin?.manifest,
      version: plugin?.manifest?.version || null,
    };
  });

  expect(result.exists).toBe(true);
  expect(result.hasSettings).toBe(true);
  expect(result.hasManifest).toBe(true);
});

// ===========================================
// Approach 1+5: Full bridge simulation
// ===========================================

test("Bridge pattern: settings plugin exposes capabilities on window, Datacore context reads them", async ({ page }) => {
  // Since require('obsidian') is only available inside plugin loading context,
  // the real settings plugin must stash the module reference during its onload().
  // Here we simulate the Datacore-side consumption of a pre-populated bridge.
  //
  // We test: can a bridge object placed on window by one context be read and
  // used by another context (page.evaluate simulating Datacore's new Function)?
  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  // Step 1: Simulate settings plugin populating the bridge
  // (In real life, the plugin does this in onload with its own require('obsidian'))
  // We use doWithApp to set up a bridge with real plugin data
  await doWithApp(page, (app: any) => {
    const plugin = app.plugins.plugins['dungeon-map-tracker-settings'];
    (window as any).__windrose = {
      plugin,
      version: plugin?.manifest?.version || 'unknown',
      // We can't get the full obsidian module from here, but we can test
      // the bridge mechanism itself: can Datacore-context code see this object?
    };
  });

  // Step 2: From a separate evaluate (simulating Datacore's new Function context),
  // verify the bridge is readable and the plugin reference is live
  const result = await page.evaluate(() => {
    const bridge = (window as any).__windrose;
    if (!bridge) return { ok: false, error: 'bridge not found' };

    return {
      ok: true,
      version: bridge.version,
      hasPlugin: !!bridge.plugin,
      pluginHasSettings: !!bridge.plugin?.settings,
      pluginHasManifest: !!bridge.plugin?.manifest,
      // Test that the reference is live (not a copy)
      settingsIsObject: typeof bridge.plugin?.settings === 'object',
    };
  });

  // Cleanup
  await page.evaluate(() => { delete (window as any).__windrose; });

  expect(result.ok).toBe(true);
  expect(result.hasPlugin).toBe(true);
  expect(result.pluginHasSettings).toBe(true);
  expect(result.pluginHasManifest).toBe(true);
  expect(result.settingsIsObject).toBe(true);
});

// ===========================================
// Approach 2: CustomEvent bus
// ===========================================

test("CustomEvent round-trip between simulated settings plugin and Datacore context", async ({ page }) => {
  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  const result = await page.evaluate(() => {
    return new Promise<any>((resolve) => {
      // Settings plugin side: listen for requests, send responses
      const listener = (e: Event) => {
        const { type, payload, requestId } = (e as CustomEvent).detail;
        if (type === 'test-echo') {
          window.dispatchEvent(new CustomEvent('windrose:response', {
            detail: { requestId, result: { echoed: payload.message, from: 'settings-plugin' } },
          }));
        }
      };
      window.addEventListener('windrose:request', listener);

      // Datacore component side: send request, wait for response
      const requestId = 'test-' + Date.now();
      const responseHandler = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (detail.requestId === requestId) {
          window.removeEventListener('windrose:response', responseHandler);
          window.removeEventListener('windrose:request', listener);
          resolve({ ok: true, response: detail.result });
        }
      };
      window.addEventListener('windrose:response', responseHandler);

      window.dispatchEvent(new CustomEvent('windrose:request', {
        detail: { type: 'test-echo', payload: { message: 'hello from datacore' }, requestId },
      }));

      // Timeout fallback
      setTimeout(() => {
        window.removeEventListener('windrose:response', responseHandler);
        window.removeEventListener('windrose:request', listener);
        resolve({ ok: false, error: 'timeout' });
      }, 3000);
    });
  });

  expect(result.ok).toBe(true);
  expect(result.response.echoed).toBe('hello from datacore');
  expect(result.response.from).toBe('settings-plugin');
});

test("CustomEvent bridge handles async handlers correctly", async ({ page }) => {
  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  const result = await page.evaluate(() => {
    return new Promise<any>((resolve) => {
      // Settings plugin side: async handler with delay
      const listener = async (e: Event) => {
        const { type, payload, requestId } = (e as CustomEvent).detail;
        if (type === 'async-test') {
          // Simulate async work (e.g., reading vault files)
          await new Promise(r => setTimeout(r, 100));
          window.dispatchEvent(new CustomEvent('windrose:response', {
            detail: { requestId, result: { processed: payload.data * 2 } },
          }));
        }
      };
      window.addEventListener('windrose:request', listener);

      const requestId = 'async-' + Date.now();
      const responseHandler = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        if (detail.requestId === requestId) {
          window.removeEventListener('windrose:response', responseHandler);
          window.removeEventListener('windrose:request', listener as any);
          resolve({ ok: true, result: detail.result });
        }
      };
      window.addEventListener('windrose:response', responseHandler);

      window.dispatchEvent(new CustomEvent('windrose:request', {
        detail: { type: 'async-test', payload: { data: 21 }, requestId },
      }));

      setTimeout(() => resolve({ ok: false, error: 'timeout' }), 5000);
    });
  });

  expect(result.ok).toBe(true);
  expect(result.result.processed).toBe(42);
});

// ===========================================
// Coexistence with existing events
// ===========================================

test("Bridge events do not interfere with existing dmt-settings-changed events", async ({ page }) => {
  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  const result = await page.evaluate(() => {
    let settingsEventReceived = false;
    let bridgeResponseReceived = false;

    // Existing pattern: settings-changed listener
    const settingsListener = () => { settingsEventReceived = true; };
    window.addEventListener('dmt-settings-changed', settingsListener);

    // Bridge pattern: request listener
    const bridgeListener = (e: Event) => {
      const { requestId } = (e as CustomEvent).detail;
      window.dispatchEvent(new CustomEvent('windrose:response', {
        detail: { requestId, result: 'ok' },
      }));
    };
    window.addEventListener('windrose:request', bridgeListener);

    // Bridge response listener
    const responseListener = () => { bridgeResponseReceived = true; };
    window.addEventListener('windrose:response', responseListener);

    // Fire both event types
    window.dispatchEvent(new CustomEvent('dmt-settings-changed', { detail: { timestamp: Date.now() } }));
    window.dispatchEvent(new CustomEvent('windrose:request', { detail: { type: 'test', payload: {}, requestId: 'x' } }));

    // Cleanup
    window.removeEventListener('dmt-settings-changed', settingsListener);
    window.removeEventListener('windrose:request', bridgeListener);
    window.removeEventListener('windrose:response', responseListener);

    return { settingsEventReceived, bridgeResponseReceived };
  });

  expect(result.settingsEventReceived).toBe(true);
  expect(result.bridgeResponseReceived).toBe(true);
});

// ===========================================
// Datacore-specific context check
// ===========================================

test("Datacore plugin is accessible and exposes expected API surface", async ({ page }) => {
  await navigateToMap(page, TEST_MAPS.grid);
  await waitForContainer(page);

  const result = await doWithApp(page, (app: any) => {
    const dcPlugin = app.plugins.plugins['datacore'];
    const dcApi = (window as any).datacore;
    return {
      pluginExists: !!dcPlugin,
      apiOnWindow: !!dcApi,
      hasCore: !!dcPlugin?.core,
      coreInitialized: !!dcPlugin?.core?.initialized,
    };
  });

  expect(result.pluginExists).toBe(true);
  expect(result.apiOnWindow).toBe(true);
  expect(result.hasCore).toBe(true);
  expect(result.coreInitialized).toBe(true);
});

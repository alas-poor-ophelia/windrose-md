/**
 * Unit tests for obsidianBridge.ts
 * Tests bridge availability checking, module access, and ready-waiting.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Set up window global with event support before importing
const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
const mockWindow = {
  __windrose: undefined as unknown,
  addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type)!.add(listener);
  }),
  removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
    listeners.get(type)?.delete(listener);
  }),
  dispatchEvent: vi.fn((event: Event) => {
    const eventListeners = listeners.get(event.type);
    if (eventListeners) {
      for (const listener of eventListeners) {
        if (typeof listener === 'function') listener(event);
        else listener.handleEvent(event);
      }
    }
    return true;
  })
};
vi.stubGlobal('window', mockWindow);

import { isBridgeAvailable, getObsidianModule, waitForBridge } from '../../../src/core/obsidianBridge.ts';

describe('obsidianBridge', () => {
  beforeEach(() => {
    mockWindow.__windrose = undefined;
    listeners.clear();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isBridgeAvailable', () => {
    it('returns false when __windrose is undefined', () => {
      expect(isBridgeAvailable()).toBe(false);
    });

    it('returns false when __windrose.ready is false', () => {
      mockWindow.__windrose = { obsidian: null, version: '1.0', ready: false };
      expect(isBridgeAvailable()).toBe(false);
    });

    it('returns true when __windrose.ready is true', () => {
      mockWindow.__windrose = { obsidian: { Modal: class {} }, version: '1.0', ready: true };
      expect(isBridgeAvailable()).toBe(true);
    });
  });

  describe('getObsidianModule', () => {
    it('throws when bridge is not available', () => {
      expect(() => getObsidianModule()).toThrow(
        '[Windrose] Obsidian bridge not available'
      );
    });

    it('throws when ready is false', () => {
      mockWindow.__windrose = { obsidian: null, version: '1.0', ready: false };
      expect(() => getObsidianModule()).toThrow(
        '[Windrose] Obsidian bridge not available'
      );
    });

    it('returns the obsidian module when bridge is ready', () => {
      const fakeModule = { Modal: class {}, Plugin: class {} };
      mockWindow.__windrose = { obsidian: fakeModule, version: '1.0', ready: true };
      expect(getObsidianModule()).toBe(fakeModule);
    });

    it('returns fresh reference on each call (no caching)', () => {
      const module1 = { Modal: class {} };
      mockWindow.__windrose = { obsidian: module1, version: '1.0', ready: true };
      const result1 = getObsidianModule();

      const module2 = { Modal: class {}, Extra: class {} };
      (mockWindow.__windrose as { obsidian: unknown }).obsidian = module2;
      const result2 = getObsidianModule();

      expect(result1).toBe(module1);
      expect(result2).toBe(module2);
    });
  });

  describe('waitForBridge', () => {
    it('resolves immediately when bridge is already ready', async () => {
      mockWindow.__windrose = { obsidian: { Modal: class {} }, version: '1.0', ready: true };
      await expect(waitForBridge()).resolves.toBeUndefined();
    });

    it('resolves when bridge-ready event fires', async () => {
      const promise = waitForBridge(5000);

      // Simulate bridge becoming ready
      mockWindow.__windrose = { obsidian: { Modal: class {} }, version: '1.0', ready: true };
      mockWindow.dispatchEvent(new Event('windrose:bridge-ready'));

      await expect(promise).resolves.toBeUndefined();
    });

    it('rejects after timeout when bridge never becomes ready', async () => {
      vi.useFakeTimers();

      const promise = waitForBridge(1000);

      vi.advanceTimersByTime(1000);

      await expect(promise).rejects.toThrow(
        '[Windrose] Bridge did not initialize within 1000ms'
      );
    });

    it('cleans up event listener on timeout', async () => {
      vi.useFakeTimers();

      const promise = waitForBridge(500);
      vi.advanceTimersByTime(500);

      try { await promise; } catch { /* expected */ }

      expect(mockWindow.removeEventListener).toHaveBeenCalledWith(
        'windrose:bridge-ready',
        expect.any(Function)
      );
    });

    it('clears timeout when event fires before timeout', async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

      const promise = waitForBridge(5000);

      mockWindow.__windrose = { obsidian: {}, version: '1.0', ready: true };
      mockWindow.dispatchEvent(new Event('windrose:bridge-ready'));

      await promise;

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });

    it('uses default timeout of 5000ms', async () => {
      vi.useFakeTimers();

      const promise = waitForBridge();

      // Should not reject at 4999ms
      vi.advanceTimersByTime(4999);

      // Should reject at 5000ms
      vi.advanceTimersByTime(1);

      await expect(promise).rejects.toThrow('5000ms');
    });
  });
});

// @vitest-environment happy-dom
/**
 * useOverlayCanvas (DUP-04, STRUCT-A-20): one guarded overlay per layer,
 * sized 1:1 to the main canvas backing store (no DPR transform of its own),
 * re-synced when the main canvas resizes, removed on demand and on unmount.
 */

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';

import { useOverlayCanvas } from '../../../../src/hooks/canvas/useOverlayCanvas';
import type { OverlayCanvas, OverlayCanvasOptions } from '../../../../src/hooks/canvas/useOverlayCanvas';

// Obsidian augments Node with `win` and Window with `createEl`; happy-dom has
// neither. The hook resolves the overlay's window from the main canvas.
beforeAll(() => {
  if (!('win' in Node.prototype)) {
    Object.defineProperty(Node.prototype, 'win', {
      configurable: true,
      get(this: Node) { return this.ownerDocument?.defaultView ?? window; },
    });
  }
  const w = window as unknown as { createEl?: (tag: string) => HTMLElement };
  w.createEl ??= (tag: string) => window.document.createElement(tag);
});

let root: HTMLElement | null = null;
let container: HTMLElement | null = null;

afterEach(() => {
  if (root) { render(null, root); root.remove(); root = null; }
  container?.remove();
  container = null;
});

function setup(width = 400, height = 300): { main: HTMLCanvasElement; ref: { current: HTMLCanvasElement | null } } {
  container = document.createElement('div');
  const main = document.createElement('canvas');
  main.width = width;
  main.height = height;
  container.appendChild(main);
  document.body.appendChild(container);
  return { main, ref: { current: main } };
}

function mount(ref: { current: HTMLCanvasElement | null }, options: OverlayCanvasOptions = {}): { api: () => OverlayCanvas; rerender: (o: OverlayCanvasOptions) => void } {
  let latest: OverlayCanvas | null = null;
  const Probe = (props: { opts: OverlayCanvasOptions }): null => {
    latest = useOverlayCanvas(ref, props.opts);
    return null;
  };
  root = document.createElement('div');
  document.body.appendChild(root);
  const r = root;
  act(() => { render(h(Probe, { opts: options }), r); });
  return {
    api: () => { if (latest == null) throw new Error('not mounted'); return latest; },
    rerender: (o) => { act(() => { render(h(Probe, { opts: o }), r); }); },
  };
}

const overlays = (): NodeListOf<Element> => document.querySelectorAll('canvas.windrose-overlay-layer');
const flushObservers = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

describe('useOverlayCanvas', () => {
  it('ensure() creates one overlay sized to the main canvas, as a sibling, and is guarded', () => {
    const { main, ref } = setup(400, 300);
    const { api } = mount(ref);
    expect(overlays()).toHaveLength(0);

    const first = api().ensure();
    const second = api().ensure();
    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(overlays()).toHaveLength(1);
    expect(first?.parentElement).toBe(main.parentElement);
    expect(first?.width).toBe(400);
    expect(first?.height).toBe(300);
  });

  it('mirrors the main backing size 1:1 regardless of devicePixelRatio', () => {
    const dpr = vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(2);
    const { ref } = setup(640, 480);
    const { api } = mount(ref);
    const overlay = api().ensure();
    expect(overlay?.width).toBe(640);
    expect(overlay?.height).toBe(480);
    dpr.mockRestore();
  });

  it('follows a main canvas resize and calls onResize', async () => {
    const { main, ref } = setup(400, 300);
    const onResize = vi.fn();
    const { api } = mount(ref, { onResize });
    const overlay = api().ensure();

    main.width = 800;
    main.height = 500;
    await flushObservers();

    expect(overlay?.width).toBe(800);
    expect(overlay?.height).toBe(500);
    expect(onResize).toHaveBeenCalledTimes(1);
  });

  it('sized() syncs on demand and only writes when the size differs', () => {
    const { main, ref } = setup(400, 300);
    const { api } = mount(ref);
    expect(api().sized()).toBeNull();
    const overlay = api().ensure();
    if (overlay == null) throw new Error('no overlay');

    const setWidth = vi.spyOn(overlay, 'width', 'set');
    api().sized();
    expect(setWidth).not.toHaveBeenCalled();

    main.width = 700;
    expect(api().sized()?.width).toBe(700);
    expect(setWidth).toHaveBeenCalledTimes(1);
  });

  it('remove() detaches the overlay and stops resize tracking', async () => {
    const { main, ref } = setup();
    const onResize = vi.fn();
    const { api } = mount(ref, { onResize });
    api().ensure();
    api().remove();
    expect(overlays()).toHaveLength(0);
    expect(api().overlayRef.current).toBeNull();

    main.width = 900;
    await flushObservers();
    expect(onResize).not.toHaveBeenCalled();
  });

  it('active toggles presence declaratively', () => {
    const { ref } = setup();
    const { rerender } = mount(ref, { active: true });
    expect(overlays()).toHaveLength(1);
    rerender({ active: false });
    expect(overlays()).toHaveLength(0);
    rerender({ active: true });
    expect(overlays()).toHaveLength(1);
  });

  it('disposes the overlay on unmount', () => {
    const { ref } = setup();
    const { api } = mount(ref);
    api().ensure();
    expect(overlays()).toHaveLength(1);
    act(() => { if (root) render(null, root); });
    expect(overlays()).toHaveLength(0);
  });

  it('returns null when the main canvas is not mounted', () => {
    const { api } = mount({ current: null });
    expect(api().ensure()).toBeNull();
    expect(overlays()).toHaveLength(0);
  });
});

/**
 * Tileset probe sharing: one probe per key per settings generation, shared by
 * every mounted map; a settings change, a bundle registry change or a
 * rejection starts over.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const bus = new EventTarget();
vi.stubGlobal('window', bus);

const { invalidateSharedProbes, shareProbe } = await import('../../../src/assets/tileArtAnalysis');
const { makeFakeVault } = await import('./bundles/fakeVault');

beforeEach(() => {
  invalidateSharedProbes();
});

describe('shareProbe', () => {
  it('runs a probe once per key, in flight and after it settled', async () => {
    const run = vi.fn(async () => ({ width: 64 }));
    const a = shareProbe('k', run);
    const b = shareProbe('k', run);
    expect(b).toBe(a);
    await a;
    expect(await shareProbe('k', run)).toEqual({ width: 64 });
    expect(run).toHaveBeenCalledTimes(1);
    await shareProbe('other', run);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('probes again after windrose-settings-changed', async () => {
    const run = vi.fn(async () => 1);
    await shareProbe('k', run);
    bus.dispatchEvent(new Event('windrose-settings-changed'));
    await shareProbe('k', run);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('probes again after a bundle registry change', async () => {
    // Fresh modules: the registry listener is wired on first use, and other
    // suites reset the registry's listener set.
    vi.resetModules();
    const fresh = await import('../../../src/assets/tileArtAnalysis');
    const registry = await import('../../../src/assets/bundles/bundleRegistry');
    const run = vi.fn(async () => 1);
    await fresh.shareProbe('k', run);
    await fresh.shareProbe('k', run);
    expect(run).toHaveBeenCalledTimes(1);
    const fv = makeFakeVault();
    fv.folders.add('packs');
    await registry.mountBundleFolder(fv.app, 'packs');
    await fresh.shareProbe('k', run);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('does not keep a rejected probe', async () => {
    const run = vi.fn()
      .mockImplementationOnce(async () => { throw new Error('decode failed'); })
      .mockImplementationOnce(async () => 2);
    await expect(shareProbe('k', run)).rejects.toThrow('decode failed');
    expect(await shareProbe('k', run)).toBe(2);
    expect(run).toHaveBeenCalledTimes(2);
  });
});

// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../src/assets/imageOperations', () => ({
  getImageCacheStats: () => ({ size: 3, pinned: 1, maxSize: 200 }),
}));
vi.mock('../../../src/assets/thumbnailCache', () => ({
  getThumbnailCacheStats: () => ({ cached: 5, queued: 2, inFlightDecodes: 1 }),
}));
vi.mock('../../../src/assets/bundles/bundleRegistry', () => ({
  getBundleRegistryStats: () => ({ mountedFolders: 1, shardCacheCount: 2, shardCacheBytes: 4096, shardReads: 7, shardReadBytes: 9999 }),
}));

import { recordPerfTelemetry } from '../../../src/utils/perfTelemetry';

interface FakeAdapter {
  read: (p: string) => Promise<string>;
  readBinary: (p: string) => Promise<ArrayBuffer>;
  write: ReturnType<typeof vi.fn>;
}

function makeApp(write: ReturnType<typeof vi.fn>): { app: never; adapter: FakeAdapter } {
  const adapter: FakeAdapter = {
    read: vi.fn(() => Promise.resolve('')),
    readBinary: vi.fn(() => Promise.resolve(new ArrayBuffer(10))),
    write,
  };
  return { app: { vault: { adapter } } as never, adapter };
}

function lastJson(write: ReturnType<typeof vi.fn>, idx: number): Record<string, unknown> {
  return JSON.parse((write.mock.calls[idx] as unknown as [string, string])[1]) as Record<string, unknown>;
}

describe('recordPerfTelemetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as unknown as { activeDocument: Document }).activeDocument = document;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('flushes partial reports every 5s and a final non-partial report', async () => {
    const write = vi.fn(() => Promise.resolve());
    const { app } = makeApp(write);
    const p = recordPerfTelemetry(app, 12000);
    await vi.advanceTimersByTimeAsync(12000);
    await p;

    const parsed = write.mock.calls.map((_, i) => lastJson(write, i));
    const partials = parsed.filter(r => r.partial === true);
    expect(partials.length).toBeGreaterThanOrEqual(2);
    expect(typeof partials[0].secondsRecorded).toBe('number');
    expect(parsed[parsed.length - 1].partial).toBe(false);
    expect(parsed.filter(r => r.partial === false)).toHaveLength(1);
    // Every write targets the same file name chosen at start.
    const names = new Set(write.mock.calls.map(c => (c as unknown as [string, string])[0]));
    expect(names.size).toBe(1);
    const final = parsed[parsed.length - 1];
    expect(final.peaks).toMatchObject({ imageCacheSize: 3, thumbsCached: 5, shardCacheBytes: 4096 });
    expect(final.readSizeBuckets).toBeDefined();
  });

  it('swallows a throwing flush and still writes the final report', async () => {
    let calls = 0;
    const write = vi.fn(() => {
      calls++;
      return calls === 1 ? Promise.reject(new Error('disk full')) : Promise.resolve();
    });
    const { app } = makeApp(write);
    const p = recordPerfTelemetry(app, 11000);
    await vi.advanceTimersByTimeAsync(11000);
    await p;
    const last = lastJson(write, write.mock.calls.length - 1);
    expect(last.partial).toBe(false);
  });

  it('restores wrapped globals after completion', async () => {
    const write = vi.fn(() => Promise.resolve());
    const { app, adapter } = makeApp(write);
    const before = {
      parse: JSON.parse, stringify: JSON.stringify,
      create: URL.createObjectURL, revoke: URL.revokeObjectURL,
      read: adapter.read, readBinary: adapter.readBinary,
    };
    const p = recordPerfTelemetry(app, 2000);
    await vi.advanceTimersByTimeAsync(2000);
    await p;
    expect(JSON.parse).toBe(before.parse);
    expect(JSON.stringify).toBe(before.stringify);
    expect(URL.createObjectURL).toBe(before.create);
    expect(URL.revokeObjectURL).toBe(before.revoke);
    expect(adapter.read).toBe(before.read);
    expect(adapter.readBinary).toBe(before.readBinary);
  });

  it('restores wrapped globals and swallows an exception when the final write fails', async () => {
    const write = vi.fn(() => Promise.reject(new Error('boom')));
    const { app } = makeApp(write);
    const before = { parse: JSON.parse, create: URL.createObjectURL };
    const p = recordPerfTelemetry(app, 2000);
    await vi.advanceTimersByTimeAsync(2000);
    await expect(p).resolves.toBeUndefined();
    expect(JSON.parse).toBe(before.parse);
    expect(URL.createObjectURL).toBe(before.create);
    // A new recording may start afterwards (the `recording` latch was released).
    const p2 = recordPerfTelemetry(app, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await p2;
    expect(write.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('records a main-thread stall with the last wrapped activity', async () => {
    const write = vi.fn(() => Promise.resolve());
    const { app } = makeApp(write);
    const realNow = performance.now.bind(performance);
    let extra = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => realNow() + extra);

    const p = recordPerfTelemetry(app, 3000);
    await vi.advanceTimersByTimeAsync(1100);
    JSON.parse('{}');
    extra = 400; // the next 50 ms tick observes a 400 ms jump
    await vi.advanceTimersByTimeAsync(50);
    extra = 400;
    await vi.advanceTimersByTimeAsync(2000);
    await p;

    const final = lastJson(write, write.mock.calls.length - 1);
    const peaks = final.peaks as Record<string, unknown>;
    expect(peaks.maxStallMs as number).toBeGreaterThanOrEqual(350);
    expect(peaks.maxStallLastActivity).toBe('JSON.parse');
    expect(peaks.maxStallAtSecond).toBe(1);
  });

  it('tracks live blob URLs and bitmap concurrency', async () => {
    const write = vi.fn(() => Promise.resolve());
    const { app } = makeApp(write);
    const origCreate = URL.createObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:x');
    const origRevoke = URL.revokeObjectURL;
    URL.revokeObjectURL = vi.fn();
    const bmp = { width: 100, height: 50 } as ImageBitmap;
    const origCib = window.createImageBitmap;
    window.createImageBitmap = vi.fn(() => Promise.resolve(bmp));
    try {
      const p = recordPerfTelemetry(app, 2500);
      await vi.advanceTimersByTimeAsync(100);
      URL.createObjectURL(new Blob(['abcd']));
      const a = window.createImageBitmap(new Blob([]));
      const b = window.createImageBitmap(new Blob([]));
      await Promise.all([a, b]);
      await vi.advanceTimersByTimeAsync(1100);
      URL.revokeObjectURL('blob:x');
      await vi.advanceTimersByTimeAsync(2000);
      await p;
      const final = lastJson(write, write.mock.calls.length - 1);
      const peaks = final.peaks as Record<string, number>;
      expect(peaks.blobUrlsLive).toBe(1);
      expect(peaks.blobBytesLive).toBe(4);
      expect(peaks.bitmapsPeakInFlight).toBe(2);
      expect(peaks.maxDecodedPixels).toBe(5000);
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
      window.createImageBitmap = origCib;
    }
  });
});

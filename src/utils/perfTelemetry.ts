/**
 * perfTelemetry.ts
 *
 * On-device performance recorder for diagnosing lag on devices without
 * attachable dev tools (iPad). Triggered via command palette; records for a
 * fixed window while the user reproduces the problem, then writes a JSON
 * report to the vault root so it syncs back to a machine that can read it.
 *
 * The report file is overwritten every 5 s with a partial report
 * (`partial: true`) so a crash mid-recording (e.g. an iPad memory kill) still
 * leaves evidence; normal completion writes the final report (`partial: false`).
 *
 * Everything is wrapped in try/catch and restored in finally — the recorder
 * must never be able to break the app it is measuring.
 */

import type { App } from 'obsidian';
import { Notice, Platform } from 'obsidian';
import { options } from 'preact';
import { getImageCacheStats } from '../assets/imageOperations';
import { getThumbnailCacheStats } from '../assets/thumbnailCache';
import { getBundleRegistryStats } from '../assets/bundles/bundleRegistry';

/** Instantaneous / cumulative state captured at the end of each second. */
interface SecondSnapshot {
  /** Chromium only; null on WebKit. */
  heapMB: number | null;
  imageCache: ReturnType<typeof getImageCacheStats> | null;
  thumbs: ReturnType<typeof getThumbnailCacheStats> | null;
  bundles: ReturnType<typeof getBundleRegistryStats> | null;
  blobUrls: { created: number; revoked: number; live: number; liveBytes: number };
  bitmaps: { inFlight: number; peakInFlight: number; maxPixels: number };
  /** Worst main-thread stall (ms past the detector tick) seen this second. */
  stallMaxMs: number;
}

interface SecondSample {
  t: number;
  rafFrames: number;
  fillRect: number;
  drawImage: number;
  getImageData: number;
  clearRect: number;
  createPattern: number;
  toDataURL: number;
  imgSrcSets: number;
  imageBitmaps: number;
  vaultReads: number;
  vaultWrites: number;
  bytesRead: number;
  bytesWritten: number;
  jsonParses: number;
  jsonParseChars: number;
  jsonStringifies: number;
  jsonStringifyChars: number;
  longTasks: number;
  longTaskMs: number;
  pointerEvents: number;
  /** Preact VDOM diff: root passes and total main-thread ms spent diffing. */
  preactDiffs: number;
  preactDiffMs: number;
  /** Sum of width*height of ImageBitmaps resolved this second. */
  decodedPixels: number;
  snap: SecondSnapshot;
}

interface FrameGap {
  t: number;
  gapMs: number;
  sinceInteractionMs: number;
}

const FLUSH_INTERVAL_MS = 5000;
const STALL_TICK_MS = 50;

let recording = false;

async function recordPerfTelemetry(app: App, durationMs = 60000): Promise<void> {
  if (recording) {
    new Notice('Windrose: telemetry already recording');
    return;
  }
  recording = true;

  const platformName = Platform.isMobile ? (Platform.isTablet ? 'tablet' : 'phone') : 'desktop';
  const stampStart = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fname = `WINDROSE-PERF-${platformName}-${stampStart}.json`;
  new Notice(`Windrose: recording performance for ${Math.round(durationMs / 1000)}s, writing ${fname} every 5s. Use the map normally`, 8000);

  // Captured BEFORE any wrapping so flushes are not counted as measured work.
  const rawStringify = JSON.stringify.bind(JSON);
  const adapter = app.vault.adapter;
  const origAdapterWrite: typeof adapter.write = Reflect.get(adapter, 'write');
  const rawWrite = (p: string, d: string): Promise<void> => origAdapterWrite.call(adapter, p, d);

  const t0 = performance.now();
  const now = (): number => Math.round(performance.now() - t0);

  // ---- live counters (reset each second into the time series) ----
  const c = {
    rafFrames: 0, fillRect: 0, drawImage: 0, getImageData: 0, clearRect: 0,
    createPattern: 0, toDataURL: 0, imgSrcSets: 0, imageBitmaps: 0,
    vaultReads: 0, vaultWrites: 0, bytesRead: 0, bytesWritten: 0,
    jsonParses: 0, jsonParseChars: 0, jsonStringifies: 0, jsonStringifyChars: 0,
    longTasks: 0, longTaskMs: 0, pointerEvents: 0,
    preactDiffs: 0, preactDiffMs: 0, decodedPixels: 0,
  };
  const series: SecondSample[] = [];
  const frameGaps: FrameGap[] = [];
  const slowIO: Array<{ t: number; op: string; path: string; ms: number; kb: number }> = [];
  const ioPathCounts: Record<string, number> = {};
  const worstLongTasks: Array<{ t: number; ms: number }> = [];
  let lastInteraction = -1;

  // ---- memory-relevant counters ----
  /** Name of the most recently entered wrapped function (stall attribution). */
  let lastActivity = 'none';
  const blobSizes = new Map<string, number>();
  const blobs = { created: 0, revoked: 0, liveBytes: 0 };
  const bitmaps = { inFlight: 0, peakInFlight: 0, maxPixels: 0 };
  const readBuckets = { lt64KiB: 0, lt1MiB: 0, gte1MiB: 0 };
  const stall = { maxMs: 0, atSecond: -1, lastActivity: 'none', secMax: 0 };
  const peaks = {
    heapMB: null as number | null,
    imageCacheSize: 0, thumbsCached: 0, thumbsQueued: 0, thumbsInFlightDecodes: 0,
    shardCacheBytes: 0, blobUrlsLive: 0, blobBytesLive: 0, bitmapsInFlight: 0,
  };
  const heapMB = (): number | null => {
    const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return m ? Math.round(m.usedJSHeapSize / 1048576) : null;
  };

  const restorers: Array<() => void> = [];
  const safeWrap = (label: string, fn: () => (() => void) | null): void => {
    try {
      const r = fn();
      if (r) restorers.push(r);
    } catch (e) {
      console.warn(`[Windrose perf] could not instrument ${label}:`, e);
    }
  };

  // ---- canvas ops ----
  safeWrap('canvas2d', () => {
    const P = CanvasRenderingContext2D.prototype;
    /* eslint-disable @typescript-eslint/unbound-method -- captured to rebind via .apply(this); call-site `this` is preserved */
    const orig = {
      fillRect: P.fillRect, drawImage: P.drawImage, getImageData: P.getImageData,
      clearRect: P.clearRect, createPattern: P.createPattern,
    };
    /* eslint-enable @typescript-eslint/unbound-method -- end of captured-method block */
    P.fillRect = function (this: CanvasRenderingContext2D, ...a) { c.fillRect++; return orig.fillRect.apply(this, a); };
    P.drawImage = function (this: CanvasRenderingContext2D, ...a) { c.drawImage++; return orig.drawImage.apply(this, a as Parameters<typeof orig.drawImage>); } as typeof P.drawImage;
    P.getImageData = function (this: CanvasRenderingContext2D, ...a) { lastActivity = 'getImageData'; c.getImageData++; return orig.getImageData.apply(this, a); };
    P.clearRect = function (this: CanvasRenderingContext2D, ...a) { c.clearRect++; return orig.clearRect.apply(this, a); };
    P.createPattern = function (this: CanvasRenderingContext2D, ...a) { c.createPattern++; return orig.createPattern.apply(this, a); };
    return () => { Object.assign(P, orig); };
  });

  safeWrap('toDataURL', () => {
    const CP = HTMLCanvasElement.prototype;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- captured to rebind via .apply(this); call-site `this` is preserved
    const orig = CP.toDataURL;
    CP.toDataURL = function (this: HTMLCanvasElement, ...a) { lastActivity = 'toDataURL'; c.toDataURL++; return orig.apply(this, a); };
    return () => { CP.toDataURL = orig; };
  });

  // ---- image loading ----
  safeWrap('img.src', () => {
    const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    if (!desc?.set || !desc.get) return null;
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      set(val: string) { c.imgSrcSets++; desc.set?.call(this, val); },
      get() { return desc.get?.call(this) as string; },
      configurable: true,
    });
    return () => { Object.defineProperty(HTMLImageElement.prototype, 'src', desc); };
  });

  safeWrap('createImageBitmap', () => {
    const orig = window.createImageBitmap?.bind(window);
    if (orig == null) return null;
    const originalProp: typeof window.createImageBitmap = Reflect.get(window, 'createImageBitmap');
    window.createImageBitmap = ((...a: Parameters<typeof createImageBitmap>) => {
      lastActivity = 'createImageBitmap';
      c.imageBitmaps++;
      bitmaps.inFlight++;
      if (bitmaps.inFlight > bitmaps.peakInFlight) bitmaps.peakInFlight = bitmaps.inFlight;
      let p: Promise<ImageBitmap>;
      try {
        p = orig(...a);
      } catch (e) {
        bitmaps.inFlight--;
        throw e;
      }
      return p.then(
        (bmp) => {
          bitmaps.inFlight--;
          const px = (bmp?.width ?? 0) * (bmp?.height ?? 0);
          c.decodedPixels += px;
          if (px > bitmaps.maxPixels) bitmaps.maxPixels = px;
          return bmp;
        },
        (e: unknown) => { bitmaps.inFlight--; throw e; },
      );
    }) as typeof createImageBitmap;
    return () => { window.createImageBitmap = originalProp; };
  });

  // ---- blob URLs: each live URL pins its blob in memory until revoked ----
  safeWrap('blob URLs', () => {
    const oCreate: typeof URL.createObjectURL = Reflect.get(URL, 'createObjectURL');
    const oRevoke: typeof URL.revokeObjectURL = Reflect.get(URL, 'revokeObjectURL');
    URL.createObjectURL = (obj: Blob | MediaSource): string => {
      lastActivity = 'createObjectURL';
      const url = oCreate.call(URL, obj);
      const size = (obj as Blob).size ?? 0;
      blobs.created++;
      blobSizes.set(url, size);
      blobs.liveBytes += size;
      return url;
    };
    URL.revokeObjectURL = (url: string): void => {
      lastActivity = 'revokeObjectURL';
      blobs.revoked++;
      const size = blobSizes.get(url);
      if (size != null) { blobs.liveBytes -= size; blobSizes.delete(url); }
      oRevoke.call(URL, url);
    };
    return () => { URL.createObjectURL = oCreate; URL.revokeObjectURL = oRevoke; };
  });

  // ---- vault I/O ----
  safeWrap('vault adapter', () => {
    const ad = app.vault.adapter;
    const origRead: typeof ad.read = Reflect.get(ad, 'read');
    const origWrite: typeof ad.write = Reflect.get(ad, 'write');
    const origReadBin: typeof ad.readBinary = Reflect.get(ad, 'readBinary');
    const oRead = origRead.bind(ad);
    const oWrite = origWrite.bind(ad);
    const oReadBin = origReadBin.bind(ad);
    const trackPath = (p: string): void => {
      const key = p.split('/').pop() ?? p;
      ioPathCounts[key] = (ioPathCounts[key] ?? 0) + 1;
    };
    ad.read = async (p: string) => {
      lastActivity = 'read';
      const s = performance.now(); const res = await oRead(p);
      const ms = performance.now() - s;
      c.vaultReads++; c.bytesRead += res?.length ?? 0; trackPath(p);
      if (ms > 50) slowIO.push({ t: now(), op: 'read', path: p.split('/').pop() ?? p, ms: Math.round(ms), kb: Math.round((res?.length ?? 0) / 1024) });
      return res;
    };
    ad.readBinary = async (p: string) => {
      lastActivity = 'readBinary';
      const s = performance.now(); const res = await oReadBin(p);
      const ms = performance.now() - s;
      const sz = res?.byteLength ?? 0;
      if (sz < 65536) readBuckets.lt64KiB++;
      else if (sz < 1048576) readBuckets.lt1MiB++;
      else readBuckets.gte1MiB++;
      c.vaultReads++; c.bytesRead += sz; trackPath(p);
      if (ms > 50) slowIO.push({ t: now(), op: 'readBin', path: p.split('/').pop() ?? p, ms: Math.round(ms), kb: Math.round(sz / 1024) });
      return res;
    };
    ad.write = async (p: string, data: string, ...rest: unknown[]) => {
      lastActivity = 'write';
      const s = performance.now();
      const res = await (oWrite as (...a: unknown[]) => Promise<void>)(p, data, ...rest);
      const ms = performance.now() - s;
      c.vaultWrites++; c.bytesWritten += data?.length ?? 0; trackPath(p);
      if (ms > 50) slowIO.push({ t: now(), op: 'write', path: p.split('/').pop() ?? p, ms: Math.round(ms), kb: Math.round((data?.length ?? 0) / 1024) });
      return res;
    };
    return () => { ad.read = origRead; ad.write = origWrite; ad.readBinary = origReadBin; };
  });

  // ---- JSON churn (whole-file saves/parses are a known cost center) ----
  safeWrap('JSON', () => {
    const origParse = JSON.parse; const origStr = JSON.stringify;
    const oParse = origParse.bind(JSON);
    const oStr = origStr.bind(JSON);
    JSON.parse = ((text: string, ...rest: unknown[]) => {
      lastActivity = 'JSON.parse';
      c.jsonParses++; c.jsonParseChars += typeof text === 'string' ? text.length : 0;
      return (oParse as (...a: unknown[]) => unknown)(text, ...rest);
    }) as typeof JSON.parse;
    JSON.stringify = ((...a: unknown[]) => {
      lastActivity = 'JSON.stringify';
      const res = (oStr as (...a: unknown[]) => string)(...a);
      c.jsonStringifies++; c.jsonStringifyChars += res?.length ?? 0;
      return res;
    }) as typeof JSON.stringify;
    return () => { JSON.parse = origParse; JSON.stringify = origStr; };
  });

  // ---- Preact VDOM diff time: measures component re-render cost directly.
  // options.__b (mangled _diff) fires before each vnode diff, options.diffed
  // after — depth-tracking the pair times each root diff pass. ----
  safeWrap('preact diff timing', () => {
    const o = options as unknown as Record<string, ((vnode: unknown) => void) | undefined>;
    const prevDiff = o.__b;
    const prevDiffed = o.diffed;
    let depth = 0;
    let start = 0;
    o.__b = (vnode: unknown) => {
      if (depth === 0) start = performance.now();
      depth++;
      prevDiff?.(vnode);
    };
    o.diffed = (vnode: unknown) => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) {
        c.preactDiffMs += performance.now() - start;
        c.preactDiffs++;
      }
      prevDiffed?.(vnode);
    };
    return () => { o.__b = prevDiff; o.diffed = prevDiffed; };
  });

  // ---- long tasks (Chromium only; absent on iOS WebKit — recorded as unsupported) ----
  let longTaskSupported = false;
  safeWrap('longtask observer', () => {
    const po = new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        c.longTasks++; c.longTaskMs += e.duration;
        worstLongTasks.push({ t: now(), ms: Math.round(e.duration) });
      }
    });
    po.observe({ entryTypes: ['longtask'] });
    longTaskSupported = true;
    return () => { po.disconnect(); };
  });

  // ---- interaction markers ----
  safeWrap('interaction listeners', () => {
    const mark = (): void => { lastInteraction = now(); c.pointerEvents++; };
    const evs = ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'wheel'] as const;
    for (const ev of evs) window.addEventListener(ev, mark, { capture: true, passive: true });
    return () => { for (const ev of evs) window.removeEventListener(ev, mark, { capture: true }); };
  });

  // ---- rAF heartbeat: frame-gap distribution is the ground truth for jank ----
  let rafId = 0;
  let lastFrame = performance.now();
  const gapBuckets = { under17: 0, to33: 0, to100: 0, to250: 0, to1000: 0, over1000: 0 };
  let worstGap = 0;
  const heartbeat = (): void => {
    const t = performance.now();
    const gap = t - lastFrame;
    lastFrame = t;
    c.rafFrames++;
    if (gap < 17) gapBuckets.under17++;
    else if (gap < 33) gapBuckets.to33++;
    else if (gap < 100) gapBuckets.to100++;
    else if (gap < 250) gapBuckets.to250++;
    else if (gap < 1000) gapBuckets.to1000++;
    else gapBuckets.over1000++;
    if (gap > worstGap) worstGap = gap;
    if (gap > 100) {
      frameGaps.push({ t: now(), gapMs: Math.round(gap), sinceInteractionMs: lastInteraction < 0 ? -1 : now() - lastInteraction });
    }
    rafId = window.requestAnimationFrame(heartbeat);
  };
  rafId = window.requestAnimationFrame(heartbeat);
  restorers.push(() => cancelAnimationFrame(rafId));

  // ---- per-second sampler ----
  const guard = <T,>(fn: () => T): T | null => {
    try { return fn(); } catch { return null; }
  };
  const takeSnapshot = (): SecondSnapshot => {
    const imageCache = guard(getImageCacheStats);
    const thumbs = guard(getThumbnailCacheStats);
    const bundles = guard(getBundleRegistryStats);
    const heap = heapMB();
    if (heap != null && (peaks.heapMB == null || heap > peaks.heapMB)) peaks.heapMB = heap;
    if (imageCache) peaks.imageCacheSize = Math.max(peaks.imageCacheSize, imageCache.size);
    if (thumbs) {
      peaks.thumbsCached = Math.max(peaks.thumbsCached, thumbs.cached);
      peaks.thumbsQueued = Math.max(peaks.thumbsQueued, thumbs.queued);
      peaks.thumbsInFlightDecodes = Math.max(peaks.thumbsInFlightDecodes, thumbs.inFlightDecodes);
    }
    if (bundles) peaks.shardCacheBytes = Math.max(peaks.shardCacheBytes, bundles.shardCacheBytes);
    peaks.blobUrlsLive = Math.max(peaks.blobUrlsLive, blobSizes.size);
    peaks.blobBytesLive = Math.max(peaks.blobBytesLive, blobs.liveBytes);
    peaks.bitmapsInFlight = Math.max(peaks.bitmapsInFlight, bitmaps.inFlight);
    return {
      heapMB: heap, imageCache, thumbs, bundles,
      blobUrls: { created: blobs.created, revoked: blobs.revoked, live: blobSizes.size, liveBytes: blobs.liveBytes },
      bitmaps: { ...bitmaps },
      stallMaxMs: Math.round(stall.secMax),
    };
  };
  const sampler = window.setInterval(() => {
    series.push({ t: now(), ...c, snap: takeSnapshot() });
    for (const k of Object.keys(c) as Array<keyof typeof c>) c[k] = 0;
    stall.secMax = 0;
  }, 1000);
  restorers.push(() => window.clearInterval(sampler));

  // ---- main-thread stall detector: timer drift past the tick means a blocked thread ----
  let lastTick = performance.now();
  const stallTimer = window.setInterval(() => {
    const t = performance.now();
    const drift = t - lastTick - STALL_TICK_MS;
    lastTick = t;
    if (drift > stall.secMax) stall.secMax = drift;
    if (drift > stall.maxMs) {
      stall.maxMs = drift;
      stall.atSecond = Math.floor(now() / 1000);
      stall.lastActivity = lastActivity;
    }
  }, STALL_TICK_MS);
  restorers.push(() => window.clearInterval(stallTimer));

  // ---- environment snapshot ----
  const canvases = Array.from(activeDocument.querySelectorAll('canvas')).map(cv => ({
    w: cv.width, h: cv.height, mp: +((cv.width * cv.height) / 1e6).toFixed(2),
    cls: cv.className.toString().slice(0, 40),
  }));
  const env = {
    when: new Date().toISOString(),
    platform: platformName,
    dpr: window.devicePixelRatio,
    screen: { w: window.screen.width, h: window.screen.height },
    canvases,
    requestIdleCallbackSupported: typeof window.requestIdleCallback === 'function',
    longTaskSupported,
    heapMBStart: heapMB(),
  };

  // ---- report builder: same shape for partial flushes and the final write ----
  const buildReport = (partial: boolean): string => {
    const topIO = Object.entries(ioPathCounts).sort((a, b) => b[1] - a[1]).slice(0, 12)
      .map(([p, n]) => ({ path: p, count: n }));
    return rawStringify({
      partial,
      secondsRecorded: series.length,
      env,
      durationMs,
      heapMBEnd: heapMB(),
      frameGapBuckets: gapBuckets,
      worstFrameGapMs: Math.round(worstGap),
      bigFrameGaps: frameGaps.slice(0, 80),
      worstLongTasks: [...worstLongTasks].sort((a, b) => b.ms - a.ms).slice(0, 20),
      slowIO: slowIO.slice(0, 40),
      topIOPaths: topIO,
      readSizeBuckets: { ...readBuckets },
      peaks: {
        ...peaks,
        bitmapsPeakInFlight: bitmaps.peakInFlight,
        maxDecodedPixels: bitmaps.maxPixels,
        maxStallMs: Math.round(stall.maxMs),
        maxStallAtSecond: stall.atSecond,
        maxStallLastActivity: stall.lastActivity,
      },
      perSecond: series,
    }, null, 1);
  };

  // ---- incremental flush: a crash (e.g. an iPad memory kill) leaves evidence ----
  let flushing = false;
  const flush = (): void => {
    if (flushing) return;
    flushing = true;
    try {
      rawWrite(fname, buildReport(true))
        .catch(() => { /* flush is best-effort */ })
        .finally(() => { flushing = false; });
    } catch {
      flushing = false;
    }
  };
  const flushTimer = window.setInterval(flush, FLUSH_INTERVAL_MS);
  restorers.push(() => window.clearInterval(flushTimer));

  // ---- run the window, then restore EVERYTHING and write the final report ----
  try {
    await new Promise<void>(resolve => { window.setTimeout(resolve, durationMs); });
  } finally {
    for (const r of restorers) {
      try { r(); } catch { /* must not throw during restore */ }
    }
    recording = false;
  }

  try {
    await app.vault.adapter.write(fname, buildReport(false));
    new Notice(`Windrose: telemetry saved to ${fname}`, 8000);
  } catch (e) {
    console.warn('[Windrose perf] could not write final report:', e);
    new Notice(`Windrose: could not save ${fname}; a partial report may exist`, 8000);
  }
}

export { recordPerfTelemetry };

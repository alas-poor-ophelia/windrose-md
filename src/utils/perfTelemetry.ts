/**
 * perfTelemetry.ts
 *
 * On-device performance recorder for diagnosing lag on devices without
 * attachable dev tools (iPad). Triggered via command palette; records for a
 * fixed window while the user reproduces the problem, then writes a JSON
 * report to the vault root so it syncs back to a machine that can read it.
 *
 * Everything is wrapped in try/catch and restored in finally — the recorder
 * must never be able to break the app it is measuring.
 */

import type { App } from 'obsidian';
import { Notice, Platform } from 'obsidian';
import { options } from 'preact';

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
}

interface FrameGap {
  t: number;
  gapMs: number;
  sinceInteractionMs: number;
}

let recording = false;

async function recordPerfTelemetry(app: App, durationMs = 60000): Promise<void> {
  if (recording) {
    new Notice('Windrose: telemetry already recording');
    return;
  }
  recording = true;
  new Notice(`Windrose: recording performance for ${Math.round(durationMs / 1000)}s — use the map normally`, 5000);

  const t0 = performance.now();
  const now = (): number => Math.round(performance.now() - t0);

  // ---- live counters (reset each second into the time series) ----
  const c = {
    rafFrames: 0, fillRect: 0, drawImage: 0, getImageData: 0, clearRect: 0,
    createPattern: 0, toDataURL: 0, imgSrcSets: 0, imageBitmaps: 0,
    vaultReads: 0, vaultWrites: 0, bytesRead: 0, bytesWritten: 0,
    jsonParses: 0, jsonParseChars: 0, jsonStringifies: 0, jsonStringifyChars: 0,
    longTasks: 0, longTaskMs: 0, pointerEvents: 0,
    preactDiffs: 0, preactDiffMs: 0,
  };
  const series: SecondSample[] = [];
  const frameGaps: FrameGap[] = [];
  const slowIO: Array<{ t: number; op: string; path: string; ms: number; kb: number }> = [];
  const ioPathCounts: Record<string, number> = {};
  const worstLongTasks: Array<{ t: number; ms: number }> = [];
  let lastInteraction = -1;

  const restorers: Array<() => void> = [];
  const safeWrap = (label: string, fn: () => (() => void) | null): void => {
    try {
      const r = fn();
      if (r) restorers.push(r);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[Windrose perf] could not instrument ${label}:`, e);
    }
  };

  // ---- canvas ops ----
  safeWrap('canvas2d', () => {
    const P = CanvasRenderingContext2D.prototype;
    const orig = {
      fillRect: P.fillRect, drawImage: P.drawImage, getImageData: P.getImageData,
      clearRect: P.clearRect, createPattern: P.createPattern,
    };
    P.fillRect = function (this: CanvasRenderingContext2D, ...a) { c.fillRect++; return orig.fillRect.apply(this, a as Parameters<typeof orig.fillRect>); };
    P.drawImage = function (this: CanvasRenderingContext2D, ...a) { c.drawImage++; return orig.drawImage.apply(this, a as Parameters<typeof orig.drawImage>); } as typeof P.drawImage;
    P.getImageData = function (this: CanvasRenderingContext2D, ...a) { c.getImageData++; return orig.getImageData.apply(this, a as Parameters<typeof orig.getImageData>); };
    P.clearRect = function (this: CanvasRenderingContext2D, ...a) { c.clearRect++; return orig.clearRect.apply(this, a as Parameters<typeof orig.clearRect>); };
    P.createPattern = function (this: CanvasRenderingContext2D, ...a) { c.createPattern++; return orig.createPattern.apply(this, a as Parameters<typeof orig.createPattern>); };
    return () => { Object.assign(P, orig); };
  });

  safeWrap('toDataURL', () => {
    const CP = HTMLCanvasElement.prototype;
    const orig = CP.toDataURL;
    CP.toDataURL = function (this: HTMLCanvasElement, ...a) { c.toDataURL++; return orig.apply(this, a as Parameters<typeof orig>); };
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
    if (!orig) return null;
    window.createImageBitmap = ((...a: Parameters<typeof createImageBitmap>) => {
      c.imageBitmaps++;
      return orig(...a);
    }) as typeof createImageBitmap;
    return () => { window.createImageBitmap = orig; };
  });

  // ---- vault I/O ----
  safeWrap('vault adapter', () => {
    const ad = app.vault.adapter;
    const oRead = ad.read.bind(ad);
    const oWrite = ad.write.bind(ad);
    const oReadBin = ad.readBinary.bind(ad);
    const trackPath = (p: string): void => {
      const key = p.split('/').pop() ?? p;
      ioPathCounts[key] = (ioPathCounts[key] ?? 0) + 1;
    };
    ad.read = async (p: string) => {
      const s = performance.now(); const res = await oRead(p);
      const ms = performance.now() - s;
      c.vaultReads++; c.bytesRead += res?.length ?? 0; trackPath(p);
      if (ms > 50) slowIO.push({ t: now(), op: 'read', path: p.split('/').pop() ?? p, ms: Math.round(ms), kb: Math.round((res?.length ?? 0) / 1024) });
      return res;
    };
    ad.readBinary = async (p: string) => {
      const s = performance.now(); const res = await oReadBin(p);
      const ms = performance.now() - s;
      c.vaultReads++; c.bytesRead += res?.byteLength ?? 0; trackPath(p);
      if (ms > 50) slowIO.push({ t: now(), op: 'readBin', path: p.split('/').pop() ?? p, ms: Math.round(ms), kb: Math.round((res?.byteLength ?? 0) / 1024) });
      return res;
    };
    ad.write = async (p: string, data: string, ...rest: unknown[]) => {
      const s = performance.now();
      const res = await (oWrite as (...a: unknown[]) => Promise<void>)(p, data, ...rest);
      const ms = performance.now() - s;
      c.vaultWrites++; c.bytesWritten += data?.length ?? 0; trackPath(p);
      if (ms > 50) slowIO.push({ t: now(), op: 'write', path: p.split('/').pop() ?? p, ms: Math.round(ms), kb: Math.round((data?.length ?? 0) / 1024) });
      return res;
    };
    return () => { ad.read = oRead; ad.write = oWrite; ad.readBinary = oReadBin; };
  });

  // ---- JSON churn (whole-file saves/parses are a known cost center) ----
  safeWrap('JSON', () => {
    const oParse = JSON.parse.bind(JSON);
    const oStr = JSON.stringify.bind(JSON);
    JSON.parse = ((text: string, ...rest: unknown[]) => {
      c.jsonParses++; c.jsonParseChars += typeof text === 'string' ? text.length : 0;
      return (oParse as (...a: unknown[]) => unknown)(text, ...rest);
    }) as typeof JSON.parse;
    JSON.stringify = ((...a: unknown[]) => {
      const res = (oStr as (...a: unknown[]) => string)(...a);
      c.jsonStringifies++; c.jsonStringifyChars += res?.length ?? 0;
      return res;
    }) as typeof JSON.stringify;
    return () => { JSON.parse = oParse; JSON.stringify = oStr; };
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
    rafId = requestAnimationFrame(heartbeat);
  };
  rafId = requestAnimationFrame(heartbeat);
  restorers.push(() => cancelAnimationFrame(rafId));

  // ---- per-second sampler ----
  const sampler = window.setInterval(() => {
    series.push({ t: now(), ...c });
    for (const k of Object.keys(c) as Array<keyof typeof c>) c[k] = 0;
  }, 1000);
  restorers.push(() => window.clearInterval(sampler));

  // ---- environment snapshot ----
  const canvases = Array.from(document.querySelectorAll('canvas')).map(cv => ({
    w: cv.width, h: cv.height, mp: +((cv.width * cv.height) / 1e6).toFixed(2),
    cls: cv.className.toString().slice(0, 40),
  }));
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
  const env = {
    when: new Date().toISOString(),
    platform: Platform.isMobile ? (Platform.isTablet ? 'tablet' : 'phone') : 'desktop',
    ua: navigator.userAgent.slice(0, 160),
    dpr: window.devicePixelRatio,
    screen: { w: window.screen.width, h: window.screen.height },
    canvases,
    requestIdleCallbackSupported: typeof window.requestIdleCallback === 'function',
    longTaskSupported,
    heapMBStart: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
  };

  // ---- run the window, then restore EVERYTHING and write the report ----
  await new Promise<void>(resolve => { window.setTimeout(resolve, durationMs); });

  let report = '';
  try {
    const memEnd = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    const topIO = Object.entries(ioPathCounts).sort((a, b) => b[1] - a[1]).slice(0, 12)
      .map(([p, n]) => ({ path: p, count: n }));
    report = JSON.stringify({
      env,
      durationMs,
      heapMBEnd: memEnd ? Math.round(memEnd.usedJSHeapSize / 1048576) : null,
      frameGapBuckets: gapBuckets,
      worstFrameGapMs: Math.round(worstGap),
      bigFrameGaps: frameGaps.slice(0, 80),
      worstLongTasks: worstLongTasks.sort((a, b) => b.ms - a.ms).slice(0, 20),
      slowIO: slowIO.slice(0, 40),
      topIOPaths: topIO,
      perSecond: series,
    }, null, 1);
  } finally {
    for (const r of restorers) {
      try { r(); } catch { /* must not throw during restore */ }
    }
    recording = false;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fname = `WINDROSE-PERF-${env.platform}-${stamp}.json`;
  await app.vault.adapter.write(fname, report);
  new Notice(`Windrose: telemetry saved to ${fname}`, 8000);
}

export { recordPerfTelemetry };

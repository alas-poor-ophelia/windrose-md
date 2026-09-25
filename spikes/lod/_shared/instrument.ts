/**
 * spikes/lod/_shared/instrument.ts
 *
 * Tiny, dependency-free frame clock shared by every LOD spike.
 * capture.mjs reads `window.__lodFrames` after a gesture and derives
 * mean / p50 / p95 / max frame time plus the >33ms and >50ms counts.
 *
 * Usage inside a spike's main.ts:
 *
 *   import { startFrameClock } from '../_shared/instrument';
 *   const clock = startFrameClock();
 *   function tick() {
 *     clock.beginDraw();
 *     draw();
 *     clock.endDraw();
 *     requestAnimationFrame(tick);
 *   }
 */

export interface LodFrameSample {
  /** performance.now() at the tick */
  t: number;
  /** ms since the previous tick (frame time) */
  dt: number;
  /** ms spent inside the spike's own draw for the most recent frame */
  draw: number;
}

export interface FrameClock {
  beginDraw(): void;
  endDraw(): void;
  /** Drop every recorded sample (capture.mjs calls this via __lod.reset if you wire it). */
  clear(): void;
  stop(): void;
}

declare global {
  interface Window {
    __lodFrames?: LodFrameSample[];
    __lodLongTasks?: Array<{ start: number; duration: number }>;
  }
}

const MAX_SAMPLES = 20000;

export function startFrameClock(): FrameClock {
  const samples: LodFrameSample[] = [];
  window.__lodFrames = samples;

  let last = performance.now();
  let drawStart = 0;
  let lastDraw = 0;
  let raf = 0;
  let running = true;

  const tick = (now: number): void => {
    const dt = now - last;
    last = now;
    if (samples.length < MAX_SAMPLES) samples.push({ t: now, dt, draw: lastDraw });
    if (running) raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  // Long-task observer. capture.mjs installs its own copy via addInitScript, so this
  // only fires when a spike is opened by hand without the rig.
  if (!window.__lodLongTasks && typeof PerformanceObserver !== 'undefined') {
    const bucket: Array<{ start: number; duration: number }> = [];
    window.__lodLongTasks = bucket;
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) bucket.push({ start: e.startTime, duration: e.duration });
      }).observe({ entryTypes: ['longtask'] });
    } catch {
      /* unsupported: leave the bucket empty */
    }
  }

  return {
    beginDraw() {
      drawStart = performance.now();
    },
    endDraw() {
      lastDraw = performance.now() - drawStart;
    },
    clear() {
      samples.length = 0;
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
  };
}

/**
 * zoomTraceProbe.ts
 *
 * On-device zoom-pipeline trace for diagnosing runaway zoom on devices
 * without attachable dev tools (iPad). While armed, every instrumented zoom
 * write site (touch pinch ticks, wheel, WebKit GestureEvents, seamless
 * dive/surface, ViewController live/commit/sync writes) appends a tagged
 * entry to a shared ring buffer; after the window closes, the buffer is
 * written as a JSON report to the vault root so it syncs back to a machine
 * that can read it. Mirrors the inputEventProbe pattern.
 *
 * The per-event cost while DISARMED is a single property check — the trace
 * hooks are safe to leave in production paths permanently.
 */

import type { App } from 'obsidian';
import { Notice, Platform } from 'obsidian';

const TRACE_DURATION_MS = 25000;
const MAX_ENTRIES = 6000;

interface ZoomTraceEntry {
  /** ms since trace start, 1 decimal */
  t: number;
  /** write-site tag, e.g. 'touchTick', 'gestureChange', 'vc.setLive' */
  src: string;
  [key: string]: unknown;
}

interface ZoomTraceBuffer {
  startedAt: number;
  dropped: number;
  entries: ZoomTraceEntry[];
}

interface ZoomTraceWindow extends Window {
  __windroseZoomTrace?: ZoomTraceBuffer | null;
}

/**
 * Append a trace entry if a trace is armed. Call from zoom write sites with
 * a short source tag and the values that matter at that site. No-op (one
 * property check) when no trace is running.
 */
function traceZoom(src: string, data: Record<string, unknown>): void {
  const buf = (window as ZoomTraceWindow).__windroseZoomTrace;
  if (buf == null) return;
  if (buf.entries.length >= MAX_ENTRIES) {
    buf.dropped++;
    return;
  }
  buf.entries.push({
    t: Math.round((performance.now() - buf.startedAt) * 10) / 10,
    src,
    ...data
  });
}

/** Arm the trace, wait out the window, then write the report to the vault. */
async function recordZoomTrace(app: App): Promise<void> {
  const w = window as ZoomTraceWindow;
  if (w.__windroseZoomTrace != null) {
    new Notice('A zoom trace is already running.');
    return;
  }
  w.__windroseZoomTrace = { startedAt: performance.now(), dropped: 0, entries: [] };
  new Notice(`Zoom trace armed for ${TRACE_DURATION_MS / 1000}s — perform the gesture now.`);

  await new Promise((resolve) => window.setTimeout(resolve, TRACE_DURATION_MS));

  const buf = w.__windroseZoomTrace;
  w.__windroseZoomTrace = null;
  if (buf == null) return;

  const report = {
    recordedAt: new Date().toISOString(),
    durationMs: TRACE_DURATION_MS,
    platform: {
      isIosApp: Platform.isIosApp,
      isMobileApp: Platform.isMobileApp,
      isDesktopApp: Platform.isDesktopApp,
      isTablet: Platform.isTablet
    },
    entryCount: buf.entries.length,
    dropped: buf.dropped,
    entries: buf.entries
  };
  const fileName = `WINDROSE-ZOOMTRACE-${Date.now()}.json`;
  await app.vault.create(fileName, JSON.stringify(report, null, 1));
  new Notice(`Zoom trace saved: ${fileName} (${buf.entries.length} entries).`);
}

export { recordZoomTrace, traceZoom };

/**
 * inputEventProbe.ts
 *
 * On-device input-event probe for diagnosing gesture delivery on devices
 * without attachable dev tools (iPad trackpads). Captures 15 seconds of
 * wheel / WebKit GestureEvent / touch / pointer traffic at the window capture
 * phase, then writes a JSON report to the vault root so it syncs back to a
 * machine that can read it. Mirrors the canvasCapabilityReport pattern.
 */

import type { App } from 'obsidian';
import { Notice, Platform } from 'obsidian';

const PROBE_DURATION_MS = 15000;
const MAX_SAMPLES = 12;

interface WheelSample {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  metaKey: boolean;
  defaultPrevented: boolean;
  target: string;
}

interface GestureSample {
  type: string;
  scale: number | null;
  defaultPrevented: boolean;
  target: string;
}

function describeTarget(e: Event): string {
  const t = e.target as HTMLElement | null;
  if (t == null || t.tagName == null) return 'non-element';
  const cls = typeof t.className === 'string' ? t.className.slice(0, 60) : '';
  return `${t.tagName}${cls !== '' ? '.' + cls : ''}`;
}

async function recordInputEventProbe(app: App): Promise<void> {
  const counts: Record<string, number> = {};
  const wheelSamples: WheelSample[] = [];
  const gestureSamples: GestureSample[] = [];
  const pointerTypes: Record<string, number> = {};
  let touchPointsMax = 0;
  let visualViewportScaleChanges = 0;

  const vv = window.visualViewport;
  const vvScaleStart = vv?.scale ?? null;
  const onVvResize = (): void => { visualViewportScaleChanges++; };
  vv?.addEventListener('resize', onVvResize);

  const bump = (type: string): void => {
    counts[type] = (counts[type] ?? 0) + 1;
  };

  // Ring buffer of the most recent wheel events: the interesting gesture is
  // usually performed LAST in a probe run, after the sample cap has filled.
  const wheelSamplesLast: WheelSample[] = [];

  const onWheel = (e: Event): void => {
    bump('wheel');
    const we = e as WheelEvent;
    if (we.ctrlKey) bump('wheel-ctrl');
    if (we.metaKey) bump('wheel-meta');
    const sample: WheelSample = {
      deltaX: Math.round(we.deltaX * 100) / 100,
      deltaY: Math.round(we.deltaY * 100) / 100,
      deltaMode: we.deltaMode,
      ctrlKey: we.ctrlKey,
      metaKey: we.metaKey,
      defaultPrevented: we.defaultPrevented,
      target: describeTarget(we),
    };
    if (wheelSamples.length < MAX_SAMPLES) wheelSamples.push(sample);
    wheelSamplesLast.push(sample);
    if (wheelSamplesLast.length > MAX_SAMPLES) wheelSamplesLast.shift();
  };

  const onGesture = (e: Event): void => {
    bump(e.type);
    if (gestureSamples.length < MAX_SAMPLES) {
      const scale = (e as unknown as { scale?: number }).scale;
      gestureSamples.push({
        type: e.type,
        scale: typeof scale === 'number' ? Math.round(scale * 1000) / 1000 : null,
        defaultPrevented: e.defaultPrevented,
        target: describeTarget(e),
      });
    }
  };

  const onTouch = (e: Event): void => {
    bump(e.type);
    const te = e as TouchEvent;
    if (te.touches != null && te.touches.length > touchPointsMax) {
      touchPointsMax = te.touches.length;
    }
  };

  const onPointer = (e: Event): void => {
    bump(e.type);
    const pt = (e as PointerEvent).pointerType || 'unknown';
    pointerTypes[pt] = (pointerTypes[pt] ?? 0) + 1;
  };

  // Key events, to verify whether hardware modifier keys are delivered at all
  // (WKWebView strips modifier flags from wheel events; the open question is
  // whether Meta/Control keydowns still arrive to track the state manually).
  const keySamples: Array<{ type: string; key: string; ctrlKey: boolean; metaKey: boolean }> = [];
  const onKey = (e: Event): void => {
    bump(e.type);
    const ke = e as KeyboardEvent;
    if (keySamples.length < MAX_SAMPLES) {
      keySamples.push({ type: ke.type, key: ke.key, ctrlKey: ke.ctrlKey, metaKey: ke.metaKey });
    }
  };

  const listeners: Array<[string, (e: Event) => void]> = [
    ['keydown', onKey],
    ['keyup', onKey],
    ['wheel', onWheel],
    ['gesturestart', onGesture],
    ['gesturechange', onGesture],
    ['gestureend', onGesture],
    ['touchstart', onTouch],
    ['touchmove', onTouch],
    ['touchend', onTouch],
    ['pointerdown', onPointer],
    ['pointermove', onPointer],
    ['mousedown', onPointer],
  ];
  // Window capture phase: as early as the page can observe, ahead of any
  // app/plugin handler that might stopPropagation on the way down.
  for (const [type, fn] of listeners) window.addEventListener(type, fn, { capture: true, passive: true });

  new Notice('Windrose: input probe armed for 15 s — scroll and pinch on the map now', 6000);

  await new Promise<void>(resolve => window.setTimeout(resolve, PROBE_DURATION_MS));

  for (const [type, fn] of listeners) window.removeEventListener(type, fn, { capture: true });
  vv?.removeEventListener('resize', onVvResize);

  try {
    const report = {
      generatedAt: new Date().toISOString(),
      platform: {
        isMobile: Platform.isMobile,
        isTablet: Platform.isTablet,
        isIosApp: Platform.isIosApp,
        isDesktopApp: Platform.isDesktopApp,
      },
      gestureEventSupport: {
        windowHasGestureEvent: typeof (window as unknown as { GestureEvent?: unknown }).GestureEvent !== 'undefined',
        onGestureStartInBody: 'ongesturestart' in document.body,
      },
      visualViewport: {
        scaleStart: vvScaleStart,
        scaleEnd: vv?.scale ?? null,
        resizeEvents: visualViewportScaleChanges,
      },
      counts,
      pointerTypes,
      touchPointsMax,
      wheelSamples,
      wheelSamplesLast,
      gestureSamples,
      keySamples,
    };
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const platformTag = Platform.isDesktopApp ? 'desktop' : Platform.isTablet ? 'tablet' : 'mobile';
    const fname = `WINDROSE-INPUT-${platformTag}-${stamp}.json`;
    await app.vault.adapter.write(fname, JSON.stringify(report, null, 2));
    new Notice(`Windrose: input probe saved to ${fname}`, 8000);
  } catch (e) {
    new Notice(`Windrose: input probe failed: ${String(e)}`, 8000);
  }
}

export { recordInputEventProbe };

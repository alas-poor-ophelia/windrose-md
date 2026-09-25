/**
 * surfaceBudget.ts
 *
 * Global byte budget with LRU across canvases for the static/per-level render
 * surfaces owned by `useCanvasRenderer`'s static cache.
 *
 * Design .claude/lod-rd/06-integration-design.md section 3.5: the risk is not
 * device pixel ratio, it is viewport squared times mount count. One padded
 * surface at a 1200x800 viewport is 2400x1600x4 = 15.36 MB; a full-pane map on
 * a 2560x1440 display is 59 MB, and Windrose mounts many maps at once. The
 * ladder adds a second surface per canvas the instant a level crossing happens,
 * so the cap is a global BYTE budget with LRU eviction, not a surface count.
 *
 * The active canvas is guaranteed its two surfaces: background canvases are
 * evicted to zero before the active one loses anything.
 *
 * This module only does accounting and picks victims. The renderer performs the
 * release (zeroing the offscreen so the backing store is actually freed and
 * dropping its cache entry), because only the renderer owns the offscreens.
 */

import { Platform } from 'obsidian';

/**
 * Minimal structural view of `WeakRef`, which is ES2021 and therefore absent
 * from this project's ES2020 lib. Surfaces must never keep a canvas alive: the
 * renderer's cache is a `WeakMap` and a canvas that is unmounted without an
 * explicit release has to be collectable, so a dead handle is simply pruned.
 */
interface WeakHandle<T extends object> {
  deref: () => T | undefined;
}
type WeakHandleCtor = new <T extends object>(target: T) => WeakHandle<T>;

/** The ES2021 intrinsic, declared because ES2020's lib does not describe it. */
declare const WeakRef: WeakHandleCtor;

interface SurfaceRecord {
  /** Weak handle so a registered-but-forgotten canvas can still be collected. */
  canvas: WeakHandle<HTMLCanvasElement>;
  canvasId: number;
  level: number;
  bytes: number;
  /** Monotonic tick of the last register/touch. Diagnostics; order is authority. */
  lastUsed: number;
}

/** What the renderer must release, in the order it should do so. */
interface SurfaceEviction {
  canvas: HTMLCanvasElement;
  level: number;
}

/** One entry of `snapshot().surfaces`. No canvas references escape. */
interface SurfaceSnapshotEntry {
  canvasId: number;
  level: number;
  bytes: number;
  lastUsed: number;
  /** False once the canvas has been collected but the record not yet pruned. */
  alive: boolean;
  /** True for the canvas most recently passed to `setActiveCanvas`. */
  active: boolean;
}

interface SurfaceSnapshot {
  currentBytes: number;
  peakBytes: number;
  budgetBytes: number;
  activeCanvasId: number;
  surfaces: SurfaceSnapshotEntry[];
}

const MIB = 1024 * 1024;
/** Desktop target (design section 3.5). */
const DESKTOP_BUDGET_BYTES = 96 * MIB;
/** iOS target: WKWebView caps total canvas backing store aggressively. */
const IOS_BUDGET_BYTES = 32 * MIB;
/** The active canvas is never taken below this many surfaces. */
const ACTIVE_CANVAS_FLOOR = 2;

/**
 * Insertion order is the LRU order (oldest first), the same idiom as the image
 * cache in `src/assets/imageOperations.ts`: a touch deletes and re-inserts.
 */
const surfaces = new Map<string, SurfaceRecord>();
const canvasIds = new WeakMap<HTMLCanvasElement, number>();

let nextCanvasId = 1;
let useTick = 0;
let totalBytes = 0;
let peak = 0;
let activeCanvasId = 0;
let bridgePublished = false;

/** Stable small integer per canvas, so diagnostics never hold a canvas. */
function canvasIdOf(canvas: HTMLCanvasElement): number {
  const existing = canvasIds.get(canvas);
  if (existing !== undefined) return existing;
  const id = nextCanvasId++;
  canvasIds.set(canvas, id);
  return id;
}

function surfaceKey(canvasId: number, level: number): string {
  return `${canvasId}:${level}`;
}

/** 96 MiB desktop, 32 MiB on iOS. Read per call so a platform mock applies. */
function budgetBytes(): number {
  return Platform.isIosApp === true ? IOS_BUDGET_BYTES : DESKTOP_BUDGET_BYTES;
}

function currentBytes(): number {
  return totalBytes;
}

function peakBytes(): number {
  return peak;
}

function resetPeak(): void {
  peak = totalBytes;
}

/**
 * Attach the counters to the plugin's existing bridge object for measurement.
 * Never creates `__windrose` — if the plugin has not published it yet, the next
 * registration tries again.
 */
function publishBridge(): void {
  if (bridgePublished) return;
  // Absent outside a browser context (unit tests run on node).
  if (typeof activeWindow === 'undefined') return;
  const bridge = (activeWindow as unknown as { __windrose?: Record<string, unknown> }).__windrose;
  if (bridge === undefined || bridge === null) return;
  bridge.surfaces = { peakBytes, currentBytes, snapshot };
  bridgePublished = true;
}

/**
 * Record (or resize) the surface for `canvas` at `level` and mark it the most
 * recently used. Safe to call every bake; re-registering an existing surface
 * only adjusts the byte delta.
 */
function registerSurface(canvas: HTMLCanvasElement, level: number, bytes: number): void {
  publishBridge();
  const canvasId = canvasIdOf(canvas);
  const key = surfaceKey(canvasId, level);
  const existing = surfaces.get(key);
  if (existing !== undefined) {
    totalBytes -= existing.bytes;
    surfaces.delete(key);
  }
  totalBytes += bytes;
  surfaces.set(key, { canvas: new WeakRef(canvas), canvasId, level, bytes, lastUsed: ++useTick });
  if (totalBytes > peak) peak = totalBytes;
}

/** Mark an existing surface most recently used. No-op if it is not registered. */
function touchSurface(canvas: HTMLCanvasElement, level: number): void {
  const canvasId = canvasIds.get(canvas);
  if (canvasId === undefined) return;
  const key = surfaceKey(canvasId, level);
  const record = surfaces.get(key);
  if (record === undefined) return;
  record.lastUsed = ++useTick;
  surfaces.delete(key);
  surfaces.set(key, record);
}

/** Drop a surface from the accounting. The caller frees the backing store. */
function releaseSurface(canvas: HTMLCanvasElement, level: number): void {
  const canvasId = canvasIds.get(canvas);
  if (canvasId === undefined) return;
  const key = surfaceKey(canvasId, level);
  const record = surfaces.get(key);
  if (record === undefined) return;
  totalBytes -= record.bytes;
  surfaces.delete(key);
}

/**
 * Mark the canvas whose surfaces are protected. Everything else is a background
 * canvas and is evicted first, all the way to zero.
 */
function setActiveCanvas(canvas: HTMLCanvasElement | null): void {
  activeCanvasId = canvas === null ? 0 : canvasIdOf(canvas);
}

/** Forget records whose canvas has been collected; nobody can release those. */
function pruneDeadSurfaces(): void {
  for (const [key, record] of surfaces) {
    if (record.canvas.deref() === undefined) {
      totalBytes -= record.bytes;
      surfaces.delete(key);
    }
  }
}

/**
 * The surfaces the renderer should release, oldest first, to get back under
 * budget: every background canvas in LRU order first, then the active canvas's
 * least recently used levels beyond `ACTIVE_CANVAS_FLOOR`.
 *
 * Pure with respect to the accounting (apart from pruning dead handles): the
 * caller calls `releaseSurface` for each entry it actually frees.
 */
function evictIfNeeded(): SurfaceEviction[] {
  pruneDeadSurfaces();
  const budget = budgetBytes();
  if (totalBytes <= budget) return [];

  const plan: SurfaceEviction[] = [];
  let projected = totalBytes;
  const planned = new Set<string>();

  const takeVictim = (record: SurfaceRecord, key: string): boolean => {
    const canvas = record.canvas.deref();
    if (canvas === undefined) return false;
    plan.push({ canvas, level: record.level });
    planned.add(key);
    projected -= record.bytes;
    return true;
  };

  // Pass 1: background canvases, LRU first, down to zero surfaces.
  for (const [key, record] of surfaces) {
    if (projected <= budget) break;
    if (record.canvasId === activeCanvasId) continue;
    takeVictim(record, key);
  }

  // Pass 2: the active canvas, LRU first, but never below its guaranteed two.
  if (projected > budget && activeCanvasId !== 0) {
    let activeLeft = 0;
    for (const [key, record] of surfaces) {
      if (record.canvasId === activeCanvasId && !planned.has(key)) activeLeft++;
    }
    for (const [key, record] of surfaces) {
      if (projected <= budget || activeLeft <= ACTIVE_CANVAS_FLOOR) break;
      if (record.canvasId !== activeCanvasId || planned.has(key)) continue;
      if (takeVictim(record, key)) activeLeft--;
    }
  }

  return plan;
}

function snapshot(): SurfaceSnapshot {
  const entries: SurfaceSnapshotEntry[] = [];
  for (const record of surfaces.values()) {
    entries.push({
      canvasId: record.canvasId,
      level: record.level,
      bytes: record.bytes,
      lastUsed: record.lastUsed,
      alive: record.canvas.deref() !== undefined,
      active: record.canvasId === activeCanvasId,
    });
  }
  return {
    currentBytes: totalBytes,
    peakBytes: peak,
    budgetBytes: budgetBytes(),
    activeCanvasId,
    surfaces: entries,
  };
}

/** Test-only reset: the registry is module global and outlives a test case. */
function resetSurfaceBudget(): void {
  surfaces.clear();
  totalBytes = 0;
  peak = 0;
  activeCanvasId = 0;
}

export type { SurfaceEviction, SurfaceSnapshot, SurfaceSnapshotEntry };
export {
  budgetBytes,
  currentBytes,
  peakBytes,
  resetPeak,
  registerSurface,
  touchSurface,
  releaseSurface,
  setActiveCanvas,
  evictIfNeeded,
  snapshot,
  resetSurfaceBudget,
};

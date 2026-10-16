/**
 * surfaceBudget.ts
 *
 * Global byte budget with LRU across canvases for the static/per-level render
 * surfaces owned by `useCanvasRenderer`'s static cache.
 *
 * The risk is not device pixel ratio, it is viewport squared times mount count. One padded
 * surface at a 1200x800 viewport is 2400x1600x4 = 15.36 MB; a full-pane map on
 * a 2560x1440 display is 59 MB, and Windrose mounts many maps at once. The
 * ladder adds a second surface per canvas the instant a level crossing happens,
 * so the cap is a global BYTE budget with LRU eviction, not a surface count.
 *
 * The active canvas is the one the user is driving: MapCanvas claims the slot
 * on focus, pointerdown and wheel (`setActiveCanvas`) and gives it up on blur
 * and unmount (`releaseActiveCanvas`). Paint order never moves it, so a
 * background pane that re-renders cannot take protection from the focused one.
 * Eviction order: background canvases' non-current levels (drift sources),
 * then background canvases down to zero, then the active canvas's levels
 * beyond its guaranteed two. Each surface is capped (`maxSurfacePixels`) so
 * those two fit the budget by construction.
 *
 * Classic (non-ladder) canvases are registered UNCOUNTED: they appear in the
 * snapshot and in `uncountedBytes`, but never count toward the budget and are
 * never evicted (their cache predates the ladder and has no drift fallback).
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
  /** False for classic canvases: reported, never budgeted, never evicted. */
  counted: boolean;
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
  /** False for a classic surface (outside the budget, never evicted). */
  counted: boolean;
}

interface SurfaceSnapshot {
  currentBytes: number;
  peakBytes: number;
  budgetBytes: number;
  /** Bytes held by classic surfaces, which the budget does not govern. */
  uncountedBytes: number;
  activeCanvasId: number;
  surfaces: SurfaceSnapshotEntry[];
}

const MIB = 1024 * 1024;
/** Desktop target. */
const DESKTOP_BUDGET_BYTES = 96 * MIB;
/** iOS target: WKWebView caps total canvas backing store aggressively. */
const IOS_BUDGET_BYTES = 32 * MIB;
/** The active canvas is never taken below this many surfaces. */
const ACTIVE_CANVAS_FLOOR = 2;
/** Bytes held by one offscreen: RGBA, and Windrose never scales by DPR. */
const SURFACE_BYTES_PER_PX = 4;

/**
 * Insertion order is the LRU order (oldest first), the same idiom as the image
 * cache in `src/assets/imageOperations.ts`: a touch deletes and re-inserts.
 */
const surfaces = new Map<string, SurfaceRecord>();
const canvasIds = new WeakMap<HTMLCanvasElement, number>();

let nextCanvasId = 1;
let useTick = 0;
let totalBytes = 0;
let uncountedBytes = 0;
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

/**
 * Largest device-pixel area one budgeted surface may have: the active canvas's
 * guaranteed `ACTIVE_CANVAS_FLOOR` surfaces must fit the budget on their own
 * (about 12.6M px on desktop, 4.2M px on iOS).
 */
function maxSurfacePixels(): number {
  return Math.floor(budgetBytes() / (ACTIVE_CANVAS_FLOOR * SURFACE_BYTES_PER_PX));
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

/** Remove a record's bytes from whichever total it belongs to. */
function forgetBytes(record: SurfaceRecord): void {
  if (record.counted) totalBytes -= record.bytes;
  else uncountedBytes -= record.bytes;
}

/**
 * Record (or resize) the surface for `canvas` at `level` and mark it the most
 * recently used. Safe to call every bake; re-registering an existing surface
 * only adjusts the byte delta. `counted: false` registers a classic surface:
 * visible in the snapshot, outside the budget, never an eviction victim.
 */
function registerSurface(canvas: HTMLCanvasElement, level: number, bytes: number, counted = true): void {
  publishBridge();
  const canvasId = canvasIdOf(canvas);
  const key = surfaceKey(canvasId, level);
  const existing = surfaces.get(key);
  if (existing !== undefined) {
    forgetBytes(existing);
    surfaces.delete(key);
  }
  if (counted) totalBytes += bytes;
  else uncountedBytes += bytes;
  surfaces.set(key, { canvas: new WeakRef(canvas), canvasId, level, bytes, lastUsed: ++useTick, counted });
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
  forgetBytes(record);
  surfaces.delete(key);
}

/**
 * Mark the canvas whose surfaces are protected (the one the user is driving).
 * Everything else is a background canvas and is evicted first.
 */
function setActiveCanvas(canvas: HTMLCanvasElement | null): void {
  activeCanvasId = canvas === null ? 0 : canvasIdOf(canvas);
}

/**
 * Give up the active slot, but only if `canvas` holds it: a blur or unmount
 * that arrives after another pane already claimed the slot must not clear it.
 */
function releaseActiveCanvas(canvas: HTMLCanvasElement): void {
  const canvasId = canvasIds.get(canvas);
  if (canvasId !== undefined && canvasId === activeCanvasId) activeCanvasId = 0;
}

/** Forget records whose canvas has been collected; nobody can release those. */
function pruneDeadSurfaces(): void {
  for (const [key, record] of surfaces) {
    if (record.canvas.deref() === undefined) {
      forgetBytes(record);
      surfaces.delete(key);
    }
  }
}

/**
 * The surfaces the renderer should release, oldest first, to get back under
 * budget. Pass 0: background canvases' non-current levels (each canvas's most
 * recently used surface is its current level), LRU first. Pass 1: background
 * canvases in LRU order, down to zero. Pass 2: the active canvas's least
 * recently used levels beyond `ACTIVE_CANVAS_FLOOR`. Uncounted (classic)
 * surfaces are never victims.
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

  // Each canvas's current level is its most recently used counted surface: the
  // last one met in LRU (insertion) order.
  const currentKeyOf = new Map<number, string>();
  for (const [key, record] of surfaces) {
    if (record.counted) currentKeyOf.set(record.canvasId, key);
  }

  // Pass 0: background canvases' non-current levels (drift sources), LRU first,
  // so a visible pane loses the level it is showing only as a later resort.
  for (const [key, record] of surfaces) {
    if (projected <= budget) break;
    if (!record.counted || record.canvasId === activeCanvasId) continue;
    if (currentKeyOf.get(record.canvasId) === key) continue;
    takeVictim(record, key);
  }

  // Pass 1: background canvases, LRU first, down to zero surfaces.
  for (const [key, record] of surfaces) {
    if (projected <= budget) break;
    if (!record.counted || record.canvasId === activeCanvasId || planned.has(key)) continue;
    takeVictim(record, key);
  }

  // Pass 2: the active canvas, LRU first, but never below its guaranteed two.
  if (projected > budget && activeCanvasId !== 0) {
    let activeLeft = 0;
    for (const [key, record] of surfaces) {
      if (record.counted && record.canvasId === activeCanvasId && !planned.has(key)) activeLeft++;
    }
    for (const [key, record] of surfaces) {
      if (projected <= budget || activeLeft <= ACTIVE_CANVAS_FLOOR) break;
      if (!record.counted || record.canvasId !== activeCanvasId || planned.has(key)) continue;
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
      counted: record.counted,
    });
  }
  return {
    currentBytes: totalBytes,
    peakBytes: peak,
    budgetBytes: budgetBytes(),
    uncountedBytes,
    activeCanvasId,
    surfaces: entries,
  };
}

/** Test-only reset: the registry is module global and outlives a test case. */
function resetSurfaceBudget(): void {
  surfaces.clear();
  totalBytes = 0;
  uncountedBytes = 0;
  peak = 0;
  activeCanvasId = 0;
}

export type { SurfaceEviction, SurfaceSnapshot, SurfaceSnapshotEntry };
export {
  SURFACE_BYTES_PER_PX,
  budgetBytes,
  maxSurfacePixels,
  currentBytes,
  peakBytes,
  resetPeak,
  registerSurface,
  touchSurface,
  releaseSurface,
  setActiveCanvas,
  releaseActiveCanvas,
  evictIfNeeded,
  snapshot,
  resetSurfaceBudget,
};

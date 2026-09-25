/**
 * ladderTelemetry.ts
 *
 * Frame instrumentation for the lattice ladder's measurement gates (design
 * .claude/lod-rd/06-integration-design.md section 13). A crossing must cost no
 * more than a normal frame, so the gate is a RATIO, not an absolute time: the
 * slowest crossing frame divided by the median non-crossing frame in the same
 * level band. Comparing a crossing against the global median would flatter it
 * whenever the coarse band is intrinsically cheaper than the fine one.
 *
 * Nothing here runs unless a ladder is active: every call site in
 * `useCanvasRenderer` is behind the same `ladder !== null` guard as the rest of
 * the ladder wiring, so classic maps pay literally nothing.
 */

/** One rendered frame. `t` is the `performance.now()` stamp at record time. */
interface LadderFrame {
  t: number;
  frameMs: number;
  level: number;
  crossing: boolean;
  /** Milliseconds spent baking a static surface inside this frame, else null. */
  rebuildMs: number | null;
  /** Named phase timings inside this frame (blit, lattice), for attributing a slow crossing. */
  phases: Record<string, number>;
}

interface LadderCrossingStats {
  /** Frame durations (ms) of the crossing frames, oldest first. */
  crossingFrames: number[];
  /** Median frame duration of the NON-crossing frames, per level band. */
  medianBandFrameMs: Record<number, number>;
  /**
   * Worst crossing frame as a multiple of its own band's median non-crossing
   * frame. 0 when no crossing frame has a band to compare against.
   */
  maxCrossingRatio: number;
}

interface LadderSnapshot {
  capacity: number;
  frames: LadderFrame[];
  stats: LadderCrossingStats;
}

/** Frames retained. At 60 FPS that is ten seconds — several zoom sweeps. */
const CAPACITY = 600;

const ring: (LadderFrame | null)[] = new Array<LadderFrame | null>(CAPACITY).fill(null);
let writeIndex = 0;
let written = 0;
/**
 * A bake reports from inside the static draw callback, which runs part-way
 * through the frame that is still being timed; the frame record claims it.
 */
let pendingRebuildMs: number | null = null;
let pendingPhases: Record<string, number> = {};
let bridgePublished = false;

/** Frames in chronological order, oldest first. */
function frames(): LadderFrame[] {
  const out: LadderFrame[] = [];
  const count = written < CAPACITY ? written : CAPACITY;
  const start = written < CAPACITY ? 0 : writeIndex;
  for (let i = 0; i < count; i++) {
    const frame = ring[(start + i) % CAPACITY];
    if (frame !== null) out.push(frame);
  }
  return out;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Attach the counters to the plugin's existing bridge object, exactly as
 * `surfaceBudget` does. Never creates `__windrose` — if the plugin has not
 * published it yet, the next recorded frame tries again.
 */
function publishBridge(): void {
  if (bridgePublished) return;
  // Absent outside a browser context (unit tests run on node).
  if (typeof activeWindow === 'undefined') return;
  const bridge = (activeWindow as unknown as { __windrose?: Record<string, unknown> }).__windrose;
  if (bridge === undefined || bridge === null) return;
  bridge.ladder = { snapshot, crossingStats, reset };
  bridgePublished = true;
}

/**
 * Record a rendered frame. `rebuildMs` defaults to whatever the frame's static
 * bake reported through `recordRebuild`, which is consumed either way.
 */
function recordFrame(frameMs: number, level: number, crossing: boolean, rebuildMs?: number | null): void {
  publishBridge();
  const bake = rebuildMs === undefined ? pendingRebuildMs : rebuildMs;
  pendingRebuildMs = null;
  const phases = pendingPhases;
  pendingPhases = {};
  ring[writeIndex] = {
    t: typeof performance === 'undefined' ? 0 : performance.now(),
    frameMs,
    level,
    crossing,
    rebuildMs: bake,
    phases
  };
  writeIndex = (writeIndex + 1) % CAPACITY;
  written++;
}

/** Report the cost of a static surface bake; claimed by the frame around it. */
function recordRebuild(ms: number): void {
  pendingRebuildMs = ms;
}

/** Report a named phase's cost (ms) inside the frame being timed; claimed by that frame. */
function recordPhase(name: string, ms: number): void {
  pendingPhases[name] = (pendingPhases[name] ?? 0) + ms;
}

function crossingStats(): LadderCrossingStats {
  const all = frames();
  const bands = new Map<number, number[]>();
  for (const frame of all) {
    if (frame.crossing) continue;
    const band = bands.get(frame.level);
    if (band === undefined) bands.set(frame.level, [frame.frameMs]);
    else band.push(frame.frameMs);
  }

  const medianBandFrameMs: Record<number, number> = {};
  for (const [level, values] of bands) medianBandFrameMs[level] = median(values);

  const crossingFrames: number[] = [];
  let maxCrossingRatio = 0;
  for (const frame of all) {
    if (!frame.crossing) continue;
    crossingFrames.push(frame.frameMs);
    const baseline = medianBandFrameMs[frame.level];
    if (baseline === undefined || baseline <= 0) continue;
    const ratio = frame.frameMs / baseline;
    if (ratio > maxCrossingRatio) maxCrossingRatio = ratio;
  }

  return { crossingFrames, medianBandFrameMs, maxCrossingRatio };
}

function snapshot(): LadderSnapshot {
  return { capacity: CAPACITY, frames: frames(), stats: crossingStats() };
}

function reset(): void {
  ring.fill(null);
  writeIndex = 0;
  written = 0;
  pendingRebuildMs = null;
  pendingPhases = {};
}

export type { LadderFrame, LadderCrossingStats, LadderSnapshot };
export { CAPACITY, recordFrame, recordRebuild, recordPhase, crossingStats, snapshot, reset };

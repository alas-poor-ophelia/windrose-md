#!/usr/bin/env node
/**
 * spikes/lod/_shared/capture.mjs
 *
 *   node spikes/lod/_shared/capture.mjs <slug> [--scenario name] [--steps N]
 *                                       [--viewport WxH] [--dpr 1|2] [--seed S]
 *                                       [--stride N] [--delta N] [--query k=v] [--hold]
 *                                       [--timing-only] [--throttle N] [--fiducial]
 *
 * Drives a spike's OWN wheel/drag handlers in headless chromium and writes
 *   spikes/lod/<slug>/out/<scenario>/{frames/NNN.png, contact-sheet.png, report.json, report.md}
 *
 * The page is loaded over file:// — spikes ship an IIFE bundle precisely so that
 * chromium's file:// module/fetch restrictions never come into play. No http server needed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOD_ROOT = path.resolve(HERE, '..');

// ---------------------------------------------------------------- args
const VALUE_FLAGS = ['scenario', 'steps', 'viewport', 'dpr', 'seed', 'stride', 'delta', 'query', 'throttle', 'jitter-zoom', 'wheel-pattern'];
const argv = process.argv.slice(2);
const opts = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const name = a.slice(2);
    if (VALUE_FLAGS.includes(name)) opts[name] = argv[++i];
    else opts[name] = true;
  } else {
    positional.push(a);
  }
}

const slug = positional[0];
const scenario = opts.scenario ?? 'zoom-in';
const steps = Number(opts.steps ?? 48);
// the jitter scenario is a per-frame pop trace; a stride > 1 would throw away the flip-flops
const stride = scenario === 'jitter' ? 1 : Number(opts.stride ?? 4);
const wheelPattern = String(opts['wheel-pattern'] ?? 'uniform');
const jitterZoomOpt = opts['jitter-zoom'] === undefined ? null : Number(opts['jitter-zoom']);
const seed = String(opts.seed ?? '1');
const dpr = Number(opts.dpr ?? 1);
const hold = opts.hold === true;
const timingOnly = opts['timing-only'] === true;
const wantFiducial = opts.fiducial === true;
const throttle = opts.throttle === undefined ? 1 : Number(opts.throttle);
const [vw, vh] = String(opts.viewport ?? '1280x800').split('x').map(Number);
const fixedDelta = opts.delta === undefined ? null : Number(opts.delta);
// extra URL query passed straight through to the spike, e.g. --query "rings=60&mode=tiled"
const extraQuery = opts.query ? String(opts.query).replace(/^[?&]/, '') : '';

const SCENARIOS = ['zoom-in', 'zoom-out', 'zoom-in-out', 'pan-zoom', 'settle', 'jitter'];
const WHEEL_PATTERNS = ['uniform', 'human'];
if (!slug) {
  console.error(`usage: node spikes/lod/_shared/capture.mjs <slug> [--scenario ${SCENARIOS.join('|')}] [--steps N] [--viewport WxH] [--dpr 1|2] [--stride N] [--query k=v] [--hold] [--timing-only] [--throttle N] [--fiducial] [--wheel-pattern ${WHEEL_PATTERNS.join('|')}] [--jitter-zoom Z]`);
  process.exit(2);
}
if (!SCENARIOS.includes(scenario)) {
  console.error(`[capture] unknown scenario "${scenario}" (known: ${SCENARIOS.join(', ')})`);
  process.exit(2);
}
if (!WHEEL_PATTERNS.includes(wheelPattern)) {
  console.error(`[capture] unknown --wheel-pattern "${wheelPattern}" (known: ${WHEEL_PATTERNS.join(', ')})`);
  process.exit(2);
}

const spikeDir = path.join(LOD_ROOT, slug);
const indexHtml = path.join(spikeDir, 'index.html');
const bundle = path.join(spikeDir, 'dist', 'bundle.js');
if (!fs.existsSync(indexHtml)) { console.error(`[capture] missing ${indexHtml}`); process.exit(2); }
if (!fs.existsSync(bundle)) { console.error(`[capture] missing ${bundle} - run build.mjs ${slug} first`); process.exit(2); }

const outName = timingOnly ? `${scenario}-timing` : scenario;
const outDir = path.join(spikeDir, 'out', outName);
const framesDir = path.join(outDir, 'frames');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(framesDir, { recursive: true });

// ---------------------------------------------------------------- helpers
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n) => String(n).padStart(3, '0');
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

function stats(values) {
  if (!values.length) return { count: 0, mean: 0, p50: 0, p95: 0, max: 0, over33: 0, over50: 0 };
  const s = [...values].sort((a, b) => a - b);
  const at = (p) => s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
  return {
    count: s.length,
    mean: +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(2),
    p50: +at(0.5).toFixed(2),
    p95: +at(0.95).toFixed(2),
    max: +s[s.length - 1].toFixed(2),
    over33: values.filter((v) => v > 33).length,
    over50: values.filter((v) => v > 50).length,
  };
}
const median = (vals) => {
  if (!vals.length) return null;
  const s = [...vals].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

// ---------------------------------------------------------------- wheel cadence
// A trackpad/mouse user does NOT emit one notch every 16 ms. `--wheel-pattern human`
// replays a recorded-feeling cadence instead: bursts of 3-6 notches spaced 30-60 ms,
// separated by 150-400 ms pauses. Deterministic from --seed, so a run is repeatable.
function hashSeed(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function mulberry32(a) {
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const wheelRnd = mulberry32(hashSeed(seed));
const wheelBursts = [];
let burstLeft = 0;
/** ms to wait AFTER the wheel notch we just dispatched. */
function nextWheelGap() {
  if (wheelPattern !== 'human') return 16;
  if (burstLeft === 0) { burstLeft = 3 + Math.floor(wheelRnd() * 4); wheelBursts.push(burstLeft); }
  burstLeft--;
  if (burstLeft === 0) return 150 + Math.round(wheelRnd() * 250); // inter-burst pause
  return 30 + Math.round(wheelRnd() * 30);                        // intra-burst spacing
}

// ---------------------------------------------------------------- launch
const browser = await chromium.launch({ headless: !hold });
const context = await browser.newContext({
  viewport: { width: vw, height: vh },
  deviceScaleFactor: dpr,
});

await context.addInitScript(() => {
  window.__lodLongTasks = [];
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__lodLongTasks.push({ start: e.startTime, duration: e.duration });
    }).observe({ entryTypes: ['longtask'] });
  } catch { /* longtask unsupported */ }
});

const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e && e.stack ? e.stack.split('\n')[0] : e)));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(`console.error: ${m.text()}`); });

const url = `file://${indexHtml.replace(/\\/g, '/')}?scenario=${encodeURIComponent(scenario)}&seed=${encodeURIComponent(seed)}${wantFiducial ? '&fiducial=1' : ''}${extraQuery ? `&${extraQuery}` : ''}`;
await page.goto(url);

await page.waitForFunction(() => !!window.__lod && !!window.__lod.ready, null, { timeout: 15000 });
await page.evaluate(() => window.__lod.ready);

const caps = await page.evaluate(() => ({
  hasSetZoom: typeof window.__lod.setZoom === 'function',
  hasZoomRange: typeof window.__lod.zoomRange === 'function',
  hasReset: typeof window.__lod.reset === 'function',
  hasMetrics: typeof window.__lod.metrics === 'function',
  hasFootprint: typeof window.__lod.footprint === 'function',
  hasSetFiducial: typeof window.__lod.setFiducial === 'function',
  hasFiducialWorld: !!window.__lod.fiducialWorld,
  zoomRange: typeof window.__lod.zoomRange === 'function' ? window.__lod.zoomRange() : null,
  // optional: the zoom values at which a level-based renderer swaps lattice/level.
  // Its presence turns on the crossingPop metric and picks the jitter target.
  crossings: Array.isArray(window.__lod.crossings)
    ? window.__lod.crossings.filter((v) => typeof v === 'number' && Number.isFinite(v)).slice().sort((a, b) => a - b)
    : null,
  bg: getComputedStyle(document.body).backgroundColor,
}));
const crossings = caps.crossings && caps.crossings.length ? caps.crossings : null;

const bgRGB = (caps.bg.match(/\d+/g) || ['0', '0', '0']).slice(0, 3).map(Number);
const fiducialLive = wantFiducial && caps.hasFiducialWorld;

// cursor: deliberately off-centre so anchor bugs show up as drift
const cursorHome = { x: Math.round(vw * 0.32), y: Math.round(vh * 0.38) };
const cursor = { ...cursorHome };
await page.mouse.move(cursor.x, cursor.y);

const nextFrame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
const setZoom = (z) => page.evaluate(([zz, ax, ay]) => window.__lod.setZoom(zz, ax, ay), [z, cursor.x, cursor.y]);
const readZoom = () => page.evaluate(() => window.__lod.getZoom());

// -------- calibrate the per-step wheel delta so N steps traverse the zoom range
let delta = fixedDelta === null ? -100 : fixedDelta;
if (fixedDelta === null && caps.hasZoomRange && caps.hasSetZoom && caps.zoomRange) {
  const { min, max } = caps.zoomRange;
  await setZoom(min); await nextFrame();
  const z0 = await readZoom();
  await page.mouse.wheel(0, -100); await nextFrame();
  const z1 = await readZoom();
  const ratio = z1 / z0;
  if (Number.isFinite(ratio) && ratio > 1.000001) {
    const wanted = Math.log(max / min) / Math.max(1, steps - 1);
    delta = -100 * (wanted / Math.log(ratio));
    delta = Math.max(-800, Math.min(-8, delta));
  }
  await setZoom(min); await nextFrame();
}

// -------- CPU throttling (renderer thread only; the GPU/compositor thread is unaffected,
//          so this models a slow main thread, not a slow device end-to-end)
let cdp = null;
if (throttle > 1) {
  cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await nextFrame();
}

// ---------------------------------------------------------------- gesture engine
const stepRecords = [];
const frameRecords = [];
const t0 = Date.now();
const frameClockStart = await page.evaluate(() => (window.__lodFrames || []).length);

/**
 * Per-step drift is algebraically zero for any spike that anchors with the same
 * transform it exposes through worldAt/screenOf. The cumulative check is the one
 * that bites: one world point is sampled under the cursor at the very start of the
 * run and re-projected after every step, so rounding, level snapping and slow
 * offset accumulation all show up here.
 *
 * Neither check leaves the spike's own maths. The PIXEL-domain fiducial check
 * (--fiducial) is the one a spike cannot talk its way out of.
 */
let anchorWorld = null;
async function cumulativeDrift() {
  if (!anchorWorld) return 0;
  const s = await page.evaluate(([wx, wy]) => window.__lod.screenOf(wx, wy), [anchorWorld.x, anchorWorld.y]);
  return +dist(s.x, s.y, cursor.x, cursor.y).toFixed(4);
}
async function armAnchor() {
  anchorWorld = await page.evaluate(([x, y]) => window.__lod.worldAt(x, y), [cursor.x, cursor.y]);
  // Pin the magenta marker to the anchored world point so the pixel-domain check is
  // exactly G2: "the thing under the cursor stays under the cursor".
  if (fiducialLive && caps.hasSetFiducial) {
    await page.evaluate(([wx, wy]) => window.__lod.setFiducial(wx, wy), [anchorWorld.x, anchorWorld.y]);
  }
}

async function shoot(stepIndex, zoom, phase, extra = {}) {
  if (timingOnly && phase !== 'start' && phase !== 'end') return;
  const view = await page.evaluate(() => ({
    fid: window.__lod.fiducialWorld
      ? { world: window.__lod.fiducialWorld, screen: window.__lod.screenOf(window.__lod.fiducialWorld.x, window.__lod.fiducialWorld.y) }
      : null,
    foot: typeof window.__lod.footprint === 'function' ? window.__lod.footprint() : null,
  }));
  const buf = await page.screenshot({ type: 'png' });
  const file = `${pad(frameRecords.length)}.png`;
  fs.writeFileSync(path.join(framesDir, file), buf);
  frameRecords.push({
    index: frameRecords.length,
    step: stepIndex,
    file,
    zoom: +zoom.toFixed(4),
    phase,
    cursor: { ...cursor },
    fiducialExpected: view.fid ? { x: +view.fid.screen.x.toFixed(2), y: +view.fid.screen.y.toFixed(2) } : null,
    footprint: view.foot && view.foot.points ? view.foot.points : null,
    ...extra,
  });
}

async function doWheel(stepIndex, dy, phase) {
  const pre = await page.evaluate(([x, y]) => ({ w: window.__lod.worldAt(x, y), z: window.__lod.getZoom() }), [cursor.x, cursor.y]);
  await page.mouse.wheel(0, dy);
  await nextFrame();
  const post = await page.evaluate(([x, y, wx, wy]) => ({
    s: window.__lod.screenOf(wx, wy),
    z: window.__lod.getZoom(),
    m: window.__lod.metrics ? window.__lod.metrics() : {},
  }), [cursor.x, cursor.y, pre.w.x, pre.w.y]);
  stepRecords.push({
    step: stepIndex, kind: 'wheel', phase,
    elapsedMs: Date.now() - t0,
    zoomBefore: +pre.z.toFixed(4), zoom: +post.z.toFixed(4),
    driftPx: +dist(post.s.x, post.s.y, cursor.x, cursor.y).toFixed(4),
    cumDriftPx: await cumulativeDrift(),
    metrics: post.m,
  });
  await sleep(nextWheelGap());
  return post.z;
}

async function doDrag(stepIndex, dx, dy, phase) {
  const pre = await page.evaluate(([x, y]) => ({ w: window.__lod.worldAt(x, y), z: window.__lod.getZoom() }), [cursor.x, cursor.y]);
  cursor.x += dx; cursor.y += dy;
  await page.mouse.move(cursor.x, cursor.y);
  await nextFrame();
  const post = await page.evaluate(([x, y, wx, wy]) => ({
    s: window.__lod.screenOf(wx, wy),
    z: window.__lod.getZoom(),
    m: window.__lod.metrics ? window.__lod.metrics() : {},
  }), [cursor.x, cursor.y, pre.w.x, pre.w.y]);
  stepRecords.push({
    step: stepIndex, kind: 'drag', phase,
    elapsedMs: Date.now() - t0,
    zoomBefore: +pre.z.toFixed(4), zoom: +post.z.toFixed(4),
    driftPx: +dist(post.s.x, post.s.y, cursor.x, cursor.y).toFixed(4),
    cumDriftPx: await cumulativeDrift(),
    metrics: post.m,
  });
  await sleep(16);
  return post.z;
}

// -------- matched-zoom ladder (G4 path independence, zoom-in-out only)
const MATCHED_COUNT = 6;
const matchedTargets = [];
const zr = caps.zoomRange ?? { min: 0.25, max: 8 };
if (scenario === 'zoom-in-out' && caps.hasSetZoom && !timingOnly) {
  // The in-leg is only half the run, so it reaches sqrt(max/min), not max. Ladder the
  // targets up to the PREDICTED turnaround zoom or every target above it never gets crossed
  // and the pair goes missing.
  const half = Math.max(1, Math.floor(steps / 2));
  const apex = Math.min(zr.max, zr.min * Math.pow(zr.max / zr.min, half / Math.max(1, steps - 1)));
  for (let i = 1; i <= MATCHED_COUNT; i++) {
    matchedTargets.push(zr.min * Math.pow(apex / zr.min, i / (MATCHED_COUNT + 1)));
  }
}
async function maybeMatched(dir, zBefore, zAfter, stepIndex) {
  if (!matchedTargets.length) return zAfter;
  let z = zAfter;
  for (const t of matchedTargets) {
    const crossed = dir === 'in' ? (zBefore < t && zAfter >= t) : (zBefore > t && zAfter <= t);
    if (!crossed) continue;
    // snap exactly onto the target through the spike's own zoomAbout so the two
    // sides of the pair are pixel-comparable, then settle for 600 ms
    await setZoom(t); await nextFrame();
    await sleep(600);
    await shoot(stepIndex, t, `matched-${dir}`, { matchedZoom: +t.toFixed(6) });
    z = await readZoom();
  }
  return z;
}

async function runWheelRun(startStep, count, dy, phase) {
  const dir = dy < 0 ? 'in' : 'out';
  let s = startStep;
  for (let i = 0; i < count; i++) {
    const before = await readZoom();
    let z = await doWheel(s, dy, phase);
    z = await maybeMatched(dir, before, z, s);
    if (i === count - 1 || s % stride === 0) await shoot(s, z, phase);
    s++;
  }
  return s;
}

let step = 0;

if (scenario === 'zoom-in') {
  if (caps.hasSetZoom) { await setZoom(zr.min); await nextFrame(); }
  await armAnchor(); // arm BEFORE the start frame so the fiducial baseline is the anchored point
  await shoot(-1, await readZoom(), 'start');
  step = await runWheelRun(0, steps, delta, 'zoom-in');
} else if (scenario === 'zoom-out') {
  if (caps.hasSetZoom) { await setZoom(zr.max); await nextFrame(); }
  await armAnchor(); // arm BEFORE the start frame so the fiducial baseline is the anchored point
  await shoot(-1, await readZoom(), 'start');
  step = await runWheelRun(0, steps, -delta, 'zoom-out');
} else if (scenario === 'zoom-in-out') {
  if (caps.hasSetZoom) { await setZoom(zr.min); await nextFrame(); }
  await armAnchor(); // arm BEFORE the start frame so the fiducial baseline is the anchored point
  await shoot(-1, await readZoom(), 'start');
  const half = Math.max(1, Math.floor(steps / 2));
  step = await runWheelRun(0, half, delta, 'zoom-in');
  step = await runWheelRun(step, steps - half, -delta, 'zoom-out');
} else if (scenario === 'pan-zoom') {
  if (caps.hasSetZoom) { await setZoom(zr.min); await nextFrame(); }
  await armAnchor(); // arm BEFORE the start frame so the fiducial baseline is the anchored point
  await shoot(-1, await readZoom(), 'start');
  const nz = Math.max(1, Math.round(steps * 0.4));
  const npan = Math.max(1, Math.round(steps * 0.2));
  step = await runWheelRun(0, nz, delta, 'zoom-in');
  await page.mouse.move(cursor.x, cursor.y);
  await page.mouse.down();
  for (let i = 0; i < npan; i++) {
    const z = await doDrag(step, 9, 7, 'pan');
    if (i === npan - 1 || step % stride === 0) await shoot(step, z, 'pan');
    step++;
  }
  await page.mouse.up();
  step = await runWheelRun(step, Math.max(1, steps - nz - npan), -delta, 'zoom-out');
} else if (scenario === 'settle') {
  if (caps.hasSetZoom) { await setZoom(zr.min); await nextFrame(); }
  await armAnchor(); // arm BEFORE the start frame so the fiducial baseline is the anchored point
  await shoot(-1, await readZoom(), 'start');
  const fast = Math.max(2, Math.round(steps / 4));
  const fastDelta = delta * (steps / fast);
  for (let i = 0; i < fast; i++) {
    const z = await doWheel(step, fastDelta, 'gesture');
    await shoot(step, z, 'gesture');
    step++;
  }
  // settled: 3 captures across 600 ms with no further input
  for (let i = 0; i < 3; i++) {
    await sleep(200);
    const z = await readZoom();
    const m = await page.evaluate(() => (window.__lod.metrics ? window.__lod.metrics() : {}));
    stepRecords.push({ step, kind: 'idle', phase: 'settled', elapsedMs: Date.now() - t0, zoomBefore: z, zoom: +z.toFixed(4), driftPx: 0, cumDriftPx: await cumulativeDrift(), metrics: m });
    await shoot(step, z, 'settled');
    step++;
  }
}

let jitterTarget = null;
let jitterNotch = null;
if (scenario === 'jitter') {
  // The gesture the Guildmaster made by hand: park on a level boundary, then waggle the
  // wheel one notch at a time. A level-based renderer that snaps on a threshold will
  // flip-flop here; a continuous one will not.
  jitterNotch = fixedDelta === null ? -100 : fixedDelta; // a REAL single wheel notch, not the calibrated per-step delta
  const mid = Math.sqrt(zr.min * zr.max);               // midpoint of the range in log space
  jitterTarget = jitterZoomOpt !== null && Number.isFinite(jitterZoomOpt)
    ? jitterZoomOpt
    : (crossings ? crossings[0] : mid);
  jitterTarget = Math.max(zr.min, Math.min(zr.max, jitterTarget));

  if (caps.hasSetZoom) { await setZoom(zr.min); await nextFrame(); }
  await armAnchor();
  await shoot(-1, await readZoom(), 'start');

  // approach the target by driving the spike's OWN wheel handler (calibrated delta, for speed)
  let z = await readZoom();
  for (let guard = 0; guard < 400 && z < jitterTarget - 1e-9; guard++) {
    const before = z;
    z = await doWheel(step, delta, 'approach');
    step++;
    if (!(z > before + 1e-9)) break; // clamped or no movement: stop rather than spin
  }
  await shoot(step, z, 'approach-end', { jitterTarget: +jitterTarget.toFixed(6) });

  // waggle: out, in, out, in ... one notch each, every frame captured
  for (let i = 0; i < steps; i++) {
    const out = i % 2 === 0;
    const phase = out ? 'jitter-out' : 'jitter-in';
    const zz = await doWheel(step, out ? -jitterNotch : jitterNotch, phase);
    await shoot(step, zz, phase);
    step++;
  }
}

const endZoom = await readZoom();
await shoot(step, endZoom, 'end');

const totalMs = Date.now() - t0;
if (cdp) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

// ---------------------------------------------------------------- frame clock + long tasks
const rawFrames = await page.evaluate((from) => (window.__lodFrames || []).slice(from), frameClockStart);
const longTasks = await page.evaluate(() => window.__lodLongTasks || []);
const finalMetrics = await page.evaluate(() => (window.__lod.metrics ? window.__lod.metrics() : {}));

// the first sample after the gesture starts carries the pre-gesture idle gap; drop it
const frameTimes = rawFrames.slice(1).map((f) => f.dt);
const drawTimes = rawFrames.slice(1).map((f) => f.draw).filter((d) => typeof d === 'number' && d > 0);

// ---------------------------------------------------------------- pixel analysis
const analysis = await context.newPage();
await analysis.goto('about:blank');
const SAMPLE_W = 128;
const SAMPLE_H = 96;

/** decode + measure one frame at FULL resolution. Runs inside a throwaway chromium page. */
const measureFrame = async (b64, frame) => analysis.evaluate(async ({ data, bg, W, H, devicePx, foot, wantFid, popOn }) => {
  const img = new Image();
  img.src = `data:image/png;base64,${data}`;
  await img.decode();

  // ---- full-resolution buffer
  const FW = img.naturalWidth;
  const FH = img.naturalHeight;
  const full = document.createElement('canvas');
  full.width = FW; full.height = FH;
  const fctx = full.getContext('2d', { willReadFrequently: true });
  fctx.drawImage(img, 0, 0);
  const fd = fctx.getImageData(0, 0, FW, FH).data;

  // ---- downsampled buffer (legacy blank / diff checks)
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H).data;

  const total = W * H;
  let bgCount = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (Math.abs(d[i] - bg[0]) <= 6 && Math.abs(d[i + 1] - bg[1]) <= 6 && Math.abs(d[i + 2] - bg[2]) <= 6) bgCount++;
  }
  let changed = 0;
  const prev = window.__prevSample;
  if (prev) {
    for (let i = 0; i < d.length; i += 4) {
      if (Math.abs(d[i] - prev[i]) > 24 || Math.abs(d[i + 1] - prev[i + 1]) > 24 || Math.abs(d[i + 2] - prev[i + 2]) > 24) changed++;
    }
  }
  window.__prevSample = d;

  // ---- G3 pop: mean |Δluma| vs the previous captured frame, full resolution
  let pop = null;
  if (popOn) {
    const luma = new Uint8Array(FW * FH);
    for (let p = 0, i = 0; p < luma.length; p++, i += 4) {
      luma[p] = (fd[i] * 77 + fd[i + 1] * 150 + fd[i + 2] * 29) >> 8;
    }
    const pl = window.__prevLuma;
    if (pl && pl.length === luma.length) {
      let acc = 0;
      for (let p = 0; p < luma.length; p++) acc += Math.abs(luma[p] - pl[p]);
      pop = acc / luma.length;
    }
    window.__prevLuma = luma;
  }

  // ---- G2 pixel-domain fiducial: centroid of pure-magenta pixels
  let fiducialFound = null;
  let fiducialPixels = 0;
  if (wantFid) {
    let sx = 0; let sy = 0;
    for (let y = 0; y < FH; y++) {
      for (let x = 0; x < FW; x++) {
        const i = (y * FW + x) * 4;
        if (fd[i] > 200 && fd[i + 1] < 70 && fd[i + 2] > 200) { sx += x; sy += y; fiducialPixels++; }
      }
    }
    if (fiducialPixels > 0) {
      fiducialFound = { x: (sx / fiducialPixels + 0.5) / devicePx, y: (sy / fiducialPixels + 0.5) / devicePx };
    }
  }

  // ---- G1 footprint-masked hole detection at full resolution
  let holes = null;
  if (foot && foot.length >= 3) {
    const pts = foot.map((p) => ({ x: p.x * devicePx, y: p.y * devicePx }));
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    const x0 = Math.max(0, Math.floor(minX));
    const y0 = Math.max(0, Math.floor(minY));
    const x1 = Math.min(FW - 1, Math.ceil(maxX));
    const y1 = Math.min(FH - 1, Math.ceil(maxY));
    const bw = Math.max(0, x1 - x0 + 1);
    const bh = Math.max(0, y1 - y0 + 1);
    const inside = (px, py) => {
      let hit = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const yi = pts[i].y; const yj = pts[j].y;
        if ((yi > py) !== (yj > py)) {
          const xx = ((pts[j].x - pts[i].x) * (py - yi)) / (yj - yi) + pts[i].x;
          if (px < xx) hit = !hit;
        }
      }
      return hit;
    };
    // mask: 1 = inside footprint AND background-coloured => candidate hole pixel
    const mask = new Uint8Array(bw * bh);
    let maskedIn = 0;
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const gx = x0 + x; const gy = y0 + y;
        if (!inside(gx + 0.5, gy + 0.5)) continue;
        maskedIn++;
        const i = (gy * FW + gx) * 4;
        if (Math.abs(fd[i] - bg[0]) <= 6 && Math.abs(fd[i + 1] - bg[1]) <= 6 && Math.abs(fd[i + 2] - bg[2]) <= 6) mask[y * bw + x] = 1;
      }
    }
    // 4-connected components over the mask
    const stack = new Int32Array(bw * bh);
    let count = 0; let largestArea = 0; let largestBBox = null; let holeArea = 0;
    const MIN_AREA = 4;
    for (let s = 0; s < mask.length; s++) {
      if (mask[s] !== 1) continue;
      let top = 0; stack[top++] = s; mask[s] = 2;
      let area = 0; let bx0 = bw; let by0 = bh; let bx1 = -1; let by1 = -1;
      while (top > 0) {
        const p = stack[--top];
        const px = p % bw; const py = (p - px) / bw;
        area++;
        if (px < bx0) bx0 = px; if (px > bx1) bx1 = px;
        if (py < by0) by0 = py; if (py > by1) by1 = py;
        if (px > 0 && mask[p - 1] === 1) { mask[p - 1] = 2; stack[top++] = p - 1; }
        if (px < bw - 1 && mask[p + 1] === 1) { mask[p + 1] = 2; stack[top++] = p + 1; }
        if (py > 0 && mask[p - bw] === 1) { mask[p - bw] = 2; stack[top++] = p - bw; }
        if (py < bh - 1 && mask[p + bw] === 1) { mask[p + bw] = 2; stack[top++] = p + bw; }
      }
      if (area < MIN_AREA) continue;
      count++; holeArea += area;
      if (area > largestArea) {
        largestArea = area;
        largestBBox = {
          x: +((x0 + bx0) / devicePx).toFixed(1),
          y: +((y0 + by0) / devicePx).toFixed(1),
          w: +((bx1 - bx0 + 1) / devicePx).toFixed(1),
          h: +((by1 - by0 + 1) / devicePx).toFixed(1),
        };
      }
    }
    holes = {
      count,
      largestArea: +(largestArea / (devicePx * devicePx)).toFixed(1),
      largestBBox,
      holeAreaPctOfFootprint: maskedIn ? +((holeArea / maskedIn) * 100).toFixed(3) : 0,
      footprintPx: +(maskedIn / (devicePx * devicePx)).toFixed(0),
    };
  }

  return {
    bgPct: bgCount / total,
    diffPct: prev ? changed / total : null,
    pop: pop === null ? null : +pop.toFixed(3),
    fiducialFound: fiducialFound ? { x: +fiducialFound.x.toFixed(2), y: +fiducialFound.y.toFixed(2) } : null,
    fiducialPixels,
    holes,
    fullSize: { w: FW, h: FH },
  };
}, {
  data: b64,
  bg: bgRGB,
  W: SAMPLE_W,
  H: SAMPLE_H,
  devicePx: dpr,
  foot: frame.footprint,
  wantFid: fiducialLive,
  popOn: true,
});

for (const fr of frameRecords) {
  const b64 = fs.readFileSync(path.join(framesDir, fr.file)).toString('base64');
  const res = await measureFrame(b64, fr);

  fr.bgPct = +res.bgPct.toFixed(4);
  fr.blank = res.bgPct > 0.95;
  fr.diffPct = res.diffPct === null ? null : +(res.diffPct * 100).toFixed(2);
  fr.pop = res.pop;
  fr.holes = res.holes;
  fr.holeFail = !!(res.holes && res.holes.largestBBox && res.holes.largestBBox.w >= 8 && res.holes.largestBBox.h >= 8);
  if (fiducialLive) {
    fr.fiducialFound = res.fiducialFound;
    fr.fiducialPixels = res.fiducialPixels;
    fr.fiducialDriftPx = (res.fiducialFound && fr.fiducialExpected)
      ? +dist(res.fiducialFound.x, res.fiducialFound.y, fr.fiducialExpected.x, fr.fiducialExpected.y).toFixed(2)
      : null;
    // cumulative motion of the marker in the CURSOR's frame of reference, vs frame 0
    const base = frameRecords[0];
    if (res.fiducialFound && base && base.fiducialFound) {
      fr.fiducialCumPx = +dist(
        res.fiducialFound.x - fr.cursor.x, res.fiducialFound.y - fr.cursor.y,
        base.fiducialFound.x - base.cursor.x, base.fiducialFound.y - base.cursor.y,
      ).toFixed(2);
    } else {
      fr.fiducialCumPx = null;
    }
  }
  // free the big luma buffer between frames only when we are done with it
}
// frozen = pixel-identical to the previous capture even though the zoom moved between them
for (let i = 1; i < frameRecords.length; i++) {
  const a = frameRecords[i - 1];
  const b = frameRecords[i];
  b.frozen = b.diffPct === 0 && Math.abs(b.zoom - a.zoom) > 1e-6;
}
if (frameRecords[0]) frameRecords[0].frozen = false;

const diffs = frameRecords.filter((f) => typeof f.diffPct === 'number');
const maxJump = diffs.reduce((acc, f) => (f.diffPct > (acc ? acc.diffPct : -1) ? f : acc), null);

// ---------------------------------------------------------------- G4 matched-zoom path diff
let pathDiff = null;
if (!timingOnly) {
  const ins = frameRecords.filter((f) => f.phase === 'matched-in');
  const outs = frameRecords.filter((f) => f.phase === 'matched-out');
  const pairs = [];
  for (const a of ins) {
    const b = outs.find((o) => Math.abs(o.matchedZoom - a.matchedZoom) < 1e-6);
    if (b) pairs.push([a, b]);
  }
  if (pairs.length) {
    const results = [];
    for (const [a, b] of pairs) {
      const A = fs.readFileSync(path.join(framesDir, a.file)).toString('base64');
      const B = fs.readFileSync(path.join(framesDir, b.file)).toString('base64');
      const r = await analysis.evaluate(async ({ da, db }) => {
        const load = async (s) => { const im = new Image(); im.src = `data:image/png;base64,${s}`; await im.decode(); return im; };
        const ia = await load(da); const ib = await load(db);
        const W = ia.naturalWidth; const H = ia.naturalHeight;
        const mk = (im) => {
          const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
          const cx = cv.getContext('2d', { willReadFrequently: true });
          cx.drawImage(im, 0, 0);
          return cx.getImageData(0, 0, W, H).data;
        };
        const A2 = mk(ia); const B2 = mk(ib);
        let acc = 0; let n = 0; let worst = 0;
        for (let i = 0; i < A2.length; i += 4) {
          const la = (A2[i] * 77 + A2[i + 1] * 150 + A2[i + 2] * 29) >> 8;
          const lb = (B2[i] * 77 + B2[i + 1] * 150 + B2[i + 2] * 29) >> 8;
          const dd = Math.abs(la - lb);
          acc += dd; n++;
          if (dd > worst) worst = dd;
        }
        return { mean: acc / n, worst };
      }, { da: A, db: B });
      results.push({ zoom: a.matchedZoom, inFrame: a.file, outFrame: b.file, meanAbsLuma: +r.mean.toFixed(3), maxAbsLuma: r.worst });
    }
    const means = results.map((r) => r.meanAbsLuma);
    pathDiff = {
      unit: 'mean |delta luma| 0-255, full resolution, 600 ms settle on both sides',
      pairs: results,
      mean: +(means.reduce((a, b) => a + b, 0) / means.length).toFixed(3),
      max: Math.max(...means),
    };
  }
}

// ---------------------------------------------------------------- contact sheet
const cols = Math.min(6, Math.max(1, Math.ceil(Math.sqrt(frameRecords.length))));
const THUMB = 260;
const THUMB_H = Math.round((THUMB * vh) / vw);
const rows = Math.ceil(frameRecords.length / cols);
const cells = frameRecords.map((f) => {
  const b64 = fs.readFileSync(path.join(framesDir, f.file)).toString('base64');
  const badge = [f.blank ? 'BLANK' : '', f.frozen ? 'FROZEN' : '', f.holeFail ? 'HOLE' : ''].filter(Boolean).join(' ');
  const label = `#${f.step < 0 ? 'start' : f.step}  z=${f.zoom.toFixed(3)}  ${f.phase}`;
  const bits = [`diff ${f.diffPct === null ? '-' : `${f.diffPct}%`}`, `bg ${(f.bgPct * 100).toFixed(0)}%`];
  if (f.pop !== null && f.pop !== undefined) bits.push(`pop ${f.pop}`);
  if (f.holes) bits.push(`holes ${f.holes.count}`);
  if (f.fiducialDriftPx !== undefined && f.fiducialDriftPx !== null) bits.push(`fid ${f.fiducialDriftPx}px`);
  const sub = bits.join(' &middot; ');
  return `<figure${badge ? ' class="bad"' : ''}><img src="data:image/png;base64,${b64}"><figcaption><b>${label}</b><br><span>${sub}</span>${badge ? `<br><em>${badge}</em>` : ''}</figcaption></figure>`;
}).join('\n');

const sheetHtml = `<!doctype html><meta charset="utf-8"><style>
 body{margin:0;background:#12151a;color:#e7ecf3;font:12px/1.35 ui-monospace,Consolas,monospace}
 h1{font:600 16px ui-monospace,monospace;margin:14px 16px 4px}
 h2{font:400 12px ui-monospace,monospace;margin:0 16px 12px;color:#8fa3bd}
 .grid{display:grid;grid-template-columns:repeat(${cols},${THUMB}px);gap:10px;padding:0 16px 16px}
 figure{margin:0;background:#1b212b;border:1px solid #2b3442;border-radius:5px;overflow:hidden}
 figure.bad{border-color:#e0574a}
 img{display:block;width:${THUMB}px;height:${THUMB_H}px;object-fit:contain;background:#000}
 figcaption{padding:5px 7px}
 figcaption span{color:#8fa3bd}
 figcaption em{color:#ff8b7d;font-style:normal;font-weight:700}
</style>
<h1>${slug} &middot; ${scenario} &middot; ${frameRecords.length} frames</h1>
<h2>${vw}x${vh} @${dpr}x &middot; steps ${steps} &middot; stride ${stride} &middot; wheel delta ${delta.toFixed(1)} &middot; throttle ${throttle}x &middot; zoom ${frameRecords[0] ? frameRecords[0].zoom : '?'} -&gt; ${endZoom.toFixed(3)}</h2>
<div class="grid">${cells}</div>`;

if (frameRecords.length) {
  const sheetPage = await context.newPage();
  await sheetPage.setViewportSize({
    width: cols * (THUMB + 10) + 32,
    height: Math.min(30000, rows * (THUMB_H + 72) + 90),
  });
  await sheetPage.setContent(sheetHtml);
  await sheetPage.waitForTimeout(200);
  await sheetPage.screenshot({ path: path.join(outDir, 'contact-sheet.png'), fullPage: true });
  await sheetPage.close();
}
await analysis.close();

// ---------------------------------------------------------------- report
const drifts = stepRecords.filter((s) => s.kind === 'wheel').map((s) => s.driftPx);
const panDrifts = stepRecords.filter((s) => s.kind === 'drag').map((s) => s.driftPx);
const maxDriftStep = stepRecords.reduce((acc, s) => (s.driftPx > (acc ? acc.driftPx : -1) ? s : acc), null);
const cumDrifts = stepRecords.map((s) => s.cumDriftPx).filter((v) => typeof v === 'number');
const maxCumStep = stepRecords.reduce((acc, s) => ((s.cumDriftPx ?? -1) > (acc ? (acc.cumDriftPx ?? -1) : -1) ? s : acc), null);

const popFrames = frameRecords.filter((f) => typeof f.pop === 'number');
const popSeries = popFrames.map((f) => f.pop);
const popMed = median(popSeries);
const popMaxFrame = popFrames.reduce((acc, f) => (f.pop > (acc ? acc.pop : -1) ? f : acc), null);

// ---------------------------------------------------------------- G3 crossing pop
// A level-based renderer only pops where it swaps level. Splitting the pop series into the
// frames whose zoom span straddles a declared crossing and the frames that do not turns "pop"
// from a camera-motion-dominated number into a level-swap number.
let crossingPop = null;
if (crossings) {
  const onC = [];
  const offC = [];
  for (let i = 1; i < frameRecords.length; i++) {
    const f = frameRecords[i];
    if (typeof f.pop !== 'number') continue;
    const prev = frameRecords[i - 1];
    const lo = Math.min(prev.zoom, f.zoom);
    const hi = Math.max(prev.zoom, f.zoom);
    const hit = crossings.filter((c) => c > lo && c <= hi);
    f.crossings = hit.length ? hit : undefined;
    (hit.length ? onC : offC).push(f.pop);
  }
  const offMed = median(offC);
  crossingPop = {
    unit: 'mean |delta luma| 0-255, same scale as pop',
    crossings,
    crossingFrames: onC.length,
    nonCrossingFrames: offC.length,
    crossingPopMax: onC.length ? +Math.max(...onC).toFixed(3) : null,
    crossingPopMean: onC.length ? +(onC.reduce((a, b) => a + b, 0) / onC.length).toFixed(3) : null,
    nonCrossingPopMedian: offMed === null ? null : +offMed.toFixed(3),
    ratio: (onC.length && offMed) ? +((onC.reduce((a, b) => a + b, 0) / onC.length) / offMed).toFixed(2) : null,
    note: 'primary G3 number for level-based renderers: ratio ~1 means a level swap is invisible against ordinary camera motion',
  };
}

// ---------------------------------------------------------------- jitter
let jitter = null;
if (scenario === 'jitter') {
  const jf = frameRecords.filter((f) => f.phase === 'jitter-in' || f.phase === 'jitter-out');
  const jp = jf.map((f) => f.pop).filter((v) => typeof v === 'number');
  const med = median(jp);
  const flipThreshold = med === null ? null : med * 3;
  const flips = flipThreshold === null ? [] : jf.filter((f) => typeof f.pop === 'number' && f.pop > flipThreshold);
  const levelSeries = stepRecords
    .filter((s) => s.phase === 'jitter-in' || s.phase === 'jitter-out')
    .map((s) => (s.metrics && s.metrics.level !== undefined ? s.metrics.level : null));
  jitter = {
    targetZoom: jitterTarget === null ? null : +jitterTarget.toFixed(6),
    targetSource: jitterZoomOpt !== null ? '--jitter-zoom' : (crossings ? '__lod.crossings[0]' : 'log midpoint of zoomRange'),
    notchDelta: jitterNotch,
    notches: jf.length,
    zoomSeries: jf.map((f) => f.zoom),
    popSeries: jp,
    popMax: jp.length ? +Math.max(...jp).toFixed(3) : null,
    popMedian: med === null ? null : +med.toFixed(3),
    flipThreshold: flipThreshold === null ? null : +flipThreshold.toFixed(3),
    flipCount: flips.length,
    flipFrames: flips.map((f) => ({ file: f.file, step: f.step, zoom: f.zoom, pop: f.pop })),
    frozenFrames: jf.filter((f) => f.frozen).length,
    levelSeries: levelSeries.some((v) => v !== null) ? levelSeries : null,
    levelFlips: levelSeries.some((v) => v !== null)
      ? levelSeries.reduce((acc, v, i) => acc + (i > 0 && v !== levelSeries[i - 1] ? 1 : 0), 0)
      : null,
    note: 'flipCount = jitter frames whose |delta luma| vs the previous frame exceeds 3x the jitter-series median',
  };
}

const fidFrames = frameRecords.filter((f) => typeof f.fiducialDriftPx === 'number');
const fidCum = frameRecords.map((f) => f.fiducialCumPx).filter((v) => typeof v === 'number');
const holeFrames = frameRecords.filter((f) => f.holes);

const ftStats = stats(frameTimes);
const report = {
  slug,
  scenario,
  generatedAt: new Date().toISOString(),
  config: {
    steps, stride, viewport: { width: vw, height: vh }, dpr, seed, query: extraQuery, url,
    wheelDelta: +delta.toFixed(2), cursor: cursorHome,
    timingOnly, throttle, fiducial: fiducialLive,
    wheelPattern,
    wheelPatternDetail: wheelPattern === 'human'
      ? { spec: 'bursts of 3-6 notches at 30-60 ms, separated by 150-400 ms pauses', deterministicFrom: `seed=${seed}`, bursts: wheelBursts }
      : { spec: 'uniform ~16 ms between notches' },
    jitterZoom: jitterTarget === null ? null : +jitterTarget.toFixed(6),
    crossings,
  },
  capabilities: caps,
  totals: {
    elapsedMs: totalMs,
    stepCount: stepRecords.length,
    frameCount: frameRecords.length,
    zoomStart: frameRecords[0] ? frameRecords[0].zoom : null,
    zoomEnd: +endZoom.toFixed(4),
  },
  timing: {
    ...ftStats,
    longTasks: longTasks.length,
    longTaskMs: +longTasks.reduce((a, b) => a + b.duration, 0).toFixed(2),
    throttle,
    note: timingOnly
      ? 'clean: no screenshots taken between steps (start/end only)'
      : 'contaminated by capture: a full-page screenshot runs between steps; use --timing-only for the real number',
  },
  anchorDrift: {
    unit: 'css px',
    wheelMax: drifts.length ? +Math.max(...drifts).toFixed(4) : null,
    wheelMean: drifts.length ? +(drifts.reduce((a, b) => a + b, 0) / drifts.length).toFixed(4) : null,
    panMax: panDrifts.length ? +Math.max(...panDrifts).toFixed(4) : null,
    cumulativeMax: cumDrifts.length ? +Math.max(...cumDrifts).toFixed(4) : null,
    cumulativeFinal: cumDrifts.length ? cumDrifts[cumDrifts.length - 1] : null,
    cumulativeWorstStep: maxCumStep ? { step: maxCumStep.step, kind: maxCumStep.kind, cumDriftPx: maxCumStep.cumDriftPx, zoom: maxCumStep.zoom } : null,
    worstStep: maxDriftStep ? { step: maxDriftStep.step, kind: maxDriftStep.kind, driftPx: maxDriftStep.driftPx, zoom: maxDriftStep.zoom } : null,
  },
  fiducialDrift: fiducialLive ? {
    unit: 'css px, measured from the rendered magenta marker (pixel domain)',
    frames: fidFrames.length,
    missingFrames: frameRecords.length - fidFrames.length,
    max: fidFrames.length ? +Math.max(...fidFrames.map((f) => f.fiducialDriftPx)).toFixed(2) : null,
    mean: fidFrames.length ? +(fidFrames.reduce((a, f) => a + f.fiducialDriftPx, 0) / fidFrames.length).toFixed(2) : null,
    cumulativeMax: fidCum.length ? +Math.max(...fidCum).toFixed(2) : null,
    cumulativeFinal: fidCum.length ? fidCum[fidCum.length - 1] : null,
    note: 'drift = |measured marker centroid - screenOf(fiducialWorld)|; cumulative = marker motion in the cursor frame vs the start frame',
  } : null,
  holes: holeFrames.length ? {
    unit: 'css px^2, background-coloured connected components inside __lod.footprint()',
    framesChecked: holeFrames.length,
    failFrames: frameRecords.filter((f) => f.holeFail).length,
    maxCount: Math.max(...holeFrames.map((f) => f.holes.count)),
    largestArea: Math.max(...holeFrames.map((f) => f.holes.largestArea)),
    worst: holeFrames.reduce((acc, f) => (f.holes.largestArea > (acc ? acc.holes.largestArea : -1) ? f : acc), null)
      ? (() => { const w = holeFrames.reduce((acc, f) => (f.holes.largestArea > (acc ? acc.holes.largestArea : -1) ? f : acc), null); return { file: w.file, step: w.step, zoom: w.zoom, ...w.holes }; })()
      : null,
    failThreshold: 'bbox >= 8x8 css px',
  } : null,
  pop: popSeries.length ? {
    unit: 'mean |delta luma| 0-255 between consecutive CAPTURED frames, full resolution',
    series: popSeries,
    median: popMed === null ? null : +popMed.toFixed(3),
    max: +Math.max(...popSeries).toFixed(3),
    maxStep: popMaxFrame ? popMaxFrame.step : null,
    maxOverMedian: popMed ? +(Math.max(...popSeries) / popMed).toFixed(2) : null,
    note: `camera motion contributes to every sample; only meaningful at --stride 1 and only spike-vs-spike on the SAME trace (steps=${steps}, stride=${stride}, delta=${delta.toFixed(1)})`,
  } : null,
  crossingPop,
  jitter,
  pathDiff,
  frameTime: ftStats,
  drawTime: stats(drawTimes),
  longTasks: { count: longTasks.length, totalMs: +longTasks.reduce((a, b) => a + b.duration, 0).toFixed(2), entries: longTasks.slice(0, 20) },
  frames: {
    blankCount: frameRecords.filter((f) => f.blank).length,
    frozenCount: frameRecords.filter((f) => f.frozen).length,
    holeFailCount: frameRecords.filter((f) => f.holeFail).length,
    maxJumpPct: maxJump ? maxJump.diffPct : null,
    maxJumpAtStep: maxJump ? maxJump.step : null,
    list: frameRecords,
  },
  customMetrics: finalMetrics,
  pageErrors,
  steps: stepRecords,
};
fs.writeFileSync(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);

const ft = report.frameTime;
const md = `# ${slug} - ${scenario}${timingOnly ? ' (timing-only)' : ''}

${report.generatedAt} | ${vw}x${vh} @${dpr}x | ${steps} steps | stride ${stride} | wheel delta ${report.config.wheelDelta} | throttle ${throttle}x | seed ${seed}

| metric | value |
|---|---|
| zoom traversed | ${report.totals.zoomStart} -> ${report.totals.zoomEnd} |
| wall clock | ${totalMs} ms over ${stepRecords.length} steps |
| anchor drift (wheel) | max **${report.anchorDrift.wheelMax} px**, mean ${report.anchorDrift.wheelMean} px |
| anchor drift (cumulative) | max **${report.anchorDrift.cumulativeMax} px**, final ${report.anchorDrift.cumulativeFinal} px |
| anchor drift (pan) | ${report.anchorDrift.panMax === null ? 'n/a' : `max ${report.anchorDrift.panMax} px`} |
| fiducial drift (pixels) | ${report.fiducialDrift ? `max **${report.fiducialDrift.max} px**, mean ${report.fiducialDrift.mean}, cum max ${report.fiducialDrift.cumulativeMax} (${report.fiducialDrift.frames} frames, ${report.fiducialDrift.missingFrames} missing)` : 'off (--fiducial)'} |
| holes in footprint | ${report.holes ? `max ${report.holes.maxCount} per frame, largest ${report.holes.largestArea} px2, ${report.holes.failFrames} frame(s) over 8x8` : 'n/a (no __lod.footprint())'} |
| pop (mean abs luma) | ${report.pop ? `median ${report.pop.median}, max ${report.pop.max} at step ${report.pop.maxStep}, max/median ${report.pop.maxOverMedian}x` : 'n/a'} |
| crossing pop (G3) | ${crossingPop ? `max **${crossingPop.crossingPopMax}**, mean ${crossingPop.crossingPopMean} over ${crossingPop.crossingFrames} crossing frame(s); non-crossing median ${crossingPop.nonCrossingPopMedian}; ratio **${crossingPop.ratio}x**` : 'n/a (page exposes no __lod.crossings)'} |
| jitter | ${jitter ? `target z=${jitter.targetZoom} (${jitter.targetSource}), ${jitter.notches} notches, pop median ${jitter.popMedian} / max ${jitter.popMax}, **flipCount ${jitter.flipCount}**, frozen ${jitter.frozenFrames}, levels ${jitter.levelSeries ? `[${jitter.levelSeries.join(',')}] (${jitter.levelFlips} changes)` : 'n/a (metrics() exposes no level)'}` : 'n/a (--scenario jitter only)'} |
| path diff (G4) | ${pathDiff ? `mean ${pathDiff.mean}, max ${pathDiff.max} over ${pathDiff.pairs.length} matched zooms` : 'n/a (zoom-in-out only)'} |
| wheel cadence | ${wheelPattern}${wheelPattern === 'human' ? ` (bursts ${wheelBursts.join('/')} @30-60 ms, 150-400 ms pauses, seed ${seed})` : ' (~16 ms between notches)'} |
| frame time | mean ${ft.mean} ms, p50 ${ft.p50}, p95 ${ft.p95}, max ${ft.max} (n=${ft.count}) |
| frame-time provenance | ${report.timing.note} |
| dropped frames | ${ft.over33} > 33 ms, ${ft.over50} > 50 ms |
| draw time | mean ${report.drawTime.mean} ms, p95 ${report.drawTime.p95}, max ${report.drawTime.max} |
| long tasks | ${report.longTasks.count} (${report.longTasks.totalMs} ms total) |
| blank frames | ${report.frames.blankCount} / ${frameRecords.length} |
| frozen frames | ${report.frames.frozenCount} / ${frameRecords.length} |
| biggest frame-to-frame jump | ${report.frames.maxJumpPct}% of sampled pixels (step ${report.frames.maxJumpAtStep}) |
| page errors | ${pageErrors.length ? pageErrors.join('; ') : 'none'} |

Custom metrics at end of run: \`${JSON.stringify(finalMetrics)}\`

Artifacts: \`frames/\` (${frameRecords.length} png), \`contact-sheet.png\`, \`report.json\`.

${report.anchorDrift.wheelMax !== null && report.anchorDrift.wheelMax < 0.5 && (report.anchorDrift.cumulativeMax ?? 0) < 1 ? '**Anchor (self-reported): PASS** - content under the cursor stays under the cursor.' : '**Anchor (self-reported): CHECK** - cursor-anchored zoom is drifting; see `steps[].driftPx`.'}
${report.fiducialDrift ? (report.fiducialDrift.max !== null && report.fiducialDrift.max < 2 ? '**Anchor (pixel domain): PASS** - the rendered marker sits where the spike claims.' : '**Anchor (pixel domain): FAIL** - the spike\'s transform disagrees with its own pixels.') : ''}
${report.frames.blankCount === 0 ? '**Never blank: PASS**' : '**Never blank: FAIL** - see the flagged frames in the contact sheet.'}
${report.holes ? (report.holes.failFrames === 0 ? '**No holes: PASS** - nothing background-coloured bigger than 8x8 inside the world footprint.' : `**No holes: FAIL** - ${report.holes.failFrames} frame(s) show a hole inside the footprint.`) : ''}
`;
fs.writeFileSync(path.join(outDir, 'report.md'), md);

console.log(md);
console.log(`[capture] wrote ${path.relative(process.cwd(), outDir)}`);

if (hold) {
  console.log('[capture] --hold: browser stays open, close the window to exit.');
  await page.waitForEvent('close', { timeout: 0 });
}
await browser.close();

#!/usr/bin/env node
/**
 * spikes/lod/h14-display-pyramid/edit-probe.mjs
 *
 *   node spikes/lod/h14-display-pyramid/edit-probe.mjs [--viewport WxH] [--query k=v]
 *
 * Measures what an EDIT costs a disposable display pyramid:
 *   1. warm the pyramid at a given zoom until pendingTiles == 0
 *   2. __lod.paint() into the finest authored doc under a point
 *   3. count invalidated tiles, and time until the screen is consistent again
 *   4. prove the settled screen is PIXEL-IDENTICAL to a from-scratch rebuild
 *
 * Writes out/edit-probe.json. Uses ?probe=1 so the spike turns on willReadFrequently.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const val = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const [vw, vh] = String(val('viewport', '1600x1000')).split('x').map(Number);
const extra = String(val('query', 'genBudgetMs=4&fade=150'));

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
const page = await context.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(`file://${path.join(HERE, 'index.html').replace(/\\/g, '/')}?probe=1&${extra}`);
await page.waitForFunction(() => !!window.__lod && !!window.__lod.ready, null, { timeout: 15000 });
await page.evaluate(() => window.__lod.ready);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = async (budgetMs = 8000) => page.evaluate(async (budget) => {
  const t0 = performance.now();
  let frames = 0;
  // wait until two consecutive frames report pendingTiles === 0
  let clean = 0;
  while (performance.now() - t0 < budget) {
    await new Promise((r) => requestAnimationFrame(r));
    frames++;
    clean = window.__lod.metrics().pendingTiles === 0 ? clean + 1 : 0;
    if (clean >= 2) break;
  }
  return { ms: +(performance.now() - t0).toFixed(1), frames };
}, budgetMs);

const results = [];
// Three cases. Each paints a DIFFERENT cell or a DIFFERENT colour, because repainting a
// cell with the colour it already has is a no-op and would read as "the edit is invisible".
//   centre  -> the depth-0 root cell under the screen centre
//   fiducial-> the FINEST authored cell (depth 2, inside `grand`) under the fiducial anchor
const CASES = [
  { zoom: 1, anchor: 'centre', color: '#ff0000' },
  { zoom: 8, anchor: 'fiducial', color: '#00ff00' },
  { zoom: 64, anchor: 'fiducial', color: '#0000ff' },
];
for (const cse of CASES) {
  const anchor = await page.evaluate((a) => (a === 'fiducial'
    ? { x: window.innerWidth * 0.32, y: window.innerHeight * 0.38 }
    : { x: window.innerWidth / 2, y: window.innerHeight / 2 }), cse.anchor);
  await page.evaluate(([zz, ax, ay]) => { window.__lod.reset(); window.__lod.setZoom(zz, ax, ay); },
    [cse.zoom, anchor.x, anchor.y]);
  const warm = await settle();
  await sleep(400);                       // let the arrival fade finish
  const target = await page.evaluate(([ax, ay]) => window.__lod.worldAt(ax, ay), [anchor.x, anchor.y]);
  const before = await page.evaluate(([x, y]) => window.__lod.pick(x, y), [target.x, target.y]);
  if (!before) { results.push({ ...cse, skipped: 'no authored cell under anchor' }); continue; }

  await page.evaluate(() => window.__lod.markRef());        // snapshot the pre-edit screen
  const edit = await page.evaluate(([x, y, col]) => window.__lod.paint(x, y, col), [target.x, target.y, cse.color]);
  const repair = await settle();
  await sleep(400);                                          // fade completes
  const editVisible = await page.evaluate(() => window.__lod.diffRef());

  // ---- eventual equality: throw the whole pyramid away and rebuild it from scratch
  await page.evaluate(() => window.__lod.markRef());
  const mBefore = await page.evaluate(() => window.__lod.metrics());
  await page.evaluate(() => window.__lod.rebuildAll());
  const rebuild = await settle();
  await sleep(400);
  const vsRebuild = await page.evaluate(() => window.__lod.diffRef());
  const mAfter = await page.evaluate(() => window.__lod.metrics());

  results.push({
    zoom: cse.zoom, anchor: cse.anchor, color: cse.color,
    warmMs: warm.ms, warmFrames: warm.frames,
    cellDepth: before.depth, cellDoc: before.docId, cellQR: [before.q, before.r],
    cellColourBefore: edit.before,
    tilesCachedAtEdit: edit.cachedTiles,
    tilesInvalidated: edit.invalidated,
    invalidatedLevels: edit.levels,
    invalidateScanMs: edit.invalidateMs,
    repairMs: repair.ms, repairFrames: repair.frames,
    dirtyLeftAfterRepair: mBefore.dirtyTiles,
    editVisible,                       // pre-edit screen vs post-edit settled screen
    vsRebuild,                         // post-edit settled vs from-scratch rebuild: MUST be ~0
    rebuildMs: rebuild.ms,
    tilesRasterisedDuringRebuild: mAfter.tilesRasterised - mBefore.tilesRasterised,
    neededTiles: mAfter.neededTiles,
  });
  console.log(JSON.stringify(results[results.length - 1]));
}

const out = { viewport: [vw, vh], query: extra, config: await page.evaluate(() => window.__lod.config()), results, pageErrors: errs };
fs.mkdirSync(path.join(HERE, 'out'), { recursive: true });
fs.writeFileSync(path.join(HERE, 'out', 'edit-probe.json'), JSON.stringify(out, null, 2));
console.log('[edit-probe] wrote out/edit-probe.json', errs.length ? `ERRORS: ${errs.join(' | ')}` : '');
await browser.close();

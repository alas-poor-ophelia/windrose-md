#!/usr/bin/env node
/**
 * G4 probe for the hysteresis band the rig's matched-zoom ladder happens to step over.
 *
 * capture.mjs picks 6 geometric matched-zoom targets; on this trace none of them lands
 * inside [0.8*ceiling, ceiling] = [3.2, 4.0], which is exactly where a hysteretic swap's
 * path dependence lives. This drives the spike's OWN wheel handler to reach the same zoom
 * from below and from above and diffs the two frames.
 *
 *   node spikes/lod/h0-polished-swap/hysteresis-probe.mjs [swap=hard|crossfade|animated]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const variant = process.argv[2] ?? 'hard';
const VW = 1600;
const VH = 1000;
const CURSOR = { x: Math.round(VW * 0.32), y: Math.round(VH * 0.38) };
const PROBE_ZOOMS = [3.3, 3.5, 3.7, 3.9];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
const page = await context.newPage();
const url = 'file://' + path.join(HERE, 'index.html').replace(/\\/g, '/') + `?scenario=probe&seed=1&swap=${variant}`;
await page.goto(url);
await page.evaluate(() => window.__lod.ready);
await page.mouse.move(CURSOR.x, CURSOR.y);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const state = () => page.evaluate(() => ({ z: window.__lod.getZoom(), m: window.__lod.metrics() }));

/** drive the spike's real wheel handler until zoom passes `target` in direction `dir` */
async function wheelTo(target, dir) {
  for (let i = 0; i < 400; i++) {
    const { z } = await state();
    if (dir === 'in' ? z >= target : z <= target) return z;
    await page.mouse.wheel(0, dir === 'in' ? -40 : 40);
    await frame();
  }
  return (await state()).z;
}

async function shot(tag) {
  const buf = await page.screenshot({ type: 'png' });
  fs.writeFileSync(path.join(HERE, 'out', `probe-${variant}-${tag}.png`), buf);
  return buf;
}

// pixel diff through a second page (same trick capture.mjs uses)
const decoder = await context.newPage();
await decoder.goto('about:blank');
async function meanAbsLuma(a, b) {
  return decoder.evaluate(async ([da, db]) => {
    const load = (d) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = d; });
    const [ia, ib] = await Promise.all([load(da), load(db)]);
    const c = document.createElement('canvas');
    c.width = ia.width; c.height = ia.height;
    const x = c.getContext('2d');
    x.drawImage(ia, 0, 0);
    const A = x.getImageData(0, 0, c.width, c.height).data;
    x.clearRect(0, 0, c.width, c.height);
    x.drawImage(ib, 0, 0);
    const B = x.getImageData(0, 0, c.width, c.height).data;
    let sum = 0; let n = 0; let max = 0;
    for (let i = 0; i < A.length; i += 4) {
      const la = 0.299 * A[i] + 0.587 * A[i + 1] + 0.114 * A[i + 2];
      const lb = 0.299 * B[i] + 0.587 * B[i + 1] + 0.114 * B[i + 2];
      const d = Math.abs(la - lb);
      sum += d; n++; if (d > max) max = d;
    }
    return { mean: +(sum / n).toFixed(4), max: +max.toFixed(1) };
  }, [`data:image/png;base64,${a.toString('base64')}`, `data:image/png;base64,${b.toString('base64')}`]);
}

fs.mkdirSync(path.join(HERE, 'out'), { recursive: true });
const rows = [];
for (const target of PROBE_ZOOMS) {
  // ---- from BELOW: reset, wheel up to just under the target, snap with setZoom
  await page.evaluate(() => window.__lod.reset());
  await frame();
  await wheelTo(target, 'in');
  await page.evaluate(([z, x, y]) => window.__lod.setZoom(z, x, y), [target, CURSOR.x, CURSOR.y]);
  await sleep(700); await frame();
  const below = await state();
  const imgBelow = await shot(`z${target}-below`);

  // ---- from ABOVE: same start, wheel past the ceiling into the child, then back down
  await page.evaluate(() => window.__lod.reset());
  await frame();
  await wheelTo(6, 'in');
  await sleep(700);
  await wheelTo(target, 'out');
  await page.evaluate(([z, x, y]) => window.__lod.setZoom(z, x, y), [target, CURSOR.x, CURSOR.y]);
  await sleep(700); await frame();
  const above = await state();
  const imgAbove = await shot(`z${target}-above`);

  const diff = await meanAbsLuma(imgBelow, imgAbove);
  rows.push({
    zoom: target,
    fromBelow: { zoom: +below.z.toFixed(4), doc: below.m.activeDoc, depth: below.m.activeDepth, alpha: below.m.blendAlpha },
    fromAbove: { zoom: +above.z.toFixed(4), doc: above.m.activeDoc, depth: above.m.activeDepth, alpha: above.m.blendAlpha },
    meanAbsLuma: diff.mean,
    maxAbsLuma: diff.max,
  });
  console.log(JSON.stringify(rows[rows.length - 1]));
}

fs.writeFileSync(path.join(HERE, 'out', `hysteresis-probe-${variant}.json`), JSON.stringify({ variant, viewport: `${VW}x${VH}`, cursor: CURSOR, rows }, null, 2));
await browser.close();

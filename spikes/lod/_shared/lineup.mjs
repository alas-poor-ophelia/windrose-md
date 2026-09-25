#!/usr/bin/env node
/**
 * spikes/lod/_shared/lineup.mjs
 *
 *   node spikes/lod/_shared/lineup.mjs <slug> --zooms 0.5,2,8 --variants "a=1,a=2,a=3"
 *                                      [--viewport WxH] [--dpr 1|2] [--anchor cx,cy]
 *                                      [--settle MS] [--out name] [--seed S]
 *
 * -> spikes/lod/<slug>/out/lineup-<name>.png
 *
 * A labelled grid of SETTLED stills: one row per variant (a query string appended to the
 * spike's URL), one column per zoom. Each cell is `__lod.setZoom(z, ax, ay)` followed by a
 * settle wait, so every cell shows the spike's crisp, post-settle output at a known zoom.
 *
 * This is the visual-calibration tool: when a treatment is rejected twice, render the
 * candidates side by side and let a human point at the one that is right, instead of
 * nudging pixels blind across successive deploys.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOD_ROOT = path.resolve(HERE, '..');

const VALUE_FLAGS = ['zooms', 'variants', 'viewport', 'dpr', 'anchor', 'out', 'settle', 'seed', 'scenario', 'cell'];
const argv = process.argv.slice(2);
const opts = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const name = a.slice(2);
    if (VALUE_FLAGS.includes(name)) opts[name] = argv[++i];
    else opts[name] = true;
  } else positional.push(a);
}

const slug = positional[0];
if (!slug) {
  console.error('usage: node spikes/lod/_shared/lineup.mjs <slug> --zooms 0.5,2,8 --variants "a=1,a=2" [--viewport WxH] [--dpr N] [--anchor cx,cy] [--settle MS] [--out name]');
  process.exit(2);
}

const zooms = String(opts.zooms ?? '0.5,2,8').split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
// --variants takes comma-separated query strings; use ';' inside one variant for multiple keys
const variants = String(opts.variants ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const variantList = variants.length ? variants : [''];
const [vw, vh] = String(opts.viewport ?? '1280x800').split('x').map(Number);
const dpr = Number(opts.dpr ?? 1);
const settle = Number(opts.settle ?? 600);
const seed = String(opts.seed ?? '1');
const scenario = String(opts.scenario ?? 'settle');
const outName = String(opts.out ?? 'default');
const anchor = opts.anchor
  ? String(opts.anchor).split(',').map(Number)
  : [Math.round(vw * 0.32), Math.round(vh * 0.38)];

const spikeDir = path.join(LOD_ROOT, slug);
const indexHtml = path.join(spikeDir, 'index.html');
if (!fs.existsSync(indexHtml)) { console.error(`[lineup] missing ${indexHtml}`); process.exit(2); }
if (!fs.existsSync(path.join(spikeDir, 'dist', 'bundle.js'))) {
  console.error(`[lineup] missing dist/bundle.js - run build.mjs ${slug} first`);
  process.exit(2);
}
const outDir = path.join(spikeDir, 'out');
fs.mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr });

const shots = []; // [variantIndex][zoomIndex] -> base64 png
const errors = [];

for (const variant of variantList) {
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${variant || 'base'}: ${String(e).split('\n')[0]}`));
  const q = `?scenario=${encodeURIComponent(scenario)}&seed=${encodeURIComponent(seed)}${variant ? `&${variant.replace(/;/g, '&').replace(/^[?&]/, '')}` : ''}`;
  await page.goto(`file://${indexHtml.replace(/\\/g, '/')}${q}`);
  await page.waitForFunction(() => !!window.__lod && !!window.__lod.ready, null, { timeout: 15000 });
  await page.evaluate(() => window.__lod.ready);
  await page.mouse.move(anchor[0], anchor[1]);

  const row = [];
  for (const z of zooms) {
    await page.evaluate(([zz, ax, ay]) => {
      if (typeof window.__lod.reset === 'function') window.__lod.reset();
      window.__lod.setZoom(zz, ax, ay);
    }, [z, anchor[0], anchor[1]]);
    await sleep(settle);
    const actual = await page.evaluate(() => window.__lod.getZoom());
    const metrics = await page.evaluate(() => (window.__lod.metrics ? window.__lod.metrics() : {}));
    const buf = await page.screenshot({ type: 'png' });
    row.push({ zoom: z, actual: +actual.toFixed(3), metrics, b64: buf.toString('base64') });
    console.log(`[lineup] ${variant || 'base'} @ z=${z} -> ${actual.toFixed(3)}`);
  }
  shots.push({ variant: variant || 'base', row });
  await page.close();
}

// ---------------------------------------------------------------- compose the grid
const CELL_W = Number(opts.cell ?? 340);
const CELL_H = Math.round((CELL_W * vh) / vw);
const LABEL_W = 150;

const head = zooms.map((z) => `<div class="hd">zoom ${z}</div>`).join('');
const body = shots.map((s) => {
  const cells = s.row.map((c) => {
    const m = Object.entries(c.metrics).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(' · ');
    const warn = Math.abs(c.actual - c.zoom) > 1e-3 ? ` <em>clamped -&gt; ${c.actual}</em>` : '';
    return `<figure><img src="data:image/png;base64,${c.b64}"><figcaption>z=${c.actual}${warn}<br><span>${m}</span></figcaption></figure>`;
  }).join('');
  return `<div class="rowlabel">${s.variant}</div>${cells}`;
}).join('');

const html = `<!doctype html><meta charset="utf-8"><style>
 body{margin:0;background:#12151a;color:#e7ecf3;font:12px/1.35 ui-monospace,Consolas,monospace}
 h1{font:600 16px ui-monospace,monospace;margin:14px 16px 2px}
 h2{font:400 12px ui-monospace,monospace;margin:0 16px 12px;color:#8fa3bd}
 .grid{display:grid;grid-template-columns:${LABEL_W}px repeat(${zooms.length},${CELL_W}px);gap:8px;padding:0 16px 16px;align-items:start}
 .hd{font-weight:700;color:#9fd0ff;padding:4px 0}
 .rowlabel{font-weight:700;color:#ffd79a;padding:6px 4px;word-break:break-all}
 figure{margin:0;background:#1b212b;border:1px solid #2b3442;border-radius:5px;overflow:hidden}
 img{display:block;width:${CELL_W}px;height:${CELL_H}px;object-fit:contain;background:#000}
 figcaption{padding:5px 7px}
 figcaption span{color:#8fa3bd}
 figcaption em{color:#ffb27d;font-style:normal}
</style>
<h1>${slug} &middot; lineup "${outName}" &middot; ${variantList.length} variant(s) x ${zooms.length} zoom(s)</h1>
<h2>${vw}x${vh} @${dpr}x &middot; anchor ${anchor[0]},${anchor[1]} &middot; settle ${settle} ms &middot; seed ${seed}${errors.length ? ` &middot; ERRORS: ${errors.join('; ')}` : ''}</h2>
<div class="grid"><div></div>${head}${body}</div>`;

const sheet = await context.newPage();
await sheet.setViewportSize({
  width: LABEL_W + zooms.length * (CELL_W + 8) + 40,
  height: Math.min(30000, shots.length * (CELL_H + 60) + 110),
});
await sheet.setContent(html);
await sheet.waitForTimeout(200);
const outFile = path.join(outDir, `lineup-${outName}.png`);
await sheet.screenshot({ path: outFile, fullPage: true });
await sheet.close();
await browser.close();

const json = shots.map((s) => ({ variant: s.variant, cells: s.row.map(({ zoom, actual, metrics }) => ({ zoom, actual, metrics })) }));
fs.writeFileSync(path.join(outDir, `lineup-${outName}.json`), `${JSON.stringify({ slug, zooms, variants: variantList, anchor, settle, dpr, viewport: { width: vw, height: vh }, errors, grid: json }, null, 2)}\n`);

console.log(`[lineup] wrote ${path.relative(process.cwd(), outFile)}`);
if (errors.length) console.log(`[lineup] page errors: ${errors.join('; ')}`);

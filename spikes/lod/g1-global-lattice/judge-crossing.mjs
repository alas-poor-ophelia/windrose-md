import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = 'C:/Dev/windrose/spikes/lod/g1-global-lattice/out/judge';
const INDEX = 'C:/Dev/windrose/spikes/lod/g1-global-lattice/index.html';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const shots = [];
for (const [ladder, lattice, mc, zs, tag] of [
  [4, 'district', 14, [1.3400, 1.4400], 'm4-district'],
  [2, 'district', 40, [1.3400, 1.4400], 'm2-district-mc40'],
  [4, 'one', 40, [1.3400, 1.4400], 'm4-one-mc40'],
  [2, 'one', 40, [3.8000, 4.2000], 'm2-one-mc40'],
]) {
  const page = await ctx.newPage();
  await page.goto(`file://${INDEX}?ladder=${ladder}&lattice=${lattice}&minCellPx=${mc}&look=siblings&zmin=0.62`);
  await page.evaluate(() => window.__lod.ready);
  for (const z of zs) {
    await page.evaluate((zz) => window.__lod.setZoom(zz, 800, 500), z);
    await page.waitForTimeout(650);
    const m = await page.evaluate(() => window.__lod.metrics());
    const f = `${OUT}/y-${tag}-z${z}.png`;
    await page.screenshot({ path: f });
    shots.push([`m=${ladder} ${lattice} minCellPx=${mc} z=${z} -> L${m.level}`, f]);
    console.log(tag, 'z', z, 'level', m.level);
  }
  await page.close();
}
// compose
const data = shots.map(([l, p]) => [l, fs.readFileSync(p).toString('base64')]);
const page = await ctx.newPage();
await page.setViewportSize({ width: 1240, height: 1580 });
await page.goto('about:blank');
await page.evaluate(async (items) => {
  const CW = 600, CH = 360, SX = 520, SY = 320;
  document.body.style.cssText = 'margin:0;background:#11151c;font:12px monospace;color:#cfe';
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:600px 600px;gap:8px;padding:8px';
  document.body.appendChild(grid);
  for (const [label, b64] of items) {
    const wrap = document.createElement('div');
    const img = new Image();
    await new Promise((r) => { img.onload = r; img.src = 'data:image/png;base64,' + b64; });
    const c = document.createElement('canvas'); c.width = CW; c.height = CH;
    c.getContext('2d').drawImage(img, SX, SY, CW, CH, 0, 0, CW, CH);
    const cap = document.createElement('div'); cap.textContent = label; cap.style.padding = '3px 0';
    wrap.appendChild(cap); wrap.appendChild(c); grid.appendChild(wrap);
  }
}, data);
await page.screenshot({ path: `${OUT}/district-crops.png`, fullPage: true });
await browser.close();

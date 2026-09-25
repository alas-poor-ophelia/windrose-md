import { chromium } from 'playwright';
import fs from 'node:fs';
const O = 'C:/Dev/windrose/spikes/lod/g1-global-lattice/out';
const picks = [
  ['erase-town BEFORE (17 authored cells)', `${O}/erase-town-1-before.png`, 1600, 1000],
  ['erase-town AFTER (inherits forest; label stranded)', `${O}/erase-town-2-after.png`, 1600, 1000],
  ['edit-empty BEFORE (inherited field, L?)', `${O}/edit-empty-1-before.png`, 1600, 1000],
  ['edit-empty PAINTED (one cell)', `${O}/edit-empty-2-painted.png`, 1600, 1000],
  ['judge: l5 newrung paint, coarse BEFORE', `${O}/judge/l5-newrung-1-coarse-before.png`, 900, 600],
  ['judge: l5 newrung paint, coarse AFTER (paint gone)', `${O}/judge/l5-newrung-3-coarse-after.png`, 900, 600],
];
const data = picks.map(([l, p, w, h]) => [l, fs.readFileSync(p).toString('base64'), w, h]);
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1240, height: 1250 }, deviceScaleFactor: 1 })).newPage();
await page.goto('about:blank');
await page.evaluate(async (items) => {
  document.body.style.cssText = 'margin:0;background:#11151c;font:12px monospace;color:#cfe';
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:600px 600px;gap:8px;padding:8px';
  document.body.appendChild(grid);
  for (const [label, b64, w, h] of items) {
    const CW = 600, CH = 380;
    const sx = Math.max(0, (w - CW * (w / 1600)) / 2), sw = Math.min(w, CW * (w / 1600) * 1.4), sh = sw * CH / CW;
    const wrap = document.createElement('div');
    const img = new Image();
    await new Promise((r) => { img.onload = r; img.src = 'data:image/png;base64,' + b64; });
    const c = document.createElement('canvas'); c.width = CW; c.height = CH;
    c.getContext('2d').drawImage(img, (w - sw) / 2, (h - sh) / 2, sw, sh, 0, 0, CW, CH);
    const cap = document.createElement('div'); cap.textContent = label; cap.style.padding = '3px 0';
    wrap.appendChild(cap); wrap.appendChild(c); grid.appendChild(wrap);
  }
}, data);
await page.screenshot({ path: `${O}/judge/edit-crops.png`, fullPage: true });
await browser.close(); console.log('ok');

import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = 'C:/Dev/windrose/spikes/lod/g1-global-lattice/out/judge';
fs.mkdirSync(OUT, { recursive: true });
const B = 'C:/Dev/windrose/spikes/lod/g1-global-lattice/out';
const picks = [
  ['zoom-in step4 z=1.1049 (pre-crossing)', `${B}/zio-l13-one/frames/005.png`],
  ['zoom-in step5 z=1.1804 (post-crossing)', `${B}/zio-l13-one/frames/006.png`],
  ['jitter l13 ONE notch a', `${B}/jit-l13-h0/frames/010.png`],
  ['jitter l13 ONE notch b', `${B}/jit-l13-h0/frames/011.png`],
  ['jitter l13 FADE notch a', `${B}/jit-l13-fade/frames/010.png`],
  ['jitter l13 FADE notch b', `${B}/jit-l13-fade/frames/011.png`],
];
const data = picks.map(([l, p]) => [l, fs.readFileSync(p).toString('base64')]);
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1240, height: 1180 }, deviceScaleFactor: 1 })).newPage();
await page.goto('about:blank');
await page.evaluate(async (items) => {
  const CW = 600, CH = 360, SX = 520, SY = 320; // crop window from each 1600x1000 frame
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
await page.screenshot({ path: `${OUT}/crops.png`, fullPage: true });
await browser.close();
console.log('ok');

import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = 'C:/Dev/windrose/spikes/lod/g1-global-lattice/out/judge';
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
await page.goto('about:blank');
async function diff(a, b) {
  const A = fs.readFileSync(`${OUT}/${a}`).toString('base64');
  const B = fs.readFileSync(`${OUT}/${b}`).toString('base64');
  return page.evaluate(async ([a64, b64]) => {
    const load = (d) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = 'data:image/png;base64,' + d; });
    const [ia, ib] = await Promise.all([load(a64), load(b64)]);
    const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(ia, 0, 0); const da = x.getImageData(0, 0, c.width, c.height).data;
    x.clearRect(0, 0, c.width, c.height); x.drawImage(ib, 0, 0); const db = x.getImageData(0, 0, c.width, c.height).data;
    let changed = 0, sum = 0, maxd = 0, minx = 1e9, miny = 1e9, maxx = -1, maxy = -1;
    for (let i = 0, p = 0; i < da.length; i += 4, p++) {
      const d = Math.abs(da[i] - db[i]) + Math.abs(da[i+1] - db[i+1]) + Math.abs(da[i+2] - db[i+2]);
      sum += d / 3; if (d > maxd) maxd = d;
      if (d > 24) { changed++; const px = p % c.width, py = (p / c.width) | 0;
        if (px < minx) minx = px; if (py < miny) miny = py; if (px > maxx) maxx = px; if (py > maxy) maxy = py; }
    }
    return { w: c.width, h: c.height, changedPx: changed, pct: +(100 * changed / (c.width * c.height)).toFixed(4),
      meanAbs: +(sum / (c.width * c.height)).toFixed(4), maxAbs: maxd, bbox: maxx < 0 ? null : [minx, miny, maxx, maxy] };
  }, [A, B]);
}
for (const tag of ['l5-newrung', 'l13-newrung', 'l13-control-existing-rung']) {
  const coarse = await diff(`${tag}-1-coarse-before.png`, `${tag}-3-coarse-after.png`);
  console.log(`${tag}  COARSE before-vs-after:`, JSON.stringify(coarse));
}
await browser.close();

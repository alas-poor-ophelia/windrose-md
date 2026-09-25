import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
const INDEX = 'C:/Dev/windrose/spikes/lod/g1-global-lattice/index.html';
const OUT = 'C:/Dev/windrose/spikes/lod/g1-global-lattice/out/judge';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 1 });
async function run(ladder, paintZoom, coarseZoom, tag) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  await page.goto(`file://${INDEX}?ladder=${ladder}&lattice=one&look=empty&zmin=0.62`);
  await page.evaluate(() => window.__lod.ready);
  await page.evaluate((z) => window.__lod.setZoom(z, 450, 300), paintZoom);
  await page.waitForTimeout(600);
  const m0 = await page.evaluate(() => ({ m: window.__lod.metrics(), w: window.__lod.worldAt(450, 300), s: window.__lod.stats() }));
  // baseline at the coarse zoom, BEFORE painting
  await page.evaluate((z) => window.__lod.setZoom(z, 450, 300), coarseZoom);
  await page.waitForTimeout(600);
  const mC = await page.evaluate(() => window.__lod.metrics());
  await page.screenshot({ path: path.join(OUT, `${tag}-1-coarse-before.png`) });
  // go back, paint at the fine level
  await page.evaluate((z) => window.__lod.setZoom(z, 450, 300), paintZoom);
  await page.waitForTimeout(600);
  const painted = await page.evaluate(([x, y]) => window.__lod.paint(x, y, '#e8462f'), [m0.w.x, m0.w.y]);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, `${tag}-2-fine-painted.png`) });
  // back out to the coarse level
  await page.evaluate((z) => window.__lod.setZoom(z, 450, 300), coarseZoom);
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, `${tag}-3-coarse-after.png`) });
  console.log(tag, 'ladder', ladder, '| paintLevel', m0.m.level, '| coarseLevel', mC.level,
    '| authoredPerLevel', JSON.stringify(m0.s.authoredPerLevel), '| painted', JSON.stringify(painted));
  await page.close();
}
// ladder 5: at z=1 active level is 1, which starts EMPTY. zoom out to 0.3 -> level 0.
await run(5, 1.0, 0.3, 'l5-newrung');
// ladder 13: paint at level 3 (z >= 192.24), zoom out to level 2.
await run(13, 260, 20, 'l13-newrung');
// control on ladder 13: paint at level 1 (z=2, already authored), zoom out to level 0 (z=0.8)
await run(13, 2.0, 0.8, 'l13-control-existing-rung');
await browser.close();

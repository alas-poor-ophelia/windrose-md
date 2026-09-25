/**
 * spikes/lod/g1-global-lattice/finer-probe.mjs
 *
 * Two questions, one run, on the NEW defaults (ladder 4, minCellPx 40, district, finer=none):
 *
 *  A. THE BUG. Paint a cell on a level that held NO authored cells at load, zoom OUT two
 *     crossings, zoom back IN to the same level, and check the cell is still painted —
 *     both in the model (authoredPerLevel / authoredLevels) and in the PIXELS at the spot.
 *     The old code froze the "levels that hold authored content" list at load, so a new
 *     rung was invisible to the finer-levels pass forever after.
 *  B. THE RULE. With ?finer=all the same painted cell must show as a speck when zoomed out
 *     (proving the level list is live), and with ?finer=none it must NOT (the slippy rule).
 *
 * Run: node spikes/lod/g1-global-lattice/finer-probe.mjs
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INDEX = path.join(HERE, 'index.html').replace(/\\/g, '/');
const OUT = path.join(HERE, 'out');
fs.mkdirSync(OUT, { recursive: true });

const AX = 800;
const AY = 500;
const PAINT_Z = 20;    // ladder 4, minCellPx 40 -> crossings at 1, 4, 16, 64, 256: this is L3
const OUT_Z = 2;       // two crossings coarser -> L1
const COLOUR = '#e8462f';

const px = (p) => p.evaluate(([x, y]) => {
  const c = document.getElementById('stage');
  const d = c.getContext('2d').getImageData(x, y, 1, 1).data;
  return [d[0], d[1], d[2]];
}, [AX, AY]);
const isOrange = ([r, g, b]) => r > 180 && g > 40 && g < 110 && b < 80;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const rows = [];

for (const finer of ['none', 'all']) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  await page.goto(`file://${INDEX}?look=empty&zmin=0.62&finer=${finer}`);
  await page.evaluate(() => window.__lod.ready);

  const s0 = await page.evaluate(() => window.__lod.stats());
  await page.evaluate(([z, x, y]) => window.__lod.setZoom(z, x, y), [PAINT_Z, AX, AY]);
  await page.waitForTimeout(600);
  const m0 = await page.evaluate(([x, y]) => ({ m: window.__lod.metrics(), w: window.__lod.worldAt(x, y) }), [AX, AY]);
  const emptyAtLoad = (s0.authoredPerLevel[m0.m.level] ?? 0) === 0;

  const painted = await page.evaluate(([x, y, c]) => window.__lod.paint(x, y, c), [m0.w.x, m0.w.y, COLOUR]);
  await page.waitForTimeout(600);
  const afterPaint = await px(page);
  await page.screenshot({ path: path.join(OUT, `finer-${finer}-1-painted-L${m0.m.level}.png`) });

  // zoom out two crossings
  await page.evaluate(([z, x, y]) => window.__lod.setZoom(z, x, y), [OUT_Z, AX, AY]);
  await page.waitForTimeout(700);
  const mOut = await page.evaluate(() => window.__lod.metrics());
  const atCoarse = await px(page);
  await page.screenshot({ path: path.join(OUT, `finer-${finer}-2-zoomed-out-L${mOut.level}.png`) });

  // and back in
  await page.evaluate(([z, x, y]) => window.__lod.setZoom(z, x, y), [PAINT_Z, AX, AY]);
  await page.waitForTimeout(700);
  const mBack = await page.evaluate(() => window.__lod.metrics());
  const backIn = await px(page);
  const s1 = await page.evaluate(() => window.__lod.stats());
  await page.screenshot({ path: path.join(OUT, `finer-${finer}-3-back-in-L${mBack.level}.png`) });

  rows.push({
    finer,
    paintLevel: m0.m.level, emptyAtLoad, painted,
    coarseLevel: mOut.level, backLevel: mBack.level,
    authoredLevelsAtLoad: s0.authoredLevels, authoredLevelsAfter: s1.authoredLevels,
    pixelAfterPaint: afterPaint, pixelAtCoarse: atCoarse, pixelBackIn: backIn,
    survivesRoundTrip: isOrange(afterPaint) && isOrange(backIn),
    visibleWhenZoomedOut: isOrange(atCoarse),
  });
  await page.close();
}
await browser.close();

fs.writeFileSync(path.join(OUT, 'finer-probe.json'), JSON.stringify(rows, null, 2));
for (const r of rows) {
  console.log(`finer=${r.finer}  paint L${r.paintLevel} (empty at load: ${r.emptyAtLoad})  ` +
    `levels ${JSON.stringify(r.authoredLevelsAtLoad)} -> ${JSON.stringify(r.authoredLevelsAfter)}`);
  console.log(`   painted ${JSON.stringify(r.pixelAfterPaint)} | out@L${r.coarseLevel} ${JSON.stringify(r.pixelAtCoarse)} ` +
    `| back@L${r.backLevel} ${JSON.stringify(r.pixelBackIn)}`);
  console.log(`   survivesRoundTrip=${r.survivesRoundTrip}  visibleWhenZoomedOut=${r.visibleWhenZoomedOut}`);
}

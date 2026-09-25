/**
 * spikes/lod/g1-global-lattice/probe.mjs
 *
 * Two jobs:
 *   node probe.mjs stats            -> dump __lod.stats() for ladders 13/5/3 (both seat rules)
 *   node probe.mjs edit             -> scripted paint/erase with before/after stills
 *
 * Run from the repo root:  node spikes/lod/g1-global-lattice/probe.mjs stats
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INDEX = path.join(HERE, 'index.html').replace(/\\/g, '/');
const OUT = path.join(HERE, 'out');
fs.mkdirSync(OUT, { recursive: true });
const mode = process.argv[2] ?? 'stats';

const open = async (ctx, query) => {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  await page.goto(`file://${INDEX}?${query}`);
  await page.evaluate(() => window.__lod.ready);
  return page;
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });

if (mode === 'stats') {
  const rows = [];
  for (const seat of ['nearest', 'finer']) {
    for (const m of [13, 5, 3]) {
      const page = await open(ctx, `ladder=${m}&seat=${seat}&zmin=0.62`);
      const s = await page.evaluate(() => window.__lod.stats());
      rows.push({ seat, m, ...s });
      await page.close();
    }
  }
  fs.writeFileSync(path.join(OUT, 'stats.json'), JSON.stringify(rows, null, 2));
  for (const r of rows) {
    console.log(`seat=${r.seat} m=${r.m}  seatOfDepth=[${r.seatOfDepth}]  maxLevel=${r.maxLevel}`);
    console.log(`   authoredPerLevel=[${r.authoredPerLevel}]`);
    console.log(`   crossings=[${r.crossings.map((c) => +c.toFixed(3)).join(', ')}]`);
    for (const st of r.seatStats) {
      console.log(`   depth ${st.depth} -> L${st.level}: ${st.cells} lattice cells from ${st.distinctSrc}/${st.srcTotal} authored fixture cells (${(100 * st.distinctSrc / st.srcTotal).toFixed(1)}% preserved)`);
    }
  }
}

if (mode === 'edit') {
  // Park over the empty root hex so the paint lands on an INHERITED cell, then over the
  // authored siblings so the erase reveals the inherited parent again.
  for (const [tag, look, z] of [['empty', 'empty', 9], ['siblings', 'siblings', 40]]) {
    const page = await open(ctx, `ladder=13&lattice=one&look=${look}&zmin=0.62`);
    await page.evaluate((zz) => window.__lod.setZoom(zz, 800, 500), z);
    await page.waitForTimeout(700);
    const before = await page.evaluate(() => ({
      m: window.__lod.metrics(),
      w: window.__lod.worldAt(800, 500),
    }));
    await page.screenshot({ path: path.join(OUT, `edit-${tag}-1-before.png`) });

    const painted = await page.evaluate(([x, y]) => window.__lod.paint(x, y, '#e8462f'), [before.w.x, before.w.y]);
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(OUT, `edit-${tag}-2-painted.png`) });

    const erased = await page.evaluate(([x, y]) => window.__lod.erase(x, y), [before.w.x, before.w.y]);
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(OUT, `edit-${tag}-3-erased.png`) });

    // erase an ORIGINALLY AUTHORED cell (siblings only) to prove inherit-again
    let erasedAuthored = null;
    if (look === 'siblings') {
      erasedAuthored = await page.evaluate(([x, y]) => window.__lod.erase(x, y), [before.w.x, before.w.y]);
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(OUT, `edit-${tag}-4-erased-authored.png`) });
    }
    console.log(tag, 'level', before.m.level, 'painted', painted, 'erased', erased, 'erasedAuthored', erasedAuthored);
    await page.close();
  }
}

await browser.close();

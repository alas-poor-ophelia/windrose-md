import { chromium } from 'playwright';
const INDEX = 'C:/Dev/windrose/spikes/lod/g1-global-lattice/index.html';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
for (const m of [2, 4, 7, 13, 5, 3]) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('[pageerror]', m, e.message));
  await page.goto(`file://${INDEX}?ladder=${m}&seat=nearest&zmin=0.62`);
  await page.evaluate(() => window.__lod.ready);
  const s = await page.evaluate(() => window.__lod.stats());
  const cr = s.crossings.filter((c) => c >= 0.1 && c <= 900);
  console.log(`m=${m} seatOfDepth=[${s.seatOfDepth}] maxLevel=${s.maxLevel} authored=[${s.authoredPerLevel}] crossingsInRange=${cr.length} first=[${cr.slice(0,4).map(c=>+c.toFixed(3))}]`);
  for (const st of s.seatStats) {
    const pct = (100 * st.distinctSrc / st.srcTotal).toFixed(1);
    console.log(`   depth ${st.depth} -> L${st.level} (rung ${m ** st.level}): ${st.cells} lattice cells, ${st.distinctSrc}/${st.srcTotal} src preserved = ${pct}%`);
  }
  await page.close();
}
await browser.close();

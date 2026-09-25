/**
 * spikes/lod/g1-global-lattice/orient-probe.mjs
 *
 *   node spikes/lod/g1-global-lattice/orient-probe.mjs
 *
 * Runs __lod.orientProbe() + __lod.stats() for the four orientation x shape combos and
 * writes out/orient-probe.json. The probe is the spike's proof that:
 *   - every level's axial->world transform IS the plugin's HexGeometry formula at 80/m^L,
 *   - the (m,0) generator is a pure scale (finer levels keep the orientation, no rotation),
 *   - a level-L hex outline is the root outline scaled by 1/m^L, corner for corner,
 *   - the level-0 cell set is exactly what the plugin enumerates for that shape.
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INDEX = path.join(HERE, 'index.html').replace(/\\/g, '/');
const OUT = path.join(HERE, 'out');
fs.mkdirSync(OUT, { recursive: true });

const COMBOS = [
  'orient=flat&shape=radial',
  'orient=flat&shape=rect&cols=24&rows=16',
  'orient=pointy&shape=radial',
  'orient=pointy&shape=rect&cols=24&rows=16',
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const rows = [];
let bad = 0;

for (const q of COMBOS) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { console.error('[pageerror]', q, e.message); bad++; });
  await page.goto(`file://${INDEX}?${q}&zmin=0.62`);
  await page.evaluate(() => window.__lod.ready);
  const probe = await page.evaluate(() => window.__lod.orientProbe());
  const stats = await page.evaluate(() => window.__lod.stats());
  rows.push({ query: q, probe, stats });
  const ok = probe.centreVsPlugin < 1e-9 && probe.pureScale < 1e-9
    && probe.outlineScale < 1e-9 && probe.parentInverts
    && probe.rootCellsMissing === 0 && probe.rootCellsMine === probe.expectedRootCells;
  if (!ok) bad++;
  console.log(`${q}`);
  console.log(`   centreVsPlugin ${probe.centreVsPlugin}  pureScale ${probe.pureScale}  outlineScale ${probe.outlineScale}`);
  console.log(`   parentInverts ${probe.parentInverts}  cornerPhase ${probe.cornerPhaseDeg} deg  footprint pts ${probe.footprintPoints}`);
  console.log(`   root cells mine ${probe.rootCellsMine} / plugin ${probe.rootCellsPlugin} / expected ${probe.expectedRootCells}  missing ${probe.rootCellsMissing}`);
  console.log(`   seatOfDepth [${stats.seatOfDepth}]  authoredPerLevel [${stats.authoredPerLevel}]  childAt ${JSON.stringify(stats.childAt)}`);
  console.log(`   ${ok ? 'PASS' : 'FAIL'}`);
  await page.close();
}

fs.writeFileSync(path.join(OUT, 'orient-probe.json'), `${JSON.stringify(rows, null, 2)}\n`);
await browser.close();
console.log(bad === 0 ? '\nALL FOUR COMBOS PASS' : `\n${bad} PROBLEM(S)`);
process.exit(bad === 0 ? 0 : 1);

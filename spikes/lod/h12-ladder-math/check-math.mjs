import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const tmp = path.join(HERE, 'dist', 'lattice.cjs');
fs.mkdirSync(path.dirname(tmp), { recursive: true });
await build({
  entryPoints: [path.join(HERE, 'lattice.ts')],
  bundle: true, format: 'cjs', platform: 'node', outfile: tmp, logLevel: 'warning',
});
const m = await import(pathToFileURL(tmp).href);
const out = {};
for (const key of ['ring7s15','m3','m5','m6','m13','a7']) {
  const L = m.buildLadder(m.LADDERS[key]);
  out[key] = {
    K: L.K, m: +L.m.toFixed(6), rotDeg: +L.thetaDeg.toFixed(6),
    childSize: +L.childSize.toFixed(5),
    asserts: m.assertLadder(L),
    containment: (() => { const c = m.measureContainment(L, 1001); return {
      parentUncoveredPct: +c.parentUncoveredPct.toFixed(3),
      childOutsidePct: +c.childOutsidePct.toFixed(3),
      areaRatio: +c.areaRatio.toFixed(5) }; })(),
    boundary: (() => { const b = m.measureBoundary(L, 240); return {
      meanPx: b.meanPx, maxPx: b.maxPx, meanPct: b.meanPctOfParentSize, maxPct: b.maxPctOfParentSize,
      perEdgePx: b.perEdgeMeanPx, segments: b.segments }; })(),
  };
}
out.reseat = m.measureReseat();
console.log(JSON.stringify(out, null, 2));

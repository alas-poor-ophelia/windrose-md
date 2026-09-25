#!/usr/bin/env node
/**
 * spikes/lod/_shared/write-fixture.mjs
 *
 *   node spikes/lod/_shared/write-fixture.mjs
 *
 * Bundles fixture.ts to a temp CJS file, runs it, and writes
 *   spikes/lod/_shared/fixture.json   — a real Windrose MapData with subHexMaps nesting
 *   spikes/lod/_shared/fixture.stats.json — cells per depth + key world points
 *
 * fixture.json is importable into the plugin (schemaVersion 2, mapType hex).
 */
import esbuild from 'esbuild';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');

const typesAlias = {
  name: 'windrose-types-alias',
  setup(b) {
    b.onResolve({ filter: /^#types(\/|$)/ }, (a) => {
      const sub = a.path === '#types' ? 'index' : a.path.slice('#types/'.length);
      return { path: path.resolve(REPO, 'types', `${sub}.ts`) };
    });
  },
};

const tmp = path.join(HERE, '.fixture.build.cjs');

await esbuild.build({
  entryPoints: [path.join(HERE, 'fixture.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  outfile: tmp,
  plugins: [typesAlias],
  nodePaths: [path.join(REPO, 'node_modules')],
  logLevel: 'warning',
});

const require = createRequire(import.meta.url);
const mod = require(tmp);

const fx = mod.buildFixture(1);

const errs = mod.checkMath(fx);
if (errs.length) {
  console.error('[fixture] MATH CHECK FAILED:');
  for (const e of errs) console.error('  - ' + e);
  fs.rmSync(tmp, { force: true });
  process.exit(1);
}

const mapData = mod.toMapData(fx);

const perDepth = {};
const perDoc = {};
for (const d of fx.docs) {
  perDepth[d.depth] = (perDepth[d.depth] ?? 0) + d.cells.size;
  const terrains = {};
  for (const c of d.cells.values()) terrains[c.terrain] = (terrains[c.terrain] ?? 0) + 1;
  perDoc[d.id] = {
    depth: d.depth,
    parentId: d.parentId,
    parentHex: d.parentHex,
    rings: d.rings,
    cells: d.cells.size,
    transformToWorld: d.transformToWorld,
    terrains,
  };
}

const stats = {
  seed: fx.seed,
  hexSize: mod.HEX_SIZE,
  orientation: mod.ORIENTATION,
  childScale: mod.CHILD_SCALE,
  cellsAcross: mod.CELLS_ACROSS,
  docs: fx.docs.length,
  cellsTotal: fx.docs.reduce((n, d) => n + d.cells.size, 0),
  cellsPerDepth: perDepth,
  perDoc,
  fiducial: fx.fiducial,
  secret: fx.secret,
  labels: fx.labels,
  roadPoints: fx.roads[0].points,
  worldRadius: fx.worldRadius,
  sampleResolves: [
    { at: [0, 0], hit: mod.coarseColorAt(fx, 0, 0) },
    { at: [fx.fiducial.x, fx.fiducial.y], hit: mod.coarseColorAt(fx, fx.fiducial.x, fx.fiducial.y) },
    { at: [fx.fiducial.x, fx.fiducial.y], maxDepth: 0, hit: mod.coarseColorAt(fx, fx.fiducial.x, fx.fiducial.y, 0) },
    { at: [-1100, 0], hit: mod.coarseColorAt(fx, -1100, 0) },
  ],
};

fs.writeFileSync(path.join(HERE, 'fixture.json'), JSON.stringify(mapData, null, 1));
fs.writeFileSync(path.join(HERE, 'fixture.stats.json'), JSON.stringify(stats, null, 2));
fs.rmSync(tmp, { force: true });

const bytes = fs.statSync(path.join(HERE, 'fixture.json')).size;
console.log(`[fixture] docs=${stats.docs} cells=${stats.cellsTotal} perDepth=${JSON.stringify(perDepth)}`);
console.log(`[fixture] fixture.json ${(bytes / 1024).toFixed(1)} KiB  |  fiducial ${fx.fiducial.x.toFixed(3)},${fx.fiducial.y.toFixed(3)}`);

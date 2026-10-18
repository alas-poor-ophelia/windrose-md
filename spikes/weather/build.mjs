#!/usr/bin/env node
/**
 * spikes/weather/build.mjs
 *
 * Bundle a weather spike:  node spikes/weather/build.mjs <slug>
 *
 * Input :  spikes/weather/<slug>/main.ts
 * Output:  spikes/weather/<slug>/dist/bundle.js   (iife, inline sourcemap, unminified)
 *
 * Same shape as spikes/lod/_shared/build.mjs, plus Preact's automatic JSX so
 * a spike can mount real overlay components from src/ (only ones that never
 * import `obsidian`).
 */
import esbuild from 'esbuild';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');

const slug = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!slug) {
  console.error('usage: node spikes/weather/build.mjs <slug>');
  process.exit(2);
}

const spikeDir = path.join(HERE, slug);
const entry = path.join(spikeDir, 'main.ts');
if (!fs.existsSync(entry)) {
  console.error(`[build] no entry point at ${entry}`);
  process.exit(2);
}

/** Resolve the repo's `#types/*` package-imports alias to types/*.ts */
const typesAlias = {
  name: 'windrose-types-alias',
  setup(b) {
    b.onResolve({ filter: /^#types(\/|$)/ }, (a) => {
      const sub = a.path === '#types' ? 'index' : a.path.slice('#types/'.length);
      return { path: path.resolve(REPO, 'types', `${sub}.ts`) };
    });
  },
};

const outfile = path.join(spikeDir, 'dist', 'bundle.js');
const t0 = Date.now();
await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  platform: 'browser',
  sourcemap: 'inline',
  minify: false,
  jsx: 'automatic',
  jsxImportSource: 'preact',
  logLevel: 'info',
  outfile,
  plugins: [typesAlias],
  nodePaths: [path.join(REPO, 'node_modules')],
  define: { 'process.env.NODE_ENV': '"development"' },
});
console.log(`[build] ${slug} -> dist/bundle.js  ${(fs.statSync(outfile).size / 1024).toFixed(1)} KiB in ${Date.now() - t0}ms`);

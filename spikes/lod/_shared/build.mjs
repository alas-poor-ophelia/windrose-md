#!/usr/bin/env node
/**
 * spikes/lod/_shared/build.mjs
 *
 * Bundle a LOD spike:  node spikes/lod/_shared/build.mjs <slug> [--watch]
 *
 * Input :  spikes/lod/<slug>/main.ts
 * Output:  spikes/lod/<slug>/dist/bundle.js   (iife, es2020, inline sourcemap, unminified)
 *
 * Nothing here touches src/ — spikes may *import* pure geometry from src, and the
 * `#types/*` subpath import used by those files is resolved by the alias plugin below
 * (type-only imports are erased by esbuild anyway; the plugin is belt-and-braces).
 */
import esbuild from 'esbuild';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOD_ROOT = path.resolve(HERE, '..');          // spikes/lod
const REPO = path.resolve(HERE, '..', '..', '..');  // repo root

const args = process.argv.slice(2);
const watch = args.includes('--watch');
const slug = args.find((a) => !a.startsWith('--'));

if (!slug) {
  console.error('usage: node spikes/lod/_shared/build.mjs <slug> [--watch]');
  process.exit(2);
}

const spikeDir = path.join(LOD_ROOT, slug);
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

const options = {
  entryPoints: [entry],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  platform: 'browser',
  sourcemap: 'inline',
  minify: false,
  treeShaking: true,
  logLevel: 'info',
  outfile: path.join(spikeDir, 'dist', 'bundle.js'),
  plugins: [typesAlias],
  nodePaths: [path.join(REPO, 'node_modules')],
  define: { 'process.env.NODE_ENV': '"development"' },
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log(`[build] watching ${slug}`);
} else {
  const t0 = Date.now();
  await esbuild.build(options);
  const bytes = fs.statSync(options.outfile).size;
  console.log(`[build] ${slug} -> dist/bundle.js  ${(bytes / 1024).toFixed(1)} KiB in ${Date.now() - t0}ms`);
}

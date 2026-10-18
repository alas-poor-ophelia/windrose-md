#!/usr/bin/env node
/**
 * spikes/weather/sky-demo/capture.mjs
 *
 *   node spikes/weather/sky-demo/capture.mjs [--frames 3] [--gap 300] [--warm 2000] [--query "?x=y"]
 *
 * Loads the built demo in headless chromium, lets it animate for --warm ms,
 * then writes --frames screenshots --gap ms apart to out/frame-N.png.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);
const frames = Number(opt('--frames', '3'));
const gap = Number(opt('--gap', '300'));
const warm = Number(opt('--warm', '2000'));
const query = opt('--query', '');
const prefix = opt('--prefix', 'frame');

const outDir = path.join(HERE, 'out');
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 860 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); else console.log('[page]', m.text()); });
  await page.goto(`file://${path.join(HERE, 'index.html').split(path.sep).join('/')}${query}`);
  await page.waitForFunction('window.__spikeReady === true', undefined, { timeout: 15000 });
  await page.waitForTimeout(warm);
  for (let i = 0; i < frames; i++) {
    if (i > 0) await page.waitForTimeout(gap);
    const f = path.join(outDir, `${prefix}-${i + 1}.png`);
    await page.screenshot({ path: f });
    console.log(`[capture] ${f}`);
  }
  console.log('[capture] stats', await page.evaluate('JSON.stringify(window.__skyStats)'));
  if (errors.length > 0) {
    console.error(`[capture] page errors:\n${errors.join('\n')}`);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}

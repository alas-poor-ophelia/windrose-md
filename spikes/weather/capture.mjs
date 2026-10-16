#!/usr/bin/env node
/**
 * spikes/weather/capture.mjs
 *
 * Screenshot a built weather spike in headless chromium:
 *   node spikes/weather/capture.mjs <slug> [--viewport 1740x760]
 *
 * Output: spikes/weather/<slug>/out/demo.png
 * The page is loaded over file:// (IIFE bundle), and signals it has drawn by
 * setting window.__spikeReady.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith('--'));
if (!slug) {
  console.error('usage: node spikes/weather/capture.mjs <slug> [--viewport WxH]');
  process.exit(2);
}
const viewportArg = args[args.indexOf('--viewport') + 1];
const [width, height] = (args.includes('--viewport') ? viewportArg : '1740x760').split('x').map(Number);

const spikeDir = path.join(HERE, slug);
const indexHtml = path.join(spikeDir, 'index.html');
const outDir = path.join(spikeDir, 'out');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`file://${indexHtml.replace(/\\/g, '/')}`);
  await page.waitForFunction('window.__spikeReady === true', undefined, { timeout: 15000 });
  const outFile = path.join(outDir, 'demo.png');
  await page.screenshot({ path: outFile });
  console.log(`[capture] ${outFile}`);
  if (errors.length > 0) {
    console.error(`[capture] page errors:\n${errors.join('\n')}`);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}

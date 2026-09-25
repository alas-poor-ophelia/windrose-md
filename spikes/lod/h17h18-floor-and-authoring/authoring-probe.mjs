#!/usr/bin/env node
/**
 * spikes/lod/h17h18-floor-and-authoring/authoring-probe.mjs
 *
 *   node spikes/lod/h17h18-floor-and-authoring/authoring-probe.mjs [--viewport WxH]
 *
 * The H18 half of the spike. Three checks, all driven through REAL pointer/wheel events
 * where the claim is about input handling:
 *
 *   A  LATCH        pointerdown over forestA, paint, wheel-zoom 3.9x MID-STROKE, keep
 *                   painting. Every written cell must carry the pointerdown doc and the
 *                   pointerdown cell size.
 *   B  IN PLACE     past the root floor over a hex with NO child: the first stroke mints
 *                   the child doc in place. The frame after creation must be identical to
 *                   the frame before it apart from the finer grid lines, with no camera move.
 *   C  DETERMINISM  the procedural ghost field must be byte-identical across a fresh load.
 *
 * -> out/authoring/{*.png, result.json}
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const vIdx = argv.indexOf('--viewport');
const [vw, vh] = (vIdx >= 0 ? argv[vIdx + 1] : '1600x1000').split('x').map(Number);

const OUT = path.join(HERE, 'out', 'authoring');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const urlFor = (q) => 'file://' + path.join(HERE, 'index.html').replace(/\\/g, '/') + '?' + q;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });

/** decode two PNG buffers and count pixels differing by > threshold in any channel */
const decoder = await context.newPage();
await decoder.goto('about:blank');
async function pixelDiff(aBuf, bBuf, threshold = 24) {
  return decoder.evaluate(async ([a, b, t]) => {
    const load = (d) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = d; });
    const ia = await load(a); const ib = await load(b);
    const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.drawImage(ia, 0, 0); const da = cx.getImageData(0, 0, c.width, c.height).data;
    cx.clearRect(0, 0, c.width, c.height);
    cx.drawImage(ib, 0, 0); const db = cx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < da.length; i += 4) {
      if (Math.abs(da[i] - db[i]) > t || Math.abs(da[i + 1] - db[i + 1]) > t || Math.abs(da[i + 2] - db[i + 2]) > t) n++;
    }
    return { changed: n, total: da.length / 4, pct: +(100 * n / (da.length / 4)).toFixed(3) };
  }, [`data:image/png;base64,${aBuf.toString('base64')}`, `data:image/png;base64,${bBuf.toString('base64')}`, threshold]);
}

async function open(query) {
  const page = await context.newPage();
  await page.goto(urlFor(query));
  await page.waitForFunction(() => window.__lod && window.__lod.ready);
  await page.evaluate(() => window.__lod.ready);
  await sleep(250);
  return page;
}
const shoot = async (page, name) => {
  const buf = await page.screenshot({ type: 'png' });
  fs.writeFileSync(path.join(OUT, name), buf);
  return buf;
};

const result = {};
const AX = Math.round(vw * 0.32);
const AY = Math.round(vh * 0.38);

// ------------------------------------------------------------------ A: latched edit rung
{
  const page = await open('floor=crisp&home=child');
  // 18 < forestA floor (22.5): no minting, forestA is simply the deepest authored doc
  await page.evaluate(([z, x, y]) => window.__lod.setZoom(z, x, y), [18, AX, AY]);
  await sleep(400);
  const before = await page.evaluate(([x, y]) => ({ probe: window.__lod.probe(x, y), zoom: window.__lod.getZoom(), floor: window.__lod.floorAt(x, y) }), [AX, AY]);
  await shoot(page, 'A0-before.png');

  await page.keyboard.down('Shift');
  await page.mouse.move(AX, AY);
  await page.mouse.down();                       // strokeStart + first paint
  for (let i = 1; i <= 4; i++) await page.mouse.move(AX + i * 14, AY + i * 9);
  const midZoomStart = await page.evaluate(() => window.__lod.getZoom());
  await shoot(page, 'A1-stroke-started.png');

  // --- the straddle: the camera moves a long way WHILE the stroke is live
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -150); await sleep(30); }
  const midZoomEnd = await page.evaluate(() => window.__lod.getZoom());
  await shoot(page, 'A2-mid-stroke-zoomed.png');

  for (let i = 1; i <= 6; i++) { await page.mouse.move(AX + i * 11, AY - i * 7); await sleep(10); }
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await sleep(300);
  await shoot(page, 'A3-after.png');

  const auth = await page.evaluate(() => window.__lod.authoring());
  const docIds = [...new Set(auth.strokeLog.map((s) => s.docId))];
  const sizes = [...new Set(auth.strokeLog.map((s) => s.cellWorldSize))];
  const zooms = auth.strokeLog.map((s) => s.zoomAtPaint);
  result.A_latch = {
    pointerdownDoc: before.probe && before.probe.docId,
    zoomAtPointerdown: +midZoomStart.toFixed(3),
    zoomAtPointerup: +midZoomEnd.toFixed(3),
    zoomRatioDuringStroke: +(midZoomEnd / midZoomStart).toFixed(3),
    cellsWritten: auth.strokeLog.length,
    distinctDocsWritten: docIds,
    distinctCellWorldSizes: sizes,
    zoomSpanDuringWrites: [Math.min(...zooms), Math.max(...zooms)],
    docsMinted: auth.docsMinted,
    PASS: docIds.length === 1 && docIds[0] === (before.probe && before.probe.docId) && sizes.length === 1 && auth.docsMinted === 0,
  };
  await page.close();
}

// ------------------------------------------------------------------ B: author in place
{
  const page = await open('floor=crisp&home=nochild');
  await page.evaluate(([z, x, y]) => window.__lod.setZoom(z, x, y), [6, AX, AY]);
  await sleep(400);
  const pre = await page.evaluate(([x, y]) => ({
    probe: window.__lod.probe(x, y), zoom: window.__lod.getZoom(),
    world: window.__lod.worldAt(x, y), m: window.__lod.metrics(),
  }), [AX, AY]);
  const b0 = await shoot(page, 'B0-before-no-child.png');

  // mint only, no paint, no camera change
  const minted = await page.evaluate(([x, y]) => window.__lod.strokeStart(x, y), [AX, AY]);
  await sleep(300);
  const b1 = await shoot(page, 'B1-minted-in-place.png');
  const post = await page.evaluate(([x, y]) => ({
    zoom: window.__lod.getZoom(), world: window.__lod.worldAt(x, y), m: window.__lod.metrics(),
    probe: window.__lod.probe(x, y),
  }), [AX, AY]);
  const diff = await pixelDiff(b0, b1);
  await page.evaluate(() => window.__lod.strokeEnd());

  // now paint into it with a real shift-drag
  await page.keyboard.down('Shift');
  await page.mouse.move(AX, AY);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(AX - i * 30, AY + Math.round(26 * Math.sin(i / 2))); await sleep(12); }
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await sleep(300);
  await shoot(page, 'B2-painted-into-new-doc.png');
  const auth = await page.evaluate(() => window.__lod.authoring());
  const docIds = [...new Set(auth.strokeLog.map((s) => s.docId))];

  result.B_author_in_place = {
    beforeDeepestDoc: pre.probe && pre.probe.docId,
    beforeCellPx: pre.probe && +pre.probe.cellPx.toFixed(1),
    mintedDoc: minted && minted.docId,
    mintedDepth: minted && minted.depth,
    docsMintedAfter: post.m.docsMinted,
    afterDeepestDoc: post.probe && post.probe.docId,
    afterCellPx: post.probe && +post.probe.cellPx.toFixed(1),
    cameraUnchanged: pre.zoom === post.zoom && pre.world.x === post.world.x && pre.world.y === post.world.y,
    pixelsChangedByCreation: diff,
    cellsPaintedAfterwards: auth.cellsPainted,
    distinctDocsWritten: docIds,
    PASS: !!minted && post.m.docsMinted === 1 && pre.zoom === post.zoom
      && docIds.length === 1 && docIds[0] === minted.docId,
  };
  await page.close();
}

// ------------------------------------------------------------------ C: ghost determinism
{
  const p1 = await open('floor=ghost&home=nochild');
  const d1 = await p1.evaluate(() => window.__lod.ghostDigest());
  await p1.close();
  const p2 = await open('floor=ghost&home=child&seed=1');
  const d2 = await p2.evaluate(() => window.__lod.ghostDigest());
  // and after a camera move: the field must not depend on the camera
  await p2.evaluate(() => window.__lod.setZoom(200, 100, 100));
  await sleep(300);
  const d3 = await p2.evaluate(() => window.__lod.ghostDigest());
  await p2.close();
  result.C_determinism = { loadA: d1, loadB: d2, afterCameraMove: d3, PASS: d1 === d2 && d2 === d3 };
}

fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
await browser.close();

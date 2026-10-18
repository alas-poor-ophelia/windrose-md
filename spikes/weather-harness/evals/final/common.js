// Shared prelude (concatenated before each final eval): error capture + helpers.
globalThis.__errs = globalThis.__errs ?? [];
if (!globalThis.__errHooked) {
  globalThis.__errHooked = true;
  const origErr = console.error.bind(console);
  console.error = (...a) => { __errs.push("console.error: " + a.map(x => (x && x.stack) ? x.stack : String(x)).join(" ").slice(0, 400)); origErr(...a); };
  window.addEventListener("error", e => __errs.push("onerror: " + (e.message || String(e.error)).slice(0, 400)));
  window.addEventListener("unhandledrejection", e => __errs.push("rejection: " + String(e.reason && e.reason.stack || e.reason).slice(0, 400)));
}
globalThis.wait = ms => new Promise(r => setTimeout(r, ms));
globalThis.shot = name => (window.__harnessShot ? window.__harnessShot(name) : Promise.resolve(null));
globalThis.skyOf = root => [...root.querySelectorAll("canvas.windrose-overlay-layer")].find(c => c.windroseSky);
globalThis.openFullPane = async (mapId) => {
  const leaf = app.workspace.getLeaf("tab");
  await leaf.setViewState({ type: "windrose-map-view", active: true, state: { mapId } });
  await app.workspace.revealLeaf(leaf);
  await wait(2500);
  for (const b of leaf.view.containerEl.querySelectorAll('button[aria-label*="Collapse"], button[aria-label="Objects — open"]')) b.click();
  await wait(2000);
  return leaf;
};
// Union of the Sky overlay's painted pixels over `ms`, and how many fog-looking main-canvas pixels it touches.
globalThis.skyVsFog = async (root, ms = 3000) => {
  const sky = skyOf(root);
  const main = root.querySelector(".windrose-canvas-wrapper canvas");
  if (!sky || !main) return { error: "no sky or main canvas" };
  const W = sky.width, H = sky.height;
  const union = new Uint8Array(W * H);
  const sctx = sky.getContext("2d", { willReadFrequently: true });
  const t0 = performance.now(); let samples = 0;
  while (performance.now() - t0 < ms) {
    const d = sctx.getImageData(0, 0, W, H).data;
    for (let i = 0, p = 0; p < W * H; p++, i += 4) if (d[i + 3] > 8) union[p] = 1;
    samples++; await wait(100);
  }
  const mctx = main.getContext("2d", { willReadFrequently: true });
  const md = mctx.getImageData(0, 0, main.width, main.height).data;
  const sx = main.width / W, sy = main.height / H;
  let fog = 0, fogUnderSky = 0, painted = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const mi = ((Math.floor(y * sy) * main.width) + Math.floor(x * sx)) * 4;
    const r = md[mi], g = md[mi + 1], b = md[mi + 2], a = md[mi + 3];
    const isFog = a > 200 && Math.max(r, g, b) < 60 && Math.max(r, g, b) - Math.min(r, g, b) < 14;
    if (isFog) { fog++; if (union[y * W + x]) fogUnderSky++; }
    if (union[y * W + x]) painted++;
  }
  return { size: [W, H], samples, skyPaintedPx: painted, fogPx: fog, fogPxTouchedBySky: fogUnderSky };
};

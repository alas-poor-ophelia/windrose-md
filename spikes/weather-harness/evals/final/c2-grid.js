(async () => {
  const leaf = await openFullPane("weather-grid-001");
  const root = leaf.view.containerEl;
  const sky = skyOf(root);
  const main = root.querySelector(".windrose-canvas-wrapper canvas");
  await shot("c2-grid-frame-1"); await wait(600); await shot("c2-grid-frame-2"); await wait(600); await shot("c2-grid-frame-3");
  if (!sky || !main) return { error: "no sky/main", errors: __errs };
  const W = sky.width, H = sky.height, union = new Uint8Array(W * H);
  const sctx = sky.getContext("2d", { willReadFrequently: true });
  for (let k = 0; k < 25; k++) { const d = sctx.getImageData(0, 0, W, H).data; for (let p = 0; p < W * H; p++) if (d[p * 4 + 3] > 8) union[p] = 1; await wait(100); }
  const md = main.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, main.width, main.height).data;
  const sx = main.width / W, sy = main.height / H;
  const bbox = () => ({ x0: 1e9, y0: 1e9, x1: -1, y1: -1 });
  const grow = (b, x, y) => { b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y); b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y); };
  const skyB = bbox(), cellB = bbox();
  let skyPx = 0, skyOnPainted = 0, skyOnFog = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const mi = (Math.floor(y * sy) * main.width + Math.floor(x * sx)) * 4;
    const r = md[mi], g = md[mi + 1], b = md[mi + 2];
    const gray = Math.abs(r - g) < 6 && Math.abs(g - b) < 6 && r >= 0x80 && r <= 0xb0;
    const fog = Math.max(r, g, b) < 60;
    if (gray) grow(cellB, x, y);
    if (union[y * W + x]) { skyPx++; grow(skyB, x, y); if (gray) skyOnPainted++; if (fog) skyOnFog++; }
  }
  return { skyStats: { ...sky.windroseSky }, skyPx, skyOnPaintedPx: skyOnPainted, skyOnFogPx: skyOnFog, skyBBox: skyB, paintedCellsBBox: cellB, now: app.plugins.plugins.wadjet.api.now()?.dayOrdinal, errors: __errs };
})()

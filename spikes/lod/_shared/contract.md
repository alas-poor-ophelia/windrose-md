# LOD spike contract

Every spike under `spikes/lod/<slug>/` must satisfy this so `capture.mjs` can measure it.
`_template/` is a working reference implementation — copy it.

```
spikes/lod/<slug>/
  index.html      # loads dist/bundle.js, full-window canvas
  main.ts         # entry point (build.mjs bundles this)
  NOTES.md        # hypothesis / what was built / measurements / verdict
  dist/           # gitignored, produced by build.mjs
  out/            # gitignored, produced by capture.mjs
```

## 1. `index.html`

- Loads exactly one script: `<script src="dist/bundle.js"></script>`.
  **Classic script, not `type="module"`** — chromium blocks ES modules over `file://`,
  and `build.mjs` emits an IIFE for this reason. The rig opens the page as `file://`;
  there is no dev server.
- Contains a full-window `<canvas id="stage">`, or a stack of canvases inside
  `<div id="stage-root">` if the spike layers levels.
- Sets a background colour on `body`. `capture.mjs` reads
  `getComputedStyle(document.body).backgroundColor` as its blank-frame reference,
  so if your canvas paints its own background, paint the *same* colour on `body`.
- Reads `?scenario=` / `?seed=` / anything else from `location.search` if it wants
  presets. The rig always appends `scenario` and `seed`, plus whatever `--query` supplies.

## 2. `window.__lod`

Set this as soon as the surface exists. All coordinates are **CSS px relative to the
viewport** (not device px, not canvas backing-store px).

```ts
window.__lod = {
  ready: Promise<void>,                  // REQUIRED. resolves after the first real frame
  worldAt(x, y): { x, y },               // REQUIRED. CSS px -> world
  screenOf(wx, wy): { x, y },            // REQUIRED. world -> CSS px (inverse of worldAt)
  getZoom(): number,                     // REQUIRED. current continuous zoom
  metrics(): object,                     // REQUIRED. custom counters, see below
  setZoom?(z, anchorX?, anchorY?): void, // strongly recommended — lets the rig park the view at
                                         // a known zoom. REQUIRED for lineup.mjs and the G4 check
  zoomRange?(): { min, max },            // strongly recommended — enables delta calibration
  reset?(): void,                        // restore the initial view

  // --- opt-in, but a spike that omits these can only ASSERT G1/G2, never evidence them
  fiducialWorld?: { x, y },              // world point the magenta marker is pinned to. Render a
                                         // 7x7 block of PURE #ff00ff at screenOf(it) when
                                         // `?fiducial=1` is in the URL, drawn LAST, unantialiased
  setFiducial?(wx, wy): void,            // lets the rig re-pin the marker onto its anchor point
  crossings?: number[],                  // zoom values where THIS renderer swaps level/lattice.
                                         // Declaring them turns on `crossingPop` (the G3 number
                                         // for level-based renderers) and makes `--scenario jitter`
                                         // park on crossings[0] instead of guessing
  footprint?(): { kind: 'polygon',       // CSS-px outline of the authored world for THIS view.
                  points: [{x, y}...] }  // Everything inside it must be painted.
};
```

### The fiducial (`?fiducial=1`, rig flag `--fiducial`)

```ts
if (FIDUCIAL) {
  const s = screenOf(fiducialWorld.x, fiducialWorld.y);
  ctx.fillStyle = '#ff00ff';
  ctx.fillRect(Math.round(s.x - 3.5), Math.round(s.y - 3.5), 7, 7); // snap: 0.5 px/axis floor
}
```

The rig finds the marker by scanning captured pixels (`r>200 && g<70 && b>200`) and compares its
centroid to `screenOf(fiducialWorld)`. **This is the only anchor check a spike cannot fake** —
per-step and cumulative drift are both computed from the spike's own `worldAt`/`screenOf`, so a
spike whose renderer disagrees with its own transform scores 0 on those and still looks wrong.
Measured on `_template`: honest render **max 0.71 px** (pure pixel-grid quantisation — that is the
noise floor); `?lie=9`, which offsets the renderer 9 px from the reported transform, keeps
self-reported drift at **0.0000 px** while fiducial drift reads **9.51 px**.

### The footprint (hole detection)

Return the outline of the authored world in CSS px for the current view. Inside that polygon the
rig runs connected-component analysis at **full resolution** over background-coloured pixels and
reports `holes: {count, largestArea, largestBBox, holeAreaPctOfFootprint}`; any component whose
bbox is >= 8x8 CSS px is fail-flagged (`HOLE` badge, `frames.holeFailCount`).

**Return a CONSERVATIVE polygon, not a literal convex hull, when the world boundary is not
convex.** A hex rosette's rim zigzags: a hull of the outer ring's *corners* spans the notches
between rim cells and reports ~150 phantom holes per frame. `_template` uses the hull of the outer
ring's *centres* — everything inside that is genuinely covered. Measured: clean `_template`
**largest 58 px2, 0 frames over 8x8**; `?holes=3` (a 19-cell gap punched out) **largest 26239 px2,
4 frames over 8x8**.

**Draw UI chrome OPAQUE.** `_template`'s HUD was `rgba(8,11,16,0.78)`; composited over the dark
hex stroke lines that lands within ±6 of the `#0b0e13` background and the detector correctly
called it a hole — 8 fail frames on an otherwise perfect render. Opaque `#161b24` HUD: 0 fail
frames, largest component 10.5 px2. Any translucent overlay drawn over the world must stay
distinguishable from the background colour, or exclude itself from `footprint()`.

`_template` carries three deliberate mis-calibration switches so these detectors can be proven
to bite rather than assumed to: `?fiducial=1`, `?holes=N` (punch an N-radius gap), and `?lie=N`
(render N px away from the reported transform). Drive them through `--query`.

`metrics()` returns whatever the spike wants to prove, e.g.
`{ levelsLive, cellsDrawn, cellsTotal, cacheHits, tilesRasterised, bytesCached }`.
It lands verbatim in `report.json` per step and at the end of the run.

**The spike owns its gestures.** Add your own `wheel` (with `preventDefault`) and
pointer-drag handlers on the canvas. The rig drives real `page.mouse.wheel` /
`mouse.down|move|up` so it exercises *your* input code, never a back door.
`setZoom` is only for parking the view between scenarios.

## 3. Frame instrumentation

```ts
import { startFrameClock } from '../_shared/instrument';
const clock = startFrameClock();          // starts recording rAF deltas into window.__lodFrames
function tick() { clock.beginDraw(); draw(); clock.endDraw(); requestAnimationFrame(tick); }
```

`capture.mjs` slices `window.__lodFrames` from the gesture start and derives
mean / p50 / p95 / max frame time, `>33ms` and `>50ms` counts, and separate draw-time
stats. Long tasks come from a `PerformanceObserver('longtask')` the rig installs itself
via `addInitScript`, so you get those for free.

## 4. How the rig measures "feel"

| Metric | How it is computed | Caveat |
|---|---|---|
| per-step anchor drift | `w = worldAt(cursor)` before a wheel step; `screenOf(w)` after; distance to cursor | algebraically 0 for any spike that anchors with the transform it exposes — a weak check |
| **cumulative anchor drift** | one world point sampled under the cursor at run start, re-projected after **every** step | the check that bites: catches rounding, level snapping, offset accumulation |
| blank frame | >95% of 128x96 sampled pixels within ±6 of the `body` background colour | a spike whose min zoom leaves the world tiny will false-positive; fill the frame |
| frozen frame | pixel-identical to the previous capture *while the zoom moved* | only compares captured frames, which are `--stride` steps apart |
| jump | % of sampled pixels changed by >24 in any channel vs the previous capture | also stride-apart, so large values are normal during an exponential zoom; compare *between spikes*, not against an absolute |
| **fiducial drift** (`--fiducial`) | magenta marker centroid, found by full-resolution pixel scan, vs `screenOf(fiducialWorld)` | the pixel-domain G2 check. 0.71 px is the quantisation floor, not a bug. `fiducialCumPx` is the marker's motion **in the cursor's frame of reference** vs the start frame; it only reads as drift because the rig re-pins the marker onto the cursor anchor *before* the start frame is shot |
| **holes** (`footprint()`) | full-res connected components of background-coloured pixels *inside* the footprint polygon | needs an honest, conservative footprint; the whole-frame blank check still runs alongside it |
| **pop** (`--stride 1`) | mean `abs(delta luma)` (0-255) between consecutive captured frames, full resolution | camera motion contributes to **every** sample — a smooth exponential zoom has a large nonzero baseline. Only `maxOverMedian`, and spike-vs-spike comparison **on the same trace** (same `--steps`/`--stride`/`--delta`), mean anything. `_template` zoom-in, 24 steps, stride 1: median 17.08, max 26.43, **max/median 1.55x**. That is the "no pop" reference; today's document swap is 10-50x |
| **crossingPop** (needs `__lod.crossings`) | every captured frame whose zoom span `[prevFrame.zoom, frame.zoom]` straddles a declared crossing is pooled separately from the rest. Reports `crossingPopMax`, `crossingPopMean`, `nonCrossingPopMedian` and `ratio = crossingPopMean / nonCrossingPopMedian` | **the primary G3 number for a level-based renderer**: raw `pop` is dominated by camera motion, this asks only "does the level swap cost more than ordinary motion". `ratio ≈ 1` = the swap is invisible; a document-swap-style flash reads far above. Reports `n/a` when the page declares no crossings. Measured on a `_template` clone with fake `crossings=[0.6,1,1.7,3]`, 16-step stride-1 zoom-in: crossing mean 20.20 vs non-crossing median 13.29, **ratio 1.52x** (the honest baseline — there is no real level there, only the fact that a crossing lands mid-gesture where motion is fastest) |
| **flipCount** (`jitter`) | jitter frames whose `pop` exceeds **3x the jitter-series median** | a hand-waggle across a threshold is where a snapping renderer flip-flops. `_template` (continuous, stateless): pop is *constant* across the waggle (the view alternates between exactly two zooms), **flipCount 0** |
| **pathDiff** (`zoom-in-out`) | 6 zoom values are crossed on the way in and again on the way out; at each the rig snaps exactly onto the target through the spike's own `setZoom`, waits 600 ms, and captures. Reports mean `abs(delta luma)` per matched pair | G4. Targets ladder up to the *predicted turnaround* zoom, not `max`, or every target above the apex is never crossed and its pair goes missing. `_template` (stateless re-render): **mean 0, max 0 over 6 pairs** — the correct answer for a spike with no hysteresis |

Screenshots are decoded in a second chromium page (`drawImage` + `getImageData` on a
`data:` URL, which does not taint the canvas) — no image-decoding dependency.

## 4b. Rig flags

| flag | what it does |
|---|---|
| `--timing-only` | drives the gesture with **no screenshots between steps** (start/end only), so `timing.*` is uncontaminated. Writes to `out/<scenario>-timing/`. Regular runs still report timing, labelled `contaminated by capture`. The per-step `page.evaluate` probes still run — they cost ~0.3 ms each, a screenshot costs ~40 ms |
| `--throttle N` | `Emulation.setCPUThrottlingRate(N)` over CDP before the gesture, reset to 1 after. **Renderer thread only** — the compositor/GPU thread is unaffected, so this models a slow main thread, not a slow device end to end |
| `--fiducial` | appends `fiducial=1` to the URL and enables the pixel-domain anchor check |
| `--stride 1` | required for the pop series to be readable |
| `--scenario jitter` | the gesture a human makes at a level boundary: wheel **in** to a target zoom, then alternate **single** notches out/in/out/in for `--steps` steps. Stride is forced to 1 (every frame captured). Reports `jitter.{popSeries,popMax,popMedian,flipCount,flipFrames,frozenFrames,zoomSeries,levelSeries,levelFlips}`. If `metrics()` exposes `level`, `levelSeries` prints it per notch, so a flip-flop reads literally as `1,2,1,2` |
| `--jitter-zoom Z` | the zoom to park on. Default: `__lod.crossings[0]` if the page declares crossings, else the **log midpoint** of `zoomRange()` |
| `--delta N` (with `jitter`) | the size of a single waggle notch. Default `-100`, a *real* wheel notch — **not** the calibrated per-step delta, which is sized to traverse the whole range in `--steps` and would be far too coarse to waggle. The approach leg still uses the calibrated delta, for speed |
| `--wheel-pattern uniform\|human` | `uniform` (default) spaces notches ~16 ms apart. `human` replays a recorded-feeling cadence: **bursts of 3-6 notches at 30-60 ms, separated by 150-400 ms pauses**, deterministic from `--seed`. The pattern actually used lands in `report.json` at `config.wheelPattern` / `config.wheelPatternDetail.bursts`. Note the ~40 ms screenshot between steps is *additive* to the gap, so a capture run cannot show the cadence at its true floor — pair with `--timing-only` when the cadence itself is the subject |

Measured on `_template`, 48-step zoom-in, 1280x800:

| run | mean | p50 | p95 | max | >33 ms | >50 ms | long tasks |
|---|---|---|---|---|---|---|---|
| default (screenshot between steps) | 16.67 | 16.7 | 16.7 | 16.8 | 0 | 0 | 0-2 |
| `--timing-only` | 16.67 | 16.7 | 16.7 | 16.8 | 0 | 0 | 0 |
| `--timing-only --throttle 6` | 42.70 | 49.9 | **66.8** | 83.4 | 265 | **123** | 148 (9057 ms) |

The naive baseline is vsync-pinned at 1x and **fails G8 outright at 6x**, so every spike's G8
claim must state the throttle rate it was measured at.

## 4c. `lineup.mjs` — visual calibration instead of blind nudging

```
node spikes/lod/_shared/lineup.mjs <slug> --zooms 0.5,2,8 --variants "a=1,a=2,a=3"
                                   [--viewport WxH] [--dpr N] [--anchor cx,cy]
                                   [--settle MS] [--cell PX] [--out name] [--seed S]
-> spikes/lod/<slug>/out/lineup-<name>.png   (+ lineup-<name>.json)
```

Rows = variants (each a query string appended to the spike URL; join several keys inside one
variant with `;`, e.g. `"lie=9;fiducial=1"`), columns = zooms. Each cell is `reset()`, then
`setZoom(z, ax, ay)`, then a `--settle` wait (600 ms default) — so every cell is the spike's
crisp post-settle output at a known zoom, labelled with the zoom actually reached (flagged when
the spike clamped it) and the first three `metrics()` entries.

When a treatment has been rejected twice, render the candidates side by side and let a human point
at the right one. Do not nudge pixels blind across successive captures.

## 5. Wheel-delta calibration

If the spike exposes `zoomRange()` **and** `setZoom()`, the rig probes one `-100` wheel
notch, derives the spike's zoom-per-delta constant, and picks a per-step delta that
traverses `min -> max` in exactly `--steps` steps. That keeps a 48-step `zoom-in` run
comparable across spikes with different wheel sensitivities. Without those, it falls back
to a flat `-100` per step (override with `--delta`).

## 6. Reusing geometry from `src/`

Spikes may import **pure geometry and renderers only** — never `src/hooks/**`,
`src/components/**`, or anything that touches Obsidian. `HexGeometry`, `BaseGeometry`
and `offsetCoordinates` import zero Obsidian code; their `#types/*` imports are type-only
and erased at bundle time (`build.mjs` also aliases `#types/*` -> `types/*.ts` as insurance).

```ts
import { HexGeometry } from '../../../src/geometry/core/HexGeometry';

//              hexSize (world px, centre->vertex), orientation, bounds
const geometry = new HexGeometry(24, 'flat', null);

const cells = geometry.getAllRadialCells(25);          // 1951 axial {q,r} out to ring 25
const w = geometry.hexToWorld(q, r);                   // -> { worldX, worldY }
const hit = geometry.worldToHex(worldX, worldY);       // -> { q, r } (rounded)
const verts = geometry.getHexVertices(q, r);           // -> 6 x { worldX, worldY }
const range = geometry.getVisibleHexRange(offX, offY, zoom, w, h);
```

World -> screen is the plain affine `screen = offset + world * zoom` (see
`BaseGeometry.worldToScreen`/`screenToWorld`). Keep `offset` in CSS px and apply
`ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` once after sizing the canvas, so every
`__lod` coordinate stays in CSS px regardless of `--dpr`.

Cursor-anchored zoom, the whole trick, in four lines:

```ts
function zoomAbout(next: number, ax: number, ay: number) {
  const w = worldAt(ax, ay);                 // world point under the cursor, BEFORE
  zoom = clamp(next, MIN_ZOOM, MAX_ZOOM);
  offX = ax - w.x * zoom;                    // put it back under the cursor, AFTER
  offY = ay - w.y * zoom;
}
```

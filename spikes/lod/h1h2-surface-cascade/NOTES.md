# h1h2-surface-cascade

H1 (keyed, byte-budgeted LOD surface cache) + H2 (per-place cascade with coverage early-exit)
built together in one spike, because H2 cannot be drawn without H1.

## Hypothesis

A single continuous world transform plus a per-(level, chunk) surface cache is enough to give
Leaflet-style continuous zoom over a hex world where detail is authored **per place** rather than
per document:

1. Detail lives on nested hex lattices in ONE world coordinate space. Level L has hexSize
   `H0 / 3^L`, so level-L cell `(3q, 3r)` is world-identical to level-(L-1) cell `(q, r)`
   (`hexToWorld` is linear in hexSize x (q,r)). There is no document, no swap, no anchor maths.
2. Each (level, chunk) is rasterised to an offscreen surface at a renderScale stepped per octave,
   held in a byte-budgeted LRU with explicit release (`width = height = 1`).
3. Per frame, walk levels finest -> coarsest, blit resident surfaces, accumulate a 16x16 viewport
   coverage mask, break at the first fully covering level, and always draw the coarsest available
   thing under everything.

## World (this spike generates its own; it does NOT use the shared fixture world)

`_shared/fixture.ts` is document-shaped (a tree of `Doc`s with `transformToWorld`), which is the
thing this spike is trying to replace, so the world here is generated locally. Reused from the
fixture: `TERRAIN_PALETTE` and `terrainAtWorld()` — the same 8 terrain classes and the same
world-space terrain field, so colours and band geometry match every other spike.

- **L0** hexSize 24 world px, radial ring 36 = **3997 cells**, authored everywhere in the disc.
- **L1** hexSize 8 (m=3, generator (3,0), rotation-free, 9x finer by area), authored inside ~25%
  of L0 hexes chosen by seeded value-noise blobs = **8858 cells**.
- **L2** hexSize 8/3 (81x finer), authored inside ~10% of the L1 pockets = **11196 cells**.
- **Missing intermediate level**: L0 hexes within axial distance 3 of `(12, 6)` have **L2
  authored but L1 deliberately deleted**, so the ancestor walk must fall through L1 to L0.
- 302 chunks (16x16 axial, keyed `level|cx|cy`). World build takes 20–58 ms once at startup.
- Deliberate contradictions so a finer level is not a resample of its parent: a lake blob and a
  town blob that only exist at L1/L2, plus a per-level noise octave that nudges terrain one step
  up the ladder.
- The dive target (`FOCUS`) sits exactly on the shared edge of an L2-authored and an
  L2-unauthored L0 hex, so every zoom-in capture frames the ragged frontier rather than a flat
  interior. `?focus=missing` re-points it at the missing-intermediate region.

## Variants (URL params — one build serves every capture)

| param | default | meaning |
|---|---|---|
| `budgetMB` | 32 | LRU byte budget for surfaces |
| `genBudgetMs` | 4 | per-frame rasterisation budget; `0` = unbudgeted |
| `minHexPx` | 3 | **prune a level whose hexes are smaller than this on screen** (the lever) |
| `surfPx` | 768 | longest side of one surface; caps a level's renderScale |
| `direct` | 1 | when a blit would upscale > 3x and < 3000 cells are visible, re-render that level as vectors |
| `cascade` | 1 | `0` = no coverage early-exit |
| `srcClip` | 1 | blit only the on-screen sub-rect of a surface |

## Measurements

All at 1600x1000 @1x, `zoom-in-out --steps 64 --stride 1` unless stated. Zoom range 0.42 -> 54.

### G8 frame time (`--timing-only`, so uncontaminated)

| config | blits at min zoom | mean | p50 | p95 | max | >33 ms | >50 ms | long tasks | rebuilds | evictions |
|---|---|---|---|---|---|---|---|---|---|---|
| **A** `budget32 gen4 minHexPx=14` | 29 | **17.03** | 16.7 | **16.8** | 33.4 | 11 | **0** | 1 | 96 | 40 |
| `budget32 gen4 minHexPx=8` | 29 | 18.83 | 16.7 | 33.3 | 33.4 | 77 | 0 | – | 217 | 127 |
| `budget32 gen4 minHexPx=3` | 140 | 23.6–24.4 | 16.7 | 33.4 | 50–66.7 | 240–275 | 2–3 | 1 | 635 | 454 |
| **B** `budget64 gen4 minHexPx=3` | 140 | 19.95 | 16.7 | 33.4 | 33.4 | 120 | 0 | 0 | 359 | **0** |
| **C** `budget32 gen0 minHexPx=3` | 140 | 25.66 | 33.2 | 33.4 | 66.7 | 368 | 4 | 5 | 638 | 457 |
| A `direct=0` | 29 | 16.74 | 16.7 | 16.8 | 33.4 | 2 | 0 | 0 | 96 | 40 |
| **A @ `--throttle 4`** | 29 | 57.7 (84.0 in one run) | 50.1 | 83.3 (133.3) | 100–200 | 476 | **246** | 379 | 96 | 40 |
| `_template` baseline @ `--throttle 4` | – | 46.19 | 50 | 66.7 | 100.1 | 492 | 100 | 109 | – | – |
| **D** `budget96 gen4 minHexPx=3 surfPx=1536` | **140** | **17.41** | 16.7 | **16.8** | 33.5 | 24 | **0** | **0** | 554 | 233 |
| **D @ `--throttle 4`** | 140 | 77.34 | 83.3 | 100 | 133.4 | 475 | 443 | 462 | – | – |

### The surface-size sweep that changed the verdict (fixed 140 blits, budget 64 MB, minHexPx=3)

| `surfPx` | mean | p95 | >33 ms | draw mean | bytesPeak |
|---|---|---|---|---|---|
| 384 | 20.11 | 33.4 | 123 | 1.08 ms | 26.3 MB |
| 768 | 18.17 | 33.3 | 53 | 0.79 ms | 62.4 MB |
| **1536** | **17.36** | **16.8** | 23 | 7.07 ms | 68.8 MB |

At a **fixed blit count**, bigger surfaces are *faster*. Frame cost is dominated by per-blit
overhead and by how far each blit has to filter (a bigger surface means `renderScale` is clamped
less often, so the blit sits nearer 1:1), not by the pixels moved. That is the opposite of the
assumption the byte budget is built on.

Draw time (our JS) is **0.46 ms mean / 1.2 ms p95** for A at 1x — the naive `_template` is
**6.2 ms mean** at 4x. The cascade's JS is 5x cheaper and its *frames* are 25% more expensive
under throttle. The cost is not in our code; it is in the canvas raster/upload of many separate
surfaces, and CPU throttling slows that too.

### Bytes (H1's budget question)

| budget | surfaces live | bytesCached end | **bytesPeak** | evictions | rebuilds / 64 wheel steps |
|---|---|---|---|---|---|
| 32 MB, minHexPx=14 | 55 | 31.94 MB | **32.92 MB** | 40–46 | 96–101 |
| 64 MB, minHexPx=14 | 68 | 41.17 MB | **41.17 MB** | **0** | 69 |
| 32 MB, minHexPx=3 | 180 | 31.86 MB | 33.18 MB | 454 | 635 |
| 8 MB, minHexPx=14 | (lineup only) | – | – | heavy | heavy |

- The working set for this world over this trace is **~41 MB**. At 64 MB nothing is ever evicted.
- `bytesPeak` exceeds the budget by exactly one surface (~0.9–1.3 MB) because eviction runs
  *after* the insert. Honest overshoot, bounded, fixable by evicting before allocating.
- Explicit release (`width = height = 1`) is in place; measured `bytesCached` tracks it exactly.
  This spike cannot prove the *browser* frees the backing store — that needs the iPad
  allocation-ramp page H1 describes, which was not built here.

### G1 / G2 / G3 / G4 / G7

| gate | metric | A (b32) | B (b64) | C (gen0) | minHexPx=3 | **D** (full detail) | `_template` ref, same trace |
|---|---|---|---|---|---|---|---|
| G1 never blank | blank frames | **0 / 78** | 0 / 78 | 0 / 78 | 0 / 78 | **0 / 78** | 0 / 78 |
| G1 no holes | holes > 8x8 in footprint | **0** (largest 0 px2) | 0 | 0 | 0 | **0** | 0 |
| G2 anchor (pixel) | fiducial drift max | **0.71 px** | 0.71 | 0.71 | 0.71 | **0.71** | 0.71 (floor) |
| G2 anchor (self) | cumulative drift max | 0 px | 0 | 0 | 0 | 0 | 0 |
| G3 pop | max / median | **1.32x** | 1.32x | 1.32x | 1.37x | **1.34x** | **1.35x** |
| G4 path independence | pathDiff mean / max | 0.025 / 0.039 | **0.013 / 0.019** | 0.025 / 0.039 | 0.043 / 0.089 | 0.030 / 0.038 | **0 / 0** |
| G7 seam / moire | frozen frames, visual | 0, none seen | 0 | 0 | 0 | 0 | 0 |

`pan-zoom` (A, 48 steps): fiducial 0.71 px, pan anchor drift 0 px, holes 0, blank 0,
pop median 22.10 max 33.41 = **1.51x**, `depthChanges` **1** over the whole run (no pan thrash).

`zoom-in` full depth (A, 0.42 -> 54): fiducial 0.71, holes 0, blank 0, pop **1.42x**.

`zoom-in` on the **missing-intermediate** region (`focus=missing`): holes 0, blank 0,
pop median 13.66, **max 27.25 = 1.99x at step 10** — the worst pop measured anywhere in this
spike, and it is exactly where the L2 island switches on with no L1 beneath it.

## What the contact sheets actually show

- `out/zoom-in-out-A0-minhex3/contact-sheet.png` (78 frames): a smooth exponential dive. The
  ragged frontier is legible from about z=1.5: fine mottled hexes with a lake and a town on the
  left, large flat hexes on the right, and the boundary is a clean hexagonal edge. It does **not**
  read as a rendering seam — it reads as "the map is authored in more detail over there". Going
  in and coming back out look the same frame for frame.
- `out/zoom-in-A-b32/frames/053.png` (z=25, full resolution): L2 hexes (133 px wide) fill the
  frame, crisply vector-drawn with per-cell shade variation; at the far right edge a **single
  enormous L1 hex** (400 px wide) appears where L2 stops. At this depth the frontier is a 3x
  linear jump in cell size — very visible, but visible as *content*, not as an artifact. The
  magenta fiducial sits on the cursor anchor.
- `out/lineup-feel.png` (4 variants x zooms 1/3/9/27): **the damaging one.** The three
  `minHexPx=14` rows show a *uniform* coarse lattice at z=1 (`levelsDrawn 1`) — the fine pocket
  simply is not rendered. The `minHexPx=3` row at the same zoom shows the pocket in full: fine
  mottled hexes, the blue lake dot, orange town speckles, against coarse hexes elsewhere
  (`levelsDrawn 2`, then 3 at z=3). The setting that buys G8 is the setting that deletes the
  per-place look at low and mid zoom.
- `out/lineup-missing.png` (z 0.6/2/6/18 on the missing-intermediate region): at z=6,
  `levelsDrawn 3`, an orange L2 town disc sits directly on mid-size L0 hexes with **no L1 lattice
  anywhere around it**, and there is no hole. The ancestor walk skips the absent level correctly.
  At z=18 it breaks at L2 and fills the frame crisply.
- `out/pan-zoom-A-b32/contact-sheet.png`: during the pan leg the frontier slides across the frame
  with the content; pop drops to ~10-11 (half the zoom-leg value); no flicker, no depth flapping.
- `out/lineup-deep.png` is **broken** — `--cell 720` collapsed the composite. Ignore it.

## Verdict

**Promising on a desktop main thread; killed on a throttled one.**

What is proven:

- **The one-world-transform idea works completely.** G1, G2, G3, G4 and G7 pass in every variant,
  and G3 passes *better* than the naive single-level baseline on the identical trace
  (1.32–1.34x vs 1.35x). No swap, no document, no anchor maths — the shipped 10–50x pop has no
  analogue here. Pixel-domain fiducial drift is 0.71 px (the quantisation floor) everywhere.
- **The per-place cascade is correct**, including across a missing intermediate level: zero holes
  in every run, `depthChanges 1` over a whole pan-zoom (no hysteresis thrash), coarsest level
  always underneath.
- **Variant D holds G1+G2+G3+G4+G7+G8 at 1x with the full per-place look**: `minHexPx=3`,
  `surfPx=1536`, 96 MB budget — 3 levels, 140 blits, p95 **16.8 ms**, **0 frames > 50 ms**,
  **0 long tasks**, and the lineup confirms the fine pocket is visible at z=1. H1's and H2's
  kill criteria are **not** triggered at 1x.

What kills it:

- **G8 fails at `--throttle 4` in every configuration, and fails worse than the naive baseline.**
  A: p95 83.3 ms / 246 frames > 50 ms. D: p95 100 ms / 443 frames > 50 ms / draw mean 29 ms.
  `_template`: p95 66.7 ms / 100 frames > 50 ms. The cascade's JS draw is 5x cheaper and its
  frames are 25–70% more expensive. A 4x-throttled main thread is the honest stand-in for the
  iPad, and this design is *slower there than the thing it replaces*.
- **The price of D is ~100 MB of canvas backing store** (`bytesPeak 99.86 MB` against a 96 MB
  budget). That is not an iPad number.
- Throttle-4 measurements vary a lot run to run on this machine (mean 57.7 vs 84.0 for one
  identical config). Treat them as a band, not a point.

So: per-place detail with lazy budgeted surfaces **can** hold G1 and G8 on this machine, but only
at desktop CPU speed and ~100 MB. The surface cache is not the tablet answer.

## Surprises

1. **Draw time is a liar.** Measured `draw` was 0.46–2.0 ms while frames took 17–84 ms. The cost
   lives outside the JS the frame clock can see, in canvas raster/texture work. Any LOD spike that
   reports only `drawTime` will report a false pass. (D inverts this: draw 7.4 ms at 1x, 29 ms at
   4x — the same work, now *inside* the measurable window.)
2. **Bigger surfaces are faster at fixed blit count** (surfPx 384 -> 1536: mean 20.11 -> 17.36,
   p95 33.4 -> 16.8). Per-blit overhead and filter distance dominate, not pixels moved. This is
   the opposite of what a byte budget assumes, and it is what turned a "mixed" verdict into a
   "passes at 1x" one.
3. **Blit count, not cell count, is the frame-time variable.** 140 blits of ~4000 cells is slower
   than 29 blits of the same 4000 cells. The surface cache converts a cell-count problem into a
   surface-count problem.
4. **Source-rect clipping did nothing.** The pinned overview is blitted as a ~250x upscale of a
   640 px bitmap at max zoom; clipping it to the visible sub-rect changed nothing measurable at 1x
   (16.74 vs 17.03) or 4x (57.7 vs 57.4). Chromium already clips. Negative result, kept only
   because it bounds the worst case.
5. **Switching a whole level on at once did not pop.** Measured pop at `minHexPx=14` (1.32x) is
   *lower* than at `minHexPx=3` (1.37x), because a finer level refines the coarser one's field so
   the pixels barely move. The one place that *does* pop (**1.99x**) is the missing-intermediate
   island, where L2 appears over L0 across two octaves.
6. **64 MB never evicted; 32 MB cost +45% rebuilds and zero visible difference** — identical pop,
   holes and fiducial. The budget is a memory/CPU dial, not a quality dial, which is the opposite
   of H1's "pressure ladder step 3 lowers renderScale" assumption.

## What to try next

1. **Atlas the chunks.** Rasterise into 2–3 large atlas canvases and blit sub-rects, so 140
   logical blits hit 3 textures instead of 140. The surfPx sweep is indirect evidence that this is
   where the win is; it is the single change most likely to fix the throttled case.
2. **Re-run at `--throttle 4` with the atlas.** If it does not beat `_template` there, the surface
   cache should be abandoned for the tablet and the design should fall back to direct vector
   re-render with the cascade's level selection (the `direct=1` path already does exactly this at
   deep zoom and is the cheapest thing measured).
3. **Measure raster cost directly** — rAF-to-rAF delta at fixed content, swept over blit count —
   instead of trusting `drawTime`.
4. **Cross-fade the missing-intermediate case.** The 1.99x pop is the only real pop found.
5. **The frontier needs a Guildmaster pick.** At depth it is a 3x linear cell-size jump against a
   giant parent hex. It reads as content rather than as a bug, but nobody has judged whether it is
   *wanted*. H2's alpha-apron treatment was not built here.
6. **Run the iPad allocation ramp.** Nothing here proves WebKit frees a released canvas, and D's
   100 MB makes that question load-bearing.

## Commands

```
node spikes/lod/_shared/build.mjs h1h2-surface-cascade
node spikes/lod/_shared/capture.mjs h1h2-surface-cascade --scenario zoom-in-out --steps 64 --stride 1 \
  --viewport 1600x1000 --fiducial --query "budgetMB=32&genBudgetMs=4&minHexPx=14"
node spikes/lod/_shared/capture.mjs h1h2-surface-cascade --scenario zoom-in-out --steps 64 --stride 1 \
  --viewport 1600x1000 --timing-only --throttle 4 --query "budgetMB=32&genBudgetMs=4&minHexPx=14"
node spikes/lod/_shared/lineup.mjs h1h2-surface-cascade --zooms 1,3,9,27 --anchor 512,380 \
  --variants "minHexPx=14;budgetMB=32,minHexPx=14;direct=0,minHexPx=14;budgetMB=8,minHexPx=3" --out feel
```

Outputs are renamed per variant under `out/` (`zoom-in-out-A-b32`, `zoom-in-out-A0-minhex3`,
`zoom-in-out-B-b64`, `zoom-in-out-C-gen0`, `pan-zoom-*`, `zoom-in-A-b32`, `zoom-in-missing`,
`REF-template-zoom-in-out`) because `capture.mjs` always writes to `out/<scenario>/`.

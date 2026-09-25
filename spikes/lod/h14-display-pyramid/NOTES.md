# h14-display-pyramid — disposable raster display pyramid

## Hypothesis

The viewer never draws documents. It rasterises the *composed* world (docs at their
affines, painter-ordered by depth) into rectangular 256x256 display tiles at power-of-two
levels z=0..13, exactly like a slippy map, and the screen is nothing but a grid of those
tiles blitted at pixel-exact integer edges. Display resolution is therefore fully
decoupled from hex subdivision: the authored lattice jumps 15x per level, the display
pyramid steps 2x, and the two never need to agree.

Claims tested:
1. **G1 never blank** — a missing tile falls back to its nearest cached ancestor drawn
   scaled up, and level 0 is pinned/pre-generated, so something is always painted.
2. **G2 anchor** — plain affine, tiles placed from it; pixel-domain fiducial should sit on
   the quantisation floor.
3. **G3 no pop** — level changes swap the whole tile set at once. Does a 2x resolution swap
   read as a pop? Does the 150 ms raster-arrival fade matter?
4. **G8 frame budget** — generation capped at `genBudgetMs` per frame.
5. **Edits** — `__lod.paint(wx, wy, color)` writes into the finest authored doc at that
   point and invalidates every cached tile covering the edited cell at every level.

## Design (what was built)

- Level scale `s(z) = 2^(z-4)` world px -> tile px. z=0 => 0.0625 (whole world in 4 tiles),
  z=13 => 512 (past the 400 max zoom). Tile grid origin is root world (0,0), so tile
  (z,i,j) is exactly contained by (z-1, floor(i/2), floor(j/2)) — clean ancestry.
- Level selection `z = round(log2(zoom)) + 4`, so the blit ratio is always in
  [0.707, 1.414] — never below H14's 0.5x floor, and never more than 1.41x upscale.
- Pixel-exact placement: column boundaries `xs[i] = round(offX + i*tw*zoom)`, tile width
  `xs[i+1] - xs[i]`. Adjacent tiles share an exact integer edge at any fractional zoom.
- **Invalidation marks dirty but keeps the stale bitmap**, so an edit can never punch a
  hole; the dirty tile is re-rasterised on the next frame it is needed.
- Bake/live split (H4 prerequisite): cells + roads are baked into tiles; labels, the secret
  marker and the fiducial are **live vector overlays**, so nothing text-shaped is
  duplicated across 14 levels.
- Hit-testing and edits go through `coarseColorAt` on the source docs, never the pyramid.
- LRU byte budget (`?lruMB`, default 64), level 0 pinned.
- `?probe=1` turns on `willReadFrequently` for the edit probe only (it forces a CPU-backed
  surface, so it must not be on for timing runs).

## Variants

| id | query | what it shows |
|---|---|---|
| A `budget` | `genBudgetMs=4&fade=150` | the intended treatment |
| B `sync` | `genBudgetMs=1000&fade=0` | generate everything the frame needs, no fade |
| C `slow` | `genBudgetMs=4&fade=150&genDelayMs=8` | fault injection: +8 ms per tile raster, so generation cannot keep pace |
| base | `_template?fixture=1` | the naive per-frame re-render of the same fixture, same trace |

All runs: 1600x1000, `--steps 64 --stride 1 --fiducial`, seed 1.

## Measurements

### G1 / G2 / G3 / G4 — zoom-in-out, 64 steps, stride 1

| variant | blank | holes (largest) | missDraws | cum drift | fiducial | pop max/median | pathDiff mean/max |
|---|---|---|---|---|---|---|---|
| base (naive) | 0/78 | n/a | — | — | — | **4.34x** | 0 / 0 |
| A budget | 0/78 | 0 (0 px2) | 0 | 0 px | **0.71 px** | **4.82x** | 0.060 / 0.096 |
| B sync | 0/78 | 0 (0 px2) | 0 | 0 px | 0.71 px | **4.82x** | 0.060 / 0.096 |
| C slow | 0/78 | 0 (0 px2) | 0 | 0 px | 0.71 px | **5.03x** | 0.065 / 0.097 |

pan-zoom, same settings: every variant 0/66 blank, 0 holes, fiducial max 0.71 px,
cum drift 0 px; pop 4.89x (A), 4.89x (B), 4.87x (C).

"largest 0 px2" means there was **no background-coloured pixel anywhere inside the world
footprint on any frame** — which is also the seam evidence: a 1 px transparent gap between
tiles would have shown up as exactly that. The `nextX - x` edge rule holds.

### Fallback behaviour (per-step metrics, zoom-in-out)

| variant | steps with fallback tiles | max fallback tiles (of 60 needed) | max pending | missDraws |
|---|---|---|---|---|
| A budget | 5 / 64 | 34 | 34 | 0 |
| B sync | 0 / 64 | 0 | 0 | 0 |
| C slow | 20 / 64 | 52 | 52 | 0 |

### G8 — frame time (zoom-in-out, 1600x1000)

| run | mean | p50 | p95 | max | >33 ms | >50 ms |
|---|---|---|---|---|---|---|
| A, with screenshots | 16.68 | 16.7 | **16.7** | 33.3 | 1 | **0** |
| A, `--timing-only` (smooth=low) | 16.79 | 16.7 | **16.7** | 33.3 | 4 | **0** |
| A, `--timing-only` smooth=**high** | 22.30 | 16.7 | 33.4 | 83.3 | 192 | 4 |
| B sync, pan-zoom | 18.79 | 16.7 | 33.4 | **133.3** | 118 | 5 |
| C slow | 18.47 | 16.7 | 33.3 | 66.7 | 172 | 4 |
| A, `--timing-only --throttle 4` | 58.41 | 50.0 | 133.3 | 216.7 | 453 | 215 |
| base naive, `--timing-only --throttle 4` | 43.86 | 33.3 | 116.7 | 300 | 386 | 151 |

### Cost / bytes (64-step zoom-in-out, A)

- 356 tiles rasterised; 256 resident at the 64 MB LRU cap; 100 evictions; level 0 pinned.
- raster **mean 0.18 ms / tile**, max 2.5 ms (1314-cell fixture; a real Windrose map with
  images and objects would be far more).
- 20–60 tiles drawn per frame; draw time mean 0.56 ms, p95 1.8 ms.

### Edits (`edit-probe.mjs`, out/edit-probe.json)

| case | cell | tiles cached | invalidated | levels | scan ms | repair | edit visible (px changed) | vs from-scratch rebuild |
|---|---|---|---|---|---|---|---|---|
| zoom 1, root cell | root (4,4) d0 | 39 | **5** | 0, 4 | 0.1 | 23 ms / 2 frames | 16,908 (= one root hex) | 83 px (HUD only) |
| zoom 8, finest cell | grand (-4,2) d2 | 39 | **2** | 0, 7 | 0.1 | 28 ms / 2 frames | 117 (cell is 2.8 px) | 90 px (HUD only) |
| zoom 64, finest cell | grand (-4,2) d2 | 39 | **2** | 0, 10 | 0.0 | 32 ms / 2 frames | 1,494 (= the cell) | 90 px (HUD only) |

The ~85 residual pixels are the HUD's own "rastered N / evict N" counters, which legitimately
differ. Outside the HUD the post-edit screen is pixel-identical to a pyramid rebuilt from
scratch: **eventual pixel equality holds, and no edit ever required a full rebuild.**

## What the contact sheets actually show

- **A zoom-in-out**: a continuous dive from the ring-12 root to a depth-2 rosette and back
  out, with no hard cut anywhere. The child rosette emerges as a fine stipple inside its
  parent hex from about z=2.5 and grows smoothly; the ring-7 hull's 30-degree rotation and
  its under-fill at the parent's corners are plainly visible, and the parent colour fills
  those corners (painter order is doing its job). Out-leg frames mirror the in-leg frames.
- **C pan-zoom**: with 8 ms/tile injected, the captured frames are still all sharp. The
  fallback blur is transient enough that at the rig's stride-1 cadence (~140 ms/step) it has
  already resolved. The 13-frame pan section is the smoothest part of the whole run
  (pop ~3.3, no tile edges visible, no seams).
- **lineup-inflight (60 ms settle)** is the money shot. Row C at z=2 and z=8 is visibly
  blurry — you can see individual 256 px tile squares at different sharpness, sharp in the
  middle where generation started and soft at the rim, with `pendingTiles 30, tilesReady 5`.
  It reads exactly like Google Maps tiles resolving. Nothing is blank, nothing is torn, and
  the blur is soft rather than blocky. Rows A and B are already fully sharp at 60 ms.
- **lineup-settled (600 ms)**: rows A, C and `smooth=high` are indistinguishable. High-quality
  image smoothing buys **nothing** visible at settle and costs 5.5 ms/frame.
- The degradation character is honestly *rectangular*: blur arrives in axis-aligned square
  blocks that have no relationship to the hex lattice. It looks like a map tile loading, not
  like a hex map degrading.

## Verdict

**Promising, with two real caveats.**

Decoupling display resolution from hex subdivision does give the slippy feel, and cheaply
in the ways that matter for feel: G1, G2, G3, G4 and G8-at-1x all pass, an edit costs 2–5
tiles and 2–3 frames, and the pyramid converges to pixel equality with a fresh build. The
2x display ladder crossing a 15x authoring ladder caused no trouble at all — level swaps do
not read as pops (4.82x vs the naive renderer's 4.34x on the same trace, against the
document swap's 10–50x reference).

Caveats:

1. **At 4x CPU throttle the pyramid is WORSE than the naive renderer** (mean 58.4 vs 43.9 ms,
   p95 133 vs 117). On a 1314-cell fixture the per-tile overhead exceeds the cost of just
   redrawing. The pyramid only pays for itself when per-pixel source cost is high (images,
   thousands of tiles/objects) — which is the real Windrose case, but this spike does not
   prove it.
2. **Coarse ancestors go stale.** Invalidation marks every covering tile dirty at every
   level, but only the *current* level is regenerated, so after an edit `dirtyTiles` stays
   at 1 (the pinned level-0 tile). Zoom out fast enough to land on a dirty ancestor and you
   will briefly see pre-edit content. Fixable (regenerate dirty ancestors when idle, or
   composite the edit into the ancestor directly), but it is a real hole in the design.

## Surprises

- **`ctx.imageSmoothingQuality = 'high'` costs ~5.5 ms/frame and is invisible to the JS
  draw clock.** It turned a clean p95 of 16.7 ms into 33.4 ms with 192 dropped frames, while
  the measured draw time went *down*. The cost lives in the compositor, not in JS. With
  `low` the settled output is visually identical (see lineup-settled). This is the single
  biggest finding of the spike and it would have been missed without `--timing-only`.
- **Unbudgeted generation hurts panning, not zooming.** Variant B (generate everything the
  frame needs) is fine while zooming — the level changes rarely — but during the pan leg it
  hit a 133 ms frame, because a pan streams new tiles continuously. The 4 ms budget is
  earning its keep in exactly one gesture.
- **The 150 ms fade did nothing measurable here.** A and B produced identical pop numbers to
  three decimals, because tiles arrive within 1–2 frames on this fixture. Fade is insurance
  for the C case, not a feel feature at this content cost.
- An edit at depth 2 invalidates *fewer* tiles (2) than an edit at depth 0 (5), because a
  finer cell has a smaller world footprint. Edit cost scales with the cell's world area, not
  with pyramid depth — the opposite of the intuition in the H14 risk note.

## What to try next

1. Re-run against content with a realistic per-pixel cost (background image + hundreds of
   placed tiles) and re-measure the throttle-4 comparison. That is the only number that
   decides whether the pyramid is worth its complexity.
2. Regenerate dirty ancestors during idle frames (or composite the edited cell straight into
   cached ancestors) and re-measure `dirtyTiles` after an edit.
3. Try `OffscreenCanvas` + `createImageBitmap` for tiles, and a worker for rasterisation —
   the per-tile `document.createElement('canvas')` is the obvious overhead at throttle.
4. Measure at `--dpr 2`: tile counts quadruple and the 64 MB LRU will thrash much earlier.
5. Combine with h1h2's findings: this spike proves the *display* side; it says nothing about
   how the authored side decides which docs exist at a given zoom.

## Files

- `main.ts` — the spike. `index.html`, `NOTES.md`.
- `edit-probe.mjs` — standalone playwright probe for the edit measurements; writes
  `out/edit-probe.json`.
- `diag.mjs` — one-off single-pixel diagnostic used to prove the paint path works
  (kept because it is the cheapest way to re-check the source->tile->screen chain).
- `out/{A,B,C}-{zoom-in-out,pan-zoom}/` — per-variant capture output.
- `out/lineup-settled.png`, `out/lineup-inflight.png`.

Reproduce:

```
node spikes/lod/_shared/build.mjs h14-display-pyramid
node spikes/lod/_shared/capture.mjs h14-display-pyramid --scenario zoom-in-out --steps 64 \
  --stride 1 --viewport 1600x1000 --fiducial --query "genBudgetMs=4&fade=150"
node spikes/lod/_shared/capture.mjs h14-display-pyramid --scenario zoom-in-out --steps 64 \
  --viewport 1600x1000 --timing-only --throttle 4 --query "genBudgetMs=4&fade=150"
node spikes/lod/_shared/lineup.mjs h14-display-pyramid --zooms 0.5,2,8,32 --viewport 1600x1000 \
  --settle 60 --out inflight \
  --variants "genBudgetMs=4;fade=150,genBudgetMs=4;fade=150;genDelayMs=8,genBudgetMs=1000;fade=0"
node spikes/lod/h14-display-pyramid/edit-probe.mjs
```

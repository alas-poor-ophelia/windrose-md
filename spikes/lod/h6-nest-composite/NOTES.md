# h6-nest-composite

## Hypothesis

Keep the nested documents exactly as shipped; delete the document swap. Render every
visible document simultaneously at its composed affine (root at the camera, each child at
parentHexCentre + childLocal/15, grandchild likewise), with one continuous zoom from 0.2
up to 900 (= 4 * 15 * 15) and no clamp in between. If that is enough, "LOD zoom" for
Windrose is a rendering change with a ZERO data-model change.

Sub-hypotheses:
1. Compositing the nest is never blank: the parent is always drawn under the child, so the
   ring-7 hull's 30-degree under-fill at the parent's corners shows PARENT fill, not
   background.
2. Per-document cached surfaces (generalising `blitStaticContent`: scale-blit during the
   gesture, re-render crisp 150 ms after settle) keep the frame budget while the camera moves.
3. The blend law between levels does not need a clock (H3): `none` and `zoom` are stateless
   and reversible; `timer` is path-dependent.

## What was built

One spike, variants by URL query:

- `?blend=none`  child opaque as soon as its on-screen cell width >= 2 px
- `?blend=zoom`  alpha = smoothstep of on-screen cell width between 2 px and 6 px (default)
- `?blend=timer` 200 ms fade once resident (resident = cell width >= 2 px)
- `?cull=1`      skip documents whose world bounds miss the viewport (default off)
- `?cache=0`     disable the per-document surface cache (control arm for G8)
- `?look=dive|siblings|hull` where the camera is parked at home
- `?zmin=Z`      what `zoomRange()` reports to the rig (the hard clamp is always 0.1 .. 900)

Camera: one affine, `screen = off + world * zoom`, in ROOT world px, forever. There is no
nav stack, no document identity, no transition, no cooldown and no hysteresis anywhere in
the spike. A document's screen transform is `off + t*zoom` with scale `docScale*zoom`,
i.e. the fixture's `transformToWorld` multiplied by one scalar.

Cache: each visible document owns a 1.2x-viewport surface, rendered at the settled
transform and scale-blitted while `k = zoom/zoom0` stays in [0.4, 2.5] and the blit still
covers the viewport; otherwise that document live-renders for the frame. 150 ms after the
last input, up to 2 stale surfaces are re-rendered crisp per frame.

`zmin=0.62` + `--delta -68.46` reproduces **exactly** the trace `h0-polished-swap` was
measured on (same scenario, steps, stride, viewport, seed, per-step zoom ratio and start
zoom), so the pop comparison below is apples to apples.

## Measurements

### G3 pop, matched trace vs the h0 swap control
zoom-in-out, 64 steps, stride 1, 1600x1000, delta -68.46, start zoom 0.62.

| arm | pop median | pop max | max/median | pathDiff (G4) | blanks | holes |
|---|---|---|---|---|---|---|
| h6 blend=none | 4.024 | **19.617** | **4.88x** | mean 0 / max 0 | 0/76 | 0 |
| h6 blend=zoom | 4.075 | **19.617** | **4.81x** | mean 0 / max 0 | 0/76 | 0 |
| h6 blend=timer | 4.053 | **19.617** | **4.84x** | mean 0 / max 0 | 0/76 | 0 |
| h0 swap=animated | 5.162 | 34.728 | 6.73x | - | - | - |
| h0 swap=crossfade | 5.162 | 38.849 | 7.53x | - | - | - |
| h0 swap=hard | 5.162 | 40.120 | 7.77x | - | - | - |

pan-zoom, same trace:

| arm | pop median | pop max | max/median |
|---|---|---|---|
| h6 blend=none | 4.143 | **19.609** | 4.73x |
| h6 blend=zoom | 4.192 | **19.609** | 4.68x |
| h6 blend=timer | 4.199 | **19.609** | 4.67x |
| h0 swap=animated | 5.197 | 28.106 | 5.41x |
| h0 swap=crossfade | 4.970 | 45.038 | 9.06x |
| h0 swap=hard | 4.970 | 46.380 | 9.33x |

The three blend arms are identical to three decimals and peak on the SAME step. The pop
maximum sits at the lowest zoom of the sweep (step 62, z=0.63 / step 0, z=0.69), not at any
level crossing, and its in-leg and out-leg values match (e.g. matched z=5.130: in 1.813,
out 1.831). It is camera motion, not a level event.

### Native range (0.2 -> 900, the full continuous ladder)

| run | pop median | pop max | max/median | blank | frozen | holes | fiducial max |
|---|---|---|---|---|---|---|---|
| zoom-in-out 64/stride1 (none/zoom/timer) | 5.88 | 23.858 | 4.05x | 0/78 | 0/78 | 0 | 0.71 px |
| zoom-in 64/stride1 (blend=zoom) | 5.877 | 23.604 | 4.02x | 0/66 | 1/66 (at the 900 clamp) | 0 | 0.71 px |
| pan-zoom look=siblings | 5.283 | 16.240 | 3.07x | 0/66 | 0/66 | 0 | 0.71 px |

Anchor, every run: self-reported wheel drift **max 0.0000 px**, cumulative **max 0.0000 px**,
pan drift **0 px**; pixel-domain fiducial **max 0.71 px** (the quantisation floor), cumulative
max 1.0 px. G2 holds through both level crossings and the pan.

### G8 frame budget (--timing-only, matched trace)

| arm | throttle | frame mean | p50 | p95 | max | >33 ms | >50 ms | draw mean/p95/max | long tasks |
|---|---|---|---|---|---|---|---|---|---|
| cache on | 1x | 16.74 | 16.7 | **16.8** | 33.4 | 2 | **0** | 1.48 / 5.7 / 24.6 | 1 (52 ms) |
| cache off | 1x | 16.67 | 16.7 | **16.7** | 16.8 | 0 | **0** | 1.01 / 2.7 / 5.4 | 0 |
| cache on | 2x | 31.02 | 33.3 | 66.6 | 166.7 | 280 | 39 | 7.45 / 31.4 / 89.9 | 47 |
| cache off | 2x | 29.59 | 16.7 | 83.2 | 183.3 | 250 | 55 | 2.49 / 10.1 / 30.2 | 59 |
| cache on | 4x | 49.80 | 33.3 | 133.4 | 333.2 | 362 | 187 | 10.43 / 58.1 / 225.9 | 204 |
| cache on + cull=1 | 4x | 57.37 | 33.4 | 150.1 | 583.3 | 385 | 207 | 13.69 / 70.8 / 583.4 | 229 |
| cache off | 4x | 39.01 | 33.3 | 83.4 | 233.4 | 369 | 114 | 3.14 / 13.5 / 46.3 | 124 |
| cache on, BEFORE the churn fix | 4x | 72.73 | 50.1 | 166.7 | 1400 | 460 | 275 | 22.17 / 82.2 / 225.8 | 290 |

Live surface bytes: 9.216 MB per document at 1600x1000 CSS px, dpr 1, PAD 1.2
(`bytesCached` 18.4 MB with two surfaces resident during the dive).

## What the contact sheets actually show

- `out/m2-zio-zoom/contact-sheet.png` (76 frames, stride 1): a continuous ramp with no
  discontinuity anywhere. The `range` child rosette fades up as an olive/tan disc inside one
  grey root hex at z~1.7 and grows smoothly; the zoom-out leg mirrors it frame for frame.
  The only visibly fast frames are at the bottom of the sweep (z<0.8) where the whole world
  is racing across the viewport.
- `out/lineup-hull-seam.png`: the adjacent siblings `forestA`/`forestB` composite with **no
  visible seam, no gap and no second lattice** — the road crosses their shared boundary
  unbroken and the lake and the Ashford town read as one map. The ring-7 hull's 23.3% corner
  under-fill is **invisible here**, because parent and child agree on forest green.
- `out/lineup-blend-dive.png`: the three blend rows are indistinguishable at every settled
  zoom. But the same lineup shows the under-fill's real cost: over the mountain range the
  child rosette is olive/tan on a GREY parent hex, so it reads as a hexagonal island of
  detail pasted into the middle of a flat hex, with the parent's colour in the six corners.
  Where parent and child disagree on terrain, the under-fill is plainly visible. That is a
  taste call, not a bug — it is the Welsh-Piper half-hex convention made literal.
- `out/lineup-past-floor.png` (z 9 -> 900): past the deepest authored document the picture
  does **not** blur. Every document is re-rendered from vector data at the live zoom, so
  z=900 is two or three enormous, perfectly crisp flat hexagons with hard edges and a
  200 px "Cairn Hold" label. Never blank, never mushy — but also not Google Maps' blur.
  Degradation character is "the hexes just get big".
- `out/sib-panzoom/contact-sheet.png`: the pan phase at z=8.95 (frames 26-38) is the
  SMOOTHEST part of any run — pop 3.86-3.93 against a 5.28 median. Panning laterally at
  depth 1 across the sibling boundary works, with the correct siblings appearing and the
  root visible around them. Today that pan is impossible.

## Gate results

| gate | verdict | number |
|---|---|---|
| G1 never blank | PASS | 0 blank frames and 0 holes >= 8x8 inside the footprint across all 11 captures; largest background component 0 px2 |
| G2 anchor | PASS | wheel drift 0.0000 px, cumulative 0.0000 px, pan 0 px; fiducial 0.71 px max (quantisation floor) |
| G3 no pop | PASS vs control | max/median 4.81x vs h0's 6.73-7.77x on the identical trace; pop max 19.6 vs 34.7-40.1 |
| G4 path independence | PASS (with caveat) | mean 0 / max 0 over 5-6 matched zooms for all three blends, INCLUDING timer - the detector settles 600 ms, which is longer than the 200 ms fade, so it is blind to timer's path dependence |
| G6 degradation past the floor | OBSERVED, needs a call | crisp giant flat hexes, not blur |
| G7 no seam / no moire | PASS on the sibling pair; the hull under-fill is visible when parent and child colours disagree |
| G8 frame budget | PASS at 1x (p95 16.8 ms, 0 frames > 50 ms). FAIL at 4x throttle in every arm |

## Verdict

**Promising - the lead candidate holds.** The swap is not needed. On the identical trace the
composite halves the worst frame-to-frame delta of even the most polished swap (19.6 vs
34.7), is exactly path independent, never goes blank or holed across a 4500x zoom range plus
a lateral pan at depth, and holds the anchor at the pixel-quantisation floor. It does it
with one scalar zoom, one affine per document and zero data-model change.

Two of the three sub-hypotheses survive; the middle one does not.

1. Never blank: CONFIRMED. The parent under the child is enough. 0 holes everywhere.
2. Per-document surfaces pay for themselves: **FALSE at this content density.** Live
   re-rendering the whole composite costs 1.01 ms/frame at 1x; the cache costs 1.48 ms and
   adds GC. At 4x throttle the uncached arm is better on every statistic (39.0 vs 49.8 mean,
   114 vs 187 frames > 50 ms). The cache is a solution to a problem this fixture does not
   have. It must be re-tested at real content density before it is either kept or deleted.
3. No clock needed: **CONFIRMED, and stronger than expected.** All three blend laws produce
   identical pop to three decimals. The reason is structural: a nested document becomes
   resident when its cells are 2 px, and a ring-7 rosette is 15 cells across, so it arrives
   as a ~30 px object in a 1,600,000 px viewport - about 0.06% of the frame. There is
   nothing to crossfade. H3's kill criterion ("if NONE scores within 2x of TIMER, delete the
   crossfade workstream") is met by a factor of 1.006. Delete it.

## Surprises

1. The blend law is unmeasurable. Not "small" - identical, same step, same value. The
   geometry of nesting guarantees the arriving document is tiny.
2. The surface cache is net overhead. The whole `blitStaticContent` generalisation, which
   was the expensive part of the design, may be unnecessary for vector hex fills.
3. My own bug, found by reading the lineup's `cellsDrawn` counter: the settle loop refreshed
   surfaces for documents the draw loop then freed as off-screen, allocating and discarding
   a 9 MB canvas every settled frame forever, AND eating the refresh budget so the deepest
   on-screen document never got a crisp surface. Cost: 46% of the 4x frame time (72.7 -> 49.8
   mean) and 86 extra frames over 50 ms. The metric that exposed it was `cellsDrawn` being
   non-zero in a settled lineup cell.
4. `?cull=1` buys nothing with 6 documents - it measured slightly WORSE (57.4 vs 49.8 at 4x,
   inside run-to-run noise). The per-cell bounds test already rejects off-screen documents
   for the price of iterating their cell arrays.
5. The pop maximum is always at the BOTTOM of the zoom range, where the whole world sweeps
   across the frame, and never at a level crossing.

## What to try next

- Re-run the cache arm at real Windrose content density (tile art, objects, walls, labels).
  The cache verdict is density-dependent and this fixture's flat hex fills are far too cheap
  to settle it. Do not delete `blitStaticContent` on the strength of this spike alone.
- Guildmaster call on the corner under-fill where parent and child terrain colours disagree
  (`out/lineup-blend-dive.png`, z=2.8 and z=4.5). Either accept it as the half-hex
  convention, or give the child hull a chrome treatment (H4).
- Guildmaster call on degradation past the authored floor: crisp giant hexes (what this
  spike does) versus a deliberate blur. A soft zoom cap at the floor was never needed here -
  nothing breaks at z=900 - so the cap is a taste decision too.
- G9 memory: worst case in this fixture is root + four depth-1 siblings + grandchild = 6 x
  9.2 MB = 55 MB at 1600x1000 dpr 1. At dpr 2 that is 220 MB. Budget before keeping caches.
- Replay a recorded trackpad pinch with natural direction reversals: the 600 ms matched-zoom
  settle cannot see timer's path dependence, so G4's PASS for `timer` is a detector blind
  spot, not evidence.
- Rotation is untested. The shipped rotate feature gets neither the placement nor the cache.
- The spike never exercised a deep lateral pan (the rig's pan phase is 13 steps x 9 px).
  Pan across three parent hexes at depth 2 to test surface eviction and re-entry.

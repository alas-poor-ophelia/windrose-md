# h4-bake-live-split — what goes in the cached surface vs what stays live

## Hypothesis (H4 + H19)

H4: split the frame by *blendability*. Only low-frequency **fills** go into cached
surfaces. Exactly **one** hex lattice is ever stroked, and it is stroked **live in screen
space**. Everything that must stay legible (labels, markers) is drawn live at a constant
screen size. Claim: the "two grids" moire that a naive two-level crossfade produces comes
almost entirely from having *outlines inside the cached surfaces*, not from the fills.

H19: during a blend the outgoing level should defocus slightly (rack focus), so the
upscale blockiness of the coarse level reads as bokeh rather than mush. `?defocus=1`
applies a `ctx.filter` blur bump to the outgoing (root) surface that peaks mid-blend and
is fully gone by settle. iPadOS reflects `ctx.filter` but does not apply it, so a shipped
version needs pre-blurred copies; this spike only measures the Chromium cost.

## Build

Two levels over the shared fixture: **root** (depth 0, 469 cells) and the **four child
docs** (depth 1, 676 cells, scale 1/15). Depth 2 (`grand`) is deliberately excluded — the
brief asks for the simplest two-level version.

Every level is baked once into an offscreen surface at a **constant baked cell radius of
48 px** (root 0.6 surface-px per world-px, children 9.0). Root surface 2088x2320, each
child 1272x1272 — 38.0 MB of canvas total. Nothing is re-baked during a gesture; frames
are pure `drawImage` composites plus the live pass.

Blend: `s = log2(zoom / 1.9365)` where 1.9365 is the zoom at which the root cell and the
child cell are equidistant (in log) from the 40 px lattice target. Child surfaces
crossfade in over `s` in [-0.8, +0.8] (zoom 1.11 -> 3.37) with a smoothstep. Root is drawn
at alpha 1 always, so G1 (never blank) is structural.

### Variants

| `?grid=` | what it does |
|---|---|
| `both` | each level's hex outline is baked INTO its surface. Two lattices are visible for the whole blend band. The strawman. |
| `one` | fills only are baked. Exactly one lattice strokes live in screen space — the level whose on-screen cell size is closest to 40 px — with **disjoint ramps**: the outgoing lattice reaches 0 before the incoming one leaves 0 (dead band 0.35 in log2 zoom). |
| `none-during-gesture` | `one`, but the live lattice is suppressed until 150 ms after the last input. |
| `fade` | both lattices stroke live with alpha `= 1 - abs(log2(cellPx/40)) / 2.2`, so they overlap faintly near the crossover. |
| `district` | added after the first lineup: the coarse lattice is never deleted, it **thickens and lightens** into a persistent 2.5 px, 30%-alpha region line while the fine lattice takes over normally (H4's named fallback). |

`?labels=live` (default) draws labels in screen space at a constant px size;
`?labels=baked` bakes them into the surfaces so they scale with zoom. `?defocus=1` adds
the H19 blur bump. `?look=label` parks the view on the depth-1 label so the label
comparison has a label in frame. `?stress=N` repeats the live stroke pass N times.
`?analyse=0` turns off the in-page image analysis (used for `--timing-only`).

## Lattice metric

`metrics().latticeCount` is a **per-level predicted-period detector**, not a full FFT.
A flat-top hex lattice as stroked here has horizontal top/bottom edges, so a *dark ridge*
runs across the frame once per hex row, at a pitch that is known exactly per level:
`P = sqrt(3) * cellWorldRadius * zoom * dpr`. Per call: one `getImageData` of a 960x960
crop centred on the point being zoomed at; per row, `ridge(y) = sum_x max(0,
(L(y-2)+L(y+2))/2 - L(y))` (responds to dark LINES, largely not to colour steps between
fills); then a normalised autocorrelation over a window ~12 periods wide, searched over
lag in [0.87P, 1.15P], detected at r > 0.25. A level whose pitch is <6 px or >450 px is
UNMEASURABLE in this crop and excluded. `latticeCount` = levels detected; 2 = "two grids".

Why not the FFT-peak-count from H4's brief: the two levels are **15x apart in scale**, so
their periods can never beat against each other and a 12-vs-24-peak test has nothing to
find. Checking each level at its own known pitch is strictly more specific (a harmonic of
the coarse lattice can never be mistaken for the fine one) and ~30x cheaper.
`latticeDrawn` is the self-reported companion (how many lattices are actually being put on
the frame), tabulated beside it because the pixel detector is local to the crop.

## Measurements

All runs: `--scenario zoom-in-out --steps 64 --stride 1 --viewport 1600x1000`, seed 1,
dpr 1. `REF` is `_template?fixture=1` (the flat, no-LOD compositing renderer) on the
**identical trace**, which is the only legitimate pop comparison.

### Feel / correctness (zoom-in-out)

| variant | popMed | popMax | max/med | pathDiff | blank | holes | cumDrift | latticeDrawn (band) | frames w/ 2 lattices | HF base | HF crossover | HF ratio |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| REF flat | 4.64 | **20.13** | 4.34 | 0 | 0 | 0 | 0.000 | n/a | n/a | - | - | - |
| grid=both | 6.29 | 16.04 | 2.55 | 0 | 0 | 0 | 0.000 | **2.00** | **12** | 2.82 | 3.96 | **1.40** |
| grid=one | 2.91 | 15.51 | 5.33 | 0 | 0 | 0 | 0.000 | 0.92 | **0** | 2.92 | 2.41 | 0.82 |
| grid=none-during-gesture | 2.55 | 12.93 | 5.07 | 0 | 0 | 0 | 0.000 | 0.92 | **0** | 0.72 | 0.75 | 1.04 |
| grid=fade | 2.70 | 14.95 | 5.53 | 0 | 0 | 0 | 0.000 | 1.25 | 3 | 2.21 | 1.29 | 0.58 |
| grid=district | 3.07 | 14.02 | 4.56 | 0 | 0 | 0 | 0.000 | 1.42 | 5 (by design) | 1.38 | 2.66 | 1.94 |

`pan-zoom` agrees: both 2.00 latticeDrawn / 10 two-lattice frames / HF ratio 1.64;
one 1.00 / 0 / 1.00; fade 1.20 / 2 / 0.69; none-during-gesture 1.00 / 0 / 1.13.

Measured at the EXACT crossover instead of averaged over the band (lineup, z=1.94 against
its own z=1 baseline): **both 4.279/2.306 = 1.86x**, one 0.793/2.389 = **0.33x**, fade
1.311/1.534 = 0.85x. H4 pre-registered ">1.8x fails, <=1.2x passes": the naive bake crosses
that line at the crossover itself and reads 1.40x when averaged over the whole blend band;
the split passes on either measurement.

Pixel-domain anchor (`--fiducial`, grid=one): **max 0.71 px, mean 0.71, cum max 1 px**,
0 frames missing — the quantisation floor. G2 holds in pixels, not just in the spike's
own algebra.

### Frame budget (solo `--timing-only` runs)

1x CPU:

| variant | mean | p50 | p95 | max | >33 | >50 | drawMean | drawP95 | live strokes |
|---|---|---|---|---|---|---|---|---|---|
| REF flat | 16.67 | 16.7 | 16.7 | 16.8 | 0 | 0 | 1.37 | 3.60 | - |
| grid=both (pure blit) | 16.67 | 16.7 | 16.7 | 16.8 | 0 | 0 | **0.21** | 0.40 | 0 |
| grid=district | 16.67 | 16.7 | 16.7 | 16.8 | 0 | 0 | 0.29 | 0.50 | 221 |
| grid=fade | 16.67 | 16.7 | 16.8 | 16.8 | 0 | 0 | 0.36 | 0.70 | 221 |
| grid=one | 16.70 | 16.7 | 16.8 | 33.4 | 1 | 0 | 0.46 | 1.00 | 221 |
| grid=one + defocus | 17.50 | 16.7 | 16.8 | 33.4 | **22** | 0 | 0.33 | 0.60 | 221 |
| grid=one + stress=12 | 19.53 | 16.7 | **33.4** | 50.1 | 74 | **2** | 1.35 | 2.20 | **2652** |

4x CPU throttle (renderer thread only):

| variant | mean | p95 | max | >33 | >50 | drawMean |
|---|---|---|---|---|---|---|
| REF flat | 28.86 | 50.0 | 100.0 | 303 | 19 | 2.64 |
| grid=both | **26.13** | **33.4** | 50.1 | 298 | **2** | 0.38 |
| grid=one | 29.56 | 33.4 | 83.3 | 383 | 4 | 0.84 |
| grid=one + defocus | 47.58 | 99.9 | 133.3 | 451 | **146** | 0.99 |
| grid=one + stress=12 | 89.88 | 166.5 | 183.4 | 476 | **295** | 5.63 |

Cache cost: `bytesCached` **38.0 MB** for two levels at 48 px baked cell radius.

### Gates

| gate | result | number |
|---|---|---|
| G1 never blank | **PASS** all variants | 0 blank frames / 78 captured; root surface is always alpha 1 |
| G2 anchor | **PASS** | self cumDrift 0.000 px; fiducial max 0.71 px (= floor) |
| G3 no pop | **PASS** vs the same-trace reference | every variant popMax 12.93-16.04, **below** REF 20.13 |
| G4 path independence | **PASS** all variants | pathDiff mean 0, max 0 over 6 matched zooms |
| G6 degradation past the floor | **PARTIAL** | never blank, root upscales and blurs; the child rosette hull stays a hard-edged patch (no feather) |
| G7 no two-lattice | one / none-during-gesture **PASS** (0 frames); both **FAIL** (12); fade 3; district 5 by design | see table |
| G8 frame budget | **PASS at 1x** for both/district/fade/one; **FAIL** for defocus and for a dense live lattice | p95 16.7-16.8, 0 >50 ms; defocus 22 frames >33 at 1x, 146 >50 at 4x; stress=12 p95 33.4, 2 >50 at 1x |
| G5 monotonic coverage | not measured | - |

## What the contact sheets actually show

- **grid=both** (`out/zio-both/contact-sheet.png`): from z~2.0 to the apex the frame carries
  two obviously different grids — enormous root hexagons with heavy dark baked borders, and
  inside one of them a fine grey "chainmail" patch. They do not moire (the pitches differ by
  15x, far too much to beat); they **compete**. The eye reads the fine patch as a foreign
  texture swatch dropped onto the map, not as the same map at finer grain.
- **grid=one** (`out/zio-one/contact-sheet.png`): identical up to z~1.68, then the whole
  lattice **vanishes** for the dead band (frames #14-#19, z 1.68-2.34): large amorphous
  colour blobs, no hex boundaries anywhere. From z~2.5 the fine lattice appears inside the
  rosette and the root hexes stay border-free for the rest of the run. Frame-to-frame churn
  drops hard (pop 2.4-3.8 vs both's 5.4-6.8) — it is smoother, and it has stopped looking
  like a hexcrawl. H4's own stated risk, confirmed by eye.
- **grid=fade**: the root lattice thins out gradually instead of snapping off, and a whisper
  of it survives the dead band. Closest to `one` numerically, clearly gentler visually.
- **grid=district** (`out/lineup-district.png`, row 4): the root lattice never leaves — it
  becomes a light 2.5 px, 30%-alpha frame. At z=2.6/3.6 both lattices are on the frame but at
  such different visual weights that the coarse one reads as a *region boundary*, not as a
  competing grid. The only variant that keeps the hexcrawl frame AND lets the fine grid own
  the detail; also the cheapest live variant after pure blitting (draw 0.29 ms).
- **labels** (`out/lineup-labels.png`): decisive. `labels=baked` is an illegible orange smudge
  at z=1.94 and z=3 (the child surface is downscaled 4.6x and 3x from its bake, which destroys
  the glyphs) and only becomes readable at z=9, where it is then oversized. `labels=live` is a
  constant 15 CSS px at every zoom — so small in a 4.7x-downscaled contact sheet that it is
  nearly invisible there, and exactly right on the real frame. On-screen baked label height is
  `fontSize * zoom` = 14 px at z=1.94, 22 px at z=3, 66 px at z=9; live is 15 px throughout.
  (Derived and eyeballed — I did **not** measure the label bbox in the pixel domain.)
- **defocus** (`out/lineup-chrome.png`, rows 3-4): the 2 px `ctx.filter` blur bump does what
  H19 says — the outgoing root visibly softens mid-blend and is fully sharp again by settle.
  Unexpected: on `grid=both;defocus=1` the detector reads `latticeCount 0` at z=2.6, i.e.
  **the blur erases the outgoing lattice on its own** — a second, independent mechanism for
  the two-grid problem. It is also the single most expensive thing in the spike.
- Everywhere: the child rosette's ring-7 hull is a visible hard-edged rotated-hexagon patch
  inside its parent, with a ring of parent colour around it. The frontier fringe H4 predicts
  is real and is not fixed by anything tested here.

## Verdict

**The single-live-lattice rule works, is nearly free, and is the wrong default.**

- It removes the two-grid state completely and measurably: `grid=one` and
  `grid=none-during-gesture` put **0** frames with two lattices on screen across a 64-step
  zoom-in-out and a pan-zoom, versus 12 and 10 for the baked strawman, and their HF energy at
  the crossover is 0.33x their own pre-crossing baseline where the strawman is 1.86x.
- It costs **+0.25 ms of draw per frame** for 221 stroked hexes (0.21 -> 0.46 ms), and the
  rule structurally caps that count: it only ever strokes the rung near 40 px, so a
  1600x1000 viewport can never demand more than ~400 hexes. That is the real headline — the
  rule pays for itself by bounding pass B. Forced to 2652 strokes (`?stress=12`) the same code
  **fails G8** (p95 33.4 ms, 2 frames >50 at 1x), so the cap is load-bearing, not tidying.
- But deleting the coarse lattice outright reads as losing the hexcrawl. The dead band shows a
  completely gridless map, and past the crossover the root hexes have no borders at all.
  `grid=district` keeps both at different weights for 0.08 ms more than pure blitting, and in
  the lineup it is plainly the best-looking cell at every zoom. **Recommend district as the
  default and `one` as the reduced-motion / minimal setting.**
- **Blending only the fills does read better.** Every split variant pops less in absolute
  terms than the flat reference (popMax 12.9-16.0 vs 20.1) and less than the baked-outline
  variant.
- **H19's defocus is correct as art direction and unaffordable as written.** 2 px `ctx.filter`
  blur on an upscaled ~2000x2300 surface put 22 frames over 33 ms at 1x and 146 frames over
  50 ms at 4x — while `drawTime` stayed at 0.33 ms, i.e. the cost is entirely in raster,
  invisible to `performance.now()` bracketing inside the draw call. iPadOS ignores
  `ctx.filter` anyway, so pre-blurred copies are not an iPad workaround, they are the only
  implementation. Budget them against H1's memory ceiling before designing around it.

## Surprises

1. **The 15x scale ratio means there is no moire.** Two hex lattices 15x apart cannot beat
   against each other. The "two grids" problem here is clutter and mis-reading, not
   interference — which invalidates the FFT-peak-counting plan in H4's spike brief.
2. **`drawTime` lies about anything that touches raster.** Defocus and dense strokes both
   look cheap in `drawTime` and both blow the frame budget. Only the rAF delta catches them.
3. **Back-to-back `--throttle 4` captures contaminate each other badly.** A batch of five gave
   `grid=both` mean 95.08 / p95 250 ms; the same command alone gave **26.13 / 33.4**. Every
   throttled number in the tables above was run solo.
4. **Baked outlines disappear at the crossover anyway.** At z=1.94 the child surface is
   displayed at 1/4.6 of its bake resolution, so its baked hex outlines wash into the fill and
   the detector cannot see them (childR 0.043). A fixed-resolution bake destroys its own fine
   chrome long before the level is "ready" — an argument for live chrome independent of the
   two-lattice argument.
5. **Blur is a second solution to the two-lattice problem.** `grid=both;defocus=1` drops to
   `latticeCount 0` at z=2.6: the outgoing lattice is blurred out of detectability rather than
   deleted. Expensive, but it needs no dead band.
6. `grid=both` has the *lowest* pop max/median ratio (2.55x) purely because its baseline churn
   is highest — `maxOverMedian` is only readable against the same trace.

## Caveats

- Two levels only (root + depth-1); the depth-2 `grand` doc is excluded.
- The pixel lattice detector is LOCAL (960x960 crop centred on the point being zoomed at), so
  when the two lattices occupy different parts of the frame it under-counts; `latticeDrawn`
  (self-reported) is tabulated beside it for that reason.
- `?stress=12` overdraws the same 221 hexes 12 times. Total stroke length and path-building
  cost match 2652 distinct hexes; cache behaviour does not.
- Label size constancy was seen, not measured in the pixel domain.
- Chromium only. No WebKit run, so the `ctx.filter` iPadOS fallback is untested here.

## What to try next

1. Take `grid=district` forward as the default and A/B it against `one` with a human.
2. Feather the child rosette hull (alpha ramp over the outermost ring) and re-run the
   footprint/seam checks — the hard patch edge is the most visible artefact left.
3. Replace the `ctx.filter` blur with 2-3 pre-blurred copies per surface, measure memory
   against H1's budget, and re-run the 4x throttle timing.
4. Add a mip chain per surface (or re-bake at settle) so a level displayed 4.6x below its bake
   resolution is not mush; then re-test whether `labels=baked` is still hopeless.
5. Measure label bbox height in device px across the sweep to turn the label claim into a number.
6. Port the one-lattice rule to a 3+ level pyramid and check the ~400-stroke cap still holds.

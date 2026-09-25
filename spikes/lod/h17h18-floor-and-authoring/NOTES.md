# h17h18-floor-and-authoring

Simplest simultaneous composite of the shared fixture (every doc drawn over its parent at its
own affine, no tiling, no caching), used as a testbed for two questions:

- **Part A / H17 (G6):** what should happen when you keep zooming past the deepest authored doc?
- **Part B / H18:** can the edit target be *derived* from the camera and *latched* per stroke,
  and can detail be authored in place with no navigation?

## Floor definition used

`FLOOR_CELL_PX = 120`. A doc whose composed scale into root world is `s` has floor zoom
`120 / (HEX_SIZE * s)` = `120 / (80 * s)`. It is recomputed every frame from the deepest
authored doc under the anchor point, so it is **position dependent**.

| depth | s | floor zoom |
|---|---|---|
| 0 root | 1 | **1.5** |
| 1 forestA/forestB/shore/range | 1/15 | **22.5** |
| 2 grand | 1/225 | **337.5** |

## Variants

| query | treatment |
|---|---|
| `?floor=crisp` | keep drawing the deepest doc's hexes at whatever size they reach (naive) |
| `?floor=blur` | cap the render scale at the floor of the **deepest doc visible anywhere on screen**, render the whole composite into an offscreen at that scale, blit up with `imageSmoothingQuality:'high'` |
| `?floor=ghost` | per-cell deterministic micro-hex rosettes seeded by `(docId, q, r, microQ, microR)`, recursive up to 3 levels, desaturated + lifted, 42% alpha, plus one screen-space 6 px hatch pass clipped to the union of ghosted cells |
| `?floor=spring` | `displayed = floor + (requested - floor) * 0.25`, rubber-banding back to the floor 300 ms after the last gesture tick |

Homes: `?home=child` (lake/forest boundary **inside forestA** — deepest authored doc is depth 1,
nothing below it), `?home=nochild` (root hills/forest boundary at (-2,2)|(-1,2), no child doc
anywhere near), `?home=shore`, `?home=fiducial`.

## Measurements

### zoom-in-out, 64 steps, stride 1, 1600x1000, `--fiducial`, home=child (0.62 -> 41.4 -> 0.62)

| variant | cum anchor drift | fiducial max / cum | pop median | pop max | **pop max/median** | pathDiff mean/max (pairs) | blank | frozen | holes |
|---|---|---|---|---|---|---|---|---|---|
| crisp | 0 | 0.71 / 1 px | 8.415 | 21.976 | **2.61x** | 0 / 0 (6) | 0 | 0 | 0 |
| blur | 0 | 0.71 / 1 px | 8.746 | 21.976 | **2.51x** | 0 / 0 (6) | 0 | 0 | 0 |
| ghost | 0 | 0.71 / 1 px | 11.615 | 22.253 | **1.92x** | 0 / 0 (6) | 0 | 0 | 0 |
| spring | 0 | 0.71 / 1 px | 7.183 | 21.976 | **3.06x** | 0 / 0 (**5**) | 0 | 0 | 0 |

0.71 px is the pixel-grid quantisation floor, so **G2 passes in the pixel domain for all four**.
G1 (never blank) and the footprint hole check pass for all four: 78 frames, 0 fail frames,
largest background component 0 px2 inside a ~1.18 Mpx2 footprint.
G4 = 0 for all four. Spring produces only **5** matched pairs, not 6: the same wheel trace
reaches z=41.4 crisp but only **z=27.9** with the spring on, so the top ladder rung is never
crossed. That is the resistance showing up as a measurement, not a bug.

### G8 — frame time, `--timing-only` (clean), zoom-in 48 steps, 1600x1000, **throttle 1x**

| variant | mean | p50 | p95 | max | >33 ms | >50 ms | long tasks | G8 |
|---|---|---|---|---|---|---|---|---|
| crisp | 16.67 | 16.7 | **16.7** | 16.8 | 0 | 0 | 0 | PASS |
| spring | 16.67 | 16.7 | **16.8** | 16.8 | 0 | 0 | 0 | PASS |
| blur | 20.01 | 16.7 | **33.4** | 33.4 | 110 | 0 | 0 | FAIL (p95) |
| ghost | 55.74 | 50.0 | **116.6** | 150.1 | 346 | 174 | 197 | FAIL (hard) |

Ghost draws a median of **967** and a peak of **7084** micro-hexes per frame, regenerated every
frame with no caching. H17's own brief says infill is baked into the surface at settle; this
spike deliberately did not do that, so the number is the cost of the *naive* form, not of the
hypothesis. Blur's cost is one extra full composite into the offscreen plus a high-quality
upscale blit — it halves the frame rate for the whole past-floor phase.

### Lineups (settled stills)

- `out/lineup-child.png` — 4 variants x zooms 30/60/120/240 over forestA (floor 22.5, so 1.3x - 10.7x past)
- `out/lineup-nochild.png` — same over a childless root hex (floor 1.5, so **20x - 160x past**)
- `out/lineup-spring-settled.png` — spring only, `--settle 2500`

Spring, measured at the rig's default 600 ms settle, lands at 22.5-23.8 (child) and 1.5-3.2
(nochild); at 2500 ms it converges to **exactly 22.500 / 1.500 for every requested zoom**.
The per-frame `req += (floor-req)*0.18` relaxation needs ~1 s to converge from a 160x overshoot.
That is a bug in the tuning, not the idea: the rubber band must be **time-based** (fixed ~300 ms
ease) so its duration does not depend on how far you overshot.

### H18 probe (`authoring-probe.mjs`, real pointer + wheel events) — `out/authoring/result.json`

| check | result |
|---|---|
| **A latch** | pointerdown over `forestA` at z=18, **6 wheel notches mid-stroke take the camera to z=69.4 (3.86x)**, painting continues. 11 cells written, **1 distinct doc (`forestA`)**, **1 distinct cell world size (5.333333)**, 0 docs minted. PASS |
| **B author in place** | at z=6 the deepest doc under the cursor is `root`, cell 480 px (4x past root floor). One `strokeStart` mints `minted-root--2,2` (depth 1, 169 cells, colours inherited). Camera byte-identical (`zoom` and `worldAt` unchanged). **Only 1.022% of pixels changed** by creation — the finer grid lines. Deepest doc becomes the minted one at 32 px/cell, `pastFloorX` drops 4.00 -> 0.27. A following shift-drag paints 7 cells, all into the minted doc. PASS |
| **C ghost determinism** | `ghostDigest()` = 4276396361 on a fresh load, on a different load with a different home, and after a 200x camera move. Nothing stored. PASS |

Stills: `B0-before-no-child.png` / `B1-minted-in-place.png` / `B2-painted-into-new-doc.png`,
`A0..A3`.

## What the contact sheets and lineups actually look like

**crisp over a childless root hex (20x-160x past floor):** a single flat olive field with one
hairline. At z=240 it is literally one colour. Nothing is wrong and nothing is informative —
it reads as "the map got bigger", which is exactly the failure H17 names.

**blur:** the honest surprise, and a negative result. Windrose cells are **flat colour fills**,
so there is nothing inside a cell to blur — the only thing the upscale can soften is the grid
stroke. Over the childless root hex the single hairline becomes a fat smeared diagonal band that
looks like a rendering artifact or a bad JPEG, not like missing data. Over forestA at 5-10x past
floor it is a mild, pleasant softening of the cell edges and almost indistinguishable from crisp.
Blur is a treatment for *raster* content; a vector hex map has nothing for it to work on.

**ghost:** the only variant that puts something honest on the screen. Over the childless root hex
at z=30 it reads as a fine mossy/lichen texture; the map is no longer empty. Three real problems:
(1) the ring-7 rosette **under-fills its parent hex at the 30 degree corners**, so every ghosted
cell shows a *round* blob of micro-hexes with the parent colour at the corners — the ghost field
visibly polka-dots instead of tiling; (2) at 3 recursion levels the compounded 42% alpha washes
everything toward milky grey, so by z=240 it is as featureless as crisp, just paler; (3) the 6 px
hatch is legible at full size but **disappears at thumbnail size and at high zoom** — in the
zoom-in-out sheet the ghost texture just looks like authored terrain variation. Honest enough for
a careful look, not yet honest at a glance. The G10 honesty test in H17 is NOT satisfied by this
treatment as built.

**spring:** every lineup cell is a healthy, fully detailed map — because the camera simply never
gets there. Requesting 240 over a childless hex leaves you at 1.5. It is the best-looking row by
far and the most frustrating: the map stops responding to the zoom input entirely.

**A calibration finding that dominates all four.** With `FLOOR_CELL_PX = 120` and `HEX_SIZE = 80`,
a root map is past its floor at **zoom 1.5** — i.e. for essentially the whole range at which you
actually read a root map. In the ghost `zoom-in-out` contact sheet the ghost texture switches on
at frame #6 (z=1.59) and never switches off. "Cell bigger than 120 px" is the wrong floor
predicate for a coarse map: the right one is closer to "the zoom at which a *child* doc's cells
would be legible", which is `CELLS_ACROSS` (15x) higher.

## Verdict

**Floor treatment: `ghost` is the only one that is both honest and gives you something, but it is
not shippable as built** — it fails G8 by a mile (p95 116.6 ms at 1x throttle) and its provenance
signal is too weak at a glance. `blur` is killed: flat-fill hex content has nothing to blur, and
what it does produce looks like a bug. `crisp` is the honest baseline and reads as nothing.
`spring` is orthogonal to all three (it is a camera rule, not a render rule) and is the cheapest
and the calmest, but as tuned it is a hard cap with an animation rather than a soft cap.

The shape that follows from this spike: **spring for the camera + ghost for the surface**, with
the ghost baked at settle (H17's own design, which this spike deliberately skipped) and with the
floor predicate recalibrated so a root map is not "past the floor" at zoom 1.5.

**Author-in-place with documents is straightforward.** Minting a child doc is ~30 lines: compose
`scale * CHILD_SCALE` and `tx + scale * parentHexCentre` (the same composition `fixture.ts` and the
shipped `subHex` math already use), fill 169 cells by inheriting the resolved parent cell, push it
into the depth-sorted draw list. 1.02% of pixels change. The derived+latched edit rung is ~15
lines and survived a 3.86x zoom mid-stroke with a single distinct lattice written. No camera
change, no dialog, no navigation.

## Surprises

1. **Author-in-place is self-healing for the floor.** The instant the child is minted, the floor
   at that spot drops by 15x (`pastFloorX` 4.00 -> 0.27), so whatever degradation treatment is
   running turns itself off exactly where you authored. The floor treatment and the authoring
   affordance are the same mechanism seen from two sides.
2. **Blur has nothing to blur.** This was the variant I expected to be the safe default; on flat
   vector fills it is a no-op in the interiors and a visible artifact on the strokes.
3. **The 30 degree rosette under-fill is visible in the procedural infill.** The same geometric
   fact that makes the shipped subhex seam (`ring-7 hull rotated 30 degrees, under-fills the
   parent at its corners`) makes procedural ghosts polka-dot rather than tile.
4. **Spring's relaxation being per-frame proportional makes its settle time depend on the
   overshoot** — 600 ms settle showed 3.2, 2500 ms showed 1.5. Any spike measuring a spring at a
   fixed settle is measuring a point on the curve, not the endpoint.
5. **Ghost has the *lowest* pop ratio (1.92x vs 2.61x crisp)** on the same trace: the procedural
   texture masks the frame-to-frame luma change of the coarse lattice growing.

## What to try next

1. Bake the ghost into an offscreen at settle (H17's stated design) and re-measure G8 — the
   per-frame cost should go to zero and only the settle cost remains.
2. Recalibrate the floor predicate to `floorZoom = CELLS_ACROSS * (legibleCellPx / (HEX_SIZE * s))`
   or similar, so a root map is past its floor only when a child rung would be readable.
3. Make the spring time-based (fixed ~300 ms ease to the floor) and let the *residual* overshoot
   be a real soft cap (e.g. permanently allow 1.5x-2x past floor) rather than converging to
   exactly the floor.
4. Fix the ghost provenance signal: the hatch needs to survive thumbnailing and deep zoom, and
   the rosette under-fill at the parent corners needs filling (or the ghost lattice should be a
   plain hex tiling of the parent, not a ring-7 rosette).
5. Test `spring + ghost` composed, and test the "pan past the cap" case H18 flags as unsolved —
   this spike only ever changed the floor by zooming, never by panning from an authored pocket
   into unauthored space.

## Reproduce

```
node spikes/lod/_shared/build.mjs h17h18-floor-and-authoring
node spikes/lod/_shared/lineup.mjs h17h18-floor-and-authoring --zooms 30,60,120,240 \
  --variants "floor=crisp;home=child,floor=blur;home=child,floor=ghost;home=child,floor=spring;home=child" \
  --viewport 1600x1000 --out child
node spikes/lod/_shared/lineup.mjs h17h18-floor-and-authoring --zooms 30,60,120,240 \
  --variants "floor=crisp;home=nochild,floor=blur;home=nochild,floor=ghost;home=nochild,floor=spring;home=nochild" \
  --viewport 1600x1000 --out nochild
node spikes/lod/_shared/capture.mjs h17h18-floor-and-authoring --scenario zoom-in-out --steps 64 --stride 1 \
  --viewport 1600x1000 --fiducial --query "floor=ghost&home=child"     # then mv out/zoom-in-out out/zio-ghost
node spikes/lod/_shared/capture.mjs h17h18-floor-and-authoring --scenario pan-zoom --steps 48 --stride 2 \
  --viewport 1600x1000 --fiducial --query "floor=ghost&home=child"     # then mv out/pan-zoom out/pz-ghost
node spikes/lod/_shared/capture.mjs h17h18-floor-and-authoring --scenario zoom-in --steps 48 \
  --viewport 1600x1000 --timing-only --query "floor=ghost&home=child"  # then mv out/zoom-in-timing out/t-ghost
node spikes/lod/h17h18-floor-and-authoring/authoring-probe.mjs --viewport 1600x1000
```

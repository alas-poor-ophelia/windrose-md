# verify-notes.md — independent verification of h5-coverage-frontier

Verifier: separate agent, 2026-09-24. Spike source NOT modified. Fresh artifacts written to
`out/vfy-*` so the builder's originals are untouched.

## Rebuild + re-run

`node spikes/lod/_shared/build.mjs h5-coverage-frontier` -> 237.3 KiB, clean.

Re-ran, all at `--viewport 1600x1000 --dpr 1 --fiducial`:

| run | result |
|---|---|
| `zoom-in-out 64/1 fill=inherit&edge=hard&at=shorecorner` | blank 0/78, holes largest 61 px2 / 0 fail, fid max 0.71 / cum 1, pop 5.770/9.970 = **1.73x**, pathDiff 0.001, p95 16.7 ms — **exact match** |
| same, `fill=void&voidcol=dark` | **105 holes/frame, largest 99 px2, 8 fail frames** — exact match |
| same, `fill=void&voidcol=light` | 0 fail frames, largest 61 px2 — exact match |
| same, `edge=feather` | pathDiff mean **0.004** (claimed 0.006), max 0.006 (claimed 0.007) |
| same, `edge=tint` | pathDiff mean **0.005** (claimed 0.003), max 0.006 (claimed 0.005) |
| `lineup` shore-edge, z=2/6/20 | seamRatio hard 1.574 / 0.797 / 0.888, feather 2.334 / 1.019 / 1.119, tint 1.578 / 0.917 / 0.992 — **exact match incl. crossGrad/interiorMax** |
| `lineup` siblings-edge z=20 | scratchPx 1,625,000 exact; scratchMs feather **4.1** (claimed 5.8), tint **3.0** (claimed 6.7) |

The zoom-in-out contact sheet is **byte-identical** (md5 `696840ef...`) to the builder's
`zio-fillinheritedgehard/contact-sheet.png`. The render is fully deterministic.

## Deviations over 15%

1. **pathDiff for feather/tint.** Absolute values are 0.004-0.006 luma either way, i.e. noise
   above `hard`'s 0.001. The *direction* (scratch path introduces hysteresis, hard does not)
   holds. The builder's claim that tint (0.003) is gentler than feather (0.006) does **not**
   reproduce — my run has tint 0.005 >= feather 0.004. Do not rank feather vs tint on pathDiff.
2. **scratchMs.** 30-55% lower on this machine (4.1/3.0 vs 5.8/6.7 ms). `scratchPx` is exact, so
   the difference is host load, not geometry. H5's kill line is still crossed at DPR 2 by a wide
   margin (see below), but the specific millisecond figures in NOTES are not reproducible.

## Things that passed a gate without fully earning it

1. **The headline zoom-in-out trace never crosses a document level.** Apex zoom is **4.88**
   (a 64-step zoom-in-out turns around at the geometric midpoint of 0.62..60), and
   `deepestDrawn` stays **1** for all 78 frames — the depth-2 `grand` doc is never drawn. So G1/G2/
   G3/G4 as reported were measured over a ~8x band inside one level. NOTES does not state this.
2. **G3's 1.73x is camera-speed, not replacement.** The pop max always lands at **step 0**, the
   lowest-zoom step, where per-step screen motion is largest. I re-ran `zoom-in` at `at=grand`
   (0.62 -> 400, depth-2 doc appears at step 6): pop max/median = **4.44x**, again with the max at
   step 0, and the series (24.96, 19.15, 14.30, 11.69, 8.82, 7.33, **6.59**, 5.47 ...) is perfectly
   smooth *through* the level appearance. So the physical claim (no pop at a level transition) is
   confirmed more strongly than the builder's own trace could show — but the 1.73x figure itself
   is trace-dependent and must not be compared to `_template`'s 1.55x, which came from a different
   trace (24-step zoom-in). The contract says exactly this.
3. **G7's favourable seamRatio is cherry-picked framing.** The denominator is `interiorMax` = the
   loudest gradient elsewhere in the probe window, so the number says "quieter than whatever
   happens to be nearby", not "quieter than a lattice stroke". Across the whole inherit+hard
   zoom-in-out trace the `shoreCorner` probe reports **min 1.186, median 2.478, max 16.654** (59
   samples, none degenerate). The reported 0.797/0.888 occur only at the two settle zooms where a
   loud coast/road boundary sits inside the window (interiorMax 29.5 vs 12.2 at z=2). On the
   full-range shorecorner zoom-in the probe reaches **29.768 with interiorMax 0** (flat ocean,
   ratio = crossGrad). The verdict line "the frontier is quieter than an ordinary cell boundary"
   is not supported outside those two framings.
4. **13/50 frozen frames** on the full-range `zoom-in at=shorecorner` (never reported). Past
   z~20 the view is flat ocean with `cellsDrawn 9`; consecutive captures are pixel-identical while
   the zoom moves. Not a renderer bug (never blank, no holes) but it is exactly the G6
   "degradation character past the authored floor" question, and the answer here is "a flat
   blown-up hex", which the NOTES verdict does not surface.
5. **The fill lineups `lineup-shore-fill` / `-siblings-fill` are stale.** Re-running them against
   the rebuilt source reproduces `cellsDrawn` / `erasedShown` exactly but the seam captions change
   (0.339/0/null -> 1.574/0.797/0.888): the probe definition was revised after those PNGs were
   shot. The *pictures* are still valid; the seamRatio captions printed on them are not.
6. **`scratchMs` brackets `drawDocCells`**, so it double-counts work the hard path also pays.
   Checked: this does not matter. At siblings z=20 only 84 cells are drawn against 1.6 M scratch
   px, and the whole-frame draw time is 0.77 ms (hard) vs 3.3 ms (feather/tint), matching the
   mean scratchMs of 2.6-2.9. The scratch overhead is genuine fill-rate.
7. **H9 is not actually cost-tested.** Inherit resolution happens once in `prepare()` (a single
   `coarseColorAt` per erased cell at startup). H9's kill criterion is about *memoised inherit
   resolution on the hot rebuild path*; nothing here exercises it. The spike's H9 evidence is
   visual/semantic only.
8. **DPR 2 was never run.** H5's kill line is stated at DPR 2; every number here is DPR 1. The
   extrapolation (4x the pixels) is safe directionally — 3.0-4.7 ms at DPR 1 cannot land under
   4 ms at DPR 2 — but it is an extrapolation, and the rig supports `--dpr 2`.

## Not cheating

- Footprint is the root ring-12 **cell-centre** hull, the conservative shape the contract asks for;
  the HUD is opaque `#161b24`; the fiducial is drawn last, unantialiased, at `screenOf()`.
- The void-dark G1 failure is a real, reproducible detector bite, and it is reported as a failure.
- `fill=inherit` vs `transparent` really are near-identical by construction (the inherited colour
  *is* `parentColorAtWorld`); the builder says so rather than selling them as two treatments.
  `cellsDrawn` 964 vs 855 = exactly the 109 shown erased cells, confirmed in my run.
- `edge=hard` vs `feather`/`tint` are genuinely different pixels (crossGrad 19.24 / 30.03 / 20.30
  at z=2) even though they are indistinguishable by eye at every framing I looked at.
- The 0.55 px/cell cull is honest LOD culling, not a fast-path flag; the deep doc genuinely
  appears and disappears through it, with no pop.

## Independent read of the images

- `lineup-lake-fill.png` is the decisive sheet and the builder's description of it is accurate.
  `erase=0` shows a solid blue lake; `inherit` leaves 3-4 blue cells in a green field that still
  carries fine child strokes; `transparent` looks the same at z=6 and goes flat at z=20/60;
  `void` (light) is unmistakable hatched violet that fills the frame at z=60 and reads as a
  broken render. The inherit-vs-transparent difference is real but *subtle* — at z=60 I could not
  tell them apart on the greens.
- `lineup-shore-fill.png`: at z=2 the child is a small hexagonal patch of fine texture inside one
  big ocean hex. The "pasted patch" impression is a hex-size impression, not a colour one —
  independently confirmed. The `void` row here is `voidcol=dark` and at z=6 its blob reads as
  near-black, corroborating the hole-detector failure by eye.
- `lineup-vfy-shore-edge.png`: hard / feather / tint are indistinguishable to me at z=2, 6 and 20.
- `vfy-inherit-hard/contact-sheet.png`: 78 frames, continuously growing coastline, no blank, no
  frozen frame, no cut, fiducial 0.71 px on every frame. It also makes limitation (1) visible —
  the whole sweep is root-scale hexes with the fine rosette parked at the top-left.

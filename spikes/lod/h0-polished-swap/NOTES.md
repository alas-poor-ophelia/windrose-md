# h0-polished-swap — the CONTROL ARM

## Hypothesis

Today's shipped sub-hex dive is a **document swap**: zoom is clamped at 4 on the root map, and
crossing that ceiling over a hex that owns a child replaces the rendered document with the child,
re-opened at continuity zoom (z/15) over a still bitmap of the parent. Because continuity zoom
keeps the *camera scale* continuous, nothing about the transition is a scale jump — what jumps is
**content**: one 320 px-radius flat hexagon becomes 169 authored cells in a single frame.

Claim under test: that content substitution is the pop, it is large, and **polish alone (a
crossfade band, or an eased dissolve) does not remove it** — it only redistributes it over time,
at the cost of path independence (G4).

This spike exists so every other spike has a number to beat on G3.

## Plan

One spike, three variants selected by `?swap=`:

| variant | behaviour |
|---|---|
| `hard` (default) | shipped behaviour: clamp at the ceiling, swap in one frame, parent bitmap backdrop under the child, 0.8x hysteresis on the way out, 600 ms cooldown |
| `crossfade` | bead `windrose-5y8`: in the band `[0.85*ceiling, ceiling]` render the target child into an offscreen and composite it over the parent at `alpha = band progress`; hard swap at the ceiling |
| `animated` | hard swap, plus a 200 ms eased opacity+scale dissolve of the outgoing frame over the incoming document |

### Camera model (why this is comparable to other spikes)

The rig needs one continuous `getZoom()/worldAt()/screenOf()`. So the camera here is expressed in
**ROOT world px** at all times, exactly like every other spike, and the swap is modelled *inside*
that camera:

- root world -> doc local is the fixture's `transformToWorld` (scale `1/15` per depth).
- doc-local zoom = `rootZoom * doc.transformToWorld.scale`.
- the shipped ceiling `DEFAULTS.maxZoom = 4` in doc-local zoom therefore lands at
  `rootZoom = 4 * 15^depth` -> **4, 60, 900**.

`zoomRange()` is `0.62 .. 400` (identical to `_shared/fixtureDemo`), so the swap shows up as a pure
content discontinuity, which is the thing being measured. Nothing about the shipped behaviour is
softened by this: at the ceiling over a hex with **no** child the zoom is hard-clamped (today there
is no headroom past `maxZoom`), only one document is ever drawn, siblings are invisible, the
parent's roads and labels vanish when you dive, and the parent is a frozen bitmap.

Backdrop placement is not re-implemented: `computeBackdropPlacement` is imported from
`src/geometry/core/subHexBackdrop.ts` and fed the child-local view, so the blit is the shipped blit.

## What was built

`main.ts`, one spike, three variants on `?swap=`. The ladder, the wall, the hysteresis, the
cooldown and the frozen-bitmap backdrop are all real. `?fiducial=1` and `footprint()` are wired per
the contract; the footprint is the conservative hull of the root ring-12 cell *centres*.

`hysteresis-probe.mjs` (in this folder, not `_shared/`) is an extra G4 probe: `capture.mjs` picks
six GEOMETRIC matched-zoom targets and on this trace **none of them lands inside [3.2, 4.0]**,
which is precisely where a hysteretic swap's path dependence lives. The probe drives the spike's
own wheel handler to the same zoom from below and from above and diffs the two settled frames.

## Measurements

All runs: `--viewport 1600x1000 --stride 1 --steps 64 --fiducial`, chromium, DPR 1, throttle 1x.
Reference for "no pop" from the contract: `_template` scores **1.55x** max/median on a stride-1
zoom-in; the brief's expectation for today's swap was 10-50x.

### G3 — pop (mean abs luma between consecutive stride-1 frames)

| scenario | variant | median | max | max/median | max / local median | where the max is |
|---|---|---|---|---|---|---|
| zoom-in-out | hard | 5.16 | **40.12** | **7.77x** | 7.54x | step 46, z 3.30 -> 2.98, the SURFACE |
| zoom-in-out | crossfade | 5.16 | 38.85 | **7.53x** | 7.30x | same step |
| zoom-in-out | animated | 5.16 | 34.73 | **6.73x** | 6.53x | same step |
| pan-zoom | hard | 4.97 | **46.38** | **9.33x** | 7.08x | step 49, z 3.21 -> 2.89, the SURFACE |
| pan-zoom | crossfade | 4.97 | 45.04 | **9.06x** | 6.84x | same step |
| pan-zoom | animated | 5.20 | 28.11 | **5.41x** | 2.91x | same step |

The DIVE step (root -> range at z 4.05) scores 11.39, i.e. **2.2x** the median. The SURFACE step
scores 40-46, i.e. **7.5-9.3x**. The swap's worst moment is coming back OUT, not going in.

`animated`'s lower max is not an improvement: the 200 ms dissolve is still running when the
neighbouring frames are captured, so its LOCAL median rises from 6.55 to 9.67 while the max falls.
The pop is smeared across three frames, not removed.

### G4 — path independence (`hysteresis-probe.mjs`, gate: mean < 1/255 = 0.0039)

| zoom | variant | from below | from above | mean abs luma |
|---|---|---|---|---|
| 3.3 | all three | root d0 | root d0 | **0.0028 PASS** (one HUD glyph) |
| 3.5 | hard | root d0 | range d1 | **31.38** |
| 3.5 | crossfade | root d0, alpha 0.167 | range d1, alpha 0.375 | **29.99** |
| 3.5 | animated | root d0 | range d1 | **31.38** (bit-identical to hard) |
| 3.7 | hard / crossfade / animated | root | range | 24.00 / 22.27 / 24.00 |
| 3.9 | hard / crossfade / animated | root | range | 16.20 / 14.13 / 16.20 |

**~8000x the gate.** Inside the 0.8x hysteresis band the screen shows a completely different
document depending on which way you arrived. `capture.mjs`'s own `pathDiff` reports
**mean 0.002, max 0.003** for all three variants and would have called this a PASS — only because
its six geometric targets straddle the band (2.54 and 4.05, nothing between). That is a rig blind
spot worth knowing about, not a property of the design.

### G1 — never blank / holes

| scenario | variant | blank frames | hole-fail frames | worst hole |
|---|---|---|---|---|
| zoom-in-out | all three | 0 / 78 | **6** | z 3.30, 607,467 px2 = **38% of the footprint** |
| pan-zoom | all three | 0 / 66 | **5** | z 3.21, 714,520 px2 = **45% of the footprint** |

Not an artefact of the reproduction — this is what the design does. The backdrop is a bitmap
captured at the dive zoom, so it covers the viewport exactly once, at that zoom. Zoom OUT inside
the sub-map and it shrinks: the hole grows monotonically 6,400 -> 123,852 -> 230,833 -> 329,304 ->
518,238 -> 714,520 px2 across z 5.36 -> 3.21, and the frame becomes a letterboxed postage stamp of
frozen map on a black field. Pan at depth and it slides off-centre as well. Whole-frame BLANK never
trips, which is why this is easy to miss: the check that catches it is the footprint-masked hole
detector.

### G2 — anchor

Cumulative drift **0.0000 px** and fiducial drift **max 0.71 px** (the quantisation floor) in all
six runs. The camera never moves at a swap: continuity zoom means the swap is a content change at
constant scale. **PASS**, and this is the one thing today's design gets exactly right.

### G8 — frame budget (1x, `timing.note` = contaminated by capture)

mean 16.67 ms / p95 16.7-16.8 / max 16.8, **0 frames > 33 ms, 0 > 50 ms**, 0 long tasks, in all
six runs. Draw time: hard p95 0.5-1.0 ms, animated p95 1.1 ms (max 13.0 ms on the snapshot frame),
crossfade p95 3.1-3.2 ms — the crossfade band costs ~3x the draw budget because it renders the
child into an offscreen and composites it every frame on top of a full parent render. Not measured
under `--throttle`; **no G8 claim past 1x**.

## Verdict

**The pop is real, it is 5-9x, and polish does not remove it.** Crossfade buys 3% off the worst
step; the 200 ms dissolve buys 13-40% off the max by spreading the same change over more frames.
Both leave the mechanism untouched, and crossfade makes G4 slightly WORSE in character (the two
sides of the band disagree about alpha as well as about which document is open).

The control number every other spike should beat: **max/median 7.77x on zoom-in-out, 9.33x on
pan-zoom**, against the `_template` pure-scale reference of 1.55x. Verdict for this arm: **killed
as a design** (it is the thing being replaced), **succeeded as an instrument**.

Note the brief predicted 10-50x. The honest measurement on this fixture is 5-9x, because the pop
metric is a whole-frame mean and the sub-map only occupies the parent hex — a large part of the
frame is unchanged backdrop on both sides of the swap. The transition is not smaller than believed;
the denominator is larger.

## What I actually saw in the contact sheets

- `zoom-in-out-hard`, frames 14-18 (z 2.5 -> 3.8): the screen is two or three FLAT hexagons, gold
  and grey, getting bigger. Nothing suggests there is a mountain range authored underneath. Frame
  19 (z 4.05): 169 cells appear at once. That is the dive, and it reads as a page turn.
- The child rosette lands INSIDE the parent hex at exactly sqrt(3)/2 of its width, rotated 30
  degrees — the documented corner under-fill is plainly visible as grey parent showing through at
  the parent's six corners. It does not read as a bug *here*, because the parent is a frozen bitmap
  and the eye takes the rosette as "the inset detail map". It would read very differently
  composited live.
- Frames 44-48 on the way out are the worst thing in the whole capture: the frozen backdrop shrinks
  away from the viewport edges and you are looking at a letterboxed postage stamp of map floating
  on black, for two or three frames, before the live root snaps back. In `pan-zoom` the letterbox
  is off-centre (a black bar down the left) because the pan moved the bitmap.
- `pan-zoom` frames 26-38: panning at depth 1, the child rosette and the frozen backdrop move in
  perfect lockstep, pop 3.2-3.4, no drift at all. `computeBackdropPlacement` is exact. This is the
  one genuinely good thing in the shipped design.
- `out/lineup-ceiling.png` (rows = variant, columns = z 3.4 / 3.7 / 3.95 / 4.3 / 9): `hard` shows
  three identical flat hexagons then the rosette. `crossfade` shows a ghost rosette at 3.7 and 3.95
  — and it looks exactly like what the definition doc warns about: washed out, low contrast, two
  lattices half-visible at once, mud. `animated` at settle is PIXEL-IDENTICAL to `hard` in every
  column, which is the honest summary of what a 200 ms dissolve buys: nothing that survives the
  gesture ending.

## Surprises

1. **The surface is worse than the dive** (7.5-9.3x vs 2.2x). All the design attention has gone on
   the dive; the ugly half is coming back out.
2. **The backdrop has no coverage guarantee below the dive zoom.** 38-45% of the footprint goes to
   background inside the hysteresis band. `blankCount` is 0 the whole time — only the
   footprint-masked hole detector sees it.
3. **`capture.mjs`'s `pathDiff` scored all three variants 0.002 (PASS)** while the band scores
   31.38. The six matched targets are geometric and straddle the band. Any future spike with
   hysteresis must be probed at its OWN band, not only on the rig's ladder.
4. **Crossfade and the hard swap disagree about alpha across the band as well as about the
   document** (0.167 vs 0.375 at z 3.5), because the entering band (0.85x) and the leaving band
   (0.8x) are different widths. Making a crossfade path-independent means making the band
   symmetric, which means giving up the hysteresis — and the hysteresis is the only thing stopping
   the swap from chattering.
5. G8 was never in danger at 1x, even with a full extra offscreen render per frame in the crossfade
   band. The swap is not a performance problem. It is entirely a perception problem.

## What to try next

- Give the backdrop a coverage contract instead of a snapshot: either re-render the parent live
  under the child (which is H6's composite, and makes the letterbox impossible by construction), or
  grow the captured bitmap by the hysteresis factor so it still covers at 0.8x. The second is a
  small, shippable fix to the CURRENT product independent of any LOD work.
- Any spike that keeps a hysteretic band must ship its own band probe. Reuse
  `hysteresis-probe.mjs` — it only needs `reset`, `setZoom`, `getZoom`, `metrics`.
- Measure the surface direction explicitly. A `zoom-out` scenario started from depth 2 would put
  the worst transition in the middle of the trace instead of at its end.
- Re-run all of this under `--throttle 4` before anyone quotes the G8 numbers.

## Reproduce

```
node spikes/lod/_shared/build.mjs h0-polished-swap
node spikes/lod/_shared/capture.mjs h0-polished-swap --scenario zoom-in-out --steps 64 --stride 1 --viewport 1600x1000 --fiducial --query "swap=hard"
node spikes/lod/_shared/capture.mjs h0-polished-swap --scenario pan-zoom    --steps 64 --stride 1 --viewport 1600x1000 --fiducial --query "swap=hard"
node spikes/lod/_shared/lineup.mjs  h0-polished-swap --zooms 3.4,3.7,3.95,4.3,9 --variants "swap=hard,swap=crossfade,swap=animated" --viewport 1600x1000 --anchor 512,380 --out ceiling
node spikes/lod/h0-polished-swap/hysteresis-probe.mjs hard
```

`out/<scenario>` is overwritten per run; the captures here were renamed to
`out/<scenario>-<variant>/` afterwards.

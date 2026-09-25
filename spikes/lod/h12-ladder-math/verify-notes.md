# Independent verification — h12-ladder-math (verifier pass, 2026-09-24)

Rebuilt from source (`node spikes/lod/_shared/build.mjs h12-ladder-math`), re-ran
`check-math.mjs`, `check-sets.mjs`, and 4 of the 7 `zoom-in-out --steps 64 --stride 1
--delta -92.8 --fiducial --viewport 1600x1000` captures (ring7s15, r7exact, m13, m3),
preserved as `out/vzio-*`. Spike source NOT modified.

## Reproduced exactly (0% deviation)
Every lattice-math number in NOTES.md: K, linear scale, rotation, cells/parent, tie counts
and tie examples, parentUncovered / childOutside / areaRatio for all 7 ladders, boundary
mean/max px for all 7, the m13 re-seat symmetric difference (12/12, onlyInM13 not all ties),
the r7exact set identity (169/169, 0 ties, 0 symmetric difference), and naive/rescaled
displacement (6.230 / 9.319 / 1.589e-14 px).

Every capture-derived number reproduced bit-identically against the builder's stored runs:
popMed, popMax and maxStep, pathDiff 0/0, fiducial 0.71/1.41, 0 blank, 0 frozen, 0 holeFail.
The rig is deterministic on this spike.

## Two independent checks the spike does not run
1. **Sublattice consistency.** `childWorld(parentToChild(Q,R))` vs `hexPos(Q,R,80)` over
   Q,R in [-4,4]: max error 2.3e-13 px for every ladder including the rotated ones. The
   rotation is folded into placement correctly; parents sit on child-lattice points.
2. **Coverage by the union of ALL parents' children** (NOTES only measures parent (0,0)'s
   own children). 801^2 grid inside parent (0,0), children of every parent within radius 3:
   m3 / m5 / m6 / m13 / a7 / r7exact = **0.000% uncovered**; ring7s15 = **24.869%**.
   This is the decisive confirmation of the central claim: for exact ladders the
   "child area outside parent" number is a drawing-convention artefact, not a hole, and the
   shipped rosette's 24.9% gap is a real hole that neighbouring sub-maps do NOT fill.

## Deviation found (>15%): crossMax for r7exact / m13
NOTES reports `crossMax` 11.412 and `crossMax/popMed` **1.49x / 1.51x** for r7exact / m13.
Recomputing from the builder's own stored `report.json` under the definition NOTES states
(frames whose step has `0.02 < childAlpha < 0.98`) gives **9.268 / 1.21x** and
**8.967 / 1.19x**. Widening to `0 < alpha < 1` reproduces m3's 15.005 / 1.99x and a7's
2.26x but still does not reach 11.412. 11.412 is also *identical to 3 decimals across two
different ladders*, which no frame inside the fade band can be.

| ladder | NOTES cross/med | recomputed (0.02..0.98) | recomputed (0..1) |
|---|---|---|---|
| ring7s15 | 1.22 | 1.22 | 1.22 |
| r7exact | 1.49 | **1.21** | **1.21** |
| m13 | 1.51 | **1.19** | **1.19** |
| m6 | 1.61 | 1.61 | 1.61 |
| m5 | 1.84 | 1.68 | 1.78 |
| m3 | 1.99 | 1.97 | 1.99 |
| a7 | 2.07 | 2.17 | 2.26 |

Direction of the conclusions is unchanged — crossing pop is still monotonic in ladder step
size and still 5-40x below the document-swap reference — but the 15:1-vs-13:1 separation
NOTES reports (1.22 vs ~1.50) is not in the data. The three coarse-step ladders are equal
within noise (1.19-1.22). "Rotation changes the feel by nothing" is strengthened, not weakened.

## Metric caveats the verifier adds
- **popMed is depressed by duplicate frames.** `zoom-in-out` writes 13 "matched-in/out"
  frames that are pixel-identical to the regular frame at the same step (`pop 0`). 13 zeros
  in a 78-frame series pull the median down, so every `crossMax/popMed` ratio is inflated.
  It inflates all variants equally, so cross-variant comparison stands.
- **G2 is satisfied by construction, not earned.** The whole scene is drawn through one
  global `offX + wx*zoom`; the fiducial is drawn through the same expression. There is no
  level snapping or per-level offset that could drift, so 0.71 px is the only answer this
  architecture can give. The gate has no discriminating power on this spike.
- **The zoom traces cannot see G7 at all.** Parents are always opaque under the children, so
  ring7s15's 24.9% gap is invisible in every `zio-*` run (0 blank, 0 holeFail). G7 is carried
  entirely by the lattice math and the `outline=1` lineups. NOTES says this; worth repeating.
- **The fixture hides the crossfade.** Children re-sample the same continuous `terrainAtWorld`
  field as their parents, so the crossing adds resolution but never contradicts the coarse
  layer. Real authored subhex content does contradict it. NOTES flags this under Surprises;
  it is the single biggest limit on the pop numbers.
- **G8 is untested.** All runs are `throttle 1` and vsync-pinned at 16.7 ms.

## Unaddressed cost in the headline recommendation
NOTES calls the r7exact re-seat "one line of scale arithmetic plus a rotation, not a content
migration". `src/geometry/core/subHexBackdrop.ts:79-81` says the opposite: *"An axis-aligned
drawImage rect cannot express a rotated map... Sub-maps the plugin creates are always
unrotated, so a rotated parent or child"* bails out of backdrop capture entirely, and
`subHexBackdropStore.ts:81` lists "rotated parent" as a capture failure that evicts the entry.
H13's own risk list says the same. A -27.795772 deg child frame therefore disables the shipped
parent-backdrop primitive — the thing that keeps the child from being blank today. That is a
compositing rewrite, not one line.

## Kill criteria, honestly
- H12 "the m=13 re-seat is not exact" — **FIRES**. 12 of 169 cells differ, and the differing
  cells are not all ties, so no tie-break repairs it. The free-migration claim to a
  rotation-free ladder is dead. Reproduced independently.
- H12 "the tie rule produces visible asymmetry in the lineup" — **FIRES** for m3/m5/m6/m13.
  Confirmed by eye in `out/lineup-owners.png`: m13's ownership tiles carry single-cell bumps
  with matching notches; m5/m3 are plainly lopsided blobs.
- H12 "both m=3 and m=5 rejected by eye" — does not fire on terrain appearance (both are
  gapless and clean in `lineup-newworlds`); it fires only in the ownership view.
- H12's risk "6 is NOT Loeschian" — correctly voided: K=36 is Loeschian, m6 measures 0%
  uncovered, 0 deg rotation. Verified.
- H13 "the twist is rejected on sight" — partially tested. r7exact at -27.8 deg is genuinely
  indistinguishable from m13 in the trio lineup (I could not tell the rows apart). But the
  fixture has no labels, icons, routes or north affordance, so "a due-north route visibly
  bends" and "alignment drift after two rungs" are untested — this spike has exactly 2 levels.

## Verdict
The math is sound and independently reproducible; the central finding (the shipped rosette is
the exact Voronoi tile of the aperture-169 generator (15,-7), mis-seated at linear 15 instead
of 13) survives verification and is the strongest result in the spike. The feel numbers are
weaker than NOTES presents: one derived metric is overstated by ~23%, and the fixture's
self-consistent terrain means the crossfade was never asked a hard question.

# h12-ladder-math — rotation-free hex sublattice ladders vs the shipped ring-7@15 rosette

## Hypothesis (H12 + H13 control)

H12 claims: a hex sublattice is rotation-free exactly when the aperture K is a perfect
square m^2 AND the (m,0) generator is chosen. Linear scale is then m, orientation is
identical at every rung, and `parentOf(cell) = hexRound(axial/m)`.

The shipped Windrose subhex system is NOT such a ladder: it places a 169-cell ring-7
rosette at linear scale 15 inside the parent hex. 15^2 = 225 slots, only 169 filled, so
the rosette under-fills the parent at the corners. H13 puts that shortfall at 23.3% along
the corner direction.

The decisive question the brief asks: **169 = 13^2 = 3*7*8+1.** Both the ring-7 rosette
and the m=13 Voronoi tile hold exactly 169 cells. Is that a coincidence of counts, or can
the shipped content re-seat onto a rotation-free m=13 ladder losslessly?

Predictions before measuring:
1. m-ladders (m in {3,5,6,13}) tile exactly: child area == parent area, so
   "child area outside parent" == "parent area uncovered" to sampling noise.
2. ring7s15 leaves ~24.9% of the parent uncovered (1 - 169/225) and puts 0% of its child
   area outside... no: it must put *some* outside, since the rosette hull is a different
   shape. Measure both.
3. m=13 cell SET == ring-7 rosette SET. If so, migration is a uniform 15/13 rescale of
   every child doc, exact to float precision, no cell added or lost.
4. Rotation-free does NOT change pop/feel. The crossfade does the work; the lattice only
   changes *where the geometry lies*, not how it animates.

## Variants (`?ladder=`)

| slug | generator (child axial) | K | linear scale | rotation | cells/parent |
|---|---|---|---|---|---|
| `ring7s15` | (15,0) but only ring-7 filled | 225 slots | 15 | 0 deg | 169 |
| `m3` | (3,0) | 9 | 3 | 0 deg | 9 |
| `m5` | (5,0) | 25 | 5 | 0 deg | 25 |
| `m6` | (6,0) | 36 | 6 | 0 deg | 36 |
| `m13` | (13,0) | 169 | 13 | 0 deg | 169 |
| `a7` | (2,1) | 7 | sqrt7 | 19.1066 deg | 7 |

All six render the SAME shared fixture world (root ring-12, hexSize 80, flat-top). Parent
cells are the fixture root doc's terrain. Child cells re-sample `terrainAtWorld` at the
child centre, so children are an honest refinement of the same field.

`?outline=1` switches to lattice-inspection styling: parent hexes painted amber, parent
outlines black, children at full opacity. Any amber that survives is parent area NOT
covered by a child.

## Measurement definitions (stated, not implied)

- **parentUncoveredPct** — dense grid over the parent's bbox; fraction of samples inside
  the parent hexagon that fall in NO child cell of that parent.
- **childOutsidePct** — of samples that fall in a child cell of parent (0,0), the fraction
  lying outside the parent hexagon.
- **boundary agreement** — the child union's outline is built as the set of child-hex edges
  with only one in-set owner. For each parent edge, 240 sample points; distance from each
  to the nearest outline segment. Reported in world px and as % of parent hexSize (80).
- **re-seat** — per-cell distance between `hexPos(q,r, 80/15)` (shipped) and
  `hexPos(q,r, 80/13)` (m=13), for cells present in both sets.

## Plan

1. build, assert the pure math in-page (childCount == K, parentOf round trip, tie set).
2. lineup of all six ladders with `outline=1`.
3. zoom-in-out + pan-zoom at 1600x1000 for every ladder.
4. compare popMax/popMedian for m3 vs ring7s15.

## Results — pure lattice math

Measured by `check-math.mjs` / `check-sets.mjs` (esbuild -> cjs -> node, same `lattice.ts`
the page uses) and re-reported live in `metrics()`. Containment grid 1001x1001 over the
parent bbox; boundary 240 samples per parent edge; parent hexSize = 80 world px.

| ladder | K | linear scale | rotation | cells/parent | ties | parent uncovered | child outside | area ratio | boundary mean px | boundary max px |
|---|---|---|---|---|---|---|---|---|---|---|
| `ring7s15` (SHIPPED) | 225 slots | 15 | 0.000000 deg | **169 of 225** | 0 | **24.882%** | **0.000%** | 0.75118 | 9.151 (11.44%) | 19.114 (23.89%) |
| `r7exact` (15,-7) | 169 | **13** | **-27.795772 deg** | 169 | **0** | **1.467%** | 1.493% | 1.00027 | **0.888 (1.11%)** | **2.409 (3.01%)** |
| `m13` (13,0) | 169 | 13 | 0.000000 deg | 169 | 12 | 3.571% | 3.538% | 0.99965 | 1.640 (2.05%) | 5.274 (6.59%) |
| `m6` (6,0) | 36 | 6 | 0.000000 deg | 36 | 5 | 7.888% | 7.888% | 1.00000 | 3.849 (4.81%) | 11.403 (14.25%) |
| `a7` (2,1) | 7 | 2.6458 | **19.106605 deg** | 7 | 0 | 7.131% | 7.158% | 1.00030 | 4.364 (5.46%) | 8.674 (10.84%) |
| `m5` (5,0) | 25 | 5 | 0.000000 deg | 25 | 6 | 11.996% | 12.015% | 1.00022 | 6.515 (8.14%) | 15.917 (19.90%) |
| `m3` (3,0) | 9 | 3 | 0.000000 deg | 9 | 2 | 14.758% | 14.822% | 1.00075 | 7.698 (9.62%) | 22.950 (28.69%) |

All `countOK` and `roundTripOK` true. `rotationIsZero` true for every `(m,0)` generator to
float precision, false for `(2,1)` and `(15,-7)`.

### What the two containment numbers actually mean (they are NOT the same defect)

For every EXACT ladder the two numbers agree to sampling noise and `area ratio == 1`: the
corner of a parent hexagon is covered by a NEIGHBOUR parent's child, and the child that
sticks out covers a neighbour's corner. Nothing is missing; the coarse outline is simply a
different shape from the union of its own children. That is the Welsh Piper half-hex
situation and it is a drawing convention, not a hole.

`ring7s15` is the one row where the two differ: **0.000% of the rosette lies outside the
parent hex, and 24.882% of the parent hex is bare.** The shipped child never overflows —
it under-fills, and the neighbours do not fill in for it, because the rosettes tile only
along the edge normals. So a quarter of every parent is a REAL hole in the fine layer.

`ring7s15` boundary max = 19.114 px = **23.89% of parent hexSize**, which is the 23.3%
corner shortfall quoted in H13, measured independently here.

### The 169 coincidence is not a coincidence — but it is not m=13 either

169 = 13^2 = 3*7*8+1. Both the shipped ring-7 rosette and the m=13 Voronoi tile hold 169
cells. They are NOT the same set:

- `onlyInRing7` (12): (-7,0) (-7,1) (-7,6) (-7,7) (-6,-1) (-6,7) (-1,-6) (0,-7) (0,7) (1,-7) (7,-7) (7,0)
- `onlyInM13` (12): (-8,4) (-4,-4) (-4,8) (-3,8) (3,5) (4,-8) (4,4) (5,-8) (5,3) (8,-5) (8,-4) (8,-3)
- the 12 differing m13 cells are NOT all ties (`onlyInM13 all ties? false`), so no choice of
  tie-break makes m=13 reproduce the rosette.

169 has a SECOND Loeschian representation: `15^2 + 15*(-7) + (-7)^2 = 169`. The sublattice
generated by (15,-7) has aperture 169, **linear scale exactly 13**, rotation
**-27.795772 deg**, and its Voronoi tile is the ring-7 rosette **exactly — 169 of 169
cells, zero ties, zero symmetric difference**. It is also the best-behaved ladder measured
(1.467% uncovered, 0.888 px mean boundary error — 2.4x better than rotation-free m=13).

So the shipped 169-cell rosette *is* a legitimate exact hex sublattice tile. The shipped
code just places it at the wrong scale: **linear 15 with no rotation, instead of linear 13
with -27.7958 deg.** That single mis-seating is the whole 24.9% corner gap.

### Migration verdict for authored subhex content

| target | cells preserved | what changes | lossless? |
|---|---|---|---|
| `r7exact` (15,-7) | **169/169, identical axial indices** | placement affine only: scale 1/15 -> 1/13, plus a -27.7958 deg rotation of the child frame | **YES** — zero cells added or lost, `rescaledMaxPx 1.6e-14` |
| `m13` (13,0), rotation-free | 157/169 | 12 cells change owner (7.1%) and 12 new corner cells appear unauthored | **NO** |

`reseat.naive*`: if you keep the child document exactly as authored and only swap the
ladder 15 -> 13 without rescaling, cells move by mean **6.230 px**, max **9.319 px** =
**1.747 child cells**. With the uniform 15/13 = 1.153846 rescale the displacement is
**1.589e-14 px** — exact. The rescale is the migration; the rotation is the price.

## Results — stills (lineups)

`out/lineup-trio169.png` (ring7s15 / r7exact / m13) and `out/lineup-newworlds.png`
(m3 / m5 / m6 / a7), 760x760 per cell, `outline=1` (parents painted amber, children opaque,
parent outlines black, focus parent heavy). Any amber visible is parent area no child covers.

What is actually on screen:

- **ring7s15 is not subtle.** At z=0.7 the whole map reads as an amber lace lattice over
  the terrain; at z=1.6 the gaps form a regular field of amber six-pointed stars and
  bow-ties; at z=4 the focus parent shows six enormous amber wedges filling its corners.
  The rosette hull is visibly a hexagon rotated 30 deg against the parent: the green
  touches the black outline exactly at each of the six EDGE MIDPOINTS and is far inside it
  at all six corners. The gaps are shared between adjacent parents, so they are interior
  holes between sibling sub-maps, not a map rim.
- **r7exact, m13, m6, m5, m3 show no amber at all.** Gapless, no overlap, continuous hex
  field. The parent outline simply cuts through boundary child cells — most visibly on m3
  at z=4, where the black hexagon slices six children in half.
- **r7exact vs m13 are visually indistinguishable at every zoom tested** despite r7exact
  being rotated 27.8 deg. A field of 6-fold-symmetric hexes with no compass and no labels
  carries no orientation cue; the rotation only becomes legible when a coarse outline or a
  coarse neighbour grid is co-visible, and even then it reads as "the outline is drawn on
  top of the grid", not as tilt.
- **a7 is the exception: its 19.1 deg twist IS legible** at z=4, where the child hexes are
  clearly tilted against the parent outline. Ironically the SMALLER rotation is the more
  visible one, because 19.1 deg reads as "slightly crooked" while 27.8 deg is close enough
  to the 30 deg half-period that it reads as a different-but-regular grid.
- **The lineup as drawn does NOT test H12 tie asymmetry.** Ownership is invisible when
  every child is painted in terrain colour. `?owner=1` (3-colour wash by owning parent) was
  added for that; see below.

`out/lineup-owners.png` answers it. Each child is painted by its OWNING parent
(3-colour wash), `outline=1`, at z=1.6 and z=4:

- `ring7s15` — ownership tiles are perfect, 6-fold-symmetric rosettes... separated by a
  connected amber web of un-owned area. Beautiful tiles, broken tiling.
- `r7exact` — a flawless honeycomb of rosettes, gapless, every tile identical and
  symmetric, **zero ties**. Textbook.
- `m13` — tiles are hexagonal but visibly RAGGED: single-cell bumps on some edges with
  matching notches on the opposite edge. Not 6-fold symmetric.
- `m6`, `m5`, `m3` — progressively worse. At z=4 the m3 tile is an obviously lopsided
  9-cell blob; at z=1.6 the m5/m6 tiles read as irregular clusters, not hexes.

**H12's kill criterion "the tie rule produces visible asymmetry" FIRES for every
rotation-free `(m,0)` ladder that has ties (m3, m5, m6, m13) and does NOT fire for the
two tie-free ladders (`r7exact`, `a7`) or for the shipped rosette.** The rotation-free
family buys zero rotation and pays for it in lopsided ownership tiles.

Honest scope limit: ownership asymmetry is only visible when ownership is DRAWN. In the
terrain lineup and in every zoom trace it is invisible, because children composite over
parents as imagery. It matters for which sub-document an authored cell belongs to, for
cache tiling, and for any UI that outlines "this coarse hex's children" — not for the
rendered map.

## Results — continuous 2-level zoom (the FEEL question)

14 captures at 1600x1000: `zoom-in-out --steps 64 --stride 1 --delta -92.8 --fiducial`
and `pan-zoom --steps 48 --stride 2`, one pair per ladder, in `out/zio-<ladder>/` and
`out/pz-<ladder>/`. `crossMax/popMed` is pop at the LEVEL CROSSING only (frames where
`0.02 < childAlpha < 0.98`) divided by that run's own pop median — the ladder-attributable
part of G3, with the exponential-camera baseline divided out.

| zoom-in-out | child size | popMed | popMax | popMax/med | crossMax | crossMax/popMed | pathDiff | fiducial | holes | p95 ms | >50 ms |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `ring7s15` | 1/15 | 7.244 | 22.755 | 3.14 | 8.827 | **1.22** | 0 / 0 | 0.71 px | 0 | 16.8 | 0 |
| `r7exact` | 1/13 | 7.659 | 22.754 | 2.97 | 11.412 | **1.49** | 0 / 0 | 0.71 px | 0 | 16.8 | 0 |
| `m13` | 1/13 | 7.560 | 22.754 | 3.01 | 11.412 | **1.51** | 0 / 0 | 0.71 px | 0 | 16.8 | 0 |
| `m6` | 1/6 | 8.080 | 22.755 | 2.82 | 13.042 | **1.61** | 0 / 0 | 0.71 px | 0 | 33.3 | 0 |
| `m5` | 1/5 | 7.799 | 22.756 | 2.92 | 14.360 | **1.84** | 0 / 0 | 0.71 px | 0 | 16.7 | 0 |
| `m3` | 1/3 | 7.526 | 22.791 | 3.03 | 15.005 | **1.99** | 0 / 0 | 0.71 px | 0 | 16.8 | 0 |
| `a7` | 1/2.646 | 7.102 | 22.757 | 3.20 | 14.733 | **2.07** | 0 / 0 | 0.71 px | 0 | 33.3 | 2 |

Every run: 0 blank frames, 0 frozen frames, 0 hole-fail frames, `pathDiff mean 0 / max 0`
over 6 matched zoom pairs, self-reported cumulative anchor drift 0, fiducial drift
**0.71 px = the quantisation floor**. `popMax` (22.75) is the same in every run and does
NOT occur at the crossing — it occurs at step 3, z~0.47, where the world silhouette is
sweeping past the background. That is camera motion, not LOD.

**Rotation-free changes the feel by nothing.** `m13` (0 deg) vs `r7exact` (-27.8 deg) at
the same 13:1 step: 1.51 vs 1.49. Indistinguishable. What actually drives crossing pop is
the LADDER STEP SIZE, monotonically: 15:1 -> 1.22, 13:1 -> 1.5, 6:1 -> 1.61, 5:1 -> 1.84,
3:1 -> 1.99, sqrt7:1 -> 2.07. A bigger step means a larger apparent change per crossfade.
All of these are a smooth dissolve in the contact sheets; none is a cut. For reference the
shipped document swap is quoted at 10-50x.

Watching the sheets: the crossing is a gradual dissolve in every ladder. `m3`'s is the most
visible (the terrain re-resolves over ~6 frames around z=1.7-3.5) and `ring7s15`'s the least.
`m3` also shows the cost of a small step: by z=14 only ~6 enormous hexes fill the screen,
because one m=3 rung buys 1.6 octaves while one 15:1 rung buys 3.9.

**pan-zoom is inconclusive for 5 of 7 ladders.** The rig's calibrated wheel delta only
reaches z=1.76 in that scenario, so `ring7s15`, `r7exact` and `m13` never leave level 0
(`alphaMax 0`) and `m5`/`m6` only reach alpha 0.33/0.14. Only `m3` (alpha 0.997) and `a7`
(alpha 1) actually pan with two levels live; both are clean (crossMax/popMed 1.05 and 1.10,
0 holes, 0 blank, 0 frozen). Re-run pan-zoom with `--delta -92.8` to make it bite.

G8 caveat: all timing is `throttle 1` and labelled "contaminated by capture". `zio-a7` shows
`p95 33.3, max 66.6, 2 frames > 50 ms` — a7 is the only ladder that trips it, and only
because it draws the largest child cells. No ladder was measured under `--throttle 6`.

## Gate verdicts (numbers from report.json, not assertion)

| gate | verdict | evidence |
|---|---|---|
| G1 never blank | PASS (all 7) | 0 blank frames, 0 hole-fail frames, largest background component 47-139 px2, none over the 8x8 bbox threshold |
| G2 anchor | PASS (all 7) | cumulative self-reported drift 0; fiducial 0.71 px = quantisation floor |
| G3 no pop | PASS (all 7) | crossing pop 1.22x-2.07x of each run's own median; no outlier at the crossing |
| G4 path independence | PASS (all 7) | pathDiff mean 0, max 0 over 6 matched pairs |
| G6 degradation past the floor | NOT TESTED | this spike has exactly 2 levels and never zooms past the finest |
| G7 no seam at settle | **FAIL for `ring7s15`**, PASS for the other 6 | 24.882% of every parent uncovered; visible as an amber web in `lineup-ladders`. Exact ladders: 0% uncovered by the union of ALL children |
| G8 frame budget | PASS at throttle 1 for 6 of 7; `a7` 2 frames > 50 ms | not measured under throttle |

## Verdict

1. **Rotation-free `m^2` ladders are real and cheap, and rotation is not the axis that
   matters.** Every `(m,0)` generator gives exactly 0 rotation, a total single-valued
   parent map, and an exact tiling. But swapping rotation for zero rotation changes pop by
   nothing (1.49 vs 1.51) and buys a lopsided ownership tile (2-12 tie cells per parent,
   visible in `lineup-owners`). H12's own kill criterion fires on its own family.
2. **Viable for NEW worlds: m=5 and m=6 are both legal and both fine.** H12's risk note
   ("6 is NOT Loeschian, so a 6:1 rung is not a legal hex sublattice at all") conflates
   aperture 6 with LINEAR scale 6. K = 36 = 6^2 + 6*0 + 0^2 is Loeschian and `m6` measures
   0 uncovered area, exact tiling, 0.000000 deg rotation. Worldographer's 6:1 and Welsh
   Piper's 5:1 are BOTH available. That risk is void.
3. **Shipped subhex content CAN migrate losslessly — but not to a rotation-free ladder.**
   The 169-cell ring-7 rosette is exactly the Voronoi tile of the aperture-169 sublattice
   generated by (15,-7): 169/169 cells, 0 ties, 1.467% containment error (the best of every
   ladder measured). Migration = change the placement affine from `scale 1/15, rot 0` to
   `scale 1/13, rot -27.795772 deg`. Zero cells added or lost; displacement after the 15/13
   rescale is 1.6e-14 px. Migrating to rotation-free `m13` instead costs 12 of 169 cells
   (7.1%) changing owner and 12 unauthored corner cells appearing.
4. **The shipped ladder is the only one that fails G7, and it fails it badly.** It is not
   a subtle rim effect: 24.882% of every parent hex has no child at all, in a connected web
   shared between siblings. The fix is one line of scale arithmetic plus a rotation, not a
   content migration.

## Surprises

- The 169 coincidence resolves in favour of the SHIPPED tile, not the rotation-free one.
  The rosette is a legitimate exact sublattice tile; the code just seats it at scale 15
  instead of 13.
- `r7exact` beats every rotation-free ladder on containment (1.467% vs m13's 3.571%) and is
  the only 169-cell ladder with zero ties.
- Rotation is nearly invisible in practice. 27.8 deg (`r7exact`) is undetectable in both the
  terrain lineup and the zoom traces; 19.1 deg (`a7`) is the ONE that reads as crooked,
  because it is far from the 30 deg half-period. Bigger twist, less visible.
- In terrain colours the shipped 24.9% gap is nearly invisible, because the parent layer
  underneath carries the same field. The fixture's children refine their parents honestly;
  real Windrose children contradict them (a lake where the parent says forest), and there
  the gaps WILL show. Do not read the terrain lineup as exoneration.
- Crossing pop is driven by ladder step size alone, monotonically across six ladders.
- Rig bug: `lineup.mjs` documents `--cell PX` in the contract but `cell` is missing from its
  `VALUE_FLAGS`, so `--cell 430` silently becomes `1` and the sheet renders 218 px wide.
- Self-inflicted: naming a new local `const base` inside a block that already had
  `const base = L.parentToChild(...)` produced a bundle-time TDZ error that only surfaced
  as a 15 s `waitForFunction` timeout in the rig. Five capture runs were lost before I
  looked at `pageerror`.

## What to try next

1. Re-seat the shipped ladder to `(15,-7)`: scale 1/13, rotation -27.795772 deg, and
   re-measure G7 on real authored content. This is the single highest-value change found.
2. Decide whether a rotated child frame is acceptable. It is invisible on hex fill but it
   rotates labels, icons and any north affordance inside a sub-map. H13's alternating-
   conjugate trick applies here too: (15,-7) then its conjugate returns to 0 after two rungs.
3. Re-run `pan-zoom --delta -92.8` so all seven ladders actually cross a level while panning.
4. Measure G8 under `--throttle 6`. `a7` already trips 50 ms twice at 1x.
5. Test G6: add a third rung and zoom past the authored floor.

## Files

- `lattice.ts` — all the math (ladders, containment, boundary, re-seat, asserts). Pure, no DOM.
- `main.ts` / `index.html` — the spike. `?ladder=` `?outline=1` `?owner=1` `?fiducial=1`.
- `check-math.mjs` / `check-sets.mjs` — node harnesses that run `lattice.ts` headless.
- `summarise.mjs` — cross-run table from every `out/*/report.json`.

## Commands

```
node spikes/lod/_shared/build.mjs h12-ladder-math
node spikes/lod/h12-ladder-math/check-math.mjs
node spikes/lod/h12-ladder-math/check-sets.mjs
node spikes/lod/_shared/lineup.mjs h12-ladder-math --viewport 760x760 --anchor 380,380 \
  --zooms 0.7,1.6,4 --out trio169 \
  --variants "ladder=ring7s15;outline=1,ladder=r7exact;outline=1,ladder=m13;outline=1"
node spikes/lod/_shared/capture.mjs h12-ladder-math --scenario zoom-in-out --steps 64 \
  --stride 1 --delta -92.8 --fiducial --viewport 1600x1000 --query "ladder=m13"
node spikes/lod/h12-ladder-math/summarise.mjs
```

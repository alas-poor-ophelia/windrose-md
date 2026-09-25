# h5-coverage-frontier

Coverage / replacement semantics (H5) + inherit-down (H9) + the frontier look.

## Hypothesis

Two separate questions are usually conflated as "alpha":

1. **Coverage semantics** — what does an *unpainted* cell inside an authored child
   document do to the coarse content beneath it? Three candidate answers:
   - `inherit`  — the cell IS its parent's value; paint it with `coarseColorAt` sampled
     at the child cell centre, at the child's own lattice (H9 down-inheritance).
   - `transparent` — paint nothing; the parent's own pixels (and parent lattice, and
     the parent's true colour boundaries) show through the hex-shaped window.
   - `void` — a deliberate empty: hatched void colour, visibly *not* terrain.
2. **Frontier** — what happens at the child document's hull, where authored detail
   stops and the coarse world resumes? `hard` | `feather` (8 px alpha ramp) |
   `tint` (parent colour bleed inward from the hull).

Claim under test: the combination that reads as "authored detail inside a coarse world"
rather than "a patch pasted on" is a *coverage* choice first and an *edge* choice second,
and the two interact — a soft edge cannot rescue the wrong coverage semantics.

## Plan

- Simultaneous composite (own minimal implementation, not waiting on h6): all six fixture
  docs drawn depth-ascending at their `transformToWorld` affines, each doc culled out when
  its cell falls below 0.55 CSS px. Child over parent = opaque replacement.
- Erase-at-depth on the fixture *in the spike* (never mutating `_shared/fixture.ts`):
  radius-1/2 axial blobs removed from `forestA`, `forestB`, `shore`, `range`, `grand`
  (116 cells), deliberately placed both in document interiors and biting the ring-7 hull,
  so the semantics choice is visible in the middle of a child AND at its frontier.
- `feather`/`tint` go through a per-child offscreen scratch sized to the hull's on-screen
  bbox clipped to the viewport: draw the child at alpha 1, then apply six per-edge gradient
  quads (`destination-out` for feather, `source-atop` for tint), then one blit. This is
  H5's "composite replacements into a scratch at alpha 1" shape, and it gives the scratch
  cost number H5's kill criterion asks for.
- Seam probe: `__lod.metrics().seams`. Screen-space scanlines centred on known world-space
  hull crossings; `seamRatio = max |dLuma| within +-6 CSS px of the crossing / max |dLuma|
  elsewhere in the window`.

## Variants

| id | query | what it isolates |
|---|---|---|
| V1 | `fill=inherit&edge=hard` | H9 down-inheritance, no edge treatment |
| V2 | `fill=transparent&edge=hard` | parent shows through per cell |
| V3 | `fill=void&edge=hard` | authored-clear is its own state (`voidcol=dark|light`) |
| V4 | `fill=inherit&edge=feather` | 8 px alpha ramp on the hull |
| V5 | `fill=inherit&edge=tint` | parent colour bleed inward from the hull |
| — | `erase=0` | control: every child cell authored |

Anchors: `?at=siblings` (the forestA/forestB shared edge, where two ring-7 hull corners
kiss at the parent edge midpoint), `?at=shorecorner` (the isolated child's hull corner),
`?at=lake` (forestA's interior erase blob, child lake over parent forest),
`?at=fiducial` / `?at=grand` (dive to depth 2).

## Measurements

All at `--viewport 1600x1000`, DPR 1, seed 1, anchor `at=shorecorner` unless stated.
`zoom-in-out --steps 64 --stride 1 --fiducial`; `pan-zoom --steps 48 --stride 2 --fiducial`.

### Gates, per variant (zoom-in-out)

| variant | blank | holes >8x8 | anchor cum (self) | fiducial max | pop max/median | pathDiff mean | p95 frame |
|---|---|---|---|---|---|---|---|
| inherit + hard | 0/78 | 0 (largest 61 px2) | 0 px | 0.71 px | 1.73x | 0.001 | 16.8 ms |
| transparent + hard | 0/78 | 0 (largest 61 px2) | 0 px | 0.71 px | 1.73x | 0.001 | 16.8 ms |
| void + hard (`voidcol=dark`) | 0/78 | **8 frames, 105 holes/frame** | 0 px | 0.71 px | 1.72x | 0.001 | 16.8 ms |
| void + hard (`voidcol=light`) | 0/78 | 0 (largest 61 px2) | 0 px | 0.71 px | 1.71x | 0.001 | 16.8 ms |
| inherit + feather | 0/78 | 0 (largest 61 px2) | 0 px | 0.71 px | 1.73x | 0.006 | 16.7 ms |
| inherit + tint | 0/78 | 0 (largest 61 px2) | 0 px | 0.71 px | 1.73x | 0.003 | 16.8 ms |

`pan-zoom`: every variant 0/27 blank, 0/27 frozen, 0 holes, pan anchor drift 0 px,
fiducial max 0.71 px / cumulative 1.41 px, p95 16.7-16.8 ms.

Reference points from the contract: `_template` pop max/median **1.55x** on its own trace;
today's shipped document swap is **10-50x**. Fiducial **0.71 px is the quantisation floor**.

### G7 — seam gradient across the hull (`metrics().seams.shoreCorner`)

`seamRatio = max |dLuma| within +-6 CSS px of the hull crossing / max |dLuma| elsewhere in
the window`. The denominator is the loudest ordinary hex-lattice stroke nearby, so
**ratio 1.0 means "the frontier is exactly as loud as a normal cell boundary"**.

| edge | z=2 | z=6 | z=20 |
|---|---|---|---|
| hard | 1.574 | **0.797** | **0.888** |
| feather (8 px) | 2.334 | 1.019 | 1.119 |
| tint (8 px) | 1.578 | 0.917 | 0.992 |

Raw crossGrad at z=20: hard 23.82, feather 30.11, tint 26.67 (interiorMax 26.8-26.9).

### Scratch cost (H5's offscreen composite)

`metrics().scratchMs` / `scratchPx`, measured at settle, 1600x1000 DPR 1:

| view | live children | scratchPx | feather | tint |
|---|---|---|---|---|
| shorecorner z=2 | 1 | 79,728 | 1.6 ms | 2.3 ms |
| shorecorner z=6 | 1 | 314,400 | 2.6 ms | 2.6 ms |
| shorecorner z=20 | 1 | 524,000 | 1.5 ms | 1.8 ms |
| siblings z=6 | 2 | 940,800 | 6.1 ms | 5.2 ms |
| siblings z=20 | 2 | 1,625,000 | **5.8 ms** | **6.7 ms** |

### G8 — frame budget (`--timing-only`, zoom-in 48 steps)

| variant | 1x p95 | 1x >50ms | 6x p95 | 6x >50ms |
|---|---|---|---|---|
| inherit + hard | 16.7 ms | 0 | 149.9 ms | 111 |
| inherit + feather | 16.8 ms | 0 | 83.4 ms | 74 |
| inherit + tint | 16.8 ms | 0 | 200.0 ms | 175 |

`_template` at 6x for comparison: p95 66.8 ms, 123 frames > 50 ms. This spike caches
nothing and re-renders every doc every frame, so the 6x column measures the naive
renderer, not the coverage/frontier treatment. The 6x ordering (feather < hard < tint) is
not stable enough across runs to rank the variants; do not read it as one.

## What the images actually show

**`out/lineup-lake-fill.png`** (inside forestA, on the interior erase blob, where the child
is LAKE and the parent is FOREST — the only framing that forces the three fill semantics
apart) is the decisive one:

- `erase=0` control: the 19-cell lake is a solid blue mass.
- `inherit`: the lake is reduced to 3-4 blue cells sitting in a field of forest-green
  cells **that still carry the child's lattice strokes**. It reads as "these fine cells
  exist and happen to match their surroundings" — authored detail, not a hole.
- `transparent`: at z=6 almost indistinguishable from `inherit`; at z=20 and z=60 the
  difference is exactly the lattice — the erased region goes FLAT, a hex-shaped window
  onto the coarse world. It reads as the fine grid *falling away in patches*, which for a
  hex editor is also a usability regression (there is nothing to aim a brush at).
- `void` (light): unmistakable hatched violet. Correct as an explicit "deliberately
  empty", far too loud to be the meaning of "no value stored". At z=60 it fills the frame
  and reads as a broken render.

**`out/lineup-shore-fill.png` / `out/lineup-shore-edge.png`** (the isolated child's hull
corner): at z=2 the shore rosette is a small hexagonal patch of FINE texture inside one big
root ocean hex — this is the "patch pasted on" impression, and it is a **lattice-scale**
impression, not a colour one. The child refines its parent honestly (ocean over ocean), so
the hull is nearly invisible as a colour edge; what gives it away is that the hexes suddenly
get 15x smaller. At z=6 and z=20 `hard`, `feather` and `tint` are very hard to tell apart by
eye, and the seam numbers agree.

**`out/lineup-siblings-fill.png` / `-edge.png`** (the forestA/forestB shared edge): forest
over forest, essentially zero contrast; all six rows look the same at every zoom. The
fixture's road runs almost exactly along the two children's centre line, straight through
the point where their hull corners kiss.

**`out/zio-*/contact-sheet.png`**: the zoom-in-out sweeps are smooth throughout. No frame
in any variant shows a document swap, a blank, or a frozen frame; the coastline grows
continuously and the fine rosette stays anchored under the cursor.

## Verdict

**`fill=inherit` + `edge=hard` is the combination that reads as "authored detail inside a
coarse world".** Promising, with two caveats and one kill.

1. **Coverage semantics is the whole game; the edge treatment is nearly free of effect.**
   `inherit` wins because a cell with no stored value still *draws as a cell*: terrain
   continuous with its parent, lattice continuous with its siblings. `transparent` is the
   same picture minus the lattice, and losing the lattice is what makes a region read as a
   hole. `void` must exist as a fifth state but can never be the default meaning of
   "unpainted".
2. **`edge=feather` is killed.** It does not soften anything measurable (seamRatio 1.02-1.12
   vs hard's 0.80-0.89 — it makes the frontier *louder*), it costs a full-viewport offscreen
   scratch, and it introduces hysteresis (pathDiff 0.006 vs 0.001). The mechanism: six
   per-edge `destination-out` gradient quads double-erase where two edges meet, and a
   ring-7 rosette's hull corner is exactly where sibling sub-maps touch. A soft frontier
   would have to be built from a single distance field over the whole hull, not per edge.
3. **`edge=tint` is neutral** (seamRatio 0.92-0.99 vs 0.80-0.89) and costs the same scratch.
   There is no evidence here that it is worth the cost.
4. **H5's own kill criterion is hit.** A per-child offscreen scratch at 1600x1000 costs
   **5.8-6.7 ms/frame at DPR 1** with two children live, against H5's 4 ms-at-DPR-2 line. Any
   frontier treatment that needs a scratch has to bound it to a band around the hull, not
   the hull's whole on-screen bbox.

Under `hard` + `inherit` every gate passes: G1 0/78 blank and 0 holes, G2 fiducial 0.71 px
(the floor), G3 pop 1.73x (vs `_template`'s 1.55x on its own trace and a document swap's
10-50x), G4 pathDiff 0.001, G7 seamRatio 0.80-0.89 (the frontier is quieter than an ordinary
cell boundary), G8 p95 16.8 ms with 0 frames over 50 ms at 1x.

## Surprises

- **The frontier is not a colour problem.** Every soft-edge idea in the brief assumes the
  hull shows as a visible seam. Measured, the hard hull is already *quieter than a lattice
  stroke* (seamRatio 0.80-0.89) because the fixture's children refine their parent honestly.
  What actually reads as "a patch pasted on" is the 15x jump in hex size. No alpha treatment
  addresses that.
- **Feather made the seam worse, not better**, and specifically at a hull corner — the one
  place that matters, because that is where adjacent sub-maps meet.
- **"Deliberate void" is indistinguishable from "render failed" to an automated coverage
  check.** `voidcol=dark` (#14171f, the obvious choice) produced **105 background-coloured
  components per frame and 8 fail frames** inside the footprint; `voidcol=light` (#394051)
  produced 0. Same semantics, same geometry — purely the colour. An authored-clear state
  has to be painted in something no renderer would ever leave behind.
- **A hull-edge-midpoint probe reads 0.** The ring-7 rosette under-fills its parent at the
  hull edge midpoints, so a scanline there has parent on both sides. Probes must cross at a
  hull CORNER (30 deg + 60k), where the outermost rim cell's own edge midpoint IS the hull.
- **The fixture's road runs straight through the siblings' kiss point**, so the first
  siblings-axis probe was measuring the road's edges (crossGrad ~102, interior 0) and not a
  seam at all.
- `inherit` and `transparent` are *pixel-identical except for lattice strokes* — which is
  exactly H9's seed-continuity claim, confirmed visually, and it is the strokes that carry
  the whole difference in how the two read.

## What to try next

1. **Bound the scratch to a hull band.** Clip the offscreen to an annulus `edgePx` wide
   around the hull instead of the hull's bbox; the interior needs no compositing at all.
   That is the only way any soft-frontier treatment survives H5's 4 ms budget.
2. **Stop treating the frontier as an edge problem and treat it as a lattice problem.**
   The next experiment worth running is a *lattice* transition (fade the child's stroke
   alpha in near the hull, or draw intermediate-scale strokes in the parent's rim) rather
   than a colour/alpha transition.
3. **Erase-to-inherit vs erase-to-void needs an authoring gesture test**, not a rendering
   test. This spike shows both are renderable and stable; H5's open risk is whether anyone
   ever wants `void`.
4. If a soft hull is still wanted, build it from **one distance field over the whole hull
   polygon** (a single radial/SDF mask), so corners do not double-apply.
5. Re-run the seam probes at DPR 2. Everything here is DPR 1; the contract notes no
   `devicePixelRatio` is used anywhere in the shipped renderer, so the seam's sub-pixel
   behaviour at DPR 2 is untested.

## Known limits of this spike

- No caching or tiling of any kind: every doc is re-rendered every frame. G8 at 1x passes
  comfortably; the 6x throttle column is a property of the naive renderer, not of the
  coverage semantics.
- Only one seam probe stays on screen at every zoom (`shoreCorner`, which is also the
  `at=shorecorner` anchor). `forestACorner` and `grandCorner` report `null` outside their
  own anchors' framings, and that is what the `null`s in the lineup captions mean.
- `interiorP90` is reported but is flat 0 at every zoom (strokes are 2-4 px out of a
  ~500-sample window); `interiorMax` is the statistic the ratio uses.
- `_shared/lineup.mjs` does not list `cell` in `VALUE_FLAGS`, so `--cell N` silently
  collapses the grid to 1 px columns. Do not pass it.

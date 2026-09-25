# g1-global-lattice — the whole map subdivides, and unauthored cells inherit

## Hypothesis

Stop treating sub-regions as documents. The ENTIRE map carries a finer hex lattice at every
zoom band, like slippy-map zoom levels. Zooming in splits *every* visible hex, not just the
one under the cursor. A fine cell with no authored content draws its coarse ancestor's
colour, stroked with the fine lattice; a fine cell with authored content replaces it.

If that is right, then:

1. There is no document identity anywhere in the renderer, so there is nothing to swap.
2. A level crossing changes only the LATTICE, never the colour field — so the crossing
   should be invisible to a pixel-delta metric even when the level flips 39 times under a
   hand-waggle.
3. Past the deepest authored rung the map keeps subdividing into smaller inherited hexes
   and never becomes a giant crisp hexagon.
4. The price is a re-seat: the shipped 169-cell sub-maps live on a /15 lattice, and no
   integer ladder has a /15 rung.

Predictions before measuring: (1) crossingPop ratio near the `_template` honest baseline of
1.52x; (2) pathDiff 0 at hyst=0 and clearly non-zero at hyst=0.15; (3) ladder 13 reads as
too big a jump per rung and ladder 3 as too many crossings; (4) the re-seat loses cells.

## What was built

One world, one continuous camera (0.1 -> 900, wheel `zoom *= exp(-deltaY * 0.0015)` —
identical constants to `h6-nest-composite`, so traces are comparable), and a ladder of
lattices over it.

- **Lattice math is h12's**, unchanged: `buildLadder({ga: m, gb: 0})` from
  `spikes/lod/h12-ladder-math/lattice.ts` gives the rotation-free `(m,0)` sublattice, the
  parent/child index map, and the nearest-centre Voronoi `parentOf` with h12's deterministic
  lexicographic tie rule (which m=3/5/13 all need at parent borders). The relation is
  scale-invariant, so ONE ladder object serves every rung: a level-L cell has size
  `80 / m^L` and its parent is `ladder.parentOf(q, r)` at level L-1.
- **Levels.** `?ladder=13` -> 0..6 (scales 1, 13, 169, 2197, …), `?ladder=5` -> 0..9,
  `?ladder=3` -> 0..13. Level 0 is the root hex lattice (hexSize 80). `?extra=N` overrides
  the virtual depth; the default keeps subdividing until a cell is under 1/4 px at zoom 900.
- **Authored content is a sparse `Map<'q,r', colour>` per level**, derived from the shared
  fixture by sampling (see below). Nothing else is stored. There are no documents, no doc
  ids, no per-document bitmaps, no nav stack.
- **Inherit-down:** `fill(L, cell) = authored[L].get(cell) ?? fill(L-1, parent(cell))`,
  memoised per level, whole memo chain from L downward invalidated on paint/erase.
- **Render** per frame: pick the active level A; draw level-A fills for every visible cell
  through `resolve()` from a per-level cached offscreen surface (1.2x viewport) that is
  scale-blitted during a gesture and rebuilt crisp at settle (150 ms) — the
  `blitStaticContent` pattern; then, **governed by `?finer` (see "Guildmaster feedback round"
  below - the DEFAULT is now `none`, so nothing finer than A draws)**, optionally draw the
  AUTHORED cells of levels finer than A on top from their own cached surfaces; then stroke the
  lattice live in screen space; then roads, labels and the fiducial live in screen space at
  fixed screen sizes.
- **Edit:** `__lod.paint(wx, wy, colour)` writes the active level's cell,
  `__lod.erase(wx, wy)` deletes it so the cell inherits again. Shift+click / Alt+click do the
  same by hand.

### How per-level authored content is derived from the DOCUMENT-shaped fixture

The shared fixture is a tree of documents (root ring-12 at hexSize 80; four ring-7 children
at 1/15; one grandchild at 1/225). For this spike each document is projected onto ONE rung:

    seatLevel(d) = round( log(15^d) / log(m) )        # ?seat=nearest  (DEFAULT)
    seatLevel(d) = ceil ( log(15^d) / log(m) )        # ?seat=finer

For every level-L cell whose centre lies inside a depth-d document (tested through the
fixture's own `coarseColorAt(centre, d)`, which returns null outside every hull), the cell
is AUTHORED and takes that resolved colour. Level 0 is the fixture root's 469 cells. Every
other cell at every other level is unauthored and inherits.

**A deliberate departure from the brief, stated plainly.** The brief's literal rule is
"representable at this level: `15^d <= m^L`" — the first rung at least as *fine* as the
document. That rule contradicts the brief's own ladder enumeration for m=13: it puts a
depth-1 document on rung 2 (scale 169), not rung 1 (scale 13), and 13 is precisely the rung
h12 identified for the 169-cell rosette. `round` reproduces the brief's enumeration for all
three ladders (m=13: 1, 169; m=5: 25, 125; m=3: 9, 243) and is the default. `?seat=finer` is
the literal rule and is measured alongside it.

### Level selection, exactly

`cellPx(L) = 2 * (80 / m^L) * zoom` (hex WIDTH, centre-to-vertex doubled).

- `hyst=0`: `A = max{ L : cellPx(L) >= minCellPx }`, clamped to `[0, maxLevel]`.
  A pure function of zoom — no state, no history.
- `hyst=h>0`: PROMOTE `A -> A+1` as soon as `cellPx(A+1) >= minCellPx`; DEMOTE `A -> A-1`
  only once `cellPx(A) < minCellPx * (1 - h)`. One-sided band: zooming out lags zooming in.

`__lod.crossings` declares the hyst=0 crossings, `z = minCellPx * m^L / 160`. The list below is
**at the old `minCellPx=14`**; at the new default 40 the ladder-4 crossings are 1, 4, 16, 64,
256 (and e.g. ladder 13 becomes 3.25, 42.25, 549.25):
m=13 -> 1.1375, 14.787, 192.24 · m=5 -> 0.4375, 2.1875, 10.94, 54.69, 273.44 ·
m=3 -> 0.263, 0.787, 2.363, 7.088, 21.26, 63.79, 191.36, 574.09.

### Lattice treatments

- `one` — stroke ONLY level A, live, 1 px screen space.
- `fade` — let `f = log(cellPx(A)/minCellPx) / log(m)` be the position inside the band.
  Stroke A-1 at `1 - smoothstep(0, 0.4, f)`, A at 1, A+1 at `smoothstep(0.6, 1, f)`. Every
  alpha is continuous ACROSS a crossing by construction (at `f -> 1-` the incoming A+1 is
  already at alpha 1 and the outgoing A-1 is already at 0).
- `district` — A live, plus A-1 and A-2 as lighter, thicker region lines (capped at 2).

## Variants measured

`?ladder=13|5|3` x `?lattice=one|fade` (+ `district` on ladder 5) x `?hyst=0|0.15`, all at
1600x1000, DPR 1, `zmin=0.62`, anchored like h6 (`0.32w, 0.38h`). 30 rig runs in total;
**2 of the 30 (`fade` on ladders 5 and 3) crashed the rig and produced no numbers** — see
the note under the gate table.

## Measurements

### Re-seat cost — the sharpest number in the spike

`node spikes/lod/g1-global-lattice/probe.mjs stats` (both seat rules, all three ladders):

| ladder | seat | depth 1 rung | cells preserved | depth 2 rung | cells preserved | authored cells stored |
|---|---|---|---|---|---|---|
| 13 | nearest | L1 = **13** | **508 / 676 = 75.1 %** | L2 = **169** | **96 / 169 = 56.8 %** | 469 / 508 / 96 |
| 5 | nearest | L2 = 25 | 676 / 676 = 100 % | L3 = 125 | 52 / 169 = 30.8 % | 469 / 1876 / 52 |
| 3 | nearest | L2 = 9 | 244 / 676 = 36.1 % | L5 = 243 | 169 / 169 = 100 % | 469 / 244 / 194 |
| 13 | finer | L2 = 169 | 100 % | L3 = 2197 | 100 % | 469 / **85 630** / 16 090 |
| 5 | finer | L2 = 25 | 100 % | L4 = 625 | 100 % | 469 / 1876 / 1302 |
| 3 | finer | L3 = 27 | 100 % | L5 = 243 | 100 % | 469 / 2188 / 194 |

The loss is exactly `(rung scale / native scale)^2` whenever the rung is COARSER than the
document: 13/15 squared = 0.751, 169/225 squared = 0.564, 9/15 squared = 0.36. Sampling a
finer rung is lossless but inflates storage by the inverse square (m=13 `finer` stores 85 630
authored cells for four ring-7 sub-maps — 127x the authored data).

**So "169 = 13^2, therefore the shipped sub-maps re-seat onto ladder 13" is false as stated.**
h12 already showed why and this spike measures the consequence: the shipped rosette is 169
cells at linear scale **15**, so placing it in-situ on the 13-rung throws away one cell in
four. h12's lossless route is not a sampling but a MIGRATION — multiply every child document
by 15/13 = 1.1538 and re-place it at 1/13, which preserves all 169 axial indices exactly
(`rescaledMaxPx 1.6e-14`) at the cost of growing every sub-map 15.4 % in world size; and
rotation-free m=13 still loses 12 of 169 cells to ownership changes vs the rosette, so the
*truly* lossless ladder is h12's `(15,-7)` generator, which is rotated 27.8 degrees.
h12's in-place displacement figure (mean 6.230 px, max 9.319 px = 1.747 child cells) is the
same fact in distance units.

### Gate numbers — zoom-in-out, 1600x1000, 64 steps, stride 1, `--fiducial`

Matched-trace rows use `--delta -68.46`, byte-identical to the h6 / h0 traces. Rows below
the rule use the rig's own calibration for this spike (-77.04).

| run | popMed | popMax | pop max/med | crossPop max | crossPop non-x med | **crossPop ratio** | pathDiff mean | fiducial max | blank | hole-fail | p95 | >50 ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **g1 m=13 one (matched)** | 7.414 | 18.996 | **2.56x** | 15.796 | 7.125 | **2.17x** | 0.005 | 0.71 px | 0 | 0 | 16.7 | 0 |
| **g1 m=5 one (matched)** | 9.853 | 24.427 | **2.48x** | 13.484 | 9.763 | **1.38x** | 0.022 | 0.71 px | 0 | 0 | 16.8 | 0 |
| h6 nest-composite (matched) | 4.075 | 19.617 | 4.81x | n/a | n/a | n/a | 0 | 0.71 px | 0 | 0 | 16.8 | 0 |
| h0 hard swap (matched) | 5.162 | 40.120 | 7.77x | n/a | n/a | n/a | 0.002 | — | 0 | — | 16.8 | 0 |
| h0 crossfade (matched) | 5.162 | 38.849 | 7.53x | n/a | n/a | n/a | 0.002 | — | 0 | — | 16.7 | 0 |
| `_template` reference | 17.08 | 26.43 | 1.55x | — | — | 1.52x | 0 | 0.71 px | 0 | 0 | 16.7 | 0 |
| | | | | | | | | | | | | |
| m=13 one | 7.124 | 20.973 | 2.94x | 15.814 | 6.976 | 1.96x | 0.043 | 0.71 | 0 | 0 | 16.7 | 0 |
| m=13 fade | 11.412 | 25.454 | 2.23x | 20.519 | 11.305 | 1.61x | 0.045 | 0.71 | 0 | 0 | **33.3** | 1 |
| m=13 one, hyst 0.15 | 7.927 | 20.973 | 2.65x | 19.433 | 7.377 | 2.36x | **1.954** | 0.71 | 0 | 0 | 16.7 | 0 |
| m=5 one | 10.795 | 26.120 | 2.42x | 14.042 | 10.363 | **1.30x** | 0.035 | 0.71 | 0 | 0 | 16.8 | 0 |
| m=5 fade | — | — | — | — | — | — | — | — | — | — | — | — | (rig crash, see below) |
| m=3 fade | — | — | — | — | — | — | — | — | — | — | — | — | (rig crash, see below) |
| m=5 district | 12.392 | 28.294 | 2.28x | 16.022 | 11.687 | 1.31x | 0.036 | 0.71 | 0 | 0 | 16.7 | 0 |
| m=5 one, hyst 0.15 | 11.340 | 26.120 | 2.30x | 17.910 | 10.963 | 1.43x | 0.036 | 0.71 | 0 | 0 | 16.7 | 0 |
| m=3 one | 11.926 | 23.887 | 2.00x | 21.809 | 11.855 | **1.35x** | 0.025 | 0.71 | 0 | 0 | 16.7 | 0 |
| m=3 one, hyst 0.15 | 12.891 | 26.612 | 2.06x | 24.900 | 11.926 | 1.50x | 0.024 | 0.71 | 0 | 0 | 16.8 | 0 |
| m=13 one, `--wheel-pattern human` | 7.045 | 20.973 | 2.98x | 15.817 | 6.976 | 1.95x | 0.045 | 0.71 | 0 | 0 | 16.8 | 0 |
| m=13 pan-zoom | 7.219 | 20.973 | 2.91x | 14.671 | 7.156 | 2.01x | — | 0.71 | 0 | 0 | 16.8 | 0 |
| m=5 pan-zoom | 12.688 | 26.120 | 2.06x | 13.951 | 12.652 | 1.09x | — | 0.71 | 0 | 0 | 16.7 | 0 |
| m=3 pan-zoom | 12.573 | 23.887 | 1.90x | 21.892 | 12.085 | 1.31x | — | 0.71 | 0 | 0 | 16.8 | 0 |

**`fade` has no numbers on ladders 5 and 3, and that is a rig bug, not a result.** Both runs
capture all 78 frames and then die, reproducibly, at `capture.mjs:771` —
`sheetPage.setContent(sheetHtml)`, the contact-sheet stage, which inlines every captured
frame as a base64 data URL in one HTML string. A dense fade lattice makes every frame a
~1.5 MB PNG, so 78 of them is ~160 MB of base64 and the renderer process dies
(`Target page, context or browser has been closed`). `fade` on ladder 13 squeaked through;
ladders 5 and 3 do not. **Because the contact sheet is built BEFORE `report.json` is
written, the crash destroys the entire run's numbers** — `out/zio-l5-fade/` and
`out/zio-l3-fade/` contain `frames/` and nothing else. Anyone extending `_shared` should
stream the sheet from files or cap inlined frames; I was scoped out of touching it.

Anchor drift (self-reported, wheel and cumulative) is **0.0000 px** on every run.

**Honest caveat on the pop ratio.** g1's popMEDIAN is roughly 1.8x h6's on the same trace,
because g1 always has a full fine lattice on screen and h6 spends most of the sweep showing
giant flat hexes. A bigger denominator flatters the ratio. The stronger statement is the
numerator: g1's popMAX (18.996) is *lower in absolute terms* than h6's (19.617) and less
than half h0's (40.120), on the identical trace.

**pathDiff at hyst=0 is 0.005 mean, and its 203 max-abs pixel is my own HUD**, which prints
a monotonically rising rebuild counter and therefore differs between the in-leg and out-leg
frame at the same zoom. The map itself is path-identical. h0's max-abs 192 is real map
content. G4 threshold is mean < 1.0 luma; hyst=0 passes by 200x, hyst=0.15 on ladder 13
lands at **1.954 mean / 11.531 max** and fails. Ladders 3 and 5 did not fail at hyst=0.15
only because none of the six matched zoom targets happened to land inside their hysteresis
bands — that is luck, not immunity.

### Jitter at a crossing — `--scenario jitter --steps 40`

| run | target z | level sequence | level flips | **flipCount** | pop median | pop max | frozen |
|---|---|---|---|---|---|---|---|
| m=13 one, hyst 0 | 1.1375 | `0101010101…` | **39** | **0** | 14.871 | 14.876 | 0 |
| m=13 one, hyst 0, 2nd crossing | 14.787 | `1212121212…` | **39** | **0** | 13.536 | 13.536 | 0 |
| m=13 fade, hyst 0 | 1.1375 | `0101010101…` | 39 | **0** | 19.304 | 19.314 | 0 |
| m=13 one, hyst 0.15 | 1.1375 | `1111111111…` | 0 | 0 | **20.237** | 20.243 | 0 |
| m=5 one, hyst 0 | 2.1875 | `1212121212…` | **39** | **0** | 13.846 | 13.874 | 0 |
| m=5 one, hyst 0.15 | 2.1875 | `2222222222…` | 0 | 0 | **18.967** | 18.972 | 0 |
| m=3 one, hyst 0/0.15 | 2.362 | `3333333333…` | 0 | 0 | 17.350 | 17.356 | 0 |

The level flips on literally every notch and the pop series is FLAT to 3 decimals
(14.871 median vs 14.876 max over 40 notches). flipCount 0 everywhere.

Two caveats the numbers demand. (a) The rig's `crossingPop` is meaningless on a jitter run —
every frame straddles the crossing, so `nonCrossingPopMedian` collapses to the 1-2 leftover
frames (0.005) and `ratio` prints 3121x. Use jitter's own `popMax/popMedian` instead; I did.
(b) The m=3 jitter never straddled its crossing: the approach leg overshot 2.3625 and the
waggle stayed inside one band, so that row proves nothing about m=3.

### Frame budget — `--timing-only`

| run | throttle | mean | p50 | p95 | max | >33 ms | >50 ms |
|---|---|---|---|---|---|---|---|
| m=13 one | 1x | 16.7 | 16.7 | **16.7** | 33.3 | 2 | **0** |
| m=3 one | 1x | 16.8 | 16.8 | **16.8** | 33.4 | 4 | **0** |
| m=13 one | 4x | — | — | **66.7** | 216.7 | 326 | 78 |
| m=3 one | 4x | — | — | **100.0** | 216.7 | 366 | 122 |
| m=13 fade | 4x | — | — | **150.0** | 200.0 | 439 | 248 |

G8 desktop: PASS (p95 16.7-16.8 ms, zero frames over 50 ms at 1600x1000).
G8 at 4x CPU throttle: **FAIL** (66.7 ms p95, gate wants <= 33). h6 failed the same gate on
the same rig, so this is a property of the wave, not a regression — but `fade` is 2.3x worse
than `one` there and `district` is in the same family, which is a real treatment cost.

Memory: `bytesCached` reached **46.08 MB** over 5 live surfaces at DPR 1
(1920x1200x4 per surface). **Surfaces are never evicted** — the map is keyed `fill:L` /
`auth:L` and accumulates one entry per level visited, so a full 0.62->900->0.62 sweep on
ladder 3 would hold up to 14 of them. At DPR 2 that is 4x. This is an unbudgeted G9 failure
and the fix is trivial (evict anything not drawn for N frames); it was not done here.

### Edit coherence

`node spikes/lod/g1-global-lattice/probe.mjs edit` and `erase-probe.mjs`, stills in `out/`:

- `edit-siblings-1-before / -2-painted / -3-erased.png` — at z=40, level 2, a single
  `paint()` writes one level-2 cell into an otherwise INHERITED field: one crisp orange hex
  in a sea of forest-coloured fine hexes. `erase()` returns it to the inherited colour.
- `erase-1-before / erase-2-after.png` — erasing 20 authored level-1 cells around the
  forestA/forestB seam produces NO visible change, because the authored cells there agree
  with their coarse parent. That is the inherit-down model behaving correctly and it is worth
  saying out loud: erasing authored content that agrees with its parent is a visual no-op.
- `erase-town-1-before / erase-town-2-after.png` — erasing the 17 authored cells of the
  Ashford town (a deliberate fixture contradiction) makes the town vanish and the cells
  inherit forest from level 0. The "Ashford" LABEL survives, because labels are not cells —
  a real coherence gap this spike does not solve.

## What the contact sheets and lineups show

**`out/lineup-pastfloor.png`** — zooms 1 / 3 / 9 / 30 / 100 / 400 over root hex (-5,-3),
which has no authored child anywhere beneath it, for all three ladders. This is the
question the brief cared most about and the answer is unambiguous: at *no* zoom does the
frame become giant crisp hexagons. Ladder 13 at z=1 shows the root lattice (~160 px hexes);
by z=3 it has split into level-1 cells and the coarse terrain boundary survives as a
staircase of fine hexes; at z=30, 100 and 400 the frame is a uniform field of 14-40 px hexes
in the inherited plains/forest colours. Ladder 3 reaches that state by z=1 and never leaves
it. It reads as *terrain texture*, not as unfinished work — which is a genuinely different
perceptual failure mode from h6's giant hexagons, and a much better one.

**`out/lineup-siblings.png`** — the same zooms over forestA/forestB. At z=1, ladder 13,
level 0: giant root hexes with the authored lake (blue) and town (orange) already visible as
small specks inside one hex, plus the road drawn live. That is the slippy-map behaviour the
brief asked for and h6 cannot do it. As the zoom climbs the specks grow continuously into
the clean 7-cell orange town of `erase-town-1-before.png`. **There is no document boundary
anywhere in these frames** — no inset rosette pasted into a flat grey parent, which was h6's
most damaging visual. The forest simply continues across the old forestA/forestB seam.

**`out/lineup-coast.png`** — the coastline crossing parent hex borders, ladder 13 vs 3, at
z 0.7 / 1.2 / 2 / 5 / 15. At level 0 (z=0.7) the coast is a chunky staircase of root hexes.
At level 1 it is the SAME staircase re-tiled into fine hexes: inherit-down does not make a
coarse boundary more accurate, it makes it more *finely jagged*. Ladder 3's teeth are much
coarser relative to its cell (fewer, blockier steps per parent edge) and read as deliberate
zigzag; ladder 13's are small enough to read as a rough edge. Where the `shore` child IS
authored (z=5, z=15) the boundary becomes genuinely new geometry and the Drowned Beacon cell
appears as a single red hex.

**`out/zio-l13-one/contact-sheet.png`** (78 frames, z 0.62 -> 18.6 -> 0.62 over the
mountain range and the depth-2 grandchild) — one unbroken ramp. The first crossing lands at
frame #5 (z=1.180) and its pop is **15.814 — LOWER than the two frames after it** (18.827,
17.472), which are pure camera motion. The crossing is literally cheaper than ordinary
zooming. The second crossing (z=14.787, frames #30-#33) does show a local bump, pop 12-16
against a ~5 baseline, about 3x: a 13x lattice change at high zoom is visible in the metric.
The `range` child's plains valley emerges as a continuous green texture from #11 with no
event; the depth-2 hold shows as a yellow speck from #29.

**`out/jit-l13-h0/contact-sheet.png` vs `out/jit-l13-fade/contact-sheet.png`** — this pair
overturns what the numbers alone say, and it is the most important image in the spike. With
`lattice=one`, the waggle between z=1.126 (level 0) and z=1.308 (level 1) alternates between
"chunky hexes with a thick grid" and "the same colours under a fine hatch". The pop metric
cannot see it — the fills are identical by construction, and a thin 1 px stroke moves almost
no luma — but a human absolutely can. With `lattice=fade` both grids are present in every
frame and the alternation disappears; the rig's own `diff` (fraction of pixels changed by
>24) drops from **17.26 % to 12.76 %** per notch. **`flipCount 0` is true and misleading;
the lattice flip-flop is real and `fade` is what fixes it.**

## Verdict — **promising, with two named fixes**

**Does it feel like a slippy map?** For the colour field, yes, and measurably so. On the
trace h6 and h0 were measured on, pop max/median is 2.56x against h6's 4.81x and h0's 7.77x,
and the absolute pop max is the lowest of the three. crossingPop ratio 1.38x on ladder 5 is
*below* `_template`'s 1.52x honest baseline — the level swap costs less than ordinary camera
motion. Under a 40-notch hand-waggle the active level flips 39 times with a pop series flat
to 3 decimals and flipCount 0. G0 is structural: there is no document identity in the
renderer to change. G1 and G2 pass everywhere (0 blank frames, 0 hole-fail frames, fiducial
pinned at the 0.71 px quantisation floor, self-reported drift exactly 0).

**But the LATTICE is not continuous under `one`,** and the jitter contact sheet shows it
plainly. That is the one real "pop" this design has, it is invisible to every metric the rig
owns, and `fade` removes it.

**Which ladder reads best: 5.** Ladder 13 has the best re-seat story for the existing
169-cell sub-maps and the fewest crossings (3 in range), but each crossing is a 13x change
of lattice granularity — the largest visible event in the spike, and the source of the 2.17x
crossingPop ratio and the 3x local bump at z=14.8. Ladder 3 has the smallest per-crossing
event (ratio 1.35x) but eight crossings between 0.26 and 574 and a 36 % re-seat loss, and at
z=1 it is already at level 2 so the classic root lattice is never the thing you see.
Ladder 5 is the compromise: crossingPop **1.30x** (better than baseline), five crossings,
lossless depth-1 re-seat, and the coarse map still looks like the coarse map at z=1. It is
also the genre convention (Welsh Piper). Its cost is depth-2: 30.8 % preserved at the 125
rung, or 100 % at 625 with 25x the storage.

**Does `one` vs `fade` matter? Yes, and it is the highest-value treatment decision here.**
`fade` is continuous by construction across every crossing, removes the waggle flip-flop, and
costs crossingPop 1.61x vs 1.96x on ladder 13 — but at 4x CPU throttle its p95 is 150 ms vs
66.7 ms for `one`, because it strokes up to three lattices per frame. Recommendation: `fade`,
with the finer lattice cached rather than stroked live. `district` measured crossingPop **1.31x** on ladder 5 (essentially the same as `one`'s 1.30x
there) and adds a second visual language on top; it can wait. `fade` could not be compared
against it on ladder 5 at all, because that capture crashes the rig — so the `one` vs `fade`
recommendation rests on ladder 13 numbers plus the ladder-13 jitter contact sheets.

**Does past-the-floor stay sensible? Yes** — this is the spike's cleanest positive. The map
keeps subdividing into smaller inherited hexes all the way to zoom 900 and never produces a
giant crisp hexagon. Note honestly that this **does not satisfy G6 as written**: the gate
requires high-frequency energy per screen area to *decline* monotonically OR a provenance
treatment to be present, and this design holds that energy roughly CONSTANT (the lattice
stays at 14-40 px forever) with no marking. It replaces "crisp and unmarked at the wrong
scale" with "crisp and unmarked at the right scale", which is a large perceptual improvement
and still a G6 fail. A provenance treatment is still required and is orthogonal to this
model.

**What the re-seat costs:** one authored cell in four, on ladder 13, if you sample in place.
The lossless routes are h12's: rescale every sub-map by 15/13 (grows every sub-map 15.4 % in
world size) or adopt h12's rotated `(15,-7)` generator. Nobody should ship "169 = 13^2 so it
just re-seats".

## Surprises

1. **The level crossing was cheaper than the camera.** At the first crossing the pop frame
   reads 15.814 while the two frames after it read 18.827 and 17.472. I expected a bump.
2. **Hysteresis makes jitter WORSE, not better.** Pinning the level across the waggle raised
   jitter pop from 14.871 to 20.237 on ladder 13 and 13.846 to 18.967 on ladder 5, because
   the pinned finer lattice puts more high-frequency detail on screen for the camera to move.
   It also broke G4 (pathDiff 1.954 vs 0.005). Hysteresis has no upside here at all.
3. **`flipCount 0` is not proof of no flip-flop.** The colour field is identical across a
   crossing by construction, so the only thing that changes is a 1 px stroke — which the pop
   metric essentially cannot see. Only the contact sheet caught it.
4. **The re-seat loss is exactly the square of the scale ratio** and falls straight out of
   the sampling: 13/15 squared = 75.1 %, 9/15 squared = 36.1 %, 169/225 squared = 56.8 %,
   all reproduced to within one cell.
5. **My own HUD faked a pathDiff failure.** The rebuild counter differs between legs, so
   every run's `pathDiff.maxAbsLuma` reads 203 — a number that looks exactly like h0's real
   192. Spike HUDs must not print monotonic counters.

## Next steps

1. Cache the lattice stroke instead of drawing it live; that is the whole 4x-throttle deficit
   (`fade` 150 ms p95 vs `one` 66.7 ms) and it is the only thing between this and a G8 pass.
2. Evict surfaces. 46 MB at DPR 1 with no eviction policy; up to 14 levels on ladder 3.
3. Settle on ladder 5 and re-run the full matrix at DPR 2, which nobody in this wave has
   measured and which multiplies every surface by 4.
4. Answer the migration question properly: uniform 15/13 rescale (h12, lossless, sub-maps
   grow 15.4 %) vs `(15,-7)` rotated generator (h12, lossless, 27.8 degrees of rotation in a
   transform that has no rotation term) vs accept 75 % in-place. This is a Chief-Cartographer
   sized call.
5. Attach a provenance treatment to inherited cells and re-test G6/G10; the render already
   knows, per cell, whether `resolve()` hit `authored[A]` or inherited.
6. Labels do not participate in inherit/erase (the Ashford label survived erasing Ashford).
   Non-cell content needs its own coverage rule.
7. Re-run the m=3 jitter with an explicit `--jitter-zoom` that actually straddles a crossing;
   the run in the table above did not.

## Guildmaster feedback round (2026-09-24) — the slippy-map rule, live levels, new defaults

The Guildmaster opened the page and made one correction: at a coarse zoom, authored content
from finer levels (the lake, the Ashford town, the depth-2 grandchild) was drawn on top as
tiny smudged blobs inside single coarse hexes. The "always draw finer authored cells on top"
rule is gone. **A level's authored content now renders only when that level is the active
level** — the slippy-map rule.

### 1. `?finer=none|next|all`

Controls which levels FINER than the active level A may draw their authored cells over the
level-A fill. The inherit-down resolve for the ACTIVE level is untouched: a level-A cell still
shows its own authored colour or, failing that, its parent's, exactly as before.

| value | rule |
|---|---|
| **`none` (DEFAULT)** | nothing finer than A draws. Ever. |
| `next` | ONLY level A+1, and only while it is legible: its on-screen cell WIDTH `cellPx(A+1) = 2 * (80 / m^(A+1)) * zoom >= 4 px` (`?finerMinPx` overrides the 4). A+2 and deeper never draw. Because the crossing to A+1 happens at `cellPx(A+1) >= minCellPx`, A+1 appears once it is 4 px wide and grows until it becomes active. No sub-pixel specks are ever drawn. |
| `all` | the old behaviour: every authored level finer than A, sub-pixel ones as specks. |

At the new defaults (m=4, minCellPx 40) `cellPx(A+1)` spans 10..40 px inside a band, so
`next` is always above its 4 px floor there; at the old `minCellPx=14` on m=13 it spans
1.08..14 px and the floor does most of the work. `next` is strictly A+1, so on ladder 4 —
where the depth-1 documents seat on L2 and the depth-2 grandchild on L4 — it shows nothing at
all while L0 is active, because L1 holds no authored cells.

### 2. Bug fixed: an edit on a previously-empty level used to vanish

`AUTHORED_LEVELS` was a `const` snapshot of "which levels hold authored content", computed
once at load. Painting onto a level that happened to be empty at load (ladder 4: levels 1 and
3) added the cell to `authored[L]` but never to that list, so the finer-levels pass could
never draw it again. It is now a live `authoredLevels()` recomputed per frame (11 `Map.size`
reads; nothing measurable).

Proof: `node spikes/lod/g1-global-lattice/finer-probe.mjs` (new) paints at z=20 (level 3,
**empty at load**), zooms out two crossings to z=2 (level 1), and comes back:

```
finer=none  paint L3 (empty at load: true)  levels [2,4] -> [2,3,4]
   painted [232,70,47] | out@L1 [116,143,74] | back@L3 [232,70,47]   survivesRoundTrip=true
finer=all   paint L3 (empty at load: true)  levels [2,4] -> [2,3,4]
   painted [232,70,47] | out@L1 [174,106,60] | back@L3 [232,70,47]   survivesRoundTrip=true
```

The level list goes `[2,4] -> [2,3,4]` live, and the painted pixel is identical after the
round trip under both rules. The two rules differ exactly where they should: zoomed out, under
`finer=none` the spot is pure inherited plains `[116,143,74]`; under `finer=all` the same spot
reads `[174,106,60]` — the new rung's speck blended in, which is precisely what the frozen
list used to make impossible. Stills:
`out/finer-{none,all}-{1-painted-L3,2-zoomed-out-L1,3-back-in-L3}.png`.

### 3. New page defaults = the judge's recommended configuration

From `.claude/lod-rd/05-wave4-global-lattice.md` section 5. With **no query params at all** the
page is now `ladder=4`, `minCellPx=40`, `hyst=0`, `lattice=district`, `finer=none`.
`district` is the judge's "lattice `one` plus district lines": the active level live at 1 px
ink, plus A-1 and A-2 as lighter, thicker region lines. Every existing query param still works
and still overrides — `?ladder=13&lattice=fade&minCellPx=14&finer=all` reproduces the original
page exactly. New keyboard shortcuts: `4`/`5` set ladder 4/2, `a`/`s`/`d` set finer
none/next/all. The HUD gained a `finer` line that names the rule and, under `next`, prints
`L<A+1> @ <px>px ON|off`.

On ladder 4 at minCellPx 40 the crossings are z = 1, 4, 16, 64, 256 and `MAX_LEVEL` is 10.

### 4. Numbers — `finer=none` vs `finer=all`, identical trace

`zoom-in-out --steps 64 --stride 1 --viewport 1600x1000 --fiducial`, defaults except `finer`,
`zmin=0.62`. Runs in `out/zio-finer-none/` and `out/zio-finer-all/`.

| metric | `finer=none` | `finer=all` |
|---|---|---|
| pop median | 6.980 | 6.985 |
| pop max | 21.344 | 21.366 |
| **pop max/median** | **3.06x** | **3.06x** |
| crossingPop max | 12.711 | 12.780 |
| crossingPop ratio (G3) | 1.38x | 1.34x |
| pathDiff mean / max (G4) | 0.027 / 0.043 | 0.024 / 0.049 |
| fiducial drift max | 0.71 px | 0.71 px |
| anchor drift (wheel / cumulative) | 0 / 0 px | 0 / 0 px |
| blank frames / hole-fail frames | 0 / 0 | 0 / 0 |
| frame p95 (capture-contaminated) | 16.7 ms, 0 frames > 33 ms | 33.3 ms, 101 frames > 33 ms |
| surfaces / bytesCached at end | 4 / 36.9 MB | 6 / 55.3 MB |

Nothing got worse. Pop is identical to three decimals — the finer overlay covers a handful of
pixels, so it cannot move a full-frame luma mean — G1/G2/G4 are unchanged, and the only
material difference is cost: `none` holds two fewer surfaces, 18 MB less, and does not put a
single frame over 33 ms on a trace where `all` puts 101 over. The crossingPop difference
(1.38x vs 1.34x) is noise on 6 crossing frames; both sit at or below `_template`'s 1.52x
honest baseline and far below the 2.56x this spike reported on ladder 13 at minCellPx 14.

### 5. The lineup — `out/lineup-finer-rule.png`

Zooms 0.6 / 1.2 / 2.5 / 5 / 12 over the forestA/forestB siblings (anchor 512,380, the same
anchor `lineup-siblings` used), rows `finer=none`, `finer=next`, `finer=all`, everything else
at the new defaults. Active level per column: L0, L1, L1, L2, L2.

- **`finer=none` (top row): no smudges anywhere below the authored rung.** At z=0.6, z=1.2 and
  z=2.5 the frame is a clean hexcrawl — plains, forest, the grey ridge, the road drawn live —
  with no trace of the lake or the town. At **z=5, where level 2 becomes active, the blue lake
  and the orange Ashford town appear at once**, crisp, as clusters of level-2 hexes; by z=12
  the town is a full rosette. For the record: on the new ladder the depth-1 documents seat on
  **level 2** (crossing z=4), not level 1, so "they appear when their level becomes active"
  means z=4 here, not the z=1 level-1 crossing.
- **`finer=next` (middle row)** is the compromise: z=0.6 is identical to `none` (level 1 holds
  no authored cells at all), and at z=1.2 / z=2.5 the lake and town appear as small but clean
  coloured marks at 12 px and 25 px — a legible hint, not a smudge.
- **`finer=all` (bottom row)** is the behaviour the Guildmaster rejected: at z=0.6 the lake and
  town are sub-pixel specks smeared beside the road inside single coarse hexes, and from z=5
  the depth-2 grandchild adds a second speck layer on top of an already-legible map.

Labels are unchanged and still follow their own rule (a label draws once its document's rung
is 6 px legible), because they are screen-space text, not cells — but that is now the one
place where content from a non-active level still appears, and it should be revisited.

## Orientation and shape round (2026-09-24) — pointy-top, and rectangular maps

The global-lattice model was only ever proven on ONE map: flat-top, radial ring 12. The
plugin ships two orientations (`DEFAULTS.hexOrientation` is `flat`; `pointy` is the other)
and two bounded shapes (radial `maxRing`, or rectangular `{maxCol, maxRow}`). This round
runs the model on all four and reports the same gate numbers for each.

### What changed

**`_shared/fixture.ts` grew an OPTIONS argument; nothing was changed in place.**
`buildFixture(seed = 1, opts?: FixtureOptions)` with no options is byte-identical to before —
`node _shared/build.mjs _template` still builds and `capture.mjs _template --scenario zoom-in`
still reports `cellsTotal 1951`. The new options are `{orientation, shape, cols, rows}`:

- `orientation` threads to EVERY doc's `HexGeometry`, so the root map and all five sub-maps
  share it.
- `shape: 'rect'` builds the root with bounds `{maxCol, maxRow}` and **no `maxRing`** —
  which is exactly how the plugin expresses a rectangular hex map (`hexBounds` in
  `types/core/map.types.ts`, and `HexGeometry.renderingMode` returns `'rectangular'`
  precisely when `maxRing` is absent). The cell set is `offsetToAxial(col, row)` over
  `[0, cols) x [0, rows)` — **odd-q offset for flat, odd-r for pointy**, from
  `src/geometry/core/offsetCoordinates.ts`, which is the enumeration `drawGrid`'s
  rectangular arm and `getCellsInRectangle` both use, filtered by `isWithinBounds`.
  New helper `docCells(doc)` is that enumeration; `rectBoundaryCells(doc)` is the ordered
  ragged boundary ring.
- Sub-maps stay RADIAL rosettes in every combo — `subdivisionRings` is what the shipped
  `SubHexMapData` carries, so a sub-map has no rectangular form to take.
- `coarseColorAt` now tests `doc.geometry.isWithinBounds(q, r)` instead of an inline
  ring check. For radial docs that is the identical test, so radial output is unchanged.

**Re-anchoring the authored children on a rect map.** The radial anchors (3,-1) / (4,-1) /
(-8,4) / (0,5) are not cells of a rect map, whose cells all sit at col >= 0, row >= 0. On
`shape=rect` the four depth-1 docs are re-derived from the map's CENTRE cell
(`cc = floor((cols-1)/2)`, `cr = floor((rows-1)/2)`), keeping `forestA`/`forestB` axial
neighbours so the shared-edge road still crosses a doc boundary:

| doc | rect offset | flat 24x16 axial | pointy 24x16 axial |
|---|---|---|---|
| `forestA` | (cc, cr) = (11, 7) | (11, 2) | (8, 7) |
| `forestB` | forestA + (1,0) AXIAL | (12, 2) | (9, 7) |
| `shore` | (cc-6, cr+3) = (5, 10) | (5, 8) | (0, 10) |
| `range` | (cc+3, cr-3) = (14, 4) | (14, -3) | (12, 4) |

`grand` stays at (2,-3) inside `range`. `checkMath` gained an assertion that every depth-1
anchor is actually a cell of the root map. All four sit near the middle of the map on
purpose: the ragged edge must read as a boundary of the LATTICE, not of authored content.
One honest side effect — the fixture's coastline lives at negative world x and a rect map
starts at the world origin and runs +x/+y, so rect combos show forest / plains / hills /
mountains but no ocean, and `look=coast` is uninteresting there.

**`main.ts`: orientation is an axial->world transform and nothing else.** `posOf(q, r, s)` /
`cellOf(x, y, s)` replace h12's flat-only `hexPos` / `worldToHexRounded` and are byte-for-byte
`HexGeometry.hexToWorld` / `worldToHex` at `hexSize = s`. The outline phase follows
`getHexCorners`' own `angleOffset` (flat 0 deg, pointy 30 deg). Cell enumeration, the
authored-content sampler, the lattice stroke, painting and erasing all go through them.
**The ladder itself is untouched**: the `(m,0)` generator is a pure scale on AXIAL indices,
so `parentToChild` / `parentOf` are orientation- and shape-independent, and the pointy
axial->world map is the flat one composed with a reflection — an isometry, so nearest-centre
ownership is preserved exactly.

**Cells outside the map are outside at every level, for free.** `resolve()` already returns
`null` when the level-0 ancestor is unauthored, and `authored[0]` now holds only the rect
map's cells, so a fine cell whose owning root parent is off-map resolves to nothing, is not
drawn, and is excluded from the footprint. No new rule was needed.

**`footprint()` for rect maps.** Radial keeps today's convex hull of the outer ring's
centres. Rect returns the EXACT RAGGED boundary: `rectBoundaryCells` walked in offset order
(top row L->R, right column, bottom row R->L, left column) through the boundary cells'
centres — 2(cols+rows)-4 = 76 points at 24x16. Consecutive entries are adjacent cells, so
the polygon is simple and every chord lies inside the union of two hexes. The rig's mask is
an even-odd point-in-polygon test, so a CONCAVE polygon is fine — and a convex hull would
have been wrong: it spans every parity notch on the zigzag edges and would have reported a
viewport-wide band of "holes".

### The probe — `node spikes/lod/g1-global-lattice/orient-probe.mjs`

`__lod.orientProbe()` makes the "finer levels keep the orientation" claim checkable rather
than asserted. Four checks per combo, over levels 0..4 and eight sample cells:

| check | what it asserts | flat/radial | flat/rect | pointy/radial | pointy/rect |
|---|---|---|---|---|---|
| `centreVsPlugin` | every level's axial->world == a real `HexGeometry(80/m^L, orient).hexToWorld` | 2.3e-13 | 2.3e-13 | 1.1e-13 | 1.1e-13 |
| `pureScale` | cell (Q,R) at L0 and `parentToChild^L(Q,R)` at level L are the SAME world point | **0** | **0** | **0** | **0** |
| `parentInverts` | `parentOf^L` returns the original level-0 cell | true | true | true | true |
| `outlineScale` | a level-L hex outline == the root outline x 1/m^L, corner for corner | **0** | **0** | **0** | **0** |
| corner phase | `getHexCorners`' angleOffset | 0 deg | 0 deg | 30 deg | 30 deg |
| root cells (mine / plugin / expected) | level 0 == the plugin's own enumeration | 469/469/469 | 384/384/384 | 469/469/469 | 384/384/384 |
| footprint points | | 12 | 76 | 12 | 76 |

`pureScale` and `outlineScale` are EXACTLY zero, not near zero: the level-L transform is the
level-0 transform with `s` divided by `m^L`, so the identity holds in floating point. That is
the whole orientation claim — a rotated generator (h12's `(15,-7)`, 27.8 degrees) fails both
immediately. `centreVsPlugin` is 1e-13 only because `HexGeometry` computes `sqrt3/2*q + sqrt3*r`
where the spike computes `sqrt3*(r + q/2)`; same value, different rounding order.
The rect rows also cross-check against `getCellsInRectangle` over the offset bounds — the
plugin's own rectangular enumeration — with zero missing cells. Full dump in
`out/orient-probe.json`.

### Gate numbers — four combos, page DEFAULTS (ladder 4, minCellPx 40, district, finer=none)

`zoom-in-out --steps 64 --stride 1 --viewport 1600x1000 --fiducial`, `zmin=0.62`, rig
self-calibrated delta (no `--delta`), plus `jitter --steps 40` at the first crossing (z=1).
Runs in `out/zio-<combo>/` and `out/jit-<combo>/`.

| combo | popMed | popMax | pop max/med | crossPop max | **crossPop ratio** | jitter flipCount | pathDiff mean/max | holes fail / largest | fiducial max | p95 |
|---|---|---|---|---|---|---|---|---|---|---|
| **flat / radial** (baseline) | 6.979 | 21.342 | 3.06x | 12.710 | **1.38x** | 0 | 0.026 / 0.044 | 0 / 6 px2 | 0.71 px | 16.8 ms |
| **flat / rect 24x16** | 6.654 | 15.250 | 2.29x | 11.535 | **1.37x** | 0 | 0.027 / 0.046 | 0 / 4 px2 | 0.71 px | 16.8 ms |
| **pointy / radial** | 7.355 | 15.491 | 2.11x | 15.262 | **1.39x** | 0 | 0.025 / 0.043 | 0 / 6 px2 | 0.71 px | 16.7 ms |
| **pointy / rect 24x16** | 6.926 | 19.112 | 2.76x | 9.851 | **1.24x** | 0 | 0.025 / 0.043 | 0 / 4 px2 | 0.71 px | 16.7 ms |

Every combo: **0 blank frames, 0 hole-fail frames, anchor drift 0 / 0 px (wheel and
cumulative), fiducial pinned at the 0.71 px quantisation floor, 0 page errors.** Jitter is
identical in all four — the level series is `0101010101...`, **39 level flips in 40 notches,
flipCount 0**, and the pop series is flat to three decimals (flat/radial 14.058 med vs 14.068
max; flat/rect 12.189/12.199; pointy/radial 17.535/17.545; pointy/rect 10.332/10.345).

The flat/radial row reproduces the feedback round's `finer=none` run to three decimals
(6.980 / 21.344 / 3.06x / 1.38x there), so the refactor is behaviour-preserving on the old
path. **crossingPop ratio stays in a 1.24x-1.39x band across all four combos, all at or
below `_template`'s 1.52x honest baseline** — the level crossing costs less than ordinary
camera motion regardless of orientation or shape. The p95 column is timing-only in the sense
that it is capture-contaminated (a screenshot runs between steps); the real signal is that
no combo is slower than another.

The pop spread (2.11x - 3.06x) is NOT an orientation or shape effect. It is the terrain the
trace happens to fly over: the four maps sample the same world field at different places, so
`popMax` lands on a different frame in each. `popMedian` is within 10 % across all four.

### The lineups

**`out/lineup-orient.png`** — zooms 0.6 / 2.5 / 5 / 12, flat vs pointy, radial, anchored on
the forestA/forestB siblings (512,380), everything else at the page defaults.

- **The finer levels keep the orientation, visibly.** At z=12 the `district` lines (the two
  coarser rungs, drawn thicker and lighter) and the active level-2 cells agree: in the flat
  row every hexagon in the frame, at every rung, has vertices left and right; in the pointy
  row every hexagon at every rung has vertices top and bottom. There is no rung at which the
  lattice twists — which is the visual form of `outlineScale == 0`.
- Both rows tell the same story at the same zooms: level 0 at z=0.6, level 1 at z=2.5, level
  2 at z=5 and z=12; the Ashford town arrives whole as an orange rosette at z=5 in both, the
  lake as a blue cluster, the road drawn live across both. `cellsDrawn` differs by ~2 %
  (338 vs 345, 1760 vs 1746) purely because a rotated viewport rectangle covers a slightly
  different number of hexes.
- The one thing that does differ is the road's apparent heading, because the world-space
  terrain field is sampled by cells that sit at different world points under the two
  orientations. That is the fixture, not the model.

**`out/lineup-rect-edge.png`** — zooms 0.6 / 1.5 / 4 / 12, flat/rect vs pointy/rect,
anchored on the map's NW **corner vertex** (`?look=corner`). Anchoring on the corner CELL's
centre was tried first and is wrong: past z~4 the boundary walks off-screen. Anchoring on the
outer vertex pins the boundary under the cursor at every zoom.

- **The rectangular edge is a faithful ragged boundary, and it stays faithful as it
  subdivides.** At z=0.6 (level 0) the flat map shows the odd-q signature exactly: the TOP
  edge alternates up/down by half a hex as the column parity shifts, while the LEFT edge is a
  clean vertical column. The pointy map shows the odd-r signature, rotated 90 degrees in
  effect: the LEFT edge zigzags per row, the top edge is the straight one. Both are what the
  plugin draws.
- At z=1.5 (level 1) and z=4 / z=12 (level 2) the same silhouette is re-tiled in 4x and 16x
  finer hexes. **Nothing is drawn outside the map** — the void is pure background at every
  level, with no stray fine cells floating past the edge, and **no holes** anywhere inside
  (0 hole-fail frames in the captures, largest background blob 4 px2).
- At the CORNERS nothing breaks: the two edges meet in the fine lattice the same way they
  meet in the coarse one, and the corner cell's children stop where the corner cell stops.

### Surprises

1. **A finer level does not make the map boundary more faithful — it makes it more
   crenellated.** A parent hex's nearest-centre child set is not the parent hexagon, so at
   level 2 the rect map's edge grows a row of one-cell-deep teeth that the level-0 edge does
   not have (clearly visible in `lineup-rect-edge.png` at z=4). This is the same fact
   `lineup-coast.png` recorded for a terrain boundary, now showing up on the MAP boundary,
   where it matters more: the silhouette of a bounded map is a thing users recognise, and it
   changes shape slightly at every crossing. It is not a hole and not an outside-cell, so no
   gate sees it.
2. **The lattice is still stroked over the void.** `strokeLattice` covers the viewport, not
   the map, so on a bounded map the `district` lines and the active grid continue out over
   the black beyond the edge (every rect frame in the lineup shows this). On a radial map the
   world is big enough that it rarely shows; on a 24x16 rect map at z=0.6 half the frame is
   grid over nothing. The fix is to clip the stroke to `footprint()`, and it is cheap.
3. **The convex hull was the trap, not the zigzag.** The obvious footprint for a rect map is
   a hull of the cell centres; it silently converts every offset-parity notch into a
   "hole" and would have failed G1 on a renderer that is in fact correct. The rig's mask is
   even-odd, so the honest concave boundary works — but nothing in the rig says so, and the
   next spike to bound its world will hit this.
4. **Orientation cost nothing.** Every gate number, and `flipCount 0` under a 39-flip
   waggle, is the same in all four combos. The `(m,0)` ladder genuinely does not care; the
   entire orientation surface is one 2x2 matrix in `posOf` / `cellOf`.

### How to reproduce

```
node spikes/lod/_shared/build.mjs g1-global-lattice
node spikes/lod/g1-global-lattice/orient-probe.mjs
# per combo (out/zoom-in-out and out/jitter are renamed after each capture):
node spikes/lod/_shared/capture.mjs g1-global-lattice --scenario zoom-in-out --steps 64 --stride 1 \
  --viewport 1600x1000 --fiducial --query "orient=flat&shape=rect&cols=24&rows=16&zmin=0.62"
node spikes/lod/_shared/capture.mjs g1-global-lattice --scenario jitter --steps 40 \
  --viewport 1600x1000 --query "orient=flat&shape=rect&cols=24&rows=16&zmin=0.62"
node spikes/lod/_shared/lineup.mjs g1-global-lattice --zooms 0.6,2.5,5,12 \
  --variants "orient=flat;shape=radial;look=siblings;zmin=0.62,orient=pointy;shape=radial;look=siblings;zmin=0.62" \
  --viewport 1600x1000 --anchor 512,380 --cell 420 --out orient
node spikes/lod/_shared/lineup.mjs g1-global-lattice --zooms 0.6,1.5,4,12 \
  --variants "orient=flat;shape=rect;look=corner;zmin=0.62,orient=pointy;shape=rect;look=corner;zmin=0.62" \
  --viewport 1600x1000 --anchor 512,380 --cell 420 --out rect-edge
```

## How to reproduce

```
node spikes/lod/_shared/build.mjs g1-global-lattice
node spikes/lod/g1-global-lattice/probe.mjs stats
node spikes/lod/g1-global-lattice/probe.mjs edit
node spikes/lod/g1-global-lattice/erase-probe.mjs
node spikes/lod/_shared/capture.mjs g1-global-lattice --scenario zoom-in-out --steps 64 --stride 1 \
  --viewport 1600x1000 --fiducial --delta -68.46 --query "ladder=13&lattice=one&zmin=0.62"
node spikes/lod/_shared/capture.mjs g1-global-lattice --scenario jitter --steps 40 \
  --viewport 1600x1000 --query "ladder=13&lattice=one&zmin=0.62"
node spikes/lod/_shared/capture.mjs g1-global-lattice --scenario zoom-in-out --steps 64 --stride 4 \
  --viewport 1600x1000 --timing-only --throttle 4 --query "ladder=13&lattice=one&zmin=0.62"
node spikes/lod/_shared/lineup.mjs g1-global-lattice --zooms 1,3,9,30,100,400 \
  --variants "ladder=13;look=empty,ladder=5;look=empty,ladder=3;look=empty" \
  --viewport 1600x1000 --anchor 512,380 --out pastfloor
```

Feedback-round runs (new defaults; `out/zoom-in-out` was renamed after each capture):

```
node spikes/lod/_shared/build.mjs g1-global-lattice
node spikes/lod/g1-global-lattice/finer-probe.mjs
node spikes/lod/_shared/capture.mjs g1-global-lattice --scenario zoom-in-out --steps 64 --stride 1 \
  --viewport 1600x1000 --fiducial --query "finer=none&zmin=0.62"      # -> out/zio-finer-none
node spikes/lod/_shared/capture.mjs g1-global-lattice --scenario zoom-in-out --steps 64 --stride 1 \
  --viewport 1600x1000 --fiducial --query "finer=all&zmin=0.62"       # -> out/zio-finer-all
node spikes/lod/_shared/lineup.mjs g1-global-lattice --zooms 0.6,1.2,2.5,5,12 \
  --variants "look=siblings;zmin=0.62;finer=none,look=siblings;zmin=0.62;finer=next,look=siblings;zmin=0.62;finer=all" \
  --viewport 1600x1000 --anchor 512,380 --out finer-rule
```

## How to feel it

Build once, then open the page directly in Chrome — no dev server, it is a `file://` IIFE
bundle. **The plain URL, with no query string at all, is now the recommended one**: it is the
judge's configuration (ladder 4, minCellPx 40, `district` lattice, no hysteresis, `finer=none`).

```
file:///C:/Dev/windrose/spikes/lod/g1-global-lattice/index.html
```

1. Wheel IN slowly. The whole map subdivides, not just the hex under the cursor. Crossings sit
   at z = 1, 4, 16, 64, 256; the HUD prints `z`, `m=`, `L<active>/<max>`, the cell width, the
   lattice / minPx / hyst / band position, and the finer rule.
2. Watch for the lake and the Ashford town. Below z=4 they are simply NOT THERE — the coarse
   map is the coarse map, with no smudges inside its hexes. Cross z=4 and they arrive whole,
   as authored level-2 hexes. Append `&finer=next` to see them hinted one band early, or
   `&finer=all` to see the behaviour this round removed.
3. Shift+click paints the ACTIVE level's cell; alt+click erases it back to inherited. Paint at
   a deep zoom, wheel all the way out and back in: the cell is still there. That used to be
   broken on any level that held no authored cells at load.
4. `&look=empty` and wheel to the 900 ceiling: the map keeps subdividing into smaller
   inherited hexes and never becomes one giant crisp hexagon.
5. **Orientation.** Append `&orient=pointy` (or press `p`; `o` goes back to flat). Every rung
   turns with it — vertices move from left/right to top/bottom at the active level AND at the
   two `district` rungs. Nothing else about the page changes.
6. **A rectangular map.** Append `&shape=rect` (or press `r`; `h` goes back to radial), with
   `&cols=N&rows=M` if you want a different size than 24x16. Add `&look=corner` and wheel in
   on the map's NW corner vertex: the odd-q (flat) / odd-r (pointy) parity zigzag stays put
   as the lattice subdivides under it, nothing is ever drawn outside the map, and the fine
   edge grows a row of one-cell teeth the coarse edge does not have. The HUD's second line
   now names the orientation, the shape and the bounds.

Controls: wheel = zoom, drag = pan, shift+click = paint, alt+click = erase,
`1`/`2`/`3`/`4`/`5` = ladder 3/5/13/4/2, `q`/`w`/`e` = lattice one/fade/district,
`a`/`s`/`d` = finer none/next/all, `o`/`p` = orientation flat/pointy,
`h`/`r` = shape radial/rect.

`out/SUMMARY.json` holds the earlier runs' extracted numbers in one file; the two
feedback-round runs are in `out/zio-finer-none/report.json` and `out/zio-finer-all/report.json`.


## Lattice clip (2026-09-24) — the grid stops at the map's edge

Surprise 2 of the orientation round, fixed: `strokeLattice` covered the VIEWPORT, so on a
bounded map the active grid and the two coarser `district` rungs ran on out over the void
(`out/lineup-rect-edge.png`, every frame). Two rules now, both in `main.ts`:

1. **A cell is stroked only if it EXISTS at that level.** `existsAt(L,q,r)`: for `L >= 0`
   that is `resolve() !== null` — the ownership chain reaching a root cell — which is already
   memoised per level, so the test is a map hit. For the coarser rungs (`L < 0`, cells m^|L|
   bigger than a root cell) a cell exists iff it OWNS a root cell; that ancestor set is built
   once by walking all 384/469 root cells up `|L|` rungs, cached per `latticeEpoch` (bumped by
   `invalidateFrom`, so painting shows up next frame).
   Each cell still strokes edges 0..2 — that is what keeps every interior edge at exactly one
   stroke, so translucent district lines never double-alpha — **plus** edges 3..5 when the
   neighbour across them is off-map, which is what keeps the map's own ragged silhouette
   closed and crisp. The edge -> neighbour table `EDGE_NEI` falls out of the corner phase
   (flat edge k faces 60k+30 deg, pointy 60k+60 deg) and is the only orientation-dependent bit.

2. **The coarser passes are additionally clipped to the DRAWN map.** Existence alone cannot
   trim them: a coarse cell legitimately exists as soon as it owns ONE root cell, but its
   hexagon is m^|L| times bigger, so its outline still runs out over nothing. `liveClipPath`
   is a world-space `Path2D` holding every existing ACTIVE-level hexagon over a padded rect,
   one subpath each; hexes are edge-adjacent and never overlap, so the nonzero rule unions
   them with no boolean work. `withMapClip` clips in world space, hands the transform back
   (strokes stay screen-space, line widths unchanged), and wraps BOTH district passes — one
   `clip()` per frame, not one per pass.

**Clipping to the ROOT footprint is not enough, and that is Surprise 1 biting again.** A
parent's children do not fill the parent hexagon, so at z=12 on the rect map the level-0 cell
outline itself sat in unpainted void — a clean 960 px diagonal across the black. The clip has
to follow the ACTIVE level's silhouette, i.e. exactly what the fill pass paints. (`hullWorld`,
the hole mask's footprint, is the wrong polygon for this too: it runs through boundary cell
CENTRES and would shave every edge cell in half.)

Two things keep it cheap: the padded-rect cache (same "pad and reuse" rule the surfaces use —
rebuild only on a level change, an edit, or the camera leaving the pad), and **the clip is
skipped entirely when every cell in the padded rect exists**, i.e. whenever the view is deep
inside the map, which is most frames on a radial world.

### Verify — `zoom-in-out --steps 64 --stride 1 --fiducial`, `orient=pointy&shape=rect&look=corner&zmin=0.62`

| | before (same command, lattice unclipped) | after |
|---|---|---|
| holes | 0 fail / largest 18 px2 | **0 fail / largest 18 px2** |
| fiducial max / mean | 0.71 / 0.71 px | **0.71 / 0.71 px** |
| blank frames | 0 / 78 | **0 / 78** |
| crossing pop ratio (G3) | 1.11x | **1.11x** |
| pop med / max / ratio | 5.826 / 9.412 / 1.62x | 4.481 / 7.324 / **1.63x** |
| path diff (G4) | mean 0.039 / max 0.047 | **mean 0.039 / max 0.047** |
| frame time mean / p95 | 16.67 / 16.7 ms | **16.68 / 16.7 ms** |
| dropped > 33 ms | 0 / 1254 | 1 / 1225 |
| draw time mean / p95 | 0.48 / 1.2 ms | 0.98 / 1.7 ms |
| anchor, page errors | PASS, none | **PASS, none** |

Every gate is unchanged. **Absolute pop drops ~23 %** and that is the fix working, not noise:
pop is mean absolute luma difference between frames, and the grid that used to churn over the
black void was contributing to it. The RATIO — the number G3 actually gates — is identical to
three decimals. Draw time doubles off a small base (0.48 -> 0.98 ms mean) for the clip;
frame time is unchanged because that base is nowhere near the 16.7 ms budget. Before the
one-clip-per-frame and skip-when-interior optimisations the same run cost 1.22 ms mean draw
and **10** dropped frames, so both were worth doing.

Lineups: `out/lineup-rect-edge-clipped.png` (zooms 0.6/1.5/4/12, flat/rect and pointy/rect,
corner anchor) and `out/lineup-orient-clipped.png` (radial, both orientations). In all 16
panels the void is pure background — no lattice line of any rung outside the map at any
zoom — while the map's own edge keeps its full outline. `cellsDrawn` is unchanged from the
orientation round in every panel (radial 338/345, 522/520, 1760/1746). Full-res close-up of
the worst case: `out/lineup-rect-edge-z12.png`. Run `out/zio-pointy-rect-clipped/`.

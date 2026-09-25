# Independent verification — h17h18-floor-and-authoring

Verifier re-ran from source (`build.mjs`, 243,565 B bundle) on 2026-09-24.
Fresh runs written to `out/V-*` (builder's `out/{zio,t,pz}-*` left untouched for comparison).

## Reproduction (fresh vs builder)

| run | metric | builder | fresh | dev |
|---|---|---|---|---|
| zoom-in-out 64/1 crisp | pop med/max/ratio | 8.415 / 21.976 / 2.61 | 8.415 / 21.976 / 2.61 | 0% |
| zoom-in-out 64/1 ghost | pop med/max/ratio | 11.615 / 22.253 / 1.92 | identical | 0% |
| both | fiducial max/cum | 0.71 / 1 px | identical | 0% |
| both | blank/frozen/holeFail | 0/0/0 (78 fr) | identical | 0% |
| both | pathDiff pairs/mean/max | 6 / 0 / 0 | identical | 0% |
| ghost | ghostCells med/peak | 967 / 7084 | identical | 0% |
| zoom-in 48 timing crisp | mean/p95 | 16.67 / 16.7 | 16.67 / 16.7 | 0% |
| zoom-in 48 timing ghost | mean/p95/max/>33/>50/LT | 55.74/116.6/150.1/346/174/197 | 56.25/133.2/133.4/309/160/178 | p95 +14%, >33 -11% |
| zoom-in 48 timing blur | mean/p95/>33 | 20.01/33.4/110 | 18.35/33.3/42 | >33 **-62%** |
| authoring-probe A/B/C | all PASS | byte-identical result.json | 0% |

Deterministic everywhere except frame-time counters on the two variants that are not
vsync-pinned. Verdicts (crisp/spring PASS, blur p95 FAIL, ghost hard FAIL) all reproduce.

## New measurement the builder did not take: G8 at 6x throttle

| variant | mean | p50 | p95 | max | >33 | >50 | LT |
|---|---|---|---|---|---|---|---|
| crisp @6x | 37.34 | 16.8 | **100.0** | 316.6 | 199 | 89 | 99 |
| spring @6x | 42.93 | 33.4 | **83.4** | 150.0 | 256 | 120 | 137 |

The crisp/spring G8 PASS is a **1x-only pass**: the contract says `_template` (naive) is
vsync-pinned at 1x and fails at 6x, and this composite behaves the same way. Nothing in
this spike has been shown to meet G8 on a slow main thread.

## Where a gate is passed without being earned

1. **G3 pop is camera-dominated, not treatment-dominated.** popMax is 21.976 to three
   decimals for crisp, blur AND spring, at step 61 — zoom 0.78, `pastFloorX 0.034`, i.e.
   on the zoomed-OUT tail where all three treatments render identically. The pop column
   ranks nothing about the floor treatments.
2. **The zoom-in-out trace barely visits the regime under test.** Only 9 of 64 steps are
   past the anchor's floor, max 1.84x past. The `home=child` G1/G2/G3/G4 table is
   overwhelmingly a measurement of the pre-floor renderer.
3. **13 of 77 pop samples are exact zeros** — the duplicate capture the rig takes after
   each `matched-in/out` pathDiff snap. They depress the median and inflate
   `maxOverMedian` by ~18% (crisp 2.61x -> 2.21x on non-zero samples, ghost 1.92x ->
   1.70x). Rig-wide, affects every spike equally; ordering survives.
4. **Ghost's "best pop ratio" is bought by raising the floor, not lowering the ceiling**
   (median 8.4 -> 11.6, max unchanged). The builder says so in Surprise #5; the NOTES
   table still bolds it as if it ranked the treatments.
5. **Probe C (ghost determinism) is a tautology.** `ghostDigest()` is a pure function of
   `(docId, q, r, microQ, microR)` with no camera argument, so "identical after a 200x
   camera move" cannot fail. The camera-dependent parts of the ghost field that could
   fail — the `microPx < 2.2` cutoff and `GHOST_BUDGET = 24000` early-out, both of which
   change WHICH cells get infilled at different zooms — are not tested. (The budget never
   bit in any run: peak 7084.)
6. **Probe A's "1 distinct doc, 1 distinct cell world size" is one fact counted twice** —
   `cellWorldSize` is a per-doc constant, so the second follows from the first. And
   minting can only ever happen in `strokeStart`, so "0 docs minted mid-stroke" is true by
   construction, not by test.
7. Not a cheat, checked and clean: body background `#0b0e13` matches the canvas fill
   exactly (contract-compliant, and the detector does read 23% bg on the widest frames);
   footprint is the hull of root ring-12 **centres** (conservative, per contract);
   the HUD is opaque; fiducial drift is measured in the pixel domain, 0.71 px = the
   quantisation floor; the four variants are genuinely different renders
   (`renderScale` 37.5 vs 5000 for blur vs crisp; ghost adds up to 7084 primitives;
   spring reaches z=27.9 where crisp reaches z=41.4 on the same wheel trace).

## Kill criteria, honestly

**H17** — not killed, but none of its four kill criteria were actually exercised.
Determinism holds (tautologically). "Generation exceeds the settle budget" is untested
because the spike deliberately did not implement the settle-bake, so the 116-133 ms p95 is
a cost of the strawman, not of the hypothesis. The contact sheet does NOT judge ghost
worse than smoothed-upscale — ghost is clearly better than blur. The G10 human honesty
test was not run; the builder's own read (hatch invisible at thumbnail and at deep zoom,
ghost reads as authored terrain variation) says it would fail, and the lineups agree.
H17's own asserts — no-contamination, zero-storage, cross-rung agreement on shared cells,
<2 ms/chunk generation — were all skipped.

**H18** — the central claim is demonstrated; all three kill criteria are untested.
There is **no hysteresis band in this spike at all**: the edit rung is derived from the
deepest authored doc under the *pointer* (position), not from *zoom* as H18 specifies, so
the jitter-flip sweep (0/10/15/25%) that H18 names as its kill criterion cannot even be
run against this implementation. Input-path convergence (trackpad, pinch) is untested —
wheel only, chromium only, no WebKit. Pan-past-cap is untested (builder flags this).
Assertions (b) jitter, (c) cap convergence, (d) pan-past-cap, (e) HUD truth and (f) ghost
pitch from the H18 spike plan were not attempted.

## What the pictures show (independent read)

- **lineup-nochild, crisp:** flat olive rectangle with one hairline; at z=120/240 a single
  colour. "The map got bigger."
- **lineup-nochild, blur:** the hairline becomes a progressively fatter soft dark diagonal
  smear — at z=240 a wide out-of-focus band. It reads as a rendering bug or a bad JPEG,
  not as absent data. Blur also *exaggerates* the stroke (the floor-scale stroke is
  magnified), so it is worse than crisp, not gentler. Confirms the builder's kill.
- **lineup-*, ghost:** the polka-dot is unmistakable — each parent hex carries a *round*
  speckled disc with flat parent-coloured gaps at the 30-degree corners, exactly the
  ring-7 rosette under-fill. By z=120-240 compounded 42% alpha washes to a milky pale
  field that is as uninformative as crisp, only paler. I could not see the 6 px hatch in
  any lineup cell or contact-sheet frame.
- **lineup-*, spring:** a perfectly healthy detailed map in every cell, with the rig's red
  `clamped ->` flag on all four, because the camera never left 1.5 / 22.5.
- **zio-ghost contact sheet:** ghost texture switches on at #6 (z=1.585) and is on for the
  rest of the run; frames #0/#1 and #63/#64 carry visible unpainted background on the right
  (bg 23%), outside the footprint, correctly not counted as a hole.
- **authoring B1:** the minted lattice is the same olive as the parent with a fine
  honeycomb added — literally "identical except the finer grid lines", though the new
  honeycomb texture is plainly *visible*; 1.02% of pixels is a true number that undersells
  the perceptual change.

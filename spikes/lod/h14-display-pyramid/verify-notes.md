# verify-notes.md — independent verification (2026-09-24)

Rebuilt from source (`build.mjs h14-display-pyramid`, 225.5 KiB) and re-ran the builder's
reproduce block. Spike source NOT modified.

## Reproduced exactly
- A zoom-in-out 64/stride1/1600x1000/fiducial: pop median 4.176, max 20.113, **4.82x**;
  fiducial max **0.71 px**, cum 0; holes 0 / blank 0 / missDraws 0; pathDiff 0.060/0.096;
  356 tiles rasterised, 256 resident, 100 evictions, 64.0 MB.
- base `_template?fixture=1` same trace: pop median 4.638, max 20.132, **4.34x**, pathDiff 0/0.
  (Verified `fixtureDemo.ts` uses the same MIN_ZOOM 0.62 / MAX_ZOOM 400 / WHEEL_K / home() as
  the spike, so "same trace" is a true statement.)
- C `genDelayMs=8`: pop 4.90x (claimed 5.03), pathDiff 0.062/0.097, holes 0, blank 0, miss 0.
- edit-probe: 5 tiles [0,4] / 16,908 px / 83 vs rebuild; 2 tiles [0,7] / 117 px; 2 tiles [0,10]
  / 1,494 px / 90 vs rebuild; `dirtyLeftAfterRepair` **1** in all three cases.
- smooth=low timing-only: mean 16.74, p95 16.7, 0 >50 ms.

## Direction confirmed, magnitude differs (machine load)
- smooth=high: mean 18.66 (claimed 22.30), p95 **33.3** (claimed 33.4), 65 >33 ms (claimed 192).
  Draw time still goes DOWN (0.54 vs 0.79 ms) while frame time goes UP — the compositor-cost
  finding is real and reproduces.
- throttle 4: pyramid mean 32.86 / p95 50 / 16 >50 ms / 23 long tasks (1266 ms);
  naive mean 21.36 / p95 33.4 / 1 >50 ms / 0 long tasks. Absolutes ~45% lower than the
  builder's, but the pyramid-is-worse ratio is LARGER here (1.54x vs 1.33x).

## New evidence the builder did not produce (strengthens G3)
Level swaps occur at steps 1, 8, 16, 23, 30, 33, 40, 47, 55, 62 (levels 3..8..3).
Pop at those steps: 18.48, 6.64, 2.86, 0.00, 5.36, 5.36, 0.00, 5.04, 3.06, 4.12 against a
median of 4.176 — **no level swap is a pop outlier**. The run's pop max (20.1) is at step 0,
where the world first fills the frame, and the naive baseline's max (20.1) is the mirror step.
G3 is earned, and the 4.82x-vs-4.34x gap is an artifact of A having a *lower* median
(4.176 vs 4.638) — i.e. the pyramid is smoother frame to frame, not poppier.

## Corrections / unsupported claims
1. **"A budget: 5 of 64 steps showed fallback, max 34 of 60 tiles blurry"** is not in any
   preserved artifact. `out/A-zoom-in-out/report.json` says **1 step, max 3 tiles**;
   `out/zoom-in-out-timing` says 6 steps / max 50. C reproduces at 17/64 max 48 (claimed 20/52).
2. **The zoom-in-out trace only reaches zoom ~12.73 of MAX_ZOOM 400** (turnaround at step 31;
   header: "zoom 0.62 -> 0.620"). All capture-based G1/G2/G3/G4 evidence covers display levels
   z=3..z=8 only — 6 of 14. The NOTES line "a continuous dive from the ring-12 root to a
   depth-2 rosette and back out" overstates it; the depth-2 rosette is only reached in the
   lineup (zoom 32 -> level 9). **G6 (degradation past the authored floor) is untested.**
3. **No seam scanline-gradient measurement exists**, which is the specific G7 assertion H14's
   spike plan asked for. The hole detector is a proxy that only bites if a seam is
   *background-coloured*; a tile edge that is merely darker/lighter would pass. Visual check at
   settle (lineup-settled) shows no seams and no two-lattice moire, so G7 is probably fine —
   but it is asserted visually, not measured.
4. **The fiducial is a live overlay drawn from `screenOf`, never baked into a tile.** It proves
   the overlay matches the transform; it cannot detect content displacement introduced by
   `xs[i]=round(...)` tile quantisation (bounded ~1 px, and each tile's blit scale differs
   slightly from `zoom`). G2 for *raster content* is weaker than the 0.71 px number reads.
5. **Contact sheets are not in-flight evidence.** The C (genDelayMs=8) contact sheet is visually
   indistinguishable from A's — every frame sharp — even though its own per-step metrics report
   17/64 steps with fallback tiles. At the rig's ~350 ms/step cadence refinement always settles
   before the screenshot. `lineup-inflight` (60 ms settle) is the only honest in-flight visual,
   and it does show row C blurring in axis-aligned 256 px blocks.
6. **A vs B is a near-null comparison on this fixture**: identical pop (4.82/4.89) and identical
   pathDiff to three decimals; they differ only in 1-vs-0 fallback steps and in pan-zoom timing.

## Kill criteria (H14.md)
- "Refinement cannot keep pace" — not killed for the intended treatment (1/64 steps);
  killed only under deliberate fault injection.
- "An edit forces a full rebuild" — not killed (2-5 tiles, 2 frames). BUT the brief's own risk
  ("overview tiles go stale unless invalidation cascades up") **materialised**: ancestors are
  marked dirty and never regenerated, and level 0 is pinned so its stale tile persists forever.
- "Seam gradient > 1.2x" — cannot be adjudicated; the measurement was not built.

## Honest bottom line
The mechanism works and the feel claims hold at the level they were measured. Every perf number
is taken on a 1314-cell fixture whose naive full re-render costs 0.79 ms/frame — there is
nothing for the pyramid to amortise, and at 4x throttle it is measurably worse than just
redrawing. The spike proves the pyramid is *feasible and smooth*; it does not begin to prove it
is *worth it*.

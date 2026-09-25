# Independent verification — h1h2-surface-cascade

Verifier: separate agent, 2026-09-24. Rebuilt from source and re-ran the builder's commands.
Fresh runs live in `out/V-*` (builder's originals left untouched). Spike source NOT modified.

## Rebuild
`node spikes/lod/_shared/build.mjs h1h2-surface-cascade` -> 231.9 KiB, clean, no errors.

## Reproduced (fresh vs NOTES.md)

| run | claimed | fresh | verdict |
|---|---|---|---|
| A @1x timing-only | 17.03 mean / p95 16.8 / 0>50 / 1 LT | 16.67 / 16.8 / 0 / 0 | CONFIRMED (slightly better) |
| D @1x timing-only | 17.41 / 16.8 / 0>50 / 0 LT, peak 99.86 MB | 17.29 / 16.8 / 0 / 0, peak 99.86 MB | CONFIRMED |
| A zoom-in-out --fiducial | fid 0.71, blank 0, holes 0, pop 1.32x, pathDiff .025/.039 | identical (0.71 / 0 / 0 / 1.32x / .025/.039) | CONFIRMED exactly |
| A @throttle 4 | 57.7-84.0 mean, >50 246, LT 379 | 54.34 & 54.00, >50 203 & 189, LT 320 & 316 | CONFIRMED (band) |
| _template @throttle 4 | 46.19 mean, >50 100, LT 109 | 44.53 & 44.65, >50 82 & 67, LT 94 & 93 | CONFIRMED |
| focus=missing pop | median 13.66 max 27.25 = 1.99x | 12.49 / 19.78 = **1.58x** | DEVIATES -21% |
| A @thr4 p95 | 83.3 ms | **66.7 ms twice** (= baseline 66.6) | DEVIATES -20% |
| **B (64 MB, minHexPx=3)** | **19.95 mean / p95 33.4 / 120 >33** | **16.70, 16.70, 16.74 mean; p95 16.7-16.8; >33 = 1-2 (3 runs)** | **REFUTED** |

## Consequences of the B refutation
Fresh B draws 3 levels, 140 blits, peak **62.37 MB** (inside its 64 MB budget), 0 evictions,
p95 16.8, 0 frames >50, 0 long tasks. So **full per-place detail at 1x does not need ~100 MB** —
64 MB is enough, and D's 100 MB is not the price of the look. The NOTES table's B row, and the
surfPx sweep built on differences of the same magnitude (384/768/1536 -> 20.11/18.17/17.36), are
not reproducible here; "bigger surfaces are faster" (Surprise #2) is unsupported by my data.

Under throttle 4, fresh B is 68.85 mean / p95 83.4 / 427 >50 — far worse than A and than the
baseline. The throttled kill reproduces solidly and is order-independent (I ran template first
on the repeat pass).

## Gate-earning audit
1. **G1 is unfalsifiable in this spike.** A pinned 640 px whole-world overview is blitted under
   every frame, so no footprint pixel can be background. `overviewOnlyFrames 3` and
   `framesWithMissingChunks 13` in the A run: the cascade was genuinely incomplete on 13 frames
   and the backstop covered it. That is the design's intent, but holes=0 carries no information
   about cascade coverage. The spike ships no `?holes` / `?lie` mis-calibration switch, so neither
   detector was ever proven to bite on THIS spike. (The footprint itself is honest:
   968,032 px2 = 60.5% of the viewport against 36% background, so it is not shrunk to dodge.)
2. **The fiducial is close to tautological here.** It is drawn at `screenOf(fiducialWorld)` using
   the same scalars as the blit destination rect, and there is no `?lie`. It catches per-step
   accumulation but cannot catch a content-vs-transform misregistration inside `rasterise()`.
3. **A's G8 pass is earned by drawing less**: per-step `levelsDrawn` maxes at 2 of 3 over the whole
   zoom-in-out trace, and lineup-feel shows the per-place look is absent at z=1-3. Disclosed.
4. **The zoom-in-out trace only spans 0.42 -> ~4.9**, not 0.42 -> 54 as NOTES states for those
   runs (the rig splits the range across in/out). Deep zoom is exercised only by the 48-step
   zoom-in.
5. **At deep zoom the cache is not what is measured**: frame 053 (z=25) HUD reads
   `blits 1  directLv 2  cells 200` — one overview blit plus a 200-cell vector re-render.
6. **G3/G4 vs "_template, same trace" is not the same trace**: the reference run used
   wheelDelta -32.24, the spike's runs -51.4. The contract says pop only compares on an identical
   trace. 1.32x vs 1.35x is not apples-to-apples (both are still nowhere near a 10-50x swap).
7. Three of the four lineup-feel rows (budget 32 / direct=0 / budget 8) are visually identical at
   all four zooms — three of the "variants" differ only in cost, not in output.

## Kill criteria
- H1 "no config holds p95 <= 16.7 ms with 3 levels under 64 MB": **not triggered** — fresh B does
  exactly that. But H1's `rebuilds < 2/s` clause **is** triggered everywhere and was never
  evaluated: A = 100 rebuilds / ~23.5 s = 4.3/s; B = 359 / ~7.6 s = ~47/s. H1's other arms
  (ImageBitmap vs canvas backing, DPR1-vs-DPR2 SSIM, padded-viewport unit, iPad allocation ramp)
  were not built, so H1 cannot be closed by this spike.
- H2 "any blank sample under delayed arrival": none seen (but see audit #1). "p95 > 16.7 ms with
  3 rungs": not triggered at 1x (B and D). The apron clauses are untested — no apron was built.
- G8's throttled clause (p95 <= 33 ms at 4x) fails for the cascade **and for the naive baseline**,
  so at 1600x1000 on this machine nothing passes it; the discriminator is relative, not absolute.

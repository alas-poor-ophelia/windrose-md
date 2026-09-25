# Independent verification of h6-nest-composite (2026-09-24)

Rebuilt from source (`node spikes/lod/_shared/build.mjs h6-nest-composite`, 206.8 KiB, clean)
and re-ran 8 captures into `out/V-*`. Numbers below are mine, not the builder's.

## Reproduced (builder -> mine)
| run | metric | builder | mine |
|---|---|---|---|
| zoom-in-out matched trace, blend=zoom | pop med / max / max-over-med | 4.075 / 19.617 / 4.81x | 4.075 / 19.609 / 4.81x |
| zoom-in-out matched trace, blend=none | pop med / max | 4.024 / 19.617 | 4.075 / 19.617 |
| pan-zoom matched trace, blend=zoom | pop med / max | 4.192 / 19.609 | 4.206 / 19.609 |
| zoom-in native 0.2->900 | pop med / max | 5.877 / 23.604 | 5.991 / 23.614 |
| all | blank / holeFail / largest hole | 0 / 0 / 0 px2 | 0 / 0 / 0 px2 |
| all | anchor cum / fiducial max / fiducial cum | 0 / 0.71 / 1.0 px | 0 / 0.71 / 1.0 px |
| zoom-in-out | G4 pathDiff (5 pairs) | mean 0 / max 0 | mean 0 / max 0 |
| timing 1x, cache on | frame mean / p95 / >50ms | 16.74 / 16.8 / 0 | 16.80 / 16.8 / 0 |
| timing 4x, cache on | frame mean / p95 / >50 | 49.80 / 133.4 / 187 | 35.19 / 66.7 / 89 |
| timing 4x, cache off | frame mean / p95 / >50 | 39.01 / 83.4 / 114 | 30.31 / 50.0 / 16 |

The 4x-throttle absolute numbers are 30-45% better on my run (machine load), but the SIGN is
identical: cache-on is worse than cache-off on mean, p95, >50 ms, draw time and long tasks.
Both arms still fail G8's 4x criterion (p95 <= 33 ms).

## Findings the NOTES do not state
1. **`?cull=1` is a dead flag.** `CULL` is read at main.ts:25 and used only in the HUD string
   (main.ts:411). `intersectsViewport()` (main.ts:351) runs unconditionally in the draw loop for
   every arm. The "cull vs no-cull" 4x comparison (57.37 vs 49.80) compares identical code paths;
   surprise #4 measures run-to-run noise, and culling is untested rather than shown worthless.
2. **The "exactly the same trace as h0" claim is approximate.** Start zoom (0.62), per-step ratio
   (1.1082), steps, stride, viewport, seed and cursor match, but the ladders diverge from step 5
   because each spike's matched-zoom snap targets come from its own `zoomRange()`: h6's apex is
   10.68, h0's is 12.73 (19% higher). This does not manufacture h6's win - see 3.
3. **The strongest G3 evidence is not the headline ratio.** Per-frame, at matched zooms on the
   out-leg, h0(hard) reads z4.05:10.15, z3.66:18.19, z3.30:15.07, z2.98:**40.12**; h6 over the same
   band reads z4.18:3.26, z3.77:3.07, z3.40:3.34, z3.07:3.28. h6's own max (19.6) occurs at
   z=0.63-0.69, where h0 independently reads 19.7-20.0 - i.e. the two spikes agree on the camera-
   motion baseline and differ only at h0's swap.
4. **A depth-2 crossing IS exercised in the matched trace** (per-step `deepestDrawn` goes 1 -> 2 at
   z~3.0 in and back at z~2.2 out), so "no pop at a level crossing" is measured, not assumed. The
   depth-1 children are already at alpha 1 at the trace's start zoom (cell px = 10.67*zoom, LO=2),
   so that crossing is NOT in the matched trace - only in the native-range runs.
5. **G9 at dpr 2 was never run; it breaks the budget.** `--dpr 2` zoom-in-out: `bytesCached` peaks
   at **147.5 MB** with 4 surfaces (dpr 1 peaks at 46.1 MB, not the 18.4 MB quoted). H1's declared
   budget is 64 MB, so H6's own kill criterion ("live-surface bytes exceed H1's budget") fires at
   dpr 2 - for the CACHE, which this spike already measures as net overhead. `?cache=0` has
   bytesCached 0 and identical output.
6. **G6 is a fail by the letter of the gate, not a pending call.** 00-definition-and-gates.md:16
   says "Crisp-and-unmarked = fail". `lineup-past-floor.png` is crisp and unmarked at z=150-900.
   The NOTES describe the behaviour accurately but grade it "OBSERVED, needs a call".

## Images, read independently
- `V-zio-zoom/contact-sheet.png`: one continuous ramp, 76 frames, no discontinuity; a green child
  rosette emerges inside a grey parent hex around z~1.8-2.0 and grows smoothly; the out-leg mirrors
  it. Fastest-looking frames are at z<0.8 (whole world sweeping), matching where pop peaks.
- `lineup-blend-dive.png`: the three blend rows are indistinguishable at all five zooms. The child
  rosette reads as a green hexagonal DECAL pasted into a flat grey parent hex, with parent grey in
  the six corners - the under-fill is obvious wherever parent and child colours disagree.
- `lineup-hull-seam.png`: siblings composite with no gap and an unbroken road - but both parent and
  child are forest green there, so "no seam" is partly colour coincidence, not geometry.
- `lineup-past-floor.png`: z=150-900 is two or three enormous, perfectly crisp flat hexes plus a
  giant label. Never blank; also never blurred. `cache=0` row is pixel-identical (cellsDrawn 343 vs
  0 proves the two arms really do different work).

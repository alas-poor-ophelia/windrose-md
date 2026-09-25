# _template — naive baseline

## Hypothesis
A dead-simple immediate-mode renderer (re-draw every authored cell, every frame, at the
live continuous zoom) is correct on anchoring and never blank, but has no answer for
scale: cost is O(cells in view) per frame with no cache, no level pyramid and no way to
show coarse content where fine content is not authored. It exists to prove the rig and to
be the number every real LOD spike has to beat.

## What was built
- ~1,951 hex cells (`HexGeometry(24, 'flat', null).getAllRadialCells(25)`), deterministic
  seeded terrain colours (coarse 3x3 blobs + per-cell shade jitter). `?seed=` and `?rings=`.
- Cursor-anchored wheel zoom (`zoom *= exp(-deltaY * 0.0015)`, clamped 0.38..8) and
  pointer-drag pan, both implemented in the spike, driven by the rig as real input events.
- Full redraw per rAF: cull by screen bounds, fill hex path, stroke above 5 px, and draw a
  per-cell "detail" mark above 18 px scaled hex size (a stand-in for authored fine detail).
- HUD with zoom / scaled hex size / cells drawn, so contact-sheet thumbnails are readable.

## Measurements
1280x800 @1x, 48 steps, seed 1, headless chromium (see `out/<scenario>/report.md`):

| scenario | zoom | anchor drift (per-step / cumulative) | frame time mean / p95 | >33ms | blank | frozen |
|---|---|---|---|---|---|---|
| zoom-in | 0.38 -> 8.0 | 0 / 0 px | 16.67 / 16.8 ms | 0 | 0/15 | 0/15 |
| zoom-out | 8.0 -> 0.38 | 0 / 0 px | 16.67 / 16.8 ms | 0 | 0/15 | 0/15 |
| zoom-in-out | 0.38 -> 0.38 | 0 / 0 px | 16.67 / 16.8 ms | 0 | 0/16 | 0/16 |
| pan-zoom | 0.38 -> 0.38 | 0 / 0 px (pan 0 px) | 16.67 / 16.7 ms | 0 | 0/16 | 0/16 |
| settle | 0.38 -> 8.0 | 0 / 0 px | 16.67 / 16.7 ms | 0 | 0/17 | 0/17 |

Draw time: mean ~1.0 ms, p95 ~1.9 ms, max ~2.7 ms. Long tasks: 0. Page errors: 0.
Worst case is fully zoomed out — all 1,951 cells drawn, still ~2.7 ms per frame.

## Verdict
**Baseline established, and it is not yet a stress test.** At 1,951 cells the naive path
is pinned to vsync (16.67 ms) with ~1 ms of draw, so frame-time comparisons against it are
meaningless until the load is raised. Use `--query "rings=60"` (~11k cells) or larger when
comparing renderer strategies; anchor, blank and frozen comparisons are valid at any size.
What the baseline genuinely cannot do, and what the real spikes must answer:
no coarse fallback where detail is unauthored, no cache across frames, one level only
(`levelsLive: 1`), and the "detail appears" transition at 18 px is a hard pop, not a blend.

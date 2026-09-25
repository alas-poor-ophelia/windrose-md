# Independent verification — g1-global-lattice

Verifier: separate agent, 2026-09-24. Rebuilt from source (`build.mjs g1-global-lattice`,
259.0 KiB) and re-ran the decisive commands. No spike source was modified.

## Numbers re-run (claimed -> measured)

| claim | NOTES | my run | verdict |
|---|---|---|---|
| re-seat, all 3 ladders x 2 seat rules (`probe.mjs stats`) | 508/676, 96/169, 676/676, 52/169, 244/676, 169/169, 85 630 authored | identical to the digit | CONFIRMED |
| matched zoom-in-out popMed / popMax / ratio | 7.414 / 18.996 / 2.56x | 7.416 / 18.996 / 2.56x | CONFIRMED |
| crossingPop ratio, m=13 matched | 2.17x (15.796 vs 7.125) | 2.19x (15.796 vs 7.077) | CONFIRMED |
| pathDiff hyst=0 | 0.005 mean | 0.006 mean, 0.013 max | CONFIRMED |
| "the 203 max-abs pixel is my own HUD" | asserted | verified in pixels: every diff pixel >30 luma between 006.png/067.png lies in x 66-208, y 54-61 (HUD line 3); max diff OUTSIDE the HUD box is **9** | CONFIRMED |
| pathDiff hyst=0.15 (G4 fail) | 1.954 / 11.531 | 2.302 / 11.485 | mean 18% higher than claimed (over the 15% flag) — same verdict, fails G4 by >2x either way |
| jitter m=13 one hyst=0 | levels 0101…, 39 flips, flipCount 0, pop 14.871 med / 14.876 max | identical | CONFIRMED |
| jitter diff% one vs fade | 17.26% vs 12.76% | 17.26-17.29% vs 12.76-12.78% | CONFIRMED |
| timing 1x | p95 16.7, 0 frames >50 ms | p95 16.7, 0 >50 ms | CONFIRMED |
| timing 4x throttle | p95 66.7, 78 frames >50 ms | p95 66.7, 65 >50 ms | CONFIRMED (count 17% lower, same FAIL) |
| h6 / h0 comparison rows | 19.617 / 40.120 popMax | h6 own report 19.609, h0 40.120 | CONFIRMED |
| edit coherence, Ashford | town vanishes, cells inherit forest, LABEL survives | reproduced; see the before/after pair | CONFIRMED |

Timing is rAF/`startFrameClock`-derived and `--timing-only` suppresses the per-step
screenshot (capture.mjs:254), so the frame budget is not screenshot-contaminated.

## The Guildmaster's model — checked directly

- **Does the WHOLE visible map subdivide?** Yes. Regenerated `lineup-verify-pastfloor.png`
  over root hex (-5,-3), which has no authored descendant: ladder 13 goes L0 -> L1 -> L2 -> L3
  across z 1/3/9/30/100/400 and the frame is a field of 14-40 px hexes at every rung.
  The jitter pair (below) shows the same subdivision in a region with no authored content
  at all, so subdivision is not gated on authorship.
- **Do unauthored fine hexes inherit the coarse fill with the fine lattice stroked?** Yes,
  and visibly: at z=3 the coarse terrain boundary survives as a staircase of fine hexes in
  the parent colours. The coast lineup makes the point sharply — level 1 is the SAME
  coastline staircase, re-tiled finer, not a smoother coastline.
- **Zoom 400 over an empty root hex:** small hexes (level 3 on ladder 13, level 7 on
  ladder 3). Never a giant crisp hexagon. This is the spike's cleanest positive.
- **Does authored fine content actually draw over an inherited field?** Yes. `look=siblings`
  at z=1 / level 0 reports `levelsDrawn 3` and shows the authored lake and town as specks
  inside one root hex; the Ashford still shows 7 authored orange hexes in a sea of inherited
  forest fine-hexes. The inherit chain is not short-circuiting to level 0.

## Where the spike passes on thinner evidence than the table suggests

1. **crossingPop rests on 2 frames.** Both headline matched rows (m=13 2.17x, m=5 1.38x)
   have `crossingFrames: 2`. The matched trace tops out at **z = 10.68**, so the second
   crossing (14.787) — the one NOTES itself calls the largest visible event, with a ~3x local
   bump — is NEVER sampled in the headline row. The 2.17x is one crossing (L0<->L1) hit once
   per leg. Non-matched runs have 4-6 crossing frames. This is not disclosed in NOTES.
2. **The 1.52x "honest baseline" is cross-trace.** It comes from `contract.md:136`, measured
   on a `_template` clone with FAKE crossings on a 16-step zoom-**in**; g1's 1.38x is a
   64-step zoom-in-out. `_template`'s own stored runs contain no 1.52x. contract.md warns
   in the adjacent row that pop comparisons only mean anything on the same trace.
3. **"fade removes the flip-flop" is a shade strong.** Side-by-side crops of adjacent jitter
   notches: under `one` the two frames are the same colour field under two completely
   different grids (glaring). Under `fade` both grids are present in both frames, but the
   fine hatch is still visibly stronger on the level-1 notch. The alternation is strongly
   reduced, not eliminated — matching the 26% diff% drop, not a removal.
4. **Inherit is exercised outside and below sub-maps, never inside one.** The sampling
   derivation marks EVERY level-L cell inside a child hull as authored, so within a sub-map
   at its seat rung there are no unauthored cells to inherit. The frontier and the
   past-the-floor rungs are genuinely exercised; sparse authorship inside a region is not.
   The derivation is documented honestly in NOTES; this is a fixture-shape limitation.

## Things NOTES already discloses and that I confirmed rather than caught

`flipCount 0` is not proof of no flip-flop (it is glaring in the frames); the HUD counter
fakes `maxAbsLuma 203`; g1's pop MEDIAN is inflated relative to h6 so the ratio flatters it;
the jitter `crossingPop` ratio of 3121x is meaningless; the m=3 jitter never straddled a
crossing; surfaces are never evicted (code: `surfaces` is only cleared in `resize()`/`home()`
— my run measured 36.86 MB over 4 surfaces, the same 9.216 MB/surface as the claimed
46.08 MB over 5); hyst=0.15 breaks G4 and makes jitter worse; G6 fails for want of a
provenance treatment; the Ashford label survives erasing Ashford.

The self-criticism in NOTES.md is accurate and, in three places (the HUD, the pop-median
denominator, the `flipCount 0` trap), catches problems a reader would otherwise have had to
find. I found nothing the report hides.

## Verdict

**Promising.** The model does what the Guildmaster described, the lattice math is h12's
reused unchanged, the level is a pure function of zoom at hyst=0 and the declared
`crossings` array is the same expression as the selection rule (verified: the jitter level
series flips exactly at the declared z=1.1375). Real open costs: the un-evicted 46 MB of
surfaces, the 4x-throttle p95 (66.7 ms `one`, 150 ms `fade`), the lattice flip-flop under
`one`, and the re-seat loss. None of them is concealed.

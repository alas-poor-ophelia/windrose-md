# LOD spikes

R&D on continuous ("Leaflet-style") zoom for authored hex worlds: detail resolves where it
was authored, the coarser level scales up and blurs where it was not, the view is never
blank, and content under the cursor stays under the cursor. Nothing here ships;
`spikes/**` is ignored by eslint and by `tsconfig.check.json`, so it can't break `npm run check`.

## Commands

```bash
node spikes/lod/_shared/build.mjs <slug> [--watch]     # -> <slug>/dist/bundle.js
node spikes/lod/_shared/capture.mjs <slug> --scenario zoom-in
node spikes/lod/_shared/capture.mjs <slug> --scenario pan-zoom --steps 60 --viewport 1600x1000 --dpr 2
node spikes/lod/_shared/capture.mjs <slug> --hold      # headed, stays open for manual play
```

Scenarios: `zoom-in`, `zoom-out`, `zoom-in-out`, `pan-zoom`, `settle`.
Flags: `--stride N` (screenshot every Nth step, default 4), `--seed S`, `--delta N`
(skip wheel calibration), `--query "k=v&k2=v2"` (appended to the page URL).
Output: `<slug>/out/<scenario>/` — `contact-sheet.png` (read this first: the whole zoom as
one labelled image), `frames/NNN.png`, `report.json`, `report.md`.

## Rules

1. Read `_shared/contract.md` before writing a spike; copy `_template/` to start.
2. Import **pure geometry/renderers from `src/geometry/**` only** — never `src/hooks/**`,
   `src/components/**`, or anything that imports `obsidian`.
3. Never modify `src/`, `types/`, `tests/` or root configs from a spike.
4. Every spike folder carries a `NOTES.md` with four headings: **Hypothesis**,
   **What was built**, **Measurements** (paste the report.md table), **Verdict**.
5. `_template` is the naive baseline (full redraw per frame). Compare against its
   `report.json` for the *same* scenario, viewport, dpr and seed, or it's noise.

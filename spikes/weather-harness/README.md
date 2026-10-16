# Weather harness (Windrose + Wadjet)

Private, offscreen, desktop-sized Obsidian booted with BOTH plugins in a scratch vault
(`C:\Dev\scratch-vaults\windrose-weather`, wiped each run). It is a visual/eval harness, not a
test suite, and it never touches the MiniSheet Dev or Absalom vaults.

Reuses `C:\Dev\windrose\spikes\phone\phone-main.cjs` (quiet launch) and the electron in
`C:\Dev\windrose\node_modules` by path. Run from this folder with node (bun re-execs itself
under node automatically).

## Commands

```
cd C:\Dev\windrose\.wt\weather-wadjet\spikes\weather-harness

# screenshot of the hex demo map + 3-frame sequence + api keys
node --experimental-strip-types --no-warnings run.ts --windrose C:/Dev/windrose --wadjet C:/Dev/U+13080 --note "Weather Demo.md" --eval eval-api-keys.js --shots 3 --interval 1500 --out out
```

| Flag | Meaning |
|------|---------|
| `--windrose <dir>` | dir with `main.js`, `styles.css`, `manifest.json` (installed as `windrose-md`) |
| `--wadjet <dir>` | same, installed as `wadjet` |
| `--note <path>` | vault-relative note to open (`Weather Demo.md`, `Weather Grid Demo.md`) |
| `--eval <file.js>` | run JS in the renderer after open; last expression is the result, a Promise is awaited; JSON printed and written to `<out>/eval-result.json` |
| `--shots <n> --interval <ms>` | `<out>/frame-001.png` ... (plus `<out>/shot.png`, always written) |
| `--out <dir>` | output dir (default `./out`) |
| `--keep-open <ms>` | hold the window open after capture |
| `--width/--height` | window size, default 1600x1000 (Obsidian adds ~16px frame insets) |
| `--reduced-motion` | emulate `prefers-reduced-motion: reduce` before the note opens |
| `--vault <dir>` | scratch vault path (must contain `scratch-vaults`; also `WEATHER_HARNESS_VAULT`); default `C:/Dev/scratch-vaults/windrose-weather`. Use a distinct one when two runs may overlap |
| `--map-patch <file.json>` | `{ "<mapId>": { ...fields } }` shallow-merged into the seeded maps (e.g. a `measurementRoute`, a `viewState`); see `ribbon/map-patch.json` |
| `--shot-selector <css>` | also capture the first matching element as `<out>/element.png` |

Environment: `WADJET_DAY=<n>` sets the weather world's current day (fixture default 1; `HEX_NORTH=<deg>` rotates the hex demo map; 34 = rain in the highlands, 42 = snow in both regions, 52 = rain on the coast / grid map).

Sky evals (`evals/`): `fullpane.js` / `fullpane-grid.js` open the hex / grid demo map full-pane with the side panels folded and return the Sky's frame stats (`canvas.windroseSky`); `pause-check.js` proves the embed's loop stops when its tab is hidden; `crop.py` tiles cropped frames side by side.

The child Electron is always killed in `finally` (matched by its `--user-data-dir`).

## What is seeded

- Wadjet `data.json` from `C:\Dev\U+13080\test\e2e\data.fixture.json` (zones `greywold-highlands`, `ashfall-coast`).
- Windrose `data.json` with `onboardingState: "done"`; map store `windrose-md-data.json` at the vault root.
- `Weather Demo.md` (hex map `weather-demo-001`: 24x16 painted hexes, regions Greywold Highlands -> `greywold-highlands`, Ashfall Coast -> `ashfall-coast`, Unbound Plains with no zone) and `Weather Grid Demo.md` (square grid `weather-grid-001`).
- Extend the maps in `fixture.ts` (`buildVaultFiles()`).

## Traps

- The newest `%APPDATA%\obsidian\obsidian-<ver>.asar` is copied into the temp user-data dir; without it the old bundled app runs and Wadjet (needs 1.13+) fails.
- Wait for `wadjet.api.ready === true` as well as both plugins loaded; enabling returns before onload finishes.
- Notes embed the map small with the objects drawer open; use `--eval` to drive the map or open full-pane if you need more room.
- This is not a test runner: no assertions, no E2E fixtures.

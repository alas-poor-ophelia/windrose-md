# Phone CSS harness

Boots a private, offscreen Obsidian that emulates a phone, loads the Windrose
plugin built in this checkout, and writes screenshots plus an overflow report.
This is a visual check for phone-only CSS, not a test suite: it asserts nothing
and never touches your own Obsidian, your vaults, or `tests/fixtures/`.

## Run

```sh
bun run build:dev                       # the harness does NOT build; it uses ./main.js + ./styles.css
bun spikes/phone/shot.ts                # 390x844, both scenes, out -> spikes/phone/out/
bun spikes/phone/shot.ts --width 360 --height 740 --scene dungeon --out C:/tmp/phone
bun spikes/phone/shot.ts --scene map --eval spikes/phone/probe-example.js
```

Options: `--width`, `--height` (CSS px), `--scene map|dungeon|all` (default all),
`--out <dir>`, `--eval <file.js>` (runs in the renderer after each scene; the last
expression's value is printed, Promises are awaited).

Outputs in the out dir:

| File | What |
|------|------|
| `env.json` | emulation steps, final body classes, innerWidth/innerHeight |
| `map.png`, `map-overflow.json` | `_testing/smoke-test-map.md` with the map rendered |
| `dungeon-top.png`, `dungeon-bottom.png` | Generate random dungeon modal, before/after scrolling its scroll container |
| `dungeon-measure.json` | `.modal`, `.modal-content`, `.modal-container`, content element and the chosen scroll container: client/scroll dims, overflow-x/y, rect |
| `dungeon-overflow.json` | overflow report with the modal open (taken at scroll-top) |
| `<scene>-after-eval.png` | screenshot taken after `--eval` ran (only with `--eval`) |

Probes kept from the first phone pass (2026-10-16): `probe-phone.js` (palette
fit, canvas width, dungeon modal with Advanced expanded), `probe-flyouts.js`
(sub-tool flyouts against the viewport), `probe-settings.js` (map settings
modal tabs), `probe-color.js` (edge-rail color picker), `probe-chain.js` and
`probe-tree.js` (ancestor / DOM dumps for diagnosing a layout).

Overflow report rules: an element under `.modal` or any `[class*=windrose-]`
root is listed if its *visible* rect (clipped by overflow ancestors) passes the
viewport's left/right edge, or its bottom edge when no vertical scroller is
above it; or if `scrollWidth > clientWidth + 1` with `overflow-x` not
auto/scroll (clipped content); or if it is a horizontal scroller that actually
scrolls (`hscroll`, half weight). Sorted by overhang, capped at 80.

## How it works / gotchas

- Runs the driver under **node** (`--experimental-strip-types`): under bun the
  Playwright CDP websocket never connects on Windows, so `shot.ts` re-executes
  itself under node when started by bun.
- Each run recreates the scratch vault `C:\Dev\scratch-vaults\windrose-phone`
  from `tests/fixtures/test-vault` (+ the same clean data/workspace files the E2E
  setup uses), installs `main.js`/`styles.css`/`manifest.json`, pins
  `onboardingState: done`, and uses a fresh temp `--user-data-dir`
  (`%TEMP%\windrose-phone-*`), deleted afterwards.
- Electron is the repo's npm electron running Obsidian's installed `app.asar`,
  like the E2E suite. `phone-main.cjs` is loaded with `electron --require`: it
  pulls in `tests/e2e/quiet-launch.cjs` (inactive, offscreen, no focus steal),
  sizes new windows, and registers `phone-preload.cjs`.
- **Phone emulation**: `app.emulateMobile(true)` only writes
  `localStorage.EmulateMobile = 1` and calls `location.reload()`, and that
  reload takes the whole harness app down. So the preload sets the flag before
  Obsidian boots instead. Obsidian then picks phone vs tablet by itself from
  `matchMedia("(min-width: 600px) and (min-height: 600px)")` (live on resize),
  so any viewport under 600 px in either dimension gets `is-mobile is-phone`
  and `Platform.isPhone` with no manual class edits. If that ever fails the
  script toggles the classes by hand and says so in `env.json`.
- **Touch**: Obsidian's mobile emulation leaves `(pointer: coarse)` unmatched,
  so the plugin's touch media rules (`scss/_touch.scss`) would never apply.
  The script turns on CDP `Emulation.setTouchEmulationEnabled` and logs whether
  `(pointer: coarse)` now matches.
- `BrowserWindow.setContentSize` lands a few px off on Obsidian's frameless
  window, so the script corrects iteratively against `window.innerWidth/Height`
  (falls back to `page.setViewportSize`).
- The trust prompt for the fresh vault is clicked automatically; enabling
  returns before plugins load, so the script waits for `plugins[id]._loaded`.
  A `this.refreshDomState is not a function` pageerror appears during that
  flow; it is Obsidian's, harmless here.
- Teardown closes the app, then verifies by **user-data-dir in the process
  command line** (`Get-CimInstance Win32_Process`), force-killing only those
  PIDs. Your own Obsidian is never matched.
- The dungeon modal is opened with the `windrose-md:insert-random-dungeon`
  editor command on `_testing/dungeon-generation-test.md` (source mode).

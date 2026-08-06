/**
 * Quiet-launch injector for E2E Obsidian instances.
 *
 * Loaded into Electron's MAIN process via `--require` (see
 * patches/obsidian-testing-framework+0.1.6.patch) before Obsidian's app code
 * runs. Goal: the test Obsidian must never steal keyboard/mouse focus or
 * appear over the user's windows while the suite runs.
 *
 * How: every BrowserWindow is forced to show WITHOUT activation
 * (showInactive), its focus() is neutered, and it is parked offscreen.
 * Background throttling is disabled so the offscreen canvas keeps rendering
 * (Playwright drives input via CDP, which needs no OS focus).
 *
 * Bypass: set WINDROSE_E2E_VISIBLE=1 (the patch skips the --require entirely).
 */
const { app } = require("electron");

const OFFSCREEN_X = -32000;
const OFFSCREEN_Y = 0;

app.on("browser-window-created", (_event, win) => {
  const showInactive = win.showInactive.bind(win);

  // Any show() from app code becomes a no-activation show.
  win.show = () => showInactive();
  // Obsidian re-focuses its window on vault open / protocol handling.
  win.focus = () => {};

  const park = () => {
    try {
      win.setPosition(OFFSCREEN_X, OFFSCREEN_Y);
    } catch {
      /* window may already be destroyed */
    }
  };
  park();
  win.once("ready-to-show", park);

  const unthrottle = () => {
    try {
      win.webContents.setBackgroundThrottling(false);
    } catch {
      /* ignore */
    }
  };
  unthrottle();
  win.webContents.on("did-finish-load", unthrottle);
});

/**
 * Main-process injector for the phone harness (loaded via electron --require).
 *
 * 1. Reuses tests/e2e/quiet-launch.cjs: windows show inactive + offscreen, never steal focus.
 * 2. Registers a renderer preload that sets localStorage.EmulateMobile = "1" before
 *    Obsidian's own scripts run. That is exactly what app.emulateMobile(true) does,
 *    minus its window.location.reload() - which, under this harness, takes the whole
 *    Electron app down with it.
 * 3. Sizes every new window's content area to PHONE_W x PHONE_H at creation, so the
 *    first layout pass already sees a phone viewport (shot.ts fine-tunes afterwards).
 */
const path = require("path");
const { app, session } = require("electron");

require(path.resolve(__dirname, "../../tests/e2e/quiet-launch.cjs"));

const W = Number(process.env.PHONE_W || 390);
const H = Number(process.env.PHONE_H || 844);
const PRELOAD = path.join(__dirname, "phone-preload.cjs");

app.whenReady().then(() => {
  const ses = session.defaultSession;
  if (typeof ses.registerPreloadScript === "function") {
    ses.registerPreloadScript({ type: "frame", filePath: PRELOAD });
  } else {
    ses.setPreloads([...ses.getPreloads(), PRELOAD]);
  }
});

app.on("browser-window-created", (_event, win) => {
  try {
    win.setMinimumSize(1, 1);
    win.setContentSize(W, H);
  } catch {
    /* ignore */
  }
});

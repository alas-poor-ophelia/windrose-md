/**
 * Two-plugin (Windrose + Wadjet weather) private offscreen Obsidian harness.
 * Desktop-sized. See README.md.
 *
 *   node --experimental-strip-types --no-warnings run.ts \
 *     --windrose <dir> --wadjet <dir> [--note <path>] [--eval <file.js>]
 *     [--shots n --interval ms] [--out dir] [--keep-open ms] [--width 1600 --height 1000]
 */
import { _electron as electron, type ElectronApplication, type Page } from "playwright";
import { execFileSync, spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { randomBytes } from "crypto";
import { buildVaultFiles } from "./fixture.ts";

// bun -> node trampoline (Playwright CDP websocket hangs under bun on Windows).
const SELF = fileURLToPath(import.meta.url);
if ((process.versions as any).bun) {
  const r = spawnSync("node", ["--experimental-strip-types", "--no-warnings", SELF, ...process.argv.slice(2)], { stdio: "inherit" });
  process.exit(r.status ?? 1);
}

const argv = process.argv.slice(2);
function opt(name: string, dflt?: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : dflt;
}
const HERE = path.dirname(SELF);
const WIDTH = Number(opt("width", "1600"));
const HEIGHT = Number(opt("height", "1000"));
const OUT = path.resolve(opt("out", path.join(HERE, "out"))!);
const WINDROSE_DIR = opt("windrose");
const WADJET_DIR = opt("wadjet");
const NOTE = opt("note");
const EVAL_FILE = opt("eval");
const SHOTS = Number(opt("shots", "0"));
const INTERVAL = Number(opt("interval", "1000"));
const KEEP_OPEN = Number(opt("keep-open", "0"));
if (!WINDROSE_DIR || !WADJET_DIR) { console.error("need --windrose <dir> and --wadjet <dir>"); process.exit(2); }

// Main windrose checkout hosts electron and the phone harness helper (reused by path).
const MAIN = "C:\\Dev\\windrose";
const PHONE_MAIN = path.join(MAIN, "spikes/phone/phone-main.cjs");
const WADJET_REPO = "C:\\Dev\\U+13080";
const WADJET_DATA_FIXTURE = path.join(WADJET_REPO, "test/e2e/data.fixture.json");
const SCRATCH_VAULT = "C:\\Dev\\scratch-vaults\\windrose-weather";
const ASAR = path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Obsidian", "resources", "app.asar");
const ELECTRON_EXE = path.join(MAIN, "node_modules/electron/dist", readFileSync(path.join(MAIN, "node_modules/electron/path.txt"), "utf8").trim());

const log = (...a: unknown[]) => console.log("[weather]", ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function newestAppAsar(): string | null {
  const dir = path.join(process.env.APPDATA ?? "", "obsidian");
  if (!existsSync(dir)) return null;
  const v = readdirSync(dir)
    .map((f) => f.match(/^obsidian-(\d+)\.(\d+)\.(\d+)\.asar$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => ({ file: m[0], v: [Number(m[1]), Number(m[2]), Number(m[3])] }))
    .sort((a, b) => b.v[0] - a.v[0] || b.v[1] - a.v[1] || b.v[2] - a.v[2]);
  return v[0] ? path.join(dir, v[0].file) : null;
}

function installPlugin(srcDir: string, id: string) {
  const dir = path.resolve(srcDir);
  const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8"));
  if (manifest.id !== id) log(`note: ${dir} manifest id is ${manifest.id}, installing as ${id}`);
  const target = path.join(SCRATCH_VAULT, ".obsidian/plugins", id);
  mkdirSync(target, { recursive: true });
  for (const f of ["main.js", "styles.css", "manifest.json"]) {
    if (!existsSync(path.join(dir, f))) throw new Error(`${f} missing in ${dir}`);
    cpSync(path.join(dir, f), path.join(target, f));
  }
  return target;
}

function prepareVault(): string[] {
  if (!SCRATCH_VAULT.toLowerCase().includes("scratch-vaults")) throw new Error("refusing: bad scratch path");
  rmSync(SCRATCH_VAULT, { recursive: true, force: true });
  mkdirSync(path.join(SCRATCH_VAULT, ".obsidian"), { recursive: true });
  const ids = ["windrose-md", "wadjet"];
  const wt = installPlugin(WINDROSE_DIR!, "windrose-md");
  writeFileSync(path.join(wt, "data.json"), JSON.stringify({ onboardingState: "done" }, null, 2));
  const wj = installPlugin(WADJET_DIR!, "wadjet");
  cpSync(WADJET_DATA_FIXTURE, path.join(wj, "data.json"));
  writeFileSync(path.join(SCRATCH_VAULT, ".obsidian/community-plugins.json"), JSON.stringify(ids));
  for (const [rel, content] of Object.entries(buildVaultFiles())) writeFileSync(path.join(SCRATCH_VAULT, rel), content);
  return ids;
}

function prepareUserData(): { dir: string; uri: string } {
  const dir = mkdtempSync(path.join(os.tmpdir(), "windrose-weather-"));
  // 1.13+ API lives in the newest downloaded app asar, not the installer's bootstrap asar.
  const appAsar = newestAppAsar();
  if (appAsar) { cpSync(appAsar, path.join(dir, path.basename(appAsar))); log(`app asar: ${path.basename(appAsar)}`); }
  else log("WARNING: no downloaded obsidian-*.asar; bundled (old) app will run");
  const hash = randomBytes(8).toString("hex");
  writeFileSync(path.join(dir, "obsidian.json"), JSON.stringify({ vaults: { [hash]: { path: SCRATCH_VAULT, ts: Date.now(), open: true } } }));
  writeFileSync(path.join(dir, `${hash}.json`), "{}");
  return { dir, uri: `obsidian://open?vault=${hash}` };
}

function harnessPids(userDataDir: string): number[] {
  const needle = userDataDir.replace(/'/g, "''");
  const ps = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${needle}*' -and $_.ProcessId -ne $PID -and $_.Name -ne 'powershell.exe' } | ForEach-Object { $_.ProcessId }`;
  try {
    const out = execFileSync("powershell.exe", ["-NoProfile", "-Command", ps], { encoding: "utf8" });
    return out.split(/\s+/).filter(Boolean).map(Number).filter((n) => n !== process.pid);
  } catch { return []; }
}
async function killHarness(app: ElectronApplication | null, userDataDir: string) {
  if (app) { try { await Promise.race([app.close(), sleep(10000)]); } catch { /* ignore */ } }
  for (let i = 0; i < 10; i++) {
    const pids = harnessPids(userDataDir);
    if (pids.length === 0) { log(`harness processes for ${userDataDir}: none left`); return; }
    if (i >= 2) { log(`force-killing pids ${pids.join(",")}`); for (const p of pids) { try { process.kill(p); } catch { /* gone */ } } }
    await sleep(1000);
  }
  log(`WARNING: harness processes still alive: ${harnessPids(userDataDir).join(",")}`);
}

async function waitForPlugins(page: Page, ids: string[], timeout = 90000) {
  await page.waitForFunction(
    (ids) => {
      const app = (window as any).app;
      if (!app?.workspace?.layoutReady) return false;
      for (const id of ids) { const p = app.plugins?.plugins?.[id]; if (!p || !p._loaded) return false; }
      return app.plugins.plugins.wadjet?.api?.ready === true;
    },
    ids, { timeout, polling: 250 },
  );
}

async function setup(page: Page, ids: string[]) {
  try {
    const btn = page.locator('.modal-button-container button:has-text("Trust"), .modal-button-container button:has-text("Turn off"), .modal-button-container button:has-text("Enable")');
    await btn.first().waitFor({ state: "visible", timeout: 8000 });
    log("restricted-mode prompt found, trusting vault");
    await btn.first().click();
    await sleep(500);
  } catch { log("no restricted-mode prompt"); }
  await page.evaluate(async (ids) => {
    const pl = (window as any).app.plugins;
    if (pl.isEnabled && !pl.isEnabled()) await pl.setEnable(true);
    for (const id of ids) if (!pl.enabledPlugins.has(id)) await pl.enablePluginAndSave(id);
  }, ids);
  await waitForPlugins(page, ids);
  for (let i = 0; i < 4; i++) {
    const n = await page.evaluate(() => document.querySelectorAll(".modal-container").length);
    if (!n) break;
    await page.evaluate(() => (window as any).app.setting?.close?.());
    await page.keyboard.press("Escape");
    await sleep(250);
  }
}

async function openNote(page: Page, notePath: string) {
  const deadline = Date.now() + 20000;
  for (;;) {
    const ok = await page.evaluate(async (p) => {
      const app = (window as any).app;
      const file = app.vault.getAbstractFileByPath(p);
      if (!file) return false;
      const leaf = app.workspace.getLeaf(false);
      await leaf.openFile(file);
      app.workspace.setActiveLeaf(leaf, { focus: true });
      return app.workspace.getActiveFile()?.path === p;
    }, notePath);
    if (ok) return;
    if (Date.now() > deadline) throw new Error(`could not open ${notePath}`);
    await sleep(500);
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const ids = prepareVault();
  const { dir: userData, uri } = prepareUserData();
  log(`vault ${SCRATCH_VAULT}; user-data-dir ${userData}`);
  let app: ElectronApplication | null = null;
  let exitCode = 0;
  try {
    process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";
    app = await electron.launch({
      executablePath: ELECTRON_EXE,
      timeout: 60000,
      env: { ...process.env, PHONE_EMULATE: "0", PHONE_W: String(WIDTH), PHONE_H: String(HEIGHT) } as Record<string, string>,
      args: ["--require", PHONE_MAIN, "--disable-features=CalculateNativeWinOcclusion", ASAR, `--user-data-dir=${userData}`, uri],
    });
    app.context().on("dialog", (d) => { d.accept().catch(() => {}); });
    await app.firstWindow();
    await sleep(1500);
    const wins = app.windows();
    const page = wins[wins.length - 1];
    page.on("pageerror", (e) => log("pageerror:", e.message));
    page.on("console", (m) => { if (m.type() === "error") log("console.error:", m.text().slice(0, 300)); });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForFunction(() => !!(window as any).app?.workspace, undefined, { timeout: 60000 });
    await setup(page, ids);
    const dims = await page.evaluate(() => [window.innerWidth, window.innerHeight, document.body.className.includes("is-mobile")]);
    log(`plugins ready; window ${dims[0]}x${dims[1]} mobile=${dims[2]}`);

    if (NOTE) {
      await openNote(page, NOTE);
      await page.locator(".windrose-container").first().waitFor({ state: "visible", timeout: 30000 });
      await page.locator(".windrose-canvas-wrapper canvas").first().waitFor({ state: "visible", timeout: 30000 });
      await sleep(2000);
    }
    if (EVAL_FILE) {
      const src = readFileSync(path.resolve(EVAL_FILE), "utf8");
      const res = await page.evaluate(async (code) => {
        try { return { ok: true, value: await (0, eval)(code) }; } catch (e: any) { return { ok: false, error: String(e?.stack ?? e) }; }
      }, src);
      console.log("[weather] --eval result:\n" + JSON.stringify(res, null, 2));
      writeFileSync(path.join(OUT, "eval-result.json"), JSON.stringify(res, null, 2));
    }
    const first = path.join(OUT, "shot.png");
    await page.screenshot({ path: first });
    log(`screenshot -> ${first}`);
    for (let i = 0; i < SHOTS; i++) {
      if (i > 0) await sleep(INTERVAL);
      const f = path.join(OUT, `frame-${String(i + 1).padStart(3, "0")}.png`);
      await page.screenshot({ path: f });
      log(`frame ${i + 1}/${SHOTS} -> ${f}`);
    }
    if (KEEP_OPEN > 0) { log(`keeping open ${KEEP_OPEN} ms`); await sleep(KEEP_OPEN); }
  } catch (e: any) {
    exitCode = 1;
    console.error("[weather] FAILED:", e?.stack ?? e);
    try { const p = app?.windows().at(-1); if (p) await p.screenshot({ path: path.join(OUT, "failure.png") }); } catch { /* ignore */ }
  } finally {
    await killHarness(app, userData);
    try { rmSync(userData, { recursive: true, force: true }); } catch { /* locked temp */ }
  }
  process.exit(exitCode);
}
main();

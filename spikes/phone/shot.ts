/**
 * Phone-emulation screenshot harness for Windrose.
 *
 * Boots a PRIVATE Obsidian (fresh temp --user-data-dir, scratch vault copied
 * from tests/fixtures/test-vault) on the npm electron, loads the plugin built
 * in this worktree, emulates a phone, and captures screenshots plus an
 * overflow report per scene. See README.md next to this file.
 *
 *   bun spikes/phone/shot.ts [--width 390 --height 844] [--scene map|dungeon|all]
 *                            [--out <dir>] [--eval <file.js>]
 */
import { _electron as electron, type ElectronApplication, type Page } from "playwright";
import { execFileSync, spawnSync } from "child_process";
import { fileURLToPath } from "url";
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync,
} from "fs";
import os from "os";
import path from "path";
import { randomBytes } from "crypto";

// ---------------------------------------------------------------- bun -> node trampoline
// Playwright's CDP websocket never connects when the driver runs under bun on
// Windows (both _electron.launch and connectOverCDP hang at "<ws connecting>").
// So under bun this file re-executes itself under node with type stripping.
const SELF = fileURLToPath(import.meta.url);
if ((process.versions as any).bun) {
  const r = spawnSync("node", ["--experimental-strip-types", "--no-warnings", SELF, ...process.argv.slice(2)], { stdio: "inherit" });
  process.exit(r.status ?? 1);
}

// ---------------------------------------------------------------- args
type Scene = "map" | "dungeon";
const argv = process.argv.slice(2);
function opt(name: string, dflt?: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < argv.length) return argv[i + 1];
  return dflt;
}
const WIDTH = Number(opt("width", "390"));
const HEIGHT = Number(opt("height", "844"));
const SCENE_ARG = opt("scene", "all")!;
const SCENES: Scene[] = SCENE_ARG === "all" ? ["map", "dungeon"] : [SCENE_ARG as Scene];
if (!SCENES.every((s) => s === "map" || s === "dungeon")) {
  console.error(`Unknown --scene ${SCENE_ARG} (map|dungeon|all)`);
  process.exit(2);
}
const REPO = path.resolve(path.dirname(SELF), "../..");
const OUT = path.resolve(opt("out", path.join(REPO, "spikes/phone/out"))!);
const EVAL_FILE = opt("eval");

const FIXTURES = path.join(REPO, "tests/fixtures");
const FIXTURE_VAULT = path.join(FIXTURES, "test-vault");
const SCRATCH_VAULT = "C:\\Dev\\scratch-vaults\\windrose-phone";
const ASAR = path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Obsidian", "resources", "app.asar");
const PHONE_MAIN = path.join(REPO, "spikes/phone/phone-main.cjs"); // wraps tests/e2e/quiet-launch.cjs
const ELECTRON_EXE = (() => {
  // node_modules/electron exports the binary path; resolve without importing (bun + electron pkg).
  const p = path.join(REPO, "node_modules/electron/path.txt");
  return path.join(REPO, "node_modules/electron/dist", readFileSync(p, "utf8").trim());
})();

const log = (...a: unknown[]) => console.log("[phone]", ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- vault prep
function prepareVault(): string {
  const manifest = JSON.parse(readFileSync(path.join(REPO, "manifest.json"), "utf8"));
  const pluginId: string = manifest.id;
  for (const f of ["main.js", "styles.css", "manifest.json"]) {
    if (!existsSync(path.join(REPO, f))) throw new Error(`${f} missing in ${REPO} - run bun run build:dev first`);
  }
  const st = statSync(path.join(REPO, "styles.css"));
  const mj = statSync(path.join(REPO, "main.js"));
  log(`styles.css mtime ${st.mtime.toISOString()} (${st.size} B); main.js mtime ${mj.mtime.toISOString()} (${mj.size} B)`);

  // Fresh scratch vault every run (only ever this one directory).
  if (!SCRATCH_VAULT.toLowerCase().includes("scratch-vaults")) throw new Error("refusing: bad scratch path");
  rmSync(SCRATCH_VAULT, { recursive: true, force: true });
  mkdirSync(path.dirname(SCRATCH_VAULT), { recursive: true });
  cpSync(FIXTURE_VAULT, SCRATCH_VAULT, { recursive: true });
  // Same resets the E2E setup applies, but onto the copy.
  mkdirSync(path.join(SCRATCH_VAULT, "_test-data"), { recursive: true });
  cpSync(path.join(FIXTURES, "dungeon-maps-data.clean.json"), path.join(SCRATCH_VAULT, "_test-data/dungeon-maps-data.json"));
  cpSync(path.join(FIXTURES, "workspace.clean.json"), path.join(SCRATCH_VAULT, ".obsidian/workspace.json"));
  const gen = path.join(FIXTURES, "dungeon-generation-test.clean.md");
  if (existsSync(gen)) cpSync(gen, path.join(SCRATCH_VAULT, "_testing/dungeon-generation-test.md"));

  const target = path.join(SCRATCH_VAULT, ".obsidian/plugins", pluginId);
  mkdirSync(target, { recursive: true });
  for (const f of ["main.js", "styles.css", "manifest.json"]) cpSync(path.join(REPO, f), path.join(target, f));

  const dataFile = path.join(target, "data.json");
  let settings: Record<string, unknown> = {};
  try { settings = JSON.parse(readFileSync(dataFile, "utf8")); } catch { /* absent */ }
  settings.onboardingState = "done";
  const folders = Array.isArray(settings.tilesetFolders) ? (settings.tilesetFolders as string[]) : [];
  if (!folders.includes("walls-fixture")) settings.tilesetFolders = [...folders, "walls-fixture"];
  writeFileSync(dataFile, JSON.stringify(settings, null, 2));

  const cpFile = path.join(SCRATCH_VAULT, ".obsidian/community-plugins.json");
  let enabled: string[] = [];
  try { enabled = JSON.parse(readFileSync(cpFile, "utf8")); } catch { /* absent */ }
  if (!enabled.includes(pluginId)) enabled.push(pluginId);
  writeFileSync(cpFile, JSON.stringify(enabled, null, 2));
  return pluginId;
}

function prepareUserData(): { dir: string; uri: string } {
  const dir = mkdtempSync(path.join(os.tmpdir(), "windrose-phone-"));
  const hash = randomBytes(8).toString("hex");
  writeFileSync(path.join(dir, "obsidian.json"), JSON.stringify({ vaults: { [hash]: { path: SCRATCH_VAULT, ts: Date.now(), open: true } } }));
  writeFileSync(path.join(dir, `${hash}.json`), "{}");
  return { dir, uri: `obsidian://open?vault=${hash}` };
}

// ---------------------------------------------------------------- process hygiene
function harnessPids(userDataDir: string): number[] {
  const needle = userDataDir.replace(/'/g, "''");
  // Exclude this PowerShell query itself (its own command line contains the needle).
  const ps = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${needle}*' -and $_.ProcessId -ne $PID -and $_.Name -ne 'powershell.exe' } | ForEach-Object { $_.ProcessId }`;
  try {
    const out = execFileSync("powershell.exe", ["-NoProfile", "-Command", ps], { encoding: "utf8" });
    return out.split(/\s+/).filter(Boolean).map(Number).filter((n) => n !== process.pid);
  } catch {
    return [];
  }
}
async function killHarness(app: ElectronApplication | null, userDataDir: string) {
  if (app) {
    try { await Promise.race([app.close(), sleep(10000)]); } catch { /* ignore */ }
  }
  for (let i = 0; i < 10; i++) {
    const pids = harnessPids(userDataDir);
    if (pids.length === 0) {
      log(`harness processes for ${userDataDir}: none left (verified via Win32_Process CommandLine)`);
      return;
    }
    if (i >= 2) {
      log(`force-killing harness pids ${pids.join(",")}`);
      for (const pid of pids) { try { process.kill(pid); } catch { /* gone */ } }
    }
    await sleep(1000);
  }
  log(`WARNING: harness processes still alive: ${harnessPids(userDataDir).join(",")}`);
}

// ---------------------------------------------------------------- renderer helpers
async function waitForApp(page: Page, pluginId: string, timeout = 60000) {
  await page.waitForFunction(
    (id) => {
      const app = (window as any).app;
      const p = app?.plugins?.plugins?.[id];
      return !!(app?.workspace?.layoutReady && p && p._loaded);
    },
    pluginId,
    { timeout, polling: 250 },
  );
}

async function liftRestrictedMode(page: Page, pluginId: string) {
  // Fresh user-data-dir => Obsidian asks whether to trust the vault.
  try {
    const btn = page.locator('.modal-button-container button:has-text("Trust"), .modal-button-container button:has-text("Turn off"), .modal-button-container button:has-text("Enable")');
    await btn.first().waitFor({ state: "visible", timeout: 8000 });
    log("restricted-mode prompt found, trusting vault");
    await btn.first().click();
    await sleep(500);
  } catch {
    log("no restricted-mode prompt");
  }
  // Belt and braces: make sure community plugins are on and ours is enabled,
  // then WAIT for the load (enabling returns before onload has finished).
  await page.evaluate(async (id) => {
    const app = (window as any).app;
    const pl = app.plugins;
    if (pl.isEnabled && !pl.isEnabled()) await pl.setEnable(true);
    if (!pl.enabledPlugins.has(id)) await pl.enablePluginAndSave(id);
  }, pluginId);
  await waitForApp(page, pluginId);
  // Close whatever settings/modal the trust flow opened.
  await closeModals(page);
}

async function setPhoneSize(app: ElectronApplication, page: Page) {
  // setContentSize on Obsidian's frameless window lands a few px off (Windows
  // frame insets), so iterate on the measured renderer size, then fall back to
  // a Playwright viewport override if it still does not match.
  let w = WIDTH, h = HEIGHT;
  let dims: number[] = [];
  for (let i = 0; i < 3; i++) {
    await app.evaluate(({ BrowserWindow }, { w, h }) => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.setMinimumSize(1, 1);
        win.setContentSize(w, h);
      }
    }, { w, h });
    await sleep(400);
    dims = await page.evaluate(() => [window.innerWidth, window.innerHeight]);
    if (dims[0] === WIDTH && dims[1] === HEIGHT) return { method: `BrowserWindow.setContentSize(${w},${h})`, dims };
    w += WIDTH - dims[0];
    h += HEIGHT - dims[1];
  }
  log(`setContentSize converged to ${dims.join("x")}, falling back to page.setViewportSize`);
  await page.setViewportSize({ width: WIDTH, height: HEIGHT });
  await sleep(300);
  dims = await page.evaluate(() => [window.innerWidth, window.innerHeight]);
  return { method: "page.setViewportSize", dims };
}

async function bodyState(page: Page) {
  return page.evaluate(() => {
    const cls = [...document.body.classList];
    let P: any = null;
    try { P = (window as any).require?.("obsidian")?.Platform ?? null; } catch { P = null; }
    return {
      bodyClasses: cls.join(" "),
      isMobile: cls.includes("is-mobile"), isPhone: cls.includes("is-phone"), isTablet: cls.includes("is-tablet"),
      platform: P ? { isMobile: P.isMobile, isPhone: P.isPhone, isTablet: P.isTablet, isDesktopApp: P.isDesktopApp } : null,
      appIsMobile: (window as any).app?.isMobile ?? null,
      innerWidth: window.innerWidth, innerHeight: window.innerHeight, dpr: window.devicePixelRatio,
    };
  });
}

/**
 * Phone emulation. phone-preload.cjs already set localStorage.EmulateMobile=1
 * (the flag app.emulateMobile(true) writes) before Obsidian booted, so the app
 * started in mobile mode with no reload. Obsidian then decides phone vs tablet
 * itself from matchMedia("(min-width: 600px) and (min-height: 600px)") - live,
 * on resize - so a <600px viewport yields is-phone + Platform.isPhone.
 */
async function emulatePhone(electronApp: ElectronApplication, page: Page): Promise<{ page: Page; steps: string[] }> {
  const steps: string[] = [];
  const flag = await page.evaluate(() => localStorage.getItem("EmulateMobile"));
  steps.push(`localStorage.EmulateMobile=${flag} (set by preload before boot; app.emulateMobile(true) is NOT called - its reload kills the harness app)`);
  const size = await setPhoneSize(electronApp, page);
  steps.push(`sized via ${size.method}: inner ${size.dims.join("x")}`);
  await sleep(600); // Obsidian debounces the media-query listener
  const s = await bodyState(page);
  steps.push(`body: is-mobile=${s.isMobile} is-phone=${s.isPhone} is-tablet=${s.isTablet} app.isMobile=${s.appIsMobile}`);
  if (!s.isMobile || !s.isPhone || s.isTablet) {
    await page.evaluate(() => {
      document.body.classList.add("is-mobile", "is-phone");
      document.body.classList.remove("is-tablet");
    });
    steps.push("MANUAL class toggle: +is-mobile +is-phone -is-tablet (Platform.isPhone/isTablet JS flags NOT changed)");
  } else {
    steps.push("Obsidian set is-mobile + is-phone itself (no manual class toggle)");
  }
  // Obsidian's mobile emulation leaves (pointer: coarse) unmatched, so the
  // plugin's touch media rules would never apply. CDP touch emulation flips it.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await sleep(200);
  const coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
  steps.push(`touch emulation: (pointer: coarse) matches=${coarse}`);
  return { page, steps };
}

async function closeModals(page: Page) {
  for (let i = 0; i < 4; i++) {
    const n = await page.evaluate(() => document.querySelectorAll(".modal-container").length);
    if (!n) break;
    await page.evaluate(() => (window as any).app.setting?.close?.());
    await page.keyboard.press("Escape");
    await sleep(250);
  }
}

// ---------------------------------------------------------------- overflow report
async function overflowReport(page: Page) {
  return page.evaluate(() => {
    const W = window.innerWidth, H = window.innerHeight;
    const sel = (el: Element) => el.tagName.toLowerCase() + [...el.classList].slice(0, 4).map((x) => "." + x).join("");
    const pathOf = (el: Element) => {
      const parts: string[] = [];
      let e: Element | null = el.parentElement;
      for (let i = 0; e && i < 3; i++, e = e.parentElement) parts.unshift(sel(e));
      return parts.join(" > ");
    };
    const scrolls = (o: string) => o === "auto" || o === "scroll";
    const clips = (o: string) => o !== "visible";
    // Visible part of el: its rect intersected with every overflow-clipping
    // ancestor. Vertical clipping by a scroller is ignored for the bottom edge
    // check (content below the fold of a scroller is just scrolling).
    const visibleRect = (el: Element) => {
      const r = el.getBoundingClientRect();
      let l = r.left, t = r.top, rt = r.right, b = r.bottom;
      let inYScroller = false;
      for (let e = el.parentElement; e && e !== document.documentElement; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (scrolls(cs.overflowY)) inYScroller = true;
        if (clips(cs.overflowX) || clips(cs.overflowY)) {
          const pr = e.getBoundingClientRect();
          if (clips(cs.overflowX)) { l = Math.max(l, pr.left); rt = Math.min(rt, pr.right); }
          if (clips(cs.overflowY)) { t = Math.max(t, pr.top); b = Math.min(b, pr.bottom); }
        }
      }
      return { l, t, r: rt, b, empty: rt <= l || b <= t, inYScroller };
    };
    const roots = document.querySelectorAll(".modal, [class*='windrose-']");
    const seen = new Set<Element>();
    const out: any[] = [];
    for (const r of roots) {
      for (const el of [r, ...r.querySelectorAll("*")]) {
        if (seen.has(el)) continue;
        seen.add(el);
        if (!(el instanceof HTMLElement) && el.tagName.toLowerCase() !== "svg") continue; // skip SVG internals
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        const v = visibleRect(el);
        let left = 0, right = 0, bottom = 0;
        if (!v.empty) {
          left = Math.max(0, -v.l);
          right = Math.max(0, v.r - W);
          bottom = v.inYScroller ? 0 : Math.max(0, v.b - H);
        }
        const isCanvas = el instanceof HTMLCanvasElement;
        const overX = el.scrollWidth - el.clientWidth;
        const clipX = !isCanvas && el.clientWidth > 0 && overX > 1 && !scrolls(cs.overflowX) ? overX : 0;
        // Horizontal scrollers that actually scroll: legal, but usually a phone bug.
        const hscroll = !isCanvas && el.clientWidth > 0 && overX > 1 && scrolls(cs.overflowX) ? overX : 0;
        const severity = Math.round(left + right + bottom + clipX + hscroll * 0.5);
        if (severity <= 0) continue;
        const reasons: string[] = [];
        if (left) reasons.push(`left-${Math.round(left)}`);
        if (right) reasons.push(`right+${Math.round(right)}`);
        if (bottom) reasons.push(`bottom+${Math.round(bottom)}`);
        if (clipX) reasons.push(`clippedX ${el.scrollWidth}>${el.clientWidth} (overflow-x:${cs.overflowX})`);
        if (hscroll) reasons.push(`hscroll ${el.scrollWidth}>${el.clientWidth} (overflow-x:${cs.overflowX})`);
        out.push({
          severity, reasons: reasons.join(", "), sel: sel(el), path: pathOf(el),
          rect: { l: Math.round(rect.left), t: Math.round(rect.top), r: Math.round(rect.right), b: Math.round(rect.bottom), w: Math.round(rect.width), h: Math.round(rect.height) },
          visible: v.empty ? null : { l: Math.round(v.l), t: Math.round(v.t), r: Math.round(v.r), b: Math.round(v.b) },
          scroll: { cw: el.clientWidth, sw: el.scrollWidth, ch: el.clientHeight, sh: el.scrollHeight },
        });
      }
    }
    out.sort((a, b) => b.severity - a.severity);
    return {
      viewport: { W, H },
      rules: "overhang = VISIBLE rect (clipped by overflow ancestors) past viewport; bottom ignored inside a vertical scroller; clippedX = scrollWidth>clientWidth with overflow-x not auto/scroll; hscroll = same but scrollable (severity x0.5)",
      total: out.length, entries: out.slice(0, 80),
    };
  });
}

async function writeOverflow(page: Page, scene: string) {
  const rep = await overflowReport(page);
  const f = path.join(OUT, `${scene}-overflow.json`);
  writeFileSync(f, JSON.stringify(rep, null, 2));
  log(`${scene}: ${rep.total} overflow entries (top ${rep.entries.length} written) -> ${f}`);
  for (const e of rep.entries.slice(0, 15)) log(`   [${e.severity}] ${e.sel}  ${e.reasons}  rect=${JSON.stringify(e.rect)}`);
}

async function runEval(page: Page, scene: string) {
  if (!EVAL_FILE) return;
  const src = readFileSync(path.resolve(EVAL_FILE), "utf8");
  // Indirect eval: the file's last expression is the result; a returned Promise is awaited.
  const res = await page.evaluate(async (code) => {
    try { return { ok: true, value: await (0, eval)(code) }; } catch (e: any) { return { ok: false, error: String(e?.stack ?? e) }; }
  }, src);
  log(`--eval (${scene}) result:\n${JSON.stringify(res, null, 2)}`);
  const shot = path.join(OUT, `${scene}-after-eval.png`);
  await page.screenshot({ path: shot });
  log(`${scene}: after-eval screenshot -> ${shot}`);
}

// ---------------------------------------------------------------- scenes
async function openNote(page: Page, notePath: string, mode: "source" | "preview" | null) {
  const deadline = Date.now() + 20000;
  for (;;) {
    const ok = await page.evaluate(async ({ p, mode }) => {
      const app = (window as any).app;
      const file = app.vault.getAbstractFileByPath(p);
      if (!file) return false;
      const leaf = app.workspace.getLeaf(false);
      await leaf.openFile(file, mode ? { state: { mode } } : undefined);
      app.workspace.setActiveLeaf(leaf, { focus: true });
      return app.workspace.getActiveFile()?.path === p;
    }, { p: notePath, mode });
    if (ok) return;
    if (Date.now() > deadline) throw new Error(`could not open ${notePath}`);
    await sleep(500);
  }
}

async function sceneMap(page: Page) {
  await openNote(page, "_testing/smoke-test-map.md", null);
  await page.locator(".windrose-container").first().waitFor({ state: "visible", timeout: 30000 });
  await page.locator(".windrose-canvas-wrapper canvas").first().waitFor({ state: "visible", timeout: 30000 });
  await sleep(2000); // let the canvas paint
  const f = path.join(OUT, "map.png");
  await page.screenshot({ path: f });
  log(`map: screenshot -> ${f}`);
  await writeOverflow(page, "map");
  await runEval(page, "map");
}

async function sceneDungeon(page: Page, pluginId: string) {
  await openNote(page, "_testing/dungeon-generation-test.md", "source");
  await sleep(500);
  const ran = await page.evaluate((id) => {
    const app = (window as any).app;
    app.workspace.activeEditor?.editor?.focus?.();
    return app.commands.executeCommandById(`${id}:insert-random-dungeon`);
  }, pluginId);
  log(`dungeon: executeCommandById(${pluginId}:insert-random-dungeon) -> ${ran}`);
  await page.locator(".windrose-insert-dungeon-modal").first().waitFor({ state: "visible", timeout: 15000 });
  await sleep(1200); // preview animation / layout settle
  await page.screenshot({ path: path.join(OUT, "dungeon-top.png") });
  log(`dungeon: screenshot -> ${path.join(OUT, "dungeon-top.png")}`);
  await writeOverflow(page, "dungeon"); // at scroll-top state

  const measure = await page.evaluate(() => {
    const m = (el: Element | null, label: string) => {
      if (!el) return { label, missing: true };
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        label, sel: el.tagName.toLowerCase() + [...el.classList].map((c) => "." + c).join(""),
        clientWidth: el.clientWidth, scrollWidth: el.scrollWidth, clientHeight: el.clientHeight, scrollHeight: el.scrollHeight,
        overflowX: cs.overflowX, overflowY: cs.overflowY,
        rect: { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) },
      };
    };
    const content = document.querySelector(".windrose-insert-dungeon-modal");
    const modal = content?.closest(".modal") ?? document.querySelector(".modal");
    const container = modal?.closest(".modal-container") ?? null;
    // Find the scroll container: the element in the modal chain that can scroll vertically.
    const cands = [container, modal, ...(modal ? modal.querySelectorAll("*") : [])].filter(Boolean) as Element[];
    const scrollers = cands.filter((el) => {
      const o = getComputedStyle(el).overflowY;
      return (o === "auto" || o === "scroll") && el.scrollHeight > el.clientHeight + 1;
    });
    scrollers.sort((a, b) => b.clientHeight - a.clientHeight);
    const scroller = scrollers[0] ?? null;
    const before = scroller ? scroller.scrollTop : null;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
    return {
      elements: [m(modal, ".modal"), m(modal?.querySelector(":scope > .modal-content") ?? null, ".modal-content"),
        m(container, ".modal-container"), m(content, "content (.windrose-insert-dungeon-modal)")],
      scroller: scroller ? { ...m(scroller, "scroll container"), scrollTopBefore: before, scrollTopAfter: scroller.scrollTop } : null,
      allVerticalScrollers: scrollers.map((s) => m(s, "scroller")),
    };
  });
  writeFileSync(path.join(OUT, "dungeon-measure.json"), JSON.stringify(measure, null, 2));
  log(`dungeon: measurements:\n${JSON.stringify(measure, null, 2)}`);
  await sleep(400);
  await page.screenshot({ path: path.join(OUT, "dungeon-bottom.png") });
  log(`dungeon: screenshot -> ${path.join(OUT, "dungeon-bottom.png")}`);
  await runEval(page, "dungeon");
}

// ---------------------------------------------------------------- main
async function main() {
  mkdirSync(OUT, { recursive: true });
  const pluginId = prepareVault();
  const { dir: userData, uri } = prepareUserData();
  log(`vault ${SCRATCH_VAULT}; user-data-dir ${userData}; electron ${ELECTRON_EXE}`);
  let app: ElectronApplication | null = null;
  let exitCode = 0;
  try {
    process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";
    app = await electron.launch({
      executablePath: ELECTRON_EXE,
      timeout: 60000,
      env: { ...process.env, PHONE_W: String(WIDTH), PHONE_H: String(HEIGHT) } as Record<string, string>,
      args: ["--require", PHONE_MAIN, "--disable-features=CalculateNativeWinOcclusion", ASAR, `--user-data-dir=${userData}`, uri],
    });
    app.context().on("dialog", (d) => { d.accept().catch(() => {}); });
    await app.firstWindow();
    // Obsidian may open a starter window first; take the last.
    await sleep(1500);
    const wins = app.windows();
    let page = wins[wins.length - 1];
    page.on("pageerror", (e) => log("pageerror:", e.message));
    await page.waitForLoadState("domcontentloaded");
    await page.waitForFunction(() => !!(window as any).app?.workspace, undefined, { timeout: 60000 });
    await liftRestrictedMode(page, pluginId);
    const em = await emulatePhone(app, page);
    page = em.page;
    const steps = em.steps;
    for (const s of steps) log(`emulation: ${s}`);
    const st = await bodyState(page);
    log(`final: innerWidth=${st.innerWidth} innerHeight=${st.innerHeight} dpr=${st.dpr}`);
    log(`final body classes: ${st.bodyClasses}`);
    writeFileSync(path.join(OUT, "env.json"), JSON.stringify({ steps, state: st }, null, 2));

    for (const s of SCENES) {
      // Clear any modal left by a previous scene.
      await page.evaluate(() => document.querySelectorAll(".modal-close-button").forEach((b) => (b as HTMLElement).click()));
      if (s === "map") await sceneMap(page);
      else await sceneDungeon(page, pluginId);
    }
  } catch (e: any) {
    exitCode = 1;
    console.error("[phone] FAILED:", e?.stack ?? e);
    try {
      const page = app?.windows().at(-1);
      if (page) await page.screenshot({ path: path.join(OUT, "failure.png") });
    } catch { /* ignore */ }
  } finally {
    await killHarness(app, userData);
    try { rmSync(userData, { recursive: true, force: true }); } catch { /* locked; harmless temp */ }
  }
  process.exit(exitCode);
}

main();

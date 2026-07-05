/**
 * CLI Bridge — wraps Obsidian CLI (Obsidian.com) for programmatic control.
 *
 * All Windrose-specific operations go through `ob eval` which executes JS
 * in the Obsidian window context with access to `window.__windrose` and `app`.
 *
 * Non-Windrose operations use dedicated CLI commands (screenshot, errors, etc).
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";

const execAsync = promisify(exec);

const OBSIDIAN_CLI = path.join(
  process.env.LOCALAPPDATA || "",
  "Programs",
  "obsidian",
  "Obsidian.com"
);

const VAULT = "Absalom";
// Current plugin id. The legacy "dungeon-map-tracker-settings" id left
// windrose_reload targeting a non-existent plugin, which forced callers to
// hand-roll a raw disablePlugin/enablePlugin via windrose_eval — and a raw
// teardown mid-autosave truncated the map-data JSON (512 KiB cut, ~13 maps lost).
const PLUGIN_ID = "windrose-md";

/** Default timeout for CLI commands (ms) */
const DEFAULT_TIMEOUT = 15_000;

/** Longer timeout for eval (code execution may be slow) */
const EVAL_TIMEOUT = 30_000;

/** Quote a string for shell use — rejects shell metacharacters to prevent injection.
 *  Backslashes are allowed (needed for Windows file paths). */
function shellQuote(s: string): string {
  if (/[\x00-\x1f`$!#&|;(){}<>%^]/.test(s)) {
    throw new Error(`Unsafe characters in shell argument: ${s.slice(0, 50)}`);
  }
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Quote a string for shell use inside double quotes, escaping bash-special
 * characters rather than rejecting them. Used for eval code payloads where
 * parentheses, braces, semicolons etc. are expected JS syntax.
 *
 * Newlines and tabs in the input are collapsed to single spaces so multi-line
 * eval payloads survive Node's exec (which invokes cmd.exe /c on Windows and
 * breaks on literal newlines). Callers should separate JS statements with
 * semicolons; ASI after a newline is not reliable once newlines are stripped.
 * Backtick template literals with embedded newlines are therefore unsupported —
 * use string concatenation.
 */
function shellQuoteEval(s: string): string {
  const collapsed = s.replace(/[\n\r\t]+/g, " ");
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(collapsed)) {
    throw new Error(`Control characters in eval code: ${collapsed.slice(0, 50)}`);
  }
  // Node's exec runs cmd.exe on Windows and `/bin/sh -c` elsewhere. Neither is an
  // interactive shell, so history expansion never applies — escaping '!' is wrong
  // on every platform and injects a literal backslash that corrupts the JS payload
  // (e.g. `!!x` becomes `\!\!x` → "Invalid or unexpected token").
  if (process.platform === "win32") {
    // cmd.exe treats $, `, and ! as literal inside double quotes; only the double
    // quote needs escaping. Backslashes are doubled so JS string literals (e.g.
    // Windows paths) survive intact.
    const escaped = collapsed.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `"${escaped}"`;
  }
  // POSIX sh -c: $ and ` remain active inside double quotes and must be escaped.
  const escaped = collapsed
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`");
  return `"${escaped}"`;
}

/**
 * Execute a raw Obsidian CLI command.
 * Uses exec (shell) instead of execFile because bun's execFile
 * doesn't handle .com executables on Windows.
 */
export async function cli(...args: string[]): Promise<string> {
  const cmd = [
    shellQuote(OBSIDIAN_CLI),
    shellQuote(`vault=${VAULT}`),
    ...args.map(shellQuote),
  ].join(" ");

  try {
    const { stdout } = await execAsync(cmd, { timeout: DEFAULT_TIMEOUT });
    return stdout.trim();
  } catch (err: any) {
    if (err.code === "ENOENT") {
      throw new Error(
        `Obsidian CLI not found at ${OBSIDIAN_CLI}. Is Obsidian installed?`
      );
    }
    if (err.killed) {
      throw new Error(`CLI command timed out: ${args.join(" ")}`);
    }
    throw new Error(`CLI error: ${err.message}`);
  }
}

/**
 * Evaluate JavaScript in the Obsidian window context.
 * Returns the stringified result.
 */
export async function obsidianEval(code: string): Promise<string> {
  const cmd = [
    shellQuote(OBSIDIAN_CLI),
    shellQuote(`vault=${VAULT}`),
    "eval",
    shellQuoteEval(`code=${code}`),
  ].join(" ");

  try {
    const { stdout } = await execAsync(cmd, { timeout: EVAL_TIMEOUT });
    // Obsidian CLI prefixes eval output with "=> "
    const result = stdout.trim();
    return result.startsWith("=> ") ? result.slice(3) : result;
  } catch (err: any) {
    if (err.killed) throw new Error(`Eval timed out after ${EVAL_TIMEOUT}ms`);
    if (err.code === "ENOENT") {
      throw new Error(`Obsidian CLI not found at ${OBSIDIAN_CLI}. Is Obsidian installed?`);
    }
    throw new Error(`Eval error: ${err.message}`);
  }
}

/**
 * Evaluate JS and parse the result as JSON.
 */
export async function obsidianEvalJson<T = unknown>(code: string): Promise<T> {
  const raw = await obsidianEval(code);
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Failed to parse eval result as JSON: ${raw.slice(0, 200)}`);
  }
}

/**
 * Take a screenshot of the current Obsidian window.
 * Returns the path to the saved screenshot.
 */
export async function obsidianScreenshot(outputPath: string): Promise<string> {
  await cli("dev:screenshot", `path=${outputPath}`);
  return outputPath;
}

/**
 * Get console errors from Obsidian.
 */
export async function obsidianErrors(): Promise<string> {
  return cli("dev:errors");
}

/**
 * Reload the Windrose plugin SAFELY.
 *
 * A raw disable/enable can sever an in-flight autosave mid-write and truncate the
 * map-data JSON at an OS buffer boundary (a 512 KiB cut cost ~13 maps once). This
 * flushes every open map instance's pending save, then WAITS for `saveStatus` to
 * settle to 'Saved' before tearing the plugin down — so no reload can interrupt a
 * write. The disable/enable runs in the window context, so it survives its own
 * plugin teardown. Falls back to proceeding after a 5s timeout rather than hang.
 */
export async function obsidianReload(): Promise<string> {
  const code =
    `(async () => {` +
    `const id = ${JSON.stringify(PLUGIN_ID)};` +
    `const insts = () => Object.values((window.__windrose && window.__windrose.mcpInstances) || {});` +
    `let flushed = 0;` +
    `for (const i of insts()) { try { if (i.ops && i.ops.forceSave) { i.ops.forceSave(); flushed++; } } catch (e) {} }` +
    // Give saveStatus a beat to flip to 'Saving' before we poll for it to settle.
    `await new Promise(r => setTimeout(r, 200));` +
    `const deadline = Date.now() + 5000;` +
    `const pending = () => insts().some(i => i.saveStatus && i.saveStatus !== 'Saved');` +
    `while (pending() && Date.now() < deadline) { await new Promise(r => setTimeout(r, 100)); }` +
    `const timedOut = pending();` +
    `await app.plugins.disablePlugin(id);` +
    `await app.plugins.enablePlugin(id);` +
    `return JSON.stringify({ reloaded: true, flushed: flushed, timedOut: timedOut });` +
    `})()`;
  return obsidianEval(code);
}

/**
 * Open a note file in Obsidian.
 */
export async function obsidianOpen(notePath: string): Promise<string> {
  return cli("open", `path=${notePath}`);
}

/**
 * Get Obsidian version (also serves as a connectivity check).
 */
export async function obsidianVersion(): Promise<string> {
  return cli("version");
}

/**
 * Get the Windrose MCP state snapshot for the active map.
 * Looks up the active file in mcpInstances — no race conditions.
 * Returns null if no map is open or MCP bridge isn't initialized.
 */
export async function getWindroseState(): Promise<Record<string, unknown> | null> {
  const code = `var i=window.__windrose?.mcpInstances; if(!i) JSON.stringify(null); else { var p=app.workspace.getActiveFile()?.path; var m=p&&i[p]; m ? JSON.stringify(m) : JSON.stringify(null); }`;
  return obsidianEvalJson(code);
}

/**
 * Navigate to a specific map position via the dmt-navigate-to event.
 */
export async function navigateToMap(params: {
  mapId: string;
  x?: number;
  y?: number;
  zoom?: number;
  layerId?: string;
}): Promise<void> {
  const detail = JSON.stringify({
    mapId: params.mapId,
    x: params.x ?? 0,
    y: params.y ?? 0,
    zoom: params.zoom ?? 1,
    layerId: params.layerId,
    timestamp: Date.now(),
  });
  await obsidianEval(
    `window.dispatchEvent(new CustomEvent('dmt-navigate-to', { detail: JSON.parse(${JSON.stringify(detail)}) }))`
  );
}

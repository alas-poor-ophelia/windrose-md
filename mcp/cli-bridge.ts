/**
 * CLI Bridge — wraps Obsidian CLI (Obsidian.com) for programmatic control.
 *
 * All Windrose-specific operations go through `ob eval` which executes JS
 * in the Obsidian window context with access to `window.__windrose` and `app`.
 *
 * Non-Windrose operations use dedicated CLI commands (screenshot, errors, etc).
 *
 * ─── EVAL SCOPE RULES (empirically verified 2026-07-07) ────────────────────
 *
 * The Obsidian eval runtime behaves like a module-level async context:
 *
 * 1. TOP-LEVEL `return`  → SyntaxError ("Illegal return statement"). NEVER use.
 * 2. TOP-LEVEL `await`   → Error ("await is only valid in async functions …"). NEVER use.
 * 3. ASYNC IIFE          → WORKS. The runtime auto-awaits the returned Promise.
 *      `(async () => { await thing; return value; })()`  → value
 *      `(async () => { await thing; })()`                 → (no output) [undefined]
 *      You MUST include an explicit `return` to get output.
 * 4. BARE PROMISE        → auto-awaited. `Promise.resolve(42)` → 42.
 * 5. PLAIN EXPRESSION    → returned as-is. `1+1` → 2.
 * 6. `undefined` result  → "(no output)" in CLI output. Not an error.
 *
 * KEY RULE: `(no output)` always means the expression evaluated to `undefined`.
 * It does NOT mean an unresolved promise (all Promises are auto-awaited).
 * The most common cause: async IIFE without a `return` statement.
 *
 * USE wrapAsync() FOR ALL ASYNC CODE. It wraps in an async IIFE with a
 * closing `return` — callers write plain `await`/`return` statements.
 *
 * NEWLINES: newlines/tabs are collapsed to spaces by shellQuoteEval.
 * Separate statements with `;`. Do NOT use backtick template literals
 * with embedded newlines.
 * ───────────────────────────────────────────────────────────────────────────
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
 * Wrap async code so it runs inside an async IIFE.
 *
 * This is THE standard way to run any code that needs `await` or `return`.
 * The caller writes plain JS body with `await` and `return` statements.
 * wrapAsync produces: `(async () => { <body> })()`
 *
 * IMPORTANT: The body MUST contain at least one `return <value>` statement
 * if you want output. A body that falls off the end returns `undefined`,
 * which the CLI reports as "(no output)".
 *
 * Example:
 *   wrapAsync(`const f = app.vault.getAbstractFileByPath('foo.md'); return !!f;`)
 *   → (async () => { const f = app.vault.getAbstractFileByPath('foo.md'); return !!f; })()
 */
export function wrapAsync(body: string): string {
  return `(async () => { ${body} })()`;
}

/**
 * Evaluate JavaScript in the Obsidian window context.
 * Returns the stringified result.
 *
 * "(no output)" is returned as the literal string "(no output)" when the
 * evaluated expression is `undefined`. This is NOT an error — it means the
 * code ran but produced no return value. The most common fix: add `return`.
 *
 * EVAL_PROMISE_UNRESOLVED is never expected in normal operation (the runtime
 * auto-awaits all Promises), but is kept as a safeguard label for callers
 * that detect unexpected "(no output)" where a value was required.
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
    const value = result.startsWith("=> ") ? result.slice(3) : result;

    // "(no output)" means the expression evaluated to undefined.
    // If the caller used wrapAsync and forgot a `return`, this is why.
    // We pass it through as-is — callers that need a value should check.
    return value;
  } catch (err: any) {
    if (err.killed) throw new Error(`Eval timed out after ${EVAL_TIMEOUT}ms`);
    if (err.code === "ENOENT") {
      throw new Error(`Obsidian CLI not found at ${OBSIDIAN_CLI}. Is Obsidian installed?`);
    }
    throw new Error(`Eval error: ${err.message}`);
  }
}

/** Sentinel returned by obsidianEval when code evaluated to undefined. */
export const EVAL_NO_OUTPUT = "(no output)";

/**
 * Evaluate JS and parse the result as JSON, with a clear error if the result
 * is "(no output)" (undefined from eval — most likely a missing `return`).
 */

export async function obsidianEvalJson<T = unknown>(code: string): Promise<T> {
  const raw = await obsidianEval(code);
  if (raw === EVAL_NO_OUTPUT) {
    throw new Error(
      `EVAL_PROMISE_UNRESOLVED: eval returned undefined (no output). ` +
      `The code likely used wrapAsync/async IIFE but forgot a 'return' statement. ` +
      `Add 'return <value>' before the closing brace of your async IIFE.`
    );
  }
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
 *
 * After reload: rerenders all markdown leaf previews (required for block-mode maps)
 * and polls for window.__windrose?.ready up to 3s.
 */
export async function obsidianReload(): Promise<string> {
  const code = wrapAsync(
    `const id = ${JSON.stringify(PLUGIN_ID)};` +
    `const insts = () => Object.values((window.__windrose && window.__windrose.mcpInstances) || {});` +
    `let flushed = 0;` +
    `for (const i of insts()) { try { if (i.ops && i.ops.forceSave) { i.ops.forceSave(); flushed++; } } catch (e) {} }` +
    `await new Promise(r => setTimeout(r, 200));` +
    `const deadline = Date.now() + 5000;` +
    `const pending = () => insts().some(i => i.saveStatus && i.saveStatus !== 'Saved');` +
    `while (pending() && Date.now() < deadline) { await new Promise(r => setTimeout(r, 100)); }` +
    `const timedOut = pending();` +
    `await app.plugins.disablePlugin(id);` +
    `await app.plugins.enablePlugin(id);` +
    // Rerender markdown blocks so windrose code fences re-mount
    `app.workspace.getLeavesOfType('markdown').forEach(l => { try { l.view.previewMode?.rerender?.(true); } catch(e) {} });` +
    // Poll for ready flag up to 3s
    `const readyDeadline = Date.now() + 3000;` +
    `while (!window.__windrose?.ready && Date.now() < readyDeadline) { await new Promise(r => setTimeout(r, 100)); }` +
    `const ready = !!window.__windrose?.ready;` +
    `const version = window.__windrose?.version || null;` +
    `return JSON.stringify({ reloaded: true, flushed, timedOut, ready, version });`
  );
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
 * Uses the shared RESOLVE logic from ops-helper (activeFile → ItemView → sole instance).
 * Returns null if no map is open or MCP bridge isn't initialized.
 *
 * @deprecated Prefer obsidianEvalJson with RESOLVE_JSON from ops-helper for richer context.
 */
export async function getWindroseState(): Promise<Record<string, unknown> | null> {
  // Use the same RESOLVE logic as ops-helper: activeFile key → ItemView leaf → sole instance
  const code = wrapAsync(
    `const i = window.__windrose?.mcpInstances;` +
    `if (!i) return JSON.stringify(null);` +
    `const p = app.workspace.getActiveFile()?.path;` +
    `if (p && i[p]) return JSON.stringify(i[p]);` +
    `const vl = app.workspace.getLeavesOfType('windrose-map-view');` +
    `if (vl.length > 0) { const k = '__view__:' + (vl[0].view.getState()?.mapId||''); if (i[k]) return JSON.stringify(i[k]); }` +
    `const keys = Object.keys(i);` +
    `if (keys.length === 1) return JSON.stringify(i[keys[0]]);` +
    `return JSON.stringify(null);`
  );
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

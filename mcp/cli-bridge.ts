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
const PLUGIN_ID = "dungeon-map-tracker-settings";

/** Default timeout for CLI commands (ms) */
const DEFAULT_TIMEOUT = 15_000;

/** Longer timeout for eval (code execution may be slow) */
const EVAL_TIMEOUT = 30_000;

/** Quote a string for shell use — rejects shell metacharacters to prevent injection */
function shellQuote(s: string): string {
  if (/[\x00-\x1f`$\\!#&|;(){}<>%^]/.test(s)) {
    throw new Error(`Unsafe characters in shell argument: ${s.slice(0, 50)}`);
  }
  return `"${s.replace(/"/g, '\\"')}"`;
}

/**
 * Quote a string for shell use inside double quotes, escaping bash-special
 * characters rather than rejecting them. Used for eval code payloads where
 * parentheses, braces, semicolons etc. are expected JS syntax.
 * Inside bash double quotes only $, `, \, !, and " are special.
 */
function shellQuoteEval(s: string): string {
  if (/[\x00-\x1f]/.test(s)) {
    throw new Error(`Control characters in eval code: ${s.slice(0, 50)}`);
  }
  const escaped = s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`")
    .replace(/!/g, "\\!");
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
 * Reload the Windrose settings plugin.
 */
export async function obsidianReload(): Promise<string> {
  return cli("plugin:reload", `id=${PLUGIN_ID}`);
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

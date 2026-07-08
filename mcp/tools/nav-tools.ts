/**
 * Navigation tools — open maps, navigate to coordinates, screenshot, reload.
 */

import { z } from "zod";
import * as path from "node:path";
import { mkdirSync } from "node:fs";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  obsidianOpen,
  obsidianReload,
  obsidianScreenshot,
  navigateToMap,
  obsidianEval,
  wrapAsync,
  EVAL_NO_OUTPUT,
} from "../cli-bridge.js";

const SCREENSHOT_DIR = path.resolve(
  import.meta.dirname || ".",
  "..",
  "screenshots"
);

/** Max bytes returned from windrose_eval */
const EVAL_MAX_BYTES = 50_000;

export function registerNavTools(server: McpServer): void {
  // ─── windrose_open_map ──────────────────────────────────────────────────────
  server.tool(
    "windrose_open_map",
    "Open a note file containing a Windrose map. Forces live-preview mode (required — blocks don't render in source mode). Polls mcpInstances for up to 6s until the map mounts. Returns {mounted, instanceKey, mapId, mapType, waitedMs, instances} — NOT a premature 'Opened' string.",
    {
      notePath: z
        .string()
        .describe(
          "Vault-relative path to the note (e.g. '_testing/smoke-test-map.md')"
        ),
    },
    async ({ notePath }) => {
      if (notePath.includes("..")) {
        return {
          content: [{ type: "text" as const, text: "Invalid note path: must not contain .." }],
          isError: true,
        };
      }
      // Step 1: open the note (makes Obsidian navigate to it)
      await obsidianOpen(notePath);

      // Step 2: set live-preview mode, focus, then poll for mount
      const notePathJson = JSON.stringify(notePath);
      const code = wrapAsync(
        // Force live-preview on the leaf showing this file
        `const targetPath = ${notePathJson};` +
        `const leaves = app.workspace.getLeavesOfType('markdown');` +
        `for (const leaf of leaves) {` +
        `  if (leaf.view?.file?.path === targetPath) {` +
        `    const st = leaf.getViewState();` +
        `    if (!st.state) st.state = {};` +
        `    st.state.mode = 'source';` +
        `    st.state.source = false;` +
        `    await leaf.setViewState(st);` +
        `    app.workspace.setActiveLeaf(leaf, { focus: true });` +
        `    break;` +
        `  }` +
        `}` +
        // Poll mcpInstances for the note path key
        `const t0 = Date.now();` +
        `const deadline = t0 + 6000;` +
        `let inst = null;` +
        `let key = null;` +
        `while (Date.now() < deadline) {` +
        `  const mi = window.__windrose?.mcpInstances || {};` +
        `  if (mi[targetPath]) { inst = mi[targetPath]; key = targetPath; break; }` +
        `  for (const k of Object.keys(mi)) {` +
        `    if (k.startsWith('__view__:') && mi[k]?.notePath === targetPath) { inst = mi[k]; key = k; break; }` +
        `  }` +
        `  if (inst) break;` +
        `  await new Promise(r => setTimeout(r, 300));` +
        `}` +
        `const waitedMs = Date.now() - t0;` +
        `const mi = window.__windrose?.mcpInstances || {};` +
        `if (!inst) {` +
        `  return JSON.stringify({ mounted: false, instanceKey: null, mapId: null, mapType: null, waitedMs, instances: Object.keys(mi), hint: 'Map did not register within 6s. Check the note has a windrose-map code block and the plugin is loaded.' });` +
        `}` +
        `return JSON.stringify({ mounted: true, instanceKey: key, mapId: inst.mapId || null, mapType: inst.mapType || null, waitedMs, instances: Object.keys(mi) });`
      );

      try {
        const raw = await obsidianEval(code);
        if (raw === EVAL_NO_OUTPUT) {
          return { content: [{ type: "text" as const, text: "Error: eval returned no output" }], isError: true };
        }
        let result: any;
        try { result = JSON.parse(raw); } catch {
          return { content: [{ type: "text" as const, text: `Unparseable result: ${raw.slice(0, 200)}` }], isError: true };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Eval error: ${err.message}` }], isError: true };
      }
    }
  );

  // ─── windrose_navigate ──────────────────────────────────────────────────────
  server.tool(
    "windrose_navigate",
    "Navigate to specific coordinates and zoom level on the current map (dispatches dmt-navigate-to event). " +
    "CAVEAT: This dispatches an event that the component MAY ignore — zoom sometimes applies, x/y often does not " +
    "(known limitation, Phase 3 will add a direct viewport API). Always verify with windrose_get_state after calling " +
    "to confirm the view actually moved.",
    {
      mapId: z.string().describe("Map ID to navigate to"),
      x: z.number().optional().describe("X offset (world coords, default 0)"),
      y: z.number().optional().describe("Y offset (world coords, default 0)"),
      zoom: z
        .number()
        .optional()
        .describe("Zoom level (default 1, range ~0.25-4)"),
      layerId: z
        .string()
        .optional()
        .describe("Layer ID to activate (optional)"),
    },
    async ({ mapId, x, y, zoom, layerId }) => {
      await navigateToMap({ mapId, x, y, zoom, layerId });
      return {
        content: [
          {
            type: "text" as const,
            text: `Navigation event dispatched: map=${mapId} at (${x ?? 0}, ${y ?? 0}) zoom=${zoom ?? 1}. ` +
              `Note: x/y often do not apply — verify with windrose_get_state.`,
          },
        ],
      };
    }
  );

  // ─── windrose_screenshot ────────────────────────────────────────────────────
  server.tool(
    "windrose_screenshot",
    "Take a screenshot of the current Obsidian window. Returns the file path plus {mounted, canvasSize} from the live Windrose container. Optional zoom (0.5-5): sets webFrame zoom factor before the shot and ALWAYS resets to 1.0 afterward — even if the screenshot throws — so a crashed session can never leave Obsidian stuck at an extreme zoom.",
    {
      filename: z
        .string()
        .optional()
        .describe(
          "Screenshot filename (default: mcp-screenshot-{timestamp}.png)"
        ),
      zoom: z
        .number()
        .min(0.5)
        .max(5)
        .optional()
        .describe(
          "Zoom factor to apply before screenshotting (0.5-5). Always reset to 1.0 after, even on error. Use for magnified inspection."
        ),
    },
    async ({ filename, zoom }) => {
      const name = filename || `mcp-screenshot-${Date.now()}.png`;
      mkdirSync(SCREENSHOT_DIR, { recursive: true });
      const outputPath = path.resolve(SCREENSHOT_DIR, name);
      if (!outputPath.startsWith(SCREENSHOT_DIR)) {
        return {
          content: [{ type: "text" as const, text: "Screenshot filename cannot contain path traversal" }],
          isError: true,
        };
      }

      // Apply zoom before screenshot (if requested)
      if (zoom !== undefined) {
        const zoomCode = wrapAsync(
          `const webFrame = (function(){` +
          `  try { return require('electron').webFrame; } catch(e) {}` +
          `  try { return window.require('electron').webFrame; } catch(e) {}` +
          `  return null;` +
          `})();` +
          `if (!webFrame) return JSON.stringify({ ok: false, error: 'webFrame not available' });` +
          `webFrame.setZoomFactor(${zoom});` +
          `await new Promise(r => setTimeout(r, 300));` +
          `return JSON.stringify({ ok: true, zoomApplied: ${zoom} });`
        );
        try {
          await obsidianEval(zoomCode);
        } catch (_) {
          // If zoom fails, try to reset and bail
          await obsidianEval(wrapAsync(
            `try { const wf = require('electron').webFrame || window.require('electron').webFrame; wf.setZoomFactor(1.0); } catch(e) {}`
          )).catch(() => {});
          return {
            content: [{ type: "text" as const, text: `Failed to set zoom factor ${zoom}` }],
            isError: true,
          };
        }
      }

      let screenshotError: string | null = null;
      try {
        await obsidianScreenshot(outputPath);
      } catch (err: any) {
        screenshotError = err.message;
      } finally {
        // ALWAYS reset zoom to 1.0 — even if screenshot threw
        if (zoom !== undefined) {
          const resetCode = wrapAsync(
            `try {` +
            `  const wf = (function(){` +
            `    try { return require('electron').webFrame; } catch(e) {}` +
            `    try { return window.require('electron').webFrame; } catch(e) {}` +
            `    return null;` +
            `  })();` +
            `  if (wf) wf.setZoomFactor(1.0);` +
            `} catch(e) {}` +
            `return JSON.stringify({ zoomReset: true });`
          );
          await obsidianEval(resetCode).catch(() => {});
        }
      }

      if (screenshotError) {
        return {
          content: [{ type: "text" as const, text: `Screenshot error: ${screenshotError}` }],
          isError: true,
        };
      }

      // Gather windrose container presence + canvas size
      // Canvas identity: the render canvas has position:static; the transparent overlay has position:absolute.
      const probeCode = wrapAsync(
        `const container = (function(){` +
        `  const fp = document.querySelector('.windrose-full-pane');` +
        `  const root = fp || document;` +
        `  const all = [...root.querySelectorAll('.windrose-container')];` +
        `  return all.find(c => { const r = c.getBoundingClientRect(); return r.width > 50 && c.offsetParent != null; }) || null;` +
        `})();` +
        `const mounted = !!container;` +
        `let canvasSize = null;` +
        `if (container) {` +
        `  const canvases = [...container.querySelectorAll('canvas')].filter(c => c.offsetParent != null);` +
        `  const staticC = canvases.filter(c => window.getComputedStyle(c).position !== 'absolute');` +
        `  const pool = staticC.length > 0 ? staticC : canvases;` +
        `  const renderCanvas = pool.reduce((a,b) => (a && a.width*a.height >= b.width*b.height ? a : b), null);` +
        `  if (renderCanvas) canvasSize = { w: renderCanvas.width, h: renderCanvas.height };` +
        `}` +
        `return JSON.stringify({ mounted, canvasSize });`
      );

      let probe: any = null;
      try {
        const raw = await obsidianEval(probeCode);
        if (raw !== EVAL_NO_OUTPUT) {
          try { probe = JSON.parse(raw); } catch {}
        }
      } catch (_) {}

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            path: outputPath,
            ...(zoom !== undefined ? { zoom } : {}),
            ...(probe || {}),
          }, null, 2),
        }],
      };
    }
  );

  // ─── windrose_reload ────────────────────────────────────────────────────────
  server.tool(
    "windrose_reload",
    "Reload the Windrose plugin safely: flushes pending saves (prevents data file truncation), disables/enables the plugin, rerenders markdown previews (required for block-mode maps to remount), then polls for ready state. Optional notePath: if provided, also opens and waits for the map to mount after reload.",
    {
      notePath: z
        .string()
        .optional()
        .describe(
          "If provided, open this map note after reload and wait for it to mount. Vault-relative path."
        ),
    },
    async ({ notePath }) => {
      try {
        const reloadResult = await obsidianReload();
        let reloadParsed: any = {};
        try { reloadParsed = JSON.parse(reloadResult); } catch {}

        if (!notePath) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(reloadParsed, null, 2) }],
          };
        }

        // Chain: open map after reload
        if (notePath.includes("..")) {
          return {
            content: [{ type: "text" as const, text: "Invalid notePath: must not contain .." }],
            isError: true,
          };
        }
        await obsidianOpen(notePath);

        const notePathJson = JSON.stringify(notePath);
        const openCode = wrapAsync(
          `const targetPath = ${notePathJson};` +
          `const leaves = app.workspace.getLeavesOfType('markdown');` +
          `for (const leaf of leaves) {` +
          `  if (leaf.view?.file?.path === targetPath) {` +
          `    const st = leaf.getViewState();` +
          `    if (!st.state) st.state = {};` +
          `    st.state.mode = 'source';` +
          `    st.state.source = false;` +
          `    await leaf.setViewState(st);` +
          `    app.workspace.setActiveLeaf(leaf, { focus: true });` +
          `    break;` +
          `  }` +
          `}` +
          `const t0 = Date.now();` +
          `const deadline = t0 + 6000;` +
          `let inst = null, key = null;` +
          `while (Date.now() < deadline) {` +
          `  const mi = window.__windrose?.mcpInstances || {};` +
          `  if (mi[targetPath]) { inst = mi[targetPath]; key = targetPath; break; }` +
          `  for (const k of Object.keys(mi)) {` +
          `    if (k.startsWith('__view__:') && mi[k]?.notePath === targetPath) { inst = mi[k]; key = k; break; }` +
          `  }` +
          `  if (inst) break;` +
          `  await new Promise(r => setTimeout(r, 300));` +
          `}` +
          `const mi = window.__windrose?.mcpInstances || {};` +
          `return JSON.stringify({ mounted: !!inst, instanceKey: key, mapId: inst?.mapId || null, waitedMs: Date.now() - t0, instances: Object.keys(mi) });`
        );

        let reopened: any = null;
        try {
          const raw = await obsidianEval(openCode);
          if (raw !== EVAL_NO_OUTPUT) {
            try { reopened = JSON.parse(raw); } catch {}
          }
        } catch {}

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ ...reloadParsed, reopened }, null, 2),
          }],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text" as const, text: `Reload error: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // ─── windrose_eval ──────────────────────────────────────────────────────────
  server.tool(
    "windrose_eval",
    "Evaluate JavaScript in the Obsidian window context. Use for advanced probing not covered by other tools. " +
    "Prefer dedicated tools when they exist.\n\n" +
    "## Eval scope rules (verified 2026-07-07)\n" +
    "- TOP-LEVEL `return` → SyntaxError. NEVER use bare return.\n" +
    "- TOP-LEVEL `await` → Error. NEVER use bare await.\n" +
    "- ASYNC IIFE → works. The runtime auto-awaits the Promise.\n" +
    "  `(async () => { await thing; return value; })()` → value\n" +
    "  `(async () => { await thing; })()` → (no output) [undefined — MISSING RETURN]\n" +
    "  You MUST include an explicit `return` in the IIFE body to get output.\n" +
    "- BARE PROMISE → auto-awaited: `Promise.resolve(42)` → 42.\n" +
    "- PLAIN EXPRESSION → returned as-is: `1+1` → 2.\n" +
    "- `(no output)` = the expression was undefined. NOT a transport error.\n" +
    "  Most common cause: async IIFE without a return statement.\n\n" +
    "## asyncWrap=true\n" +
    "Wraps your code body in `(async () => { <code> })()`. Use `await` and `return` freely.\n\n" +
    "## Newlines\n" +
    "Newlines/tabs are collapsed to spaces. Separate statements with `;`.\n" +
    "Do NOT use backtick template literals with embedded newlines.\n\n" +
    "## Output cap\n" +
    `Output is capped at ${EVAL_MAX_BYTES} bytes with a truncation notice.`,
    {
      code: z
        .string()
        .max(50000)
        .describe("JavaScript code to evaluate in the Obsidian window context."),
      asyncWrap: z
        .boolean()
        .optional()
        .describe(
          "If true, wrap code in an async IIFE so you can use `await` and `return` freely. Default false."
        ),
    },
    async ({ code, asyncWrap }) => {
      const payload = asyncWrap ? wrapAsync(code) : code;
      try {
        const raw = await obsidianEval(payload);
        let output = raw;
        let truncated = false;
        if (raw !== EVAL_NO_OUTPUT && raw.length > EVAL_MAX_BYTES) {
          output = raw.slice(0, EVAL_MAX_BYTES);
          truncated = true;
        }
        const text = truncated
          ? `${output}\n\n[TRUNCATED: output was ${raw.length} bytes, capped at ${EVAL_MAX_BYTES}]`
          : (output || EVAL_NO_OUTPUT);
        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text" as const, text: `Eval error: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // ─── windrose_vault_read ────────────────────────────────────────────────────
  server.tool(
    "windrose_vault_read",
    "Read a vault file by path (via app.vault.adapter.read). Use for static-verify (e.g. confirming a new symbol reached the plugin main.js artifact). Supports an optional search term — returns surrounding context instead of full content.",
    {
      path: z
        .string()
        .describe(
          "Vault-relative path. Examples: '.obsidian/plugins/windrose-md/main.js', 'windrose-md-data.json'"
        ),
      search: z
        .string()
        .optional()
        .describe(
          "If provided, return { found, length, index, context } where context is ~200 chars around the first match. If omitted, return the full file content (up to 500KB)."
        ),
      maxBytes: z
        .number()
        .optional()
        .describe("Truncate full-content reads to this many bytes. Default 500000. Ignored when 'search' is set."),
    },
    async ({ path: vaultPath, search, maxBytes }) => {
      if (vaultPath.includes("..")) {
        return {
          content: [{ type: "text" as const, text: "Invalid path: must not contain '..'" }],
          isError: true,
        };
      }
      const limit = maxBytes ?? 500_000;
      const p = JSON.stringify(vaultPath);
      let code: string;
      if (search) {
        const s = JSON.stringify(search);
        code = wrapAsync(
          `try { const c = await app.vault.adapter.read(${p}); const idx = c.indexOf(${s}); ` +
          `if (idx < 0) return JSON.stringify({ found: false, length: c.length }); ` +
          `const ctxStart = Math.max(0, idx - 80); const ctxEnd = Math.min(c.length, idx + ${s}.length + 80); ` +
          `return JSON.stringify({ found: true, length: c.length, index: idx, context: c.slice(ctxStart, ctxEnd) }); ` +
          `} catch (e) { return JSON.stringify({ error: e.message }); }`
        );
      } else {
        code = wrapAsync(
          `try { const c = await app.vault.adapter.read(${p}); ` +
          `return JSON.stringify({ length: c.length, truncated: c.length > ${limit}, content: c.slice(0, ${limit}) }); ` +
          `} catch (e) { return JSON.stringify({ error: e.message }); }`
        );
      }
      try {
        const raw = await obsidianEval(code);
        if (raw === EVAL_NO_OUTPUT) {
          return { content: [{ type: "text" as const, text: "Error: eval returned no output" }], isError: true };
        }
        let parsed: any;
        try { parsed = JSON.parse(raw); } catch { parsed = { error: `Unparseable result: ${raw.slice(0, 200)}` }; }
        if (parsed && parsed.error) {
          return {
            content: [{ type: "text" as const, text: `Error: ${parsed.error}` }],
            isError: true,
          };
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify(parsed, null, 2) }],
        };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Eval error: ${err.message}` }], isError: true };
      }
    }
  );
}

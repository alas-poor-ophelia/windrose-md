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
} from "../cli-bridge.js";

const SCREENSHOT_DIR = path.resolve(
  import.meta.dirname || ".",
  "..",
  "screenshots"
);

export function registerNavTools(server: McpServer): void {
  server.tool(
    "windrose_open_map",
    "Open a note file containing a Windrose map in Obsidian",
    {
      notePath: z
        .string()
        .describe(
          "Vault-relative path to the note (e.g. '_testing/smoke-test-map.md')"
        ),
    },
    async ({ notePath }) => {
      if (notePath.includes('..')) {
        return { content: [{ type: "text" as const, text: "Invalid note path: must not contain .." }], isError: true };
      }
      await obsidianOpen(notePath);
      return {
        content: [
          { type: "text" as const, text: `Opened: ${notePath}` },
        ],
      };
    }
  );

  server.tool(
    "windrose_navigate",
    "Navigate to specific coordinates and zoom level on the current map (dispatches dmt-navigate-to event)",
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
            text: `Navigated to map=${mapId} at (${x ?? 0}, ${y ?? 0}) zoom=${zoom ?? 1}`,
          },
        ],
      };
    }
  );

  server.tool(
    "windrose_screenshot",
    "Take a screenshot of the current Obsidian window. Returns the file path.",
    {
      filename: z
        .string()
        .optional()
        .describe(
          "Screenshot filename (default: mcp-screenshot-{timestamp}.png)"
        ),
    },
    async ({ filename }) => {
      const name =
        filename || `mcp-screenshot-${Date.now()}.png`;
      mkdirSync(SCREENSHOT_DIR, { recursive: true });
      const outputPath = path.resolve(SCREENSHOT_DIR, name);
      if (!outputPath.startsWith(SCREENSHOT_DIR)) {
        return { content: [{ type: "text" as const, text: "Screenshot filename cannot contain path traversal" }], isError: true };
      }
      await obsidianScreenshot(outputPath);
      return {
        content: [
          {
            type: "text" as const,
            text: `Screenshot saved: ${outputPath}`,
          },
        ],
      };
    }
  );

  server.tool(
    "windrose_reload",
    "Reload the Windrose settings plugin (after code changes)",
    async () => {
      const result = await obsidianReload();
      return {
        content: [
          {
            type: "text" as const,
            text: `Plugin reloaded. ${result}`,
          },
        ],
      };
    }
  );

  server.tool(
    "windrose_eval",
    "Evaluate JavaScript in the Obsidian window context. Use for advanced probing not covered by other tools. Prefer dedicated tools (windrose_paint_cell, windrose_set_tool, windrose_vault_read, etc.) when they exist.",
    {
      code: z
        .string()
        .max(50000)
        .describe(
          "JavaScript code. Has access to window, app, window.__windrose. " +
          "Multi-line input is accepted — newlines are collapsed to spaces, so separate statements with ';'. " +
          "Avoid backtick template literals (newlines inside them are lost). " +
          "Return value: the last expression evaluated — CLI prints it prefixed with '=> '. " +
          "Without asyncWrap, top-level 'return' and 'await' are NOT allowed — wrap in '(async () => { ... })()' yourself. " +
          "With asyncWrap=true, the code is auto-wrapped so you can use 'await' and 'return' freely."
        ),
      asyncWrap: z
        .boolean()
        .optional()
        .describe(
          "If true, wrap code in an async IIFE: '(async () => { <code> })()'. Lets you use top-level await and return. Default false."
        ),
    },
    async ({ code, asyncWrap }) => {
      const payload = asyncWrap ? `(async () => { ${code} })()` : code;
      try {
        const result = await obsidianEval(payload);
        return {
          content: [{ type: "text" as const, text: result || "(no output)" }],
        };
      } catch (err: any) {
        return {
          content: [
            { type: "text" as const, text: `Eval error: ${err.message}` },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "windrose_vault_read",
    "Read a vault file by path (via app.vault.adapter.read). Use for static-verify (e.g. confirming a new symbol reached the plugin main.js artifact). Supports an optional search term — returns surrounding context instead of full content.",
    {
      path: z
        .string()
        .describe(
          "Vault-relative path. Examples: '.obsidian/plugins/dungeon-map-tracker-settings/main.js', 'compiled-windrose-md.md', 'windrose-md-data.json'"
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
        code =
          `(async () => { try { const c = await app.vault.adapter.read(${p}); const idx = c.indexOf(${s}); ` +
          `if (idx < 0) return JSON.stringify({ found: false, length: c.length }); ` +
          `const ctxStart = Math.max(0, idx - 80); const ctxEnd = Math.min(c.length, idx + ${s}.length + 80); ` +
          `return JSON.stringify({ found: true, length: c.length, index: idx, context: c.slice(ctxStart, ctxEnd) }); ` +
          `} catch (e) { return JSON.stringify({ error: e.message }); } })()`;
      } else {
        code =
          `(async () => { try { const c = await app.vault.adapter.read(${p}); ` +
          `return JSON.stringify({ length: c.length, truncated: c.length > ${limit}, content: c.slice(0, ${limit}) }); ` +
          `} catch (e) { return JSON.stringify({ error: e.message }); } })()`;
      }
      try {
        const raw = await obsidianEval(code);
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
        return {
          content: [{ type: "text" as const, text: `Eval error: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}

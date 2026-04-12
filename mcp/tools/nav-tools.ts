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
    "Evaluate arbitrary JavaScript in the Obsidian window context. Use for advanced operations not covered by other tools.",
    {
      code: z
        .string()
        .max(50000)
        .describe(
          "JavaScript code to evaluate. Has access to window, app, window.__windrose, etc. Use 'return' for a result."
        ),
    },
    async ({ code }) => {
      try {
        const result = await obsidianEval(code);
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
}

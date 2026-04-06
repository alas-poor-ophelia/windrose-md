/**
 * Draw tools — paint, erase, and query cells via direct state mutation.
 * Uses cellAccessor functions through the MCP ops bridge, never mouse simulation.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { obsidianEvalJson } from "../cli-bridge.js";

/** Helper: get the active MCP instance ops accessor as a JS expression */
const OPS = `(function(){var i=window.__windrose?.mcpInstances;if(!i)return null;var p=app.workspace.getActiveFile()?.path;return p&&i[p]?i[p].ops:null})()`;

/** Helper: build eval code that calls an op and returns JSON result */
function opCall(fnBody: string): string {
  return `var ops=${OPS};if(!ops){JSON.stringify({error:'No active map'})}else{${fnBody}}`;
}

export function registerDrawTools(server: McpServer): void {
  server.tool(
    "windrose_paint_cell",
    "Paint a single cell at grid coordinates. Uses the current color/opacity unless overridden.",
    {
      x: z.number().describe("Grid X coordinate"),
      y: z.number().describe("Grid Y coordinate"),
      color: z.string().optional().describe("Hex color (e.g. '#ff0000'). Default: current selected color"),
      opacity: z.number().min(0).max(1).optional().describe("Opacity 0-1. Default: current selected opacity"),
    },
    async ({ x, y, color, opacity }) => {
      const colorArg = color ? `,'${color.replace(/'/g, "\\'")}'` : "";
      const opacityArg = opacity !== undefined ? `,${opacity}` : (color ? ",undefined" : "");
      const code = opCall(
        `var r=ops.paintCell(${x},${y}${colorArg}${opacityArg});JSON.stringify({ok:r,x:${x},y:${y}})`
      );
      const result = await obsidianEvalJson<{ ok: boolean; error?: string }>(code);
      if (result.error) {
        return { content: [{ type: "text" as const, text: result.error }], isError: true };
      }
      return {
        content: [{ type: "text" as const, text: result.ok ? `Painted cell at (${x}, ${y})` : "Failed to paint cell" }],
      };
    }
  );

  server.tool(
    "windrose_paint_cells",
    "Paint multiple cells in a single operation (one undo entry). Uses current color/opacity unless overridden per-cell.",
    {
      cells: z.array(z.object({
        x: z.number().describe("Grid X coordinate"),
        y: z.number().describe("Grid Y coordinate"),
        color: z.string().optional().describe("Hex color override for this cell"),
        opacity: z.number().min(0).max(1).optional().describe("Opacity override for this cell"),
      })).describe("Array of cells to paint"),
    },
    async ({ cells }) => {
      const cellsJson = JSON.stringify(cells);
      const code = opCall(
        `var r=ops.paintCells(${cellsJson});JSON.stringify({ok:true,count:r})`
      );
      const result = await obsidianEvalJson<{ ok: boolean; count: number; error?: string }>(code);
      if (result.error) {
        return { content: [{ type: "text" as const, text: result.error }], isError: true };
      }
      return {
        content: [{ type: "text" as const, text: `Painted ${result.count} cells` }],
      };
    }
  );

  server.tool(
    "windrose_erase_cell",
    "Erase a single cell at grid coordinates",
    {
      x: z.number().describe("Grid X coordinate"),
      y: z.number().describe("Grid Y coordinate"),
    },
    async ({ x, y }) => {
      const code = opCall(
        `var r=ops.eraseCell(${x},${y});JSON.stringify({ok:r,x:${x},y:${y}})`
      );
      const result = await obsidianEvalJson<{ ok: boolean; error?: string }>(code);
      if (result.error) {
        return { content: [{ type: "text" as const, text: result.error }], isError: true };
      }
      return {
        content: [{ type: "text" as const, text: result.ok ? `Erased cell at (${x}, ${y})` : "Failed to erase cell" }],
      };
    }
  );

  server.tool(
    "windrose_get_cells",
    "Get all painted cells on the active layer with their coordinates, colors, and opacity",
    async () => {
      const code = opCall(
        `var cells=ops.getCells();JSON.stringify({count:cells.length,cells:cells})`
      );
      const result = await obsidianEvalJson<{
        count: number;
        cells: Array<{ x: number; y: number; color: string; opacity: number }>;
        error?: string;
      }>(code);
      if (result.error) {
        return { content: [{ type: "text" as const, text: result.error }], isError: true };
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}

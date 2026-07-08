/**
 * Draw tools — paint, erase, and query cells via direct state mutation.
 * Uses cellAccessor functions through the MCP ops bridge, never mouse simulation.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { obsidianEvalJson } from "../cli-bridge.js";
import { opCall, jsStr } from "./ops-helper.js";

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
      const colorArg = color ? `,${jsStr(color)}` : "";
      const opacityArg = opacity !== undefined ? `,${opacity}` : (color ? ",undefined" : "");
      const code = opCall(
        `var r=ops.paintCell(${x},${y}${colorArg}${opacityArg});return JSON.stringify({ok:r,x:${x},y:${y}})`
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
      })).max(10000).describe("Array of cells to paint"),
    },
    async ({ cells }) => {
      const cellsJson = JSON.stringify(cells);
      const code = opCall(
        `var r=ops.paintCells(${cellsJson});return JSON.stringify({ok:true,count:r})`
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
        `var r=ops.eraseCell(${x},${y});return JSON.stringify({ok:r,x:${x},y:${y}})`
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
    "Get painted cells on the active layer. Optional bbox filters to a bounding box of grid coordinates. Optional summary returns only {count, bounds, colorHistogram} instead of the full cell list. Never returns more than 50KB — if the full list would exceed that, returns summary + truncated:true + first 200 cells regardless of the summary flag.",
    {
      bbox: z
        .object({
          x0: z.number().describe("Minimum grid X (inclusive)"),
          y0: z.number().describe("Minimum grid Y (inclusive)"),
          x1: z.number().describe("Maximum grid X (inclusive)"),
          y1: z.number().describe("Maximum grid Y (inclusive)"),
        })
        .optional()
        .describe("Filter cells to this bounding box. Default: all cells."),
      summary: z
        .boolean()
        .optional()
        .describe(
          "When true, return only {count, bounds:{minX,minY,maxX,maxY}, colorHistogram (top 10)} without individual cells. Default false."
        ),
    },
    async ({ bbox, summary }) => {
      const bboxJson = bbox ? JSON.stringify(bbox) : "null";
      const summaryBool = summary ? "true" : "false";

      const code = opCall(
        // Fetch all cells
        `var allCells = ops.getCells();` +
        // Apply bbox filter if requested
        `var bbox = ${bboxJson};` +
        `var cells = bbox ? allCells.filter(function(c){ return c.x >= bbox.x0 && c.x <= bbox.x1 && c.y >= bbox.y0 && c.y <= bbox.y1; }) : allCells;` +
        // Compute bounds
        `var bounds = null;` +
        `if (cells.length > 0) {` +
        `  var minX = cells[0].x, maxX = cells[0].x, minY = cells[0].y, maxY = cells[0].y;` +
        `  for (var i = 1; i < cells.length; i++) {` +
        `    if (cells[i].x < minX) minX = cells[i].x;` +
        `    if (cells[i].x > maxX) maxX = cells[i].x;` +
        `    if (cells[i].y < minY) minY = cells[i].y;` +
        `    if (cells[i].y > maxY) maxY = cells[i].y;` +
        `  }` +
        `  bounds = { minX: minX, maxX: maxX, minY: minY, maxY: maxY };` +
        `}` +
        // Compute color histogram (top 10)
        `var colorMap = {};` +
        `for (var i = 0; i < cells.length; i++) {` +
        `  var col = cells[i].color || 'unknown';` +
        `  colorMap[col] = (colorMap[col] || 0) + 1;` +
        `}` +
        `var colorHistogram = Object.entries(colorMap).sort(function(a,b){ return b[1]-a[1]; }).slice(0,10).map(function(e){ return { color: e[0], count: e[1] }; });` +
        // Summary mode
        `var doSummary = ${summaryBool};` +
        `if (doSummary) {` +
        `  return JSON.stringify({ count: cells.length, bounds: bounds, colorHistogram: colorHistogram, summary: true });` +
        `}` +
        // Full mode with byte cap
        `var MAX_BYTES = 50000;` +
        `var full = JSON.stringify({ count: cells.length, bounds: bounds, colorHistogram: colorHistogram, cells: cells });` +
        `if (full.length <= MAX_BYTES) {` +
        `  return full;` +
        `}` +
        // Over cap: return summary + first 200 cells
        `var trimmed = cells.slice(0, 200);` +
        `return JSON.stringify({ count: cells.length, bounds: bounds, colorHistogram: colorHistogram, cells: trimmed, truncated: true, note: 'Full list exceeds 50KB. Returned first 200 cells. Use summary:true for counts only, or bbox to filter.' });`
      );

      try {
        const result = await obsidianEvalJson<any>(code);
        if (result && result.error) {
          return { content: [{ type: "text" as const, text: result.error }], isError: true };
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
      }
    }
  );
}

/**
 * Draw tools — paint, erase, and query cells via direct state mutation.
 * Uses cellAccessor functions through the MCP ops bridge, never mouse simulation.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { obsidianEvalJson } from "../cli-bridge.js";
import { opCall, jsStr } from "./ops-helper.js";

/** Per-op cap; matches MAX_CELLS_PER_DEPTH_OP in src/persistence/depthAuthoring.ts. */
const MAX_CELLS_PER_OP = 4096;

/** Optional ladder rung. Omitted means level 0, never the camera's active level. */
const levelParam = z.number().int().min(0).optional().describe(
  "Ladder rung (default 0 = the root lattice). Rung cells are in the rung's own axial coordinates."
);

/** Trailing ",level" argument for an op call, or "" when the level is omitted. */
function levelArg(level: number | undefined, padTo = ""): string {
  return level !== undefined ? `${padTo},${level}` : "";
}

/**
 * Eval tail that normalises an op return: rung writes (and refused batches)
 * return a result object, level-0 writes the legacy boolean / count.
 */
const LEVEL_RESULT_JS =
  `if(r&&typeof r==='object'){return JSON.stringify({ok:r.ok,count:r.count,skipped:r.skipped,level:r.level,error:r.error});}`;

type LevelWriteReply = { ok: boolean; count?: number; skipped?: number; level?: number; error?: string };

function levelSuffix(r: LevelWriteReply): string {
  if (r.level === undefined) return "";
  return ` on level ${r.level}` + (r.skipped ? ` (${r.skipped} skipped: outside the map at that level)` : "");
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
      level: levelParam,
    },
    async ({ x, y, color, opacity, level }) => {
      const colorArg = color ? `,${jsStr(color)}` : (level !== undefined ? ",undefined" : "");
      const opacityArg = opacity !== undefined ? `,${opacity}` : ((color || level !== undefined) ? ",undefined" : "");
      const code = opCall(
        `var r=ops.paintCell(${x},${y}${colorArg}${opacityArg}${levelArg(level)});${LEVEL_RESULT_JS}return JSON.stringify({ok:r,x:${x},y:${y}})`
      );
      const result = await obsidianEvalJson<LevelWriteReply>(code);
      if (result.error) {
        return { content: [{ type: "text" as const, text: result.error }], isError: true };
      }
      if (result.level !== undefined && result.count === 0) {
        return { content: [{ type: "text" as const, text: `Nothing painted${levelSuffix(result)}` }] };
      }
      return {
        content: [{ type: "text" as const, text: result.ok ? `Painted cell at (${x}, ${y})${levelSuffix(result)}` : "Failed to paint cell" }],
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
      })).max(MAX_CELLS_PER_OP).describe(`Array of cells to paint (at most ${MAX_CELLS_PER_OP} per call)`),
      level: levelParam,
    },
    async ({ cells, level }) => {
      const cellsJson = JSON.stringify(cells);
      const code = opCall(
        `var r=ops.paintCells(${cellsJson}${levelArg(level)});${LEVEL_RESULT_JS}return JSON.stringify({ok:true,count:r})`
      );
      const result = await obsidianEvalJson<LevelWriteReply>(code);
      if (result.error) {
        return { content: [{ type: "text" as const, text: result.error }], isError: true };
      }
      return {
        content: [{ type: "text" as const, text: `Painted ${result.count ?? 0} cells${levelSuffix(result)}` }],
      };
    }
  );

  server.tool(
    "windrose_erase_cell",
    "Erase a single cell at grid coordinates",
    {
      x: z.number().describe("Grid X coordinate"),
      y: z.number().describe("Grid Y coordinate"),
      level: levelParam,
    },
    async ({ x, y, level }) => {
      const code = opCall(
        `var r=ops.eraseCell(${x},${y}${levelArg(level)});${LEVEL_RESULT_JS}return JSON.stringify({ok:r,x:${x},y:${y}})`
      );
      const result = await obsidianEvalJson<LevelWriteReply>(code);
      if (result.error) {
        return { content: [{ type: "text" as const, text: result.error }], isError: true };
      }
      return {
        content: [{ type: "text" as const, text: result.ok ? `Erased cell at (${x}, ${y})${levelSuffix(result)}` : "Failed to erase cell" }],
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
      level: levelParam,
    },
    async ({ bbox, summary, level }) => {
      const bboxJson = bbox ? JSON.stringify(bbox) : "null";
      const summaryBool = summary ? "true" : "false";

      const code = opCall(
        // Fetch all cells
        `var allCells = ops.getCells(${level !== undefined ? `undefined,${level}` : ""});` +
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

/**
 * State tools — modify app state (tool, color, layer, undo/redo, save).
 * Operations call functions on window.__windrose.mcpInstances[path].ops.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { obsidianEval, obsidianEvalJson } from "../cli-bridge.js";

/** Helper: get the active MCP instance ops accessor as a JS expression */
const OPS = `(function(){var i=window.__windrose?.mcpInstances;if(!i)return null;var p=app.workspace.getActiveFile()?.path;return p&&i[p]?i[p].ops:null})()`;

/** Helper: build eval code that calls an op and returns JSON result */
function opCall(fnBody: string): string {
  return `var ops=${OPS};if(!ops){JSON.stringify({error:'No active map'})}else{${fnBody}}`;
}

export function registerStateTools(server: McpServer): void {
  server.tool(
    "windrose_set_tool",
    "Set the active drawing tool (paint, erase, select, rectangle, circle, etc)",
    {
      toolId: z.string().describe(
        "Tool identifier: 'draw', 'erase', 'select', 'rectangle', 'circle', 'clearArea', 'edgeDraw', 'edgeErase', 'segmentDraw', 'edgeLine'"
      ),
    },
    async ({ toolId }) => {
      const code = opCall(`ops.setTool('${toolId}');JSON.stringify({ok:true,tool:'${toolId}'})`);
      const result = await obsidianEvalJson<{ ok?: boolean; error?: string }>(code);
      if (result.error) {
        return { content: [{ type: "text" as const, text: result.error }], isError: true };
      }
      return { content: [{ type: "text" as const, text: `Tool set to: ${toolId}` }] };
    }
  );

  server.tool(
    "windrose_set_color",
    "Set the active drawing color and optionally opacity",
    {
      color: z.string().describe("Hex color string (e.g. '#ff0000')"),
      opacity: z.number().min(0).max(1).optional().describe("Opacity 0-1 (default: unchanged)"),
    },
    async ({ color, opacity }) => {
      const safeColor = color.replace(/'/g, "\\'");
      let body = `ops.setColor('${safeColor}');`;
      if (opacity !== undefined) {
        body += `ops.setOpacity(${opacity});`;
      }
      body += `JSON.stringify({ok:true,color:'${safeColor}'${opacity !== undefined ? `,opacity:${opacity}` : ''}})`;
      const result = await obsidianEvalJson<{ ok?: boolean; error?: string }>(opCall(body));
      if (result.error) {
        return { content: [{ type: "text" as const, text: result.error }], isError: true };
      }
      return { content: [{ type: "text" as const, text: `Color set to: ${color}${opacity !== undefined ? `, opacity: ${opacity}` : ''}` }] };
    }
  );

  server.tool(
    "windrose_undo",
    "Undo the last drawing operation",
    async () => {
      const code = opCall(`var r=ops.undo();JSON.stringify({ok:r})`);
      const result = await obsidianEvalJson<{ ok: boolean; error?: string }>(code);
      if (result.error) {
        return { content: [{ type: "text" as const, text: result.error }], isError: true };
      }
      return {
        content: [{ type: "text" as const, text: result.ok ? "Undo successful" : "Nothing to undo" }],
      };
    }
  );

  server.tool(
    "windrose_redo",
    "Redo the last undone drawing operation",
    async () => {
      const code = opCall(`var r=ops.redo();JSON.stringify({ok:r})`);
      const result = await obsidianEvalJson<{ ok: boolean; error?: string }>(code);
      if (result.error) {
        return { content: [{ type: "text" as const, text: result.error }], isError: true };
      }
      return {
        content: [{ type: "text" as const, text: result.ok ? "Redo successful" : "Nothing to redo" }],
      };
    }
  );

  server.tool(
    "windrose_select_layer",
    "Switch the active drawing layer",
    {
      layerId: z.string().describe("Layer ID to activate (get available IDs from windrose_get_state)"),
    },
    async ({ layerId }) => {
      const safeId = layerId.replace(/'/g, "\\'");
      const code = opCall(`ops.selectLayer('${safeId}');JSON.stringify({ok:true,layerId:'${safeId}'})`);
      const result = await obsidianEvalJson<{ ok?: boolean; error?: string }>(code);
      if (result.error) {
        return { content: [{ type: "text" as const, text: result.error }], isError: true };
      }
      return { content: [{ type: "text" as const, text: `Switched to layer: ${layerId}` }] };
    }
  );

  server.tool(
    "windrose_force_save",
    "Trigger an immediate save (bypasses the normal 2-second debounce)",
    async () => {
      const code = opCall(`ops.forceSave();JSON.stringify({ok:true})`);
      const result = await obsidianEvalJson<{ ok?: boolean; error?: string }>(code);
      if (result.error) {
        return { content: [{ type: "text" as const, text: result.error }], isError: true };
      }
      return { content: [{ type: "text" as const, text: "Save triggered" }] };
    }
  );
}

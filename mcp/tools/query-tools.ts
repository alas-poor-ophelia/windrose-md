/**
 * Query tools — read-only state inspection for Windrose.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  getWindroseState,
  obsidianErrors,
  obsidianEvalJson,
  obsidianVersion,
} from "../cli-bridge.js";

export function registerQueryTools(server: McpServer): void {
  server.tool(
    "windrose_get_state",
    "Get current Windrose app state: active map, zoom, tool, layer, colors, undo/redo availability",
    async () => {
      const state = await getWindroseState();
      if (!state) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No Windrose map is currently open, or the MCP bridge is not initialized. Open a map note first.",
            },
          ],
        };
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify(state, null, 2) }],
      };
    }
  );

  server.tool(
    "windrose_get_errors",
    "Get console errors from Obsidian (useful after code changes or reload)",
    async () => {
      const errors = await obsidianErrors();
      return {
        content: [{ type: "text" as const, text: errors }],
      };
    }
  );

  server.tool(
    "windrose_read_map_data",
    "Read raw map data JSON for a specific mapId from the vault data file",
    { mapId: z.string().describe("The map ID to read data for") },
    async ({ mapId }) => {
      const mid = JSON.stringify(mapId);
      const code = `var mid=${mid};var ii=window.__windrose?.mcpInstances; var ap=app.workspace.getActiveFile()?.path; var st=ii&&ap&&ii[ap]; var dp=st?.dataFilePath||'windrose-md-data.json'; try{var f=app.vault.getAbstractFileByPath(dp); if(!f){JSON.stringify({error:'Data file not found'})}else{var r=await app.vault.read(f); var d=JSON.parse(r); var m=d.maps?.[mid]; m?JSON.stringify(m):JSON.stringify({error:'Map not found: '+mid})}}catch(e){JSON.stringify({error:e.message})}`;
      const result = await obsidianEvalJson<Record<string, unknown>>(code);
      if (result && "error" in result) {
        return {
          content: [{ type: "text" as const, text: `Error: ${result.error}` }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.tool(
    "windrose_ping",
    "Check if Obsidian is running and reachable via CLI",
    async () => {
      try {
        const version = await obsidianVersion();
        const bridgeCode = `JSON.stringify({bridge: !!window.__windrose?.ready, mcpInstances: Object.keys(window.__windrose?.mcpInstances||{}), activeFile: app.workspace.getActiveFile()?.path||null, version: window.__windrose?.version || null})`;
        const bridge = await obsidianEvalJson<{
          bridge: boolean;
          mcpInstances: string[];
          activeFile: string | null;
          version: string | null;
        }>(bridgeCode);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  obsidian: version,
                  windroseBridge: bridge.bridge,
                  mcpInstances: bridge.mcpInstances,
                  activeFile: bridge.activeFile,
                  windroseVersion: bridge.version,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Obsidian not reachable: ${err.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}

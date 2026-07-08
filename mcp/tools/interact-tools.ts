/**
 * Interact tools — live interaction with the Windrose app surface.
 *
 * All operations call functions on window.__windrose.mcpInstances[key].ops.
 * Use windrose_open_map / windrose_ensure_visible to ensure a map is mounted
 * before calling any tool here.
 *
 * Precondition for all tools: a map must be open and mounted (either block-mode
 * or full-pane ItemView). On failure, error payloads include available instance
 * keys and a hint.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { obsidianEvalJson } from "../cli-bridge.js";
import { opCall, jsStr } from "./ops-helper.js";

export function registerInteractTools(server: McpServer): void {

  // ─── windrose_set_viewport ──────────────────────────────────────────────────

  server.tool(
    "windrose_set_viewport",
    "Drive the live map viewport (pan/zoom) directly via ops.setViewport. " +
    "Unlike windrose_navigate (which fires a DOM event the component may ignore), " +
    "this calls the ops bridge synchronously and always takes effect on the mounted map. " +
    "Precondition: a map must be mounted — use windrose_open_map / windrose_ensure_visible first.",
    {
      x: z.number().describe("World X coordinate for the viewport center"),
      y: z.number().describe("World Y coordinate for the viewport center"),
      zoom: z.number().min(0.1).max(8).optional().describe("Zoom level 0.1–8 (default: current zoom unchanged)"),
    },
    async ({ x, y, zoom }) => {
      const zoomArg = zoom !== undefined ? `,${zoom}` : "";
      const body =
        `var r=ops.setViewport(${x},${y}${zoomArg});` +
        `return JSON.stringify(r);`;
      const result = await obsidianEvalJson<{ ok: boolean; viewState?: { x: number; y: number; zoom: number }; error?: string }>(opCall(body));
      if (result.error) {
        return { content: [{ type: "text" as const, text: result.error }], isError: true };
      }
      const vs = result.viewState;
      const summary = vs
        ? `Viewport set — x:${vs.x} y:${vs.y} zoom:${vs.zoom}`
        : `Viewport set — ok:${result.ok}`;
      return { content: [{ type: "text" as const, text: summary }] };
    }
  );

  // ─── windrose_list_tiles ────────────────────────────────────────────────────

  server.tool(
    "windrose_list_tiles",
    "List installed tilesets and their tiles. Filtering and the limit cap are applied " +
    "inside the eval so only the relevant subset is returned over MCP (tilesets can hold " +
    "hundreds of tiles). Each result entry includes a per-tileset tileCount so truncation " +
    "is visible. " +
    "Precondition: a map must be mounted — use windrose_open_map / windrose_ensure_visible first.",
    {
      tilesetId: z.string().optional().describe("Filter to a specific tileset ID (exact match)"),
      nameFilter: z.string().optional().describe("Substring filter applied to tile vaultPath (case-insensitive)"),
      limit: z.number().int().min(1).max(1000).default(100).describe("Max tile entries to return in total across all tilesets (default 100)"),
    },
    async ({ tilesetId, nameFilter, limit }) => {
      // Build the filtering/capping logic entirely inside the eval so we never
      // ship thousands of tile entries over MCP.
      const body =
        `var raw=ops.listTiles();` +
        `var tilesetFilter=${tilesetId !== undefined ? jsStr(tilesetId) : "null"};` +
        `var nameFilter=${nameFilter !== undefined ? jsStr(nameFilter.toLowerCase()) : "null"};` +
        `var cap=${limit};` +
        `var total=0;` +
        `var out=[];` +
        `for(var i=0;i<raw.length;i++){` +
          `var ts=raw[i];` +
          `if(tilesetFilter!==null && ts.tilesetId!==tilesetFilter) continue;` +
          `var tiles=ts.tiles;` +
          `if(nameFilter!==null){ tiles=tiles.filter(function(t){return t.vaultPath.toLowerCase().indexOf(nameFilter)!==-1;}); }` +
          `var tileCount=tiles.length;` +
          `var remaining=cap-total;` +
          `var sliced=tiles.slice(0,remaining);` +
          `total+=sliced.length;` +
          `out.push({tilesetId:ts.tilesetId,tilesetName:ts.tilesetName,tileCount:tileCount,tiles:sliced,truncated:sliced.length<tileCount});` +
          `if(total>=cap) break;` +
        `}` +
        `return JSON.stringify({tilesets:out,totalTilesReturned:total,limitApplied:cap});`;
      const result = await obsidianEvalJson<{
        tilesets: Array<{ tilesetId: string; tilesetName: string; tileCount: number; tiles: Array<{ id: string; vaultPath: string }>; truncated: boolean }>;
        totalTilesReturned: number;
        limitApplied: number;
        error?: string;
      }>(opCall(body));
      if (result.error) {
        return { content: [{ type: "text" as const, text: result.error }], isError: true };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── windrose_select_tile ───────────────────────────────────────────────────

  server.tool(
    "windrose_select_tile",
    "Select a tile and arm the tile-paint tool (equivalent to clicking a tile in the tile drawer). " +
    "Use windrose_list_tiles to discover valid tilesetId / tileId values. " +
    "The response note may warn about availability; availableTilesetIds is returned on failure. " +
    "Precondition: a map must be mounted — use windrose_open_map / windrose_ensure_visible first.",
    {
      tilesetId: z.string().describe("Tileset ID (from windrose_list_tiles)"),
      tileId: z.string().describe("Tile ID within the tileset (from windrose_list_tiles)"),
    },
    async ({ tilesetId, tileId }) => {
      const body =
        `var r=ops.selectTile(${jsStr(tilesetId)},${jsStr(tileId)});` +
        `return JSON.stringify(r);`;
      const result = await obsidianEvalJson<{ ok: boolean; note?: string; availableTilesetIds?: string[]; error?: string }>(opCall(body));
      if (result.error) {
        return { content: [{ type: "text" as const, text: result.error }], isError: true };
      }
      if (!result.ok) {
        const msg = [
          `selectTile failed.`,
          result.note ? `Note: ${result.note}` : "",
          result.availableTilesetIds ? `Available tileset IDs: ${result.availableTilesetIds.join(", ")}` : "",
        ].filter(Boolean).join(" ");
        return { content: [{ type: "text" as const, text: msg }], isError: true };
      }
      const parts = [`Tile selected: ${tilesetId} / ${tileId}`];
      if (result.note) parts.push(`Note: ${result.note}`);
      return { content: [{ type: "text" as const, text: parts.join(" — ") }] };
    }
  );

  // ─── windrose_place_tile ────────────────────────────────────────────────────

  server.tool(
    "windrose_place_tile",
    "Place a tile at a grid/hex cell, removing any existing same-tier tiles at that cell. " +
    "col/row are integer grid coordinates (not world/pixel coordinates). " +
    "Rotation must be one of 0, 90, 180, or 270 degrees. " +
    "Depth is the depth tier string (e.g. 'floor', 'wall'). " +
    "Scale 0.1–4 defaults to 1.0. " +
    "Supports undo via windrose_undo. " +
    "Precondition: a map must be mounted — use windrose_open_map / windrose_ensure_visible first.",
    {
      col: z.number().int().describe("Grid column (integer)"),
      row: z.number().int().describe("Grid row (integer)"),
      tilesetId: z.string().describe("Tileset ID (from windrose_list_tiles)"),
      tileId: z.string().describe("Tile ID within the tileset (from windrose_list_tiles)"),
      rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional().describe("Rotation in degrees: 0, 90, 180, or 270 (default: 0)"),
      depth: z.string().optional().describe("Depth tier string (e.g. 'floor', 'wall', 'object') — omit to use the tile's default depth"),
      scale: z.number().min(0.1).max(4).optional().describe("Scale factor 0.1–4 (default: 1.0)"),
    },
    async ({ col, row, tilesetId, tileId, rotation, depth, scale }) => {
      // Build the argument object JS literal inline to avoid nested JSON.stringify
      const argParts = [
        `col:${col}`,
        `row:${row}`,
        `tilesetId:${jsStr(tilesetId)}`,
        `tileId:${jsStr(tileId)}`,
      ];
      if (rotation !== undefined) argParts.push(`rotation:${rotation}`);
      if (depth !== undefined) argParts.push(`depth:${jsStr(depth)}`);
      if (scale !== undefined) argParts.push(`scale:${scale}`);
      const body =
        `var r=ops.placeTile({${argParts.join(",")}});` +
        `return JSON.stringify(r);`;
      const result = await obsidianEvalJson<{ ok: boolean; tileCount: number; error?: string }>(opCall(body));
      if (result.error) {
        return { content: [{ type: "text" as const, text: result.error }], isError: true };
      }
      if (!result.ok) {
        return { content: [{ type: "text" as const, text: `placeTile failed: ${result.error ?? "unknown error"}` }], isError: true };
      }
      return { content: [{ type: "text" as const, text: `Tile placed at (${col}, ${row}) — total tile count: ${result.tileCount}` }] };
    }
  );

  // ─── windrose_list_objects ──────────────────────────────────────────────────

  server.tool(
    "windrose_list_objects",
    "When types=true (default false): return the placeable object type catalog for the active map " +
    "(resolved from the map's type + object set — IDs vary by map configuration). " +
    "When types=false: return placed objects on the active layer (id, type, x, y, label). " +
    "Precondition: a map must be mounted — use windrose_open_map / windrose_ensure_visible first.",
    {
      types: z.boolean().default(false).describe("true → list placeable object types (catalog); false → list placed objects on the active layer"),
    },
    async ({ types }) => {
      const body = types
        ? `var r=ops.listObjectTypes();return JSON.stringify({catalog:r,count:r.length});`
        : `var r=ops.listObjects();return JSON.stringify({objects:r,count:r.length});`;
      const result = await obsidianEvalJson<{
        catalog?: Array<{ id: string; label: string; category: string }>;
        objects?: Array<{ id: string; type: string; x: number; y: number; label?: string }>;
        count: number;
        error?: string;
      }>(opCall(body));
      if (result.error) {
        return { content: [{ type: "text" as const, text: result.error }], isError: true };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ─── windrose_place_object ──────────────────────────────────────────────────

  server.tool(
    "windrose_place_object",
    "Place an object on the active layer at world coordinates (x, y). " +
    "Use windrose_list_objects with types=true to discover valid typeId values — " +
    "available types depend on the map's configuration (map type + object set). " +
    "Returns the new object's id on success. Supports undo via windrose_undo. " +
    "Precondition: a map must be mounted — use windrose_open_map / windrose_ensure_visible first.",
    {
      typeId: z.string().describe("Object type ID (from windrose_list_objects with types=true)"),
      x: z.number().describe("World X coordinate"),
      y: z.number().describe("World Y coordinate"),
    },
    async ({ typeId, x, y }) => {
      const body =
        `var r=ops.placeObject(${jsStr(typeId)},${x},${y});` +
        `return JSON.stringify(r);`;
      const result = await obsidianEvalJson<{ ok: boolean; objectId?: string; error?: string }>(opCall(body));
      if (result.error) {
        return { content: [{ type: "text" as const, text: result.error }], isError: true };
      }
      if (!result.ok) {
        return { content: [{ type: "text" as const, text: `placeObject failed: ${result.error ?? "unknown error"}` }], isError: true };
      }
      const msg = result.objectId
        ? `Object placed — id: ${result.objectId}`
        : `Object placed (no id returned)`;
      return { content: [{ type: "text" as const, text: msg }] };
    }
  );

  // ─── windrose_open_drawer ───────────────────────────────────────────────────

  server.tool(
    "windrose_open_drawer",
    "Open a drawer pane or edge-rail flyout, or close the rail. " +
    "Valid panes: 'tiles', 'objects', 'layers', 'colors', 'regions', 'view'. " +
    "Use 'close' to close the currently open drawer (calls ops.openDrawer(null)). " +
    "Caveat: the edge-rail is only available in block-mode maps; in a full-pane ItemView " +
    "ops.openDrawer returns ok:false with a note explaining the limitation. " +
    "Precondition: a map must be mounted — use windrose_open_map / windrose_ensure_visible first.",
    {
      pane: z.enum(["tiles", "objects", "layers", "colors", "regions", "view", "close"]).describe(
        "Drawer pane to open, or 'close' to close the rail"
      ),
    },
    async ({ pane }) => {
      const paneArg = pane === "close" ? "null" : jsStr(pane);
      const body =
        `var r=ops.openDrawer(${paneArg});` +
        `return JSON.stringify(r);`;
      const result = await obsidianEvalJson<{ ok: boolean; note?: string; error?: string }>(opCall(body));
      if (result.error) {
        return { content: [{ type: "text" as const, text: result.error }], isError: true };
      }
      const parts: string[] = [result.ok ? `Drawer opened: ${pane}` : `openDrawer returned ok:false for pane '${pane}'`];
      if (result.note) parts.push(`Note: ${result.note}`);
      // ok:false on full-pane is expected and not a hard error — return as plain text
      return { content: [{ type: "text" as const, text: parts.join(" — ") }] };
    }
  );
}

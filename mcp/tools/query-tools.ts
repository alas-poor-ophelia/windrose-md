/**
 * Query tools — read-only state inspection for Windrose.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  obsidianErrors,
  obsidianEval,
  obsidianEvalJson,
  obsidianVersion,
  wrapAsync,
  EVAL_NO_OUTPUT,
} from "../cli-bridge.js";
import { RESOLVE_JS, RESOLVE_KEY_JS } from "./ops-helper.js";

/** Max bytes returned for full map data reads */
const MAP_DATA_MAX_BYTES = 100_000;

export function registerQueryTools(server: McpServer): void {
  // ─── windrose_ping ──────────────────────────────────────────────────────────
  server.tool(
    "windrose_ping",
    "Check Obsidian connectivity and Windrose bridge status. Returns Obsidian version, plugin readiness, instance keys, resolved active instance key, and window focus state.",
    async () => {
      try {
        const version = await obsidianVersion();
        const code = wrapAsync(
          `const mi = window.__windrose?.mcpInstances || {};` +
          `const instKeys = Object.keys(mi);` +
          `const resolvedKey = ${RESOLVE_KEY_JS};` +
          `return JSON.stringify({` +
          `  ready: window.__windrose?.ready === true,` +
          `  windroseVersion: window.__windrose?.version || null,` +
          `  instanceKeys: instKeys,` +
          `  resolvedActiveKey: resolvedKey,` +
          `  windowFocused: document.hasFocus(),` +
          `});`
        );
        const bridge = await obsidianEvalJson<{
          ready: boolean;
          windroseVersion: string | null;
          instanceKeys: string[];
          resolvedActiveKey: string | null;
          windowFocused: boolean;
        }>(code);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  obsidian: version,
                  ...bridge,
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

  // ─── windrose_get_errors ────────────────────────────────────────────────────
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

  // ─── windrose_get_state ─────────────────────────────────────────────────────
  server.tool(
    "windrose_get_state",
    "Get current Windrose app state: active map, zoom, tool, layer, colors, undo/redo availability. Uses smart instance resolution (active file → ItemView leaf → sole instance). On failure, returns instance keys and a hint.",
    async () => {
      const code = wrapAsync(
        `const mi = window.__windrose?.mcpInstances;` +
        `if (!mi) return JSON.stringify({ error: 'MCP bridge not initialized', instanceKeys: [], hint: 'Reload the plugin or open a map with windrose_open_map.' });` +
        `const inst = ${RESOLVE_JS};` +
        `if (!inst) {` +
        `  const ks = Object.keys(mi);` +
        `  return JSON.stringify({ error: 'No active map resolved', instanceKeys: ks, hint: ks.length === 0 ? 'Open a map with windrose_open_map, or focus the map tab.' : 'Multiple instances (' + ks.join(', ') + ') — focus a map tab.' });` +
        `}` +
        // Also include live dataFilePath from plugin object
        `const dp = (function(){ try { return app.plugins.plugins['windrose-md']?.dataFilePath || null; } catch(e) { return null; } })();` +
        `const wf = document.hasFocus();` +
        `return JSON.stringify({ ...inst, dataFilePath: dp, windowFocused: wf });`
      );
      try {
        const result = await obsidianEvalJson<Record<string, unknown>>(code);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text" as const, text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // ─── windrose_read_map_data ─────────────────────────────────────────────────
  server.tool(
    "windrose_read_map_data",
    "Read map data from the vault data file for a specific mapId. Resolves the data file path from the live plugin object (reliable) rather than instance snapshot. When summary=true, returns compact counts instead of full JSON.",
    {
      mapId: z.string().describe("The map ID to read data for"),
      summary: z
        .boolean()
        .optional()
        .describe(
          "When true, return only {name, mapType, orientation, layerCount, per-layer counts, wallPathCount} instead of full JSON. Default false."
        ),
    },
    async ({ mapId, summary }) => {
      const mid = JSON.stringify(mapId);
      const code = wrapAsync(
        // Resolve data file path: plugin object → instance → fallback
        `const dp = (function(){` +
        `  try { const p = app.plugins.plugins['windrose-md']?.dataFilePath; if (p) return p; } catch(e) {}` +
        `  const mi = window.__windrose?.mcpInstances;` +
        `  if (mi) { for (const v of Object.values(mi)) { if (v.dataFilePath) return v.dataFilePath; } }` +
        `  return 'windrose-md-data.json';` +
        `})();` +
        `const f = app.vault.getAbstractFileByPath(dp);` +
        `if (!f) return JSON.stringify({ error: 'Data file not found', dataFilePath: dp });` +
        `let raw;` +
        `try { raw = await app.vault.read(f); } catch(e) { return JSON.stringify({ error: 'Failed to read data file: ' + e.message }); }` +
        `let data;` +
        `try { data = JSON.parse(raw); } catch(e) { return JSON.stringify({ error: 'Data file parse error: ' + e.message, byteLen: raw.length }); }` +
        `const m = data.maps?.[${mid}];` +
        `if (!m) return JSON.stringify({ error: 'Map not found: ' + ${mid}, availableIds: Object.keys(data.maps || {}).slice(0, 20) });` +
        (summary
          ? // Summary mode: extract compact metadata
            `const layers = m.layers || [];` +
            `const layerSummaries = layers.map(l => ({` +
            `  id: l.id, name: l.name, type: l.type,` +
            `  cellCount: Object.keys(l.cells || {}).length,` +
            `  tileCount: (l.tiles || []).length,` +
            `  objectCount: (l.objects || []).length,` +
            `  curveCount: (l.curves || []).length,` +
            `}));` +
            `return JSON.stringify({` +
            `  id: m.id, name: m.name, mapType: m.mapType, orientation: m.orientation,` +
            `  layerCount: layers.length, layers: layerSummaries,` +
            `  wallPathCount: (m.wallPaths || []).length,` +
            `  dataFilePath: dp,` +
            `});`
          : // Full mode: return raw map data, capped at MAX_BYTES
            `const s = JSON.stringify(m);` +
            `const cap = ${MAP_DATA_MAX_BYTES};` +
            `if (s.length > cap) return JSON.stringify({ truncated: true, byteLen: s.length, cap, data: s.slice(0, cap) });` +
            `return s;`)
      );
      try {
        const raw = await obsidianEval(code);
        if (raw === EVAL_NO_OUTPUT) {
          return {
            content: [{ type: "text" as const, text: "Error: eval returned no output (missing return in async body)" }],
            isError: true,
          };
        }
        let result: any;
        try { result = JSON.parse(raw); } catch {
          return { content: [{ type: "text" as const, text: `Unparseable result: ${raw.slice(0, 200)}` }], isError: true };
        }
        if (result && "error" in result) {
          return {
            content: [{ type: "text" as const, text: `Error: ${JSON.stringify(result, null, 2)}` }],
            isError: true,
          };
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text" as const, text: `Eval error: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  // ─── windrose_list_maps ─────────────────────────────────────────────────────
  server.tool(
    "windrose_list_maps",
    "List all maps in the vault data file with metadata and which are currently mounted. Optional scanNotes scans markdown files for windrose-map code blocks (expensive, capped at 50 hits).",
    {
      scanNotes: z
        .boolean()
        .optional()
        .describe(
          "When true, scan markdown notes for 'windrose-map' code blocks and report their paths and embedded map IDs. Expensive (reads many files). Default false."
        ),
    },
    async ({ scanNotes }) => {
      const code = wrapAsync(
        `const dp = (function(){` +
        `  try { const p = app.plugins.plugins['windrose-md']?.dataFilePath; if (p) return p; } catch(e) {}` +
        `  const mi = window.__windrose?.mcpInstances;` +
        `  if (mi) { for (const v of Object.values(mi)) { if (v.dataFilePath) return v.dataFilePath; } }` +
        `  return 'windrose-md-data.json';` +
        `})();` +
        `const f = app.vault.getAbstractFileByPath(dp);` +
        `if (!f) return JSON.stringify({ error: 'Data file not found', dataFilePath: dp });` +
        `let raw;` +
        `try { raw = await app.vault.read(f); } catch(e) { return JSON.stringify({ error: e.message }); }` +
        `let data;` +
        `try { data = JSON.parse(raw); } catch(e) { return JSON.stringify({ error: 'Parse error: ' + e.message }); }` +
        `const mi = window.__windrose?.mcpInstances || {};` +
        `const mountedKeys = Object.keys(mi);` +
        `const maps = Object.values(data.maps || {}).map(m => {` +
        `  const layers = m.layers || [];` +
        `  const mountKey = mountedKeys.find(k => k === m.notePath || k === '__view__:' + m.id) || null;` +
        `  return {` +
        `    id: m.id, name: m.name, mapType: m.mapType, orientation: m.orientation,` +
        `    layerCount: layers.length,` +
        `    totalCells: layers.reduce((s, l) => s + Object.keys(l.cells||{}).length, 0),` +
        `    totalTiles: layers.reduce((s, l) => s + (l.tiles||[]).length, 0),` +
        `    totalObjects: layers.reduce((s, l) => s + (l.objects||[]).length, 0),` +
        `    wallPathCount: (m.wallPaths||[]).length,` +
        `    notePath: m.notePath || null,` +
        `    mountedInstanceKey: mountKey,` +
        `  };` +
        `});` +
        // Optional scanNotes: search markdown files for windrose-map code blocks
        (scanNotes
          ? `const notes = [];` +
            `if (${JSON.stringify(scanNotes)}) {` +
            `  const mdFiles = app.vault.getMarkdownFiles();` +
            `  let hits = 0;` +
            `  for (const mf of mdFiles) {` +
            `    if (hits >= 50) break;` +
            `    try {` +
            `      const c = await app.vault.cachedRead(mf);` +
            `      const rx = /\`\`\`windrose-map[\\s\\S]*?\`\`\`/g;` +
            `      const blocks = c.match(rx);` +
            `      if (blocks) {` +
            `        for (const blk of blocks) {` +
            `          const idm = blk.match(/^\\s*id:\\s*(\\S+)/m);` +
            `          notes.push({ notePath: mf.path, blockId: idm ? idm[1] : null });` +
            `          hits++;` +
            `          if (hits >= 50) break;` +
            `        }` +
            `      }` +
            `    } catch(e) {}` +
            `  }` +
            `}` +
            `return JSON.stringify({ dataFilePath: dp, mapCount: maps.length, maps, noteBlocks: notes, notesScanned: ${JSON.stringify(!!scanNotes)} });`
          : `return JSON.stringify({ dataFilePath: dp, mapCount: maps.length, maps, notesScanned: false });`)
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
        if (result?.error) {
          return { content: [{ type: "text" as const, text: `Error: ${result.error}` }], isError: true };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Eval error: ${err.message}` }], isError: true };
      }
    }
  );

  // ─── windrose_check_data ────────────────────────────────────────────────────
  server.tool(
    "windrose_check_data",
    "Read and parse the Windrose data file. Returns {ok, byteLen, mapCount, truncated, error?}. The 'truncated' flag is true when the file fails to parse AND byteLen is suspiciously round (power of two — indicates a write was cut at an OS buffer boundary).",
    async () => {
      const code = wrapAsync(
        `const dp = (function(){` +
        `  try { const p = app.plugins.plugins['windrose-md']?.dataFilePath; if (p) return p; } catch(e) {}` +
        `  const mi = window.__windrose?.mcpInstances;` +
        `  if (mi) { for (const v of Object.values(mi)) { if (v.dataFilePath) return v.dataFilePath; } }` +
        `  return 'windrose-md-data.json';` +
        `})();` +
        `const f = app.vault.getAbstractFileByPath(dp);` +
        `if (!f) return JSON.stringify({ ok: false, error: 'Data file not found', dataFilePath: dp, byteLen: 0, mapCount: 0, truncated: false });` +
        `let raw;` +
        `try { raw = await app.vault.read(f); } catch(e) { return JSON.stringify({ ok: false, error: e.message, dataFilePath: dp, byteLen: 0, mapCount: 0, truncated: false }); }` +
        `const byteLen = new Blob([raw]).size;` +
        `let data, parseError = null;` +
        `try { data = JSON.parse(raw); } catch(e) { parseError = e.message; }` +
        `const isPowerOfTwo = byteLen > 0 && (byteLen & (byteLen - 1)) === 0;` +
        `const truncated = parseError !== null && (isPowerOfTwo || byteLen % 512 === 0);` +
        `if (parseError !== null) return JSON.stringify({ ok: false, error: parseError, dataFilePath: dp, byteLen, mapCount: 0, truncated });` +
        `return JSON.stringify({ ok: true, dataFilePath: dp, byteLen, mapCount: Object.keys(data.maps || {}).length, truncated: false });`
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
}

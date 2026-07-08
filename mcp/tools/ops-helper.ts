/**
 * Shared helpers for MCP tool modules that call Windrose ops bridge.
 *
 * Instance resolution order (RESOLVE / RESOLVE_JSON):
 *   1. Active file path is a key in mcpInstances   (block-mode maps)
 *   2. Active leaf is windrose-map-view ItemView → key '__view__:' + mapId
 *      (full-pane maps; registered under this key since the parallel src fix —
 *       defensive: key may be absent on builds prior to that deploy)
 *   3. Exactly one instance registered → use it unconditionally
 *
 * On failure, error payloads include instance keys + a hint.
 */

import { wrapAsync } from "../cli-bridge.js";

// ---------------------------------------------------------------------------
// Instance resolution — JS snippet (evaluated in Obsidian window context)
// ---------------------------------------------------------------------------

/**
 * RESOLVE_JS: inline JS expression that returns the resolved instance or null.
 * Evaluates to the mcpInstances entry object (with .ops, .saveStatus, etc.)
 * or null if no map can be resolved.
 *
 * Usage in multi-statement eval bodies:
 *   `const inst = ${RESOLVE_JS}; if (!inst) return JSON.stringify({error:...});`
 */
export const RESOLVE_JS =
  `(function(){` +
    `const mi = window.__windrose?.mcpInstances;` +
    `if (!mi) return null;` +
    // 1. Active file path key
    `const p = app.workspace.getActiveFile()?.path;` +
    `if (p && mi[p]) return mi[p];` +
    // 2. Active leaf is a full-pane windrose-map-view
    `const vl = app.workspace.getLeavesOfType('windrose-map-view');` +
    `if (vl.length > 0) { const k = '__view__:' + (vl[0].view.getState()?.mapId||''); if (mi[k]) return mi[k]; }` +
    // 3. Exactly one instance → use it
    `const ks = Object.keys(mi);` +
    `if (ks.length === 1) return mi[ks[0]];` +
    `return null;` +
  `})()`
;

/**
 * RESOLVE_KEY_JS: same resolution but returns the instance KEY (string) or null.
 * Useful when you need to report which key was resolved.
 */
export const RESOLVE_KEY_JS =
  `(function(){` +
    `const mi = window.__windrose?.mcpInstances;` +
    `if (!mi) return null;` +
    `const p = app.workspace.getActiveFile()?.path;` +
    `if (p && mi[p]) return p;` +
    `const vl = app.workspace.getLeavesOfType('windrose-map-view');` +
    `if (vl.length > 0) { const k = '__view__:' + (vl[0].view.getState()?.mapId||''); if (mi[k]) return k; }` +
    `const ks = Object.keys(mi);` +
    `if (ks.length === 1) return ks[0];` +
    `return null;` +
  `})()`
;

/**
 * RESOLVE_JSON: a complete wrapAsync eval body that resolves the active instance
 * and returns it as JSON, or returns an error object with instance keys + hint.
 *
 * Returns: JSON string of instance snapshot or {error, instanceKeys, hint}
 */
export const RESOLVE_JSON = wrapAsync(
  `const mi = window.__windrose?.mcpInstances;` +
  `if (!mi) return JSON.stringify({ error: 'MCP bridge not initialized', instanceKeys: [], hint: 'Reload the plugin or open a map with windrose_open_map.' });` +
  `const inst = ${RESOLVE_JS};` +
  `if (!inst) { const ks = Object.keys(mi); return JSON.stringify({ error: 'No active map resolved', instanceKeys: ks, hint: ks.length === 0 ? 'Open a map with windrose_open_map, or focus the map tab.' : 'Multiple instances found: ' + ks.join(', ') + ' — focus a map tab to select one.' }); }` +
  `return JSON.stringify(inst);`
);

// ---------------------------------------------------------------------------
// Ops accessor — shorthand for calling ops methods
// ---------------------------------------------------------------------------

/**
 * OPS: JS expression that resolves to the active instance's .ops object, or null.
 * Used in opCall() below.
 */
export const OPS = `(${RESOLVE_JS})?.ops ?? null`;

/**
 * Wrap a JS function body in the ops accessor boilerplate.
 * On no-map: returns JSON error with instance keys and a hint.
 * The fnBody receives `ops` as a variable.
 */
export function opCall(fnBody: string): string {
  return wrapAsync(
    `const mi = window.__windrose?.mcpInstances;` +
    `const ops = (${RESOLVE_JS})?.ops ?? null;` +
    `if (!ops) {` +
      `const ks = mi ? Object.keys(mi) : [];` +
      `return JSON.stringify({ error: 'No active map', instanceKeys: ks, hint: ks.length === 0 ? 'Open a map with windrose_open_map.' : 'Focus a map tab to select one of: ' + ks.join(', ') });` +
    `}` +
    fnBody
  );
}

/** Safely embed a string value into generated JS code via JSON.stringify */
export function jsStr(value: string): string {
  return JSON.stringify(value);
}

/**
 * Shared helpers for MCP tool modules that call Windrose ops bridge.
 */

/** JS expression that resolves to the active MCP instance ops accessor */
export const OPS = `(function(){var i=window.__windrose?.mcpInstances;if(!i)return null;var p=app.workspace.getActiveFile()?.path;return p&&i[p]?i[p].ops:null})()`;

/** Wrap a JS function body in the ops accessor boilerplate */
export function opCall(fnBody: string): string {
  return `var ops=${OPS};if(!ops){JSON.stringify({error:'No active map'})}else{${fnBody}}`;
}

/** Safely embed a string value into generated JS code via JSON.stringify */
export function jsStr(value: string): string {
  return JSON.stringify(value);
}

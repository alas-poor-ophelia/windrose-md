/**
 * Vision tools — canvas inspection, layout probing, window focus management.
 *
 * These tools provide structured "eyes" for agents working on Windrose maps.
 * They eliminate the most common eval-groping pattern: finding the right canvas
 * and verifying that something actually rendered.
 *
 * DOM notes (empirically verified):
 * - Multiple .windrose-container elements coexist (CM6 zero-height shadow copies,
 *   hidden leaves). Always pick the visible one: offsetParent != null AND width > 50.
 * - The render canvas is the LARGEST visible canvas inside the container whose
 *   className does NOT include 'select'. '.windrose-canvas' class does NOT exist.
 * - SVGElement.className is an SVGAnimatedString object, not a string.
 *   Guard with `typeof el.className === 'string'` when walking mixed trees.
 * - Electron window focus: try require('electron') first, then window.require('electron').
 *   getCurrentWindow() exists on both paths in recent Obsidian builds.
 */

import { z } from "zod";
import * as path from "node:path";
import * as fs from "node:fs";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  obsidianEval,
  obsidianEvalJson,
  obsidianScreenshot,
  wrapAsync,
  EVAL_NO_OUTPUT,
} from "../cli-bridge.js";
import { RESOLVE_JS } from "./ops-helper.js";

const SCREENSHOT_DIR = path.resolve(
  import.meta.dirname || ".",
  "..",
  "screenshots"
);

// ---------------------------------------------------------------------------
// Shared JS snippets
// ---------------------------------------------------------------------------

/**
 * JS expression that resolves to the visible .windrose-container element, or null.
 * Prefers the full-pane ItemView scope (.windrose-full-pane) when present.
 */
const VISIBLE_CONTAINER_JS =
  `(function(){` +
  // Prefer scoping under full-pane wrapper first
  `const fp = document.querySelector('.windrose-full-pane');` +
  `const root = fp || document;` +
  `const all = [...root.querySelectorAll('.windrose-container')];` +
  `return all.find(c => {` +
  `  const r = c.getBoundingClientRect();` +
  `  return r.width > 50 && c.offsetParent != null;` +
  `}) || null;` +
  `})()`;

/**
 * JS expression that resolves to the visible render canvas within the visible container,
 * or null.
 *
 * Canvas identity: Windrose renders two canvases inside the container:
 *   1. The main render canvas — `position: static`. May have class `windrose-canvas-select`
 *      when the select tool is active (that class marks tool-mode on the RENDER canvas,
 *      not a separate overlay).
 *   2. A transparent event-target overlay — `position: absolute`, no class, no pixels.
 *
 * Selection rule: prefer the canvas with `position !== 'absolute'` (the render canvas).
 * Fall back to largest by pixel area if positions are ambiguous.
 */
const RENDER_CANVAS_JS =
  `(function(){` +
  `const container = ${VISIBLE_CONTAINER_JS};` +
  `if (!container) return null;` +
  `const canvases = [...container.querySelectorAll('canvas')];` +
  `const visible = canvases.filter(c => c.offsetParent != null);` +
  `if (visible.length === 0) return null;` +
  // Prefer non-absolutely-positioned canvas (the render layer)
  `const staticCanvases = visible.filter(c => window.getComputedStyle(c).position !== 'absolute');` +
  `const pool = staticCanvases.length > 0 ? staticCanvases : visible;` +
  // Among candidates, pick largest by pixel area
  `return pool.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));` +
  `})()`;

// Counter for auto-named canvas dumps
let canvasDumpCounter = 0;

// ---------------------------------------------------------------------------
// registerVisionTools
// ---------------------------------------------------------------------------

export function registerVisionTools(server: McpServer): void {
  // ─── windrose_ensure_visible ────────────────────────────────────────────────
  server.tool(
    "windrose_ensure_visible",
    "Focus and restore the Obsidian/Electron window; reveal the active Windrose leaf; verify a visible container exists. Call this before any canvas or layout tool when the window may be unfocused or minimized (an unfocused window starves RAF/ResizeObserver — lists measure 0, canvas is blank). Returns {windowFocused, leafType, containerFound, containerRect}.",
    async () => {
      const code = wrapAsync(
        // Step 1: focus the Electron window
        `let windowFocused = false;` +
        `try {` +
        `  const electron = (function(){` +
        `    try { return require('electron'); } catch(e) {}` +
        `    try { return window.require('electron'); } catch(e) {}` +
        `    return null;` +
        `  })();` +
        `  const ew = electron?.remote?.getCurrentWindow?.() || electron?.getCurrentWindow?.();` +
        `  if (ew) {` +
        `    if (ew.isMinimized()) ew.restore();` +
        `    ew.show();` +
        `    ew.focus();` +
        `    windowFocused = true;` +
        `  }` +
        `} catch(e) {}` +
        // Step 2: find and reveal the active windrose leaf
        `let leafType = null;` +
        `try {` +
        `  const vl = app.workspace.getLeavesOfType('windrose-map-view');` +
        `  if (vl.length > 0) {` +
        `    app.workspace.revealLeaf(vl[0]);` +
        `    leafType = 'windrose-map-view';` +
        `  } else {` +
        // Fall back: find a markdown leaf with a windrose block and ensure live-preview
        `    const ml = app.workspace.getLeavesOfType('markdown');` +
        `    for (const leaf of ml) {` +
        `      const st = leaf.getViewState();` +
        `      if (st.state?.mode === 'source' && st.state?.source === false) {` +
        `        app.workspace.revealLeaf(leaf);` +
        `        leafType = 'markdown-live-preview';` +
        `        break;` +
        `      }` +
        `    }` +
        `  }` +
        `} catch(e) {}` +
        // Step 3: wait 300ms for RAF to settle
        `await new Promise(r => setTimeout(r, 300));` +
        // Step 4: probe for visible container
        `const container = ${VISIBLE_CONTAINER_JS};` +
        `let containerFound = !!container;` +
        `let containerRect = null;` +
        `if (container) {` +
        `  const r = container.getBoundingClientRect();` +
        `  containerRect = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };` +
        `}` +
        `return JSON.stringify({ windowFocused, leafType, containerFound, containerRect });`
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

  // ─── windrose_canvas_dump ───────────────────────────────────────────────────
  server.tool(
    "windrose_canvas_dump",
    "Export the visible Windrose render canvas to a PNG file in mcp/screenshots/. Optional region clips to canvas-pixel coordinates (x,y,w,h). Returns {ok, path, canvasSize:{w,h}, renderedSize:{w,h}, region?}. Returns a detailed error if no visible canvas is found (includes how many canvases exist and their sizes). This is the reliable canvas capture — use instead of windrose_screenshot when you need to inspect actual map pixels.",
    {
      filename: z
        .string()
        .optional()
        .describe("Output filename (default: canvas-dump-N.png). No path separators."),
      region: z
        .object({
          x: z.number().describe("Left edge in canvas pixels"),
          y: z.number().describe("Top edge in canvas pixels"),
          w: z.number().describe("Width in canvas pixels"),
          h: z.number().describe("Height in canvas pixels"),
        })
        .optional()
        .describe("Optional crop region in canvas-pixel coordinates."),
    },
    async ({ filename, region }) => {
      // Sanitize filename
      const counter = ++canvasDumpCounter;
      let safeName = filename || `canvas-dump-${counter}.png`;
      safeName = path.basename(safeName); // strip any path separators
      if (!safeName.endsWith(".png")) safeName += ".png";

      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
      const outputPath = path.resolve(SCREENSHOT_DIR, safeName).replace(/\\/g, "/");

      // Build the eval code
      const regionJson = region ? JSON.stringify(region) : "null";
      const outputPathJson = JSON.stringify(outputPath);

      const code = wrapAsync(
        // Locate render canvas
        `const allCanvases = [...document.querySelectorAll('canvas')];` +
        `const canvasSizes = allCanvases.map(c => ({ w: c.width, h: c.height, class: typeof c.className === 'string' ? c.className : '' }));` +
        `const canvas = ${RENDER_CANVAS_JS};` +
        `if (!canvas) {` +
        `  return JSON.stringify({ ok: false, error: 'No visible render canvas found', canvasCount: allCanvases.length, canvasSizes });` +
        `}` +
        `const canvasSize = { w: canvas.width, h: canvas.height };` +
        `const cssRect = canvas.getBoundingClientRect();` +
        `const renderedSize = { w: Math.round(cssRect.width), h: Math.round(cssRect.height) };` +
        // Determine source region
        `const region = ${regionJson};` +
        `let dataUrl;` +
        `if (region) {` +
        `  const tmp = document.createElement('canvas');` +
        `  tmp.width = region.w;` +
        `  tmp.height = region.h;` +
        `  const ctx = tmp.getContext('2d');` +
        `  ctx.drawImage(canvas, region.x, region.y, region.w, region.h, 0, 0, region.w, region.h);` +
        `  dataUrl = tmp.toDataURL('image/png');` +
        `} else {` +
        `  dataUrl = canvas.toDataURL('image/png');` +
        `}` +
        // Write to disk via Node require('fs') — works in renderer process
        `const fs = require('fs');` +
        `const base64 = dataUrl.split(',')[1];` +
        `const buf = Buffer.from(base64, 'base64');` +
        `fs.writeFileSync(${outputPathJson}, buf);` +
        `return JSON.stringify({ ok: true, path: ${outputPathJson}, canvasSize, renderedSize, region: region || null });`
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
        if (!result.ok) {
          return {
            content: [{ type: "text" as const, text: `Canvas dump failed: ${JSON.stringify(result, null, 2)}` }],
            isError: true,
          };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Eval error: ${err.message}` }], isError: true };
      }
    }
  );

  // ─── windrose_inspect_layout ────────────────────────────────────────────────
  server.tool(
    "windrose_inspect_layout",
    "For each CSS selector, return rect, computed style subset, and scroll dimensions — scoped to the visible Windrose container by default. Use this to diagnose layout issues: clipping, overflow, hidden elements, z-index stacking. SVG-safe (className guarded). Returns an array of per-selector results.",
    {
      selectors: z
        .array(z.string())
        .max(20)
        .describe("CSS selectors to inspect (up to 20). Queried within the visible container unless scope=document."),
      scope: z
        .enum(["container", "document"])
        .optional()
        .describe("Query scope: 'container' (default) — visible .windrose-container; 'document' — full document."),
    },
    async ({ selectors, scope }) => {
      const selectorsJson = JSON.stringify(selectors);
      const useDocument = scope === "document";

      const code = wrapAsync(
        `const selectors = ${selectorsJson};` +
        `const root = (function(){` +
        `  if (${JSON.stringify(useDocument)}) return document;` +
        `  const c = ${VISIBLE_CONTAINER_JS};` +
        `  return c || document;` +
        `})();` +
        `const results = selectors.map(sel => {` +
        `  let el;` +
        `  try { el = root.querySelector(sel); } catch(e) {` +
        `    return { selector: sel, found: false, error: e.message };` +
        `  }` +
        `  if (!el) return { selector: sel, found: false };` +
        `  const r = el.getBoundingClientRect();` +
        `  const cs = window.getComputedStyle(el);` +
        `  return {` +
        `    selector: sel,` +
        `    found: true,` +
        `    visible: el.offsetParent != null,` +
        `    rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },` +
        `    style: {` +
        `      display: cs.display,` +
        `      position: cs.position,` +
        `      overflow: cs.overflow,` +
        `      overflowX: cs.overflowX,` +
        `      overflowY: cs.overflowY,` +
        `      padding: cs.padding,` +
        `      margin: cs.margin,` +
        `      width: cs.width,` +
        `      height: cs.height,` +
        `      opacity: cs.opacity,` +
        `      zIndex: cs.zIndex,` +
        `    },` +
        `    scroll: {` +
        `      scrollWidth: el.scrollWidth,` +
        `      scrollHeight: el.scrollHeight,` +
        `      clientWidth: el.clientWidth,` +
        `      clientHeight: el.clientHeight,` +
        `    },` +
        `  };` +
        `});` +
        `return JSON.stringify(results);`
      );

      try {
        const raw = await obsidianEval(code);
        if (raw === EVAL_NO_OUTPUT) {
          return { content: [{ type: "text" as const, text: "Error: eval returned no output" }], isError: true };
        }
        let result: any;
        try { result = JSON.parse(raw); } catch {
          return { content: [{ type: "text" as const, text: `Unparseable result: ${raw.slice(0, 400)}` }], isError: true };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Eval error: ${err.message}` }], isError: true };
      }
    }
  );

  // ─── windrose_canvas_sample ─────────────────────────────────────────────────
  server.tool(
    "windrose_canvas_sample",
    "Cheap pixel probe: sample the render canvas and return color statistics. Use this as a 'did anything actually render?' check before doing a full canvas dump. Returns {backingSize, renderedSize, distinctColors (capped at 256), nonTransparentPct, dominantColors: [{r,g,b,count}] top 5}.",
    {
      region: z
        .object({
          x: z.number(),
          y: z.number(),
          w: z.number(),
          h: z.number(),
        })
        .optional()
        .describe("Sub-region to sample in canvas pixels. Default: central 40% of the canvas."),
    },
    async ({ region }) => {
      const regionJson = region ? JSON.stringify(region) : "null";

      const code = wrapAsync(
        `const canvas = ${RENDER_CANVAS_JS};` +
        `if (!canvas) {` +
        `  const allC = [...document.querySelectorAll('canvas')];` +
        `  return JSON.stringify({ error: 'No visible render canvas', canvasCount: allC.length });` +
        `}` +
        `const backingSize = { w: canvas.width, h: canvas.height };` +
        `const cssRect = canvas.getBoundingClientRect();` +
        `const renderedSize = { w: Math.round(cssRect.width), h: Math.round(cssRect.height) };` +
        // Determine sample region (default: central 40%)
        `let region = ${regionJson};` +
        `if (!region) {` +
        `  const pw = Math.floor(canvas.width * 0.4);` +
        `  const ph = Math.floor(canvas.height * 0.4);` +
        `  region = { x: Math.floor((canvas.width - pw) / 2), y: Math.floor((canvas.height - ph) / 2), w: pw, h: ph };` +
        `}` +
        // Get image data
        `let imageData;` +
        `try {` +
        `  const ctx = canvas.getContext('2d');` +
        `  imageData = ctx.getImageData(region.x, region.y, region.w, region.h);` +
        `} catch(e) {` +
        `  return JSON.stringify({ error: 'getImageData failed: ' + e.message, backingSize, renderedSize });` +
        `}` +
        `const data = imageData.data;` +
        `const totalPixels = region.w * region.h;` +
        // Sample every Nth pixel to keep it fast (target ~10000 samples)
        `const sampleStep = Math.max(1, Math.floor(totalPixels / 10000));` +
        `const colorMap = {};` +
        `let nonTransparent = 0;` +
        `let distinctCount = 0;` +
        `for (let i = 0; i < data.length; i += 4 * sampleStep) {` +
        `  const a = data[i+3];` +
        `  if (a > 0) nonTransparent++;` +
        `  if (distinctCount < 256) {` +
        `    const key = (data[i] << 16) | (data[i+1] << 8) | data[i+2];` +
        `    const k = key + ',' + a;` +
        `    colorMap[k] = (colorMap[k] || 0) + 1;` +
        `    if (!(k in colorMap)) distinctCount++;` +
        `  }` +
        `}` +
        `const sampledPixels = Math.ceil(totalPixels / sampleStep);` +
        `const distinctColors = Object.keys(colorMap).length;` +
        `const nonTransparentPct = sampledPixels > 0 ? Math.round((nonTransparent / sampledPixels) * 100) : 0;` +
        // Dominant colors: sort by count, take top 5
        `const sorted = Object.entries(colorMap).sort((a,b) => b[1] - a[1]).slice(0, 5);` +
        `const dominantColors = sorted.map(([k, count]) => {` +
        `  const parts = k.split(',');` +
        `  const rgb = parseInt(parts[0]);` +
        `  return { r: (rgb >> 16) & 255, g: (rgb >> 8) & 255, b: rgb & 255, a: parseInt(parts[1]), count };` +
        `});` +
        `return JSON.stringify({ backingSize, renderedSize, region, sampledPixels, distinctColors, nonTransparentPct, dominantColors });`
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
          return { content: [{ type: "text" as const, text: `Canvas sample failed: ${JSON.stringify(result, null, 2)}` }], isError: true };
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Eval error: ${err.message}` }], isError: true };
      }
    }
  );
}

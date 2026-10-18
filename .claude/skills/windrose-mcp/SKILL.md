---
name: windrose-mcp
description: How to drive the live Windrose plugin via the windrose MCP tools — find/open maps, see the canvas, place tiles/objects, verify changes. Use whenever interacting with the running Obsidian instance through mcp__windrose__* tools. Eval is the LAST resort; this skill maps every common task to its dedicated tool and documents the proven eval recipes for the rare rest.
---

# Windrose MCP: Tools First, Eval Last

The MCP has dedicated tools for every historically-thrashed task. Reaching for `windrose_eval` first is how past sessions burned thousands of tokens. Check the table; eval only for what it doesn't cover.

## Task → Tool

| Task | Tool | Notes |
|---|---|---|
| Is Obsidian/bridge up? | `windrose_ping` | `ready:true` + instance keys + resolved active key + `windowFocused` |
| What maps exist? | `windrose_list_maps` | All maps from the real data file + which are mounted. `scanNotes:true` also finds block-mode notes (slow) |
| Open a map note | `windrose_open_map` | Forces live-preview, polls until the bridge registers, returns `{mounted, instanceKey}` honestly — no sleep loops needed |
| Map not visible / window unfocused | `windrose_ensure_visible` | Focuses the Electron window (unfocused = RAF/ResizeObserver starve = empty virtualized lists), reveals the leaf |
| Current map state | `windrose_get_state` | Full snapshot: viewState, layers, counts, real `dataFilePath`, tool/color. Resolves block AND full-pane (`__view__:` keys) |
| Read a map's data | `windrose_read_map_data` | `summary:true` for counts only. Uses the plugin's real data path |
| Data file healthy? | `windrose_check_data` | Detects truncation/corruption (it has happened — 512KiB cut) |
| Pan/zoom the view | `windrose_set_viewport` | Drives the LIVE component. (`windrose_navigate` is the legacy event dispatch — may be ignored) |
| See the map canvas | `windrose_canvas_dump` | Native-res PNG of the render canvas → `mcp/screenshots/`. Read the PNG (multimodal). Optional `region` crop |
| Quick "did it render?" | `windrose_canvas_sample` | Distinct colors + non-transparent % — cheaper than dumping |
| Whole-window shot | `windrose_screenshot` | Low-res, whole window. `zoom` param magnifies (auto-resets) |
| Measure UI layout | `windrose_inspect_layout` | Rects + computed styles + scroll dims for selectors, auto-scoped to the VISIBLE container |
| Paint/erase colored cells | `windrose_paint_cell(s)`, `windrose_erase_cell` | Direct state mutation, one undo entry per call |
| Query painted cells | `windrose_get_cells` | Use `bbox`/`summary` on big maps — full dumps were once 124k chars |
| What tiles are installed? | `windrose_list_tiles` | Filter by `nameFilter` (matches vaultPath). Tile identity = `{tilesetId, tileId}` |
| Select a tile / arm tile paint | `windrose_select_tile` | Subtool defaults to single-stamp when programmatic |
| Place an image tile | `windrose_place_tile` | Imperative API — do NOT synthesize canvas clicks |
| List/place map objects | `windrose_list_objects` (`types:true` for catalog), `windrose_place_object` | Synthetic pointer events NEVER reach Preact handlers — 0/7 historical success rate; always use the tool |
| Open Tiles/Objects/Layers UI | `windrose_open_drawer` | Side effect: switches active tool. Edge-rail panes are block-mode only |
| Tool/color/layer/undo/save | `windrose_set_tool`, `windrose_set_color`, `windrose_select_layer`, `windrose_undo/redo`, `windrose_force_save` | undo/redo: `ok` = the map changed (an entry that no longer applies is dropped, the next one tried); "Nothing to undo" means nothing changed. Needs DMT's undo wrapper to pass the result through (else it falls back to the pre-step canUndo) |
| Reload after `npm run deploy` | `windrose_reload` | Flushes saves first (never raw disable/enable — a raw teardown once truncated the data file), rerenders blocks, polls ready. Pass `notePath` to reopen in one call |
| Read any vault file | `windrose_vault_read` | `search` param for context-around-match |
| Console errors | `windrose_get_errors` | |

## Session-start pattern

```
windrose_ping                 → bridge up? what's mounted?
windrose_list_maps            → pick a map (prefer scratch/test maps for mutations)
windrose_open_map / _ensure_visible
windrose_get_state            → full context, one call
```

Full-pane ItemView maps register as `__view__:<mapId>` and resolve automatically. If ping shows an instance, the tools will find it — no DOM safari needed.

## Eval rules (empirically verified 2026-07-07)

- **All Promises are auto-awaited** by the CLI runtime. `(async () => { ...; return x; })()` works, including real `await` inside.
- `(no output)` means the result was `undefined` — almost always a **missing `return`** inside your IIFE. It is NOT an unresolved promise.
- Top-level `return` and top-level `await` are **never** valid. Use `asyncWrap:true` or wrap in an async IIFE yourself.
- Newlines are collapsed to spaces: separate statements with `;`, never rely on ASI, avoid template literals with embedded newlines (build multi-line strings with `String.fromCharCode(10)` or array-join).
- Comments (`//`) are fatal after newline collapse — everything after the first `//` dies.
- Output is capped (50KB). Return compact JSON, not dumps.

## Proven eval recipes (the long tail)

**Find the visible windrose container** (multiple copies exist — CM6 shadow twins, hidden leaves):
```js
const cont = [...document.querySelectorAll('.windrose-container')].find(c => c.getBoundingClientRect().width > 50 && c.offsetParent != null);
```
Canvas note: the render canvas is the non-`position:absolute` one; `windrose-canvas-select` is a tool-mode class on the render canvas, NOT the overlay.

**Set a value on a React/Preact controlled input** (direct `.value=` is ignored):
```js
const setVal = (el, v) => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
```

**Paint a cell by synthetic events** (last verified live 2026-10-12 on lod-fixture, before the main merge; references are function names because line numbers drift). Prefer `windrose_paint_cell` / `windrose_paint_cells`; use this only to exercise the real pointer path. `windrose_set_tool` REFUSES an id outside the ToolId union (`{ok:false, error}`; table in `src/core/toolIds.ts`), so a silent wrong-id failure cannot recur. The canvas listens for plain `mousedown`/`mouseup`/`mousemove` (listeners attached in `useEventCoordinator`, handler `handleMouseDown`), NOT pointer events, so pointerdown/pointerup recipes do nothing. No `isTrusted`, `pointerId`, `buttons` or `detail` check exists on this path; only `button === 0` is required.
1. The tool id must be `windrose_set_tool` `draw` (palette "Paint Cells", `ToolPalette.tsx`). `paint` is NOT a tool id: only `draw`/`erase`/`rectangle`/`circle`/`clearArea`/`edgeDraw`/`edgeErase`/`edgeLine`/`segmentDraw` reach the paint code (`DRAWING_TOOL_SET` in `useEventCoordinator.ts`). Any other id falls through every branch silently, which matches "selects/places but never paints, no notice".
2. Fire on the visible render canvas (see above), with coordinates inside it:
```js
const cv = [...document.querySelectorAll('.windrose-container')].find(c => c.getBoundingClientRect().width > 50 && c.offsetParent != null).querySelector('canvas:not([style*="absolute"])');
const r = cv.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
const ev = (t) => cv.dispatchEvent(new MouseEvent(t, { clientX: x, clientY: y, button: 0, buttons: t === 'mouseup' ? 0 : 1, bubbles: true, cancelable: true }));
ev('mousedown'); await new Promise(r => setTimeout(r, 100)); ev('mousemove'); await new Promise(r => setTimeout(r, 50)); ev('mouseup');
```
Path: `handleMouseDown` -> `handlePointerDown` (mouse runs `executeToolAction` immediately) -> `handleDrawingPointerDown` (`useDrawingTools.ts`, `draw` branch) -> `usePaintTool.startDrawing` -> `processCellDuringDrag` -> `toggleCell` -> `onCellsChange(batched)`. The batched write is committed to history on `mouseup` via `stopDrawing` (`flushStrokeHistory`). The extra mousemove is belt-and-braces (it only feeds `processCellDuringDrag` in the mousemove handler). On a ladder map zoomed onto a rung the press may instead raise a Notice from `usePaintTool.startDrawing` (depth refusal); at level 0 nothing blocks it. If this still paints nothing, check `windrose_get_state` for the real `currentTool`, and that a mouse event shortly after a touch (500 ms window in `handlePointerDown`) is dropped.

**Which CSS rules match an element** (specificity debugging):
```js
const el = document.querySelector(SEL); const hits = []; for (const sh of document.styleSheets) { let rules; try { rules = sh.cssRules; } catch (e) { continue; } for (const r of rules) { if (r.style && r.selectorText) { let m = false; try { m = el.matches(r.selectorText); } catch (e) {} if (m) hits.push(r.selectorText); } } }
```

**Create a scratch map note** (fenced block survives via charCode join):
```js
const NL = String.fromCharCode(10); const content = ['# Scratch', '', '```windrose-map', 'id: scratch-map-1', 'name: Scratch', 'type: hex', '```', ''].join(NL); await app.vault.adapter.write('scratch/Scratch.md', content);
```
Then `windrose_open_map('scratch/Scratch.md')` — it polls for the mount itself.

**Perf-probe canvas calls** (ALWAYS restore in the same session — leaked patches corrupt later measurements):
```js
const P = CanvasRenderingContext2D.prototype; window.__probe = { drawImage: 0, orig: P.drawImage }; P.drawImage = function(...a) { window.__probe.drawImage++; return window.__probe.orig.apply(this, a); };
// ...measure... then RESTORE:
CanvasRenderingContext2D.prototype.drawImage = window.__probe.orig; delete window.__probe;
```

**Wall drawing** (no imperative op yet — native mouse events DO work here because the coordinator listens for native `mousedown`):
```js
const canvas = [...document.querySelectorAll('canvas')].find(c => c.width > 400 && c.offsetParent != null); const r = canvas.getBoundingClientRect(); const ev = (t, px, py) => canvas.dispatchEvent(new MouseEvent(t, { clientX: r.left + px, clientY: r.top + py, bubbles: true, button: 0 })); ev('mousedown', 200, 300); ev('mouseup', 200, 300); await new Promise(rs => setTimeout(rs, 120)); ev('mousedown', 400, 300); ev('mouseup', 400, 300); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
```
This is the exception: cell paint / tile placement / object placement all have real tools — use them.

## Ladder maps

Maps with a `lod` block (the lattice detail ladder) add a rung dimension. Verified against `mcp/tools/*.ts` and `useMcpBridge.ts`:
- `paint_cell`, `paint_cells`, `erase_cell`, `get_cells`, `place_tile`, `place_object` and `list_objects` take an optional `level`. The default is 0 (the root lattice), NOT the camera's rung, so scripts never depend on zoom. `set_viewport` also takes `level` (zoom to the middle of that rung's band).
- Rung cells are `{q,r}` objects (axial) stored under `layer.levels['<n>']` (string keys); on a rung, tile and object coordinates are that rung's cell indices and must exist at that level.
- Rung writes go through the single deep-write gate (`persistence/depthAuthoring.ts`): refusals come back as `{ok:false, error}` with reasons such as `not-a-ladder`, `invalid-level`, `level-out-of-range`, `too-many-cells` (4096 per op), or a size-budget reason. A classic map or an unstamped map with the flag off is refused, not silently written.
- Object and tile parity: `place_object` and `place_tile` write `homeLevel`; `place_object` also takes `visibleLevels` (explicit rungs; omit = Auto, the home band); `list_objects` results carry `level`, `depthMode` and `visibleLevels`.
- `get_state` reports `getActiveLevel` (camera rung, read from the live canvas when one is mounted) and `getEditLevel` (the edit-level lock when set, else the camera rung). The lock is a UI authoring-tool setting; MCP writes use their explicit `level` and ignore it.
- `set_tool` rejects any id outside the ToolId union (`src/core/toolIds.ts`).

## Safety rules (each one earned by a real incident)

1. **Never raw-write the map data file** (`adapter.write` on `dungeon-maps-data.json`). It races autosave and bypasses validation — this truncated the file once. Mutate via ops tools, then `windrose_force_save`.
2. **Never leave global state patched**: webFrame zoom (the screenshot tool resets it — don't hand-roll), prototype monkey-patches (restore in-session), `plugin.dataFilePath` overrides.
3. **Don't detach leaves or `app:reload`** to fix confusion — `windrose_ensure_visible` and `windrose_reload` cover the legitimate cases without destroying session state.
4. **Verify mutations on low-content maps** (check `cellCount`/`objectCount` via get_state first); revert experiments with `windrose_undo`.
5. There are **two data files** in some vaults (root `windrose-md-data.json` + the real one under `Garden/...`). Never guess: `windrose_get_state`'s `dataFilePath` is the truth.
6. **DOM events can land on the wrong map instance** (earned 2026-07-26): keyed tools (`get_state`/`select_tile`/`set_tool`) resolve the target instance correctly, but a synthetic canvas click selected by a "visible container" heuristic (`width>50 && offsetParent!=null`) can hit a *different* foregrounded `.windrose-container` (e.g. the persistent full-pane view) in the same tab group. `windrose_ensure_visible` reveals *a* visible leaf, not necessarily *your* leaf. Before dispatching DOM events, force the target active: `app.workspace.setActiveLeaf(targetLeaf, {focus:true})` + `revealLeaf`, then query the canvas *inside that leaf's container*.

## Known limits

- **Several map blocks in one note**: each block registers once per mount in `window.__windrose.mcpInstances`. The first-mounted block owns the plain note-path key, which is what every MCP tool resolves by; later blocks appear as `<notePath>#mcp-N` (each entry also carries `instanceId`). The MCP tools only address the plain-key block; to drive a later block, use eval with `Object.values(window.__windrose.mcpInstances)` and pick by `instanceId`/`mapId`. If the first block unmounts, the next one is promoted to the plain key.
- Registry entries expose snapshot fields as live getters over the latest render, so `JSON.stringify(inst)` and property reads see current values; `timestamp` is the last render time, not registration time.

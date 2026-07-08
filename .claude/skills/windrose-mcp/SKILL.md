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
| Tool/color/layer/undo/save | `windrose_set_tool`, `windrose_set_color`, `windrose_select_layer`, `windrose_undo/redo`, `windrose_force_save` | undo/redo return honest results now |
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

## Safety rules (each one earned by a real incident)

1. **Never raw-write the map data file** (`adapter.write` on `dungeon-maps-data.json`). It races autosave and bypasses validation — this truncated the file once. Mutate via ops tools, then `windrose_force_save`.
2. **Never leave global state patched**: webFrame zoom (the screenshot tool resets it — don't hand-roll), prototype monkey-patches (restore in-session), `plugin.dataFilePath` overrides.
3. **Don't detach leaves or `app:reload`** to fix confusion — `windrose_ensure_visible` and `windrose_reload` cover the legitimate cases without destroying session state.
4. **Verify mutations on low-content maps** (check `cellCount`/`objectCount` via get_state first); revert experiments with `windrose_undo`.
5. There are **two data files** in some vaults (root `windrose-md-data.json` + the real one under `Garden/...`). Never guess: `windrose_get_state`'s `dataFilePath` is the truth.

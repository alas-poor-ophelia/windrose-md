# Windrose MCP Overhaul Plan

**Issue:** `windrose-wha` · **Date:** 2026-07-07
**Evidence base:** 6-agent review — code inventory of `mcp/` + in-app bridge, plus transcript excavation of the 10 heaviest-eval sessions (2026-06-10 → 2026-07-04, ~1,700 eval invocations). Extracted call dumps: `.claude/obsidian-review/<session-id>*.txt`.

## Problem statement

Agents (Opus and Fable alike) burn thousands of tokens per session trial-and-erroring `windrose_eval` for tasks the MCP should own: finding maps, reloading, seeing the canvas, navigating UI, placing tiles/objects. Eval-to-structured-tool ratio in heavy sessions runs 3:1 to 5:1.

## Root causes (converged across all 5 transcript scouts + code inventory)

### A. Tools that lie (premature success / wrong data)
1. **`open_map`** returns "Opened" before the block mounts and the bridge registers (mandatory 1.5–2.5s async gap). Doesn't force preview mode, so blocks in source-mode files never render at all.
2. **`reload`** returns before the plugin is ready; emits a spurious error about the dead companion id `dungeon-map-tracker-settings` (agents then distrust the tool and reinvent reload via eval); doesn't rerender markdown blocks (required in block mode) or reopen the map (leaf state is destroyed). The reload→reopen→wait→probe chain was hand-rolled 5+ times per session.
3. **`navigate`** reports success but does not move the live view — zoom sometimes applies, x/y never. One session dispatched 14 synthetic WheelEvents to zoom instead.
4. **`ping`** checks `window.__windrose.ready`, which is never set anywhere in source → reports bridge down in 13/13 calls across sessions while eval works fine.
5. **`undo`/`redo`** return `true` unconditionally (`DungeonMapTracker.tsx` ops).
6. **`read_map_data` is broken** (await-in-non-async inside its own eval) AND resolves a hardcoded `windrose-md-data.json`; the instance snapshot's `dataFilePath` field is a hardcoded literal. The only reliable answer is `app.plugins.plugins['windrose-md'].dataFilePath` — which every session re-derived from scratch after vault-scanning ~5 candidate JSONs.

### B. Blindness (the "map is right there and it can't see it" pattern)
7. **Ghost DOM twins**: a zero-height CM6 copy and the live-preview copy of `.windrose-container` coexist; multiple leaves multiply this. Agents probe the dead twin for up to 17 evals. Working idiom (rediscovered independently in 4 sessions): filter by `offsetParent != null` / `rect.width > 50`.
8. **Full-pane ItemView is invisible to MCP**: `WindroseMapView` passes `notePath: ''` so it never registers in `mcpInstances`; active-map resolution via `getActiveFile()` is null for ItemView leaves.
9. **Unfocused/minimized Electron window silently starves RAF + ResizeObserver** → virtualized lists measure height 0, look broken (~9 evals to diagnose). Fix is `getCurrentWindow().restore()/show()/focus()`.
10. **`screenshot`** is a full-window ~584px-wide downscale — unusable for canvas inspection. Working workaround: `canvas.toDataURL()` → `adapter.writeBinary()` → read from disk. Agents also used `webFrame.setZoomFactor(4.0)` as a magnifier (3 evals per shot, crash-unsafe: leaves Obsidian at 4× if the session dies).
11. **Canvas identity confusion**: `.windrose-canvas` doesn't exist in the DOM; `canvas.windrose-canvas-select` is the event-target layer, the render layer is an unnamed canvas. Tile identity is invisible (thumb `img.src` is base64, card titles empty; names live only in label text nodes).

### C. Eval transport traps
12. **Unresolved Promise → silent `(no output)`** — not an error. One agent burned 9 blind rounds. Scope rules (no top-level `return` in some forms, `asyncWrap` interactions, newline collapse, comments/long bodies → "Unexpected end of input") are undocumented in the tool description where the model would read them.
13. **Unbounded output**: `get_cells` returned 124k chars on a production map (token-fatal).
14. **No placement path works via events**: synthetic PointerEvent/MouseEvent does NOT reach Preact JSX handlers. Object placement: 0 successes in 7 attempts + one 30s UI-blocking timeout. (Wall drawing worked only because the coordinator listens for native `mousedown`.) Mutation must call the plugin's imperative API.

### D. Dangerous escape hatches agents were forced into
- `disablePlugin` → raw `adapter.write` of the data JSON (3× in one session; no validation, races autosave)
- Live mutation of `plugin.dataFilePath` and `plugin.settings`; global monkey-patches on `adapter.write` and `CanvasRenderingContext2D.prototype` (one never cleaned up)
- Leaf detaches, vault file deletes, `app:reload` ×9 in one session
- Real hazard observed: production data file truncated at exactly 524,288 bytes.

## Design principles

1. **Every tool awaits its effect** — poll until the observable postcondition holds, return verified state, never an optimistic string. Timeouts return `{ok:false, waited, lastState}`.
2. **Every DOM-touching tool auto-scopes to the visible instance** (offsetParent/width filter, block AND ItemView) and **ensures window focus first**.
3. **Mutations go through the in-app `ops` API**, never synthetic events. Extend `ops` in `src/` where a capability is missing.
4. **Read tools are token-bounded** (summary modes, bbox filters, byte caps with truncation notice).
5. **Eval survives as the last resort** — hardened (typed error on unresolved promise, scope rules in the tool description), and documented by a skill with proven recipes for the long tail.

## Phases

### Phase 0 — Stop the lying (small diffs, huge payoff)
| # | Change | Where |
|---|--------|-------|
| 0.1 | Set `ready: true` in `initMcpNamespace`; ping reports instance count + active resolution | `src/main.ts`, `mcp/tools/query-tools.ts` |
| 0.2 | Register full-pane ItemView in `mcpInstances` (fix `notePath: ''`; resolve active map for `windrose-map-view` leaves) | `src/views/WindroseMapView.ts`, `src/DungeonMapTracker.tsx`, ops-helper resolution |
| 0.3 | Instance `dataFilePath` = real `plugin.dataFilePath`; fix `read_map_data` (async bug + path) | `src/DungeonMapTracker.tsx`, `mcp/tools/query-tools.ts` |
| 0.4 | `reload` v2: correct id only, optional `notePath` to reopen + force preview + rerender blocks + poll bridge, return `{ready, version, activeMapId}` | `mcp/tools/nav-tools.ts` |
| 0.5 | `open_map` v2: force preview mode, poll `mcpInstances` ≤5s, return `{mounted, mapId, instanceKey, leafType}` | `mcp/tools/nav-tools.ts` |
| 0.6 | Honest `undo`/`redo` returns | `src/DungeonMapTracker.tsx` |

### Phase 1 — Context in one call
| # | Tool | Behavior |
|---|------|----------|
| 1.1 | `windrose_list_maps` | Enumerate maps from the real data file: id, name, type, orientation, layer/tile/object/wall counts, note paths containing blocks (from cached scan), which are currently mounted + leaf type |
| 1.2 | `windrose_get_state` v2 | Full hydration: active instance (block or ItemView), real dataFilePath, LIVE viewState, layers, counts, drawer/pane/tool state, window-focus state |
| 1.3 | `windrose_check_data` | Read + parse active data file → `{ok, byteLen, mapCount, truncated}` |

### Phase 2 — Eyes
| # | Tool | Behavior |
|---|------|----------|
| 2.1 | `windrose_canvas_dump` | Render canvas → native-res PNG in `mcp/screenshots/` (toDataURL → writeBinary → copy out), optional region crop; returns `{mounted, canvasSize, path}` |
| 2.2 | `windrose_screenshot` v2 | Adds `{mounted, canvasSize}` to response; optional `zoom` param (webFrame set → shot → guaranteed reset in finally) |
| 2.3 | `windrose_inspect_layout` | `selectors[]` → rect, computed style subset, scroll dims per selector; auto-scoped to visible container; SVG-safe (`typeof className === 'string'` guard) |
| 2.4 | `windrose_canvas_sample` | Cheap "did anything render": distinct colors, non-transparent pixel count, backing vs rendered size |
| 2.5 | `windrose_ensure_visible` | Focus window (restore/show/focus), reveal leaf, force preview, verify visible container; the precondition primitive every UI tool calls internally and agents can call explicitly |

### Phase 3 — Hands (requires `src/` ops extension, deployed to vault)
| # | Tool | Behavior |
|---|------|----------|
| 3.1 | `ops.setViewport(x,y,zoom)` + `windrose_set_viewport` | Drives the LIVE component (ViewController), verified by reading back live viewState |
| 3.2 | `ops.listTiles()` + `windrose_list_tiles` | Installed tilesets/tiles with names, tags, depth bands — kills the invisible-tile-identity safari |
| 3.3 | `ops.selectTile(ref)` + `windrose_select_tile` | Select tile + activate placement tool; returns active subtool state |
| 3.4 | `ops.placeTile({...})` + `windrose_place_tile` | Direct placement API (paint/stamp at col/row), one undo entry |
| 3.5 | `ops.placeObject(label,x,y)` / `ops.listObjects()` + tools | Object placement via imperative API (the 0-for-7 event-dispatch bucket) |
| 3.6 | `ops.openDrawer(pane)` + `windrose_open_drawer` | Tiles/Objects/Layers/Colors drawers; waits for open state |
| 3.7 | `get_cells` v2 | `bbox` + `summary` params; byte-capped |

### Phase 4 — Eval hardening + skill
- `eval` v2: proper async wrap; detect unresolved-promise → typed error `EVAL_PROMISE_UNRESOLVED`; output byte cap with truncation notice; **scope rules and gotchas written into the tool description itself**.
- Skill `.claude/skills/windrose-mcp/SKILL.md`: when to use which tool; proven recipes for the long tail (React controlled-input setter, CSS rule matching, perf prototype-patching WITH cleanup pattern, wall drawing via native mouse events, scratch-map creation with `String.fromCharCode(10)`), and the safety rules (never raw-write the data file; never leave webFrame zoom/monkey-patches).

### Phase 5 — Verification
Each tool live-verified against running Obsidian (dev-loop skill, 4-axis). Final gauntlet: scripted task list replaying the historically-failed scenarios (find a hex map → open → see tiles → place a tile → verify → undo → reload → still sane) executed via the new tools only, zero eval.

## Staffing
Sonnet implementers per phase (scoped, <160k each); Fable reviews every diff and runs final live verification. Phase 3 touches production plugin source — 0-warning gate + unit tests hold.

## Source recipes
Working eval snippets to lift into implementations are in the scout dumps (`.claude/obsidian-review/`) and quoted in the session-analysis reports (this plan's parent conversation).

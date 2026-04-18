---
name: dev-loop
description: Four-axis debug harness for the running Obsidian app — compile, static-verify, runtime-probe, visual-confirm. Use for any UI, plugin, or integration change where you need to see/prove the live state.
---

# Dev Loop: A Debug Harness Into Live Obsidian

The Obsidian CLI is not just a screenshot tool — it is a live-app REPL. Through `eval`, `command`, and `dev:screenshot` you can compile code, read arbitrary vault files, query the DOM, inspect plugin internals, bypass-test leaf APIs, and confirm visually. Combine them and you have a four-axis debug harness.

This skill treats the dev loop as that harness, not as a one-shot "compile and eyeball it."

## The Four Axes

Each axis answers a different "is this broken yet?" question. Climb whichever rung the current evidence suggests — you rarely need all four on one iteration.

| Axis | What it proves | How |
|---|---|---|
| **1. Compile** | Source → artifact succeeded | `bash scripts/dev-loop.sh` (or the CLI compile command directly) |
| **2. Static verify** | New code reached the running file | `adapter.read` the built file + `indexOf(newSymbol)` via eval |
| **3. Runtime probe** | Code is behaving correctly in the live app | DOM queries, bridge state, plugin internals, `console.log` via eval |
| **4. Visual confirm** | The user-visible result is right | `dev:screenshot` + Read the PNG (Claude is multimodal) |

The combination is what matters. "The compile succeeded but the DOM still has the old class name" tells you immediately that axis 2 is the broken link — probably the settings-plugin `main.js` gap (see below).

## When to Use

- Any UI, layout, or styling change
- Plugin integration work (custom code-block processors, Markdown post-processors, CM6 extensions)
- Debugging why a feature "doesn't seem to do anything"
- Verifying a bridge function (`window.__windrose.X`) is wired correctly
- **Not for:** pure logic changes covered by unit tests, E2E test verification (E2E has its own isolated Obsidian)

## The Compile Command

```bash
bash scripts/dev-loop.sh
```

Atomically compiles via Obsidian CLI → reloads the plugin → screenshots → checks errors.

**Flags:** `--no-compile` (CSS/settings-only), `--note "path"` (navigate first).

**Output:** `tests/e2e/screenshots/dev-loop-latest.png`. Exit 0 = clean, 1 = errors.

### ⚠ The Settings-Plugin `main.js` Gap

`dev-loop.sh` compiles the Datacore-compiled artifact (`compiled-windrose-md.md`) but does **not** rewrite `.obsidian/plugins/dungeon-map-tracker-settings/main.js`. That file is regenerated only when the in-UI **Update Plugin** button is clicked.

If you're changing settings-plugin source (anything in `src/settingsplugin/`):

1. Bump `PACKAGED_PLUGIN_VERSION` in `src/components/settings/SettingsPluginInstaller.tsx`
2. Recompile (`dev-loop.sh`)
3. Reload Obsidian: `"$OBSIDIAN_CLI" "vault=Absalom" command "id=app:reload"` (plain `plugin:reload` is not enough — the main.js is a fresh file on disk)
4. Eval-click the Update button (see cookbook below)

**Always static-verify** before debugging behavior: `adapter.read` the plugin main.js and `indexOf` your new symbol. If it's absent, no amount of runtime debugging will help — the running binary is stale.

## The CLI Incantation

All eval/command/screenshot calls use this shape:

```bash
OBSIDIAN_CLI="$LOCALAPPDATA/Programs/obsidian/Obsidian.com"
"$OBSIDIAN_CLI" "vault=Absalom" <subcommand> <args>
```

Subcommands: `eval "code=..."`, `command "id=..."`, `dev:screenshot "path=..."`, `dev:errors`, `plugin:reload "id=..."`, `open "path=..."`, `version`.

## Eval Cookbook

Paste-ready snippets for common probes. Each is one line (the CLI rejects multi-line eval payloads). Use `(async () => { ... })()` for any `await`. Return values via implicit last-expression; the CLI prints `=> <result>`.

### Static verify: did my new symbol reach the running file?
```bash
"$OBSIDIAN_CLI" "vault=Absalom" eval "code=(async () => { const c = await app.vault.adapter.read('.obsidian/plugins/dungeon-map-tracker-settings/main.js'); return { len: c.length, hasSymbol: c.indexOf('MyNewThing') >= 0 }; })()"
```

### Workspace state: what view, what mode, what file?
```bash
"$OBSIDIAN_CLI" "vault=Absalom" eval "code=(() => { const v = app.workspace.getActiveViewOfType(window.__windrose.obsidian.MarkdownView); return { mode: v?.getMode?.(), path: v?.file?.path }; })()"
```

### Bridge state: is my plugin loaded, is its API exposed?
```bash
"$OBSIDIAN_CLI" "vault=Absalom" eval "code=({ bridge: !!window.__windrose?.ready, version: window.__windrose?.version, apis: Object.keys(window.__windrose || {}) })"
```

### DOM query: find elements by text content
```bash
"$OBSIDIAN_CLI" "vault=Absalom" eval "code=Array.from(document.querySelectorAll('.cm-link')).filter(el => /MyTarget/.test(el.textContent || '')).map(el => ({ text: el.textContent, rect: el.getBoundingClientRect().toJSON() }))"
```

### Simulated event: trigger a handler without real input
```bash
"$OBSIDIAN_CLI" "vault=Absalom" eval "code=(() => { const el = document.querySelector('.my-target'); const r = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: r.left+5, clientY: r.top+5, view: window })); return 'dispatched'; })()"
```

### Bypass test: call the leaf API directly (the highest-leverage debug move)
```bash
"$OBSIDIAN_CLI" "vault=Absalom" eval "code=(async () => { const div = document.body.appendChild(document.createElement('div')); div.style.cssText='position:fixed;top:100px;left:100px;z-index:9999;background:white;border:1px solid red;'; await window.__windrose.renderPreview(div, { mapId: 'my-map', cellX: 5, cellY: 5 }); return 'rendered'; })()"
```

When integration is broken and you don't know whether the fault is in the plumbing or the leaf, **call the leaf directly**. If it works, everything failing is plumbing. If it doesn't, the leaf is broken. One probe, half the hypothesis space eliminated.

### Simulated click on an in-UI button
```bash
"$OBSIDIAN_CLI" "vault=Absalom" eval "code=(() => { const btn = Array.from(document.querySelectorAll('button')).find(b => /Update/i.test(b.textContent || '')); btn?.click(); return btn ? 'clicked' : 'not found'; })()"
```

### Reload Obsidian (survives the reload — eval context would die mid-call)
```bash
"$OBSIDIAN_CLI" "vault=Absalom" command "id=app:reload"
sleep 8
```

Use `app:reload` when `plugin:reload` is insufficient (e.g. main.js on disk changed).

### Grep the vault for a string
```bash
"$OBSIDIAN_CLI" "vault=Absalom" eval "code=(async () => { const files = app.vault.getMarkdownFiles(); const hits = []; for (const f of files) { const c = await app.vault.cachedRead(f); if (c.includes('windrose:')) hits.push(f.path); } return hits.slice(0, 20); })()"
```

## Iteration Discipline

The old rule ("3 iterations max") is wrong for integration work. With tight probe cycles (eval returns in 2-10s) ten cycles can be healthy — if each narrows the problem.

**The real warning sign is iteration without information gain.** Escalate when a probe returns the same result as the previous probe. That means your model of the system is wrong, not just the fix.

When you spot stagnation:
1. State explicitly what you thought would happen vs. what did
2. Rebuild the hypothesis tree from scratch — don't patch it
3. Consider whether a different axis would help (e.g. static verify after three runtime probes that all say "nothing happens")
4. If still stuck, consult the Meridian per anti-spiral protocol

## Reading the Screenshot

After `dev:screenshot` or `bash scripts/dev-loop.sh`:

```
Read tool: tests/e2e/screenshots/dev-loop-latest.png
```

Claude is multimodal — read the PNG directly. Look for:

- Layout: overlap, clipping, misalignment
- Colors / styling: missing theme variables, unexpected defaults
- Content: labels, icons, text
- Missing elements: anything that should render but doesn't
- Error indicators: red borders, error messages, blank panels

## MCP vs CLI eval — When to Use Which

The windrose MCP server (`mcp__windrose_*`) provides **stable, structured operations** — mostly for map editing and state queries. The CLI path is for **exploratory debugging** where the query shape changes per call.

**Use MCP when** (rules of thumb):
- You're mutating map state (paint cells, set tool, set color, undo/redo): `windrose_paint_cell`, `windrose_set_tool`, `windrose_undo`
- You want the current map's state snapshot: `windrose_get_state`
- You want a screenshot and don't care about the CLI detail: `windrose_screenshot`
- You're doing things the tool was designed for

**Use CLI eval when:**
- Debugging plugin integration (DOM queries, post-processor wiring, CM6 extensions)
- Inspecting arbitrary Obsidian app state (`app.workspace`, `app.plugins`, `localStorage`)
- Bypass-testing a leaf API
- Static-verifying a built artifact
- Any one-off "I need to know X in the live app right now" question

The CLI path doesn't require MCP at all. Keep the incantation at hand.

## Anti-Patterns

- **Don't climb all four axes every iteration** — pick the one that discriminates your current hypothesis
- **Don't screenshot without a specific question** — know what you're looking for first
- **Don't assume compile = deployed** — always static-verify for settings-plugin changes
- **Don't debug integration without bypass-testing the leaf** — cheapest test first
- **Don't run during E2E tests** — the CLI targets the user's running Obsidian, not test instances

## Prerequisites

- Obsidian running with the Absalom vault open
- Obsidian CLI enabled (Settings → General → CLI)
- Windrose plugin installed in the vault

## Future Expansion Points

Documented for future implementation, not built yet:

- **Probe-pack subagent**: spawn a sub-agent with a canned set of probe snippets for common bug shapes (hover not firing, button has no handler, plugin not loaded)
- **Diff screenshots**: before/after PNG comparison for visual regressions
- **Watch mode**: file watcher triggers the loop automatically
- **Probe library file**: a checked-in `.claude/skills/dev-loop/probes/*.js` so the incantations can be referenced by path instead of pasted

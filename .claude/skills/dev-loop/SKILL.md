---
name: dev-loop
description: Visual verification loop - compile, reload, screenshot, and inspect the running Obsidian app. Use after any UI/visual change to verify it looks correct before moving on.
---

# Dev Loop: Visual Self-Verification

Use this skill after making UI, layout, or styling changes to visually verify the result in the running Obsidian instance. This replaces manual "compile, open Obsidian, check it" steps with a single command.

## When to Use

- After changing component rendering, layout, or styling
- After modifying canvas drawing code (layers, tools, overlays)
- After changing settings modal UI
- After any change where "does it look right?" matters
- **Not for**: pure logic changes, unit-testable math, E2E test verification

## The Command

```bash
bash scripts/dev-loop.sh
```

This atomically: compiles via Obsidian CLI -> reloads the plugin -> takes a screenshot -> checks for errors.

### Flags

| Flag | Purpose |
|------|---------|
| `--no-compile` | Skip compilation, just reload + screenshot. Use for CSS-only or settings-only changes. |
| `--note "path/to/note"` | Navigate to a specific note before screenshotting. Use when you need a specific map visible. |

### Output

- Screenshot saved to `tests/e2e/screenshots/dev-loop-latest.png`
- Error check printed to stdout
- Exit code 0 = clean, 1 = errors detected

## Reading the Screenshot

After running the script, **read the screenshot** with the Read tool:

```
Read tool: tests/e2e/screenshots/dev-loop-latest.png
```

Claude is multimodal and can interpret the screenshot directly. Look for:

- **Layout**: Are elements positioned correctly? Any overlap or clipping?
- **Colors/styling**: Do colors match expectations? Any missing styles?
- **Content**: Are labels, icons, and text rendering properly?
- **Missing elements**: Is anything that should be visible absent?
- **Error indicators**: Red borders, error messages, blank areas where content should be

## Iteration Protocol

1. Make the code change
2. Run `bash scripts/dev-loop.sh`
3. Read the screenshot
4. If something's wrong: fix it, go to step 2
5. **Max 3 iterations** before stopping to ask the user

Three failed iterations means the approach may be wrong, not just the details. Stop and explain what you're seeing vs. what you expected.

## Error Handling

If `dev:errors` reports issues after compilation:

1. Read the error output carefully
2. Common causes: syntax errors in source, missing imports, runtime exceptions during plugin init
3. Fix the source error, then re-run the full loop (don't use `--no-compile`)

## State Inspection

For deeper debugging, use Obsidian CLI eval to inspect runtime state:

```bash
OBSIDIAN_CLI="$LOCALAPPDATA/Programs/obsidian/Obsidian.com"
"$OBSIDIAN_CLI" "vault=Absalom" eval "code=window.__windrose?.getState?.()"
```

Use this when the screenshot looks wrong but you can't tell why from the visual alone.

## Anti-Patterns

- **Don't loop endlessly** - 3 iterations max, then ask the user
- **Don't screenshot without purpose** - Know what you're checking before running the loop
- **Don't use for E2E test verification** - E2E tests have their own flow with isolated Obsidian instances
- **Don't run during E2E tests** - The dev loop targets the user's running Obsidian, not test instances

## Prerequisites

- Obsidian must be running with the Absalom vault open
- Obsidian CLI must be enabled (Settings > General > CLI)
- The windrose plugin must be installed in the vault

## Future Expansion Points

These are documented for future implementation, not built yet:

- **Sub-agent review**: After screenshot, spawn a UX review agent to analyze the visual result alongside the code change
- **Diff screenshots**: Compare before/after screenshots to detect visual regressions
- **Watch mode**: File watcher triggers the loop automatically on source file save
- **Error remediation**: If errors are found, auto-diagnose common patterns before asking the user

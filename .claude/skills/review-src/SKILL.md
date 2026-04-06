---
name: review-src
description: Perform thorough code review of staged changes in the src directory. Reviews for coding best practices, project patterns, type safety, and potential issues. Runs review-comments skill afterward.
---

# Review Staged Source Changes

Performs a principal-level code review of staged changes in the **source repo** (the Obsidian vault).

**Important:** `src/` is a symlink to `C:\Users\whipl\OneDrive\Documents\Absalom\Projects\dungeon-map-tracker`. Changes must be staged *there* (not in the dev harness at `C:\Dev\windrose`). The `git diff` below operates on the source repo's staging area.

## Instructions

### Step 0: Read Architecture Context

Before reviewing, read `src/CLAUDE.md` for the project's architecture conventions, coding patterns, and module system rules. This is the baseline for evaluating "project patterns."

### Step 1: Get Staged Changes

```bash
cd "C:/Dev/windrose/src" && git diff --cached
```

If no staged changes, inform the user and exit.

### Step 2: Thorough Review

Analyze all staged changes against these criteria:

#### Type Safety
- Proper TypeScript types (avoid `any`, `unknown` where concrete types exist)
- Consistent with existing type definitions in `#types/` (path alias for the `types/` directory)
- Generic constraints where appropriate

#### Project Patterns
- Follows existing code patterns (see `src/CLAUDE.md`)
- Uses Datacore's module loading pattern (`requireModuleByName`) for cross-module dependencies
- Consistent naming conventions
- Proper use of `dc.*` hooks (`dc.useState`, `dc.useRef`, `dc.useCallback`, `dc.useMemo`) — NOT React imports. Flag any direct `import { useState } from 'preact/hooks'` as incorrect.

#### Logic & Correctness
- Edge cases handled
- Null/undefined safety
- Proper cleanup in `dc.useEffect` hooks (return a cleanup function)
- Event listener registration/cleanup balanced

#### Performance
- Unnecessary re-renders avoided
- Proper memoization with `dc.useCallback` and `dc.useMemo` (not React's versions)
- Efficient data structures and algorithms

#### Maintainability
- Clear separation of concerns
- Appropriate abstraction level
- No over-engineering for current requirements

#### Potential Issues
- Race conditions
- Memory leaks
- Security concerns (XSS, injection)
- Cross-platform compatibility

### Step 3: Present Findings

Organize review as:

```markdown
## Summary
[1-2 sentence summary of the changes]

## Issues Found
### 1. [Issue Title] (`file:line`)
[Description and recommendation]

### 2. ...

## Suggestions
[Non-blocking improvements]

## Good Points
[What's done well]

## Verdict
[Overall assessment and whether changes are ready to commit]
```

### Step 4: Run Review Comments

After presenting the code review, invoke the `review-comments` skill to check for frivolous or LLM-like comments in the staged changes:

```
Skill tool: skill="review-comments"
```

Use `git diff --cached` (run from `src/`) as the diff range for the review-comments analysis.

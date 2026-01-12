---
name: review-src
description: Perform thorough code review of staged changes in the src directory. Reviews for coding best practices, project patterns, type safety, and potential issues. Runs review-comments skill afterward.
---

# Review Staged Source Changes

Performs a principal-level code review of staged changes in the symlinked `src/` directory.

## Instructions

### Step 1: Get Staged Changes

```bash
cd "C:/Dev/windrose/src" && git diff --cached
```

If no staged changes, inform the user and exit.

### Step 2: Thorough Review

Analyze all staged changes against these criteria:

#### Type Safety
- Proper TypeScript types (avoid `any`, `unknown` where concrete types exist)
- Consistent with existing type definitions in `#types/`
- Generic constraints where appropriate

#### Project Patterns
- Follows existing code patterns in the codebase
- Uses project's module loading pattern (`requireModuleByName`)
- Consistent naming conventions
- Proper use of `dc.*` hooks and utilities

#### Logic & Correctness
- Edge cases handled
- Null/undefined safety
- Proper cleanup in useEffect hooks
- Event listener registration/cleanup balanced

#### Performance
- Unnecessary re-renders avoided
- Proper memoization (useCallback, useMemo)
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

After presenting the code review, invoke the `review-comments` skill to check for frivolous or LLM-like comments in the staged changes.

Use `git diff --cached` as the diff range for the review-comments analysis.

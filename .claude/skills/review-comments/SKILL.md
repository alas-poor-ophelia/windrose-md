---
name: review-comments
description: Reviews recent code changes for frivolous, overly verbose, or LLM-like comments and removes them. Use when you want to clean up comment noise from recent commits, after generating code, or when explicitly asked to review comments.
---

# Review Comments

Reviews recent git changes for low-value comments and removes them while preserving genuinely useful documentation.

## Instructions

1. **Get the recent changes**: Run `git diff HEAD~1` (or the user-specified range) to see recent modifications
2. **Identify added/modified comments**: Focus only on lines starting with `+` that contain comments
3. **Evaluate each comment** against the DELETE and KEEP criteria below
4. **Present findings**: Show the user which comments you recommend removing and why
5. **Remove on confirmation**: Delete the flagged comments (or auto-remove if user specified)

## DELETE Criteria — Remove Comments That:

### 1. Restate the Obvious
Comments that merely describe what the code already clearly expresses:
```javascript
// BAD: "Increment the counter"
counter++;

// BAD: "Check if user is authenticated"
if (user.isAuthenticated) { ... }

// BAD: "Loop through the items"
for (const item of items) { ... }
```

### 2. Use Filler/Hedging Language
Comments with excessive enthusiasm, uncertainty, or corporate-speak:
- "This elegant function gracefully handles..."
- "This might potentially help with..."
- "Here we can see that..."
- "First, we need to..."
- "Now, let's..."
- "This is where we..."

### 3. Provide Play-by-Play Narration
Sequential comments that narrate obvious code flow:
```javascript
// BAD: "First, get the user"
const user = getUser();
// BAD: "Then, validate the input"
validate(input);
// BAD: "Finally, return the result"
return result;
```

### 4. Have Redundant Documentation
JSDoc/docstrings that add nothing beyond the signature:
```javascript
// BAD:
/**
 * Gets the user by ID.
 * @param id - The ID of the user
 * @returns The user
 */
function getUserById(id: string): User { ... }
```

### 5. Express Uncertainty or Apology
Comments that undermine confidence without adding context:
- "I think this should work..."
- "This is a temporary fix, but..."
- "Not sure if this is the best approach..."
- "Hopefully this handles..."

### 6. Are Decorative/Noise
- Excessive ASCII art dividers
- Empty section markers
- Commented-out code without explanation
- "End of function" type markers

## KEEP Criteria — Preserve Comments That:

### 1. Explain "Why" (Not "What")
```javascript
// GOOD: "Skip validation for admin users per compliance requirement SOC-2847"
// GOOD: "Using linear search because n < 10 and hash overhead dominates"
// GOOD: "Intentionally not awaited - fire and forget for analytics"
```

### 2. Warn of Non-Obvious Behavior
```javascript
// GOOD: "Order matters: auth middleware must run before rate limiting"
// GOOD: "Returns null (not undefined) to match legacy API contract"
// GOOD: "This callback may fire multiple times"
```

### 3. Contain Actionable TODOs/FIXMEs
```javascript
// GOOD: "TODO(jira-1234): Replace with batch API when available"
// GOOD: "FIXME: Race condition if concurrent writes exceed 100/s"
// GOOD: "HACK: Workaround for browser bug, remove when Safari 18 ships"
```

### 4. Reference External Resources
```javascript
// GOOD: "Implements RFC 7519 section 4.1.4"
// GOOD: "See https://docs.example.com/rate-limits for threshold rationale"
// GOOD: "Algorithm from Knuth TAOCP Vol 3, p. 421"
```

### 5. Document Non-Obvious API Contracts
```javascript
// GOOD:
/**
 * Retries with exponential backoff. Throws after 5 attempts.
 * @throws {TimeoutError} If all retries exhausted
 * @throws {NetworkError} If connection cannot be established
 */
```

### 6. Provide Critical Context
- License headers
- Security considerations
- Performance implications
- Compatibility notes

## Quick Reference

| DELETE if... | KEEP if... |
|--------------|------------|
| Could delete and lose nothing | Deletion would lose context |
| Describes *what* code does | Explains *why* code exists |
| Uses filler/hedging words | Is terse and direct |
| Narrates obvious flow | Warns of non-obvious behavior |
| Repeats the function signature | Documents behavior beyond signature |
| Sounds apologetic/uncertain | References tickets, specs, or rationale |

## Output Format

Present findings as:

```
## Comments to Remove

1. `path/to/file.ts:42` - Restates obvious
   - `// Loop through all users`

2. `path/to/file.ts:87` - Hedging language
   - `// This should hopefully handle the edge case`

## Comments Preserved

- `path/to/file.ts:23` - Explains why (references ticket)
- `path/to/file.ts:56` - Documents non-obvious throw behavior
```

Then ask: "Remove these N comments? (y/n)" unless user specified auto-remove.

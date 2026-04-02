# Datacore/Preact Module System Patterns

Reference this skill when writing, reviewing, or refactoring any code in the Windrose `src/` directory. These patterns are non-negotiable — violating them produces code that compiles but fails at runtime.

## Runtime Environment

Windrose runs inside Obsidian via the **Datacore** plugin. Datacore evaluates each module via `new Function('dc', 'h', 'Fragment', moduleCode)`. This means:

- **No ES module syntax at runtime.** `export`, `export default`, `import` (non-type) all fail. Only `import type` works (stripped by TypeScript before Datacore sees the code).
- **Three injected globals:** `dc` (DatacoreLocalApi), `h` (Preact createElement), `Fragment` (Preact Fragment).
- **Preact, not React.** The component model is Preact. Most React patterns transfer, but the API surface comes from `dc.*`, not `import { useState } from 'react'`.

## Module Loading

Every module resolves dependencies at load time via `requireModuleByName`:

```typescript
// Step 1: Bootstrap pathResolver (every module does this)
const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: <T = unknown>(name: string) => Promise<T>;
};

// Step 2: Load dependencies by filename (must be unique across project)
const { helperFn } = await requireModuleByName("myUtility.ts") as {
  helperFn: (x: number) => string;
};
```

**Rules:**
- Filenames must be unique across the entire project (Datacore resolves by name, not path)
- The `as { ... }` cast after `requireModuleByName` is how TypeScript knows the shape — it has no runtime effect
- All `requireModuleByName` calls are `async` — they go at the top of the module, before function definitions

## Module Exports: `return { }`

Every module MUST end with a `return { }` statement. This is the module's public API.

```typescript
// Correct — this is what dc.require() returns
return {
  myFunction,
  MY_CONSTANT,
  MyComponent,
};
```

```typescript
// WRONG — these all fail silently or throw at runtime
export function myFunction() { ... }
export default MyComponent;
export const MY_CONSTANT = 42;
```

**No exceptions.** Every `.ts` and `.tsx` file in `src/` uses `return { }`.

## Hooks

All hooks come from the `dc` object:

| Hook | Usage |
|------|-------|
| `dc.useState<T>(initial)` | State |
| `dc.useEffect(fn, deps?)` | Side effects |
| `dc.useRef<T>(initial)` | Mutable refs |
| `dc.useCallback(fn, deps)` | Memoized callbacks |
| `dc.useMemo(fn, deps)` | Memoized values |
| `dc.useContext(context)` | Context consumption |
| `dc.createContext<T>(default?)` | Context creation |

**Critical constraint:** Hook call order must be consistent across renders (same as React). But additionally, **`dc.useEffect` must appear AFTER any `dc.useState`/`dc.useCallback` it references in source order.** Datacore does not hoist hook declarations.

## Context Pattern

```typescript
// Creation
const MyContext = dc.createContext<MyContextValue | null>(null);

// Provider component
const MyProvider = ({ value, children }) => (
  <MyContext.Provider value={value}>{children}</MyContext.Provider>
);

// Consumer hook
function useMyContext(): MyContextValue {
  const ctx = dc.useContext(MyContext);
  if (!ctx) throw new Error('useMyContext must be used within MyProvider');
  return ctx;
}

// Export both
return { MyProvider, useMyContext };
```

## Selector Provider Pattern (Splitting Large Contexts)

When a context has many fields (e.g., 78 in MapSettingsContext), any change re-renders all consumers. Split into memoized sub-context providers that expose slices:

```typescript
// Keep ONE useReducer for all state
const [state, dispatch] = dc.useReducer(settingsReducer, initialState);

// Create sub-contexts for independent concerns
const BackgroundImageContext = dc.createContext(null);
const GridSettingsContext = dc.createContext(null);
const HexSettingsContext = dc.createContext(null);
const UIStateContext = dc.createContext(null);

// Each sub-context value memoized with only its fields as deps
const bgValue = dc.useMemo(() => ({
  backgroundImage: state.backgroundImage,
  opacity: state.opacity,
  handleImageChange,
  handleOpacityChange,
}), [state.backgroundImage, state.opacity]);

// Dispatch-based handlers are stable (dispatch identity never changes)
const handleImageChange = dc.useCallback((img) => {
  dispatch({ type: 'SET_BACKGROUND', payload: img });
}, []);

// Nest providers — order doesn't matter between siblings
return (
  <BackgroundImageContext.Provider value={bgValue}>
    <GridSettingsContext.Provider value={gridValue}>
      {children}
    </GridSettingsContext.Provider>
  </BackgroundImageContext.Provider>
);
```

**Cross-cutting handlers** (e.g., `handleSave` that reads from multiple sub-contexts) use ref wrappers for stable identity:

```typescript
// Ref holds the latest value without causing re-renders
const stateRef = dc.useRef(state);
stateRef.current = state;  // Updated every render

const handleSave = dc.useCallback(() => {
  // Reads from ref — always has latest state
  saveData(stateRef.current);
}, []);  // Empty deps — stable identity
```

## JSX Rules

- **`.tsx` files:** Full JSX support. JSX transpiles to `h()` calls automatically.
- **`.ts` files:** NO JSX. Use `h()` directly if needed: `h('div', { class: 'foo' }, children)`.
- **`.jsx` files:** Legacy. JSX works but no TypeScript.

When rendering into external DOM containers (e.g., Obsidian modals), use `dc.preact.render()` to create an independent Preact tree. Never `appendChild` a Preact-managed node — reconciliation will yank it back.

## Type Imports

Types are compile-time only. Use `import type` with the `#types/` path alias:

```typescript
import type { MapData, MapType } from '#types/core/map.types';
import type { PluginSettings } from '#types/settings/settings.types';
```

The `#types/` alias resolves to `/c/Dev/windrose/types/` via tsconfig. Types are organized:
- `#types/core/` — geometry, cells, maps, common
- `#types/hooks/` — hook return types
- `#types/settings/` — settings types
- `#types/objects/` — object and note types
- `#types/tools/` — tool types
- `#types/contexts/` — context value types

## The `dc` Object

`dc` is a `DatacoreLocalApi` instance. Key properties beyond hooks:

- `dc.resolvePath(filename)` — resolve filename to full vault path
- `dc.require(fullPath)` — load and execute a module, returns its `return {}`
- `dc.app` — full Obsidian `App` instance (vault access, plugins, workspace)
- `dc.preact` — Preact library (for `render()`, etc.)

## File Organization Constraints

| File Type | Can Use Hooks? | Can Use JSX? | Typical Location |
|-----------|---------------|-------------|-----------------|
| Component `.tsx` | Yes | Yes | `components/` |
| Hook `.ts` | Yes | No | `hooks/` |
| Utility `.ts` | No | No | `utils/` |
| Geometry `.ts` | No | No | `geometry/` |
| Context `.tsx` | Yes | Yes | `context/` |

Hooks define functions that use `dc.useState` etc. — the hook calls happen inside those functions at render time. The top-level module code just defines and loads.

## Refactoring Considerations

When splitting a large file into smaller modules:

1. **Each new file needs the `requireModuleByName` bootstrap** at the top
2. **Each new file needs its own `return { }`** at the bottom
3. **Filename must be unique** across the entire project
4. **Circular dependencies will deadlock** — Datacore's `dc.require()` is async and doesn't handle cycles
5. **Extracted hooks must maintain call order** — if hook A calls `dc.useState` before hook B's `dc.useEffect` references it, that ordering must be preserved even after extraction
6. **Refs shared between functions** — if multiple handlers share a `dc.useRef`, they must stay in the same hook or the ref must be passed as a parameter
7. **Context bridges** — if rendering into an external DOM container via `dc.preact.render()`, you must re-provide context via a bridge callback (the independent tree has no shared context with the parent)

## Anti-Patterns

| Anti-Pattern | Why It Fails | Fix |
|-------------|-------------|-----|
| `export function foo()` | No module system at runtime | `return { foo }` |
| `import { foo } from './bar'` | No module system at runtime | `requireModuleByName("bar.ts")` |
| `require('obsidian')` | Not available in Datacore context | Use `window.__windrose` bridge or `dc.app` |
| Shared `useRef` across files | Ref lives in one hook's closure | Pass ref as parameter or keep co-located |
| `dc.useEffect` before `dc.useState` it reads | Datacore doesn't hoist | Reorder declarations |
| `appendChild` on Preact-managed DOM | Preact reconciliation moves it back | Use `dc.preact.render()` for independent tree |
| Duplicate `const` names across destructurings | Datacore `new Function()` throws SyntaxError | Rename or remove from old destructuring first |

## Datacore Runtime Gotchas

### Duplicate `const` Declarations Crash

TypeScript won't catch this, but Datacore's `new Function()` eval will throw a `SyntaxError`:

```typescript
// CRASHES at runtime — duplicate 'hexBounds'
const { hexBounds } = useBackgroundImageSettings();
const { hexBounds } = useGridSettings();  // SyntaxError!

// Fix: rename or remove from one destructuring
const { hexBounds } = useBackgroundImageSettings();
const { gridSize } = useGridSettings();  // Only destructure what you need
```

This commonly happens when splitting a large hook into smaller ones — the parent was destructuring everything from one source, now two sources export overlapping names.

### Hook Declaration Order is Strict

Datacore does not hoist hook declarations. The constraint goes beyond "effects after state":

- **All** `dc.useState` calls referenced by an effect must appear before that effect in source order
- When extracting hooks, the extracted hook's internal `dc.useState` calls count toward the parent component's hook order
- If extraction reorders the total hook count seen by the component, it may break silently
- `dc.useCallback` that references state must also appear after that state declaration

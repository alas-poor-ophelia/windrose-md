# Windrose MapDesigner - Claude Context

## Project Overview

Windrose MapDesigner is a sophisticated TTRPG dungeon/world mapping tool built as an Obsidian plugin using Datacore. It supports both grid and hex maps with drawing tools, object placement, text labels, fog of war, layer management, and coordinate systems.

**Philosophy**: "Digital graph paper in Obsidian" that grew into a full cartography application. Prioritizes stable foundations over quick wins, maintainability over cleverness, and touch-first design for cross-platform compatibility.

## Critical Constraints

### Datacore Runtime Environment

This is NOT a standard React/Node project. Files run inside Obsidian's Datacore plugin:

- **No standard imports/exports** - Use `dc.require()` for dependencies, `return { ... }` at file end for exports
- **Global `dc` object** - Provides React/Preact hooks (`dc.useState`, `dc.useEffect`, `dc.createContext`, etc.)
- **Top-level return statements** - Files end with `return { exportedFunction, ExportedComponent }`
- **No build step** - Code runs as-is; TypeScript is for IDE support only

```javascript
// Example Datacore pattern
const { someUtil } = dc.require('path/to/util.js');

function MyComponent() {
  const [state, setState] = dc.useState(null);
  // ...
}

return { MyComponent };
```

### TypeScript Configuration

- Custom `ts-plugin-datacore` handles Datacore's non-standard patterns
- TypeScript provides IDE support but doesn't compile - Datacore runs the source directly
- Type files in `types/` directory with path alias `#types/*`


### Development Environment (Symlinked Structure)
The project uses an inverted setup to keep the Obsidian vault clean:
```
windrose-dev/                    # Development root (OUTSIDE vault)
├── node_modules/                # Dependencies live here, not in vault
├── package.json
├── tsconfig.json
├── types/                       # TypeScript type definitions
│   ├── core/
│   │   ├── geometry.types.ts
│   │   ├── cell.types.ts
│   │   └── ...
│   └── index.ts
└── src/ ──► SYMLINK ──► vault/path/to/windrose-md/
                         └── (actual source files)
 ```
#### Why this structure:

Prevents node_modules bloat in Obsidian vault (sync, search, performance)
Tooling (TypeScript, ESLint) runs from dev root with full Node.js access
Source files remain in vault where Datacore can execute them
Types are referenced via #types/* path alias in tsconfig

#### Platform notes:

Windows: Symlinks require Developer Mode enabled or Administrator privileges
The symlink points FROM dev environment TO vault source location

#### Claude Access Paths:
- **Source files (vault):** `C:\Users\whipl\OneDrive\Documents\Absalom\Projects\dungeon-map-tracker\`
- **Type definitions (dev):** `C:\Dev\windrose\types\`

When working with types, read/write to the dev folder path above.

### Key Specs (Read Before Working On)
All specs located in `docs/specs/`
- `typescript_migration_spec.md` - TypeScript migration plan
- `partial_cell_painting_spec.md` - Next major feature spec
- `MapCanvas_Composition_Refactor_Plan.md` - Architecture reference

## Architecture Patterns

### Context + Hooks + Layers

The codebase follows a composition pattern established in the MapCanvas refactor:

- **Context Providers**: `MapContext`, `MapSettingsContext`, `MapSelectionContext`, `EventHandlerContext`
- **Custom Hooks**: Encapsulate complex logic (`useCanvasRenderer`, `useDrawingTools`, `useEventCoordinator`, etc.)
- **Layer Components**: Separate rendering concerns (`DrawingLayer`, `ObjectLayer`, `FogOfWarLayer`, etc.)

### Geometry Abstraction

- `BaseGeometry.ts` - Abstract base class
- `GridGeometry.ts` - Square grid implementation
- `HexGeometry.ts` - Hexagonal grid implementation
- Components use geometry abstraction, never assume grid vs hex

### State Management

- React Context API for shared state
- Custom hooks with `useCallback`/`useMemo` for performance
- Settings managed through `settingsReducer.ts` and `settingsAccessor.ts`

## File Organization

```
├── *Context.jsx          # React Contexts
├── *Layer.jsx            # Canvas layer components
├── use*.js               # Custom hooks
├── *Operations.ts        # Pure utility functions
├── *Geometry.ts          # Grid/hex geometry
├── *Renderer.ts          # Canvas rendering
├── *Accessor.ts          # Data access patterns
├── settingsPlugin-*.js   # Settings plugin modules
├── types/*.ts            # TypeScript type definitions
└── *_spec.md             # Feature specifications
```

## Key Principles

### Never Blame Caching
If something seems like a caching issue, it isn't. Find the actual code problem. This applies to:
- React state not updating → Check dependency arrays, reference equality
- Stale data → Check data flow, not caching
- Visual glitches → Check render logic, not browser cache

### Follow Established Patterns
Don't introduce new paradigms. Match existing code patterns:
- New contexts follow `MapContext.jsx` pattern
- New hooks follow existing hook patterns
- New components follow layer composition pattern

### Cross-Platform First
Always consider:
- Touch interfaces (iPad primary mobile target)
- Touch target sizing (44px minimum)
- Pan/zoom gestures
- Desktop keyboard shortcuts as enhancement, not requirement

### Unicode Integrity
When editing files with unicode (degree signs, emojis, special characters):
1. Normalize line endings: `sed -i 's/\r$//' filename`
2. Prefer Python with explicit UTF-8 encoding for edits
3. Verify after edits: `grep -n "Ã\|Â\|Å\|ð" filename`

## Current State

### Active Development
- TypeScript migration in progress (Phase 4 complete, Phase 5 queued)
- Partial cell painting feature implemented, but not yet released (8-triangle subdivision for diagonal walls)
- Version 1.4.2 released with random map generation

## Common Tasks

### Adding a New Utility Function
1. Create in appropriate `*Operations.ts` file
2. Add types to corresponding `types/*_types.ts`
3. Export via `return { ... }` pattern
4. Import via `dc.require()`

### Adding a New Hook
1. Create `use*.js` file following existing patterns
2. Use `dc.useState`, `dc.useCallback`, `dc.useMemo`
3. Return stable references for functions
4. Document parameters and return type in JSDoc

### Adding a New Layer
1. Create `*Layer.jsx` component
2. Use `useMapState()` and other contexts for shared state
3. Handle both grid and hex via geometry abstraction
4. Add to `MapCanvas.jsx` layer composition

## Testing Approach

### E2E Tests (in dev root)
Automated E2E tests using `obsidian-testing-framework` + Vitest + Playwright:
```bash
cd /c/Dev/windrose  # dev root, not src/
npm run test:e2e
```

Test coverage includes:
- Grid/Hex map loading and controls
- Drawing tools (paint, erase, rectangle, circle)
- Object placement and overlay positioning
- Pan/zoom stability

Test fixtures: `tests/fixtures/test-vault/_testing/`

### Manual Verification
For features not yet covered by E2E tests:
- Test on desktop (Windows/macOS)
- Test on iPad (touch primary)
- Check console for errors
- Verify both grid and hex map types

## Don't

- Add `import`/`export` statements (use `dc.require`/`return`)
- Create React class components (functional only)
- Skip reading existing patterns before adding new code
- Assume grid-only (always consider hex)
- Use browser-specific APIs without fallbacks
- Add debug `console.log` without cleanup plan
- Edit existing comments unless their content is now incorrect or misleading
- Use generic type parameters on `dc.*` hook calls (e.g., `dc.useState<T>()`) - Datacore's transpiler doesn't strip them properly; let TypeScript infer types from initial values instead
- Add frivolous comments (commentary, flavor, notes, chatter). JSDoc should be clear and informative with only germane information. Inline comments should be sparse and formal - useful for structure, not explanation of the obvious
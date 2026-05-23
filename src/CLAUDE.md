# Windrose MapDesigner - Claude Context

## Project Overview

Windrose MapDesigner is a TTRPG dungeon/world mapping tool built as a standalone Obsidian Community Plugin using Preact. It supports both grid and hex maps with drawing tools, object placement, text labels, fog of war, layer management, and coordinate systems.

**Philosophy**: "Digital graph paper in Obsidian" that grew into a full cartography application. Prioritizes stable foundations over quick wins, maintainability over cleverness, and touch-first design for cross-platform compatibility.

## Critical Constraints

### Standalone Plugin Architecture

This is a standard Obsidian Community Plugin using Preact (not React):

- **ES module imports/exports** — standard `import`/`export` syntax throughout
- **Preact hooks** — `useState`, `useCallback`, `useMemo`, `useEffect` from `preact/hooks`
- **esbuild bundling** — `esbuild.config.mjs` compiles to `main.js`
- **Obsidian API** — `import { Plugin, Modal, Setting } from 'obsidian'`
- **App access** — `useApp()` hook from `src/context/AppContext.tsx` in components, `app: App` parameter in utility functions

```typescript
// Standard Windrose pattern
import { useState, useCallback } from 'preact/hooks';
import { useMapState } from '../context/MapContext';
import type { Cell } from '#types';

function MyComponent() {
  const { geometry } = useMapState();
  const [state, setState] = useState(null);
  // ...
}

export { MyComponent };
```

### TypeScript Configuration

- Standard TypeScript with all strict flags enabled
- Type files in `types/` directory with path alias `#types/*`
- JSX configured for Preact (`jsxImportSource: "preact"`)
- `tsconfig.check.json` for type checking (separate from build)

### Development Environment (Symlinked Structure)
The project uses an inverted setup to keep the Obsidian vault clean:
```
windrose/                        # Development root (OUTSIDE vault)
├── node_modules/                # Dependencies live here, not in vault
├── esbuild.config.mjs           # Build config
├── package.json
├── tsconfig.json
├── types/                       # TypeScript type definitions
│   ├── core/
│   ├── hooks/
│   ├── objects/
│   └── index.ts                 # Barrel export
├── tests/
│   ├── unit/                    # Vitest unit tests (~1200 tests)
│   └── e2e/                     # Playwright E2E tests
└── src/ ──► SYMLINK ──► vault/path/to/dungeon-map-tracker/
                         └── (actual source files)
```

#### Why this structure:
- Prevents node_modules bloat in Obsidian vault (sync, search, performance)
- Tooling (TypeScript, ESLint, esbuild) runs from dev root with full Node.js access
- Source files remain in vault for live testing in Obsidian
- Types are referenced via `#types/*` path alias

## Architecture Patterns

### Context + Hooks + Layers

The codebase follows a composition pattern:

- **Context Providers**: `MapContext`, `MapSettingsContext`, `MapSelectionContext`, `EventHandlerContext`, `AppContext`
- **Custom Hooks**: Encapsulate complex logic (`useCanvasRenderer`, `useDrawingTools`, `useEventCoordinator`, etc.)
- **Layer Components**: Separate rendering concerns (`DrawingLayer`, `ObjectLayer`, `FogOfWarLayer`, etc.)

### Geometry Abstraction

- `BaseGeometry.ts` — Abstract base class with iOS canvas workarounds
- `GridGeometry.ts` — Square grid implementation
- `HexGeometry.ts` — Hexagonal grid implementation
- Components use geometry abstraction, never assume grid vs hex
- See `geometry/CLAUDE.md` for IGeometry methods, coordinate systems, and iOS canvas patterns

### State Management

- Preact Context API for shared state
- Custom hooks with `useCallback`/`useMemo` for performance
- Settings managed through `settingsReducer.ts` and `settingsAccessor.ts` (reads from plugin singleton)

### Plugin Entry Point

`src/main.ts` — extends Obsidian's `Plugin` class:
- Registers `windrose-map` code block processor (YAML → map render)
- Registers deep link handlers (protocol, markdown, CM6 extension)
- Loads/saves plugin settings via `settingsAccessor.ts`
- Provides `App` instance to components via `AppContext`

## File Organization

```
src/
├── main.ts               # Plugin entry point
├── core/                  # App infrastructure
│   ├── dmtConstants.ts    # Constants, theme, defaults
│   ├── settingsAccessor.ts # Plugin settings read/write
│   ├── deepLinkRegistration.ts # Deep link system (4-layer)
│   └── interactjs.ts      # interact.js wrapper
├── objects/               # Map object domain
│   ├── objectTypes.ts
│   ├── objectOperations.ts
│   └── ...
├── drawing/               # Cell painting & interaction math
├── text/                  # Text label domain
├── assets/                # Icons & tileset operations
├── persistence/           # Data I/O & vault interaction
│   ├── fileOperations.ts
│   ├── layerAccessor.ts
│   └── ...
├── geometry/
│   ├── core/              # Geometry abstractions (Base/Grid/Hex)
│   ├── renderers/         # Canvas draw functions
│   ├── fog/               # Fog-of-war rendering pipeline
│   └── curves/            # Bezier math & boolean ops
├── hooks/
│   ├── canvas/            # Canvas infrastructure
│   ├── drawing/           # Drawing tools
│   ├── objects/           # Object interactions
│   ├── state/             # State management & data
│   └── interactions/      # Feature-specific tool interactions
├── components/
│   ├── controls/          # Map chrome & navigation
│   ├── modals/            # Modal dialogs (native Obsidian)
│   ├── overlays/          # Non-modal floating UI
│   ├── panels/            # Sidebar/docked panels
│   ├── toolbars/          # Action toolbars
│   ├── shared/            # Reusable primitives (Icon, InternalLink)
│   ├── mapcanvas/         # Canvas layer components
│   └── settings/          # Settings UI components
├── context/               # Preact Contexts
├── settings/              # Obsidian settings tab
│   ├── WindroseSettingsTab.js  # Main settings tab
│   ├── helpers/           # Settings utilities
│   ├── modals/            # Settings modals
│   └── tabs/              # Tab render mixins
└── generation/            # Random map generation
```

## Key Principles

### Never Blame Caching
If something seems like a caching issue, it isn't. Find the actual code problem. This applies to:
- State not updating → Check dependency arrays, reference equality
- Stale data → Check data flow, not caching
- Visual glitches → Check render logic, not browser cache

### Follow Established Patterns
Don't introduce new paradigms. Match existing code patterns:
- New contexts follow `MapContext.tsx` pattern
- New hooks follow existing hook patterns
- New components follow layer composition pattern

### Cross-Platform First
Always consider:
- Touch interfaces (iPad primary mobile target)
- Touch target sizing (44px minimum)
- Pan/zoom gestures
- Desktop keyboard shortcuts as enhancement, not requirement

## Common Tasks

### Adding a New Utility Function
1. Create in the appropriate domain directory (`core/`, `objects/`, `drawing/`, `text/`, `assets/`, `persistence/`)
2. Add types to corresponding `types/*.types.ts`
3. Export via `export { myFunction }`
4. Import via `import { myFunction } from '../path/to/file'`
5. If the function needs Obsidian's App, take `app: App` as the first parameter

### Adding a New Hook
1. Create `use*.ts` file in the appropriate `hooks/` subdirectory
2. Use `useState`, `useCallback`, `useMemo`, `useEffect` from `preact/hooks`
3. Return stable references for functions
4. Document parameters and return type
5. Export via `export { useMyHook }`

### Adding a New Layer
1. Create `*Layer.tsx` component in `components/mapcanvas/`
2. Use `useMapState()` and other contexts for shared state
3. Handle both grid and hex via geometry abstraction
4. Add to `MapCanvas.tsx` layer composition

## Testing

### Unit Tests
```bash
npm run test:unit    # ~1200 tests, ~300ms
```

### E2E Tests
```bash
npm run test:e2e     # Full Obsidian integration via Playwright
```

### Type Check + Lint
```bash
npm run check        # tsc --noEmit + eslint
```

**Always verify both grid AND hex maps** — geometry abstraction bugs often only appear on one type.

## Don't

- Create class components (functional + hooks only)
- Skip reading existing patterns before adding new code
- Assume grid-only (always consider hex)
- Use browser-specific APIs without fallbacks
- Add debug `console.log` without cleanup plan
- Read or write `compiled-windrose-md.md` (generated artifact)

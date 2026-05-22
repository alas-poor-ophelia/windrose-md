# Adding Features to Windrose

Step-by-step guide for implementing new functionality.

## Step 1: Identify Your Domain

Most features live in `src/`. Only modify the Settings Tab (`src/settings/`) if you're changing global Obsidian preferences.

| Domain | Location | When to Use |
|--------|----------|-------------|
| Map features | `src/**` | Tools, rendering, hooks, components |
| Settings UI | `src/settings/` | Global Obsidian settings tab |
| Types | `types/` (dev root) | TypeScript type definitions |

See `src/CLAUDE.md` for architecture details.

## Step 2: Find Reference Patterns

Before writing code, find similar existing features:

| Adding... | Reference These |
|-----------|-----------------|
| New tool | `useDrawingTools.ts`, `useAreaSelect.ts` |
| New layer | `DrawingLayer.tsx`, `ObjectLayer.tsx` |
| New modal/UI | `components/modals/`, `components/overlays/` |
| New geometry operation | `geometry/core/GridGeometry.ts`, `geometry/core/HexGeometry.ts` |
| New hook | `hooks/use*.ts` |
| New context | `context/*Context.tsx` |

## Step 3: Create Files Following Conventions

| Need | File Pattern | Location |
|------|--------------|----------|
| Shared state | `*Context.tsx` | `src/context/` |
| Reusable logic | `use*.ts` | `src/hooks/` |
| Pure functions | `*Operations.ts` | Appropriate domain dir |
| Canvas rendering | `*Renderer.ts` | `src/geometry/renderers/` |
| Data access | `*Accessor.ts` | `src/persistence/` |
| Preact component | `*.tsx` | `src/components/` |
| Types | `*.types.ts` | `types/` (dev root) |

## Step 4: Wire Up Exports and Imports

**Exporting** (standard ES modules):
```typescript
export { myFunction, MyComponent };
```

**Importing** (in consumer file):
```typescript
import { myFunction, MyComponent } from '../path/to/MyFile';
```

**Type imports** (from the types directory):
```typescript
import type { Cell, MapData } from '#types';
```

## Step 5: Test Your Feature

| What to Test | Where |
|--------------|-------|
| Pure logic (math, algorithms) | Unit tests (`tests/unit/`) |
| User interactions | E2E tests (`tests/e2e/`) |
| Visual rendering | Manual + E2E |

**Always verify both grid AND hex maps** - geometry abstraction bugs often only appear on one type.

```bash
npm run test:unit    # Fast, ~300ms
npm run test:e2e     # Full integration
npm run check        # Typecheck + lint
```

## Checklist Before PR

- [ ] Follows existing file naming conventions
- [ ] Uses standard ES `import`/`export` syntax
- [ ] Works on both grid and hex maps
- [ ] No `console.log` left behind
- [ ] Types added to `types/` if needed
- [ ] Unit tests for pure logic
- [ ] E2E test if user-facing
- [ ] `npm run check` passes

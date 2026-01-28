# Adding Features to Windrose

Step-by-step guide for implementing new functionality.

## Step 1: Identify Your Loading Context

Most features live in **Datacore Runtime** (src/**). Only modify the Settings Plugin if you're changing global Obsidian preferences.

| Context | Location | When to Use |
|---------|----------|-------------|
| Datacore Runtime | `src/**` | Map features, tools, rendering, hooks |
| Settings Plugin | `settingsplugin/` | Global Obsidian settings only |

See `src/CLAUDE.md` → "Module Loading Contexts" for details.

## Step 2: Find Reference Patterns

Before writing code, find similar existing features:

| Adding... | Reference These |
|-----------|-----------------|
| New tool | `useDrawingTools.ts`, `useAreaSelect.ts` |
| New layer | `DrawingLayer.tsx`, `ObjectLayer.tsx` |
| New modal/UI | `components/*.tsx` |
| New geometry operation | `geometry/GridGeometry.ts`, `geometry/HexGeometry.ts` |
| New hook | `hooks/use*.ts` |
| New context | `context/*Context.tsx` |

## Step 3: Create Files Following Conventions

| Need | File Pattern | Location |
|------|--------------|----------|
| Shared state | `*Context.tsx` | `context/` |
| Reusable logic | `use*.ts` | `hooks/` |
| Pure functions | `*Operations.ts` | `utils/` |
| Canvas rendering | `*Renderer.ts` | `geometry/` |
| Data access | `*Accessor.ts` | `utils/` |
| React component | `*.tsx` | `components/` |
| Types | `*.types.ts` | `types/` (dev root) |

## Step 4: Wire Up Exports and Imports

**Exporting** (at end of your file):
```typescript
return { myFunction, MyComponent };
```

**Importing** (in consumer file):
```typescript
const { myFunction, MyComponent } = await requireModuleByName("MyFile.ts");
```

**For unit tests**, add your module to `MODULE_MAP` in `tests/unit/datacore-transformer.ts`:
```typescript
const MODULE_MAP = {
  // ...existing entries
  'MyFile.ts': './path/to/MyFile.ts',
};
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
npm run test:e2e     # Full integration, ~35-40s
npm run check        # Typecheck + lint
```

## Checklist Before PR

- [ ] Follows existing file naming conventions
- [ ] Uses `dc.require()`/`return {}` pattern (no ES imports/exports)
- [ ] Works on both grid and hex maps
- [ ] No `console.log` left behind
- [ ] Types added to `types/` if needed
- [ ] Unit tests for pure logic
- [ ] E2E test if user-facing
- [ ] `npm run check` passes

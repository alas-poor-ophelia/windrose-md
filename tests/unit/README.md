# Unit Testing for Windrose

This directory contains unit tests for Windrose's pure logic modules. Tests run via Vitest without requiring Obsidian.

## Quick Start

```bash
npm run test:unit           # Run all unit tests
npm run test:unit -- --watch  # Watch mode for development
```

## How It Works

Windrose uses Datacore's module system which isn't compatible with standard ES modules:
- Datacore uses `dc.require()` and `requireModuleByName()` for imports
- Datacore uses `return { ... }` for exports (not `export`)

The **datacore-transformer** Vite plugin converts these patterns to ES modules at test time, allowing direct imports in tests.

## The Datacore Transformer

Located at `tests/unit/datacore-transformer.ts`, this Vite plugin:

1. **Converts imports**: `requireModuleByName("Module.ts")` → `import { ... } from "./path/Module.ts"`
2. **Converts exports**: `return { foo, bar }` → `export { foo, bar }`
3. **Removes bootstrap**: Comments out pathResolver bootstrap patterns
4. **Mocks dc.\***: Provides minimal mocks for remaining `dc.*` calls

### MODULE_MAP

The transformer uses a `MODULE_MAP` to resolve module names to file paths:

```typescript
const MODULE_MAP: Record<string, string> = {
  'GridGeometry.ts': './geometry/GridGeometry.ts',
  'HexGeometry.ts': './geometry/HexGeometry.ts',
  'cellAccessor.ts': './geometry/cellAccessor.ts',
  // ... more mappings
};
```

## Adding Tests for a New Module

### Step 1: Check MODULE_MAP

If your module imports other modules via `requireModuleByName()`, ensure all dependencies are in MODULE_MAP.

Look at the source file for patterns like:
```typescript
const { SomeFunc } = await requireModuleByName("SomeModule.ts") as { ... };
```

Add any missing modules to MODULE_MAP in `datacore-transformer.ts`:
```typescript
'SomeModule.ts': './path/to/SomeModule.ts',
```

### Step 2: Create Test File

Create `tests/unit/<category>/<ModuleName>.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { myFunction } from "../../../src/path/to/module.ts";

describe("ModuleName", () => {
  describe("myFunction", () => {
    it("does something expected", () => {
      expect(myFunction(input)).toEqual(expectedOutput);
    });
  });
});
```

### Step 3: Run Tests

```bash
npm run test:unit
```

If you see errors about missing modules or undefined functions, check:
1. Is the module in MODULE_MAP?
2. Does the module have unusual pathResolver patterns that need new transformer rules?

## Debugging Transformer Issues

Enable debug logging in `vitest.unit.config.ts`:

```typescript
datacoreTransformer({
  sourceDir: "src",
  debug: true,  // <-- Enable logging
}),
```

This shows:
- Which files are being transformed
- What imports are being generated
- What exports are being created

## Test Organization

```
tests/unit/
├── datacore-transformer.ts   # The Vite plugin
├── README.md                 # This file
├── geometry/
│   ├── GridGeometry.test.ts  # Grid coordinate math
│   ├── HexGeometry.test.ts   # Hex coordinate math
│   ├── cellAccessor.test.ts  # Cell data structures
│   └── cellAccessor-import.test.ts  # Import via transformer
└── utils/                    # (future) Utility tests
```

## What to Test

**Good candidates for unit tests:**
- Pure functions (no side effects)
- Coordinate transformations
- Math/algorithm implementations
- Data structure utilities

**Not suitable for unit tests (use E2E instead):**
- React components
- Canvas rendering
- Event handlers
- Anything requiring Obsidian APIs

## Common Patterns

### Testing with -0 vs +0

JavaScript has negative zero (`-0`), which `toEqual()` distinguishes from `+0`. Use `==` comparison:

```typescript
// This may fail due to -0
expect(result).toEqual({ x: 0, y: 0 });

// This works
expect(result.x == 0).toBe(true);
expect(result.y == 0).toBe(true);
```

### Testing Floating Point

Use `toBeCloseTo()` for floating point comparisons:

```typescript
expect(result.worldX).toBeCloseTo(expectedX, 10);
```

### Testing Both Orientations (Hex)

For hex geometry, test both flat-top and pointy-top:

```typescript
describe("flat-top orientation", () => {
  let geometry: InstanceType<typeof HexGeometry>;
  beforeEach(() => {
    geometry = new HexGeometry(40, "flat");
  });
  // tests...
});

describe("pointy-top orientation", () => {
  let geometry: InstanceType<typeof HexGeometry>;
  beforeEach(() => {
    geometry = new HexGeometry(40, "pointy");
  });
  // tests...
});
```

## Configuration

Unit tests are configured in `vitest.unit.config.ts`:

```typescript
export default defineConfig({
  plugins: [
    datacoreTransformer({
      sourceDir: "src",
      debug: false,
    }),
  ],
  test: {
    include: ["tests/unit/**/*.test.ts"],
    testTimeout: 5000,
    pool: "threads",
  },
  resolve: {
    alias: {
      "#types": path.resolve(__dirname, "types"),
    },
  },
});
```

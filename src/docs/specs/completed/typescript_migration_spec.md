# TypeScript Migration Specification

**Version**: 1.5.x (Dungeon/Hardening Release)  
**Status**: Proposal  
**Scope**: Full codebase migration to TypeScript

---

## Rationale

### Why TypeScript Now

The Windrose codebase has crossed a complexity threshold where static typing provides significant value:

1. **Geometry Abstraction Layer**: `BaseGeometry`, `GridGeometry`, `HexGeometry` define an abstract contract via JSDoc, but nothing enforces implementation correctness. TypeScript interfaces would make the polymorphic API explicit and catch mismatches at edit-time.

2. **Context-Heavy Architecture**: The recent refactor introduced multiple React Contexts (`MapSettingsContext`, `MapSelectionContext`, `EventHandlerContext`) that pass complex state objects. Type definitions would catch shape mismatches immediately rather than at runtime.

3. **Settings/Reducer Complexity**: `settingsReducer.js` alone has 19 action types and a deeply nested state shape. Type-checked actions and state would prevent subtle bugs.

4. **Segment System**: The new partial cell painting feature added intricate data structures (`segments` objects, adjacency maps, border calculations). This is exactly where types prevent the kind of "wait, is this `{x, y}` or `{col, row}`?" confusion that costs debugging hours.

5. **Future-Proofing**: The roadmap includes tileset support, hierarchical regions, and z-layer architecture. Each of these will add complexity; types scale better than hope.

### Why Not Full Plugin Conversion

The TypeScript migration is **separate** from converting Windrose to a standalone Obsidian plugin. The decision:

| Factor | TypeScript in Datacore | Full Plugin |
|--------|------------------------|-------------|
| iPad Development | ✅ Preserved | ❌ Requires compile step |
| Distribution | Same as now | More formal (BRAT, Community) |
| User Relationship | Casual, small community | More "official" |
| Work Required | Incremental, low-risk | Substantial, all-at-once |
| Benefit | Types, tooling, safety | Marginal performance, "correctness" |

**Decision**: Proceed with TypeScript in Datacore. Defer plugin conversion indefinitely unless circumstances change (e.g., Datacore becomes unmaintained).

---

## Datacore TypeScript Mechanics

### Official Type Sources

Datacore is an open-source TypeScript project and publishes official types:

**`@blacksmithgu/datacore`** (npm package)
- Official API types maintained by Datacore
- Includes `DatacoreLocalApi` interface (the `dc` object)
- React/Preact hook types
- Query API types

**`obsidian-typings`** (https://github.com/Fevol/obsidian-typings)
- Unofficial but maintained community types for Obsidian's API
- Extends the official `obsidian.d.ts` with internal APIs
- Useful for any direct Obsidian API access we have through Datacore

### Module Pattern

Datacore's TS support uses a hybrid approach:

**Type Definitions**: Standard ES6 `import type` / `export type`
```typescript
// types/geometry.types.ts
export interface Point {
  x: number;
  y: number;
}

export interface GridCoords {
  gridX: number;
  gridY: number;
}
```

**Script Modules**: Continue using `dc.require()` / `return {}`
```typescript
// someModule.ts
const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

// Import types using ES6 (types only, not runtime imports)
import type { Point, GridCoords } from './types/geometry.types';
import type { DatacoreLocalApi } from '@blacksmithgu/datacore';

// Declare dc with proper type (provided by Datacore runtime)
declare const dc: DatacoreLocalApi;

// Implementation with types
function calculateDistance(a: Point, b: Point): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

// Export using Datacore pattern
return { calculateDistance };
```

### Type Checking Behavior

Datacore uses **transpile-only** mode (strips types, doesn't validate at compile time). This means:

- **VS Code**: Full type checking via language service (red squiggles, autocomplete)
- **Runtime**: No type enforcement (TypeScript never has runtime checks)
- **iPad**: Code works, but no type feedback in Textastic

This is acceptable. The value is in the development experience and documentation, not runtime validation.

### Verification Test

Before full migration, validate the mechanics:

1. Install `@blacksmithgu/datacore` types (for development only)
2. Create `types/test.types.ts` with a simple interface
3. Create `testModule.ts` that imports the type and uses it
4. Confirm VS Code shows type errors for intentional mistakes
5. Confirm Datacore executes the module correctly

---

## Initial Setup

### Phase 0: Infrastructure (~2-3 hours)

#### 1. Install Development Dependencies

```bash
# TypeScript and type definitions
npm install --save-dev typescript @blacksmithgu/datacore

# Optional: Extended Obsidian types (if we need internal APIs)
npm install --save-dev obsidian-typings

# ESLint with Obsidian plugin
npm install --save-dev eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-plugin-obsidianmd
```

#### 2. Create Type Directory Structure

```
/WindroseMD/
├── types/
│   ├── core/
│   │   ├── geometry.types.ts      # Point, Coords, Bounds
│   │   ├── cell.types.ts          # Cell, SegmentCell, CellMap
│   │   ├── map.types.ts           # MapData, Layer, Settings
│   │   └── common.types.ts        # Shared primitives
│   ├── objects/
│   │   ├── object.types.ts        # MapObject, ObjectType
│   │   └── note.types.ts          # NotePin, TextLabel
│   ├── tools/
│   │   ├── tool.types.ts          # Tool enum, ToolState
│   │   └── drawing.types.ts       # DrawingState, ShapeMode
│   ├── settings/
│   │   ├── settings.types.ts      # SettingsState, Preferences
│   │   └── actions.types.ts       # Action types for reducer
│   ├── contexts/
│   │   └── context.types.ts       # Context value shapes
│   └── index.ts                   # Re-exports all types
```

#### 3. Configure tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationDir": "./types/generated",
    "emitDeclarationOnly": false,
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "paths": {
      "@types/*": ["./types/*"],
      "@blacksmithgu/datacore": ["./node_modules/@blacksmithgu/datacore"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", "types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

#### 4. Configure ESLint

**Good news**: Testing confirmed that the TypeScript ESLint parser handles Datacore patterns **natively**. The parser treats files as async contexts where top-level `await` and `return` are valid—exactly matching Datacore's runtime behavior. No rules need to be disabled.

Create `eslint.config.mjs`:

```javascript
import tsparser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import obsidianmd from "eslint-plugin-obsidianmd";

export default [
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { 
        project: "./tsconfig.json",
        ecmaVersion: 2020,
        sourceType: "module",
        ecmaFeatures: {
          jsx: true
        }
      },
      globals: {
        dc: "readonly"  // Datacore global
      }
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "obsidianmd": obsidianmd
    },
    rules: {
      // ===========================================
      // TypeScript Strict Rules
      // ===========================================
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-function-return-type": ["warn", {
        "allowExpressions": true,
        "allowTypedFunctionExpressions": true
      }],
      "@typescript-eslint/no-unused-vars": ["error", { 
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_"
      }],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/strict-boolean-expressions": "warn",
      "@typescript-eslint/no-non-null-assertion": "warn",
      
      // ===========================================
      // Standard ESLint Rules
      // ===========================================
      "no-unreachable": "error",        // Catches code after return (works correctly!)
      "no-console": "warn",             // Catch debug logging
      "eqeqeq": ["error", "always"],    // Require === and !==
      "prefer-const": "error",
      
      // ===========================================
      // Obsidian-Specific Rules (cherry-picked)
      // ===========================================
      // iOS compatibility - CRITICAL for iPad support
      "obsidianmd/regex-lookbehind": "error",
      
      // Platform detection best practices
      "obsidianmd/platform": "warn",
      
      // Prefer CSS classes over inline styles
      "obsidianmd/no-static-styles-assignment": "warn"
    }
  },
  
  // ===========================================
  // Legacy JS files (during migration)
  // ===========================================
  {
    files: ["**/*.js", "**/*.jsx"],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "module",
      globals: {
        dc: "readonly"
      }
    },
    plugins: {
      "obsidianmd": obsidianmd
    },
    rules: {
      // Only iOS compatibility for legacy files
      "obsidianmd/regex-lookbehind": "error"
    }
  }
];
```

**Why this works**: The TypeScript parser with `sourceType: "module"` accepts top-level `await` and `return` as valid syntax. This aligns with how Datacore wraps script execution in an async context. The `no-unreachable` rule correctly flags any code placed *after* the `return { }` statement, which is exactly what we want.

**Tested patterns that pass:**
- Top-level `await` for `dc.require()` imports ✓
- Top-level `return { ... }` for module exports ✓
- JSX/TSX components with hooks ✓
- Type-aware rules like `no-floating-promises` ✓

#### 5. Add npm Scripts

Update `package.json`:

```json
{
  "scripts": {
    "lint": "eslint . --ext .ts,.tsx,.js,.jsx",
    "lint:fix": "eslint . --ext .ts,.tsx,.js,.jsx --fix",
    "typecheck": "tsc --noEmit",
    "check": "npm run typecheck && npm run lint"
  }
}
```

#### 6. Create Global Type Declarations

Create `types/datacore-globals.d.ts` for any Datacore-specific globals not covered by the official types:

```typescript
/**
 * Datacore Global Extensions
 * 
 * The @blacksmithgu/datacore package provides DatacoreLocalApi types,
 * but we may need to extend or clarify some aspects for our usage.
 */

import type { DatacoreLocalApi } from '@blacksmithgu/datacore';

// Ensure dc is available globally
declare global {
  const dc: DatacoreLocalApi;
}

// Re-export commonly used types for convenience
export type { DatacoreLocalApi };
```

---

## Obsidian Developer Guidelines

Even though Windrose is a Datacore script rather than a standalone plugin, Obsidian's official developer policies provide useful guidance. From the AGENTS.md:

### Core Principles

1. **Default to local/offline operation**: Only make network requests when essential
2. **No hidden telemetry**: If analytics are ever added, require explicit opt-in
3. **Never execute remote code**: No fetch-and-eval patterns
4. **Minimize scope**: Read/write only what's necessary inside the vault
5. **Respect user privacy**: Don't collect vault contents or personal information

### Technical Guidelines

1. **iOS Compatibility**: Avoid regex lookbehinds (not supported in some iOS versions)
   - ESLint rule: `obsidianmd/regex-lookbehind`
   
2. **Platform Detection**: Use Obsidian's Platform API, not navigator
   - ESLint rule: `obsidianmd/platform`
   
3. **Prefer CSS Classes**: Avoid setting styles directly on DOM elements
   - ESLint rule: `obsidianmd/no-static-styles-assignment`
   
4. **Clean Up Resources**: Register and clean up all DOM, app, and interval listeners

### Windrose-Specific Adaptations

Since we're in Datacore, some plugin patterns don't apply:
- No `manifest.json` validation needed
- No `onunload()` lifecycle (Datacore handles cleanup)
- No direct leaf management

But these still apply:
- iOS Safari compatibility (canvas operations, regex)
- Clean resource management in React components
- File API best practices for map data storage

---

## Test Case Migration

### Selected Files for Initial Conversion

These files are chosen for:
- Stability (not actively being modified)
- Clear type boundaries
- Foundation for other modules

#### 1. `dmtConstants.js` → `dmtConstants.ts`

**Why**: Pure data, no logic complexity. Defines foundational types that other modules depend on.

**Type Definitions Needed**:
```typescript
// types/core/constants.types.ts

export interface ThemeColors {
  grid: {
    lines: string;
    lineWidth: number;
    background: string;
  };
  cells: {
    fill: string;
    border: string;
    borderWidth: number;
  };
  coordinateKey: { color: string };
  coordinateText: { color: string; shadow: string };
  compass: { color: string; size: number };
  fogOfWar: {
    color: string;
    opacity: number;
    blurEnabled: boolean;
    blurFactor: number;
  };
}

export interface Defaults {
  gridSize: number;
  dimensions: { width: number; height: number };
  hexSize: number;
  hexOrientation: 'flat' | 'pointy';
  hexBounds: { maxCol: number; maxRow: number };
  mapType: 'grid' | 'hex';
  initialZoom: number;
  canvasSize: { width: number; height: number };
  maxHistory: number;
  minZoom: number;
  maxZoom: number;
  zoomButtonStep: number;
  zoomWheelStep: number;
  distance: DistanceDefaults;
}

export interface DistanceDefaults {
  perCellGrid: number;
  perCellHex: number;
  unitGrid: string;
  unitHex: string;
  gridDiagonalRule: 'alternating' | 'equal' | 'euclidean';
  displayFormat: 'cells' | 'units' | 'both';
}

export type SegmentName = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export interface SegmentVertex {
  xRatio: number;
  yRatio: number;
}

export type CornerName = 'TL' | 'TR' | 'BR' | 'BL';
export type DiagonalDirection = 'TL-BR' | 'TR-BL';
```

#### 2. `BaseGeometry.js` → `BaseGeometry.ts`

**Why**: Defines the abstract interface that `GridGeometry` and `HexGeometry` must implement. This is the most valuable place for types—they become the contract.

**Type Definitions Needed**:
```typescript
// types/core/geometry.types.ts

export interface Point {
  x: number;
  y: number;
}

export interface ScreenCoords {
  screenX: number;
  screenY: number;
}

export interface WorldCoords {
  worldX: number;
  worldY: number;
}

export interface OffsetCoords {
  col: number;
  row: number;
}

export interface Bounds {
  maxCol: number;
  maxRow: number;
}

export interface StrokeStyle {
  lineColor?: string;
  lineWidth?: number;
}

export interface GridStyle {
  lines?: string;
  lineWidth?: number;
  background?: string;
}

// Abstract interface - geometry implementations must satisfy this
export interface IGeometry {
  // Coordinate conversions
  worldToGrid(worldX: number, worldY: number): { gridX: number; gridY: number } | { q: number; r: number };
  gridToWorld(x: number, y: number): WorldCoords;
  gridToScreen(x: number, y: number, offsetX: number, offsetY: number, zoom: number): ScreenCoords;
  
  // Cell operations
  getScaledCellSize(zoom: number): number;
  createCellObject(coords: Point, color: string): Cell;
  cellMatchesCoords(cell: Cell, coords: Point): boolean;
  
  // Shape queries
  getCellsInRectangle(x1: number, y1: number, x2: number, y2: number): Point[];
  getCellsInCircle(centerX: number, centerY: number, radius: number): Point[];
  getCellsInLine(x1: number, y1: number, x2: number, y2: number): Point[];
  
  // Distance
  getEuclideanDistance(x1: number, y1: number, x2: number, y2: number): number;
  getManhattanDistance(x1: number, y1: number, x2: number, y2: number): number;
  getCellDistance(x1: number, y1: number, x2: number, y2: number, options?: DistanceOptions): number;
  
  // Neighbors and bounds
  getNeighbors(x: number, y: number): Point[];
  isWithinBounds(x: number, y: number): boolean;
  clampToBounds(x: number, y: number): Point;
  
  // Offset coordinate support
  toOffsetCoords(gridX: number, gridY: number): OffsetCoords;
  cellToOffsetCoords(cell: Cell): OffsetCoords;
  isBounded(): boolean;
  getBounds(): Bounds | null;
  
  // Rendering
  drawGrid(
    ctx: CanvasRenderingContext2D,
    offsetX: number,
    offsetY: number,
    width: number,
    height: number,
    zoom: number,
    style: GridStyle
  ): void;
}

export interface DistanceOptions {
  diagonalRule?: 'alternating' | 'equal' | 'euclidean';
}
```

#### 3. `cellAccessor.js` → `cellAccessor.ts`

**Why**: Central data access layer. Touches every cell operation. Types here propagate correctness throughout the system.

**Type Definitions Needed**:
```typescript
// types/core/cell.types.ts

import type { SegmentName } from './constants.types';
import type { Point } from './geometry.types';

// Simple cell (full cell painted)
export interface SimpleCell {
  x: number;
  y: number;
  color: string;
  opacity?: number;
}

// Segment cell (partial cell painted)
export interface SegmentCell {
  x: number;
  y: number;
  segments: Partial<Record<SegmentName, true>>;
  color: string;
  opacity?: number;
}

// Union type for any cell
export type Cell = SimpleCell | SegmentCell;

// Type guard
export function hasSegments(cell: Cell): cell is SegmentCell {
  return 'segments' in cell && cell.segments !== undefined;
}

// Cell map for efficient lookup
export type CellMap = Map<string, Cell>;

// Function signatures for accessor module
export interface CellAccessor {
  getCellAt(cells: Cell[], coords: Point, geometry: IGeometry): Cell | undefined;
  setCell(cells: Cell[], coords: Point, color: string, opacity: number, geometry: IGeometry): Cell[];
  removeCell(cells: Cell[], coords: Point, geometry: IGeometry): Cell[];
  setSegments(cells: Cell[], coords: Point, segmentList: SegmentName[], color: string, opacity: number, geometry: IGeometry): Cell[];
  removeSegments(cells: Cell[], coords: Point, segmentList: SegmentName[], geometry: IGeometry): Cell[];
  getFilledSegments(cell: Cell): SegmentName[];
  normalizeCell(cell: Cell): Cell;
  buildCellMap(cells: Cell[]): CellMap;
  getCellKey(x: number, y: number): string;
}
```

---

## Migration Progression Plan

### Tier 1: Foundation Types (Week 1)

Files that define core data shapes used everywhere. Migrate these first to establish the type vocabulary.

| File | Priority | Dependencies | Notes |
|------|----------|--------------|-------|
| `dmtConstants.js` | 1 | None | Pure constants, defines foundational types |
| `BaseGeometry.js` | 2 | constants | Abstract interface definition |
| `cellAccessor.js` | 3 | constants, geometry | Central data access layer |
| `colorOperations.js` | 4 | None | Simple utilities |
| `objectTypes.js` | 5 | None | Object type definitions |

### Tier 2: Geometry & Rendering (Week 2)

Geometry implementations and their rendering counterparts. These are large files but stable.

| File | Priority | Dependencies | Notes |
|------|----------|--------------|-------|
| `GridGeometry.js` | 1 | BaseGeometry | Implements IGeometry |
| `HexGeometry.js` | 2 | BaseGeometry | Implements IGeometry |
| `gridRenderer.js` | 3 | GridGeometry | Grid-specific rendering |
| `hexRenderer.js` | 4 | HexGeometry | Hex-specific rendering |
| `segmentRenderer.js` | 5 | constants, geometry | New, clean target |
| `segmentBorderCalculator.js` | 6 | constants, geometry | New, clean target |

### Tier 3: Operations & Accessors (Week 3)

Utility modules that operate on map data. Well-bounded, pure functions.

| File | Priority | Dependencies | Notes |
|------|----------|--------------|-------|
| `layerAccessor.js` | 1 | cell, geometry | Large but well-structured |
| `settingsAccessor.js` | 2 | constants | Settings retrieval |
| `objectOperations.js` | 3 | objectTypes, geometry | Object manipulation |
| `edgeOperations.js` | 4 | geometry | Edge painting |
| `textLabelOperations.js` | 5 | geometry | Text label management |
| `noteOperations.js` | 6 | geometry | Note pin management |
| `diagonalFillOperations.js` | 7 | constants, cells | New feature |
| `exportOperations.js` | 8 | All above | Export functionality |

### Tier 4: Reducer & Settings (Week 4)

Complex state management. Benefits most from types but also most work.

| File | Priority | Dependencies | Notes |
|------|----------|--------------|-------|
| `settingsReducer.js` | 1 | constants, settings | 19 action types, complex state |
| `distanceOperations.js` | 2 | constants | Distance calculations |
| `hexMeasurements.js` | 3 | geometry | Hex sizing calculations |
| `multiSelectOperations.js` | 4 | cells, objects | Multi-select state |

### Tier 5: Hooks (Weeks 5-6)

React hooks that compose operations. Convert after their dependencies are typed.

| File | Priority | Dependencies | Notes |
|------|----------|--------------|-------|
| `useToolState.js` | 1 | None | Simple, good starter |
| `useHistory.js` | 2 | None | Simple undo/redo |
| `useMapData.js` | 3 | layerAccessor | Data loading |
| `useLayerHistory.js` | 4 | layerAccessor, history | Layer-specific history |
| `useAreaSelect.js` | 5 | geometry | Selection logic |
| `useFogOfWar.js` | 6 | geometry, cells | Fog state |
| `useFogTools.js` | 7 | fog, geometry | Fog operations |
| `useDiagonalFill.js` | 8 | cells, constants | New feature |
| `useDistanceMeasurement.js` | 9 | geometry, distance | Measurement tool |
| `useDrawingTools.js` | 10 | cells, geometry | Large, core tool logic |
| `useCanvasInteraction.js` | 11 | geometry, tools | Event handling |
| `useEventCoordinator.js` | 12 | All above | Event orchestration |
| `useObjectInteractions.js` | 13 | objects, geometry | Object manipulation |
| `useGroupDrag.js` | 14 | objects, selection | Group operations |
| `useNotePinInteraction.js` | 15 | notes, objects | Note pin handling |
| `useTextLabelInteraction.js` | 16 | text, objects | Text label handling |
| `useCanvasRenderer.js` | 17 | All renderers | Main render loop |

### Tier 6: Components (Weeks 7-8)

React components. Convert TSX after hooks are typed.

**Priority order**: Contexts → Simple components → Complex components → Settings plugin

| Phase | Files |
|-------|-------|
| 6a: Contexts | `MapContext.jsx`, `MapSettingsContext.jsx`, `MapSelectionContext.jsx`, `EventHandlerContext.jsx` |
| 6b: Simple UI | `CollapsibleSection.jsx`, `ModalPortal.jsx`, `TextInputModal.jsx` |
| 6c: Tool UI | `ToolPalette.jsx`, `ColorPicker.jsx`, `LayerControls.jsx`, `VisibilityToolbar.jsx` |
| 6d: Canvas Layers | `DrawingLayer.jsx`, `ObjectLayer.jsx`, `TextLayer.jsx`, `NotePinLayer.jsx`, `FogOfWarLayer.jsx`, `MeasurementLayer.jsx`, `AreaSelectLayer.jsx` |
| 6e: Overlays | `SegmentPickerOverlay.jsx`, `SegmentHoverOverlay.jsx`, `DiagonalFillOverlay.jsx`, `ShapePreviewOverlay.jsx` |
| 6f: Settings Modal | All settings tab components, `MapSettingsModal.jsx` |
| 6g: Settings Plugin | All `settingsPlugin-*.js` files |
| 6h: Main | `MapCanvas.jsx`, `DungeonMapTracker.jsx` |

---

## Type Design Principles

### 1. No `any`, No Generic `Object`

```typescript
// ❌ Bad
function processData(data: any): object { ... }

// ✅ Good
function processData(data: MapData): ProcessedResult { ... }
```

### 2. Discriminated Unions for Variants

```typescript
// ❌ Bad - optional properties create ambiguity
interface Cell {
  x: number;
  y: number;
  color: string;
  segments?: Record<string, boolean>;
}

// ✅ Good - explicit variants
type Cell = SimpleCell | SegmentCell;
```

### 3. Branded Types for Coordinate Systems

Different coordinate systems look similar but aren't interchangeable:

```typescript
// Branded types prevent mixing coordinate systems
type GridX = number & { readonly __brand: 'GridX' };
type GridY = number & { readonly __brand: 'GridY' };
type WorldX = number & { readonly __brand: 'WorldX' };
type WorldY = number & { readonly __brand: 'WorldY' };

// Or use distinct interfaces
interface GridCoords { gridX: number; gridY: number; }
interface AxialCoords { q: number; r: number; }
interface OffsetCoords { col: number; row: number; }
interface WorldCoords { worldX: number; worldY: number; }
interface ScreenCoords { screenX: number; screenY: number; }
```

### 4. Readonly for Immutable Data

```typescript
// State that shouldn't be mutated
interface MapState {
  readonly cells: ReadonlyArray<Cell>;
  readonly objects: ReadonlyArray<MapObject>;
  readonly settings: Readonly<MapSettings>;
}
```

### 5. Strict Function Signatures

```typescript
// Return type explicit, parameters fully typed
function setCell(
  cells: Cell[],
  coords: GridCoords,
  color: string,
  opacity: number,
  geometry: IGeometry
): Cell[] {
  // ...
}
```

### 6. Context Types with Inference

```typescript
interface MapSettingsContextValue {
  // State
  state: SettingsState;
  
  // Actions (typed dispatch wrappers)
  setActiveTab: (tab: TabId) => void;
  handleColorChange: (key: ColorKey, value: string) => void;
  // ...
}

const MapSettingsContext = dc.createContext<MapSettingsContextValue | null>(null);
```

---

## Opportunities for Abstraction

During migration, look for these improvement opportunities:

### 1. Coordinate System Unification

Currently, different modules use different coordinate property names (`{x, y}`, `{gridX, gridY}`, `{q, r}`, `{col, row}`). Types can enforce consistency and adapters can bridge legacy code.

### 2. Event Handler Standardization

`useEventCoordinator` could benefit from typed event definitions:

```typescript
interface MapEvent {
  type: 'cell_paint' | 'object_place' | 'selection_change' | ...;
  payload: CellPaintPayload | ObjectPlacePayload | ...;
}
```

### 3. Renderer Protocol

Extract a common `IRenderer` interface that all layer renderers implement:

```typescript
interface ILayerRenderer {
  render(
    ctx: CanvasRenderingContext2D,
    state: RenderState,
    geometry: IGeometry
  ): void;
  
  readonly zIndex: number;
  readonly name: string;
}
```

### 4. Settings Plugin Modularization

The settings plugin is sprawling. Types could help define clear module boundaries and make the tab system more composable.

---

## Quality Checklist

For each file migration:

- [ ] All function parameters typed
- [ ] All return types explicit
- [ ] No `any` usage
- [ ] No `object` usage (use specific interfaces)
- [ ] Null/undefined handled with `strictNullChecks`
- [ ] Type guards for discriminated unions
- [ ] Complex object shapes have dedicated interfaces
- [ ] Public API has JSDoc with `@param` and `@returns`
- [ ] VS Code shows no type errors
- [ ] Datacore executes correctly
- [ ] Existing tests still pass (if any)

---

## Risk Mitigation

### iPad Development Gap

- Types are edit-time only; runtime behavior unchanged
- iPad workflow: write code, test in Obsidian, fix issues on desktop if type-related
- Consider: periodic `tsc --noEmit` check on desktop before major releases

### Migration Disruption

- Incremental migration: one tier at a time
- Each file can be converted independently
- Keep `.js` files working alongside new `.ts` files
- No "big bang" cutover

### Datacore Compatibility

- Validate mechanics with test file before committing
- Keep `dc.require()` / `return {}` pattern unchanged
- Only type imports use ES6 syntax

---

## Success Criteria

1. **Foundation Complete**: Tier 1 files converted with zero `any` usage
2. **VS Code Integration**: Full autocomplete and error detection
3. **ESLint Passing**: All converted files pass linting with zero warnings
4. **No Runtime Regression**: All existing functionality works
5. **Documentation Value**: Types serve as living documentation
6. **Developer Velocity**: New features benefit from type safety

---

## Next Steps

1. **Install dependencies** (`@blacksmithgu/datacore`, ESLint, TypeScript)
2. **Configure ESLint** with Obsidian plugin rules (handle Datacore export pattern)
3. **Set up `tsconfig.json`** and type directory structure
4. **Validate Datacore TS mechanics** (create test types + module)
5. **Convert `dmtConstants.js`** as first real migration
6. **Convert `BaseGeometry.js`** to establish geometry interface
7. **Review and iterate** on type design before continuing

---

## Appendix: File Size Reference

For planning, current file sizes (largest files need most attention):

| Size | File | Notes |
|------|------|-------|
| 55K | dungeonGenerator.js | Complex but isolated |
| 50K | useCanvasRenderer.js | Main render loop |
| 48K | useObjectInteractions.js | Object handling |
| 43K | rpgAwesomeIcons.js | Icon data, low priority |
| 39K | useDrawingTools.js | Core drawing logic |
| 35K | HexGeometry.js | Tier 2 priority |
| 34K | useEventCoordinator.js | Event orchestration |
| 32K | DungeonMapTracker.jsx | Main component |
| 25K | layerAccessor.js | Tier 3 priority |
| 24K | GridGeometry.js | Tier 2 priority |
| 23K | settingsPluginMain.js | Settings plugin |
| 22K | cellAccessor.js | Tier 1 priority |
| 19K | settingsReducer.js | Tier 4 priority |
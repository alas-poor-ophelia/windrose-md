# Utilities

## Purpose

Pure utility functions with no side effects. These are the workhorses of the application - stateless, testable, and type-safe.

## File Naming Convention

- `*Operations.ts` - Functions that operate on data (cells, objects, notes, etc.)
- `*Accessor.ts` - Functions for accessing/querying data structures
- `*Calculator.ts` - Computational functions (borders, segments)
- Other utilities - Specific purpose (fileOperations, colorOperations, etc.)

## Key Files

| File | Purpose |
|------|---------|
| `cellAccessor.ts` | Cell data access, manipulation, queries |
| `layerAccessor.ts` | Layer management, switching, data access |
| `settingsAccessor.ts` | Settings retrieval, defaults, validation |
| `colorOperations.ts` | Color manipulation, conversion, blending |
| `distanceOperations.ts` | Distance calculation, measurement |
| `diagonalFillOperations.ts` | Diagonal line fill algorithms |
| `edgeOperations.ts` | Edge/border detection, adjacency |
| `exportOperations.ts` | Map export to various formats |
| `multiSelectOperations.ts` | Multi-selection logic |
| `noteOperations.ts` | Note linking, resolution |
| `objectOperations.ts` | Object placement, movement, queries |
| `textLabelOperations.ts` | Text label management |
| `borderCalculator.js` | Cell border calculation |
| `segmentBorderCalculator.ts` | Segment-based borders |
| `fileOperations.js` | File I/O via Obsidian API |
| `imageOperations.js` | Image loading, processing |
| `screenPositionUtils.js` | Screen/canvas coordinate transforms |

## Patterns

### Pure Functions

All utilities should be pure:
```typescript
// Good - pure function
function getCellColor(cells: CellData, row: number, col: number): string | null {
  return cells[`${row},${col}`]?.color ?? null;
}

// Bad - side effect
function getCellColor(cells: CellData, row: number, col: number): string | null {
  console.log('Getting cell color');  // Side effect!
  return cells[`${row},${col}`]?.color ?? null;
}
```

### Type-First Design

Define types in `types/*_types.ts`, then implement:
```typescript
// In types/cell_types.ts
export interface CellData {
  [key: string]: CellInfo;
}

// In utils/cellAccessor.ts
function getCell(cells: CellData, key: string): CellInfo | undefined {
  return cells[key];
}
```

### Grid/Hex Agnostic

Utilities should work for both map types where possible:
```typescript
// Good - works with any geometry
function getCellKey(row: number, col: number): string {
  return `${row},${col}`;
}

// If hex-specific, make it explicit
function getHexNeighbors(q: number, r: number): HexCoord[] {
  // Hex-only logic
}
```

## Accessor Pattern

Accessors provide a clean API over raw data structures:

```typescript
// cellAccessor.ts
const cellAccessor = {
  getCell: (cells, key) => cells[key],
  setCell: (cells, key, value) => ({ ...cells, [key]: value }),
  hasCell: (cells, key) => key in cells,
  getCellsByColor: (cells, color) => Object.entries(cells).filter(...)
};

return cellAccessor;
```

## Datacore Export

Remember the Datacore pattern:
```typescript
// End of file
return {
  getCellColor,
  setCellColor,
  // ... other exports
};
```

## Adding New Utilities

1. Determine appropriate file (or create new `*Operations.ts`)
2. Define types in `types/` if needed
3. Implement as pure function
4. Add JSDoc with param/return documentation
5. Export via `return { ... }`
6. Consider both grid and hex implications

## Common Gotchas

- **No `import`/`export`** - Use `dc.require()` and `return { ... }`
- **No side effects** - No console.log, no DOM access, no state mutation
- **Handle undefined** - Cells/objects may not exist
- **Coordinate systems** - Grid uses (row, col), hex uses (q, r) or offset
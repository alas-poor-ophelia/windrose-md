# Phase 1: TypeScript Migration Completeness

## Session Metadata
- Date: 2026-01-05
- Files examined: 34 type files, 35 JS/JSX files assessed
- Examination depth: Full read of type files, structural assessment of JS/JSX

## Summary

The TypeScript migration is **~72% complete** (90 TS/TSX files vs 35 JS/JSX remaining). The type system is well-designed with 4,439 lines of type definitions across 34 files. No use of `any` type. A few `unknown` usages need attention.

### Migration Status

| Category | Files | Lines | Status |
|----------|-------|-------|--------|
| hooks/ | 20 | ~8,000 | ✅ Complete |
| geometry/ | 10 | ~3,000 | ✅ Complete |
| utils/ | 24 | ~3,500 | ✅ Complete |
| context/ | 4 | ~1,200 | ✅ Complete |
| operations/ | 10 | ~2,500 | ✅ Complete |
| components/ | 13 JSX | ~3,775 | ⚠️ Remaining |
| settingsplugin/ | 21 JS | ~5,000 | ⚠️ Remaining |
| generation/ | 1 JS | ~1,685 | ⚠️ Remaining |

---

## Critical (P0) - Must Fix

**None found.** The type system is sound and no immediate production risks were identified.

---

## Important (P1) - Should Fix Soon

### 1. `context.types.ts:74,81` - NotePin uses `unknown` instead of existing type

```typescript
// Current (unsafe)
onNotePinsChange?: (pins: unknown[]) => void;
getNotePinAtPosition?: (pins: unknown[], ...) => unknown | null;

// Should be
onNotePinsChange?: (pins: NotePin[]) => void;
getNotePinAtPosition?: (pins: NotePin[], ...) => NotePin | null;
```

`NotePin` is already defined in `objects/note.types.ts` but not imported. This causes type safety gaps at callsites.

### 2. `eventCoordinator.types.ts:183` - GetHandlers returns `unknown`

```typescript
export type GetHandlers = (layer: HandlerLayerName) => unknown;
```

Should return a discriminated union or mapped type based on layer name. Currently defeats type safety for handler access.

### 3. `dataHandlers.types.ts:37,69` - Edge types use `unknown[]`

```typescript
edges: unknown[];
HandleEdgesChange = LayerDataChangeHandler<unknown[]>;
```

The `Edge` type exists in `context.types.ts` - should be used here.

### 4. `object.types.ts:47,59` - Inconsistent category typing

`ObjectType.category` and `ObjectTypeDefinition.category` use `string` but `ObjectCategory` union type exists. Should use the union for type safety.

### 5. `object.types.ts:68-79` - Deprecated type still exported

`ObjectTypeDef` is marked `@deprecated` but still exported from index. Should be removed or moved to a legacy types file.

### 6. `settings.types.ts:305-334` - Incomplete type definitions

`SettingsState` and `UserPreferences` have TODO comments indicating incomplete definitions. Should be completed when settings migration occurs.

---

## Watch List (P2) - Monitor

### 1. Duplicate structural types

Three identical bounds types exist:
- `GridBounds` in geometry.types.ts
- `HexBounds` in map.types.ts
- `FogBounds` in map.types.ts

Consider consolidating to a single `Bounds` type.

### 2. `HexColor` defined twice

Exists in both `common.types.ts` and `settings.types.ts`. Should consolidate to single source.

### 3. `cell.types.ts:133-142` - AnyCoords accepts empty object

```typescript
interface AnyCoords {
  x?: number; y?: number;
  col?: number; row?: number;
  q?: number; r?: number;
}
```

An empty `{}` is valid - could cause runtime issues if code expects at least one pair.

### 4. React types not imported

Several hook type files use `React.Dispatch`, `React.RefObject` without importing React. Works due to global types but should be explicit:
- `drawingTools.types.ts:201-210`
- `objectInteractions.types.ts:172-173,181`
- `canvasRenderer.types.ts:83-84`
- `eventCoordinator.types.ts:73-75`

### 5. Numeric types are documentation-only

`Opacity`, `Percentage`, `Degrees` in `common.types.ts` are just `number` aliases. They document intent but don't enforce ranges at compile time.

---

## JS/JSX Migration Priority

### High Priority (Should Convert)

| File | Lines | Complexity | Risk | Reason |
|------|-------|------------|------|--------|
| SelectionToolbar.jsx | 680 | High | HIGH | 30+ props, coordinate math, dual-mode operation |
| dungeonGenerator.js | 1685 | Very High | HIGH | Pure algorithm, room shape polymorphism, config merging |
| ImageAlignmentMode.jsx | 415 | Medium-High | HIGH | Multiple coordinate systems, complex callbacks |
| NoteLinkModal.jsx | 417 | Medium | MEDIUM | Obsidian API integration |
| HexCoordinateLayer.jsx | 351 | Medium | MEDIUM | Geometry calculations |

### Medium Priority

| File | Lines | Complexity | Risk |
|------|-------|------------|------|
| MapCanvasActionButtons.jsx | 367 | Medium | MEDIUM |
| TextLabelEditor.jsx | 306 | Medium | MEDIUM |
| WindroseCompass.jsx | 297 | Medium | LOW |
| MeasurementOverlay.jsx | 248 | Medium | MEDIUM |
| MapControls.jsx | 243 | Medium | MEDIUM |

### Low Priority

| File | Lines | Complexity | Risk |
|------|-------|------------|------|
| LinkedNoteHoverOverlays.jsx | 162 | Low | LOW |
| ObjectSidebar.jsx | 161 | Low | LOW |
| RerollDungeonButton.jsx | 80 | Low | LOW |
| MapHeader.jsx | 50 | Low | LOW |

### Settings Plugin (Defer)

The 21 settingsplugin/ JS files use a template assembly mechanism that complicates TypeScript conversion. These should be deferred until the template system can be redesigned or the files can be converted individually.

---

## Recommended Actions

### Immediate (Before 1.5.x release)

1. Fix `context.types.ts` to use `NotePin` type (5 min)
2. Fix `dataHandlers.types.ts` to use `Edge` type (5 min)

### Soon (During 1.5.x)

3. Add explicit React imports to hook type files
4. Convert `dungeonGenerator.js` to TypeScript (good isolated target)
5. Convert `SelectionToolbar.jsx` to TypeScript (highest bug prevention value)

### Later (1.6.x prep)

6. Convert remaining component JSX files
7. Address duplicate type consolidation
8. Complete `SettingsState` and `UserPreferences` types

---

## Notes

### Type System Quality

The type system is well-designed:
- Clear separation by domain (core, hooks, objects, settings)
- Good use of discriminated unions (`Cell = GridCell | HexCell`)
- Type guards for runtime discrimination (`isGridCell`, `isHexCell`)
- Coordinate type separation prevents mixing screen/world/grid coords
- No use of `any` type anywhere

### JSX Conversion Strategy

For JSX files, recommend:
1. Create `ComponentName.types.ts` for complex prop interfaces
2. Use `FC<Props>` pattern for function components
3. Keep `dc.require()` pattern - just add types to imports

### dungeonGenerator.js Conversion Notes

This file is an excellent TypeScript candidate because:
- Pure functions, no React/JSX
- Already has implicit type contracts in comments
- Would benefit from discriminated union for room shapes:

```typescript
type Room =
  | { shape: 'rectangle'; x: number; y: number; width: number; height: number }
  | { shape: 'circle'; x: number; y: number; radius: number }
  | { shape: 'composite'; parts: Room[]; boundingBox: BoundingBox };
```

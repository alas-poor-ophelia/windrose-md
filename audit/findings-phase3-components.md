# Phase 3: Component & Context Layer

## Session Metadata
- Date: 2026-01-05
- Files examined: 46 total
- Lines examined: ~8,500

### Coverage Summary
| Category | Files | TS/TSX | JSX | Lines |
|----------|-------|--------|-----|-------|
| Context providers | 4 | 4 | 0 | ~1,400 |
| mapcanvas/ | 17 | 13 | 4 | ~3,200 |
| settings/ | 10 | 10 | 0 | ~2,100 |
| Root components | 14 | 6 | 8 | ~1,500 |
| shared/ | 1 | 0 | 1 | ~300 |

---

## Executive Summary

The component layer is **well-structured and production-ready**. No P0 issues found. The Context providers are cleanly typed with proper TypeScript. The remaining JSX files are functional but represent technical debt.

### Key Findings

1. **Context Architecture is Solid**: All 4 contexts are fully typed, use proper provider patterns, and have error-throwing hooks for misuse detection.

2. **MapSettingsContext is Complex**: At 740 lines, it's the largest context but well-organized with reducer pattern and clear separation between state and effects.

3. **13 JSX Files Remain**: These work correctly but lack TypeScript safety. Most are UI-only components with minimal type complexity.

4. **Debug Logging Left Behind**: `MeasurementOverlay.jsx` has console.log statements that should be removed.

---

## All Issues by Priority

### P1 Issues

| ID | Location | Issue | Recommendation |
|----|----------|-------|----------------|
| P1-1 | `MeasurementOverlay.jsx:128-137,160-167` | Debug console.log statements left in | Remove before 1.5.x release |
| P1-2 | `ImageAlignmentMode.jsx:53-59` | Inconsistent whitespace in function body | Minor, cosmetic |
| P1-3 | `MapSettingsContext.tsx:67-100` | Duplicate type declarations (also in types/) | Use imports from `#types/` |

### P2 Issues (Technical Debt - JSX Conversion)

| File | Lines | Conversion Complexity | Notes |
|------|-------|----------------------|-------|
| `SelectionToolbar.jsx` | 680 | Medium | Complex prop types, multi-select logic |
| `ImageAlignmentMode.jsx` | 415 | Low | Simple props, self-contained |
| `HexCoordinateLayer.jsx` | 352 | Low | Uses context hooks, straightforward |
| `MapCanvasActionButtons.jsx` | 367 | Low | Prop-drilling component, simple types |
| `NoteLinkModal.jsx` | 418 | Medium | Autocomplete component internal |
| `MapControls.jsx` | 244 | Low | Simple UI component |
| `MeasurementOverlay.jsx` | 249 | Low | SVG rendering, simple props |
| `TextLabelEditor.jsx` | 307 | Medium | Form state, color picker integration |
| `ObjectSidebar.jsx` | 162 | Low | Simple list rendering |
| `LinkedNoteHoverOverlays.jsx` | 163 | Medium | Event handling complexity |
| `RerollDungeonButton.jsx` | 81 | Low | Simple modal confirmation |
| `MapHeader.jsx` | 51 | Trivial | Very simple component |
| `WindroseCompass.jsx` | 298 | Low | SVG-only, no logic |

---

## Context Provider Analysis

### MapContext.tsx (84 lines) ✅
- **Quality**: Excellent
- **Pattern**: Dual context (State + Operations) for granular updates
- **Types**: Fully typed via `#types/contexts/context.types.ts`
- **Strengths**: Clean separation, proper null checks, error-throwing hooks

### EventHandlerContext.tsx (152 lines) ✅
- **Quality**: Excellent
- **Pattern**: Handler registry for layer event coordination
- **Types**: Locally defined (appropriate for self-contained pattern)
- **Strengths**: Clean registration API, useRef for stable handlers

### MapSelectionContext.tsx (402 lines) ✅
- **Quality**: Good
- **Pattern**: Multi-selection state with backward compatibility
- **Types**: Locally defined interfaces
- **Strengths**: Thoughtful migration path (single → multi-select), group drag support

### MapSettingsContext.tsx (741 lines) ⚠️
- **Quality**: Good (complexity warranted)
- **Pattern**: useReducer + async effects
- **Types**: Many duplicate declarations that exist in `#types/`
- **Issue**: Lines 67-100 duplicate types like `MapType`, `GridDensity`, `SizingMode`, etc.
- **Recommendation**: Import from `#types/core/map.types.ts` and `#types/settings/settings.types.ts`

---

## High-Priority JSX Analysis

### SelectionToolbar.jsx (680 lines)
**Purpose**: Unified selection toolbar for objects and text labels

**Observations**:
- Well-structured with extracted sub-components (`MultiSelectToolbar`)
- Complex position calculations that would benefit from typing
- UTF-8 encoding issue in title strings (lines 194, 547, 660: "90Â°" instead of "90°")

**Conversion Notes**:
- Define `SelectionToolbarProps` interface
- Type the position calculation return types
- Extract `Bounds` interface for reuse

### ImageAlignmentMode.jsx (415 lines)
**Purpose**: Interactive background image positioning panel

**Observations**:
- Uses ModalPortal correctly
- Event handling for canvas drag is complex but well-contained
- Dead code: Lines 89-119 contain debugging scaffolding that does nothing

**Conversion Notes**:
- Simple props interface: `{ dc, isActive, offsetX, offsetY, onOffsetChange, onApply, onCancel }`
- Clean up dead diagnostic code
- Type the ref values

---

## Component Architecture Patterns

### Coordinator Pattern ✅
Components properly delegate to contexts:
- `HexCoordinateLayer` → `useMapState()`, `useMapSelection()`
- `RerollDungeonButton` → `useMapState()`, `useMapOperations()`

### Position Calculation Pattern
Multiple components duplicate screen-position math:
- `SelectionToolbar.jsx:calculateMultiSelectBounds()`
- `SelectionToolbar.jsx:calculateTextLabelBounds()`
- `LinkedNoteHoverOverlays.jsx` (inline)

**Recommendation**: These could consolidate into `screenPositionUtils.ts` (already exists, partially used).

### Modal Pattern ✅
Consistent use of `ModalPortal.tsx` for overlay modals:
- `RerollDungeonButton`
- `ImageAlignmentMode`
- `NoteLinkModal`

---

## Recommendations

### Immediate (Before 1.5.x)

1. **Remove debug logging** from `MeasurementOverlay.jsx`
2. **Fix UTF-8 encoding** in `SelectionToolbar.jsx` title strings

### Short-term (During 1.5.x)

3. **Import types in MapSettingsContext** instead of duplicating
4. **Convert trivial JSX files**: `MapHeader.jsx`, `RerollDungeonButton.jsx`

### Medium-term (1.6.x Prep)

5. **Convert remaining JSX** prioritized by feature touch:
   - `HexCoordinateLayer.jsx` (1.6.x radial coordinates)
   - `SelectionToolbar.jsx` (multi-select improvements)

6. **Consolidate position calculations** into `screenPositionUtils.ts`

---

## P0 Verification: None Found

No blocking issues identified. All components render correctly and handle edge cases appropriately.

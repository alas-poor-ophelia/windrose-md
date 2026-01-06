# Phase 2: Critical Path Architecture - Synthesis

## Session Metadata
- Date: 2026-01-05
- Sessions: 3 (2a: geometry, 2b: major hooks, 2c: remaining hooks)
- Files examined: 29 total
- Lines examined: ~11,700

### Coverage Summary
| Session | Files | Lines | Focus |
|---------|-------|-------|-------|
| Phase 2a | 9 | ~3,600 | Geometry abstraction |
| Phase 2b | 4 | ~4,000 | Major interaction hooks |
| Phase 2c | 16 | ~4,100 | Remaining hooks |

---

## Executive Summary

The critical path code is **production-ready and well-architected**. No P0 issues were found across all 29 files.

### Key Findings

1. **Architecture is Clean**: Clear separation between geometry (math), hooks (state/logic), and components (UI). Coordinator pattern works well.

2. **1.6.x Features Need Small Changes**: Y-ordering and zoom-sensitive visibility only require sort/filter before existing render loops.

3. **Radial Hex is the Big Lift**: HexGeometry is tightly coupled to coordinate-based rendering. Radial will need new rendering approach.

4. **Maintainability Concern**: Large functions (`renderCanvas` at 957 lines) and local type declarations need attention.

---

## All P1 Issues (Prioritized)

### High Priority (Affects 1.6.x Roadmap)

| ID | Location | Issue | 1.6.x Feature |
|----|----------|-------|---------------|
| P1-1 | `useCanvasRenderer.ts:312-457` | Objects render in array order, not Y-order | Y-level ordering |
| P1-2 | `useCanvasRenderer.ts:307-458` | No zoom-level filtering before render | Zoom-sensitive visibility |
| P1-3 | `HexGeometry.ts` throughout | Bound to coordinate-based rendering | Radial hex rendering |

### Medium Priority (Maintainability)

| ID | Location | Issue | Impact |
|----|----------|-------|--------|
| P1-4 | `useCanvasRenderer.ts:102-1059` | `renderCanvas` is 957 lines | Hard to modify safely |
| P1-5 | Throughout all hooks | Local context type declarations | Types could drift |
| P1-6 | `cellAccessor.ts:419-423` | Segment painting grid-only | Hex tiles need different approach |
| P1-7 | `useEventCoordinator.ts:127-365` | Handler retrieval uses type assertions | Debugging difficulty |

### Lower Priority (Minor Issues)

| ID | Location | Issue | Impact |
|----|----------|-------|--------|
| P1-8 | `useHistory.ts:65-93` | Undo/redo return before state update | Fragile pattern |
| P1-9 | `useTextLabelInteraction.ts:402-482` | 80-line button position calculation | Maintenance burden |
| P1-10 | `useFogTools.ts` | Missing batched history for fog strokes | Undo granularity |

---

## All P2 Watch Items

| ID | Location | What to Watch | When to Act |
|----|----------|---------------|-------------|
| P2-1 | `HexGeometry.ts:349-353` | 50K hex limit, no limit on painted cells | If large maps lag |
| P2-2 | `gridRenderer.ts:103-113` | Per-cell opacity bypasses batching | If many opacity cells |
| P2-3 | `useCanvasRenderer.ts:488-904` | 416 lines for fog alone | If fog bugs appear |
| P2-4 | `useDrawingTools.ts:158-160` | New Set per processed cell | If large strokes lag |
| P2-5 | `useObjectInteractions.ts:1033-1068` | O(n) duplicate search | If duplication lags |
| P2-6 | `useGroupDrag.ts:307-328` | O(n²) collision detection | If group drag lags |
| P2-7 | `useMapData.ts:124-139` | Fixed 2s autosave delay | User feedback |

---

## Roadmap Feature Readiness

### 1.6.x Features

| Feature | Ready? | What's Needed |
|---------|--------|---------------|
| **Y-level ordering** | 🟡 Partial | Add `zIndex` to objects, sort before render loop in `useCanvasRenderer` |
| **Zoom-sensitive visibility** | 🟡 Partial | Add `minZoom`/`maxZoom` to objects, filter before render loop |
| **Custom hex tiles** | 🟡 Partial | New object type with `imagePath`, image rendering in object loop |
| **Radial hex rendering** | 🔴 Not Ready | New rendering approach needed - HexGeometry can't do it |
| **Subhexes/regions** | 🟡 Conceptual | Layer system exists, needs zoom-based switching |

### 1.7.x Features

| Feature | Ready? | What's Needed |
|---------|--------|---------------|
| **Background images (grid)** | 🟡 Partial | Extend `useImageAlignment` - already geometry-agnostic |
| **True layer system** | 🟡 Partial | Floor system exists, needs layer type distinction |

---

## Architecture Patterns (Reference)

### What Works Well

1. **Geometry Abstraction**: `IGeometry` interface allows grid/hex swap without touching hooks
2. **Coordinator Pattern**: Event routing decoupled from handlers
3. **Context-Driven State**: Consistent consumption from MapContext, MapSelectionContext, EventHandlerContext
4. **Batched History**: Refs track initial state, single entry on stop
5. **Touch/Mouse Parity**: All tools work on both input modes

### What to Preserve

1. **Pure Geometry Functions**: Keep geometry code side-effect free except canvas drawing
2. **Single-Responsibility Hooks**: Each hook owns one domain
3. **iOS Workarounds**: `fillRect()` instead of `stroke()`, explicit style resets
4. **Handler Registration**: EventHandlerContext pattern for decoupling

---

## Recommended Actions

### Before 1.6.x Development

1. **Extract `renderCanvas` sub-functions** (P1-4)
   - `renderBackground()`, `renderCellLayer()`, `renderObjectLayer()`, `renderTextLayer()`, `renderFogLayer()`, `renderSelectionOverlays()`
   - This makes Y-ordering and zoom-filtering easier to add

2. **Add object properties** (P1-1, P1-2)
   - `zIndex?: number` for Y-ordering
   - `minZoom?: number, maxZoom?: number` for zoom visibility
   - Can be optional, default to current behavior

3. **Consolidate context types** (P1-5)
   - Create `types/contexts/` with shared interfaces
   - Update all hooks to import from there

### When Starting Radial Hex

4. **Design new hex rendering approach** (P1-3)
   - Options: extend HexGeometry, new RadialHexRenderer, or position-based placement
   - This is architectural work, not a quick fix

### Optional Improvements

5. **Add fog batched history** (P1-10)
   - Follow `strokeInitialStateRef` pattern from drawing tools

6. **Validate handler registration** (P1-7)
   - Warn when expected handlers are missing

---

## Detailed Findings

For full details, see:
- `findings-phase2a-geometry.md` - Geometry abstraction audit
- `findings-phase2b-major-hooks.md` - Major hooks audit
- `findings-phase2c-remaining-hooks.md` - Remaining hooks audit

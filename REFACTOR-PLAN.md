# Windrose Refactoring Plan

Comprehensive cleanup plan based on full codebase audit (2026-03-31).
Covers decomposition, performance, type safety, dead code, and structural improvements.

**Codebase snapshot:** 41,318 lines across 120 files. 4 files over 1,000 lines, 26 files over 500.

---

## Phase 1: Type Safety & Interface Consolidation

**Risk: LOW | Impact: MEDIUM | Enables all later phases**

The same context interfaces are copy-pasted across 8+ hooks with slight variations. This makes refactoring dangerous because you can't change a context shape without hunting down every inline copy.

### 1.1 Consolidate inline MapStateValue / MapOperationsValue / MapSelectionValue

**Problem:** 8 hooks each define their own `MapStateValue`, `MapOperationsValue`, and `MapSelectionValue` interfaces inline. They diverge — e.g., `useObjectInteractions.ts` includes `containerRef` while `useDrawingTools.ts` includes `GridGeometryConstructor`.

**Files affected:**
- `hooks/useObjectInteractions.ts` (lines 39-68)
- `hooks/useDrawingTools.ts` (lines 44-73)
- `hooks/useGroupDrag.ts` (lines 37-94)
- `hooks/useEventCoordinator.ts` (lines 58-79)
- `hooks/useRegionTools.ts` (line 31+)
- `hooks/useFogTools.ts` (line 33+)
- `hooks/useAreaSelect.ts` (line 27+)
- `hooks/useDiagonalFill.ts` (line 37+)

**Action:**
1. Create `types/contexts/mapState.types.ts` with a comprehensive `MapStateValue` that covers ALL properties used across hooks
2. Create `types/contexts/mapOperations.types.ts` and `types/contexts/mapSelection.types.ts` similarly
3. Replace all inline definitions with `import type` from the shared files
4. Each hook can use `Pick<MapStateValue, 'geometry' | 'canvasRef' | ...>` if it only needs a subset

**Tests:** `npm run check` (typecheck) — no runtime changes.

### 1.2 Fix phantom type imports

**Problem:** Two type import paths reference files that don't exist:
- `#types/core/edge.types` — `Edge` actually lives in `types/core/rendering.types.ts`
- `#types/core/textLabel.types` — `TextLabel` actually lives in `types/objects/note.types.ts`

**Action:** Create the missing files with re-exports, or update import paths.

**Tests:** `npm run check`

### 1.3 Replace `as any` in useRegionTools.ts

**Problem:** Line 273 uses `as any` for `requireModuleByName("offsetCoordinates.ts")` — should be properly typed.

**Action:** Add proper type assertion: `as { offsetToAxial: (col: number, row: number, orientation: string) => { q: number; r: number } }`

### 1.4 Replace `unknown` type assertions in useGroupDrag.ts

**Problem:** Lines 88-93 use `unknown` for `HexGeometry`, `getObjectsInCell`, `assignSlot`. Should have constructor/function interfaces.

---

## Phase 2: Performance — Effect & Listener Cleanup

**Risk: MEDIUM | Impact: HIGH | Most user-visible improvement**

The audit found 11 Category A (critical) and 12 Category B (improvable) useEffect patterns. The worst offenders cause event listener re-registration on every render or every keypress.

### 2.1 Fix useCanvasInteraction.ts spacebar listener churn (CRITICAL)

**Problem:** Lines 369-403. Effect has deps `[focused, isPanning, spaceKeyPressed]`. Every space keypress toggles `spaceKeyPressed`, causing unregister/register on EVERY keydown and keyup.

**Fix:** Register listeners once on mount (`[]` deps). Read state from refs inside handlers.

### 2.2 Fix usePanZoomCoordinator.ts 24-item dependency array (CRITICAL)

**Problem:** Lines 102-144. Effect re-registers pan/zoom handlers whenever ANY of 24 dependencies change. Includes function callbacks that may be recreated each render.

**Fix:** Wrap handler object in `dc.useMemo`. Use refs for callbacks that change frequently. Reduce dependency array to stable values only.

### 2.3 Fix ObjectLayer.tsx 18-item handler registration effect (CRITICAL)

**Problem:** Lines 392-418. Registers object handlers with EventHandlerContext. Dep array includes 18 items including state values (`isResizing`, `resizeCorner`, `edgeSnapMode`) and setters.

**Fix:** Remove state setters from deps (they're stable). Move handler references to refs. Memoize the handler object.

### 2.4 Fix MapCanvas.tsx coordinate toggle listener (MODERATE)

**Problem:** Lines 307-357. Includes `setShowCoordinates` in deps (unnecessary — setters are stable). Handler re-registers on every coordinate toggle.

**Fix:** Remove setter from deps. Use ref for `showCoordinates` state inside handler.

### 2.5 Fix FreehandLayer/FogOfWarLayer/NotePinLayer handler registration (MODERATE)

**Problem:** Similar pattern — handler registration effects with unnecessary state in deps.

**Fix:** Same pattern as 2.3: memoize handler objects, use refs.

### 2.6 Fix useCanvasRenderer.ts dependency identity issues

**Problem:** Lines 588-593. `selectedItems` is likely a new array each render even if contents didn't change. Causes unnecessary canvas re-renders.

**Fix:** Memoize `selectedItems` upstream, or use a version counter instead of the array itself as a dependency.

### 2.7 Fix MapSettingsModal.tsx drag/resize listener churn

**Problem:** Lines 206-233, 258-310. `dragOffset` and `size` are objects that change identity even when contents don't. Causes re-registration.

**Fix:** Move `dragOffset` and `size` to refs, or memoize them.

### 2.8 Apply ref-based handler pattern across event coordinators

**General pattern** to apply wherever handlers are registered with EventHandlerContext:
```typescript
const handlerRef = dc.useRef(handler);
handlerRef.current = handler;
dc.useEffect(() => {
  registerHandlers('layer', { onPointerDown: (...args) => handlerRef.current(...args) });
  return () => unregisterHandlers('layer');
}, []);  // never re-runs
```

This eliminates the entire class of "handler registration churn" bugs.

---

## Phase 3: Decomposition — Root Component

**Risk: LOW-MEDIUM | Impact: MEDIUM | Thins the biggest file**

`DungeonMapTracker.tsx` (1,361 lines) manages ~20 direct useState calls + ~15 via hooks. Most state groups are independent.

### 3.1 Extract useUILayout.ts

**State to move:** `showFooter`, `isFocused`, `isExpanded`, `isAnimating`, `showVisibilityToolbar`, `showLayerPanel`, `showRegionPanel`

**Lines saved:** ~80 from DungeonMapTracker.tsx

### 3.2 Extract useCustomEventHandlers.ts

**Effects to move:** The 4 custom event listener blocks:
- `windrose:enter-sub-hex` (lines 465-475)
- `dmt-navigate-to` (lines 478-513)
- `windrose:center-on-region` (lines 516-546)
- `dmt-create-object-link` / `dmt-remove-object-link` (lines 549-598)

**Lines saved:** ~250 from DungeonMapTracker.tsx

### 3.3 Extract usePanelState.ts (optional)

**State to move:** `showSettingsModal`, `showPluginInstaller`, `editingLayerId`

**Lines saved:** ~50

---

## Phase 4: Decomposition — Large Hooks

**Risk: MEDIUM-HIGH | Impact: HIGH | Addresses the 3 biggest hooks**

### 4.1 Extract useObjectUIPositions.ts from useObjectInteractions.ts

**What:** The 4 `calculate*ButtonPosition` callbacks (lines 1063-1165). Pure geometry — no shared refs with drag/resize logic.

**Interface:** Takes `selectedItem`, `mapData`, `canvasRef`, `geometry`. Returns 4 position calculation functions.

**Lines saved:** ~120 from useObjectInteractions.ts

### 4.2 Extract useObjectModifications.ts from useObjectInteractions.ts

**What:** `handleNoteSubmit`, `handleObjectColorSelect`, `handleObjectColorReset`, `handleObjectRotation`, `handleObjectDeletion`, `handleObjectDuplicate`, `handleObjectWheel` (lines 1030-1298).

**Interface:** Takes `selectedItem`, `mapData`, `onObjectsChange`, `updateObject`, `removeObject`, `geometry`. Returns modification handlers.

**Lines saved:** ~150 from useObjectInteractions.ts

### 4.3 Extract useTouchGestures.ts from useEventCoordinator.ts

**What:** Long-press timer (500ms) and double-tap detection (300ms window). Lines 815-887 + refs at lines 815-816.

**Interface:** Takes canvas element, returns `{ handleTouchStart, handleTouchEnd, isLongPress }`.

**Lines saved:** ~80 from useEventCoordinator.ts

### 4.4 (Tier 3) Extract useDragResize.ts from useObjectInteractions.ts

**What:** Drag/resize state + handlers (lines 173-972). This is the big one — ~800 lines.

**Risk:** High. Shares `dragInitialStateRef`, `edgeSnapMode`, `altKeyPressedRef`, `shiftKeyPressedRef` between drag and resize callbacks. Would need careful ref passing.

**Defer until:** Phases 4.1 and 4.2 are done and tested. Reassess whether the remaining ~1000 lines still warrant splitting.

---

## Phase 5: Decomposition — Large Components

**Risk: LOW-MEDIUM | Impact: MEDIUM**

### 5.1 Extract CardinalIndicators.tsx from ObjectLayer.tsx

**What:** Lines 745-837. Pure JSX rendering snap direction indicators. No callbacks, just reads `edgeSnapMode`, `freeformDragPreview`, positions.

**Lines saved:** ~90

### 5.2 Extract useObjectModals.ts from ObjectLayer.tsx

**What:** Modal state (`showNoteModal`, `editingObjectId`, `showNoteLinkModal`) + handlers (`handleNoteButtonClick`, `handleNoteModalSubmit`, `handleEditNoteLink`, etc.). Lines 131-133, 420-567.

**Lines saved:** ~150

### 5.3 Refactor ToolPalette.tsx tool group rendering

**What:** Replace 4 hardcoded `<ToolButtonWithSubMenu>` calls (lines 487-581) with `toolGroups.map()`. Extract keyboard shortcuts to config object.

**Lines saved:** ~40, but improves maintainability significantly.

---

## Phase 6: Structural — Settings Reducer

**Risk: LOW | Impact: MEDIUM | Simplifies settings system**

### 6.1 Consolidate duplicate reducer handlers in settingsReducer.ts

**What:** 6 grid calculation handlers (lines 838-956) share identical logic: check `imageDimensions && boundsLocked`, call `calculateGrid*`, merge results. Extract to shared helper.

4 image positioning handlers (lines 961-971) are `{ ...state, [field]: action.payload }`. Replace with generic `SET_IMAGE_PROP`.

Background/fog image handlers (lines 809-836, 1008-1034) are near-identical pairs. Unify.

**Lines saved:** ~100-150

### 6.2 Consider sub-reducers (optional, evaluate after 6.1)

If settingsReducer.ts is still >800 lines after 6.1, split into:
- `hexGridReducer` (bounds, density, measurement)
- `backgroundImageReducer` (image selection, positioning, fog image)
- `appearanceReducer` (overrides, color picker)

---

## Phase 7: Dead Code Removal

**Risk: VERY LOW | Impact: LOW**

### 7.1 Remove unused exports from layerAccessor.ts

- `createBackup()` — zero consumers
- `validateMigration()` — zero consumers
- Audit `createEmptyLayer()` — appears dormant

### 7.2 Audit "API completeness" exports in cellAccessor.ts

Lines 17-18 acknowledge unused exports. Verify: `normalizeCoords()`, `getCellCoords()`, `removeCells()`. Remove if no consumers.

### 7.3 Remove convenience re-exports

- `layerAccessor.ts` re-exports `SCHEMA_VERSION` from `dmtConstants`
- `objectTypeResolver.ts` re-exports `RA_ICONS` from `rpgAwesomeIcons`

Check if callers could import directly from the source.

---

## Phase 8: Minor Structural Improvements

**Risk: LOW | Impact: LOW | Polish**

### 8.1 Consolidate fog rectangle operations in layerAccessor.ts

`fogRectangle()` and `revealRectangle()` share near-identical logic. Extract shared iteration.

### 8.2 Data-driven keyboard shortcuts in ToolPalette.tsx

Replace hardcoded shortcut handler (lines 302-337) with config lookup.

### 8.3 Memoize derived state in MapSettingsContext.tsx

`doSave()` (lines 604-613) computes `settingsData`, `backgroundImageData`, `calculatedHexSize` at call time. Memoize with `dc.useMemo`.

---

## Execution Order

**Recommended sequence (each phase is independently shippable):**

```
Phase 1 (Types)          ← Do first, enables safer refactoring
  ↓
Phase 2 (Performance)    ← Highest user-visible impact
  ↓
Phase 3 (Root decomp)    ← Low risk, big line reduction
  ↓
Phase 4 (Hook decomp)    ← Medium risk, biggest structural win
  ↓
Phase 5 (Component decomp) ← Low risk, moderate improvement
  ↓
Phase 6 (Settings)       ← Isolated subsystem
  ↓
Phase 7 (Dead code)      ← Trivial cleanup
  ↓
Phase 8 (Polish)         ← Nice-to-have
```

**Each phase should be a separate branch + commit.** Run `npm run test:unit` after every phase. Run `npm run test:e2e` after Phases 2, 3, 4, 5.

---

## Files NOT to Touch

- `geometry/curveBoolean.ts` (997 lines) — cohesive algorithm, big but not messy
- `utils/rpgAwesomeIcons.ts` (586 lines) — icon data, not logic
- `utils/dmtConstants.ts` (456 lines) — constants, not logic
- `geometry/objectTypeResolver.ts` (463 lines) — already well-structured, fully data-driven
- `utils/layerAccessor.ts` — well-structured despite size; only dead code removal needed

---

## Metrics to Track

| Metric | Before | Target |
|--------|--------|--------|
| Files over 1,000 lines | 4 | 0 |
| Files over 500 lines | 26 | ~18 |
| `as any` occurrences | 12 | ≤3 (Datacore boundary only) |
| Inline MapStateValue definitions | 8 | 0 |
| useEffect Category A issues | 11 | 0 |
| Total lines | 41,318 | ~40,000 (net reduction from dead code + dedup) |

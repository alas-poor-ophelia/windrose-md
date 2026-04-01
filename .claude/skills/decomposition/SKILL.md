# Hook & Component Decomposition

Use when breaking apart large files in the Windrose `src/` directory. This skill provides patterns for safely extracting logic from monolithic hooks, components, and the root module.

**Prerequisites:** Read the `datacore-patterns` skill first — every extraction must follow Datacore's module system rules.

---

## Decision Framework

### When to Extract

Extract when a file has **multiple independent responsibilities** sharing a namespace but not sharing mutable state. Signs:

- Functions that only reference a subset of the file's refs/state
- Blocks of related callbacks that form a logical unit (e.g., "all color picker handlers")
- JSX render sections with clear boundaries and limited data dependencies
- `useEffect` blocks that handle distinct concerns (custom events, resize observers, etc.)

### When NOT to Extract

- **Shared mutable refs between callbacks.** If `handleDragStart` writes to a ref that `handleDragMove` reads on the next frame, they must stay together.
- **Tight state coupling.** If extracting requires passing 10+ parameters back and forth, the abstraction boundary is wrong.
- **Pure math / algorithmic files.** `curveBoolean.ts` (997 lines) is big but cohesive — it's one algorithm. Don't split algorithms.
- **Under 300 lines.** The overhead of a new Datacore module (bootstrap + return {}) isn't worth it for small files.

---

## Extraction Patterns

### Pattern 1: Extract a Sub-Hook from a Large Hook

**When:** A subset of callbacks + state form a logical group within a mega-hook.

**Steps:**

1. **Map the dependency graph.** For each callback in the group, list:
   - Which `dc.useRef` values it reads/writes
   - Which `dc.useState` values it reads/writes
   - Which other callbacks it calls

2. **Identify the interface.** What does the parent hook need FROM the extracted hook?
   - Return values (state, handlers)
   - What does the extracted hook need as INPUT?
   - Props from parent hook's parameters, shared refs, shared state setters

3. **Check ref sharing.** If two callbacks in different groups share a mutable ref:
   - **Option A:** Move the ref to the parent and pass it down
   - **Option B:** Keep both callbacks in the same file
   - **Option C:** Replace the ref with state (if updates don't need to be synchronous)

4. **Create the new module.** Follow the Datacore pattern:
   ```typescript
   import type { ... } from '#types/...';

   const pathResolverPath = dc.resolvePath("pathResolver.ts");
   const { requireModuleByName } = await dc.require(pathResolverPath) as {
     requireModuleByName: (name: string) => Promise<unknown>
   };

   // Load only what this sub-hook needs
   const { useMapState } = await requireModuleByName("MapContext.tsx") as { ... };

   function useExtractedHook(params: ExtractedHookParams): ExtractedHookResult {
     // State and refs that belong to this concern
     const [localState, setLocalState] = dc.useState(...);
     const localRef = dc.useRef(...);

     // Callbacks for this concern
     const handleThing = dc.useCallback(() => { ... }, []);

     return { localState, handleThing };
   }

   return { useExtractedHook };
   ```

5. **Update the parent hook.** Replace the extracted code with a call:
   ```typescript
   const { useExtractedHook } = await requireModuleByName("useExtractedHook.ts") as { ... };

   function useParentHook(params) {
     // ... remaining state ...
     const { localState, handleThing } = useExtractedHook({ geometry, mapData });
     // ... remaining callbacks that use handleThing ...
     return { ...originalReturn, handleThing };
   }
   ```

**Risks:**
- Hook call order changes. Datacore requires `dc.useEffect` AFTER any `dc.useState` it references. If extraction reorders hooks, the component breaks silently.
- Async loading. The extracted hook is loaded via `requireModuleByName` at module init time, not at render time. This is fine as long as there are no circular dependencies.

---

### Pattern 2: Extract JSX Sections into Sub-Components

**When:** A component's render function has distinct visual sections with clear prop boundaries.

**Steps:**

1. **Identify the section.** Look for blocks of JSX wrapped in conditionals or logical groups (modals, toolbars, overlays, indicators).

2. **List what it reads.** Trace every variable the JSX block references:
   - Props from parent
   - State from hooks
   - Callbacks it invokes

3. **Define a clean props interface:**
   ```typescript
   interface CardinalIndicatorsProps {
     edgeSnapMode: boolean;
     positions: CardinalIndicatorPositions;
     selectedObject: MapObject | null;
   }
   ```

4. **Create the component file (.tsx):**
   ```typescript
   import type { ... } from '#types/...';

   const pathResolverPath = dc.resolvePath("pathResolver.ts");
   const { requireModuleByName } = await dc.require(pathResolverPath) as { ... };

   interface CardinalIndicatorsProps { ... }

   const CardinalIndicators = ({ edgeSnapMode, positions, selectedObject }: CardinalIndicatorsProps) => {
     if (!edgeSnapMode || !selectedObject) return null;
     return (
       <div class="cardinal-indicators">
         {/* extracted JSX */}
       </div>
     );
   };

   return { CardinalIndicators };
   ```

5. **Replace in parent with a component load + usage:**
   ```typescript
   const { CardinalIndicators } = await requireModuleByName("CardinalIndicators.tsx") as { ... };
   // In JSX:
   <CardinalIndicators edgeSnapMode={edgeSnapMode} positions={positions} selectedObject={obj} />
   ```

**Good extraction candidates** (pure JSX, minimal logic):
- Tooltip overlays
- Indicator graphics (cardinal snaps, alignment guides)
- Modal wrappers (already have clear open/close state)

**Bad extraction candidates:**
- JSX that tightly interacts with imperative canvas code
- Sections that read 8+ state variables from the parent (the props interface would be worse than the inline code)

---

### Pattern 3: Extract State Groups from the Root Component

**When:** The root component (`DungeonMapTracker.tsx`) manages state for unrelated UI concerns.

**Steps:**

1. **Group related state.** Find useState calls that are always read/written together:
   - UI visibility: `showFooter, isExpanded, showLayerPanel, showRegionPanel, showVisibilityToolbar`
   - Image alignment: `isAlignmentMode, alignmentOffsetX, alignmentOffsetY, returningFromAlignment`
   - Panel modals: `showSettingsModal, showPluginInstaller, editingLayerId`

2. **Extract each group into a custom hook:**
   ```typescript
   function useUILayout() {
     const [showFooter, setShowFooter] = dc.useState(true);
     const [isExpanded, setIsExpanded] = dc.useState(false);
     const [showLayerPanel, setShowLayerPanel] = dc.useState(false);
     // ...
     return { showFooter, setShowFooter, isExpanded, toggleExpand, ... };
   }
   ```

3. **Keep the root component as a composition shell.** It should:
   - Call hooks
   - Wire props between children
   - Render the component tree
   - NOT contain business logic

---

### Pattern 4: Extract useEffect Blocks

**When:** A component has multiple `useEffect` blocks handling unrelated side effects.

**Steps:**

1. **Identify independent effects.** An effect is independent if:
   - Its dependency array has no overlap with other effects' deps
   - Its cleanup doesn't affect other effects
   - It handles a distinct concern (custom event, resize, keyboard shortcut)

2. **Move to a custom hook:**
   ```typescript
   function useCustomEventHandler(eventName: string, handler: (e: CustomEvent) => void) {
     const handlerRef = dc.useRef(handler);
     handlerRef.current = handler;

     dc.useEffect(() => {
       const listener = (e: Event) => handlerRef.current(e as CustomEvent);
       document.addEventListener(eventName, listener);
       return () => document.removeEventListener(eventName, listener);
     }, [eventName]);
   }
   ```

3. **Replace in parent:**
   ```typescript
   useCustomEventHandler('windrose:enter-sub-hex', (e) => {
     enterSubHex(e.detail.q, e.detail.r);
   });
   ```

**Key rule:** Use a ref for the handler callback so the effect never re-runs when the handler changes (see react-performance skill, section 2.4).

---

## Extraction Checklist

Before submitting a decomposition PR:

- [ ] **No circular dependencies.** New module doesn't `requireModuleByName` a module that loads it.
- [ ] **Unique filename.** No other file in the project has the same name.
- [ ] **Hook order preserved.** All `dc.useState` calls happen before `dc.useEffect` calls that reference their state.
- [ ] **return {} at end.** Every new file ends with `return { ... }` (not `export`).
- [ ] **requireModuleByName bootstrap.** Every new file starts with the pathResolver dance.
- [ ] **Types via import type.** All cross-module type references use `import type` from `#types/`.
- [ ] **No prop explosion.** Extracted hooks/components take < 8 parameters. If more, the boundary is wrong.
- [ ] **Tests still pass.** Run `npm run test:unit` at minimum; `npm run test:e2e` if touching interactions.
- [ ] **Net reduction.** The parent file got meaningfully smaller AND the new file is cohesive (not a grab-bag).

---

## Windrose-Specific Extraction Targets

Ranked by safety and impact. These are the recommended first moves:

### Tier 1: Safe Extractions (low coupling, clear boundaries)

| Source File | Extract To | What | ~Lines Moved |
|------------|-----------|------|-------------|
| `DungeonMapTracker.tsx` | `useUILayout.ts` | UI visibility toggles (7 states) | ~80 |
| `DungeonMapTracker.tsx` | `useCustomEventHandlers.ts` | 4 custom event useEffect blocks | ~250 |
| `ObjectLayer.tsx` | `CardinalIndicators.tsx` | Snap direction indicators (pure JSX) | ~90 |
| `ObjectLayer.tsx` | `ObjectTooltip.tsx` | Hover tooltip rendering (pure JSX) | ~30 |

### Tier 2: Moderate Extractions (some shared state, well-defined interfaces)

| Source File | Extract To | What | ~Lines Moved |
|------------|-----------|------|-------------|
| `useObjectInteractions.ts` | `useObjectUIPositions.ts` | 4 `calculate*ButtonPosition` callbacks | ~120 |
| `useObjectInteractions.ts` | `useObjectModifications.ts` | Color, rotation, deletion, duplication handlers | ~150 |
| `ObjectLayer.tsx` | `useObjectModals.ts` | Modal state + open/close/submit handlers | ~150 |
| `useEventCoordinator.ts` | `useTouchGestures.ts` | Long-press timer, double-tap detection | ~80 |

### Tier 3: Careful Extractions (shared mutable refs, complex interfaces)

| Source File | Extract To | What | Risk |
|------------|-----------|------|------|
| `useObjectInteractions.ts` | `useDragResize.ts` | Drag + resize logic | Shared `dragInitialStateRef`, `edgeSnapMode` |
| `useEventCoordinator.ts` | Lookup table refactor | Replace tool switch/case with handler map | All routing changes |
| `DungeonMapTracker.tsx` | Extract settings/theme | Computed settings + theme memoization | Many children depend on it |

---

## Common Mistakes

1. **Extracting too early.** Read the full file before deciding boundaries. The obvious split isn't always the right one.
2. **Moving refs across module boundaries.** A ref created in hook A and read in hook B via parameter works, but it's fragile — the parent must wire them correctly.
3. **Breaking the hook call count.** If the parent called 5 `dc.useState` and 3 `dc.useEffect`, and after extraction it calls 3 `dc.useState` + `useExtracted()` (which has 2 `dc.useState` + 3 `dc.useEffect`), the total hook count changed from the component's perspective. This is fine in React/Preact, but verify the call is unconditional (not inside an if).
4. **Over-typing the extraction interface.** If you find yourself writing a 50-line TypeScript interface just to pass data between parent and child hook, reconsider the boundary.
5. **Forgetting cleanup.** If the extracted hook registers event listeners, it MUST return cleanup. Verify the parent doesn't also try to clean up the same listeners.

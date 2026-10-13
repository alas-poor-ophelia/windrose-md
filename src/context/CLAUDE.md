# Preact Contexts

## Purpose

Share map state and operations down the component tree without prop drilling. All contexts use `createContext` from `'preact'` and `useContext` from `'preact/hooks'`. Value types live in `types/contexts/context.types.ts`.

## Available Contexts

| File | Provider(s) | Access hook(s) | Notes |
|------|-------------|----------------|-------|
| `AppContext.tsx` | `AppContext.Provider` (`main.ts` code-block mount, `views/WindroseMapView.ts`) | `useApp()` | Obsidian `App` instance |
| `MapContext.tsx` | `MapStateProvider`, `MapOperationsProvider` | `useMapState()`, `useMapOperations()` | State vs stable operations split; state holds `canvasRef`, `geometry`, `mapData`, `viewController`, coordinate converters (`screenToGrid`, `screenToWorld`), `currentTool`, sub-hex callbacks |
| `MapSelectionContext.tsx` | `MapSelectionProvider` | `useMapSelection()`, `useHoverState()` | Selected item/objects, drag state, multi-select, `layerVisibility` (prop); `useHoverState()` reads a separate hover sub-context (`hoveredObject`, `mousePosition`) so pointer moves re-render only `ObjectHoverTooltip` |
| `ObjectLinkingContext.tsx` | `ObjectLinkingProvider` | `useLinkingMode()` | Note-linking mode state |
| `EventHandlerContext.tsx` | `EventHandlerProvider` | `useEventHandlerRegistration()`, `useRegisteredHandlers()` | Registry of per-layer pointer handlers (see below) |
| `MapSettingsContext.tsx` | `MapSettingsProvider` | `useModalShell()`, `useAppearance()`, `useBackgroundImage()`, `useHexGrid()` | Four selector sub-contexts. **Exists only inside the per-map settings modal** (mounted by `components/settings/MapSettingsModal.tsx`); map layers do NOT read it |

## Context Pattern

```typescript
// SomeContext.tsx
import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { ComponentChildren, FunctionComponent } from 'preact';

const SomeContext = createContext<SomeContextValue | null>(null);

function useSome(): SomeContextValue {
  const ctx = useContext(SomeContext);
  if (!ctx) throw new Error('useSome must be used within SomeProvider');
  return ctx;
}

const SomeProvider: FunctionComponent<{ value: SomeContextValue; children: ComponentChildren }> =
  ({ value, children }) => <SomeContext.Provider value={value}>{children}</SomeContext.Provider>;

export { SomeProvider, useSome };
```

Named exports at the bottom of the file. Memoize the `value` passed to a provider.

## State vs Operations Split (MapContext)

- **State context** changes with the map (consumers re-render).
- **Operations context** holds stable function references (consumers that only call operations do not re-render on state change).

## Provider Composition

`components/mapcanvas/MapCanvas.tsx` nests:

```
MapSelectionProvider            (takes layerVisibility)
└ ObjectLinkingProvider
  └ MapCanvasContent
    └ EventHandlerProvider
      └ MapStateProvider
        └ MapOperationsProvider
          └ Coordinators + canvas + {children} (layers passed in by DungeonMapTracker)
```

`AppContext` is provided above this (plugin mount / view). `MapSettingsProvider` is separate: only `MapSettingsModal` mounts it.

## EventHandlerContext

Layers register pointer handlers; `useEventCoordinator` (hooks/canvas) reads them and routes canvas pointer events by current tool.

- Registry type: `HandlersRegistry` (`Partial<Record<HandlerLayerName, LayerHandlers>>`); layer names and handler shapes are in `types/hooks/eventCoordinator.types.ts`.
- Value: `registerHandlers(name, handlers)`, `unregisterHandlers(name)`, `getHandlers(name)`, `getAllHandlers()`. Handlers live in a ref, so registering does not re-render.
- Layers should not call `registerHandlers` directly. Use `useLayerHandlers(name, handlers, { enabled })` (`hooks/canvas/useLayerHandlers.ts`): it registers a stable Proxy over a ref that is refreshed each render, so the coordinator always calls the latest closures without re-registering mid-gesture.
- There is no priority system; ordering/routing is in `useEventCoordinator`.

## Adding a New Context

1. Create `NewContext.tsx` following the pattern above; define the value type in `types/contexts/`.
2. Add the provider to the right place in `MapCanvas.tsx` (or the modal that owns it).
3. Export provider and hook(s) by name.

## Common Gotchas

- **Value stability**: memoize provider values; unstable objects re-render every consumer.
- **Missing provider**: access hooks throw outside their provider. `MapSettings` hooks throw anywhere except the settings modal.
- **Don't overload**: keep contexts focused; split state from operations when consumers differ.
- **Contexts shouldn't depend on each other.**

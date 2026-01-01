# React Contexts

## Purpose

Provide shared state and operations to the component tree without prop drilling. Contexts are the backbone of the composition architecture.

## Available Contexts

| Context | Purpose | Key Values |
|---------|---------|------------|
| `MapContext` | Core map state | `canvasRef`, `geometry`, `mapData`, coordinate utils |
| `MapSettingsContext` | Settings and preferences | `settings`, `dispatch`, current layer, visibility |
| `MapSelectionContext` | Selection state | `selectedObjects`, `multiSelectRect`, selection ops |
| `EventHandlerContext` | Centralized events | `registerHandler`, event dispatch |

## Context Pattern

Each context follows the same structure:

```javascript
// SomeContext.jsx
const SomeStateContext = dc.createContext(null);
const SomeOperationsContext = dc.createContext(null);

// Access hook with error boundary
function useSomeState() {
  const context = dc.useContext(SomeStateContext);
  if (!context) {
    throw new Error('useSomeState must be used within SomeStateProvider');
  }
  return context;
}

function useSomeOperations() {
  const context = dc.useContext(SomeOperationsContext);
  if (!context) {
    throw new Error('useSomeOperations must be used within SomeOperationsProvider');
  }
  return context;
}

// Provider components
const SomeStateProvider = ({ value, children }) => (
  <SomeStateContext.Provider value={value}>
    {children}
  </SomeStateContext.Provider>
);

const SomeOperationsProvider = ({ value, children }) => (
  <SomeOperationsContext.Provider value={value}>
    {children}
  </SomeOperationsContext.Provider>
);

return { 
  SomeStateProvider, 
  SomeOperationsProvider,
  useSomeState, 
  useSomeOperations 
};
```

## State vs Operations Split

Contexts are split into State and Operations to optimize re-renders:

- **State Context**: Read-only values that change (triggers re-render)
- **Operations Context**: Stable function references (rarely changes)

```javascript
// Components that only call operations don't re-render on state changes
function ActionButton() {
  const { doSomething } = useSomeOperations();  // Stable reference
  return <button onClick={doSomething}>Do It</button>;
}

// Components that read state re-render when state changes
function Display() {
  const { currentValue } = useSomeState();  // Re-renders on change
  return <div>{currentValue}</div>;
}
```

## Provider Composition

Providers are composed in MapCanvas:

```javascript
function MapCanvas() {
  // Compute state values...
  
  return (
    <MapStateProvider value={mapState}>
      <MapOperationsProvider value={mapOperations}>
        <MapSettingsProvider value={settingsValue}>
          <MapSelectionProvider value={selectionValue}>
            <EventHandlerProvider value={eventValue}>
              {/* Layer components */}
            </EventHandlerProvider>
          </MapSelectionProvider>
        </MapSettingsProvider>
      </MapOperationsProvider>
    </MapStateProvider>
  );
}
```

## MapContext Details

```javascript
// State
const mapState = {
  canvasRef,           // Ref to main canvas element
  geometry,            // GridGeometry or HexGeometry instance
  mapData,             // Current map data object
  dimensions,          // Canvas dimensions
  transform,           // Pan/zoom transform
};

// Operations  
const mapOperations = {
  getObjectAtPosition,
  addObject,
  removeObject,
  updateObject,
  getCellAtPosition,
  // ...
};
```

## MapSettingsContext Details

```javascript
// Uses reducer pattern
const { settings, dispatch } = useMapSettings();

// Dispatch actions
dispatch({ type: 'UPDATE_SETTING', payload: { key: 'showGrid', value: false } });
dispatch({ type: 'SET_CURRENT_LAYER', payload: 'layer-2' });
```

## MapSelectionContext Details

```javascript
const { 
  selectedObjects,      // Set of selected object IDs
  multiSelectRect,      // Current selection rectangle
  selectObject,         // Add to selection
  deselectObject,       // Remove from selection
  clearSelection,       // Clear all
  toggleSelection,      // Toggle single object
} = useMapSelection();
```

## EventHandlerContext Details

Coordinates event handling across layers:

```javascript
const { registerHandler, unregisterHandler } = useEventHandler();

// Register with priority
registerHandler('myTool', {
  onPointerDown: (e, coords) => { /* ... */ },
  onPointerMove: (e, coords) => { /* ... */ },
  onPointerUp: (e, coords) => { /* ... */ },
  priority: 10  // Higher = handled first
});
```

## Adding a New Context

1. Create `NewContext.jsx` following the pattern above
2. Define State and Operations interfaces (types)
3. Create Provider components
4. Create access hooks with error boundaries
5. Add to provider composition in MapCanvas
6. Export via `return { ... }`

## Common Gotchas

- **Context value stability** - Memoize context values to prevent re-renders
- **Missing provider** - Hooks throw if used outside provider
- **Circular dependencies** - Contexts shouldn't depend on each other
- **Datacore hooks** - Use `dc.createContext`, `dc.useContext`
- **Don't overload** - Keep contexts focused, create new ones if needed
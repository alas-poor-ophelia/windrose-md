source

# MapCanvas Composition Refactor Plan

## Overview

Transform monolithic MapCanvas into composable layers with Context for shared state. Each phase is independently testable and delivers working functionality.

**Goals:**
- Eliminate parameter bloat (currently 20+ parameters per hook)
- Improve maintainability through separation of concerns
- Enable flexible composition of map features
- Maintain backward compatibility during transition

**Pattern:**
- Context API for shared state (mapData, refs, coordinate utilities)
- Component composition for interaction layers (drawing, objects, text, etc.)
- Dot notation for API clarity (`MapCanvas.ObjectLayer`)
- Separate files for each layer

---

## Phase 1: Add Context Infrastructure

**Goal:** Create Context and make it available alongside existing prop passing. Both systems work simultaneously with no breaking changes.

**Success Criteria:** Application works identically. No behavior changes. Context exists but is optional.

---

### Step 1.1: Create MapContext Module

**Deliverable:** New file `MapContext.js`

**Purpose:** Define Context providers and consumer hooks for shared map state.

```javascript
/**
 * MapContext.js
 * Provides shared map state and operations to all layers via Context
 */

const MapStateContext = dc.createContext(null);
const MapOperationsContext = dc.createContext(null);

/**
 * Hook to access shared map state
 * @returns {Object} Map state (canvasRef, mapData, geometry, coordinate utils)
 * @throws {Error} If used outside MapStateProvider
 */
function useMapState() {
  const context = dc.useContext(MapStateContext);
  if (!context) {
    throw new Error('useMapState must be used within MapStateProvider');
  }
  return context;
}

/**
 * Hook to access map operations
 * @returns {Object} Map operations (getObjectAtPosition, addObject, etc.)
 * @throws {Error} If used outside MapOperationsProvider
 */
function useMapOperations() {
  const context = dc.useContext(MapOperationsContext);
  if (!context) {
    throw new Error('useMapOperations must be used within MapOperationsProvider');
  }
  return context;
}

/**
 * Provider component for map state
 * Wraps children and provides read-only map state via Context
 */
const MapStateProvider = ({ value, children }) => {
  return (
    <MapStateContext.Provider value={value}>
      {children}
    </MapStateContext.Provider>
  );
};

/**
 * Provider component for map operations
 * Wraps children and provides map operation functions via Context
 */
const MapOperationsProvider = ({ value, children }) => {
  return (
    <MapOperationsContext.Provider value={value}>
      {children}
    </MapOperationsContext.Provider>
  );
};

// Datacore export
return { 
  MapStateProvider, 
  MapOperationsProvider,
  useMapState, 
  useMapOperations,
  MapStateContext,
  MapOperationsContext
};
```

**Testing Checkpoint:**
- [ ] File loads without errors via `dc.require()`
- [ ] All exports are available
- [ ] No console errors

**Verification Commands:**
```javascript
// In Obsidian console or test component
const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);
const context = await requireModuleByName("MapContext.js");
console.log(context); // Should show all exports
```

---

### Step 1.2: Wrap MapCanvas Content in Providers

**Deliverable:** Modified `MapCanvas.jsx`

**Purpose:** Add Context providers inside MapCanvas without changing any other behavior.

**Changes:**
1. Import MapContext module
2. Build Context value objects from existing state
3. Wrap return JSX in providers

**Code Changes:**

```javascript
// At top of MapCanvas.jsx, add import
const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

// Add this import with other imports
const { MapStateProvider, MapOperationsProvider } = await requireModuleByName("MapContext.js");

// ... all existing code unchanged ...

const MapCanvas = ({ mapData, onCellsChange, /* ... all existing props */ }) => {
  // ... all existing hooks and logic unchanged ...
  
  // NEW: Build context values (add before return statement)
  const mapStateValue = dc.useMemo(() => ({
    canvasRef,
    containerRef,
    mapData,
    geometry,
    currentTool,
    selectedColor,
    selectedObjectType,
    screenToGrid,
    screenToWorld,
    getClientCoords,
    GridGeometry,
    HexGeometry
  }), [canvasRef, containerRef, mapData, geometry, currentTool, selectedColor, 
       selectedObjectType, screenToGrid, screenToWorld, getClientCoords]);

  const mapOperationsValue = dc.useMemo(() => ({
    // Object operations
    getObjectAtPosition,
    addObject,
    updateObject,
    removeObject,
    isAreaFree,
    canResizeObject,
    removeObjectAtPosition,
    removeObjectsInRectangle,
    
    // Text operations
    getTextLabelAtPosition,
    addTextLabel,
    updateTextLabel,
    removeTextLabel,
    
    // Callbacks
    onCellsChange,
    onObjectsChange,
    onTextLabelsChange,
    onViewStateChange
  }), [onCellsChange, onObjectsChange, onTextLabelsChange, onViewStateChange]);
  
  // MODIFIED: Wrap existing return in providers
  return (
    <MapStateProvider value={mapStateValue}>
      <MapOperationsProvider value={mapOperationsValue}>
        {/* ALL EXISTING JSX GOES HERE - DON'T CHANGE IT */}
        <div ref={containerRef} className="dmt-map-canvas-container">
          <canvas
            ref={canvasRef}
            className="dmt-map-canvas"
            width={canvasDimensions.width}
            height={canvasDimensions.height}
            style={{ 
              cursor: getCursorStyle(),
              touchAction: 'none' 
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            onWheel={handleWheel}
            onDoubleClick={handleCanvasDoubleClick}
            onKeyDown={handleKeyDown}
            tabIndex={0}
          />
          
          {/* All existing UI elements unchanged */}
          <MapCanvasActionButtons /* ... */ />
          <LinkedNoteHoverOverlays /* ... */ />
          {/* ... all other existing JSX ... */}
        </div>
      </MapOperationsProvider>
    </MapStateProvider>
  );
};

// Existing export unchanged
return { MapCanvas };
```

**Testing Checkpoint:**
- [ ] Application loads without errors
- [ ] All functionality works exactly as before
- [ ] No console warnings about Context
- [ ] Drawing works (select draw tool, draw on canvas)
- [ ] Object placement works (select addObject, click to place)
- [ ] Text labels work (select addText, click to place)
- [ ] Pan/zoom works (space+drag, mouse wheel)
- [ ] Selection works (select tool, click objects/text)
- [ ] Note pins work (select note_pin type, place and link)

---

### Step 1.3: Update Hooks to Use Context (Backward Compatible)

**Deliverable:** Modified hooks that can read from Context OR props

**Purpose:** Hooks read from Context when available, but still accept props for backward compatibility. This allows gradual migration.

**Pattern to Apply to Each Hook:**

```javascript
// At top of hook file
const { useMapState, useMapOperations, MapStateContext, MapOperationsContext } = 
  await requireModuleByName("MapContext.js");

const useSomeHook = (
  // All existing parameters stay
  canvasRef,
  mapData,
  screenToGrid,
  // ... etc
) => {
  // Try to get from Context (may be null if not in provider)
  const contextState = dc.useContext(MapStateContext);
  const contextOps = dc.useContext(MapOperationsContext);
  
  // Use context if available, otherwise use params (backward compatible)
  const actualCanvasRef = contextState?.canvasRef ?? canvasRef;
  const actualMapData = contextState?.mapData ?? mapData;
  const actualScreenToGrid = contextState?.screenToGrid ?? screenToGrid;
  // ... etc for all shared values
  
  const actualGetObjectAtPosition = contextOps?.getObjectAtPosition ?? getObjectAtPosition;
  // ... etc for all operations
  
  // Rest of hook logic uses `actual*` variables instead of direct params
  const someFunction = () => {
    const coords = actualScreenToGrid(x, y); // Use actual*, not direct param
    const obj = actualGetObjectAtPosition(actualMapData.objects, x, y);
    // ...
  };
  
  // ... rest of hook unchanged
};
```

**Apply This Pattern To:**

#### 1. `useObjectInteractions.js`

**Shared values to get from Context:**
- canvasRef, containerRef, mapData, screenToGrid, screenToWorld, getClientCoords
- GridGeometry (use `contextState?.GridGeometry ?? GridGeometry`)
- getObjectAtPosition, addObject, updateObject, removeObject, isAreaFree

**Keep as parameters:**
- currentTool, selectedObjectType, onObjectsChange, onAddCustomColor, customColors
- selectedItem, setSelectedItem, isDraggingSelection, setIsDraggingSelection, dragStart, setDragStart

#### 2. `useDrawingTools.js`

**Shared values to get from Context:**
- canvasRef, mapData, screenToGrid, screenToWorld, getClientCoords, GridGeometry
- getTextLabelAtPosition, removeTextLabel, getObjectAtPosition, removeObjectAtPosition, removeObjectsInRectangle
- onCellsChange, onObjectsChange, onTextLabelsChange

**Keep as parameters:**
- currentTool, selectedColor

#### 3. `useTextLabelInteraction.js`

**Shared values to get from Context:**
- canvasRef, mapData, screenToWorld, getClientCoords
- getTextLabelAtPosition, addTextLabel, updateTextLabel, removeTextLabel
- onTextLabelsChange

**Keep as parameters:**
- currentTool, onAddCustomColor, customColors
- selectedItem, setSelectedItem, isDraggingSelection, setIsDraggingSelection, dragStart, setDragStart

#### 4. `useNotePinInteraction.js`

**Shared values to get from Context:**
- mapData, getObjectAtPosition, onObjectsChange

**Keep as parameters:**
- currentTool, selectedObjectType

#### 5. `useCanvasInteraction.js`

**Shared values to get from Context:**
- canvasRef, mapData, onViewStateChange

**Keep as parameters:**
- isFocused

**Testing Checkpoint (After Each Hook):**
- [ ] Hook loads without errors
- [ ] Feature still works correctly (drawing/objects/text/panning as appropriate)
- [ ] No console errors or warnings
- [ ] Test with Context (normal use) and without (if used in isolation)

**Full Application Testing Checkpoint:**
- [ ] All drawing tools work (draw, erase, rectangle, circle, line, clear area)
- [ ] All object operations work (place, select, drag, resize, color, notes)
- [ ] All text operations work (place, select, drag, rotate, edit)
- [ ] All note pin operations work (place, link, edit)
- [ ] Pan and zoom work correctly
- [ ] Undo/redo work correctly
- [ ] No performance regressions

---

## Phase 2: Extract ObjectLayer Component

**Goal:** Move all object interaction logic into a dedicated `ObjectLayer` component using dot notation (`MapCanvas.ObjectLayer`).

**Success Criteria:** Object functionality works identically, but logic is in separate component file.

---

### Step 2.1: Create ObjectLayer Component

**Deliverable:** New file `ObjectLayer.jsx`

**Purpose:** Self-contained component managing all object interactions.

```javascript
/**
 * ObjectLayer.jsx
 * Handles all object-related interactions:
 * - Object placement
 * - Object selection and dragging
 * - Object resizing
 * - Object color and notes
 * - Hover tooltips
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useMapState, useMapOperations } = await requireModuleByName("MapContext.js");
const { useObjectInteractions } = await requireModuleByName("useObjectInteractions.js");
const { TextInputModal } = await requireModuleByName("TextInputModal.jsx");
const { ColorPicker } = await requireModuleByName("ColorPicker.jsx");

/**
 * ObjectLayer Component
 * 
 * @param {string} currentTool - Current active tool
 * @param {string} selectedObjectType - Currently selected object type
 * @param {Function} onObjectsChange - Callback when objects change
 * @param {Array} customColors - Array of custom colors
 * @param {Function} onAddCustomColor - Callback to add custom color
 * @param {Function} onDeleteCustomColor - Callback to delete custom color
 */
const ObjectLayer = ({ 
  currentTool,
  selectedObjectType,
  onObjectsChange,
  customColors,
  onAddCustomColor,
  onDeleteCustomColor
}) => {
  // Get shared state from Context
  const { canvasRef, containerRef, mapData, geometry, screenToGrid, screenToWorld, getClientCoords, GridGeometry } = useMapState();
  const { getObjectAtPosition, addObject, updateObject, removeObject, isAreaFree } = useMapOperations();
  
  // Local selection state for this layer
  const [selectedItem, setSelectedItem] = dc.useState(null);
  const [isDraggingSelection, setIsDraggingSelection] = dc.useState(false);
  const [dragStart, setDragStart] = dc.useState(null);
  
  // Object note modal state
  const [showNoteModal, setShowNoteModal] = dc.useState(false);
  const [editingObjectId, setEditingObjectId] = dc.useState(null);
  
  // Object color picker state
  const [showObjectColorPicker, setShowObjectColorPicker] = dc.useState(false);
  
  // Use object interactions hook
  const {
    isResizeMode,
    setIsResizeMode,
    isResizing,
    resizeCorner,
    hoveredObject,
    setHoveredObject,
    mousePosition,
    objectColorBtnRef,
    pendingObjectCustomColorRef,
    handleObjectPlacement,
    handleObjectSelection,
    handleObjectDragging,
    handleObjectResizing,
    handleHoverUpdate,
    stopObjectDragging,
    stopObjectResizing,
    handleObjectKeyDown,
    calculateLabelButtonPosition,
    calculateLinkNoteButtonPosition,
    calculateResizeButtonPosition,
    calculateObjectColorButtonPosition,
    handleNoteSubmit,
    handleObjectColorSelect,
    handleObjectColorReset,
    getClickedCorner
  } = useObjectInteractions(
    canvasRef,
    containerRef,
    mapData,
    currentTool,
    selectedObjectType,
    onObjectsChange,
    onAddCustomColor,
    customColors,
    screenToGrid,
    screenToWorld,
    getClientCoords,
    GridGeometry,
    selectedItem,
    setSelectedItem,
    isDraggingSelection,
    setIsDraggingSelection,
    dragStart,
    setDragStart,
    getObjectAtPosition,
    addObject,
    updateObject,
    removeObject,
    isAreaFree
  );
  
  // Handle opening note modal
  const handleOpenNoteModal = () => {
    if (selectedItem?.type === 'object') {
      setEditingObjectId(selectedItem.id);
      setShowNoteModal(true);
    }
  };
  
  // Handle note modal submit
  const handleNoteModalSubmit = (content) => {
    handleNoteSubmit(content, editingObjectId);
    setShowNoteModal(false);
    setEditingObjectId(null);
  };
  
  // Handle note modal cancel
  const handleNoteModalCancel = () => {
    setShowNoteModal(false);
    setEditingObjectId(null);
  };
  
  // Expose handlers for event coordination
  // We'll use this in next step when we integrate with event handling
  dc.useEffect(() => {
    // This will be used by parent for event coordination
    // For now, just placeholder
  }, []);
  
  // Render object-specific UI
  return (
    <>
      {/* Object selection UI - resize button, color button, note buttons */}
      {selectedItem?.type === 'object' && (
        <>
          {/* Resize toggle button */}
          <button
            className={`dmt-resize-toggle-button ${isResizeMode ? 'active' : ''}`}
            style={{
              position: 'absolute',
              left: `${calculateResizeButtonPosition().x}px`,
              top: `${calculateResizeButtonPosition().y}px`,
            }}
            onClick={() => setIsResizeMode(!isResizeMode)}
            title={isResizeMode ? "Exit resize mode" : "Enter resize mode"}
          >
            <dc.Icon name={isResizeMode ? "check" : "maximize-2"} size={16} />
          </button>
          
          {/* Object color button */}
          <button
            ref={objectColorBtnRef}
            className="dmt-object-color-button"
            style={{
              position: 'absolute',
              left: `${calculateObjectColorButtonPosition().x}px`,
              top: `${calculateObjectColorButtonPosition().y}px`,
            }}
            onClick={() => setShowObjectColorPicker(!showObjectColorPicker)}
            title="Change object color"
          >
            <dc.Icon name="palette" size={16} />
          </button>
          
          {/* Add/edit note button */}
          <button
            className="dmt-label-button"
            style={{
              position: 'absolute',
              left: `${calculateLabelButtonPosition().x}px`,
              top: `${calculateLabelButtonPosition().y}px`,
            }}
            onClick={handleOpenNoteModal}
            title={selectedItem.data?.customTooltip ? "Edit note" : "Add note"}
          >
            <dc.Icon name={selectedItem.data?.customTooltip ? "file-text" : "plus"} size={16} />
          </button>
        </>
      )}
      
      {/* Object color picker */}
      {showObjectColorPicker && selectedItem?.type === 'object' && (
        <ColorPicker
          selectedColor={selectedItem.data?.color || '#ffffff'}
          onColorSelect={handleObjectColorSelect}
          onReset={() => handleObjectColorReset(setShowObjectColorPicker)}
          onClose={() => setShowObjectColorPicker(false)}
          anchorRef={objectColorBtnRef}
          customColors={customColors}
          onAddCustomColor={onAddCustomColor}
          onDeleteCustomColor={onDeleteCustomColor}
          pendingCustomColorRef={pendingObjectCustomColorRef}
        />
      )}
      
      {/* Object note modal */}
      {showNoteModal && (
        <TextInputModal
          title={selectedItem?.data?.customTooltip ? "Edit Note" : "Add Note"}
          initialValue={selectedItem?.data?.customTooltip || ''}
          onSubmit={handleNoteModalSubmit}
          onCancel={handleNoteModalCancel}
          placeholder="Enter note text..."
          submitLabel="Save"
          multiline={true}
        />
      )}
      
      {/* Hover tooltips for objects */}
      {hoveredObject && mousePosition && !isDraggingSelection && (
        <div
          className="dmt-object-tooltip"
          style={{
            position: 'absolute',
            left: `${mousePosition.x + 10}px`,
            top: `${mousePosition.y + 10}px`,
            pointerEvents: 'none'
          }}
        >
          {hoveredObject.customTooltip || hoveredObject.type}
        </div>
      )}
    </>
  );
};

// Datacore export
return { ObjectLayer };
```

**Testing Checkpoint:**
- [ ] File loads without errors
- [ ] Component can be imported via `dc.require()`
- [ ] No console errors when imported

---

### Step 2.2: Attach ObjectLayer to MapCanvas

**Deliverable:** Modified `MapCanvas.jsx`

**Purpose:** Import ObjectLayer and attach it using dot notation.

```javascript
// In MapCanvas.jsx, add import
const { ObjectLayer } = await requireModuleByName("ObjectLayer.jsx");

// ... existing MapCanvas component code ...

// AFTER the MapCanvas component definition, BEFORE the return statement:
// Attach sub-components using dot notation
MapCanvas.ObjectLayer = ObjectLayer;

// Existing export
return { MapCanvas };
```

**Testing Checkpoint:**
- [ ] MapCanvas exports successfully
- [ ] ObjectLayer is accessible as `MapCanvas.ObjectLayer`
- [ ] Can verify in console: `const { MapCanvas } = await requireModuleByName("MapCanvas.jsx"); console.log(MapCanvas.ObjectLayer);`

---

### Step 2.3: Render ObjectLayer in DungeonMapTracker

**Deliverable:** Modified `DungeonMapTracker.jsx`

**Purpose:** Use the new ObjectLayer component alongside existing MapCanvas.

**Note:** At this point, ObjectLayer and MapCanvas's internal object logic both run. They don't interfere because ObjectLayer manages its own selection state separately.

```javascript
// In DungeonMapTracker.jsx, the MapCanvas usage changes:

// OLD:
<MapCanvas
  mapData={mapData}
  onCellsChange={handleCellsChange}
  onObjectsChange={handleObjectsChange}
  onTextLabelsChange={handleTextLabelsChange}
  currentTool={currentTool}
  onViewStateChange={handleViewStateChange}
  selectedObjectType={selectedObjectType}
  selectedColor={selectedColor}
  isColorPickerOpen={showColorPicker}
  customColors={customColors}
  onAddCustomColor={handleAddCustomColor}
  onDeleteCustomColor={handleDeleteCustomColor}
  isFocused={isLeftPanelCollapsed}
  isAnimating={isAnimating}
/>

// NEW (add ObjectLayer as child):
<MapCanvas
  mapData={mapData}
  onCellsChange={handleCellsChange}
  onObjectsChange={handleObjectsChange}
  onTextLabelsChange={handleTextLabelsChange}
  currentTool={currentTool}
  onViewStateChange={handleViewStateChange}
  selectedObjectType={selectedObjectType}
  selectedColor={selectedColor}
  isColorPickerOpen={showColorPicker}
  customColors={customColors}
  onAddCustomColor={handleAddCustomColor}
  onDeleteCustomColor={handleDeleteCustomColor}
  isFocused={isLeftPanelCollapsed}
  isAnimating={isAnimating}
>
  {/* NEW: Add ObjectLayer as child */}
  <MapCanvas.ObjectLayer
    currentTool={currentTool}
    selectedObjectType={selectedObjectType}
    onObjectsChange={handleObjectsChange}
    customColors={customColors}
    onAddCustomColor={handleAddCustomColor}
    onDeleteCustomColor={handleDeleteCustomColor}
  />
</MapCanvas>
```

**Testing Checkpoint:**
- [ ] Application loads without errors
- [ ] Two sets of object selection UI appear (one from MapCanvas, one from ObjectLayer) - this is expected
- [ ] Both work independently
- [ ] No console errors

---

### Step 2.4: Integrate ObjectLayer Event Handling

**Deliverable:** Modified `MapCanvas.jsx` and `ObjectLayer.jsx`

**Purpose:** Make MapCanvas's event coordination use ObjectLayer's handlers instead of its own.

**Strategy:** Use a pattern where ObjectLayer exposes its handlers via a callback prop, and MapCanvas's event coordination calls those handlers.

**Changes to ObjectLayer.jsx:**

```javascript
const ObjectLayer = ({ 
  currentTool,
  selectedObjectType,
  onObjectsChange,
  customColors,
  onAddCustomColor,
  onDeleteCustomColor,
  onRegisterHandlers // NEW: Callback to register handlers with parent
}) => {
  // ... existing state and hooks ...
  
  // Expose handlers to parent for event coordination
  dc.useEffect(() => {
    if (onRegisterHandlers) {
      onRegisterHandlers({
        // Event handlers
        handleObjectPlacement,
        handleObjectSelection,
        handleObjectDragging,
        handleObjectResizing,
        handleHoverUpdate,
        stopObjectDragging,
        stopObjectResizing,
        handleObjectKeyDown,
        
        // State for coordination
        isResizing,
        isDraggingSelection,
        selectedItem,
        setSelectedItem
      });
    }
  }, [
    handleObjectPlacement,
    handleObjectSelection,
    handleObjectDragging,
    handleObjectResizing,
    handleHoverUpdate,
    stopObjectDragging,
    stopObjectResizing,
    handleObjectKeyDown,
    isResizing,
    isDraggingSelection,
    selectedItem,
    onRegisterHandlers
  ]);
  
  // ... rest of component unchanged ...
};
```

**Changes to MapCanvas.jsx:**

```javascript
const MapCanvas = ({ /* ... existing props ... */ }) => {
  // ... existing code ...
  
  // NEW: Ref to hold ObjectLayer handlers
  const objectLayerHandlersRef = dc.useRef(null);
  
  // NEW: Callback for ObjectLayer to register its handlers
  const handleObjectLayerRegister = dc.useCallback((handlers) => {
    objectLayerHandlersRef.current = handlers;
  }, []);
  
  // MODIFY: useEventCoordination to use ObjectLayer handlers if available
  const eventCoordination = useEventCoordination({
    // ... existing params ...
    
    // Use ObjectLayer handlers if available, otherwise use local ones
    handleObjectPlacement: objectLayerHandlersRef.current?.handleObjectPlacement || handleObjectPlacement,
    handleObjectSelection: objectLayerHandlersRef.current?.handleObjectSelection || handleObjectSelection,
    handleObjectDragging: objectLayerHandlersRef.current?.handleObjectDragging || handleObjectDragging,
    handleObjectResizing: objectLayerHandlersRef.current?.handleObjectResizing || handleObjectResizing,
    handleHoverUpdate: objectLayerHandlersRef.current?.handleHoverUpdate || handleHoverUpdate,
    stopObjectDragging: objectLayerHandlersRef.current?.stopObjectDragging || stopObjectDragging,
    stopObjectResizing: objectLayerHandlersRef.current?.stopObjectResizing || stopObjectResizing,
    
    isResizing: objectLayerHandlersRef.current?.isResizing || isResizing,
    isDraggingSelection: objectLayerHandlersRef.current?.isDraggingSelection || isDraggingSelection,
    selectedItem: objectLayerHandlersRef.current?.selectedItem || selectedItem,
    setSelectedItem: objectLayerHandlersRef.current?.setSelectedItem || setSelectedItem,
    
    // ... rest of params unchanged ...
  });
  
  // ... existing return ...
};
```

**Changes to DungeonMapTracker.jsx:**

```javascript
<MapCanvas.ObjectLayer
  currentTool={currentTool}
  selectedObjectType={selectedObjectType}
  onObjectsChange={handleObjectsChange}
  customColors={customColors}
  onAddCustomColor={handleAddCustomColor}
  onDeleteCustomColor={handleDeleteCustomColor}
  onRegisterHandlers={/* MapCanvas will pass this */}
/>
```

Actually, this is getting complicated. Let me revise with a simpler approach.

**REVISED Step 2.4: Create Shared Selection Context**

Since both layers need to coordinate selection, create a shared selection context:

**New file: `MapSelectionContext.js`**

```javascript
/**
 * MapSelectionContext.js
 * Shared selection state for coordinating between layers
 */

const MapSelectionContext = dc.createContext(null);

function useMapSelection() {
  const context = dc.useContext(MapSelectionContext);
  if (!context) {
    throw new Error('useMapSelection must be used within MapSelectionProvider');
  }
  return context;
}

const MapSelectionProvider = ({ children }) => {
  const [selectedItem, setSelectedItem] = dc.useState(null);
  const [isDraggingSelection, setIsDraggingSelection] = dc.useState(false);
  const [dragStart, setDragStart] = dc.useState(null);
  
  const value = dc.useMemo(() => ({
    selectedItem,
    setSelectedItem,
    isDraggingSelection,
    setIsDraggingSelection,
    dragStart,
    setDragStart
  }), [selectedItem, isDraggingSelection, dragStart]);
  
  return (
    <MapSelectionContext.Provider value={value}>
      {children}
    </MapSelectionContext.Provider>
  );
};

return { MapSelectionProvider, useMapSelection };
```

**Update MapCanvas.jsx:**

```javascript
// Add import
const { MapSelectionProvider } = await requireModuleByName("MapSelectionContext.js");

// In return, add SelectionProvider
return (
  <MapStateProvider value={mapStateValue}>
    <MapOperationsProvider value={mapOperationsValue}>
      <MapSelectionProvider>
        {/* existing content */}
      </MapSelectionProvider>
    </MapOperationsProvider>
  </MapStateProvider>
);
```

**Update ObjectLayer.jsx:**

```javascript
// Add import
const { useMapSelection } = await requireModuleByName("MapSelectionContext.js");

const ObjectLayer = ({ /* ... */ }) => {
  // REMOVE local selection state
  // const [selectedItem, setSelectedItem] = dc.useState(null);
  // const [isDraggingSelection, setIsDraggingSelection] = dc.useState(false);
  // const [dragStart, setDragStart] = dc.useState(null);
  
  // USE shared selection from context
  const { selectedItem, setSelectedItem, isDraggingSelection, setIsDraggingSelection, dragStart, setDragStart } = useMapSelection();
  
  // Rest of component uses shared selection
  // ...
};
```

This way, selection is automatically shared between layers without manual handler registration.

**Testing Checkpoint:**
- [ ] Application loads
- [ ] Object placement works
- [ ] Object selection works (only one selection UI now, not two)
- [ ] Object dragging works
- [ ] Object resizing works
- [ ] Object color picker works
- [ ] Object notes work
- [ ] No duplicate UI elements
- [ ] Selection is shared (selecting from either layer works)

---

### Step 2.5: Remove Duplicate Object Logic from MapCanvas

**Deliverable:** Modified `MapCanvas.jsx`

**Purpose:** Remove MapCanvas's internal object interaction code since ObjectLayer now handles it.

**Changes:**
1. Remove `useObjectInteractions` hook call from MapCanvas
2. Remove object-related UI rendering from MapCanvas
3. Remove object-related state
4. Keep only what's needed for event coordination

```javascript
const MapCanvas = ({ /* ... */ }) => {
  // ... keep canvas interaction, drawing tools, text, etc. ...
  
  // REMOVE these lines:
  // const objectInteractions = useObjectInteractions(...);
  // const [showNoteModal, setShowNoteModal] = dc.useState(false);
  // const [editingObjectId, setEditingObjectId] = dc.useState(null);
  // const [showObjectColorPicker, setShowObjectColorPicker] = dc.useState(false);
  
  // ... rest of component ...
  
  return (
    <MapStateProvider value={mapStateValue}>
      <MapOperationsProvider value={mapOperationsValue}>
        <MapSelectionProvider>
          <div ref={containerRef} className="dmt-map-canvas-container">
            <canvas /* ... */ />
            
            {/* REMOVE object-specific UI - now in ObjectLayer */}
            {/* {selectedItem?.type === 'object' && ( ... )} */}
            {/* {showObjectColorPicker && ( ... )} */}
            {/* {showNoteModal && ( ... )} */}
            
            {/* Keep non-object UI */}
            <MapCanvasActionButtons /* ... */ />
            <LinkedNoteHoverOverlays /* ... */ />
            
            {/* Render children (layers) */}
            {children}
          </div>
        </MapSelectionProvider>
      </MapOperationsProvider>
    </MapStateProvider>
  );
};
```

**Testing Checkpoint:**
- [ ] Application still works
- [ ] Object functionality unchanged
- [ ] No duplicate UI
- [ ] Code is cleaner (MapCanvas is smaller)
- [ ] All object features work: place, select, drag, resize, color, notes

---

**Phase 2 Complete!** ObjectLayer is now a fully independent, composable component.

---

## Phase 3: Extract Remaining Layers

Apply the same pattern from Phase 2 to each remaining layer. Each layer follows this process:
1. Create layer component file
2. Attach to MapCanvas using dot notation
3. Render as child in DungeonMapTracker
4. Share state via Context
5. Remove duplicate logic from MapCanvas

---

### Step 3.1: Extract DrawingLayer

**Deliverable:** New file `DrawingLayer.jsx`

**Purpose:** Handle all drawing tool interactions (draw, erase, rectangle, circle, line, clear area).

**Key Points:**
- Uses `useDrawingTools` hook internally
- Manages drawing state (isDrawing, rectangleStart, circleStart)
- Renders preview shapes during drawing
- Reads shared state from MapContext
- Receives tool-specific props (currentTool, selectedColor, onCellsChange)

**Component Structure:**

```javascript
const DrawingLayer = ({
  currentTool,
  selectedColor,
  onCellsChange,
  onObjectsChange,
  onTextLabelsChange
}) => {
  // Get shared state from Context
  const { canvasRef, mapData, screenToGrid, screenToWorld, getClientCoords, GridGeometry } = useMapState();
  const { getTextLabelAtPosition, removeTextLabel, getObjectAtPosition, removeObjectAtPosition, removeObjectsInRectangle } = useMapOperations();
  
  // Use drawing tools hook
  const drawingTools = useDrawingTools(
    canvasRef,
    mapData,
    currentTool,
    selectedColor,
    onCellsChange,
    onObjectsChange,
    onTextLabelsChange,
    screenToGrid,
    screenToWorld,
    getClientCoords,
    GridGeometry,
    getTextLabelAtPosition,
    removeTextLabel,
    getObjectAtPosition,
    removeObjectAtPosition,
    removeObjectsInRectangle
  );
  
  // Expose handlers for event coordination (if needed)
  // Render drawing preview overlays (if any)
  
  return null; // Or preview overlays
};

return { DrawingLayer };
```

**Attach to MapCanvas:**
```javascript
MapCanvas.DrawingLayer = DrawingLayer;
```

**Use in DungeonMapTracker:**
```javascript
<MapCanvas.DrawingLayer
  currentTool={currentTool}
  selectedColor={selectedColor}
  onCellsChange={handleCellsChange}
  onObjectsChange={handleObjectsChange}
  onTextLabelsChange={handleTextLabelsChange}
/>
```

**Testing Checkpoint:**
- [ ] All drawing tools work (draw, erase, rectangle, circle, line, clear area)
- [ ] Drawing on grid works correctly
- [ ] Rectangle and circle previews show while drawing
- [ ] Line drawing works
- [ ] Clear area works
- [ ] Undo/redo work with drawing

---

### Step 3.2: Extract TextLayer

**Deliverable:** New file `TextLayer.jsx`

**Purpose:** Handle text label interactions (placement, selection, dragging, rotation, editing).

**Key Points:**
- Uses `useTextLabelInteraction` hook
- Manages text modal state
- Renders text selection UI (rotate button, edit button)
- Uses shared MapSelectionContext for coordination with object selection

**Component Structure:**

```javascript
const TextLayer = ({
  currentTool,
  customColors,
  onAddCustomColor,
  onDeleteCustomColor,
  onTextLabelsChange
}) => {
  const { canvasRef, mapData, screenToWorld, getClientCoords } = useMapState();
  const { getTextLabelAtPosition, addTextLabel, updateTextLabel, removeTextLabel } = useMapOperations();
  const { selectedItem, setSelectedItem, isDraggingSelection, setIsDraggingSelection, dragStart, setDragStart } = useMapSelection();
  
  const textInteraction = useTextLabelInteraction(/* ... */);
  
  // Render text selection UI, text modal, etc.
  return (
    <>
      {selectedItem?.type === 'text' && (
        <>
          {/* Rotate button */}
          {/* Edit button */}
        </>
      )}
      
      {showTextModal && (
        <TextInputModal /* ... */ />
      )}
    </>
  );
};
```

**Testing Checkpoint:**
- [ ] Text placement works
- [ ] Text selection works
- [ ] Text dragging works
- [ ] Text rotation works
- [ ] Text editing works
- [ ] Double-click to edit works
- [ ] Text color and formatting work

---

### Step 3.3: Extract NotePinLayer

**Deliverable:** New file `NotePinLayer.jsx`

**Purpose:** Handle note pin interactions (placement, linking to Obsidian notes).

**Component Structure:**

```javascript
const NotePinLayer = ({
  currentTool,
  selectedObjectType,
  onObjectsChange
}) => {
  const { mapData } = useMapState();
  const { getObjectAtPosition } = useMapOperations();
  
  const notePinInteraction = useNotePinInteraction(/* ... */);
  
  // Render note link modal
  return (
    <>
      {showNoteLinkModal && (
        <NoteLinkModal /* ... */ />
      )}
    </>
  );
};
```

**Testing Checkpoint:**
- [ ] Note pin placement works
- [ ] Note linking modal appears
- [ ] Can link to Obsidian notes
- [ ] Can edit existing note links
- [ ] Note pins display correctly

---

### Step 3.4: Extract PanZoomLayer

**Deliverable:** New file `PanZoomLayer.jsx`

**Purpose:** Handle pan and zoom interactions.

**Component Structure:**

```javascript
const PanZoomLayer = ({
  onViewStateChange,
  isFocused
}) => {
  const { canvasRef, mapData } = useMapState();
  
  const canvasInteraction = useCanvasInteraction(
    canvasRef,
    mapData,
    onViewStateChange,
    isFocused
  );
  
  // Expose pan/zoom handlers
  // No visual rendering needed
  return null;
};
```

**Testing Checkpoint:**
- [ ] Pan works (space + drag, or select tool on empty space)
- [ ] Zoom works (mouse wheel)
- [ ] Touch gestures work (pinch to zoom, two-finger pan)
- [ ] View state updates correctly

---

**Phase 3 Complete!** All layers are extracted into separate components.

---

## Phase 4: Refactor Event Coordination

**Goal:** Create a clean event coordination system that routes pointer events to appropriate layers.

---

### Step 4.1: Create EventCoordinationLayer

**Deliverable:** New file `EventCoordinationLayer.jsx`

**Purpose:** Central event routing that connects canvas events to layer handlers.

**Strategy:** Layers register their handlers via Context, coordinator routes events based on currentTool and state.

**New file: `EventHandlerContext.js`**

```javascript
/**
 * EventHandlerContext.js
 * Allows layers to register their event handlers for coordination
 */

const EventHandlerContext = dc.createContext(null);

function useEventHandlerRegistration() {
  const context = dc.useContext(EventHandlerContext);
  return context;
}

const EventHandlerProvider = ({ children }) => {
  const handlersRef = dc.useRef({
    object: null,
    drawing: null,
    text: null,
    notePin: null,
    panZoom: null
  });
  
  const registerHandlers = dc.useCallback((layerName, handlers) => {
    handlersRef.current[layerName] = handlers;
  }, []);
  
  const getHandlers = dc.useCallback((layerName) => {
    return handlersRef.current[layerName];
  }, []);
  
  const value = dc.useMemo(() => ({
    registerHandlers,
    getHandlers,
    handlersRef
  }), [registerHandlers, getHandlers]);
  
  return (
    <EventHandlerContext.Provider value={value}>
      {children}
    </EventHandlerContext.Provider>
  );
};

return { EventHandlerProvider, useEventHandlerRegistration };
```

**EventCoordinationLayer.jsx:**

```javascript
/**
 * EventCoordinationLayer.jsx
 * Routes pointer events to appropriate layer handlers
 */

const EventCoordinationLayer = ({
  currentTool,
  isColorPickerOpen,
  showObjectColorPicker
}) => {
  const { canvasRef } = useMapState();
  const { getHandlers } = useEventHandlerRegistration();
  
  // Event routing logic
  const handlePointerDown = (e) => {
    // Based on currentTool, route to appropriate handler
    if (currentTool === 'select') {
      const objectHandlers = getHandlers('object');
      const textHandlers = getHandlers('text');
      // Try object, then text, then pan
      // ...
    } else if (currentTool === 'draw' || /* ... */) {
      const drawingHandlers = getHandlers('drawing');
      // Call drawing handler
    }
    // ... etc
  };
  
  // Attach event listeners to canvas
  dc.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    // ... etc
    
    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      // ... etc
    };
  }, [currentTool, /* ... dependencies ... */]);
  
  return null; // No visual rendering
};

return { EventCoordinationLayer };
```

**Update layers to register handlers:**

```javascript
// In ObjectLayer.jsx
const { registerHandlers } = useEventHandlerRegistration();

dc.useEffect(() => {
  registerHandlers('object', {
    handleObjectPlacement,
    handleObjectSelection,
    handleObjectDragging,
    // ... etc
  });
}, [registerHandlers, /* handler dependencies */]);
```

**Testing Checkpoint:**
- [ ] All event routing works correctly
- [ ] Tools respond to clicks appropriately
- [ ] Multi-layer coordination works (e.g., select tool tries object, then text)
- [ ] Touch events work
- [ ] No event conflicts between layers

---

## Phase 5: Cleanup and Optimization

**Goal:** Remove technical debt, optimize performance, clean up unused code.

---

### Step 5.1: Remove Unused Parameters from Hooks

**Deliverable:** Modified hook files

**Purpose:** Now that Context is established, remove parameters that are no longer needed.

**Process:**
1. Remove unused parameters from hook function signatures
2. Remove fallback logic (`?? paramName`)
3. Verify hooks only use Context values

**Example:**

```javascript
// BEFORE
const useObjectInteractions = (
  canvasRef,  // Remove - from Context
  containerRef,  // Remove - from Context
  mapData,  // Remove - from Context
  currentTool,  // Keep - changes frequently
  selectedObjectType,  // Keep - specific to this layer
  onObjectsChange,  // Keep - callback
  // ... etc
) => {
  const contextState = dc.useContext(MapStateContext);
  const actualCanvasRef = contextState?.canvasRef ?? canvasRef;
  // ...
};

// AFTER
const useObjectInteractions = (
  currentTool,  // Only layer-specific params remain
  selectedObjectType,
  onObjectsChange,
  onAddCustomColor,
  customColors,
  selectedItem,
  setSelectedItem,
  isDraggingSelection,
  setIsDraggingSelection,
  dragStart,
  setDragStart
) => {
  const { canvasRef, containerRef, mapData, screenToGrid, /* ... */ } = useMapState();
  const { getObjectAtPosition, addObject, /* ... */ } = useMapOperations();
  // Direct usage, no fallbacks
};
```

**Apply to all hooks:**
- useObjectInteractions
- useDrawingTools
- useTextLabelInteraction
- useNotePinInteraction
- useCanvasInteraction

**Testing Checkpoint:**
- [ ] All functionality still works
- [ ] No console errors
- [ ] Hooks are cleaner and easier to read

---

### Step 5.2: Optimize Context Re-renders

**Deliverable:** Split contexts if needed for performance

**Purpose:** Prevent unnecessary re-renders by splitting Context into stable and changing values.

**Analysis:**
- `mapData` changes frequently â†’ May cause re-renders
- `canvasRef`, `geometry`, utils â†’ Stable, rarely change
- Check for performance issues

**If needed, split into:**
- `MapStaticContext` - refs, geometry, utils (never changes)
- `MapDynamicContext` - mapData, currentTool (changes frequently)

**Testing Checkpoint:**
- [ ] No performance regressions
- [ ] Smooth drawing and interaction
- [ ] No unnecessary re-renders (use React DevTools profiler if needed)

---

### Step 5.3: Update Documentation

**Deliverable:** Updated component documentation

**Purpose:** Document the new architecture for future development.

**Updates needed:**
1. Update main README with architecture overview
2. Add JSDoc comments to all layer components
3. Document Context usage patterns
4. Add examples of adding new layers
5. Update development plan with new architecture

---

### Step 5.4: Final Testing Pass

**Complete Application Testing:**

**Drawing Tools:**
- [ ] Draw tool works
- [ ] Erase tool works
- [ ] Rectangle tool works
- [ ] Circle tool works
- [ ] Line tool works
- [ ] Clear area tool works

**Object Features:**
- [ ] Place objects works
- [ ] Select objects works
- [ ] Drag objects works
- [ ] Resize objects works
- [ ] Change object color works
- [ ] Add/edit object notes works
- [ ] Object hover tooltips work
- [ ] Link objects to Obsidian notes works

**Text Features:**
- [ ] Place text works
- [ ] Select text works
- [ ] Drag text works
- [ ] Rotate text works
- [ ] Edit text works
- [ ] Double-click to edit works
- [ ] Text color works
- [ ] Text font/size works

**Note Pin Features:**
- [ ] Place note pins works
- [ ] Link to Obsidian notes works
- [ ] Edit note links works
- [ ] Note pin hover previews work

**Navigation:**
- [ ] Pan with space+drag works
- [ ] Pan with select tool on empty space works
- [ ] Zoom with mouse wheel works
- [ ] Touch pinch-to-zoom works
- [ ] Touch two-finger pan works
- [ ] View state persists

**General:**
- [ ] Undo/redo works for all operations
- [ ] File save/load works
- [ ] Grid rendering is correct
- [ ] North direction rotation works
- [ ] No console errors
- [ ] No performance issues
- [ ] Cross-platform compatibility (desktop and tablet)

---

## Rollback Plan

If issues arise at any phase, you can safely roll back:

**Phase 1:** Simply remove Context providers and hook modifications. Everything falls back to props.

**Phase 2-3:** Remove layer components from DungeonMapTracker. MapCanvas still has internal logic as fallback.

**Phase 4:** Remove EventCoordinationLayer, use previous event handling.

**Phase 5:** Revert individual changes as needed.

---

## Success Metrics

After completion:
- âœ… MapCanvas.jsx reduced from ~680 lines to ~200 lines
- âœ… No hooks with >10 parameters
- âœ… Each layer is independently testable
- âœ… New features can be added as new layers without touching existing code
- âœ… All functionality works identically to before refactor
- âœ… No performance regressions
- âœ… Code is more maintainable and understandable

---

## Timeline Estimate

- **Phase 1:** 2-3 hours (Context infrastructure)
- **Phase 2:** 3-4 hours (ObjectLayer extraction)
- **Phase 3:** 4-6 hours (Remaining layers)
- **Phase 4:** 2-3 hours (Event coordination)
- **Phase 5:** 2-3 hours (Cleanup and optimization)

**Total:** 13-19 hours of development + testing time

---

## Notes

- Test thoroughly after each step
- Don't skip testing checkpoints
- Keep git commits small and focused on single steps
- If something breaks, roll back to last working state
- Document any deviations from plan as you go

---

## Questions / Clarifications

Before starting:
1. Review the plan and ensure understanding of each phase
2. Verify all prerequisites are met
3. Create a backup branch
4. Ensure you have time for proper testing between phases
5. Clarify any unclear steps before proceeding
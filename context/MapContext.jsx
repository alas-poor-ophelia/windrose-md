/**
 * MapContext.jsx
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
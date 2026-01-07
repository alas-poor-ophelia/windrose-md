/**
 * MapContext.tsx
 * Provides shared map state and operations to all layers via Context
 */

// Type-only imports
import type { MapStateContextValue, MapOperationsContextValue } from '#types/contexts/context.types';

// Create contexts with proper typing
const MapStateContext = dc.createContext<MapStateContextValue | null>(null);
const MapOperationsContext = dc.createContext<MapOperationsContextValue | null>(null);

/**
 * Hook to access shared map state
 * @returns Map state (canvasRef, mapData, geometry, coordinate utils)
 * @throws If used outside MapStateProvider
 */
function useMapState(): MapStateContextValue {
  const context = dc.useContext(MapStateContext);
  if (!context) {
    throw new Error('useMapState must be used within MapStateProvider');
  }
  return context;
}

/**
 * Hook to access map operations
 * @returns Map operations (getObjectAtPosition, addObject, etc.)
 * @throws If used outside MapOperationsProvider
 */
function useMapOperations(): MapOperationsContextValue {
  const context = dc.useContext(MapOperationsContext);
  if (!context) {
    throw new Error('useMapOperations must be used within MapOperationsProvider');
  }
  return context;
}

/** Props for MapStateProvider */
interface MapStateProviderProps {
  value: MapStateContextValue;
  children: React.ReactNode;
}

/**
 * Provider component for map state
 * Wraps children and provides read-only map state via Context
 */
const MapStateProvider: React.FC<MapStateProviderProps> = ({ value, children }) => {
  return (
    <MapStateContext.Provider value={value}>
      {children}
    </MapStateContext.Provider>
  );
};

/** Props for MapOperationsProvider */
interface MapOperationsProviderProps {
  value: MapOperationsContextValue;
  children: React.ReactNode;
}

/**
 * Provider component for map operations
 * Wraps children and provides map operation functions via Context
 */
const MapOperationsProvider: React.FC<MapOperationsProviderProps> = ({ value, children }) => {
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

/**
 * EventHandlerContext.tsx
 *
 * Provides a registration system for event handlers from different layers.
 * Layers register their handlers (object, text, drawing, notePin, panZoom)
 * and the EventCoordinationLayer uses these to route pointer events.
 *
 * This enables clean separation: each layer owns its handlers,
 * EventCoordinationLayer owns the routing logic.
 */

// ===========================================
// Types
// ===========================================

/** Layer types that can register handlers */

import type { ComponentChildren, FunctionComponent } from 'preact';
import { createContext } from 'preact';
import { useCallback, useContext, useMemo, useRef } from 'preact/hooks';
import type { HandlerLayerName, HandlerTypeMap, LayerHandlers } from '#types/hooks/eventCoordinator.types';

/** All registered handlers by layer type */
export type HandlersRegistry = Partial<Record<HandlerLayerName, LayerHandlers>>;

/** EventHandlerContext value shape */
export interface EventHandlerContextValue {
  registerHandlers: (layerType: HandlerLayerName, handlers: LayerHandlers) => void;
  unregisterHandlers: (layerType: HandlerLayerName) => void;
  getHandlers: <T extends HandlerLayerName>(layerType: T) => HandlerTypeMap[T] | null;
  getAllHandlers: () => HandlersRegistry;
}

// ===========================================
// Context
// ===========================================

const EventHandlerContext = createContext<EventHandlerContextValue | null>(null);

/**
 * Hook for layers to register their event handlers
 * @returns Registration and access functions
 * @throws If used outside EventHandlerProvider
 */
function useEventHandlerRegistration(): EventHandlerContextValue {
  const context = useContext(EventHandlerContext);
  if (!context) {
    throw new Error('useEventHandlerRegistration must be used within EventHandlerProvider');
  }
  return context;
}

/**
 * Hook for EventCoordinationLayer to access all registered handlers
 * @returns Registration and access functions
 * @throws If used outside EventHandlerProvider
 */
function useRegisteredHandlers(): EventHandlerContextValue {
  const context = useContext(EventHandlerContext);
  if (!context) {
    throw new Error('useRegisteredHandlers must be used within EventHandlerProvider');
  }
  return context;
}

// ===========================================
// Provider
// ===========================================

interface EventHandlerProviderProps {
  children: ComponentChildren;
}

/**
 * Provider component that manages handler registration
 * Wraps the entire layer system to provide registration capabilities
 */
const EventHandlerProvider: FunctionComponent<EventHandlerProviderProps> = ({ children }) => {
  // Store handlers by layer type
  const handlersRef = useRef<HandlersRegistry>({});

  const registerHandlers = useCallback((layerType: HandlerLayerName, handlers: LayerHandlers): void => {
    handlersRef.current[layerType] = handlers;
  }, []);

  const unregisterHandlers = useCallback((layerType: HandlerLayerName): void => {
    delete handlersRef.current[layerType];
  }, []);

  const getHandlers = useCallback(<T extends HandlerLayerName>(layerType: T): HandlerTypeMap[T] | null => {
    return (handlersRef.current[layerType] ?? null) as HandlerTypeMap[T] | null;
  }, []);

  /**
   * Get all registered handlers
   */
  const getAllHandlers = useCallback((): HandlersRegistry => {
    return handlersRef.current;
  }, []);

  const contextValue = useMemo<EventHandlerContextValue>(() => ({
    registerHandlers,
    unregisterHandlers,
    getHandlers,
    getAllHandlers
  }), [registerHandlers, unregisterHandlers, getHandlers, getAllHandlers]);

  return (
    <EventHandlerContext.Provider value={contextValue}>
      {children}
    </EventHandlerContext.Provider>
  );
};

export { EventHandlerProvider, useEventHandlerRegistration, useRegisteredHandlers, EventHandlerContext };
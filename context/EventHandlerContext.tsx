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
export type HandlerLayerType =
  | 'object'
  | 'text'
  | 'drawing'
  | 'notePin'
  | 'panZoom'
  | 'fog'
  | 'areaSelect'
  | 'measure'
  | 'alignment'
  | 'imageAlignment';

/** Generic handler function type */
export type HandlerFunction = (...args: unknown[]) => unknown;

/** Handler set for a layer */
export interface LayerHandlers {
  handlePointerDown?: HandlerFunction;
  handlePointerMove?: HandlerFunction;
  handlePointerUp?: HandlerFunction;
  handleWheel?: HandlerFunction;
  handleClick?: HandlerFunction;
  handleDoubleClick?: HandlerFunction;
  handleKeyDown?: HandlerFunction;
  handleKeyUp?: HandlerFunction;
  [key: string]: HandlerFunction | undefined;
}

/** All registered handlers by layer type */
export type HandlersRegistry = Partial<Record<HandlerLayerType, LayerHandlers>>;

/** EventHandlerContext value shape */
export interface EventHandlerContextValue {
  registerHandlers: (layerType: HandlerLayerType, handlers: LayerHandlers) => void;
  unregisterHandlers: (layerType: HandlerLayerType) => void;
  getHandlers: (layerType: HandlerLayerType) => LayerHandlers | null;
  getAllHandlers: () => HandlersRegistry;
}

// ===========================================
// Context
// ===========================================

const EventHandlerContext = dc.createContext<EventHandlerContextValue | null>(null);

/**
 * Hook for layers to register their event handlers
 * @returns Registration and access functions
 * @throws If used outside EventHandlerProvider
 */
function useEventHandlerRegistration(): EventHandlerContextValue {
  const context = dc.useContext(EventHandlerContext);
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
  const context = dc.useContext(EventHandlerContext);
  if (!context) {
    throw new Error('useRegisteredHandlers must be used within EventHandlerProvider');
  }
  return context;
}

// ===========================================
// Provider
// ===========================================

interface EventHandlerProviderProps {
  children: React.ReactNode;
}

/**
 * Provider component that manages handler registration
 * Wraps the entire layer system to provide registration capabilities
 */
const EventHandlerProvider: React.FC<EventHandlerProviderProps> = ({ children }) => {
  // Store handlers by layer type
  const handlersRef = dc.useRef<HandlersRegistry>({});

  /**
   * Register handlers for a specific layer type
   */
  const registerHandlers = dc.useCallback((layerType: HandlerLayerType, handlers: LayerHandlers): void => {
    handlersRef.current[layerType] = handlers;
  }, []);

  /**
   * Unregister handlers for a specific layer type
   */
  const unregisterHandlers = dc.useCallback((layerType: HandlerLayerType): void => {
    delete handlersRef.current[layerType];
  }, []);

  /**
   * Get handlers for a specific layer type
   */
  const getHandlers = dc.useCallback((layerType: HandlerLayerType): LayerHandlers | null => {
    return handlersRef.current[layerType] || null;
  }, []);

  /**
   * Get all registered handlers
   */
  const getAllHandlers = dc.useCallback((): HandlersRegistry => {
    return handlersRef.current;
  }, []);

  const contextValue = dc.useMemo<EventHandlerContextValue>(() => ({
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

return {
  EventHandlerProvider,
  useEventHandlerRegistration,
  useRegisteredHandlers,
  EventHandlerContext
};

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

/**
 * EventHandlerContext.jsx
 * 
 * Provides a registration system for event handlers from different layers.
 * Layers register their handlers (object, text, drawing, notePin, panZoom)
 * and the EventCoordinationLayer uses these to route pointer events.
 * 
 * This enables clean separation: each layer owns its handlers,
 * EventCoordinationLayer owns the routing logic.
 */

const EventHandlerContext = dc.createContext(null);

/**
 * Hook for layers to register their event handlers
 * @returns {Function} registerHandlers - Function to register handlers for a layer type
 */
function useEventHandlerRegistration() {
  const context = dc.useContext(EventHandlerContext);
  if (!context) {
    throw new Error('useEventHandlerRegistration must be used within EventHandlerProvider');
  }
  return context;
}

/**
 * Hook for EventCoordinationLayer to access all registered handlers
 * @returns {Function} getHandlers - Function to get handlers for a layer type
 */
function useRegisteredHandlers() {
  const context = dc.useContext(EventHandlerContext);
  if (!context) {
    throw new Error('useRegisteredHandlers must be used within EventHandlerProvider');
  }
  return context;
}

/**
 * Provider component that manages handler registration
 * Wraps the entire layer system to provide registration capabilities
 */
const EventHandlerProvider = ({ children }) => {
  // Store handlers by layer type: { object: {...}, text: {...}, drawing: {...}, etc. }
  const handlersRef = dc.useRef({});
  
  /**
   * Register handlers for a specific layer type
   * @param {string} layerType - Type of layer ('object', 'text', 'drawing', 'notePin', 'panZoom')
   * @param {Object} handlers - Handler functions for this layer
   */
  const registerHandlers = dc.useCallback((layerType, handlers) => {
    handlersRef.current[layerType] = handlers;
  }, []);
  
  /**
   * Unregister handlers for a specific layer type
   * @param {string} layerType - Type of layer to unregister
   */
  const unregisterHandlers = dc.useCallback((layerType) => {
    delete handlersRef.current[layerType];
  }, []);
  
  /**
   * Get handlers for a specific layer type
   * @param {string} layerType - Type of layer
   * @returns {Object|null} Handler functions or null if not registered
   */
  const getHandlers = dc.useCallback((layerType) => {
    return handlersRef.current[layerType] || null;
  }, []);
  
  /**
   * Get all registered handlers
   * @returns {Object} All handlers by layer type
   */
  const getAllHandlers = dc.useCallback(() => {
    return handlersRef.current;
  }, []);
  
  const contextValue = dc.useMemo(() => ({
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
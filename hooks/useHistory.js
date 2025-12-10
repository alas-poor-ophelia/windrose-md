const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { DEFAULTS } = await requireModuleByName("dmtConstants.js");

function useHistory(initialState) {
  // Combine history and index into single state for better synchronization
  const [historyState, setHistoryState] = dc.useState({
    history: [initialState],
    currentIndex: 0
  });
  
  // Add a new state to history
  const addToHistory = dc.useCallback((newState) => {
    setHistoryState(prev => {
      // Remove any "future" states (redo states) when adding new state
      const newHistory = prev.history.slice(0, prev.currentIndex + 1);
      
      // Add new state
      newHistory.push(newState);
      
      // Limit history size
      let newIndex = newHistory.length - 1;
      if (newHistory.length > DEFAULTS.maxHistory) {
        newHistory.shift();
        newIndex = prev.currentIndex; // Index stays the same since we removed from beginning
      }
      
      return {
        history: newHistory,
        currentIndex: newIndex
      };
    });
  }, []);
  
  // Undo to previous state
  const undo = dc.useCallback(() => {
    let result = null;
    setHistoryState(prev => {
      if (prev.currentIndex > 0) {
        result = prev.history[prev.currentIndex - 1];
        return {
          ...prev,
          currentIndex: prev.currentIndex - 1
        };
      }
      return prev;
    });
    return result;
  }, []);
  
  // Redo to next state
  const redo = dc.useCallback(() => {
    let result = null;
    setHistoryState(prev => {
      if (prev.currentIndex < prev.history.length - 1) {
        result = prev.history[prev.currentIndex + 1];
        return {
          ...prev,
          currentIndex: prev.currentIndex + 1
        };
      }
      return prev;
    });
    return result;
  }, []);
  
  // Reset history (useful when loading new map)
  const resetHistory = dc.useCallback((newState) => {
    setHistoryState({
      history: [newState],
      currentIndex: 0
    });
  }, []);
  
  // Get full history state (for saving before layer switch)
  const getHistoryState = dc.useCallback(() => {
    return historyState;
  }, [historyState]);
  
  // Set full history state (for restoring after layer switch)
  const restoreHistoryState = dc.useCallback((savedState) => {
    if (savedState && savedState.history && typeof savedState.currentIndex === 'number') {
      setHistoryState(savedState);
    }
  }, []);
  
  // Check if undo/redo are available
  const canUndo = historyState.currentIndex > 0;
  const canRedo = historyState.currentIndex < historyState.history.length - 1;
  
  // Get current state
  const currentState = historyState.history[historyState.currentIndex];
  
  return {
    currentState,
    addToHistory,
    undo,
    redo,
    canUndo,
    canRedo,
    resetHistory,
    getHistoryState,
    restoreHistoryState
  };
}

return { useHistory };
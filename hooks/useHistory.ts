/**
 * useHistory.ts
 *
 * Generic undo/redo history management hook.
 * Maintains a stack of historical states with configurable max size.
 *
 * Features:
 * - Add states to history (clears redo stack)
 * - Undo/redo navigation
 * - History size limiting (from DEFAULTS.maxHistory)
 * - Full state save/restore for layer switching
 */

// Type-only imports
import type { HistoryState, UseHistoryResult } from '#types/hooks/history.types';

// Datacore imports
const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

const { DEFAULTS } = await requireModuleByName("dmtConstants.ts") as {
  DEFAULTS: { maxHistory: number }
};

/**
 * Hook for managing undo/redo history of any state type.
 *
 * @template T - The type of state being tracked
 * @param initialState - Initial state to start history with
 * @returns History management interface
 */
function useHistory<T>(initialState: T): UseHistoryResult<T> {
  // Combine history and index into single state for better synchronization
  const [historyState, setHistoryState] = dc.useState<HistoryState<T>>({
    history: [initialState],
    currentIndex: 0
  });

  // Add a new state to history
  const addToHistory = dc.useCallback((newState: T): void => {
    setHistoryState((prev: HistoryState<T>) => {
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
  const undo = dc.useCallback((): T | null => {
    let result: T | null = null;
    setHistoryState((prev: HistoryState<T>) => {
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
  const redo = dc.useCallback((): T | null => {
    let result: T | null = null;
    setHistoryState((prev: HistoryState<T>) => {
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
  const resetHistory = dc.useCallback((newState: T): void => {
    setHistoryState({
      history: [newState],
      currentIndex: 0
    });
  }, []);

  // Get full history state (for saving before layer switch)
  const getHistoryState = dc.useCallback((): HistoryState<T> => {
    return historyState;
  }, [historyState]);

  // Set full history state (for restoring after layer switch)
  const restoreHistoryState = dc.useCallback((savedState: HistoryState<T>): void => {
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

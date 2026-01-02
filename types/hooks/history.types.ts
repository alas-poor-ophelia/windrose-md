/**
 * History Hook Type Definitions
 * Path: types/hooks/history.types.ts
 *
 * Generic undo/redo history management types.
 */

// ===========================================
// Internal State
// ===========================================

/**
 * Internal history state structure.
 * Combines history stack with current index for atomic updates.
 */
export interface HistoryState<T> {
  /** Stack of historical states */
  history: T[];
  /** Index of current state in history array */
  currentIndex: number;
}

// ===========================================
// Hook Return Type
// ===========================================

/**
 * Return type for useHistory hook.
 * Generic over the state type T being tracked.
 */
export interface UseHistoryResult<T> {
  /** Current state from history */
  currentState: T;

  /** Add a new state to history (clears redo stack) */
  addToHistory: (newState: T) => void;

  /** Undo to previous state, returns the state or null if at beginning */
  undo: () => T | null;

  /** Redo to next state, returns the state or null if at end */
  redo: () => T | null;

  /** Whether undo is available */
  canUndo: boolean;

  /** Whether redo is available */
  canRedo: boolean;

  /** Reset history to a single state */
  resetHistory: (newState: T) => void;

  /** Get full history state (for saving) */
  getHistoryState: () => HistoryState<T>;

  /** Restore full history state (for loading) */
  restoreHistoryState: (savedState: HistoryState<T>) => void;
}

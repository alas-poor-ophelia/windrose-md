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

import { useCallback, useState } from 'preact/hooks';
import { DEFAULTS } from '../../core/dmtConstants';


/**
 * Two field values count as unchanged when they are the same reference, or
 * when both are arrays of equal length holding the same element references
 * (a no-op `filter`/`map` returns a fresh array of the same items).
 */
function isSameField(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}

/**
 * Reference-based change check for history snapshots (MEM-01).
 *
 * Snapshots share structure with map data, so a changed field always carries a
 * new reference. Comparing field references replaces the two full
 * JSON.stringify passes that used to run on every history push.
 */
export function isSameHistoryState<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return isSameField(a, b);
  }
  if (Array.isArray(a) || Array.isArray(b)) return isSameField(a, b);
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  for (const key of Object.keys(ra)) {
    if (!isSameField(ra[key], rb[key])) return false;
  }
  for (const key of Object.keys(rb)) {
    if (!(key in ra) && !isSameField(undefined, rb[key])) return false;
  }
  return true;
}

/**
 * Hook for managing undo/redo history of any state type.
 *
 * @template T - The type of state being tracked
 * @param initialState - Initial state to start history with
 * @returns History management interface
 */
function useHistory<T>(initialState: T): UseHistoryResult<T> {
  // Combine history and index into single state for better synchronization
  const [historyState, setHistoryState] = useState<HistoryState<T>>({
    history: [initialState],
    currentIndex: 0
  });

  // Add a new state to history
  const addToHistory = useCallback((newState: T): void => {
    setHistoryState((prev: HistoryState<T>) => {
      // Skip if identical to current state
      const currentState = prev.history[prev.currentIndex];
      if (isSameHistoryState(newState, currentState)) {
        return prev;
      }

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
  const undo = useCallback((): T | null => {
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
  const redo = useCallback((): T | null => {
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
  const resetHistory = useCallback((newState: T): void => {
    setHistoryState({
      history: [newState],
      currentIndex: 0
    });
  }, []);

  // Get full history state (for saving before layer switch)
  const getHistoryState = useCallback((): HistoryState<T> => {
    return historyState;
  }, [historyState]);

  // Set full history state (for restoring after layer switch)
  const restoreHistoryState = useCallback((savedState: HistoryState<T>): void => {
    if (savedState.history.length > 0 && typeof savedState.currentIndex === 'number') {
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

export { useHistory };
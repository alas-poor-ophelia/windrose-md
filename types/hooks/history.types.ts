/**
 * History Hook Type Definitions
 * Path: types/hooks/history.types.ts
 *
 * Generic undo/redo stack types. Entries are diffs (before/after values of
 * only the fields an edit touched), so undoing one entry never rewrites
 * fields that other edits own (DATA-06).
 */

// ===========================================
// Field diffs
// ===========================================

/**
 * The fields one edit changed: their values before and after the edit.
 * Both records hold exactly the same keys.
 */
export interface FieldDiff<T> {
  before: Partial<T>;
  after: Partial<T>;
}

// ===========================================
// Stack
// ===========================================

/**
 * An undo/redo stack of entries. `index` is the number of applied entries:
 * undo steps `entries[index - 1]` back, redo steps `entries[index]` forward.
 * Treated as immutable; every operation returns a new stack.
 */
export interface HistoryStack<E> {
  entries: E[];
  index: number;
}

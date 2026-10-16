/**
 * useHistory.ts
 *
 * Generic, pure undo/redo building blocks (no Preact state):
 * - reference-based field comparison (MEM-01: no JSON.stringify snapshots)
 * - field diffs: before/after values of only the fields an edit changed
 * - an immutable entry stack with a size cap (DEFAULTS.maxHistory)
 *
 * useLayerHistory composes these into per-layer diff history (DATA-06).
 */

// Type-only imports
import type { FieldDiff, HistoryStack } from '#types/hooks/history.types';

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

/** Absent, null and empty-array field values all mean "nothing here". */
function isEmptyValue(v: unknown): boolean {
  return v == null || (Array.isArray(v) && v.length === 0);
}

/**
 * Field equality for diffing: reference/shallow-array equality, plus
 * absent ≈ null ≈ [] (snapshot builders default missing arrays to `[]`).
 */
export function isSameHistoryValue(a: unknown, b: unknown): boolean {
  return isSameField(a, b) || (isEmptyValue(a) && isEmptyValue(b));
}

/**
 * Diff `next` against `base` over `keys`. Returns null when nothing changed.
 *
 * With `skipUndefined`, a key whose `next` value is undefined counts as "not
 * provided" and is skipped (partial snapshots from callers that only know a
 * subset of the fields).
 */
export function diffHistoryFields<T extends object>(
  keys: readonly (keyof T)[],
  base: Partial<T>,
  next: Partial<T>,
  skipUndefined: boolean
): FieldDiff<T> | null {
  const before: Partial<T> = {};
  const after: Partial<T> = {};
  let changed = false;
  for (const key of keys) {
    const nextValue = next[key];
    if (skipUndefined && nextValue === undefined) continue;
    if (isSameHistoryValue(base[key], nextValue)) continue;
    before[key] = base[key];
    after[key] = nextValue;
    changed = true;
  }
  return changed ? { before, after } : null;
}

/**
 * Pick the fields of `target` that may be written over `current`: only those
 * whose live value still equals `expected` (the value the entry left behind).
 * A field another edit has changed since is left alone, so undo/redo never
 * clobbers work it does not own. Returns null when no field qualifies.
 */
export function guardedPatch<T extends object>(
  current: Partial<T>,
  expected: Partial<T>,
  target: Partial<T>
): Partial<T> | null {
  const patch: Partial<T> = {};
  let any = false;
  for (const key of Object.keys(target) as (keyof T)[]) {
    if (!isSameHistoryValue(current[key], expected[key])) continue;
    patch[key] = target[key];
    any = true;
  }
  return any ? patch : null;
}

/** An empty stack. */
export function createHistoryStack<E>(): HistoryStack<E> {
  return { entries: [], index: 0 };
}

/**
 * Push an entry: drops the redo tail, appends, and caps the stack at
 * `maxSize` entries (oldest dropped first).
 */
export function pushHistoryEntry<E>(
  stack: HistoryStack<E>,
  entry: E,
  maxSize: number = DEFAULTS.maxHistory
): HistoryStack<E> {
  const entries = stack.entries.slice(0, stack.index);
  entries.push(entry);
  while (entries.length > maxSize) entries.shift();
  return { entries, index: entries.length };
}

/** Replace the most recent applied entry (for coalescing). No-op when empty. */
export function replaceTopHistoryEntry<E>(stack: HistoryStack<E>, entry: E): HistoryStack<E> {
  if (stack.index === 0) return stack;
  const entries = stack.entries.slice(0, stack.index);
  entries[entries.length - 1] = entry;
  return { entries, index: entries.length };
}

/** The most recent applied entry, if it is also the stack top (no redo tail). */
export function peekTopHistoryEntry<E>(stack: HistoryStack<E>): E | null {
  if (stack.index === 0 || stack.index !== stack.entries.length) return null;
  return stack.entries[stack.index - 1];
}

/** Step back one entry. Returns the entry to revert, or null at the bottom. */
export function stepHistoryUndo<E>(stack: HistoryStack<E>): { stack: HistoryStack<E>; entry: E } | null {
  if (stack.index === 0) return null;
  return { stack: { entries: stack.entries, index: stack.index - 1 }, entry: stack.entries[stack.index - 1] };
}

/** Step forward one entry. Returns the entry to re-apply, or null at the top. */
export function stepHistoryRedo<E>(stack: HistoryStack<E>): { stack: HistoryStack<E>; entry: E } | null {
  if (stack.index >= stack.entries.length) return null;
  return { stack: { entries: stack.entries, index: stack.index + 1 }, entry: stack.entries[stack.index] };
}

/**
 * Remove the entry the next step in `direction` would apply, without moving
 * past it: undo drops the entry below the cursor, redo the one above it. Used
 * when an entry can no longer apply to the live map (every field changed
 * since), so it is not spent as a silent no-op step. No-op at the end.
 */
export function dropHistoryStep<E>(stack: HistoryStack<E>, direction: 'undo' | 'redo'): HistoryStack<E> {
  if (direction === 'undo') {
    if (stack.index === 0) return stack;
    const entries = stack.entries.slice();
    entries.splice(stack.index - 1, 1);
    return { entries, index: stack.index - 1 };
  }
  if (stack.index >= stack.entries.length) return stack;
  const entries = stack.entries.slice();
  entries.splice(stack.index, 1);
  return { entries, index: stack.index };
}

/**
 * Merge two consecutive diffs into one: the older diff's `before` values win
 * (they predate both edits), the newer diff's `after` values win.
 */
export function mergeFieldDiffs<T>(older: FieldDiff<T>, newer: FieldDiff<T>): FieldDiff<T> {
  return {
    before: { ...newer.before, ...older.before },
    after: { ...older.after, ...newer.after }
  };
}

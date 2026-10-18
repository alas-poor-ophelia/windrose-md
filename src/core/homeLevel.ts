/**
 * The ladder rung an element (object, text label, tile) is homed on.
 *
 * Load-time sanitising (schemaMigration.sanitizeLayer) drops a `homeLevel` that
 * is not a positive safe integer, but values written after load (MCP, a
 * hand-edited store read by another pane) can still be 1.5, "2", -1 or NaN.
 * Every predicate that turns it into a rung (the deepest-rung scan, export
 * bounds, the resize orphan filter) reads it through this one rule: a positive
 * safe integer is a rung, anything else is root (0).
 * Treating a bad value as root keeps it away from `geometryForLevel`, which
 * throws on a non-integer level.
 */
function homeLevelOf(element: unknown): number {
  if (element === null || typeof element !== 'object') return 0;
  const home: unknown = (element as { homeLevel?: unknown }).homeLevel;
  return typeof home === 'number' && Number.isSafeInteger(home) && home > 0 ? home : 0;
}

export { homeLevelOf };

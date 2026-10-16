/**
 * assertNever.ts
 *
 * Exhaustiveness guard for switches over union types. Put it in the
 * `default` branch: when every member is handled the argument narrows to
 * `never`; adding a member without a case becomes a compile error, and an
 * impossible runtime value (bad persisted data) throws instead of silently
 * falling through.
 */

function assertNever(value: never, context?: string): never {
  throw new Error(`Unhandled ${context ?? 'union member'}: ${String(value)}`);
}

export { assertNever };

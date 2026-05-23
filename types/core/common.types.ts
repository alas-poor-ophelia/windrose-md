/**
 * Common Type Definitions
 * Path: types/core/common.types.ts
 * 
 * Shared primitives and utility types used across modules.
 */

// ===========================================
// Color Types
// ===========================================

/** Hex color string (e.g., "#ff0000" or "#f00") */
export type HexColor = string;

/** RGBA color object */
export interface RGBAColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

// ===========================================
// Numeric Ranges
// ===========================================

/** Opacity value (0-1) */
export type Opacity = number;

/** Percentage value (0-100) */
export type Percentage = number;

/** Degrees (0-360) */
export type Degrees = number;

// ===========================================
// Utility Types
// ===========================================

/** Make all properties in T optional recursively */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/** Extract keys of T where value extends U */
export type KeysOfType<T, U> = {
  [K in keyof T]: T[K] extends U ? K : never;
}[keyof T];

/** Require at least one of the specified keys */
export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> =
  Pick<T, Exclude<keyof T, Keys>> &
  { [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>> }[Keys];

// ===========================================
// Custom Color (runtime resolved, with opacity)
// ===========================================

export interface CustomColor {
  id: string;
  color: HexColor;
  label?: string;
  opacity?: number;
}

// ===========================================
// Event Types
// ===========================================

/** Generic event handler */
export type EventHandler<T = void> = (event: T) => void;

/** Mouse event with coordinates */
export interface MouseEventWithCoords {
  clientX: number;
  clientY: number;
  button: number;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}
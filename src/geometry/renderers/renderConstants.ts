/**
 * renderConstants.ts
 *
 * Tuning constants shared by more than one renderer (or by a renderer and
 * its canvas-hook callers). Renderer-private constants live at the top of
 * their own file. Names describe meaning, not value.
 */

/** Opacity of the adjacent board/layer drawn faintly beneath the active one. */
const GHOST_BOARD_OPACITY = 0.25;

/** Fraction of the border line width used for interior (between-cell) grid lines. */
const INTERIOR_RATIO = 0.5;

/** First fog feather pass opacity; later passes ramp up by FOG_PASS_OPACITY_RAMP. */
const FOG_PASS_OPACITY_BASE = 0.5;
const FOG_PASS_OPACITY_RAMP = 0.3;

/** Filter-blur fallback: blur multiplier at t=0 (falls off linearly with t). */
const FOG_FILTER_BLUR_START = 1.5;

/** Below this blur (px) the canvas filter is skipped entirely. */
const FOG_FILTER_MIN_BLUR_PX = 0.5;

export {
  GHOST_BOARD_OPACITY,
  INTERIOR_RATIO,
  FOG_PASS_OPACITY_BASE,
  FOG_PASS_OPACITY_RAMP,
  FOG_FILTER_BLUR_START,
  FOG_FILTER_MIN_BLUR_PX
};

// useMapChromeState.ts - Small pieces of root-component chrome state:
// first-run onboarding state (follows settings changes), the delayed sub-hex
// breadcrumb row reveal, and canvas/frame sizing for block mode.

import { useEffect, useMemo, useState } from 'preact/hooks';
import type { OnboardingState } from '#types/settings/settings.types';
import type { getEffectiveSettings } from '../../core/settingsAccessor';
import { getSettings } from '../../core/settingsAccessor';

/**
 * Delay before the sub-hex breadcrumb row tweens open after a dive: the
 * seamless zoom should settle before the layout moves. The row expanding
 * synchronously with the map swap reflowed the canvas mid-transition — the
 * most visible part of the dive "blink" (windrose-1mc).
 */
const SUBHEX_ROW_REVEAL_DELAY_MS = 450;

/**
 * First-run onboarding: 'pending' shows the survey overlay, 'whatsnew' the
 * upgrader notice. Completion saves settings → the settings-changed event
 * re-reads state here and dismisses every mounted instance.
 */
function useOnboardingState(): OnboardingState {
  const [onboarding, setOnboarding] = useState<OnboardingState>(
    () => getSettings().onboardingState ?? 'done'
  );
  useEffect(() => {
    const handler = (): void => { setOnboarding(getSettings().onboardingState ?? 'done'); };
    window.addEventListener('windrose-settings-changed', handler);
    return () => window.removeEventListener('windrose-settings-changed', handler);
  }, []);
  return onboarding;
}

/**
 * Sub-hex breadcrumb row reveal: opens on a delay after the dive settles
 * (height tween + content fade in CSS, .windrose-subhex-row), closes
 * immediately on exit so the collapse tween plays while the map swaps.
 */
function useSubHexRowReveal(isInSubHex: boolean, subHexPath: string | null | undefined): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!isInSubHex) {
      setOpen(false);
      return undefined;
    }
    const t = window.setTimeout(() => setOpen(true), SUBHEX_ROW_REVEAL_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [isInSubHex, subHexPath]);
  return open;
}

type EffectiveSettings = ReturnType<typeof getEffectiveSettings> | null;

interface CanvasFrameSize {
  /** Canvas wrapper height in px; null in full-pane (fills the view). */
  canvasHeight: number | null;
  /** Picture-frame container width in px; null = spans the note column. */
  frameWidth: number | null;
}

/** Canvas height (device type + settings) and picture-frame width. */
function useCanvasFrameSize(fullPane: boolean, pictureFrameActive: boolean, effectiveSettings: EffectiveSettings): CanvasFrameSize {
  // Detect touch devices using media query match
  const isTouchDevice = useMemo(() => {
    return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  }, []);

  const canvasHeight = fullPane ? null : (pictureFrameActive
    ? (isTouchDevice
        ? (effectiveSettings?.pictureFrameHeightMobile ?? 300)
        : (effectiveSettings?.pictureFrameHeight ?? 400))
    : (effectiveSettings
        ? (isTouchDevice
            ? (effectiveSettings.canvasHeightMobile ?? 400)
            : (effectiveSettings.canvasHeight ?? 600))
        : (isTouchDevice ? 400 : 600)));

  // Width only applies in picture frame mode; unset means the frame spans
  // the note's content column (the default embed behavior). This sizes the
  // CONTAINER, not the canvas wrapper — the visible frame (border, inset ring,
  // corner brackets) lives on .windrose-container, which _layout.scss pins to
  // width:100%. Sizing the inner wrapper instead only shrinks the canvas and
  // leaves the frame spanning the full note column.
  const frameWidth = !fullPane && pictureFrameActive
    ? (isTouchDevice
        ? (effectiveSettings?.pictureFrameWidthMobile ?? null)
        : (effectiveSettings?.pictureFrameWidth ?? null))
    : null;

  return { canvasHeight, frameWidth };
}

export { useOnboardingState, useSubHexRowReveal, useCanvasFrameSize, SUBHEX_ROW_REVEAL_DELAY_MS };
export type { CanvasFrameSize };

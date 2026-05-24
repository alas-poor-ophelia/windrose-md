/**
 * HexGridTab.tsx
 *
 * Hex Grid settings tab for MapSettingsModal.
 * Composes BackgroundImageSection, SizingModeSection, BoundsSection,
 * and CoordinateDisplaySection into a unified tab.
 */

import type { VNode } from 'preact';

import { useModalShell } from '../../../context/MapSettingsContext';
import { BackgroundImageSection } from './BackgroundImageSection';
import { SizingModeSection } from './SizingModeSection';
import { BoundsSection } from './BoundsSection';
import { CoordinateDisplaySection } from './CoordinateDisplaySection';










/**
 * Hex Grid tab content - composes all hex-specific settings sections
 */
function HexGridTab(): VNode | null {
  const { mapType } = useModalShell();

  // Guard: only render for hex maps
  if (mapType !== 'hex') {
    return null;
  }

  return (
    <div class="windrose-settings-tab-content">
      {/* Background Image Section - image picker and dimensions */}
      <BackgroundImageSection />

      {/* Sizing Mode Section - Quick Setup / Advanced tabs, lock, opacity, offset */}
      <SizingModeSection />

      {/* Map Bounds Section - columns × rows */}
      <BoundsSection />

      {/* Coordinate Display Section - mode selector and text colors */}
      <CoordinateDisplaySection />
    </div>
  );
}

export { HexGridTab };
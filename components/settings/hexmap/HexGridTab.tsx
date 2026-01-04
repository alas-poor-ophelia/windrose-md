/**
 * HexGridTab.tsx
 *
 * Hex Grid settings tab for MapSettingsModal.
 * Composes BackgroundImageSection, SizingModeSection, BoundsSection,
 * and CoordinateDisplaySection into a unified tab.
 */

import type { MapType } from '#types/core/map.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useMapSettings } = await requireModuleByName("MapSettingsContext.tsx");
const { BackgroundImageSection } = await requireModuleByName("BackgroundImageSection.tsx");
const { SizingModeSection } = await requireModuleByName("SizingModeSection.tsx");
const { BoundsSection } = await requireModuleByName("BoundsSection.tsx");
const { CoordinateDisplaySection } = await requireModuleByName("CoordinateDisplaySection.tsx");

/**
 * Hex Grid tab content - composes all hex-specific settings sections
 */
function HexGridTab(): React.ReactElement | null {
  const { mapType } = useMapSettings() as { mapType: MapType };

  // Guard: only render for hex maps
  if (mapType !== 'hex') {
    return null;
  }

  return (
    <div class="dmt-settings-tab-content">
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

return { HexGridTab };

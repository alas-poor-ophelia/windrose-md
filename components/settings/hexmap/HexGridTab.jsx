/**
 * HexGridTab.jsx
 * 
 * Hex Grid settings tab for MapSettingsModal.
 * Composes BackgroundImageSection, SizingModeSection, BoundsSection, 
 * and CoordinateDisplaySection into a unified tab.
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useMapSettings } = await requireModuleByName("MapSettingsContext.jsx");
const { BackgroundImageSection } = await requireModuleByName("BackgroundImageSection.jsx");
const { SizingModeSection } = await requireModuleByName("SizingModeSection.jsx");
const { BoundsSection } = await requireModuleByName("BoundsSection.jsx");
const { CoordinateDisplaySection } = await requireModuleByName("CoordinateDisplaySection.jsx");

/**
 * Hex Grid tab content - composes all hex-specific settings sections
 */
function HexGridTab() {
  const { mapType } = useMapSettings();
  
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
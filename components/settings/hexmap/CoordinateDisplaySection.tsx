/**
 * CoordinateDisplaySection.tsx
 *
 * Coordinate display configuration for hex maps.
 * Handles display mode (rectangular vs radial) and text colors.
 */

import type { HexColor } from '#types/core/common.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useHexGrid, useAppearance } = await requireModuleByName("MapSettingsContext.tsx");
const { CollapsibleSection } = await requireModuleByName("CollapsibleSection.tsx");
const { ColorPickerItem } = await requireModuleByName("AppearanceTab.tsx");
const { SettingItem } = await requireModuleByName("SettingItem.tsx");

/** Coordinate display mode type */
type CoordinateDisplayMode = 'rectangular' | 'radial';

/** Theme constants for coordinates */
interface CoordinateTheme {
  color: HexColor;
  shadow: HexColor;
}

/** Map settings context for coordinate mode */
interface CoordinateModeContext {
  coordinateDisplayMode: CoordinateDisplayMode;
  setCoordinateDisplayMode: (mode: CoordinateDisplayMode) => void;
}

/** Map settings context for coordinate colors */
interface CoordinateColorsContext {
  useGlobalSettings: boolean;
  THEME: {
    coordinateText: CoordinateTheme;
  };
}

/**
 * Coordinate display mode selector
 */
function CoordinateModeContent(): React.ReactElement {
  const {
    coordinateDisplayMode,
    setCoordinateDisplayMode
  } = useHexGrid();

  return (
    <SettingItem name="Display Mode" description="How coordinates appear when pressing C" vertical>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
          <input
            type="radio"
            name="coordMode"
            value="rectangular"
            checked={coordinateDisplayMode === 'rectangular'}
            onChange={() => setCoordinateDisplayMode('rectangular')}
            style={{ marginTop: '2px' }}
          />
          <div>
            <span style={{ fontWeight: 500 }}>Rectangular (A1, B2, ...)</span>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Column-row labels for standard grid layouts
            </p>
          </div>
        </label>

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
          <input
            type="radio"
            name="coordMode"
            value="radial"
            checked={coordinateDisplayMode === 'radial'}
            onChange={() => setCoordinateDisplayMode('radial')}
            style={{ marginTop: '2px' }}
          />
          <div>
            <span style={{ fontWeight: 500 }}>Radial (⬡, 1-1, 2-5, ...)</span>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Ring-position labels centered in grid
            </p>
          </div>
        </label>
      </div>
    </SettingItem>
  );
}

/**
 * Coordinate text color pickers
 */
function CoordinateColorsContent(): React.ReactElement {
  const {
    useGlobalSettings,
    THEME
  } = useAppearance();

  return (
    <SettingItem
      name="Text Colors"
      description={useGlobalSettings
        ? 'Using global settings (enable custom colors in Appearance tab to override)'
        : 'Custom colors for coordinate overlay text'}
      vertical
    >
      <div
        style={{
          opacity: useGlobalSettings ? 0.5 : 1,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '16px'
        }}
      >
        <ColorPickerItem
          colorKey="coordinateTextColor"
          label="Text Color"
          defaultColor={THEME.coordinateText.color}
        />
        <ColorPickerItem
          colorKey="coordinateTextShadow"
          label="Text Shadow"
          defaultColor={THEME.coordinateText.shadow}
          align="right"
        />
      </div>
    </SettingItem>
  );
}

/**
 * Combined coordinate display section - collapsible, starts collapsed
 */
function CoordinateDisplaySection(): React.ReactElement {
  const { coordinateDisplayMode } = useHexGrid();

  const subtitle = coordinateDisplayMode === 'rectangular' ? 'A1, B2, ...' : 'Ring-Position';

  return (
    <CollapsibleSection
      title="Coordinate Display"
      defaultOpen={false}
      subtitle={subtitle}
    >
      <CoordinateModeContent />
      <CoordinateColorsContent />
    </CollapsibleSection>
  );
}

return { CoordinateDisplaySection, CoordinateModeContent, CoordinateColorsContent };

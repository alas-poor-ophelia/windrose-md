/**
 * CoordinateDisplaySection.jsx
 * 
 * Coordinate display configuration for hex maps.
 * Handles display mode (rectangular vs radial) and text colors.
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useMapSettings } = await requireModuleByName("MapSettingsContext.jsx");
const { ColorPickerItem } = await requireModuleByName("AppearanceTab.jsx");

/**
 * Coordinate display mode selector
 */
function CoordinateModeSection() {
  const {
    coordinateDisplayMode,
    setCoordinateDisplayMode
  } = useMapSettings();
  
  return (
    <div class="dmt-form-group" style={{ marginTop: '20px' }}>
      <label class="dmt-form-label">Coordinate Display Mode</label>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
        How coordinates appear when pressing C
      </p>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label class="dmt-radio-label" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
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
        
        <label class="dmt-radio-label" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
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
    </div>
  );
}

/**
 * Coordinate text color pickers
 */
function CoordinateColorsSection() {
  const {
    useGlobalSettings,
    THEME
  } = useMapSettings();
  
  return (
    <div class="dmt-form-group" style={{ marginTop: '20px' }}>
      <label class="dmt-form-label">Coordinate Text Colors</label>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
        {useGlobalSettings 
          ? 'Using global settings (enable custom colors in Appearance tab to override)' 
          : 'Custom colors for coordinate overlay text'}
      </p>
      
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
        />
      </div>
    </div>
  );
}

/**
 * Combined coordinate display section
 */
function CoordinateDisplaySection() {
  return (
    <>
      <CoordinateModeSection />
      <CoordinateColorsSection />
    </>
  );
}

return { CoordinateDisplaySection, CoordinateModeSection, CoordinateColorsSection };
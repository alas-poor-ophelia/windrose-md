/**
 * AppearanceTab.jsx
 * 
 * Appearance settings tab for MapSettingsModal.
 * Handles color customization and grid line width.
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { ColorPicker } = await requireModuleByName("ColorPicker.jsx");
const { useMapSettings } = await requireModuleByName("MapSettingsContext.jsx");

/**
 * Individual color picker item for the 2x2 grid
 */
function ColorPickerItem({ colorKey, label, defaultColor, align = 'left' }) {
  const {
    useGlobalSettings,
    overrides,
    activeColorPicker,
    setActiveColorPicker,
    pendingCustomColorRef,
    handleColorChange,
    globalSettings
  } = useMapSettings();
  
  return (
    <div class="dmt-color-grid-item">
      <label class="dmt-form-label" style={{ marginBottom: '4px', fontSize: '12px' }}>{label}</label>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', position: 'relative' }}>
        <button
          class="dmt-color-button"
          disabled={useGlobalSettings}
          onClick={() => !useGlobalSettings && setActiveColorPicker(colorKey)}
          style={{ 
            backgroundColor: overrides[colorKey],
            cursor: useGlobalSettings ? 'not-allowed' : 'pointer',
            minWidth: '80px'
          }}
        >
          <span class="dmt-color-button-label">{overrides[colorKey]}</span>
        </button>
        
        <button
          class="dmt-color-reset-btn"
          disabled={useGlobalSettings}
          onClick={() => !useGlobalSettings && handleColorChange(colorKey, defaultColor)}
          title="Reset to default"
          style={{ cursor: useGlobalSettings ? 'not-allowed' : 'pointer' }}
        >
          <dc.Icon icon="lucide-rotate-ccw" />
        </button>
        
        <ColorPicker
          isOpen={activeColorPicker === colorKey && !useGlobalSettings}
          selectedColor={overrides[colorKey]}
          onColorSelect={(color) => handleColorChange(colorKey, color)}
          onClose={() => setActiveColorPicker(null)}
          onReset={() => handleColorChange(colorKey, globalSettings[colorKey])}
          customColors={[]}
          pendingCustomColorRef={pendingCustomColorRef}
          title={label}
          position="below"
          align={align}
        />
      </div>
    </div>
  );
}

/**
 * Appearance tab content
 */
function AppearanceTab() {
  const {
    mapType,
    useGlobalSettings,
    overrides,
    handleToggleUseGlobal,
    handleLineWidthChange,
    THEME
  } = useMapSettings();
  
  return (
    <div class="dmt-settings-tab-content">
      <div class="dmt-form-group" style={{ marginBottom: '16px' }}>
        <label class="dmt-checkbox-label">
          <input
            type="checkbox"
            checked={!useGlobalSettings}
            onChange={handleToggleUseGlobal}
            class="dmt-checkbox"
          />
          <span>Use custom colors for this map</span>
        </label>
      </div>
      
      {/* 2x2 Color picker grid */}
      <div 
        class="dmt-color-grid" 
        style={{ 
          opacity: useGlobalSettings ? 0.5 : 1,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '16px'
        }}
      >
        <ColorPickerItem
          colorKey="gridLineColor"
          label="Grid Lines"
          defaultColor={THEME.grid.lines}
        />
        <ColorPickerItem
          colorKey="backgroundColor"
          label="Background"
          defaultColor={THEME.grid.background}
          align="right"
        />
        <ColorPickerItem
          colorKey="borderColor"
          label="Cell Border"
          defaultColor={THEME.cells.border}
        />
        <ColorPickerItem
          colorKey="coordinateKeyColor"
          label="Coord Key"
          defaultColor={THEME.coordinateKey.color}
          align="right"
        />
      </div>
      
      {/* Grid Line Width slider (grid maps only) */}
      {mapType === 'grid' && (
        <div 
          class="dmt-form-group" 
          style={{ 
            marginTop: '20px',
            opacity: useGlobalSettings ? 0.5 : 1
          }}
        >
          <label class="dmt-form-label" style={{ marginBottom: '8px' }}>
            Grid Line Width: {overrides.gridLineWidth ?? 1}px
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <input
              type="range"
              min="1"
              max="5"
              value={overrides.gridLineWidth ?? 1}
              onInput={(e) => handleLineWidthChange(e.target.value)}
              disabled={useGlobalSettings}
              style={{
                flex: 1,
                cursor: useGlobalSettings ? 'not-allowed' : 'pointer'
              }}
            />
            <button
              class="dmt-color-reset-btn"
              disabled={useGlobalSettings}
              onClick={() => !useGlobalSettings && handleLineWidthChange(1)}
              title="Reset to default (1px)"
              style={{ cursor: useGlobalSettings ? 'not-allowed' : 'pointer' }}
            >
              <dc.Icon icon="lucide-rotate-ccw" />
            </button>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
            Thickness of the grid lines (1-5 pixels)
          </p>
        </div>
      )}
    </div>
  );
}

return { AppearanceTab, ColorPickerItem };
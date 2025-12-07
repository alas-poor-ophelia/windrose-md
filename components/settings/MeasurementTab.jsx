/**
 * MeasurementTab.jsx
 * 
 * Distance measurement settings tab for MapSettingsModal.
 * Handles distance per cell, units, diagonal rules, and display format.
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useMapSettings } = await requireModuleByName("MapSettingsContext.jsx");

/**
 * Measurement tab content
 */
function MeasurementTab() {
  const {
    isHexMap,
    distanceSettings,
    setDistanceSettings
  } = useMapSettings();
  
  const handleToggleUseGlobal = () => {
    setDistanceSettings(prev => ({
      ...prev,
      useGlobalDistance: !prev.useGlobalDistance
    }));
  };
  
  const handleDistancePerCellChange = (e) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && val > 0) {
      setDistanceSettings(prev => ({ ...prev, distancePerCell: val }));
    }
  };
  
  const handleUnitChange = (e) => {
    setDistanceSettings(prev => ({ ...prev, distanceUnit: e.target.value }));
  };
  
  const handleDiagonalRuleChange = (e) => {
    setDistanceSettings(prev => ({ ...prev, gridDiagonalRule: e.target.value }));
  };
  
  const handleDisplayFormatChange = (e) => {
    setDistanceSettings(prev => ({ ...prev, displayFormat: e.target.value }));
  };
  
  return (
    <div class="dmt-settings-tab-content">
      <div class="dmt-form-group" style={{ marginBottom: '16px' }}>
        <label class="dmt-checkbox-label">
          <input
            type="checkbox"
            checked={!distanceSettings.useGlobalDistance}
            onChange={handleToggleUseGlobal}
            class="dmt-checkbox"
          />
          <span>Use custom measurement settings for this map</span>
        </label>
      </div>
      
      <div style={{ opacity: distanceSettings.useGlobalDistance ? 0.5 : 1 }}>
        {/* Distance per Cell */}
        <div class="dmt-form-group">
          <label class="dmt-form-label">Distance per {isHexMap ? 'Hex' : 'Cell'}</label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={distanceSettings.distancePerCell}
              disabled={distanceSettings.useGlobalDistance}
              onChange={handleDistancePerCellChange}
              class="dmt-form-input"
              style={{ width: '80px' }}
            />
            <select
              value={distanceSettings.distanceUnit}
              disabled={distanceSettings.useGlobalDistance}
              onChange={handleUnitChange}
              class="dmt-form-select"
              style={{ width: '120px' }}
            >
              <option value="ft">feet</option>
              <option value="m">meters</option>
              <option value="mi">miles</option>
              <option value="km">kilometers</option>
              <option value="yd">yards</option>
            </select>
          </div>
        </div>
        
        {/* Diagonal Movement (grid maps only) */}
        {!isHexMap && (
          <div class="dmt-form-group">
            <label class="dmt-form-label">Diagonal Movement</label>
            <select
              value={distanceSettings.gridDiagonalRule}
              disabled={distanceSettings.useGlobalDistance}
              onChange={handleDiagonalRuleChange}
              class="dmt-form-select"
            >
              <option value="alternating">Alternating (5-10-5-10, D&D 5e)</option>
              <option value="equal">Equal (Chebyshev, all moves = 1)</option>
              <option value="euclidean">True Distance (Euclidean)</option>
            </select>
          </div>
        )}
        
        {/* Display Format */}
        <div class="dmt-form-group">
          <label class="dmt-form-label">Display Format</label>
          <select
            value={distanceSettings.displayFormat}
            disabled={distanceSettings.useGlobalDistance}
            onChange={handleDisplayFormatChange}
            class="dmt-form-select"
          >
            <option value="both">Cells and Units (e.g., "3 cells (15 ft)")</option>
            <option value="cells">Cells Only (e.g., "3 cells")</option>
            <option value="units">Units Only (e.g., "15 ft")</option>
          </select>
        </div>
      </div>
    </div>
  );
}

return { MeasurementTab };
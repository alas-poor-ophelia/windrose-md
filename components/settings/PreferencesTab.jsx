/**
 * PreferencesTab.jsx
 * 
 * Preferences settings tab for MapSettingsModal.
 * Handles state persistence options, canvas height configuration, and map export.
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useMapSettings } = await requireModuleByName("MapSettingsContext.jsx");
const { saveMapImageToVault } = await requireModuleByName("exportOperations.js");

/**
 * Preferences tab content
 */
function PreferencesTab() {
  const {
    preferences,
    useGlobalSettings,
    overrides,
    globalSettings,
    handlePreferenceToggle,
    mapData,
    geometry
  } = useMapSettings();
  
  // Export state
  const [isExporting, setIsExporting] = dc.useState(false);
  const [exportError, setExportError] = dc.useState(null);
  const [exportSuccess, setExportSuccess] = dc.useState(null);
  
  // Local handler for canvas height changes (updates overrides state)
  const { handleColorChange } = useMapSettings(); // Reuse the overrides setter pattern
  
  const handleCanvasHeightChange = (field, value) => {
    handleColorChange(field, value === '' ? undefined : parseInt(value, 10));
  };
  
  // Handle export button click
  const handleExportImage = async () => {
    if (!mapData || !geometry) {
      setExportError('Map data not available');
      return;
    }
    
    setIsExporting(true);
    setExportError(null);
    setExportSuccess(null);
    
    try {
      const result = await saveMapImageToVault(mapData, geometry);
      
      if (result.success) {
        setExportSuccess(`Map saved to: ${result.path}`);
        // Clear success message after 5 seconds
        setTimeout(() => setExportSuccess(null), 5000);
      } else {
        setExportError(result.error || 'Export failed. Please try again.');
      }
    } catch (error) {
      console.error('[PreferencesTab] Export error:', error);
      setExportError(error.message || 'Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };
  
  return (
    <div class="dmt-settings-tab-content">
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
        Control what state is remembered for this map
      </p>
      
      {/* Remember Pan/Zoom */}
      <div class="dmt-form-group">
        <label class="dmt-checkbox-label">
          <input
            type="checkbox"
            checked={preferences.rememberPanZoom}
            onChange={() => handlePreferenceToggle('rememberPanZoom')}
            class="dmt-checkbox"
          />
          <span>Remember pan and zoom position</span>
        </label>
      </div>
      
      {/* Remember Sidebar State */}
      <div class="dmt-form-group">
        <label class="dmt-checkbox-label">
          <input
            type="checkbox"
            checked={preferences.rememberSidebarState}
            onChange={() => handlePreferenceToggle('rememberSidebarState')}
            class="dmt-checkbox"
          />
          <span>Remember sidebar collapsed state</span>
        </label>
      </div>
      
      {/* Remember Expanded State */}
      <div class="dmt-form-group">
        <label class="dmt-checkbox-label">
          <input
            type="checkbox"
            checked={preferences.rememberExpandedState}
            onChange={() => handlePreferenceToggle('rememberExpandedState')}
            class="dmt-checkbox"
          />
          <span>Remember expanded state</span>
        </label>
      </div>
      
      {/* Canvas Height Settings */}
      <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--background-modifier-border)' }}>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Canvas height settings (leave blank to use global defaults)
        </p>
        
        <div style={{ display: 'flex', gap: '12px', padding: '0 2px' }}>
          {/* Desktop Height */}
          <div class="dmt-form-group" style={{ flex: 1, marginBottom: 0 }}>
            <label class="dmt-form-label">Desktop (pixels)</label>
            <input
              type="number"
              class="dmt-modal-input"
              placeholder={String(globalSettings.canvasHeight ?? 600)}
              value={useGlobalSettings ? '' : (overrides.canvasHeight ?? '')}
              onChange={(e) => handleCanvasHeightChange('canvasHeight', e.target.value)}
              disabled={useGlobalSettings}
              style={{ opacity: useGlobalSettings ? 0.5 : 1 }}
            />
          </div>
          
          {/* Mobile Height */}
          <div class="dmt-form-group" style={{ flex: 1, marginBottom: 0 }}>
            <label class="dmt-form-label">Mobile/Touch (pixels)</label>
            <input
              type="number"
              class="dmt-modal-input"
              placeholder={String(globalSettings.canvasHeightMobile ?? 400)}
              value={useGlobalSettings ? '' : (overrides.canvasHeightMobile ?? '')}
              onChange={(e) => handleCanvasHeightChange('canvasHeightMobile', e.target.value)}
              disabled={useGlobalSettings}
              style={{ opacity: useGlobalSettings ? 0.5 : 1 }}
            />
          </div>
        </div>
      </div>
      
      {/* Export Section */}
      <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid var(--background-modifier-border)' }}>
        <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>Export</h4>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          Export your map as a PNG image
        </p>
        
        <button
          class="windrose-btn"
          onClick={handleExportImage}
          disabled={isExporting}
          style={{
            padding: '6px 12px',
            cursor: isExporting ? 'wait' : 'pointer',
            opacity: isExporting ? 0.6 : 1
          }}
        >
          {isExporting ? 'Exporting...' : 'Export as Image'}
        </button>
        
        {exportError && (
          <div style={{
            marginTop: '8px',
            padding: '8px',
            backgroundColor: 'var(--background-modifier-error)',
            color: 'var(--text-error)',
            borderRadius: '4px',
            fontSize: '12px'
          }}>
            {exportError}
          </div>
        )}
        
        {exportSuccess && (
          <div style={{
            marginTop: '8px',
            padding: '8px',
            backgroundColor: 'var(--background-modifier-success)',
            color: 'var(--text-success)',
            borderRadius: '4px',
            fontSize: '12px'
          }}>
            {exportSuccess}
          </div>
        )}
      </div>
    </div>
  );
}

return { PreferencesTab };
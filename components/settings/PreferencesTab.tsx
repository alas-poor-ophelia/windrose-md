/**
 * PreferencesTab.tsx
 *
 * Preferences settings tab for MapSettingsModal.
 * Handles state persistence options, canvas height configuration, and map export.
 */

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useMapSettings } = await requireModuleByName("MapSettingsContext.tsx");
const { saveMapImageToVault } = await requireModuleByName("exportOperations.ts");

/** Export result */
interface ExportResult {
  success: boolean;
  path?: string;
  error?: string;
}

/**
 * Preferences tab content
 */
function PreferencesTab(): React.ReactElement {
  const {
    preferences,
    useGlobalSettings,
    overrides,
    globalSettings,
    handlePreferenceToggle,
    handleColorChange,
    mapData,
    geometry
  } = useMapSettings();

  const [isExporting, setIsExporting] = dc.useState(false);
  const [exportError, setExportError] = dc.useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = dc.useState<string | null>(null);

  const handleExportImage = async (): Promise<void> => {
    if (!mapData || !geometry) {
      setExportError('Map data not available');
      return;
    }

    setIsExporting(true);
    setExportError(null);
    setExportSuccess(null);

    try {
      const result: ExportResult = await saveMapImageToVault(mapData, geometry);

      if (result.success) {
        setExportSuccess(`Map saved to: ${result.path}`);
        setTimeout(() => setExportSuccess(null), 5000);
      } else {
        setExportError(result.error || 'Export failed. Please try again.');
      }
    } catch (error) {
      console.error('[PreferencesTab] Export error:', error);
      setExportError((error as Error).message || 'Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const alwaysShowControls = overrides.alwaysShowControls ?? globalSettings.alwaysShowControls ?? false;

  return (
    <div class="dmt-settings-tab-content">
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
        Control what state is remembered for this map
      </p>

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

      <div class="dmt-form-group">
        <label class="dmt-checkbox-label">
          <input
            type="checkbox"
            checked={alwaysShowControls}
            onChange={(e: Event) => handleColorChange('alwaysShowControls', (e.target as HTMLInputElement).checked)}
            class="dmt-checkbox"
          />
          <span>Always show map controls</span>
        </label>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', marginLeft: '22px' }}>
          Keep zoom, layers, and settings buttons visible instead of auto-hiding
        </p>
      </div>

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

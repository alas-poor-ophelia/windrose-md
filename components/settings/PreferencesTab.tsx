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
const { SettingItem, SettingHeading } = await requireModuleByName("SettingItem.tsx");
const { NativeToggle } = await requireModuleByName("NativeControls.tsx");

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
    objectSetId,
    handleObjectSetChange,
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
      {globalSettings.objectSets && globalSettings.objectSets.length > 0 && (
        <SettingItem
          name="Object set"
          description="Override the global object set for this map"
        >
          <select
            class="dropdown"
            value={objectSetId || ''}
            onChange={(e) => handleObjectSetChange(e.currentTarget.value || null)}
          >
            <option value="">Use global</option>
            {globalSettings.objectSets.map((set) => (
              <option key={set.id} value={set.id}>{set.name}</option>
            ))}
          </select>
        </SettingItem>
      )}

      <SettingItem
        name="Remember pan and zoom"
        description="Restore map position when reopening"
      >
        <NativeToggle
          value={preferences.rememberPanZoom}
          onChange={() => handlePreferenceToggle('rememberPanZoom')}
        />
      </SettingItem>

      <SettingItem
        name="Remember sidebar state"
        description="Restore sidebar collapsed/expanded state"
      >
        <NativeToggle
          value={preferences.rememberSidebarState}
          onChange={() => handlePreferenceToggle('rememberSidebarState')}
        />
      </SettingItem>

      <SettingItem
        name="Remember expanded state"
        description="Restore expanded/compact map view"
      >
        <NativeToggle
          value={preferences.rememberExpandedState}
          onChange={() => handlePreferenceToggle('rememberExpandedState')}
        />
      </SettingItem>

      <SettingItem
        name="Always show map controls"
        description="Keep zoom, layers, and settings buttons visible instead of auto-hiding"
      >
        <NativeToggle
          value={alwaysShowControls}
          onChange={() => handleColorChange('alwaysShowControls', !alwaysShowControls)}
        />
      </SettingItem>

      <SettingHeading text="Export" />

      <SettingItem
        name="Export as image"
        description="Save your map as a PNG file"
      >
        <button
          class="mod-cta"
          onClick={handleExportImage}
          disabled={isExporting}
          style={{ opacity: isExporting ? 0.6 : 1 }}
        >
          {isExporting ? 'Exporting...' : 'Export'}
        </button>
      </SettingItem>

      {exportError && (
        <div style={{
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
  );
}

return { PreferencesTab };

/**
 * PreferencesTab.tsx
 *
 * Preferences settings tab for MapSettingsModal.
 * Handles state persistence options, canvas height configuration, and map export.
 */









/** Export result */

import { useState } from 'preact/hooks';
import type { VNode } from 'preact';
import { useModalShell, useAppearance } from '../../context/MapSettingsContext';
import { useApp } from '../../context/AppContext';
import { saveMapImageToVault } from '../../persistence/exportOperations';
import { SettingItem, SettingHeading } from './SettingItem';
import { NativeToggle } from './NativeControls';
interface ExportResult {
  success: boolean;
  path?: string;
  error?: string;
}

/**
 * Preferences tab content
 */
function PreferencesTab(): VNode {
  const { preferences, handlePreferenceToggle, mapData, geometry } = useModalShell();
  const { overrides, globalSettings, handleColorChange } = useAppearance();
  const app = useApp();

  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  const handleExportImage = async (): Promise<void> => {
    if (mapData == null || geometry == null) {
      setExportError('Map data not available');
      return;
    }

    setIsExporting(true);
    setExportError(null);
    setExportSuccess(null);

    try {
      const result: ExportResult = await saveMapImageToVault(app, mapData, geometry);

      if (result.success) {
        setExportSuccess(`Map saved to: ${result.path}`);
        window.setTimeout(() => setExportSuccess(null), 5000);
      } else {
        setExportError(result.error ?? 'Export failed. Please try again.');
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
    <div class="windrose-settings-tab-content">
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

      {exportError != null && exportError !== '' && (
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

      {exportSuccess != null && exportSuccess !== '' && (
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

export { PreferencesTab };
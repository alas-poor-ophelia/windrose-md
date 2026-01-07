/**
 * MeasurementTab.tsx
 *
 * Distance measurement settings tab for MapSettingsModal.
 * Handles distance per cell, units, diagonal rules, and display format.
 */

import type { DiagonalRule, DistanceDisplayFormat } from '#types/settings/settings.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useMapSettings } = await requireModuleByName("MapSettingsContext.tsx");

/** Distance settings state */
interface DistanceSettingsState {
  useGlobalDistance: boolean;
  distancePerCell: number;
  distanceUnit: string;
  gridDiagonalRule: DiagonalRule;
  displayFormat: DistanceDisplayFormat;
}

/**
 * Measurement tab content
 */
function MeasurementTab(): React.ReactElement {
  const {
    isHexMap,
    distanceSettings,
    setDistanceSettings
  } = useMapSettings();

  const handleToggleUseGlobal = (): void => {
    setDistanceSettings((prev: DistanceSettingsState) => ({
      ...prev,
      useGlobalDistance: !prev.useGlobalDistance
    }));
  };

  const handleDistancePerCellChange = (e: Event): void => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    if (!isNaN(val) && val > 0) {
      setDistanceSettings((prev: DistanceSettingsState) => ({ ...prev, distancePerCell: val }));
    }
  };

  const handleUnitChange = (e: Event): void => {
    setDistanceSettings((prev: DistanceSettingsState) => ({
      ...prev,
      distanceUnit: (e.target as HTMLSelectElement).value
    }));
  };

  const handleDiagonalRuleChange = (e: Event): void => {
    setDistanceSettings((prev: DistanceSettingsState) => ({
      ...prev,
      gridDiagonalRule: (e.target as HTMLSelectElement).value as DiagonalRule
    }));
  };

  const handleDisplayFormatChange = (e: Event): void => {
    setDistanceSettings((prev: DistanceSettingsState) => ({
      ...prev,
      displayFormat: (e.target as HTMLSelectElement).value as DistanceDisplayFormat
    }));
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

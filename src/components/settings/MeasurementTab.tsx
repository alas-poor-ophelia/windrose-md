/**
 * MeasurementTab.tsx
 *
 * Distance measurement settings tab for MapSettingsModal.
 * Handles distance per cell, units, diagonal rules, and display format.
 */

import type { DiagonalRule, DistanceDisplayFormat } from '#types/settings/settings.types';
import type { VNode } from 'preact';

import { useModalShell } from '../../context/MapSettingsContext';
import { getSettings } from '../../core/settingsAccessor';
import { getPackUnitOptions } from '../../travel/travelPackOperations';
import { SettingItem } from './SettingItem';
import { NativeToggle, NativeDropdown } from './NativeControls';

/** Built-in distance units offered on every map */
const STANDARD_UNIT_OPTIONS = [
  { value: 'ft', label: 'feet' },
  { value: 'm', label: 'meters' },
  { value: 'mi', label: 'miles' },
  { value: 'km', label: 'kilometers' },
  { value: 'yd', label: 'yards' }
];









/**
 * Measurement tab content
 */
function MeasurementTab(): VNode {
  const {
    isHexMap,
    distanceSettings,
    setDistanceSettings
  } = useModalShell();

  const handleToggleUseGlobal = (): void => {
    setDistanceSettings({ useGlobalDistance: !distanceSettings.useGlobalDistance });
  };

  const handleDistancePerCellChange = (e: Event): void => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    if (!isNaN(val) && val > 0) {
      setDistanceSettings({ distancePerCell: val });
    }
  };


  const isDisabled = distanceSettings.useGlobalDistance;

  // Standard units plus custom units from enabled travel packs (TM-24).
  // If the current unit came from a since-disabled pack, keep it listed so
  // the dropdown never silently switches the map's unit.
  const unitOptions = [
    ...STANDARD_UNIT_OPTIONS,
    ...getPackUnitOptions(getSettings().travelPacks, STANDARD_UNIT_OPTIONS.map(o => o.value))
  ];
  if (!unitOptions.some(o => o.value === distanceSettings.distanceUnit)) {
    unitOptions.push({
      value: distanceSettings.distanceUnit,
      label: `${distanceSettings.distanceUnit} (pack disabled)`
    });
  }

  return (
    <div class="windrose-settings-tab-content">
      <div class={`windrose-override-master${distanceSettings.useGlobalDistance ? '' : ' windrose-override-master-active'}`}>
        <SettingItem
          name="Custom measurement settings"
          description="Override the global distance settings for this map — distance per cell, units, diagonal rule, and display format"
        >
          <NativeToggle
            value={!distanceSettings.useGlobalDistance}
            onChange={handleToggleUseGlobal}
          />
        </SettingItem>
      </div>

      <div style={{ opacity: isDisabled ? 0.5 : 1 }}>
        <SettingItem name={`Distance per ${isHexMap ? 'Hex' : 'Cell'}`}>
          <input
            type="number"
            min="0.1"
            step="0.1"
            value={distanceSettings.distancePerCell}
            disabled={isDisabled}
            onChange={handleDistancePerCellChange}
            style={{ width: '80px' }}
          />
          <NativeDropdown
            value={distanceSettings.distanceUnit}
            options={unitOptions}
            onChange={(val: string) => setDistanceSettings({ distanceUnit: val })}
            disabled={isDisabled}
          />
        </SettingItem>

        {!isHexMap && (
          <SettingItem name="Diagonal Movement">
            <NativeDropdown
              value={distanceSettings.gridDiagonalRule}
              options={[
                { value: 'alternating', label: 'Alternating (5-10-5-10)' },
                { value: 'equal', label: 'Equal (Chebyshev)' },
                { value: 'euclidean', label: 'True Distance' }
              ]}
              onChange={(val: string) => setDistanceSettings({ gridDiagonalRule: val as DiagonalRule })}
              disabled={isDisabled}
            />
          </SettingItem>
        )}

        <SettingItem name="Display Format">
          <NativeDropdown
            value={distanceSettings.displayFormat}
            options={[
              { value: 'both', label: 'Cells and Units' },
              { value: 'cells', label: 'Cells Only' },
              { value: 'units', label: 'Units Only' }
            ]}
            onChange={(val: string) => setDistanceSettings({ displayFormat: val as DistanceDisplayFormat })}
            disabled={isDisabled}
          />
        </SettingItem>
      </div>
    </div>
  );
}

export { MeasurementTab };
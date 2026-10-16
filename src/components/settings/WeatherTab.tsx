/**
 * WeatherTab.tsx
 *
 * Weather tab of MapSettingsModal, offered only while the U+13080 Weather
 * plugin is usable. Sets the map-level zone ("whole map" weather: a grid
 * map's weather, and the fallback for hexes no bound region claims) and
 * the per-map "Animate weather" switch. On a sub-hex level an unset zone
 * inherits the weather of the hex it was drilled from.
 */

import type { VNode } from 'preact';

import { useModalShell } from '../../context/MapSettingsContext';
import { SettingItem } from './SettingItem';
import { NativeDropdown, NativeToggle } from './NativeControls';

function WeatherTab(): VNode {
  const { weatherZones, weather, setWeather, isInSubHex, isHexMap } = useModalShell();
  const zones = weatherZones ?? [];

  const options = [
    { value: '', label: isInSubHex ? 'Same as the parent hex' : 'None' },
    ...zones.map(zone => ({ value: zone.id, label: zone.name })),
  ];
  // A zone deleted in the weather plugin stays listed so the dropdown never
  // silently drops the binding; the map shows no weather for it meanwhile
  if (weather.weatherZoneId !== '' && !zones.some(zone => zone.id === weather.weatherZoneId)) {
    options.push({ value: weather.weatherZoneId, label: `${weather.weatherZoneId} (zone not found)` });
  }

  const zoneDescription = isHexMap
    ? 'Weather for every hex that no weather-bound region covers'
    : 'Weather for the whole map';

  return (
    <div class="windrose-settings-tab-content">
      <SettingItem name="Weather zone" description={zoneDescription}>
        <NativeDropdown
          value={weather.weatherZoneId}
          options={options}
          onChange={(value: string) => setWeather({ weatherZoneId: value })}
        />
      </SettingItem>
      <SettingItem name="Animate weather" description="Show falling rain and snow, drifting fog and cloud shadows on this map">
        <NativeToggle
          value={weather.weatherAnimate}
          onChange={() => setWeather({ weatherAnimate: !weather.weatherAnimate })}
        />
      </SettingItem>
    </div>
  );
}

export { WeatherTab };

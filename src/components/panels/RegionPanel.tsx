/**
 * RegionPanel.tsx
 *
 * Floating panel for hex map region management.
 * Lists all regions with visibility toggles and color indicators.
 * Clicking a region centers the map on it.
 */

import type { Region } from '#types/core/map.types';
import type { VNode } from 'preact';

import { useMemo } from 'preact/hooks';
import { Icon } from '../shared/Icon';
import { tooltipRef } from '../shared/obsidianTooltip';
import { useWeather } from '../../hooks/state/useWeather';
import { hasWeatherZone } from '../../weather/weatherZones';

const REGION_NAME_MAX_LENGTH = 20;
const REGION_NAME_TRUNCATE_AT = 17;

interface RegionPanelProps {
  regions: Region[];
  onRegionsChange: (regions: Region[]) => void;
  isOpen?: boolean;
  /** Per-mount instance id — stamped into center-on-region events. */
  instanceId?: string;
}

const RegionPanel = ({
  regions,
  onRegionsChange,
  isOpen = false,
  instanceId
}: RegionPanelProps): VNode | null => {

  const getDisplayName = (name: string): string => {
    return name.length > REGION_NAME_MAX_LENGTH
      ? name.slice(0, REGION_NAME_TRUNCATE_AT) + '...'
      : name;
  };

  const handleToggleVisibility = (regionId: string, e: Event): void => {
    e.stopPropagation();
    const updated = regions.map(r =>
      r.id === regionId ? { ...r, visible: !r.visible } : r
    );
    onRegionsChange(updated);
  };

  const handleRegionClick = (regionId: string, e: MouseEvent): void => {
    // Dispatch on the document that owns this panel (popout-safe).
    const doc = e.currentTarget instanceof Node ? (e.currentTarget.ownerDocument ?? activeDocument) : activeDocument;
    doc.dispatchEvent(new CustomEvent('windrose:center-on-region', {
      detail: { regionId, instanceId }
    }));
  };

  const sortedRegions = useMemo(() => {
    return [...regions].sort((a, b) => a.order - b.order);
  }, [regions]);

  // Today's weather per weather-bound region, in the weather plugin's own
  // wording; no entry when unbound or the plugin is unavailable
  const weather = useWeather();
  const weatherLines = useMemo(() => {
    const lines = new Map<string, string>();
    if (!weather.available) return lines;
    for (const region of regions) {
      if (!hasWeatherZone(region)) continue;
      const report = weather.reportFor(region.weatherZoneId);
      const line = report != null ? weather.describe(report) : 'Weather zone not found';
      if (line != null) lines.set(region.id, line);
    }
    return lines;
  }, [weather, regions]);

  if (regions.length === 0) return null;

  return (
    <div
      className={`windrose-region-panel ${isOpen ? 'windrose-region-panel-open' : ''}`}
    >
      <div className="windrose-region-panel-header">
        <Icon icon="lucide-map" size={12} />
        <span>Regions</span>
      </div>

      {sortedRegions.map(region => (
        <button
          key={region.id}
          className={`windrose-region-item ${!region.visible ? 'windrose-region-item-hidden' : ''}`}
          onClick={(e) => handleRegionClick(region.id, e)}
          ref={tooltipRef(weatherLines.has(region.id)
            ? `${region.name} (${region.hexes.length} hexes) — ${weatherLines.get(region.id) ?? ''}`
            : `${region.name} (${region.hexes.length} hexes)`)}
        >
          <span
            className="windrose-region-color-dot"
            style={{
              backgroundColor: region.color,
              opacity: region.visible ? 1 : 0.4
            }}
          />
          <span className="windrose-region-name">
            {getDisplayName(region.name)}
          </span>
          {weatherLines.has(region.id) && (
            <span className="windrose-region-weather-icon">
              <Icon icon="lucide-cloud-sun" size={12} />
            </span>
          )}
          <button
            className="windrose-region-visibility-btn"
            onClick={(e: Event) => handleToggleVisibility(region.id, e)}
            ref={tooltipRef(region.visible ? 'Hide region' : 'Show region')}
          >
            <Icon icon={region.visible ? 'lucide-eye' : 'lucide-eye-off'} size={12} />
          </button>
        </button>
      ))}
    </div>
  );
};

export { RegionPanel };
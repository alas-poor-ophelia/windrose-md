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

const REGION_NAME_MAX_LENGTH = 20;
const REGION_NAME_TRUNCATE_AT = 17;

export interface RegionPanelProps {
  regions: Region[];
  onRegionsChange: (regions: Region[]) => void;
  sidebarCollapsed: boolean;
  isOpen?: boolean;
  /** Per-mount instance id — stamped into center-on-region events. */
  instanceId?: string;
}

const RegionPanel = ({
  regions,
  onRegionsChange,
  sidebarCollapsed,
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

  const handleRegionClick = (regionId: string): void => {
    activeDocument.dispatchEvent(new CustomEvent('windrose:center-on-region', {
      detail: { regionId, instanceId }
    }));
  };

  const sortedRegions = useMemo(() => {
    return [...regions].sort((a, b) => a.order - b.order);
  }, [regions]);

  if (regions.length === 0) return null;

  return (
    <div
      className={`windrose-region-panel ${sidebarCollapsed ? 'sidebar-closed' : 'sidebar-open'} ${isOpen ? 'windrose-region-panel-open' : ''}`}
    >
      <div className="windrose-region-panel-header">
        <Icon icon="lucide-map" size={12} />
        <span>Regions</span>
      </div>

      {sortedRegions.map(region => (
        <button
          key={region.id}
          className={`windrose-region-item ${!region.visible ? 'windrose-region-item-hidden' : ''}`}
          onClick={() => handleRegionClick(region.id)}
          ref={tooltipRef(`${region.name} (${region.hexes.length} hexes)`)}
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
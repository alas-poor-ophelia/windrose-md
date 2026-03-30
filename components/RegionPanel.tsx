/**
 * RegionPanel.tsx
 *
 * Floating panel for hex map region management.
 * Lists all regions with visibility toggles and color indicators.
 * Clicking a region centers the map on it.
 */

import type { Region } from '#types/core/map.types';

const REGION_NAME_MAX_LENGTH = 20;
const REGION_NAME_TRUNCATE_AT = 17;

export interface RegionPanelProps {
  regions: Region[];
  onRegionsChange: (regions: Region[]) => void;
  sidebarCollapsed: boolean;
  isOpen?: boolean;
}

const RegionPanel = ({
  regions,
  onRegionsChange,
  sidebarCollapsed,
  isOpen = false
}: RegionPanelProps): React.ReactElement => {

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
    document.dispatchEvent(new CustomEvent('windrose:center-on-region', {
      detail: { regionId }
    }));
  };

  const sortedRegions = dc.useMemo(() => {
    return [...regions].sort((a, b) => a.order - b.order);
  }, [regions]);

  if (regions.length === 0) return null as unknown as React.ReactElement;

  return (
    <div
      className={`dmt-region-panel ${sidebarCollapsed ? 'sidebar-closed' : 'sidebar-open'} ${isOpen ? 'dmt-region-panel-open' : ''}`}
    >
      <div className="dmt-region-panel-header">
        <dc.Icon icon="lucide-map" size={12} />
        <span>Regions</span>
      </div>

      {sortedRegions.map(region => (
        <button
          key={region.id}
          className={`dmt-region-item ${!region.visible ? 'dmt-region-item-hidden' : ''}`}
          onClick={() => handleRegionClick(region.id)}
          title={`${region.name} (${region.hexes.length} hexes)`}
        >
          <span
            className="dmt-region-color-dot"
            style={{
              backgroundColor: region.color,
              opacity: region.visible ? 1 : 0.4
            }}
          />
          <span className="dmt-region-name">
            {getDisplayName(region.name)}
          </span>
          <button
            className="dmt-region-visibility-btn"
            onClick={(e: Event) => handleToggleVisibility(region.id, e)}
            title={region.visible ? 'Hide region' : 'Show region'}
          >
            <dc.Icon icon={region.visible ? 'lucide-eye' : 'lucide-eye-off'} size={12} />
          </button>
        </button>
      ))}
    </div>
  );
};

return { RegionPanel };

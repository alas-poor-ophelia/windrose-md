/**
 * RegionPanel.tsx
 *
 * Floating panel for hex map region management.
 * Lists all regions with visibility toggles, color indicators,
 * and quick actions (edit, delete).
 */

import type { Region } from '#types/core/map.types';

const REGION_NAME_MAX_LENGTH = 20;
const REGION_NAME_TRUNCATE_AT = 17;

export interface RegionPanelProps {
  regions: Region[];
  onRegionsChange: (regions: Region[]) => void;
  onEditRegion: (regionId: string) => void;
  sidebarCollapsed: boolean;
  isOpen?: boolean;
}

const RegionPanel = ({
  regions,
  onRegionsChange,
  onEditRegion,
  sidebarCollapsed,
  isOpen = false
}: RegionPanelProps): React.ReactElement => {
  const panelRef = dc.useRef<HTMLDivElement>(null);
  const [expandedRegionId, setExpandedRegionId] = dc.useState<string | null>(null);

  const longPressTimerRef = dc.useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = dc.useRef(false);

  // Close expanded options on click outside or Escape
  dc.useEffect(() => {
    if (!expandedRegionId) return;

    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setExpandedRegionId(null);
      }
    };

    const handleClickOutside = (e: PointerEvent): void => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setExpandedRegionId(null);
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.addEventListener('pointerdown', handleClickOutside, true);
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('pointerdown', handleClickOutside, true);
    };
  }, [expandedRegionId]);

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

  const handleDelete = (regionId: string, e: Event): void => {
    e.stopPropagation();
    setExpandedRegionId(null);
    onRegionsChange(regions.filter(r => r.id !== regionId));
  };

  const handleRegionClick = (regionId: string, e: Event): void => {
    e.stopPropagation();

    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }

    if (expandedRegionId === regionId) {
      setExpandedRegionId(null);
      return;
    }

    setExpandedRegionId(null);

    // Center the map on this region
    document.dispatchEvent(new CustomEvent('windrose:center-on-region', {
      detail: { regionId }
    }));
  };

  const handleContextMenu = (regionId: string, e: Event): void => {
    e.preventDefault();
    e.stopPropagation();
    setExpandedRegionId(expandedRegionId === regionId ? null : regionId);
  };

  const handleTouchStart = (regionId: string): void => {
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      setExpandedRegionId(expandedRegionId === regionId ? null : regionId);
    }, 500);
  };

  const handleTouchEnd = (): void => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleEdit = (regionId: string, e: Event): void => {
    e.stopPropagation();
    setExpandedRegionId(null);
    onEditRegion(regionId);
  };

  const sortedRegions = dc.useMemo(() => {
    return [...regions].sort((a, b) => a.order - b.order);
  }, [regions]);

  if (regions.length === 0) return null as unknown as React.ReactElement;

  return (
    <div
      ref={panelRef}
      className={`dmt-region-panel ${sidebarCollapsed ? 'sidebar-closed' : 'sidebar-open'} ${isOpen ? 'dmt-region-panel-open' : ''}`}
    >
      <div className="dmt-region-panel-header">
        <dc.Icon icon="lucide-map" size={12} />
        <span>Regions</span>
      </div>

      {sortedRegions.map(region => {
        const isExpanded = region.id === expandedRegionId;

        return (
          <div key={region.id} className="dmt-region-item-wrapper">
            <button
              className={`dmt-region-item ${!region.visible ? 'dmt-region-item-hidden' : ''}`}
              onClick={(e: Event) => handleRegionClick(region.id, e)}
              onContextMenu={(e: Event) => handleContextMenu(region.id, e)}
              onTouchStart={() => handleTouchStart(region.id)}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchEnd}
              title={`${region.name} (${region.hexes.length} hexes) - Right-click for options`}
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

            <div className={`dmt-region-options ${isExpanded ? 'expanded' : ''}`}>
              <button
                className="dmt-region-option-btn edit"
                onClick={(e: Event) => handleEdit(region.id, e)}
                title="Edit region"
              >
                <dc.Icon icon="lucide-pencil" />
              </button>
              <button
                className="dmt-region-option-btn delete"
                onClick={(e: Event) => handleDelete(region.id, e)}
                title="Delete region"
              >
                <dc.Icon icon="lucide-trash-2" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

return { RegionPanel };

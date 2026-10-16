// BlockEdgeRail.tsx - Block-mode left icon rail: Layers / Colors / View
// (+ Regions on hex, + Almanac when the map has weather) flyouts over the
// canvas, plus the map-settings action.

import type { VNode } from 'preact';
import type { Region } from '#types/core/map.types';
import { EdgeRail } from '../panels/EdgeRail';
import { DockLayerList } from '../panels/DockLayerList';
import { DockViewPanel } from '../panels/DockViewPanel';
import { ColorPicker } from '../shared/ColorPicker';
import { RegionPanel } from '../panels/RegionPanel';
import { AlmanacPanel } from '../panels/AlmanacPanel';
import { useWeatherStore } from '../../context/WeatherContext';
import type { PanelBags } from './panelBags';

interface BlockEdgeRailProps {
  bags: PanelBags;
  openId: string | null;
  onOpenChange: (id: string | null) => void;
  /** Present only when the Regions flyout applies (hex map, regions feature on). */
  regions: { regions: Region[]; onRegionsChange: (regions: Region[]) => void; instanceId: string } | null;
  onSettingsClick: () => void;
}

/** The Almanac needs more room than the 198px default drawer */
const ALMANAC_DRAWER_WIDTH = 252;

const BlockEdgeRail = ({ bags, openId, onOpenChange, regions, onSettingsClick }: BlockEdgeRailProps): VNode => {
  // Offered while the weather plugin is usable and the shown level has weather
  const weather = useWeatherStore();
  const almanacOffered = weather.available && weather.areas.length > 0;
  const openInAlmanac = (regionId: string): void => {
    bags.almanac.onAreaChange(`region:${regionId}`);
    onOpenChange('almanac');
  };
  return (
    <EdgeRail
      openId={openId}
      onOpenChange={onOpenChange}
      panels={[
        { id: 'layers', icon: 'lucide-layers', title: 'Layers', content: <DockLayerList {...bags.layerList} /> },
        { id: 'colors', icon: 'lucide-palette', title: 'Colors', content: <ColorPicker {...bags.colorPicker} /> },
        { id: 'view', icon: 'lucide-eye', title: 'View', content: <DockViewPanel {...bags.viewPanel} /> },
        ...(regions != null ? [{
          id: 'regions',
          icon: 'lucide-map',
          title: 'Regions',
          content: (
            <RegionPanel
              regions={regions.regions}
              onRegionsChange={regions.onRegionsChange}
              isOpen
              instanceId={regions.instanceId}
              onOpenInAlmanac={almanacOffered ? openInAlmanac : undefined}
            />
          )
        }] : []),
        ...(almanacOffered ? [{
          id: 'almanac',
          icon: 'lucide-cloud-sun',
          title: 'Almanac',
          width: ALMANAC_DRAWER_WIDTH,
          content: <AlmanacPanel {...bags.almanac} active={openId === 'almanac'} />,
        }] : [])
      ]}
      actions={[
        { id: 'settings', icon: 'lucide-settings', title: 'Map settings', onClick: onSettingsClick }
      ]}
    />
  );
};

export { BlockEdgeRail };

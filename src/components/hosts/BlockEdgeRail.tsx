// BlockEdgeRail.tsx - Block-mode left icon rail: Layers / Colors / View
// (+ Regions on hex) flyouts over the canvas, plus the map-settings action.

import type { VNode } from 'preact';
import type { Region } from '#types/core/map.types';
import { EdgeRail } from '../panels/EdgeRail';
import { DockLayerList } from '../panels/DockLayerList';
import { DockViewPanel } from '../panels/DockViewPanel';
import { ColorPicker } from '../shared/ColorPicker';
import { RegionPanel } from '../panels/RegionPanel';
import type { PanelBags } from './panelBags';

interface BlockEdgeRailProps {
  bags: PanelBags;
  openId: string | null;
  onOpenChange: (id: string | null) => void;
  /** Present only when the Regions flyout applies (hex map, regions feature on). */
  regions: { regions: Region[]; onRegionsChange: (regions: Region[]) => void; instanceId: string } | null;
  onSettingsClick: () => void;
}

const BlockEdgeRail = ({ bags, openId, onOpenChange, regions, onSettingsClick }: BlockEdgeRailProps): VNode => (
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
          />
        )
      }] : [])
    ]}
    actions={[
      { id: 'settings', icon: 'lucide-settings', title: 'Map settings', onClick: onSettingsClick }
    ]}
  />
);

export { BlockEdgeRail };

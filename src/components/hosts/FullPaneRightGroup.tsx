// FullPaneRightGroup.tsx - Full-pane right group: the tile drawer (unless the
// tile browser is floated) plus the stacked dock column (Layers / Colors /
// View [+ Almanac when the map has weather] + Map settings), which collapses
// to an icon ribbon.

import type { VNode } from 'preact';
import { DrawerDock } from '../panels/DrawerDock';
import { DockPanel } from '../panels/DockPanel';
import { DockRibbon } from '../panels/DockRibbon';
import { DockLayerList } from '../panels/DockLayerList';
import { DockViewPanel } from '../panels/DockViewPanel';
import { AlmanacPanel } from '../panels/AlmanacPanel';
import { useWeatherStore } from '../../context/WeatherContext';
import { ObjectSidebar } from '../panels/ObjectSidebar';
import { ColorPicker } from '../shared/ColorPicker';
import { Icon } from '../shared/Icon';
import { tooltipRef } from '../shared/obsidianTooltip';
import type { PanelId, UseFloatingPanelsResult } from '../../hooks/state/useFloatingPanels';
import type { DockLayout } from '../../hooks/app/useDockLayout';
import { TileBrowserHost } from './TileBrowserHost';
import type { PanelBags } from './panelBags';

interface FullPaneRightGroupProps {
  bags: PanelBags;
  floating: Pick<UseFloatingPanelsResult, 'isFloating' | 'toggleFloat'>;
  dock: DockLayout;
  showTilePanel: boolean;
  drawerWidth: number;
  onDrawerWidthChange: (width: number) => void;
  /** Memoized vertical ribbon shared by the Tiles and Objects panes. */
  drawerRibbon: VNode;
  onSettingsClick: () => void;
}

const DOCK_RIBBON_ITEMS: Array<{ id: PanelId; icon: string; title: string }> = [
  { id: 'layers', icon: 'lucide-layers', title: 'Layers' },
  { id: 'colorPicker', icon: 'lucide-palette', title: 'Colors' },
  { id: 'view', icon: 'lucide-eye', title: 'View' },
];

const ALMANAC_RIBBON_ITEM = { id: 'almanac', icon: 'lucide-cloud-sun', title: 'Almanac' };

const FullPaneRightGroup = ({ bags, floating, dock, showTilePanel, drawerWidth, onDrawerWidthChange, drawerRibbon, onSettingsClick }: FullPaneRightGroupProps): VNode => {
  const { isFloating, toggleFloat } = floating;
  // Offered while the weather plugin is usable and the shown level has weather
  const weather = useWeatherStore();
  const almanacOffered = weather.available && weather.areas.length > 0;
  const almanacCollapsed = dock.sectionCollapsed['almanac'] ?? true;
  return (
    <div className="windrose-right-group">
      {showTilePanel && !isFloating('tiles') && (
        <DrawerDock
          {...bags.drawer}
          drawerWidth={drawerWidth}
          onWidthChange={onDrawerWidthChange}
          minWidth={180}
          maxWidth={392}
          ribbonWidth={54}
          fold
          compact={false}
        >
          {bags.drawer.pane === 'objects' ? (
            <ObjectSidebar {...bags.objectsPane} hideHeader={false} ribbon={drawerRibbon} />
          ) : (
            <TileBrowserHost bag={bags.tileBrowser} variant="fullpane" ribbon={drawerRibbon} />
          )}
        </DrawerDock>
      )}
      <div className={`windrose-dock-right${dock.collapsed ? ' is-collapsed' : ''}`}>
        {dock.collapsed ? (
          <DockRibbon
            items={DOCK_RIBBON_ITEMS.filter(it => !isFloating(it.id))
              // Settings is an action, not a panel — opens the modal directly
              .map((it): { id: string; icon: string; title: string } => it)
              .concat(almanacOffered ? [ALMANAC_RIBBON_ITEM] : [])
              .concat([{ id: 'settings', icon: 'lucide-settings', title: 'Map settings' }])}
            onExpand={(id) => id === 'settings' ? onSettingsClick() : dock.expandFromRibbon(id)}
          />
        ) : (
          <>
            {!isFloating('layers') && (
              <DockPanel
                title="Layers"
                collapsed={dock.sectionCollapsed['layers'] ?? false}
                onToggleCollapse={() => dock.toggleSection('layers')}
                onCollapseDock={() => dock.setCollapsed(true)}
                onUndock={(pos) => toggleFloat('layers', pos)}
              >
                <DockLayerList {...bags.layerList} />
              </DockPanel>
            )}
            {!isFloating('colorPicker') && (
              <DockPanel
                title="Colors"
                collapsed={dock.sectionCollapsed['colorPicker'] ?? false}
                onToggleCollapse={() => dock.toggleSection('colorPicker')}
                onUndock={(pos) => toggleFloat('colorPicker', pos)}
              >
                <ColorPicker {...bags.colorPicker} />
              </DockPanel>
            )}
            {!isFloating('view') && (
              <DockPanel
                title="View"
                collapsed={dock.sectionCollapsed['view'] ?? true}
                onToggleCollapse={() => dock.toggleSection('view')}
                onUndock={(pos) => toggleFloat('view', pos)}
              >
                <DockViewPanel {...bags.viewPanel} />
              </DockPanel>
            )}
            {almanacOffered && (
              <DockPanel
                title="Almanac"
                collapsed={almanacCollapsed}
                onToggleCollapse={() => dock.toggleSection('almanac')}
              >
                <AlmanacPanel {...bags.almanac} active={!almanacCollapsed} />
              </DockPanel>
            )}
            {/* Map settings — moved out of the View panel (windrose-5cx);
                a standalone action row at the bottom of the dock column. */}
            <button
              className="windrose-dock-settings-btn interactive-child"
              onClick={onSettingsClick}
              ref={tooltipRef('Map settings')}
            >
              <Icon icon="lucide-settings" size={14} />
              <span>Map settings</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export { FullPaneRightGroup };

// FloatingPanelsHost.tsx - Popped-out panels (portalled FloatingPanel windows):
// Tools, Layers, Colors, View and Tiles. Same prop bags as the docked copies.

import type { VNode } from 'preact';
import { FloatingPanel } from '../panels/FloatingPanel';
import { DockLayerList } from '../panels/DockLayerList';
import { DockViewPanel } from '../panels/DockViewPanel';
import { ColorPicker } from '../shared/ColorPicker';
import type { ColorPickerProps } from '../shared/ColorPicker';
import { ToolPalette } from '../toolbars/ToolPalette';
import { Icon } from '../shared/Icon';
import { tooltipRef } from '../shared/obsidianTooltip';
import type { PanelId, UseFloatingPanelsResult } from '../../hooks/state/useFloatingPanels';
import { TileBrowserHost } from './TileBrowserHost';
import type { PanelBags } from './panelBags';

interface FloatingPanelsHostProps {
  bags: PanelBags;
  floating: UseFloatingPanelsResult;
  /** Docking the colour picker commits a pending custom colour first. */
  onColorPickerClose: () => void;
  pendingCustomColorRef: ColorPickerProps['pendingCustomColorRef'];
  showTiles: boolean;
}

interface WindowChrome {
  onFocus: () => void;
  zIndex: number;
  initialPosition: { x: number; y: number } | undefined;
  onPositionChange: (pos: { x: number; y: number }) => void;
}

const FloatingPanelsHost = ({ bags, floating, onColorPickerClose, pendingCustomColorRef, showTiles }: FloatingPanelsHostProps): VNode => {
  const { isFloating, getZIndex, getInitialPosition, toggleFloat, bringToFront, updatePosition } = floating;
  // Shared window chrome for one panel id.
  const chrome = (id: PanelId): WindowChrome => ({
    onFocus: () => bringToFront(id),
    zIndex: getZIndex(id),
    initialPosition: getInitialPosition(id),
    onPositionChange: (pos) => updatePosition(id, pos),
  });
  return (
    <>
      {isFloating('toolPalette') && (
        <FloatingPanel title="Tools" isFloating headerless onDock={() => toggleFloat('toolPalette')} {...chrome('toolPalette')}>
          <ToolPalette
            {...bags.toolPalette}
            dockButton={
              <button
                className="windrose-tool-btn windrose-tool-palette-dock-btn interactive-child"
                onClick={() => toggleFloat('toolPalette')}
                ref={tooltipRef('Dock tools')}
              >
                <Icon icon="lucide-pin" />
              </button>
            }
          />
        </FloatingPanel>
      )}
      {isFloating('layers') && (
        <FloatingPanel title="Layers" isFloating onDock={() => toggleFloat('layers')} {...chrome('layers')} resizable minSize={{ width: 200, height: 150 }}>
          <DockLayerList {...bags.layerList} />
        </FloatingPanel>
      )}
      {isFloating('colorPicker') && (
        <FloatingPanel title="Colors" isFloating onDock={onColorPickerClose} {...chrome('colorPicker')} resizable minSize={{ width: 200, height: 150 }}>
          <ColorPicker {...bags.colorPicker} onClose={onColorPickerClose} pendingCustomColorRef={pendingCustomColorRef} />
        </FloatingPanel>
      )}
      {isFloating('view') && (
        <FloatingPanel title="View" isFloating onDock={() => toggleFloat('view')} {...chrome('view')}>
          <DockViewPanel {...bags.viewPanel} />
        </FloatingPanel>
      )}
      {isFloating('tiles') && showTiles && (
        <FloatingPanel title="Tiles" isFloating onDock={() => toggleFloat('tiles')} {...chrome('tiles')} resizable minSize={{ width: 200, height: 200 }}>
          <TileBrowserHost bag={bags.tileBrowser} variant="floating" />
        </FloatingPanel>
      )}
    </>
  );
};

export { FloatingPanelsHost };

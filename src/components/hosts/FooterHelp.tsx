// FooterHelp.tsx - Optional map footer: map id, selected colour name, the
// active tool's hint, generic navigation help and active-layer counts.

import type { VNode } from 'preact';
import type { MapData } from '#types/index';
import type { ToolId } from '#types/tools/tool.types';
import { getColorByHex, isDefaultColor } from '../../drawing/colorOperations';
import { allAuthoredCells, getActiveLayer } from '../../persistence/layerAccessor';

interface FooterHelpProps {
  mapId: string;
  mapData: MapData;
  selectedColor: string;
  currentTool: ToolId;
  selectedObjectType: string | null;
}

function colorDisplayName(selectedColor: string): string {
  if (isDefaultColor(selectedColor)) return 'Default';
  const colorDef = getColorByHex(selectedColor);
  return colorDef ? colorDef.label : selectedColor;
}

function toolHint(currentTool: ToolId, selectedObjectType: string | null): string {
  switch (currentTool) {
    case 'select': return 'Click to select text/objects | Drag to move | Press R to rotate | Press Delete to remove';
    case 'draw': return 'Click/drag to draw';
    case 'erase': return 'Click/drag to erase (text first, then objects, tiles, walls, then cells)';
    case 'rectangle': return 'Click two corners to fill rectangle';
    case 'circle': return 'Click edge point, then center to fill circle';
    case 'clearArea': return 'Click two corners to clear area';
    case 'addObject': return selectedObjectType != null && selectedObjectType !== '' ? 'Click to place object' : 'Select an object from the sidebar';
    case 'addNote': return 'Click to place note pin';
    case 'addText': return 'Click to add text label';
    default: return 'Select a tool';
  }
}

const FooterHelp = ({ mapId, mapData, selectedColor, currentTool, selectedObjectType }: FooterHelpProps): VNode => {
  const layer = getActiveLayer(mapData);
  return (
    <div className="windrose-footer">
      Map ID: {mapId} | Color: {colorDisplayName(selectedColor)} | {toolHint(currentTool, selectedObjectType)} | Undo/redo available | Middle-click, two-finger drag, or trackpad scroll to pan | Wheel or pinch to zoom | Click compass to rotate | {allAuthoredCells(layer).length} cells filled | {layer.objects.length} objects placed | {layer.textLabels.length} text labels
    </div>
  );
};

export { FooterHelp };

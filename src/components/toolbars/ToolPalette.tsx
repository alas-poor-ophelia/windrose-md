/**
 * ToolPalette.tsx
 *
 * Tool selection palette with sub-tool menus, history controls, and color picker.
 */

import type { JSX, VNode } from 'preact';
import type { HexColor } from '#types/core/common.types';
import type { MapType } from '#types/core/map.types';
import type { ToolId } from '#types/tools/tool.types';
import type { CustomColor } from '#types/core/common.types';
import type { ColorOpacityOverrides } from '../shared/ColorPicker.tsx';

import { useEffect, useRef, useState } from 'preact/hooks';
import { DEFAULT_COLOR } from '../../drawing/colorOperations';
import { ColorPicker } from '../shared/ColorPicker';
import { getSettings } from '../../core/settingsAccessor';
import { Icon } from '../shared/Icon';








/** Sub-tool definition */
interface SubToolDef {
  id: ToolId;
  label: string;
  title: string;
  icon: string;
  shortcut?: string;
  actionId?: string;
  gridOnly?: boolean;
  hexOnly?: boolean;
}

/** Tool group with sub-tools */
interface ToolGroup {
  id: string;
  shortcut?: string;
  actionId?: string;
  subTools: SubToolDef[];
  gridOnly?: boolean;
  hexOnly?: boolean;
}

/** Simple tool (no sub-menu) */
interface SimpleTool {
  id: ToolId;
  title: string;
  icon: string;
  shortcut?: string;
  actionId?: string;
  gridOnly?: boolean;
  hexOnly?: boolean;
}

/** Bracket position */
type BracketPosition = 'tl' | 'tr' | 'bl' | 'br';

/** Sub-tool selections state */
interface SubToolSelections {
  select: ToolId;
  draw: ToolId;
  fill: ToolId;
  erase: ToolId;
  region: ToolId;
}

/** Props for ToolPaletteBracket */
interface ToolPaletteBracketProps {
  position: BracketPosition;
}

/** Props for SubMenuFlyout */
interface SubMenuFlyoutProps {
  subTools: SubToolDef[];
  currentSubTool: ToolId;
  onSelect: (id: ToolId) => void;
  onClose: () => void;
}

/** Props for ToolButtonWithSubMenu */
interface ToolButtonWithSubMenuProps {
  toolGroup: ToolGroup;
  currentTool: ToolId;
  currentSubTool: ToolId;
  isSubMenuOpen: boolean;
  onToolSelect: (id: ToolId) => void;
  onSubToolSelect: (groupId: string, subToolId: ToolId) => void;
  onSubMenuOpen: (groupId: string) => void;
  onSubMenuClose: () => void;
  mapType: MapType;
}

/** Props for ToolPalette */
export interface ToolPaletteProps {
  currentTool: ToolId;
  onToolChange: (tool: ToolId) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  selectedColor: HexColor | null;
  onColorChange: (color: HexColor) => void;
  selectedOpacity?: number;
  onOpacityChange?: (opacity: number) => void;
  isColorPickerOpen: boolean;
  onColorPickerOpenChange: (open: boolean) => void;
  customColors: CustomColor[];
  paletteColorOpacityOverrides?: ColorOpacityOverrides;
  onAddCustomColor?: (color: HexColor) => void;
  onDeleteCustomColor?: (colorId: string) => void;
  onUpdateColorOpacity?: (colorId: string, opacity: number) => void;
  mapType: MapType;
  isFocused?: boolean;
}

const ToolPaletteBracket = ({ position }: ToolPaletteBracketProps): VNode => {
  return (
    <svg
      className={`dmt-tool-palette-bracket dmt-tool-palette-bracket-${position}`}
      viewBox="-5 -5 25 25"
    >
      <defs>
        <filter id={`palette-bracket-glow-${position}`}>
          <feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      <path
        d="M 0 15 L 0 0 L 15 0"
        stroke="#c4a57b"
        strokeWidth="1.5"
        fill="none"
        filter={`url(#palette-bracket-glow-${position})`}
      />
      <path
        d="M -2.5 18 L -2.5 -2.5 L 18 -2.5"
        stroke="rgba(255, 255, 255, 0.4)"
        strokeWidth="0.8"
        fill="none"
      />
      <line
        x1="-4" y1="7" x2="0" y2="7"
        stroke="#c4a57b"
        strokeWidth="1.5"
      />
      <line
        x1="7" y1="-4" x2="7" y2="0"
        stroke="#c4a57b"
        strokeWidth="1.5"
      />
    </svg>
  );
};

const SubMenuFlyout = ({ subTools, currentSubTool, onSelect, onClose }: SubMenuFlyoutProps): VNode => {
  return (
    <div className="dmt-subtool-menu">
      {subTools.map(subTool => (
        <button
          key={subTool.id}
          className={`dmt-subtool-option interactive-child ${currentSubTool === subTool.id ? 'dmt-subtool-option-active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(subTool.id);
            onClose();
          }}
          title={titleWithShortcut(subTool.title, subTool.actionId, subTool.shortcut)}
        >
          <Icon icon={subTool.icon} />
          <span>{subTool.label}</span>
        </button>
      ))}
    </div>
  );
};

const ToolButtonWithSubMenu = ({
  toolGroup,
  currentTool,
  currentSubTool,
  isSubMenuOpen,
  onToolSelect,
  onSubToolSelect,
  onSubMenuOpen,
  onSubMenuClose,
  mapType
}: ToolButtonWithSubMenuProps): VNode | null => {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const LONG_PRESS_DURATION = 300;

  // Hide entire group if it's map-type-restricted
  if (toolGroup.hexOnly === true && mapType !== 'hex') return null;

  const visibleSubTools = toolGroup.subTools.filter(st =>
    (mapType !== 'hex' || st.gridOnly !== true) &&
    (mapType !== 'grid' || st.hexOnly !== true)
  );

  if (visibleSubTools.length === 0) return null;

  const currentSubToolDef = visibleSubTools.find(st => st.id === currentSubTool) || visibleSubTools[0];
  const isActive = visibleSubTools.some(st => st.id === currentTool);
  const hasMultipleSubTools = visibleSubTools.length > 1;

  const handlePointerDown = (): void => {
    if (!hasMultipleSubTools) return;

    longPressTimer.current = setTimeout(() => {
      onSubMenuOpen(toolGroup.id);
      longPressTimer.current = null;
    }, LONG_PRESS_DURATION);
  };

  const handlePointerUp = (): void => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
      onToolSelect(currentSubToolDef.id);
    } else if (!hasMultipleSubTools) {
      onToolSelect(currentSubToolDef.id);
    }
  };

  const handlePointerLeave = (): void => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleContextMenu = (e: JSX.TargetedMouseEvent<HTMLButtonElement>): void => {
    if (!hasMultipleSubTools) return;

    e.preventDefault();
    e.stopPropagation();
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    onSubMenuOpen(toolGroup.id);
  };

  const handleSubToolSelect = (subToolId: ToolId): void => {
    onSubToolSelect(toolGroup.id, subToolId);
    onToolSelect(subToolId);
  };

  return (
    <div className="dmt-tool-btn-container" style={{ position: 'relative', display: 'inline-block' }}>
      <button
        className={`dmt-tool-btn interactive-child ${isActive ? 'dmt-tool-btn-active' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onContextMenu={handleContextMenu}
        title={titleWithShortcut(currentSubToolDef.title, currentSubToolDef.actionId ?? toolGroup.actionId, currentSubToolDef.shortcut ?? toolGroup.shortcut)}
      >
        <Icon icon={currentSubToolDef?.icon} />
        {hasMultipleSubTools && (
          <span className="dmt-subtool-indicator interactive-child">▼</span>
        )}
      </button>

      {isSubMenuOpen && hasMultipleSubTools && (
        <SubMenuFlyout
          subTools={visibleSubTools}
          currentSubTool={currentSubTool}
          onSelect={handleSubToolSelect}
          onClose={onSubMenuClose}
        />
      )}
    </div>
  );
};

// ============================================================================
// TOOL CONFIGURATION (module-level, single source of truth)
// ============================================================================

const toolGroups: ToolGroup[] = [
  {
    id: 'select',
    shortcut: 's',
    actionId: 'selectTool',
    subTools: [
      { id: 'select' as ToolId, label: 'Click Select', title: 'Select/Move', icon: 'lucide-hand' },
      { id: 'areaSelect' as ToolId, label: 'Area Select', title: 'Area Select (click two corners)', icon: 'lucide-box-select' }
    ]
  },
  {
    id: 'draw',
    shortcut: 'd',
    actionId: 'drawTool',
    subTools: [
      { id: 'draw' as ToolId, label: 'Paint Cells', title: 'Draw (fill cells)', icon: 'lucide-paintbrush' },
      { id: 'segmentDraw' as ToolId, label: 'Paint Segments', title: 'Paint Segments (partial cells)', icon: 'lucide-triangle', gridOnly: true },
      { id: 'edgeDraw' as ToolId, label: 'Paint Edges', title: 'Paint Edges (grid lines)', icon: 'lucide-pencil-ruler', gridOnly: true },
      { id: 'freehand' as ToolId, label: 'Freehand Draw', title: 'Freehand Draw', icon: 'lucide-pen-tool', shortcut: 'f', actionId: 'freehandTool' }
    ]
  },
  {
    id: 'fill',
    gridOnly: true,
    subTools: [
      { id: 'rectangle' as ToolId, label: 'Fill Rectangle', title: 'Rectangle (click two corners)', icon: 'lucide-square', gridOnly: true },
      { id: 'circle' as ToolId, label: 'Fill Circle', title: 'Circle (click edge, then center)', icon: 'lucide-circle', gridOnly: true },
      { id: 'diagonalFill' as ToolId, label: 'Diagonal Fill', title: 'Fill diagonal gaps (click two corners)', icon: 'lucide-slash', gridOnly: true }
    ]
  },
  {
    id: 'erase',
    shortcut: 'e',
    actionId: 'eraseTool',
    subTools: [
      { id: 'erase' as ToolId, label: 'Erase', title: 'Erase (remove text/objects/cells/edges)', icon: 'lucide-eraser' },
      { id: 'clearArea' as ToolId, label: 'Clear Area', title: 'Clear Area (click two corners to erase)', icon: 'lucide-square-x', gridOnly: true }
    ]
  },
  {
    id: 'region',
    hexOnly: true,
    subTools: [
      { id: 'regionPaint' as ToolId, label: 'Paint Region', title: 'Paint hexes into a region', icon: 'lucide-map' },
      { id: 'regionBoundary' as ToolId, label: 'Draw Boundary', title: 'Draw region boundary polygon', icon: 'lucide-pentagon' }
    ]
  },
];

const simpleTools: SimpleTool[] = [
  { id: 'edgeLine' as ToolId, title: 'Paint Line (click two points)', icon: 'lucide-git-commit-horizontal', gridOnly: true },
  { id: 'addObject' as ToolId, title: 'Add Object (select from sidebar)', icon: 'lucide-map-pin-plus' },
  { id: 'addNote' as ToolId, title: 'Place Note Pin', icon: 'lucide-pin', shortcut: 'n', actionId: 'notePinTool' },
  { id: 'addText' as ToolId, title: 'Add Text Label', icon: 'lucide-type' },
  { id: 'outline' as ToolId, title: 'Draw Outline', icon: 'lucide-spline', hexOnly: true },
  { id: 'shape' as ToolId, title: 'Place Shape Overlay', icon: 'lucide-shapes' },
  { id: 'measure' as ToolId, title: 'Measure Distance', icon: 'lucide-ruler', shortcut: 'm', actionId: 'measureTool' },
  { id: 'tilePaint' as ToolId, title: 'Place Tile (select from tile browser)', icon: 'lucide-image-plus', hexOnly: true }
];

// Derive DEFAULT shortcut map from tool config: key -> { group } or { tool }
const DEFAULT_SHORTCUT_MAP: Record<string, { group?: keyof SubToolSelections; tool?: ToolId }> = {};
for (const group of toolGroups) {
  if (group.shortcut != null && group.shortcut !== '') {
    DEFAULT_SHORTCUT_MAP[group.shortcut] = { group: group.id as keyof SubToolSelections };
  }
  for (const sub of group.subTools) {
    if (sub.shortcut != null && sub.shortcut !== '') {
      DEFAULT_SHORTCUT_MAP[sub.shortcut] = { tool: sub.id };
    }
  }
}
for (const tool of simpleTools) {
  if (tool.shortcut != null && tool.shortcut !== '') {
    DEFAULT_SHORTCUT_MAP[tool.shortcut] = { tool: tool.id };
  }
}
DEFAULT_SHORTCUT_MAP['v'] = { group: 'select' };

function getShortcutKey(actionId?: string, defaultKey?: string): string | null {
  if (actionId == null || actionId === '') return defaultKey ?? null;
  const shortcuts = getSettings()?.keyboardShortcuts;
  return shortcuts?.[actionId] ?? defaultKey ?? null;
}

function titleWithShortcut(title: string, actionId?: string, defaultKey?: string): string {
  const key = getShortcutKey(actionId, defaultKey);
  return key != null && key !== '' ? title + ' (' + key.toUpperCase() + ')' : title;
}

// Derive initial sub-tool selections from first sub-tool in each group
const INITIAL_SUB_TOOL_SELECTIONS: SubToolSelections = Object.fromEntries(
  toolGroups.map(g => [g.id, g.subTools[0].id])
) as unknown as SubToolSelections;

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const ToolPalette = ({
  currentTool,
  onToolChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  selectedColor,
  onColorChange,
  selectedOpacity = 1,
  onOpacityChange,
  isColorPickerOpen,
  onColorPickerOpenChange,
  customColors,
  paletteColorOpacityOverrides = {},
  onAddCustomColor,
  onDeleteCustomColor,
  onUpdateColorOpacity,
  mapType,
  isFocused = false
}: ToolPaletteProps): VNode => {
  const colorBtnRef = useRef<HTMLButtonElement>(null);
  const pendingCustomColorRef = useRef<HexColor | null>(null);

  const [openSubMenu, setOpenSubMenu] = useState<string | null>(null);
  const [subToolSelections, setSubToolSelections] = useState<SubToolSelections>(INITIAL_SUB_TOOL_SELECTIONS);

  useEffect((): (() => void) | undefined => {
    if (!isFocused) return undefined;

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key.toLowerCase();
      const shortcuts = getSettings()?.keyboardShortcuts;

      if (shortcuts != null) {
        for (const group of toolGroups) {
          if (group.actionId != null && group.actionId !== '' && shortcuts[group.actionId]?.toLowerCase() === key) {
            onToolChange(subToolSelections[group.id as keyof SubToolSelections] ?? group.id as ToolId);
            e.preventDefault();
            return;
          }
          for (const sub of group.subTools) {
            if (sub.actionId != null && sub.actionId !== '' && shortcuts[sub.actionId]?.toLowerCase() === key) {
              onToolChange(sub.id);
              e.preventDefault();
              return;
            }
          }
        }
        for (const tool of simpleTools) {
          if (tool.actionId != null && tool.actionId !== '' && shortcuts[tool.actionId]?.toLowerCase() === key) {
            onToolChange(tool.id);
            e.preventDefault();
            return;
          }
        }
      }

      const shortcut = DEFAULT_SHORTCUT_MAP[key];
      if (shortcut == null) return;
      const toolId = shortcut.group != null
        ? (subToolSelections[shortcut.group] ?? shortcut.group as ToolId)
        : shortcut.tool ?? currentTool;
      onToolChange(toolId);
      e.preventDefault();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onToolChange, isFocused, subToolSelections]);

  const visibleSimpleTools = simpleTools.filter(tool =>
    (mapType !== 'hex' || tool.gridOnly !== true) &&
    (mapType !== 'grid' || tool.hexOnly !== true)
  );

  const handleSubMenuOpen = (groupId: string): void => {
    setOpenSubMenu(openSubMenu === groupId ? null : groupId);
  };

  const handleSubMenuClose = (): void => {
    setOpenSubMenu(null);
  };

  const handleSubToolSelect = (groupId: string, subToolId: ToolId): void => {
    setSubToolSelections(prev => ({
      ...prev,
      [groupId]: subToolId
    }));
  };

  const toggleColorPicker = (e: JSX.TargetedMouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation();
    onColorPickerOpenChange(!isColorPickerOpen);
  };

  const handleColorSelect = (color: HexColor): void => {
    onColorChange(color);
  };

  const handleColorReset = (): void => {
    onColorChange(DEFAULT_COLOR);
    onColorPickerOpenChange(false);
  };

  const handleCloseColorPicker = (): void => {
    onColorPickerOpenChange(false);
  };

  useEffect((): (() => void) | undefined => {
    if (openSubMenu == null || openSubMenu === '') return undefined;

    const handleClickOutside = (e: MouseEvent | TouchEvent): void => {
      const target = e.target as Element;
      const menuElement = target.closest('.dmt-subtool-menu');
      const buttonElement = target.closest('.dmt-tool-btn-container');

      if (!menuElement && !buttonElement) {
        handleSubMenuClose();
      }
    };

    setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside, { passive: true });
    }, 10);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [openSubMenu]);

  useEffect((): (() => void) | undefined => {
    if (!isColorPickerOpen) return undefined;

    const handleClickOutside = (e: MouseEvent | TouchEvent): void => {
      const target = e.target as Element;
      const pickerElement = target.closest('.dmt-color-picker');
      const buttonElement = target.closest('.dmt-color-tool-btn');

      if (!pickerElement && !buttonElement) {
        if (pendingCustomColorRef.current != null && pendingCustomColorRef.current !== '') {
          const colorValue = pendingCustomColorRef.current;
          onAddCustomColor?.(colorValue);
          onColorChange(colorValue);
          pendingCustomColorRef.current = null;
        }
        handleCloseColorPicker();
      }
    };

    setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside, { passive: true });
    }, 10);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isColorPickerOpen]);

  return (
    <div className="dmt-tool-palette">
      <ToolPaletteBracket position="tl" />
      <ToolPaletteBracket position="tr" />
      <ToolPaletteBracket position="bl" />
      <ToolPaletteBracket position="br" />

      {toolGroups.slice(0, 2).map(group => (
        <ToolButtonWithSubMenu
          key={group.id}
          toolGroup={group}
          currentTool={currentTool}
          currentSubTool={subToolSelections[group.id as keyof SubToolSelections]}
          isSubMenuOpen={openSubMenu === group.id}
          onToolSelect={onToolChange}
          onSubToolSelect={handleSubToolSelect}
          onSubMenuOpen={handleSubMenuOpen}
          onSubMenuClose={handleSubMenuClose}
          mapType={mapType}
        />
      ))}

      <div style={{ position: 'relative', display: 'inline-block' }}>
        <button
          ref={colorBtnRef}
          className={`dmt-tool-btn dmt-color-tool-btn interactive-child ${isColorPickerOpen ? 'dmt-tool-btn-active' : ''}`}
          onClick={toggleColorPicker}
          title="Choose color"
          style={{
            borderBottom: `4px solid ${selectedColor ?? DEFAULT_COLOR}`
          }}
        >
          <Icon icon="lucide-palette" />
        </button>

        <ColorPicker
          isOpen={isColorPickerOpen}
          selectedColor={selectedColor}
          onColorSelect={handleColorSelect}
          onClose={handleCloseColorPicker}
          onReset={handleColorReset}
          customColors={customColors}
          paletteColorOpacityOverrides={paletteColorOpacityOverrides}
          onAddCustomColor={onAddCustomColor}
          onDeleteCustomColor={onDeleteCustomColor}
          onUpdateColorOpacity={onUpdateColorOpacity}
          position={null}
          pendingCustomColorRef={pendingCustomColorRef}
          title="Color"
          opacity={selectedOpacity}
          onOpacityChange={onOpacityChange}
        />
      </div>

      {toolGroups.slice(2).map(group => {
        if (group.gridOnly === true && mapType === 'hex') return null;
        if (group.hexOnly === true && mapType !== 'hex') return null;
        return (
          <ToolButtonWithSubMenu
            key={group.id}
            toolGroup={group}
            currentTool={currentTool}
            currentSubTool={subToolSelections[group.id as keyof SubToolSelections]}
            isSubMenuOpen={openSubMenu === group.id}
            onToolSelect={onToolChange}
            onSubToolSelect={handleSubToolSelect}
            onSubMenuOpen={handleSubMenuOpen}
            onSubMenuClose={handleSubMenuClose}
            mapType={mapType}
          />
        );
      })}

      {visibleSimpleTools.map(tool => (
        <button
          key={tool.id}
          className={`dmt-tool-btn interactive-child ${currentTool === tool.id ? 'dmt-tool-btn-active' : ''}`}
          onClick={() => onToolChange(tool.id)}
          title={titleWithShortcut(tool.title, tool.actionId, tool.shortcut)}
        >
          <Icon icon={tool.icon} />
        </button>
      ))}

      <div className="dmt-history-controls">
        <button
          className="dmt-history-btn interactive-child"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo"
        >
          <Icon icon="lucide-undo" />
        </button>
        <button
          className="dmt-history-btn interactive-child"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo"
        >
          <Icon icon="lucide-redo" />
        </button>
      </div>
    </div>
  );
};

export { ToolPalette };
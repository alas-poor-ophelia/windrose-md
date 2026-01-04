/**
 * ToolPalette.tsx
 *
 * Tool selection palette with sub-tool menus, history controls, and color picker.
 */

import type { JSX } from 'preact';
import type { HexColor } from '#types/core/common.types';
import type { MapType } from '#types/core/map.types';
import type { ToolId } from '#types/tools/tool.types';
import type { CustomColor, ColorOpacityOverrides } from './ColorPicker.tsx';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { DEFAULT_COLOR } = await requireModuleByName("colorOperations.ts");
const { ColorPicker } = await requireModuleByName("ColorPicker.tsx");

/** Sub-tool definition */
interface SubToolDef {
  id: ToolId;
  label: string;
  title: string;
  icon: string;
  gridOnly?: boolean;
}

/** Tool group with sub-tools */
interface ToolGroup {
  id: string;
  subTools: SubToolDef[];
}

/** Simple tool (no sub-menu) */
interface SimpleTool {
  id: ToolId;
  title: string;
  icon: string;
  gridOnly?: boolean;
}

/** Bracket position */
type BracketPosition = 'tl' | 'tr' | 'bl' | 'br';

/** Sub-tool selections state */
interface SubToolSelections {
  select: ToolId;
  draw: ToolId;
  rectangle: ToolId;
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

const ToolPaletteBracket = ({ position }: ToolPaletteBracketProps): React.ReactElement => {
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

const SubMenuFlyout = ({ subTools, currentSubTool, onSelect, onClose }: SubMenuFlyoutProps): React.ReactElement => {
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
          title={subTool.title}
        >
          <dc.Icon icon={subTool.icon} />
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
}: ToolButtonWithSubMenuProps): React.ReactElement | null => {
  const longPressTimer = dc.useRef<ReturnType<typeof setTimeout> | null>(null);
  const LONG_PRESS_DURATION = 300;

  const visibleSubTools = toolGroup.subTools.filter(st =>
    mapType !== 'hex' || !st.gridOnly
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
        title={currentSubToolDef?.title}
      >
        <dc.Icon icon={currentSubToolDef?.icon} />
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
}: ToolPaletteProps): React.ReactElement => {
  const colorBtnRef = dc.useRef<HTMLButtonElement>(null);
  const pendingCustomColorRef = dc.useRef<HexColor | null>(null);

  const [openSubMenu, setOpenSubMenu] = dc.useState<string | null>(null);
  const [subToolSelections, setSubToolSelections] = dc.useState<SubToolSelections>({
    select: 'select' as ToolId,
    draw: 'draw' as ToolId,
    rectangle: 'rectangle' as ToolId
  });

  dc.useEffect(() => {
    if (!isFocused) return;

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key.toLowerCase();

      switch (key) {
        case 'd':
          onToolChange('draw' as ToolId);
          break;
        case 'e':
          onToolChange('erase' as ToolId);
          break;
        case 's':
        case 'v':
          onToolChange(subToolSelections.select || 'select' as ToolId);
          break;
        case 'm':
          onToolChange('measure' as ToolId);
          break;
        default:
          return;
      }

      e.preventDefault();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onToolChange, isFocused, subToolSelections]);

  const toolGroups: ToolGroup[] = [
    {
      id: 'select',
      subTools: [
        { id: 'select' as ToolId, label: 'Click Select', title: 'Select/Move (S)', icon: 'lucide-hand' },
        { id: 'areaSelect' as ToolId, label: 'Area Select', title: 'Area Select (click two corners)', icon: 'lucide-box-select' }
      ]
    },
    {
      id: 'draw',
      subTools: [
        { id: 'draw' as ToolId, label: 'Paint Cells', title: 'Draw (fill cells) (D)', icon: 'lucide-paintbrush' },
        { id: 'segmentDraw' as ToolId, label: 'Paint Segments', title: 'Paint Segments (partial cells)', icon: 'lucide-triangle', gridOnly: true },
        { id: 'edgeDraw' as ToolId, label: 'Paint Edges', title: 'Paint Edges (grid lines)', icon: 'lucide-pencil-ruler', gridOnly: true }
      ]
    },
    {
      id: 'rectangle',
      subTools: [
        { id: 'rectangle' as ToolId, label: 'Fill Rectangle', title: 'Rectangle (click two corners)', icon: 'lucide-square', gridOnly: true },
        { id: 'edgeLine' as ToolId, label: 'Edge Line', title: 'Edge Line (click two points)', icon: 'lucide-git-commit-horizontal', gridOnly: true },
        { id: 'diagonalFill' as ToolId, label: 'Diagonal Fill', title: 'Fill diagonal gaps (click two corners)', icon: 'lucide-slash', gridOnly: true }
      ]
    }
  ];

  const simpleTools: SimpleTool[] = [
    { id: 'erase' as ToolId, title: 'Erase (remove text/objects/cells/edges) (E)', icon: 'lucide-eraser' },
    { id: 'circle' as ToolId, title: 'Circle (click edge, then center)', icon: 'lucide-circle', gridOnly: true },
    { id: 'clearArea' as ToolId, title: 'Clear Area (click two corners to erase)', icon: 'lucide-square-x', gridOnly: true },
    { id: 'addObject' as ToolId, title: 'Add Object (select from sidebar)', icon: 'lucide-map-pin-plus' },
    { id: 'addText' as ToolId, title: 'Add Text Label', icon: 'lucide-type' },
    { id: 'measure' as ToolId, title: 'Measure Distance (M)', icon: 'lucide-ruler' }
  ];

  const visibleSimpleTools = mapType === 'hex'
    ? simpleTools.filter(tool => !tool.gridOnly)
    : simpleTools;

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

  dc.useEffect(() => {
    if (!openSubMenu) return;

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
      document.addEventListener('touchstart', handleClickOutside);
    }, 10);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [openSubMenu]);

  dc.useEffect(() => {
    if (!isColorPickerOpen) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent): void => {
      const target = e.target as Element;
      const pickerElement = target.closest('.dmt-color-picker');
      const buttonElement = target.closest('.dmt-color-tool-btn');

      if (!pickerElement && !buttonElement) {
        if (pendingCustomColorRef.current) {
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
      document.addEventListener('touchstart', handleClickOutside);
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

      <ToolButtonWithSubMenu
        toolGroup={toolGroups[0]}
        currentTool={currentTool}
        currentSubTool={subToolSelections.select}
        isSubMenuOpen={openSubMenu === 'select'}
        onToolSelect={onToolChange}
        onSubToolSelect={handleSubToolSelect}
        onSubMenuOpen={handleSubMenuOpen}
        onSubMenuClose={handleSubMenuClose}
        mapType={mapType}
      />

      <ToolButtonWithSubMenu
        toolGroup={toolGroups[1]}
        currentTool={currentTool}
        currentSubTool={subToolSelections.draw}
        isSubMenuOpen={openSubMenu === 'draw'}
        onToolSelect={onToolChange}
        onSubToolSelect={handleSubToolSelect}
        onSubMenuOpen={handleSubMenuOpen}
        onSubMenuClose={handleSubMenuClose}
        mapType={mapType}
      />

      <div style={{ position: 'relative', display: 'inline-block' }}>
        <button
          ref={colorBtnRef}
          className={`dmt-tool-btn dmt-color-tool-btn interactive-child ${isColorPickerOpen ? 'dmt-tool-btn-active' : ''}`}
          onClick={toggleColorPicker}
          title="Choose color"
          style={{
            borderBottom: `4px solid ${selectedColor || DEFAULT_COLOR}`
          }}
        >
          <dc.Icon icon="lucide-palette" />
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

      <button
        className={`dmt-tool-btn interactive-child ${currentTool === 'erase' ? 'dmt-tool-btn-active' : ''}`}
        onClick={() => onToolChange('erase' as ToolId)}
        title="Erase (remove text/objects/cells/edges)"
      >
        <dc.Icon icon="lucide-eraser" />
      </button>

      {mapType !== 'hex' && (
        <ToolButtonWithSubMenu
          toolGroup={toolGroups[2]}
          currentTool={currentTool}
          currentSubTool={subToolSelections.rectangle}
          isSubMenuOpen={openSubMenu === 'rectangle'}
          onToolSelect={onToolChange}
          onSubToolSelect={handleSubToolSelect}
          onSubMenuOpen={handleSubMenuOpen}
          onSubMenuClose={handleSubMenuClose}
          mapType={mapType}
        />
      )}

      {visibleSimpleTools.filter(t => t.id !== 'erase').map(tool => (
        <button
          key={tool.id}
          className={`dmt-tool-btn interactive-child ${currentTool === tool.id ? 'dmt-tool-btn-active' : ''}`}
          onClick={() => onToolChange(tool.id)}
          title={tool.title}
        >
          <dc.Icon icon={tool.icon} />
        </button>
      ))}

      <div className="dmt-history-controls">
        <button
          className="dmt-history-btn interactive-child"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo"
        >
          <dc.Icon icon="lucide-undo" />
        </button>
        <button
          className="dmt-history-btn interactive-child"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo"
        >
          <dc.Icon icon="lucide-redo" />
        </button>
      </div>
    </div>
  );
};

return { ToolPalette };

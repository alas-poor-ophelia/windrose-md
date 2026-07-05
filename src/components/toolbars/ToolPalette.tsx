/**
 * ToolPalette.tsx
 *
 * Tool selection palette with sub-tool menus, history controls, and color picker.
 */

import type { ComponentChildren, TargetedMouseEvent, VNode } from 'preact';
import type { MapType } from '#types/core/map.types';
import type { ToolId } from '#types/tools/tool.types';
import type { WindroseFeature } from '#types/settings/settings.types';

import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { CornerBrackets } from '../shared/CornerBrackets';
import { getSettings } from '../../core/settingsAccessor';
import { useFeatureFlags } from '../../hooks/state/useFeatureFlags';
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
  feature?: WindroseFeature;
}

/** Tool group with sub-tools */
interface ToolGroup {
  id: keyof SubToolSelections;
  shortcut?: string;
  actionId?: string;
  subTools: SubToolDef[];
  gridOnly?: boolean;
  hexOnly?: boolean;
  feature?: WindroseFeature;
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
  feature?: WindroseFeature;
}

/** Sub-tool selections state */
interface SubToolSelections {
  select: ToolId;
  draw: ToolId;
  fill: ToolId;
  erase: ToolId;
  region: ToolId;
}

/** Props for SubMenuFlyout */
interface SubMenuFlyoutProps {
  subTools: SubToolDef[];
  currentSubTool: ToolId;
  onSelect: (id: ToolId) => void;
  onClose: () => void;
  /**
   * Viewport-anchored position. In the vertical rail the flyout must be
   * `position: fixed` to escape the rail's `overflow-y: auto` clip (which forces
   * `overflow-x: auto`); null = horizontal mode, keep the CSS `absolute` layout.
   */
  fixedAnchor?: { left: number; top: number } | null;
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
  /** Vertical rail: flyouts open fixed-positioned to escape the rail's overflow clip. */
  vertical?: boolean;
}

/** Props for ToolPalette */
export interface ToolPaletteProps {
  currentTool: ToolId;
  onToolChange: (tool: ToolId) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  mapType: MapType;
  isFocused?: boolean;
  /** Dock/undock button rendered at the end of the toolbar */
  dockButton?: ComponentChildren;
  /** Full-pane vertical layout: 54px left bar, right-opening flyouts */
  vertical?: boolean;
}

/**
 * Offset of the nearest ancestor that acts as the containing block for a
 * `position: fixed` child — an element with transform/filter/perspective/will-change
 * or `contain`. Obsidian workspace leaves set `contain: strict`, so a fixed flyout is
 * positioned relative to the leaf, not the viewport; its rect must be subtracted from
 * viewport coords. Returns {0,0} when the viewport is the containing block.
 */
function fixedContainingOffset(el: HTMLElement): { left: number; top: number } {
  let p: HTMLElement | null = el.parentElement;
  while (p != null && p.tagName !== 'HTML' && p.tagName !== 'BODY') {
    const cs = getComputedStyle(p);
    const establishesCB =
      cs.transform !== 'none' ||
      cs.filter !== 'none' ||
      cs.perspective !== 'none' ||
      cs.willChange === 'transform' || cs.willChange === 'filter' || cs.willChange === 'perspective' ||
      cs.contain === 'strict' || cs.contain === 'content' ||
      cs.contain.includes('layout') || cs.contain.includes('paint');
    if (establishesCB) {
      const r = p.getBoundingClientRect();
      return { left: r.left, top: r.top };
    }
    p = p.parentElement;
  }
  return { left: 0, top: 0 };
}

const SubMenuFlyout = ({ subTools, currentSubTool, onSelect, onClose, fixedAnchor }: SubMenuFlyoutProps): VNode => {
  // Fixed positioning escapes the vertical rail's overflow clip; left/top come from
  // the trigger button rect, and the CSS margin-left + translateY(-50%) still apply.
  const style = fixedAnchor != null
    ? { position: 'fixed' as const, left: `${fixedAnchor.left}px`, top: `${fixedAnchor.top}px` }
    : undefined;
  return (
    <div className="windrose-subtool-menu" style={style}>
      {subTools.map(subTool => (
        <button
          key={subTool.id}
          className={`windrose-subtool-option interactive-child ${currentSubTool === subTool.id ? 'windrose-subtool-option-active' : ''}`}
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
  mapType,
  vertical = false
}: ToolButtonWithSubMenuProps): VNode | null => {
  const longPressTimer = useRef<number | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const featureFlags = useFeatureFlags();
  const LONG_PRESS_DURATION = 300;

  // In the vertical rail the flyout opens `position: fixed` to escape the rail's
  // overflow clip; capture the trigger button's viewport rect when the menu opens.
  const [fixedAnchor, setFixedAnchor] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = buttonRef.current;
    if (!vertical || !isSubMenuOpen || el == null) { setFixedAnchor(null); return; }
    const r = el.getBoundingClientRect();
    const off = fixedContainingOffset(el);
    setFixedAnchor({ left: r.right - off.left, top: r.top + r.height / 2 - off.top });
  }, [vertical, isSubMenuOpen]);

  // Hide entire group if it's map-type-restricted or feature-disabled
  if (toolGroup.hexOnly === true && mapType !== 'hex') return null;
  if (toolGroup.feature != null && !featureFlags[toolGroup.feature]) return null;

  const visibleSubTools = toolGroup.subTools.filter(st =>
    (mapType !== 'hex' || st.gridOnly !== true) &&
    (mapType !== 'grid' || st.hexOnly !== true) &&
    (st.feature == null || featureFlags[st.feature])
  );

  if (visibleSubTools.length === 0) return null;

  const currentSubToolDef = visibleSubTools.find(st => st.id === currentSubTool) ?? visibleSubTools[0];
  const isActive = visibleSubTools.some(st => st.id === currentTool);
  const hasMultipleSubTools = visibleSubTools.length > 1;

  const handlePointerDown = (): void => {
    if (!hasMultipleSubTools) return;

    longPressTimer.current = window.setTimeout(() => {
      onSubMenuOpen(toolGroup.id);
      longPressTimer.current = null;
    }, LONG_PRESS_DURATION);
  };

  const handlePointerUp = (): void => {
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
      onToolSelect(currentSubToolDef.id);
    } else if (!hasMultipleSubTools) {
      onToolSelect(currentSubToolDef.id);
    }
  };

  const handlePointerLeave = (): void => {
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleContextMenu = (e: TargetedMouseEvent<HTMLButtonElement>): void => {
    if (!hasMultipleSubTools) return;

    e.preventDefault();
    e.stopPropagation();
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    onSubMenuOpen(toolGroup.id);
  };

  const handleSubToolSelect = (subToolId: ToolId): void => {
    onSubToolSelect(toolGroup.id, subToolId);
    onToolSelect(subToolId);
  };

  return (
    <div className="windrose-tool-btn-container">
      <button
        ref={buttonRef}
        className={`windrose-tool-btn interactive-child ${isActive ? 'windrose-tool-btn-active' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onContextMenu={handleContextMenu}
        title={titleWithShortcut(currentSubToolDef.title, currentSubToolDef.actionId ?? toolGroup.actionId, currentSubToolDef.shortcut ?? toolGroup.shortcut)}
      >
        <Icon icon={currentSubToolDef?.icon} />
        {hasMultipleSubTools && (
          <span className="windrose-subtool-indicator interactive-child">▼</span>
        )}
      </button>

      {isSubMenuOpen && hasMultipleSubTools && (
        <SubMenuFlyout
          subTools={visibleSubTools}
          currentSubTool={currentSubTool}
          onSelect={handleSubToolSelect}
          onClose={onSubMenuClose}
          fixedAnchor={fixedAnchor}
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
      { id: 'select', label: 'Click Select', title: 'Select/Move', icon: 'lucide-hand' },
      { id: 'areaSelect', label: 'Area Select', title: 'Area Select (click two corners)', icon: 'lucide-box-select' }
    ]
  },
  {
    id: 'draw',
    shortcut: 'd',
    actionId: 'drawTool',
    subTools: [
      { id: 'draw', label: 'Paint Cells', title: 'Draw (fill cells)', icon: 'lucide-paintbrush' },
      { id: 'segmentDraw', label: 'Paint Segments', title: 'Paint Segments (partial cells)', icon: 'lucide-triangle', gridOnly: true },
      { id: 'edgeDraw', label: 'Paint Edges', title: 'Paint Edges (grid lines)', icon: 'lucide-pencil-ruler', gridOnly: true },
      { id: 'freehand', label: 'Freehand Draw', title: 'Freehand Draw', icon: 'lucide-pen-tool', shortcut: 'f', actionId: 'freehandTool' }
    ]
  },
  {
    id: 'fill',
    gridOnly: true,
    subTools: [
      { id: 'rectangle', label: 'Fill Rectangle', title: 'Rectangle (click two corners)', icon: 'lucide-square', gridOnly: true },
      { id: 'circle', label: 'Fill Circle', title: 'Circle (click edge, then center)', icon: 'lucide-circle', gridOnly: true },
      { id: 'diagonalFill', label: 'Diagonal Fill', title: 'Fill diagonal gaps (click two corners)', icon: 'lucide-slash', gridOnly: true }
    ]
  },
  {
    id: 'erase',
    shortcut: 'e',
    actionId: 'eraseTool',
    subTools: [
      { id: 'erase', label: 'Erase', title: 'Erase (remove text/objects/cells/edges)', icon: 'lucide-eraser' },
      { id: 'clearArea', label: 'Clear Area', title: 'Clear Area (click two corners to erase)', icon: 'lucide-square-x', gridOnly: true }
    ]
  },
  {
    id: 'region',
    hexOnly: true,
    feature: 'regions',
    subTools: [
      { id: 'regionPaint', label: 'Paint Region', title: 'Paint hexes into a region', icon: 'lucide-map' },
      { id: 'regionBoundary', label: 'Draw Boundary', title: 'Draw region boundary polygon', icon: 'lucide-pentagon' }
    ]
  },
];

const simpleTools: SimpleTool[] = [
  { id: 'edgeLine', title: 'Paint Line (click two points)', icon: 'lucide-git-commit-horizontal', gridOnly: true },
  { id: 'addObject', title: 'Add Object (select from sidebar)', icon: 'lucide-map-pin-plus' },
  { id: 'addNote', title: 'Place Note Pin', icon: 'lucide-pin', shortcut: 'n', actionId: 'notePinTool', feature: 'notePins' },
  { id: 'addText', title: 'Add Text Label', icon: 'lucide-type' },
  { id: 'outline', title: 'Draw Outline', icon: 'lucide-spline', hexOnly: true, feature: 'outlines' },
  { id: 'shape', title: 'Place Shape Overlay', icon: 'lucide-shapes', feature: 'shapeOverlays' },
  { id: 'measure', title: 'Measure Distance', icon: 'lucide-ruler', shortcut: 'm', actionId: 'measureTool', feature: 'measurement' },
  { id: 'tilePaint', title: 'Place Tile (select from tile browser)', icon: 'lucide-image-plus', feature: 'tiles' }
];

// ToolId → gating feature, derived from the tool config (used to guard
// keyboard-shortcut activation of hidden tools).
const TOOL_FEATURE_MAP: Partial<Record<ToolId, WindroseFeature>> = {};
for (const group of toolGroups) {
  for (const sub of group.subTools) {
    const feature = sub.feature ?? group.feature;
    if (feature != null) TOOL_FEATURE_MAP[sub.id] = feature;
  }
}
for (const tool of simpleTools) {
  if (tool.feature != null) TOOL_FEATURE_MAP[tool.id] = tool.feature;
}

function isToolIdEnabled(toolId: ToolId, flags: Record<WindroseFeature, boolean>): boolean {
  const feature = TOOL_FEATURE_MAP[toolId];
  return feature == null || flags[feature];
}

// Derive DEFAULT shortcut map from tool config: key -> { group } or { tool }
const DEFAULT_SHORTCUT_MAP: Record<string, { group?: keyof SubToolSelections; tool?: ToolId }> = {};
for (const group of toolGroups) {
  if (group.shortcut != null && group.shortcut !== '') {
    DEFAULT_SHORTCUT_MAP[group.shortcut] = { group: group.id };
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
const INITIAL_SUB_TOOL_SELECTIONS: SubToolSelections = {
  select: 'select',
  draw: 'draw',
  fill: 'rectangle',
  erase: 'erase',
  region: 'regionPaint',
};

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
  mapType,
  isFocused = false,
  dockButton,
  vertical = false
}: ToolPaletteProps): VNode => {
  const [openSubMenu, setOpenSubMenu] = useState<string | null>(null);
  const [subToolSelections, setSubToolSelections] = useState<SubToolSelections>(INITIAL_SUB_TOOL_SELECTIONS);
  const featureFlags = useFeatureFlags();

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
            if (!isToolIdEnabled(subToolSelections[group.id], featureFlags)) return;
            onToolChange(subToolSelections[group.id]);
            e.preventDefault();
            return;
          }
          for (const sub of group.subTools) {
            if (sub.actionId != null && sub.actionId !== '' && shortcuts[sub.actionId]?.toLowerCase() === key) {
              if (!isToolIdEnabled(sub.id, featureFlags)) return;
              onToolChange(sub.id);
              e.preventDefault();
              return;
            }
          }
        }
        for (const tool of simpleTools) {
          if (tool.actionId != null && tool.actionId !== '' && shortcuts[tool.actionId]?.toLowerCase() === key) {
            if (!isToolIdEnabled(tool.id, featureFlags)) return;
            onToolChange(tool.id);
            e.preventDefault();
            return;
          }
        }
      }

      const shortcut = DEFAULT_SHORTCUT_MAP[key];
      if (shortcut == null) return;
      const toolId = shortcut.group != null
        ? subToolSelections[shortcut.group]
        : shortcut.tool ?? currentTool;
      if (!isToolIdEnabled(toolId, featureFlags)) return;
      onToolChange(toolId);
      e.preventDefault();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onToolChange, isFocused, subToolSelections, currentTool, featureFlags]);

  const visibleSimpleTools = simpleTools.filter(tool =>
    (mapType !== 'hex' || tool.gridOnly !== true) &&
    (mapType !== 'grid' || tool.hexOnly !== true) &&
    (tool.feature == null || featureFlags[tool.feature])
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

  useEffect((): (() => void) | undefined => {
    if (openSubMenu == null || openSubMenu === '') return undefined;

    const handleClickOutside = (e: MouseEvent | TouchEvent): void => {
      const target = e.target as Element;
      const menuElement = target.closest('.windrose-subtool-menu');
      const buttonElement = target.closest('.windrose-tool-btn-container');

      if (!menuElement && !buttonElement) {
        // Full-pane: the canvas fills the pane and calls stopPropagation on its
        // own mousedown, so a bubble-phase listener never sees the dismissing
        // click. Listen in the CAPTURE phase (fires before the canvas) and
        // swallow the event so the first outside click ONLY closes the menu — it
        // must not also paint/use the tool (matching block mode).
        e.preventDefault();
        e.stopPropagation();
        handleSubMenuClose();
      }
    };

    const timerId = window.setTimeout(() => {
      activeDocument.addEventListener('mousedown', handleClickOutside, true);
      activeDocument.addEventListener('touchstart', handleClickOutside, { capture: true, passive: false });
    }, 10);

    return () => {
      window.clearTimeout(timerId);
      activeDocument.removeEventListener('mousedown', handleClickOutside, true);
      activeDocument.removeEventListener('touchstart', handleClickOutside, true);
    };
  }, [openSubMenu]);


  return (
    <div className={`windrose-tool-palette${vertical ? ' windrose-tool-palette-vertical' : ''}`}>
      <CornerBrackets classPrefix="windrose-tool-palette-bracket" variant="compact" filterId="palette-bracket" />

      {toolGroups.slice(0, 2).map(group => (
        <ToolButtonWithSubMenu
          key={group.id}
          toolGroup={group}
          currentTool={currentTool}
          currentSubTool={subToolSelections[group.id]}
          isSubMenuOpen={openSubMenu === group.id}
          onToolSelect={onToolChange}
          onSubToolSelect={handleSubToolSelect}
          onSubMenuOpen={handleSubMenuOpen}
          onSubMenuClose={handleSubMenuClose}
          mapType={mapType}
          vertical={vertical}
        />
      ))}

      {toolGroups.slice(2).map(group => {
        if (group.gridOnly === true && mapType === 'hex') return null;
        if (group.hexOnly === true && mapType !== 'hex') return null;
        return (
          <ToolButtonWithSubMenu
            key={group.id}
            toolGroup={group}
            currentTool={currentTool}
            currentSubTool={subToolSelections[group.id]}
            isSubMenuOpen={openSubMenu === group.id}
            onToolSelect={onToolChange}
            onSubToolSelect={handleSubToolSelect}
            onSubMenuOpen={handleSubMenuOpen}
            onSubMenuClose={handleSubMenuClose}
            mapType={mapType}
            vertical={vertical}
          />
        );
      })}

      {visibleSimpleTools.map(tool => (
        <button
          key={tool.id}
          className={`windrose-tool-btn interactive-child ${currentTool === tool.id ? 'windrose-tool-btn-active' : ''}`}
          onClick={() => onToolChange(tool.id)}
          title={titleWithShortcut(tool.title, tool.actionId, tool.shortcut)}
        >
          <Icon icon={tool.icon} />
        </button>
      ))}

      <div className="windrose-history-controls">
        <button
          className="windrose-history-btn interactive-child"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo"
        >
          <Icon icon="lucide-undo" />
        </button>
        <button
          className="windrose-history-btn interactive-child"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo"
        >
          <Icon icon="lucide-redo" />
        </button>
      </div>

      {dockButton != null && (
        <>
          <div className="windrose-tool-palette-separator" />
          {dockButton}
        </>
      )}
    </div>
  );
};

export { ToolPalette, isToolIdEnabled };
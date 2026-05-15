/**
 * SelectionActionsOverlay.tsx
 *
 * Unified selection toolbar replacing ObjectSelectionToolbar, TextSelectionToolbar,
 * and MultiSelectToolbar. Renders a bronze-themed card anchored to the selected item(s)
 * with labeled actions in a 2-column grid.
 */

import type { MapData } from '#types/core/map.types';
import type { IGeometry } from '#types/core/geometry.types';
import type { SelectionAction } from '../../hooks/interactions/useSelectionActions.ts';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useToolbarPosition } = await requireModuleByName("useToolbarPosition.ts");
const { openNoteInNewTab } = await requireModuleByName("noteOperations.ts");
const { ColorPicker } = await requireModuleByName("ColorPicker.tsx");
const { getActiveLayer } = await requireModuleByName("layerAccessor.ts");
const { getSelectionBounds } = await requireModuleByName("selectionBounds.ts");
const { isBridgeAvailable, getObsidianModule } = await requireModuleByName("obsidianBridge.ts");
const { SelectionCardFiligree } = await requireModuleByName("SelectionCardFiligree.tsx");

type BracketPosition = 'tl' | 'tr' | 'bl' | 'br';

const CornerBracket = ({ position }: { position: BracketPosition }): React.ReactElement => {
  return (
    <svg
      className={`dmt-selection-card-bracket dmt-selection-card-bracket-${position}`}
      viewBox="-5 -5 25 25"
    >
      <defs>
        <filter id={`sel-bracket-glow-${position}`}>
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
        filter={`url(#sel-bracket-glow-${position})`}
      />
      <path
        d="M -2.5 18 L -2.5 -2.5 L 18 -2.5"
        stroke="rgba(255, 255, 255, 0.4)"
        strokeWidth="0.8"
        fill="none"
      />
    </svg>
  );
};

interface SelectedItem {
  type: 'object' | 'text' | 'notePin' | 'shapeOverlay';
  id: string;
  data?: any;
}

interface SelectionActionsOverlayProps {
  selectedItems: SelectedItem[];
  actions: SelectionAction[];
  mapData: MapData;
  canvasRef: { current: HTMLCanvasElement | null };
  containerRef: { current: HTMLElement | null };
  geometry: IGeometry;
  selectionType: 'object' | 'text' | 'multi' | 'shapeOverlay';

  // Resize slider state
  isResizeMode?: boolean;
  onScaleChange?: (scale: number) => void;

  // Color picker state
  showColorPicker?: boolean;
  currentColor?: string;
  onColorSelect?: (color: string) => void;
  onColorPickerClose?: () => void;
  onColorReset?: () => void;
  customColors?: any[];
  onAddCustomColor?: (color: string) => void;
  onDeleteCustomColor?: (colorId: string) => void;
  pendingCustomColorRef?: { current: string | null };
  colorButtonRef?: { current: HTMLButtonElement | null };

  // Multi-select count
  selectionCount?: number;

  // Player light section
  isPlayer?: boolean;
  lightEnabled?: boolean;
  lightRadius?: number;
  lightColor?: string;
  onLightToggle?: () => void;
  onLightRadiusChange?: (radius: number) => void;
  onLightColorSelect?: (color: string) => void;
  showLightColorPicker?: boolean;
  onLightColorSwatchClick?: () => void;
  onLightColorPickerClose?: () => void;
  lightColorButtonRef?: { current: HTMLButtonElement | null };
  distanceUnit?: string;
}

const ACTION_GROUPS: { id: string; actions: string[] }[] = [
  { id: 'transform', actions: ['rotate', 'resize'] },
  { id: 'content', actions: ['edit', 'label', 'duplicate'] },
  { id: 'links', actions: ['linkNote', 'linkObject', 'followLink', 'removeLink'] },
  { id: 'style', actions: ['color'] },
  { id: 'player', actions: ['playerToggle'] },
  { id: 'danger', actions: ['delete'] }
];

const SelectionActionsOverlay = ({
  selectedItems,
  actions,
  mapData,
  canvasRef,
  containerRef,
  geometry,
  selectionType,
  isResizeMode,
  onScaleChange,
  showColorPicker,
  currentColor,
  onColorSelect,
  onColorPickerClose,
  onColorReset,
  customColors,
  onAddCustomColor,
  onDeleteCustomColor,
  pendingCustomColorRef,
  colorButtonRef,
  selectionCount,
  isPlayer,
  lightEnabled,
  lightRadius,
  lightColor,
  onLightToggle,
  onLightRadiusChange,
  onLightColorSelect,
  showLightColorPicker,
  onLightColorSwatchClick,
  onLightColorPickerClose,
  lightColorButtonRef,
  distanceUnit
}: SelectionActionsOverlayProps): React.ReactElement | null => {

  const isNotePin = selectedItems.length === 1 && selectedItems[0].data?.type === 'note_pin';
  const [linksExpanded, setLinksExpanded] = dc.useState(isNotePin);

  // Context menu via Obsidian Menu API
  dc.useEffect(() => {
    if (!isBridgeAvailable()) return;

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail.handled) return;
      detail.handled = true;
      const { screenX, screenY } = detail;
      const obs = getObsidianModule();
      const MenuClass = obs.Menu as new () => {
        addItem: (cb: (item: any) => void) => any;
        addSeparator: () => any;
        showAtPosition: (pos: { x: number; y: number }) => void;
      };

      const menu = new MenuClass();
      const visibleActions = actions.filter(a => a.visible && !a.disabled);

      let lastGroup: string | null = null;
      for (const action of visibleActions) {
        if (lastGroup && action.group !== lastGroup) {
          menu.addSeparator();
        }
        lastGroup = action.group;

        menu.addItem((item: any) => {
          item.setTitle(action.label);
          item.setIcon(action.icon);
          if (action.id === 'delete') item.setWarning(true);
          item.onClick(() => action.invoke());
        });
      }

      menu.showAtPosition({ x: screenX, y: screenY });
    };

    document.addEventListener('windrose:selection-context-menu', handler);
    return () => document.removeEventListener('windrose:selection-context-menu', handler);
  }, [actions]);

  if (!selectedItems?.length || !mapData || !canvasRef?.current || !containerRef?.current) {
    return null;
  }

  const bounds = getSelectionBounds(selectedItems, mapData, canvasRef, containerRef, geometry);
  if (!bounds) return null;

  const visibleActions = actions.filter(a => a.visible);
  const iconOnlyActions = visibleActions.filter(a => a.iconOnly);
  const primaryActions = visibleActions.filter(a => !a.iconOnly && a.group !== 'links');
  const linkActions = visibleActions.filter(a => a.group === 'links' && !a.iconOnly);

  // Layout calculation
  const colWidth = 100;
  const rowHeight = 30;
  const cardPadding = 8;
  const separatorHeight = 1;

  let primaryRows: SelectionAction[][] = [];
  for (let i = 0; i < primaryActions.length; i += 2) {
    primaryRows.push(primaryActions.slice(i, i + 2));
  }

  // Add links row if there are link actions
  const hasLinks = linkActions.length > 0;
  const linksRowIndex = primaryRows.length;

  const cardWidth = colWidth * 2 + cardPadding * 2 + 8;
  let cardHeight = cardPadding * 2
    + primaryRows.length * rowHeight
    + (primaryRows.length > 1 ? (primaryRows.length - 1) * 2 : 0);

  // Add separator + links toggle row
  if (hasLinks) {
    cardHeight += separatorHeight + 4 + rowHeight;
  }

  // Expanded links
  if (hasLinks && linksExpanded) {
    cardHeight += linkActions.length * rowHeight + 4;
  }

  // Footer icons row
  if (iconOnlyActions.length > 0) {
    cardHeight += separatorHeight + 4 + 28;
  }

  // Resize slider
  if (isResizeMode) {
    cardHeight += separatorHeight + 4 + 32;
  }

  // Player light controls (header row + optional controls row)
  if (isPlayer) {
    cardHeight += separatorHeight + 4 + 24;
    if (lightEnabled) cardHeight += 4 + 24;
  }

  // Multi-select badge
  const isMulti = selectionType === 'multi';
  if (isMulti) {
    cardHeight += 28 + 4;
  }

  // Linked note display
  const linkedNote = selectionType === 'object' && selectedItems.length === 1
    ? selectedItems[0].data?.linkedNote : null;
  const linkedNoteHeight = linkedNote ? 32 : 0;
  const linkedNoteGap = linkedNote ? 4 : 0;

  const toolbarPos = useToolbarPosition({
    bounds,
    containerRef,
    toolbarWidth: cardWidth,
    toolbarHeight: cardHeight,
    extraHeight: linkedNoteGap + linkedNoteHeight
  });
  if (!toolbarPos) return null;

  // Resize slider mode for objects
  const currentScale = selectionType === 'object' && selectedItems.length === 1
    ? (getActiveLayer(mapData).objects?.find(o => o.id === selectedItems[0].id)?.scale ?? 1.0)
    : 1.0;

  // Linked note Y position
  let linkedNoteY: number | undefined;
  if (linkedNote) {
    if (toolbarPos.shouldFlipAbove) {
      linkedNoteY = toolbarPos.toolbarY - linkedNoteGap - linkedNoteHeight;
    } else {
      linkedNoteY = toolbarPos.toolbarY + cardHeight + linkedNoteGap;
    }
  }

  const renderActionButton = (action: SelectionAction, fullWidth = false) => {
    if (action.special === 'color') {
      return (
        <div key={action.id} className={`dmt-sel-action ${fullWidth ? 'dmt-sel-action-full' : ''}`} style={{ position: 'relative' }}>
          <button
            ref={colorButtonRef}
            className="dmt-sel-action-btn dmt-sel-color-btn"
            onClick={(e) => action.invoke(e)}
            title={action.label}
          >
            <span className="dmt-sel-color-swatch" style={{ backgroundColor: currentColor || '#ffffff' }} />
            <span className="dmt-sel-action-label">{action.label}</span>
          </button>
          {showColorPicker && (
            <ColorPicker
              isOpen={showColorPicker}
              selectedColor={currentColor || '#ffffff'}
              onColorSelect={onColorSelect}
              onClose={onColorPickerClose}
              onReset={onColorReset}
              customColors={customColors || []}
              onAddCustomColor={onAddCustomColor}
              onDeleteCustomColor={onDeleteCustomColor}
              pendingCustomColorRef={pendingCustomColorRef}
              title="Object Color"
              position="above"
              portalled
              anchorRef={colorButtonRef}
            />
          )}
        </div>
      );
    }

    const classes = [
      'dmt-sel-action-btn',
      action.id === 'delete' && 'dmt-sel-action-delete',
      action.active && 'dmt-sel-action-active',
      action.disabled && 'dmt-sel-action-disabled'
    ].filter(Boolean).join(' ');

    return (
      <div key={action.id} className={`dmt-sel-action ${fullWidth ? 'dmt-sel-action-full' : ''}`}>
        <button
          className={classes}
          onClick={(e) => !action.disabled && action.invoke(e)}
          title={action.label}
          disabled={action.disabled}
        >
          <dc.Icon icon={action.icon} />
          <span className="dmt-sel-action-label">{action.label}</span>
        </button>
      </div>
    );
  };

  return (
    <>
      {/* Linked Note Display */}
      {linkedNote && linkedNoteY !== undefined && (
        <div
          className="dmt-selection-linked-note"
          style={{
            position: 'absolute',
            left: `${bounds.screenX}px`,
            top: `${linkedNoteY}px`,
            transform: 'translateX(-50%)',
            pointerEvents: 'auto',
            zIndex: 150
          }}
        >
          <div className="dmt-note-display-link">
            <dc.Icon icon="lucide-scroll-text" />
            <dc.Link
              link={dc.resolvePath(linkedNote.replace(/\.md$/, ''))}
              onClick={(e: Event) => {
                e.preventDefault();
                e.stopPropagation();
                openNoteInNewTab(linkedNote);
              }}
            />
            <dc.Icon icon="lucide-external-link" />
          </div>
        </div>
      )}

      {/* Selection Card */}
      <div
        className="dmt-selection-card"
        style={{
          position: 'absolute',
          left: `${toolbarPos.toolbarX}px`,
          top: `${toolbarPos.toolbarY}px`,
          width: `${cardWidth}px`,
          pointerEvents: 'auto',
          zIndex: 150
        }}
      >
        <CornerBracket position="tl" />
        <CornerBracket position="tr" />
        <CornerBracket position="bl" />
        <CornerBracket position="br" />
        <SelectionCardFiligree />

        <div className="dmt-selection-card-content">
          {/* Multi-select badge */}
          {isMulti && (
            <div className="dmt-sel-multi-badge">
              <dc.Icon icon="lucide-box-select" size={14} />
              <span>{selectionCount || selectedItems.length} selected</span>
            </div>
          )}

          {/* Primary action rows (2-column grid) */}
          <div className="dmt-sel-grid">
            {primaryRows.map((row, rowIdx) => (
              <div key={rowIdx} className="dmt-sel-row">
                {row.map(action => renderActionButton(action, row.length === 1))}
              </div>
            ))}
          </div>

          {/* Links section */}
          {hasLinks && (
            <>
              <div className="dmt-sel-separator" />
              <button
                className={`dmt-sel-links-toggle ${linksExpanded ? 'expanded' : ''}`}
                onClick={() => setLinksExpanded(!linksExpanded)}
              >
                <dc.Icon icon="lucide-link-2" />
                <span>Links</span>
                <dc.Icon icon={linksExpanded ? 'lucide-chevron-up' : 'lucide-chevron-down'} />
              </button>
              {linksExpanded && (
                <div className="dmt-sel-links-panel">
                  {linkActions.map(action => renderActionButton(action, true))}
                </div>
              )}
            </>
          )}

          {/* Resize slider */}
          {isResizeMode && (
            <>
              <div className="dmt-sel-separator" />
              <div className="dmt-sel-resize-row">
                <dc.Icon icon="lucide-scaling" size={14} />
                <input
                  type="range"
                  className="dmt-scale-slider"
                  min="25" max="130" step="5"
                  value={Math.round(currentScale * 100)}
                  onInput={(e: any) => onScaleChange?.(parseInt(e.target.value) / 100)}
                  title={`Scale: ${Math.round(currentScale * 100)}%`}
                />
                <span className="dmt-sel-resize-value">{Math.round(currentScale * 100)}%</span>
              </div>
            </>
          )}

          {/* Player light controls */}
          {isPlayer && (
            <>
              <div className="dmt-sel-separator" />
              <div className="dmt-sel-player-section">
                <div className="dmt-sel-player-header" onClick={() => onLightToggle?.()}>
                  <dc.Icon icon="lucide-sun" size={14} />
                  <span>Light</span>
                  <label className="dmt-sel-toggle-switch" onClick={(e: Event) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={!!lightEnabled}
                      onChange={() => onLightToggle?.()}
                    />
                    <span className="dmt-sel-toggle-slider" />
                  </label>
                </div>
                {lightEnabled && (
                  <div className="dmt-sel-player-row">
                    <input
                      type="number"
                      className="dmt-sel-radius-input"
                      value={lightRadius || 30}
                      min="1"
                      step="5"
                      onInput={(e: any) => onLightRadiusChange?.(parseInt(e.target.value) || 30)}
                    />
                    <span className="dmt-sel-unit-label">{distanceUnit || 'ft'}</span>
                    <button
                      ref={lightColorButtonRef}
                      className="dmt-sel-light-color-swatch"
                      onClick={() => onLightColorSwatchClick?.()}
                      title="Light Color"
                    >
                      <span className="dmt-sel-color-swatch" style={{ backgroundColor: lightColor || 'rgba(255, 255, 100, 1)' }} />
                    </button>
                    {showLightColorPicker && (
                      <ColorPicker
                        isOpen={showLightColorPicker}
                        selectedColor={lightColor || 'rgba(255, 255, 100, 1)'}
                        onColorSelect={onLightColorSelect}
                        onClose={onLightColorPickerClose}
                        title="Light Color"
                        position="above"
                        portalled
                        anchorRef={lightColorButtonRef}
                      />
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Footer icon row (freeform, copy link) */}
          {iconOnlyActions.length > 0 && (
            <>
              <div className="dmt-sel-separator" />
              <div className="dmt-sel-footer-icons">
                {iconOnlyActions.map(action => (
                  <button
                    key={action.id}
                    className={`dmt-sel-icon-btn ${action.active ? 'dmt-sel-action-active' : ''}`}
                    onClick={(e) => action.invoke(e)}
                    title={action.label}
                  >
                    <dc.Icon icon={action.icon} />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
};

return { SelectionActionsOverlay };

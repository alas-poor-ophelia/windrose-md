/**
 * ObjectSelectionToolbar.tsx
 *
 * Toolbar for selected objects. Handles single-object actions (rotate, label, link,
 * color, resize, delete, etc.) plus resize slider mode and linked note display.
 * Consumer: ObjectLayer only.
 */











import type { TargetedMouseEvent, VNode } from 'preact';
import type { Ref } from 'preact';
import type { MapData } from '#types/core/map.types';
import type { MapObject } from '#types/objects/object.types';
import type { ExtendedGeometry, SelectedItem } from '#types/contexts/context.types';
import type { HexColor } from '#types/core/common.types';
import type { CustomColor } from '#types/core/common.types';

import { calculateObjectScreenPosition } from '../../objects/screenPositionUtils';
import { openNoteInNewTab } from '../../persistence/noteOperations';
import { ColorPicker } from '../shared/ColorPicker';
import { getActiveLayer } from '../../persistence/layerAccessor';
import { useToolbarPosition } from '../../hooks/interactions/useToolbarPosition';
import { Icon } from '../shared/Icon';
import { InternalLink } from '../shared/InternalLink';
import { Z_INDEX } from '../../core/dmtConstants';

type MouseClickEvent = TargetedMouseEvent<HTMLButtonElement>;

interface ObjectSelectionToolbarProps {
  selectedItem: SelectedItem | null;
  mapData: MapData | null;
  canvasRef: { current: HTMLCanvasElement | null } | null;
  containerRef: { current: HTMLElement | null } | null;
  geometry: ExtendedGeometry | null;

  // Object handlers
  onRotate?: (e?: MouseClickEvent) => void;
  onLabel?: (e?: MouseClickEvent) => void;
  onLinkNote?: (e?: MouseClickEvent) => void;
  onLinkObject?: (e?: MouseClickEvent) => void;
  onFollowLink?: (e?: MouseClickEvent) => void;
  onRemoveLink?: (e?: MouseClickEvent) => void;
  onCopyLink?: (e?: MouseClickEvent) => void;
  onColorClick?: (e?: MouseClickEvent) => void;
  onResize?: (e?: MouseClickEvent) => void;
  onDelete?: (e?: MouseClickEvent) => void;
  onScaleChange?: (scale: number) => void;
  onDuplicate?: (e?: MouseClickEvent) => void;
  onFreeformToggle?: (e?: MouseClickEvent) => void;

  // State
  isResizeMode?: boolean;
  showColorPicker?: boolean;

  // Color picker props
  currentColor?: HexColor | null;
  onColorSelect?: (color: HexColor) => void;
  onColorPickerClose?: () => void;
  onColorReset?: () => void;
  customColors?: CustomColor[];
  onAddCustomColor?: (color: HexColor) => void;
  onDeleteCustomColor?: (id: string) => void;
  pendingCustomColorRef?: { current: HexColor | null };
  colorButtonRef?: Ref<HTMLButtonElement>;
}

const ObjectSelectionToolbar = ({
  selectedItem,
  mapData,
  canvasRef,
  containerRef,
  geometry,

  // Object handlers
  onRotate,
  onLabel,
  onLinkNote,
  onLinkObject,
  onFollowLink,
  onRemoveLink,
  onCopyLink,
  onColorClick,
  onResize,
  onDelete,
  onScaleChange,
  onDuplicate,
  onFreeformToggle,

  // State
  isResizeMode,
  showColorPicker,

  // Color picker props
  currentColor,
  onColorSelect,
  onColorPickerClose,
  onColorReset,
  customColors,
  onAddCustomColor,
  onDeleteCustomColor,
  pendingCustomColorRef,
  colorButtonRef
}: ObjectSelectionToolbarProps): VNode | null => {
  // Compute bounds before hooks to satisfy rules-of-hooks (no hooks after conditional returns)
  const hasRequiredInputs = !!selectedItem && selectedItem.type === 'object' && !!mapData && !!canvasRef?.current && !!containerRef?.current;

  const object = hasRequiredInputs
    ? getActiveLayer(mapData).objects?.find(obj => obj.id === selectedItem.id) ?? null
    : null;

  const screenPos = hasRequiredInputs && object != null && geometry != null
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- canvasRef.current non-null: hasRequiredInputs already gates on !!canvasRef?.current
    ? calculateObjectScreenPosition(object, canvasRef.current!, mapData, geometry, containerRef)
    : null;

  const bounds = screenPos != null
    ? {
      screenX: screenPos.screenX,
      screenY: screenPos.screenY,
      width: screenPos.objectWidth,
      height: screenPos.objectHeight
    }
    : null;

  // Build button definitions (safe to compute even when selectedItem is null — guarded below)
  const selectedObjectData = selectedItem?.data as MapObject | undefined;
  const hasLinkedObject = selectedObjectData?.linkedObject != null;
  const isNotePin = selectedObjectData?.type === 'note_pin';
  const isFreeform = selectedObjectData?.freeform === true;

  const buttons = hasRequiredInputs ? [
    { id: 'rotate', icon: 'lucide-rotate-cw', title: 'Rotate 45° (or press R)', onClick: onRotate },
    { id: 'label', icon: 'lucide-sticky-note', title: 'Add/Edit Label', onClick: onLabel, visible: !isNotePin },
    { id: 'duplicate', icon: 'lucide-copy', title: 'Duplicate Object', onClick: onDuplicate },
    { id: 'freeform', icon: 'lucide-diamond', title: isFreeform ? 'Snap to grid' : 'Convert to freeform', onClick: onFreeformToggle, active: isFreeform },
    { id: 'linkNote', icon: 'lucide-scroll-text', title: selectedObjectData?.linkedNote != null ? 'Edit linked note' : 'Link note', onClick: onLinkNote },
    { id: 'linkObject', icon: 'lucide-link-2', title: hasLinkedObject ? 'Edit object link' : 'Link to object', onClick: onLinkObject, active: hasLinkedObject },
    { id: 'followLink', icon: 'lucide-arrow-right-circle', title: 'Go to linked object', onClick: onFollowLink, visible: hasLinkedObject },
    { id: 'removeLink', icon: 'lucide-unlink', title: 'Remove object link', onClick: onRemoveLink, visible: hasLinkedObject },
    { id: 'copyLink', icon: 'lucide-link', title: 'Copy link to clipboard', onClick: onCopyLink },
    { id: 'color', icon: 'lucide-palette', title: 'Change Object Color', onClick: onColorClick, isColorButton: true },
    { id: 'resize', icon: 'lucide-scaling', title: 'Resize Object', onClick: onResize, visible: mapData.mapType !== 'hex' },
    { id: 'delete', icon: 'lucide-trash-2', title: 'Delete (or press Delete/Backspace)', onClick: onDelete, isDelete: true }
  ].filter(btn => btn.visible !== false) : [];

  const buttonSize = 44;
  const buttonGap = 4;
  const buttonsPerRow = 5;
  const buttonCount = buttons.length;
  const rowCount = Math.ceil(buttonCount / buttonsPerRow) || 1;
  const buttonsInFirstRow = Math.min(buttonCount, buttonsPerRow) || 1;

  const toolbarWidth = buttonsInFirstRow * buttonSize + (buttonsInFirstRow - 1) * buttonGap;
  const toolbarHeight = rowCount * buttonSize + (rowCount - 1) * buttonGap;

  // Linked note display height
  const hasLinkedNote = selectedObjectData?.linkedNote != null && typeof selectedObjectData?.linkedNote === 'string';
  const linkedNoteHeight = hasLinkedNote ? 32 : 0;
  const linkedNoteGap = hasLinkedNote ? 4 : 0;
  const extraHeight = linkedNoteGap + linkedNoteHeight;

  const toolbarPos = useToolbarPosition({ bounds, containerRef: containerRef ?? { current: null }, toolbarWidth, toolbarHeight, extraHeight });
  if (!hasRequiredInputs || !object || !screenPos || !bounds || !toolbarPos) return null;

  // During resize mode, show scale slider instead of action buttons
  if (isResizeMode === true) {
    const actualObject = getActiveLayer(mapData).objects?.find(obj => obj.id === selectedItem.id);
    const currentScale = actualObject?.scale ?? 1.0;
    const sliderWidth = 140;
    const sliderHeight = 36;
    const sliderGap = 8;

    const sliderX = bounds.screenX - sliderWidth / 2;
    const sliderY = toolbarPos.selectionTop - sliderGap - sliderHeight;

    if (containerRef.current == null) return null;
    const containerRect = containerRef.current.getBoundingClientRect();
    const clampedSliderX = Math.max(4, Math.min(containerRect.width - sliderWidth - 4, sliderX));

    return (
      <div
        className="windrose-scale-slider-container"
        style={{
          position: 'absolute',
          left: `${clampedSliderX}px`,
          top: `${sliderY}px`,
          width: `${sliderWidth}px`,
          height: `${sliderHeight}px`,
          pointerEvents: 'auto',
          zIndex: Z_INDEX.TOOLBAR
        }}
      >
        <div className="windrose-scale-slider-inner">
          <Icon icon="lucide-scaling" size={14} />
          <input
            type="range"
            className="windrose-scale-slider"
            min="25"
            max="130"
            step="5"
            value={Math.round(currentScale * 100)}
            onInput={(e) => {
              const newScale = parseInt((e.target as HTMLInputElement).value) / 100;
              onScaleChange?.(newScale);
            }}
            title={`Scale: ${Math.round(currentScale * 100)}%`}
          />
          <span className="windrose-scale-value">{Math.round(currentScale * 100)}%</span>
        </div>
      </div>
    );
  }

  // Linked note Y position
  let linkedNoteY;
  if (toolbarPos.shouldFlipAbove) {
    linkedNoteY = toolbarPos.toolbarY - linkedNoteGap - linkedNoteHeight;
  } else {
    linkedNoteY = toolbarPos.toolbarY + toolbarHeight + linkedNoteGap;
  }

  return (
    <>
      {/* Linked Note Display */}
      {hasLinkedNote && selectedObjectData != null && (
        <div
          className="windrose-selection-linked-note"
          style={{
            position: 'absolute',
            left: `${bounds.screenX}px`,
            top: `${linkedNoteY}px`,
            transform: 'translateX(-50%)',
            pointerEvents: 'auto',
            zIndex: Z_INDEX.TOOLBAR
          }}
        >
          <div className="windrose-note-display-link">
            <Icon icon="lucide-scroll-text" />
            <InternalLink
              link={(selectedObjectData.linkedNote as string).replace(/\.md$/, '')}
              onClick={(e: Event) => {
                e.preventDefault();
                e.stopPropagation();
                void openNoteInNewTab(selectedObjectData?.linkedNote as string);
              }}
            />
            <Icon icon="lucide-external-link" />
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div
        className="windrose-selection-toolbar"
        style={{
          position: 'absolute',
          left: `${toolbarPos.toolbarX}px`,
          top: `${toolbarPos.toolbarY}px`,
          width: `${toolbarWidth}px`,
          pointerEvents: 'auto',
          zIndex: Z_INDEX.TOOLBAR
        }}
      >
        {buttons.map((btn) => {
          if (btn.isColorButton === true) {
            return (
              <div key={btn.id} style={{ position: 'relative', display: 'inline-block' }}>
                <button
                  ref={colorButtonRef}
                  className="windrose-toolbar-button windrose-toolbar-color-button"
                  onClick={(e) => btn.onClick?.(e)}
                  title={btn.title}
                  style={{ backgroundColor: currentColor ?? '#ffffff' }}
                >
                  <Icon icon={btn.icon} />
                </button>
                {showColorPicker === true && (
                  <ColorPicker
                    isOpen={showColorPicker}
                    selectedColor={currentColor ?? '#ffffff'}
                    onColorSelect={(color: HexColor) => onColorSelect?.(color)}
                    onClose={() => onColorPickerClose?.()}
                    onReset={() => onColorReset?.()}
                    customColors={customColors ?? []}
                    onAddCustomColor={onAddCustomColor}
                    onDeleteCustomColor={onDeleteCustomColor}
                    pendingCustomColorRef={pendingCustomColorRef}
                    title="Object Color"
                    position="above"
                  />
                )}
              </div>
            );
          }

          const className = [
            'windrose-toolbar-button',
            btn.isDelete === true && 'windrose-toolbar-delete-button',
            btn.active === true && 'windrose-toolbar-button-active'
          ].filter(Boolean).join(' ');

          return (
            <button
              key={btn.id}
              className={className}
              onClick={(e) => btn.onClick?.(e)}
              title={btn.title}
            >
              <Icon icon={btn.icon} />
            </button>
          );
        })}
      </div>
    </>
  );
};

export { ObjectSelectionToolbar };
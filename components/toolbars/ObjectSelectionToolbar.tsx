/**
 * ObjectSelectionToolbar.tsx
 *
 * Toolbar for selected objects. Handles single-object actions (rotate, label, link,
 * color, resize, delete, etc.) plus resize slider mode and linked note display.
 * Consumer: ObjectLayer only.
 */

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { calculateObjectScreenPosition } = await requireModuleByName("screenPositionUtils.ts");
const { openNoteInNewTab } = await requireModuleByName("noteOperations.ts");
const { ColorPicker } = await requireModuleByName("ColorPicker.tsx");
const { getActiveLayer } = await requireModuleByName("layerAccessor.ts");
const { useToolbarPosition } = await requireModuleByName("useToolbarPosition.ts");

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
}) => {
  if (!selectedItem || selectedItem.type !== 'object' || !mapData || !canvasRef?.current || !containerRef?.current) {
    return null;
  }

  const object = getActiveLayer(mapData).objects?.find(obj => obj.id === selectedItem.id);
  if (!object) return null;

  const pos = calculateObjectScreenPosition(object, canvasRef.current, mapData, geometry, containerRef);
  if (!pos) return null;

  const bounds = {
    screenX: pos.screenX,
    screenY: pos.screenY,
    width: pos.objectWidth,
    height: pos.objectHeight
  };

  // Build button definitions
  const hasLinkedObject = !!(selectedItem.data?.linkedObject);
  const isNotePin = selectedItem.data?.type === 'note_pin';
  const isFreeform = !!(selectedItem.data?.freeform);

  const buttons = [
    { id: 'rotate', icon: 'lucide-rotate-cw', title: 'Rotate 45° (or press R)', onClick: onRotate },
    { id: 'label', icon: 'lucide-sticky-note', title: 'Add/Edit Label', onClick: onLabel, visible: !isNotePin },
    { id: 'duplicate', icon: 'lucide-copy', title: 'Duplicate Object', onClick: onDuplicate },
    { id: 'freeform', icon: 'lucide-diamond', title: isFreeform ? 'Snap to grid' : 'Convert to freeform', onClick: onFreeformToggle, active: isFreeform },
    { id: 'linkNote', icon: 'lucide-scroll-text', title: selectedItem.data?.linkedNote ? 'Edit linked note' : 'Link note', onClick: onLinkNote },
    { id: 'linkObject', icon: 'lucide-link-2', title: hasLinkedObject ? 'Edit object link' : 'Link to object', onClick: onLinkObject, active: hasLinkedObject },
    { id: 'followLink', icon: 'lucide-arrow-right-circle', title: 'Go to linked object', onClick: onFollowLink, visible: hasLinkedObject },
    { id: 'removeLink', icon: 'lucide-unlink', title: 'Remove object link', onClick: onRemoveLink, visible: hasLinkedObject },
    { id: 'copyLink', icon: 'lucide-link', title: 'Copy link to clipboard', onClick: onCopyLink },
    { id: 'color', icon: 'lucide-palette', title: 'Change Object Color', onClick: onColorClick, isColorButton: true },
    { id: 'resize', icon: 'lucide-scaling', title: 'Resize Object', onClick: onResize, visible: mapData.mapType !== 'hex' },
    { id: 'delete', icon: 'lucide-trash-2', title: 'Delete (or press Delete/Backspace)', onClick: onDelete, isDelete: true }
  ].filter(btn => btn.visible !== false);

  const buttonSize = 44;
  const buttonGap = 4;
  const buttonsPerRow = 5;
  const buttonCount = buttons.length;
  const rowCount = Math.ceil(buttonCount / buttonsPerRow);
  const buttonsInFirstRow = Math.min(buttonCount, buttonsPerRow);

  const toolbarWidth = buttonsInFirstRow * buttonSize + (buttonsInFirstRow - 1) * buttonGap;
  const toolbarHeight = rowCount * buttonSize + (rowCount - 1) * buttonGap;

  // Linked note display height
  const hasLinkedNote = selectedItem.data?.linkedNote && typeof selectedItem.data.linkedNote === 'string';
  const linkedNoteHeight = hasLinkedNote ? 32 : 0;
  const linkedNoteGap = hasLinkedNote ? 4 : 0;
  const extraHeight = linkedNoteGap + linkedNoteHeight;

  const toolbarPos = useToolbarPosition({ bounds, containerRef, toolbarWidth, toolbarHeight, extraHeight });
  if (!toolbarPos) return null;

  // During resize mode, show scale slider instead of action buttons
  if (isResizeMode) {
    const actualObject = getActiveLayer(mapData).objects?.find(obj => obj.id === selectedItem.id);
    const currentScale = actualObject?.scale ?? 1.0;
    const sliderWidth = 140;
    const sliderHeight = 36;
    const sliderGap = 8;

    const sliderX = bounds.screenX - sliderWidth / 2;
    const sliderY = toolbarPos.selectionTop - sliderGap - sliderHeight;

    const containerRect = containerRef.current.getBoundingClientRect();
    const clampedSliderX = Math.max(4, Math.min(containerRect.width - sliderWidth - 4, sliderX));

    return (
      <div
        className="dmt-scale-slider-container"
        style={{
          position: 'absolute',
          left: `${clampedSliderX}px`,
          top: `${sliderY}px`,
          width: `${sliderWidth}px`,
          height: `${sliderHeight}px`,
          pointerEvents: 'auto',
          zIndex: 150
        }}
      >
        <div className="dmt-scale-slider-inner">
          <dc.Icon icon="lucide-scaling" size={14} />
          <input
            type="range"
            className="dmt-scale-slider"
            min="25"
            max="130"
            step="5"
            value={Math.round(currentScale * 100)}
            onInput={(e) => {
              const newScale = parseInt(e.target.value) / 100;
              onScaleChange?.(newScale);
            }}
            title={`Scale: ${Math.round(currentScale * 100)}%`}
          />
          <span className="dmt-scale-value">{Math.round(currentScale * 100)}%</span>
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
      {hasLinkedNote && (
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
              link={dc.resolvePath(selectedItem.data.linkedNote.replace(/\.md$/, ''))}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openNoteInNewTab(selectedItem.data.linkedNote);
              }}
            />
            <dc.Icon icon="lucide-external-link" />
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div
        className="dmt-selection-toolbar"
        style={{
          position: 'absolute',
          left: `${toolbarPos.toolbarX}px`,
          top: `${toolbarPos.toolbarY}px`,
          width: `${toolbarWidth}px`,
          pointerEvents: 'auto',
          zIndex: 150
        }}
      >
        {buttons.map((btn) => {
          if (btn.isColorButton) {
            return (
              <div key={btn.id} style={{ position: 'relative', display: 'inline-block' }}>
                <button
                  ref={colorButtonRef}
                  className="dmt-toolbar-button dmt-toolbar-color-button"
                  onClick={(e) => btn.onClick?.(e)}
                  title={btn.title}
                  style={{ backgroundColor: currentColor || '#ffffff' }}
                >
                  <dc.Icon icon={btn.icon} />
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
                  />
                )}
              </div>
            );
          }

          const className = [
            'dmt-toolbar-button',
            btn.isDelete && 'dmt-toolbar-delete-button',
            btn.active && 'dmt-toolbar-button-active'
          ].filter(Boolean).join(' ');

          return (
            <button
              key={btn.id}
              className={className}
              onClick={(e) => btn.onClick?.(e)}
              title={btn.title}
            >
              <dc.Icon icon={btn.icon} />
            </button>
          );
        })}
      </div>
    </>
  );
};

return { ObjectSelectionToolbar };

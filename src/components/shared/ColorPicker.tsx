/**
 * ColorPicker.tsx
 *
 * Color picker component with custom color support and opacity controls.
 */

import type { CSSProperties, TargetedEvent, TargetedMouseEvent, TargetedTouchEvent, VNode } from 'preact';
import { Fragment } from 'preact';
import type { CustomColor, HexColor } from '#types/core/common.types';
import type { ColorOpacityOverrides } from '#types/core/map.types';

import type { MutableRef } from 'preact/hooks';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { getColorPalette, DEFAULT_COLOR } from '../../drawing/colorOperations';
import { ModalPortal } from '../modals/ModalPortal';
import { Icon } from './Icon';
import { tooltipRef } from './obsidianTooltip';
import { clampPopoverLeft, popoverOpensAbove, usePopoverSize } from './popoverClamp';






/** Color definition from palette */
interface ColorDef {
  id: string;
  color: HexColor;
  label: string;
  opacity?: number;
  isCustom?: boolean;
  isReset?: boolean;
  isAddButton?: boolean;
}

/** Position for color picker */
type PickerPosition = 'below' | 'above' | null;

/** Alignment for color picker */
type PickerAlign = 'left' | 'right';

/** Bounding rect of the swatch the edit panel is anchored to (viewport coordinates) */
interface EditAnchorRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/** Props for ColorPicker component */
export interface ColorPickerProps {
  /** Whether the picker is open */
  isOpen: boolean;
  /** Currently selected color */
  selectedColor: HexColor | null;
  /** Callback when a color is selected */
  onColorSelect: (color: HexColor) => void;
  /** Callback to close the picker */
  onClose: () => void;
  /** Callback to reset to default color */
  onReset: () => void;
  /** Custom colors array */
  customColors?: CustomColor[];
  /** Per-map opacity overrides for palette colors */
  paletteColorOpacityOverrides?: ColorOpacityOverrides;
  /** Callback to add a custom color */
  onAddCustomColor?: (color: HexColor) => void;
  /** Callback to delete a custom color */
  onDeleteCustomColor?: (colorId: string) => void;
  /** Callback to update any color's opacity */
  onUpdateColorOpacity?: (colorId: string, opacity: number) => void;
  /** Ref to store pending custom color */
  pendingCustomColorRef?: MutableRef<HexColor | null>;
  /** Picker title */
  title?: string;
  /** Picker position */
  position?: PickerPosition;
  /** Picker alignment */
  align?: PickerAlign;
  /** Current opacity value (0-1) */
  opacity?: number;
  /** Callback when opacity changes */
  onOpacityChange?: ((opacity: number) => void) | null;
  /** Render in a portal anchored to anchorRef (escapes overflow clipping) */
  portalled?: boolean;
  /** Anchor element for portalled positioning */
  anchorRef?: { current: HTMLElement | null };
  /** Floating panel mode: no overlay, no positioning, no header */
  floatingMode?: boolean;
}

const ColorPicker = ({
  isOpen,
  selectedColor,
  onColorSelect,
  onClose,
  onReset,
  customColors = [],
  paletteColorOpacityOverrides = {},
  onAddCustomColor,
  onDeleteCustomColor,
  onUpdateColorOpacity,
  pendingCustomColorRef,
  title = 'Color',
  position = 'below',
  align = 'left',
  opacity = 1,
  onOpacityChange = null,
  portalled = false,
  anchorRef,
  floatingMode = false
}: ColorPickerProps): VNode | null => {
  const [editTargetId, setEditTargetId] = useState<string | null>(null);
  const [editingOpacity, setEditingOpacity] = useState(1);
  const [editTargetRect, setEditTargetRect] = useState<EditAnchorRect | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const pickerSize = usePopoverSize(pickerRef, isOpen && portalled);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const editingOpacityRef = useRef(editingOpacity);
  const editTargetIdRef = useRef(editTargetId);
  const editTargetElRef = useRef<HTMLElement | null>(null);
  const editPanelRef = useRef<HTMLDivElement | null>(null);
  const justOpenedEditRef = useRef(false);
  const longPressTriggeredRef = useRef(false);

  editingOpacityRef.current = editingOpacity;
  editTargetIdRef.current = editTargetId;

  const saveOpacityChanges = useCallback(() => {
    const targetId = editTargetIdRef.current;
    const currentOpacity = editingOpacityRef.current;

    if (targetId == null) return;

    const customColor = customColors.find(c => c.id === targetId);
    const paletteOverride = paletteColorOpacityOverrides[targetId];
    const originalOpacity = customColor?.opacity ?? paletteOverride ?? 1;

    if (onUpdateColorOpacity && currentOpacity !== originalOpacity) {
      onUpdateColorOpacity(targetId, currentOpacity);
    }

    if (onOpacityChange) {
      onOpacityChange(currentOpacity);
    }
  }, [customColors, paletteColorOpacityOverrides, onUpdateColorOpacity, onOpacityChange]);

  const clearEditTarget = useCallback((): void => {
    editTargetElRef.current = null;
    setEditTargetRect(null);
    setEditTargetId(null);
  }, []);

  const captureEditAnchor = useCallback((el: HTMLElement): void => {
    editTargetElRef.current = el;
    const rect = el.getBoundingClientRect();
    setEditTargetRect({
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height
    });
  }, []);

  const saveAndCloseEditPanel = useCallback(() => {
    if (editTargetIdRef.current == null) return;
    if (justOpenedEditRef.current) return;

    saveOpacityChanges();
    clearEditTarget();
  }, [saveOpacityChanges, clearEditTarget]);

  useEffect(() => {
    if (!isOpen && editTargetIdRef.current != null) {
      saveOpacityChanges();
      clearEditTarget();
    }
  }, [isOpen, saveOpacityChanges, clearEditTarget]);

  // Recompute the anchor rect on resize/scroll (capture:true catches scroll on
  // any nested container, e.g. a docked sidebar) so the portalled panel tracks
  // its swatch instead of drifting once the page/sidebar moves under it.
  useEffect((): (() => void) | undefined => {
    if (editTargetId == null) return undefined;

    const recompute = (): void => {
      const el = editTargetElRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setEditTargetRect({
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
      });
    };

    // The swatch's window, not the ambient one (popout-safe).
    const win = editTargetElRef.current?.ownerDocument.defaultView ?? window;
    win.addEventListener('resize', recompute);
    win.addEventListener('scroll', recompute, true);
    return () => {
      win.removeEventListener('resize', recompute);
      win.removeEventListener('scroll', recompute, true);
    };
  }, [editTargetId]);

  // Place the portalled edit panel relative to its swatch: default to the
  // right, flip to the left if it would overflow the viewport width, and
  // clamp top/bottom into the viewport. Runs before paint so there's no
  // flash at the wrong position.
  useLayoutEffect(() => {
    if (editTargetId == null || editTargetRect == null) return;
    const panel = editPanelRef.current;
    if (!panel) return;

    const win = panel.ownerDocument.defaultView ?? window;
    const gap = 4;
    const panelRect = panel.getBoundingClientRect();

    let left = editTargetRect.right + gap;
    if (left + panelRect.width > win.innerWidth) {
      left = editTargetRect.left - gap - panelRect.width;
    }
    left = Math.min(Math.max(0, left), Math.max(0, win.innerWidth - panelRect.width));

    let top = editTargetRect.top + editTargetRect.height / 2 - panelRect.height / 2;
    top = Math.min(Math.max(0, top), Math.max(0, win.innerHeight - panelRect.height));

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }, [editTargetId, editTargetRect]);

  useEffect((): (() => void) | undefined => {
    const input = colorInputRef.current;
    if (!input) return undefined;

    const handleNativeChange = (): void => {
      const value = input.value;
      if (onAddCustomColor) onAddCustomColor(value);
      onColorSelect(value);
      if (pendingCustomColorRef) pendingCustomColorRef.current = null;
    };

    input.addEventListener('change', handleNativeChange);
    return () => input.removeEventListener('change', handleNativeChange);
  });

  if (!isOpen) return null;

  const handlePickerClick = (e: TargetedMouseEvent<HTMLDivElement>): void => {
    e.stopPropagation();
  };

  const handlePickerMouseDown = (e: TargetedMouseEvent<HTMLDivElement>): void => {
    e.stopPropagation();

    if (editTargetId != null && editTargetId !== '' && !(e.target as Element).closest('.windrose-color-edit-panel')) {
      if (!justOpenedEditRef.current) {
        saveAndCloseEditPanel();
      }
    }
  };

  const handlePickerTouch = (e: TargetedTouchEvent<HTMLDivElement>): void => {
    e.stopPropagation();

    if (editTargetId != null && !(e.target as Element).closest('.windrose-color-edit-panel')) {
      if (!justOpenedEditRef.current) {
        saveAndCloseEditPanel();
      }
    }
  };

  const handleColorClick = (colorDef: ColorDef): void => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }

    if (pendingCustomColorRef) pendingCustomColorRef.current = null;

    onColorSelect(colorDef.color);

    if (onOpacityChange && colorDef.opacity !== undefined) {
      onOpacityChange(colorDef.opacity);
    }
  };

  const handleReset = (e: TargetedMouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation();
    onReset();
  };

  const handleColorInput = (e: TargetedEvent<HTMLInputElement, Event>): void => {
    const value = (e.target as HTMLInputElement).value;
    if (pendingCustomColorRef) {
      pendingCustomColorRef.current = value;
    }
  };

  const handleColorContextMenu = (e: TargetedMouseEvent<HTMLButtonElement>, colorDef: ColorDef): void => {
    if (colorDef.isReset === true || colorDef.isAddButton === true) return;
    e.preventDefault();
    e.stopPropagation();

    captureEditAnchor(e.currentTarget);
    setEditTargetId(colorDef.id);
    setEditingOpacity(colorDef.opacity ?? 1);
    justOpenedEditRef.current = true;
    window.setTimeout(() => { justOpenedEditRef.current = false; }, 100);
  };

  const handleLongPressStart = (e: TargetedTouchEvent<HTMLButtonElement>, colorDef: ColorDef): void => {
    if (colorDef.isReset === true || colorDef.isAddButton === true) return;
    const targetEl = e.currentTarget as HTMLElement;
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;

      captureEditAnchor(targetEl);
      setEditTargetId(colorDef.id);
      setEditingOpacity(colorDef.opacity ?? 1);
      justOpenedEditRef.current = true;
      window.setTimeout(() => { justOpenedEditRef.current = false; }, 300);
    }, 500);
  };

  const handleLongPressCancel = (): void => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleDeleteClick = (e: TargetedMouseEvent<HTMLButtonElement>, colorId: string): void => {
    e.preventDefault();
    e.stopPropagation();
    if (onDeleteCustomColor) {
      onDeleteCustomColor(colorId);
    }
    clearEditTarget();
  };

  const handleEditOpacityChange = (e: TargetedEvent<HTMLInputElement, Event>): void => {
    e.stopPropagation();
    const newOpacity = parseInt((e.target as HTMLInputElement).value, 10) / 100;
    setEditingOpacity(newOpacity);
  };

  const paletteColors = getColorPalette() as ColorDef[];

  const paletteColorsWithOverrides = paletteColors.map(c => {
    const override: number | undefined = paletteColorOpacityOverrides[c.id];
    return override !== undefined ? { ...c, opacity: override } : c;
  });

  const allColors: ColorDef[] = [
    { id: 'reset', color: '', label: 'Reset to default', isReset: true },
    ...paletteColorsWithOverrides,
    ...customColors.map(c => ({ ...c, label: c.label ?? c.color, isCustom: true })),
    { id: 'add-custom', color: '', label: 'Add custom color', isAddButton: true }
  ];

  const horizontalStyle = align === 'right'
    ? { right: '0', left: 'auto' }
    : { left: '0' };

  let pickerStyle: CSSProperties;

  if (floatingMode) {
    pickerStyle = {};
  } else if (portalled && anchorRef?.current) {
    const rect = anchorRef.current.getBoundingClientRect();
    const gap = 8;
    const win = anchorRef.current.ownerDocument.defaultView ?? window;
    const above = popoverOpensAbove(position === 'above', rect.top, rect.bottom, pickerSize?.height ?? 0, gap, win.innerHeight);
    pickerStyle = {
      position: 'fixed',
      left: `${clampPopoverLeft(rect.left, pickerSize?.width ?? 0, win.innerWidth)}px`,
      ...(above
        ? { bottom: `${win.innerHeight - rect.top + gap}px` }
        : { top: `${rect.bottom + gap}px` }
      )
    };
  } else {
    pickerStyle = {
      position: 'absolute',
      ...(position === 'above'
        ? { bottom: 'calc(100% + 8px)', top: 'auto' }
        : { top: 'calc(100% + 8px)' }
      ),
      ...horizontalStyle
    };
  }

  const pickerEl = (
    <div
      ref={pickerRef}
      className={`windrose-color-picker${floatingMode ? ' windrose-color-picker-floating' : ''}`}
      onClick={handlePickerClick}
      onMouseDown={handlePickerMouseDown}
      onTouchStart={handlePickerTouch}
      onTouchMove={handlePickerTouch}
      onTouchEnd={handlePickerTouch}
      style={pickerStyle}
    >
      {!floatingMode && (
        <div className="windrose-color-picker-header">
          <span className="windrose-color-picker-title">{title}</span>
        </div>
      )}

      <div className="windrose-color-grid">
        {allColors.map(colorDef => {
          if (colorDef.isReset === true) {
            return (
              <button
                key={colorDef.id}
                className="windrose-color-swatch windrose-color-swatch-reset"
                onClick={handleReset}
                ref={tooltipRef(colorDef.label)}
              >
                <Icon icon="lucide-circle-x" />
              </button>
            );
          } else if (colorDef.isAddButton === true) {
            return (
              <div
                key={colorDef.id}
                className="windrose-color-swatch windrose-color-swatch-add"
                ref={tooltipRef(colorDef.label)}
              >
                <input
                  ref={colorInputRef}
                  type="color"
                  className="windrose-color-input-as-button"
                  onInput={handleColorInput}
                  defaultValue={selectedColor ?? '#ffffff'}
                  aria-label="Add custom color"
                />
                <span className="windrose-color-add-icon-overlay">+</span>
              </div>
            );
          } else {
            const isEditing = editTargetId === colorDef.id;
            const displayOpacity = isEditing ? editingOpacity : (colorDef.opacity ?? 1);
            const hasStoredOpacity = (colorDef.opacity ?? 1) < 1;

            return (
              <div key={colorDef.id} style={{ position: 'relative', display: 'inline-block' }}>
                <button
                  className={`windrose-color-swatch interactive-child ${selectedColor === colorDef.color ? 'windrose-color-swatch-selected' : ''}`}
                  style={{
                    backgroundColor: colorDef.color,
                    opacity: displayOpacity
                  }}
                  onClick={() => handleColorClick(colorDef)}
                  onContextMenu={(e) => handleColorContextMenu(e, colorDef)}
                  onTouchStart={(e) => handleLongPressStart(e, colorDef)}
                  onTouchEnd={handleLongPressCancel}
                  onTouchMove={handleLongPressCancel}
                  onMouseDown={handleLongPressCancel}
                  ref={tooltipRef(colorDef.label + (hasStoredOpacity ? ` (${Math.round((colorDef.opacity ?? 1) * 100)}%)` : ''))}
                >
                  {selectedColor === colorDef.color && (
                    <span className="windrose-color-checkmark">
                      <Icon icon="lucide-check" />
                    </span>
                  )}
                </button>

                {isEditing && editTargetRect && (
                  <ModalPortal>
                    <div
                      ref={editPanelRef}
                      className="windrose-color-edit-panel"
                      style={{
                        position: 'fixed',
                        left: `${editTargetRect.right + 4}px`,
                        top: `${editTargetRect.top}px`
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                    >
                      <div className="windrose-color-edit-opacity">
                        <span className="windrose-color-edit-opacity-label">Opacity</span>
                        <input
                          type="range"
                          min="10"
                          max="100"
                          value={Math.round(editingOpacity * 100)}
                          onChange={handleEditOpacityChange}
                          onInput={handleEditOpacityChange}
                          onMouseDown={(e) => e.stopPropagation()}
                          onTouchStart={(e) => e.stopPropagation()}
                        />
                        <span className="windrose-color-edit-opacity-value">{Math.round(editingOpacity * 100)}%</span>
                      </div>

                      <button
                        className="windrose-color-edit-delete"
                        onClick={(e) => handleDeleteClick(e, colorDef.id)}
                        ref={tooltipRef('Delete custom color')}
                      >
                        <Icon icon="lucide-trash-2" />
                      </button>
                    </div>
                  </ModalPortal>
                )}
              </div>
            );
          }
        })}
      </div>

      {onOpacityChange && (
        <div className="windrose-color-opacity-section">
          <div className="windrose-color-opacity-header">
            <span className="windrose-color-opacity-label">Opacity</span>
            <span className="windrose-color-opacity-value">{Math.round(opacity * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round(opacity * 100)}
            onChange={(e) => onOpacityChange(parseInt((e.target as HTMLInputElement).value, 10) / 100)}
            className="windrose-color-opacity-slider"
          />
        </div>
      )}
    </div>
  );

  const overlayEl = (
    <div
      className="windrose-color-picker-overlay"
      onClick={onClose}
      onTouchEnd={(e) => { e.preventDefault(); onClose(); }}
    />
  );

  if (floatingMode) {
    return pickerEl;
  }
  if (portalled) {
    return <ModalPortal><Fragment>{overlayEl}{pickerEl}</Fragment></ModalPortal>;
  }
  return <Fragment>{overlayEl}{pickerEl}</Fragment>;
};

export { ColorPicker, DEFAULT_COLOR };
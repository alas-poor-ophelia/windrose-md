/**
 * ColorPicker.tsx
 *
 * Color picker component with custom color support and opacity controls.
 */

import type { JSX, VNode } from 'preact';
import { Fragment } from 'preact';
import type { CustomColor, HexColor } from '#types/core/common.types';

import type { MutableRef } from 'preact/hooks';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { getColorPalette, DEFAULT_COLOR } from '../../drawing/colorOperations';
import { ModalPortal } from '../modals/ModalPortal';
import { Icon } from './Icon';






/** Color definition from palette */
export interface ColorDef {
  id: string;
  color: HexColor;
  label: string;
  opacity?: number;
  isCustom?: boolean;
  isReset?: boolean;
  isAddButton?: boolean;
}

/** Position for color picker */
export type PickerPosition = 'below' | 'above' | null;

/** Alignment for color picker */
export type PickerAlign = 'left' | 'right';

/** Per-color opacity overrides */
export type ColorOpacityOverrides = Record<string, number>;

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
  const colorInputRef = useRef<HTMLInputElement>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editingOpacityRef = useRef(editingOpacity);
  const editTargetIdRef = useRef(editTargetId);
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

  const saveAndCloseEditPanel = useCallback(() => {
    if (editTargetIdRef.current == null) return;
    if (justOpenedEditRef.current) return;

    saveOpacityChanges();
    setEditTargetId(null);
  }, [saveOpacityChanges]);

  useEffect(() => {
    if (!isOpen && editTargetIdRef.current != null) {
      saveOpacityChanges();
      setEditTargetId(null);
    }
  }, [isOpen, saveOpacityChanges]);

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

  const handlePickerClick = (e: JSX.TargetedMouseEvent<HTMLDivElement>): void => {
    e.stopPropagation();
  };

  const handlePickerMouseDown = (e: JSX.TargetedMouseEvent<HTMLDivElement>): void => {
    e.stopPropagation();

    if (editTargetId != null && editTargetId !== '' && !(e.target as Element).closest('.windrose-color-edit-panel')) {
      if (!justOpenedEditRef.current) {
        saveAndCloseEditPanel();
      }
    }
  };

  const handlePickerTouch = (e: JSX.TargetedTouchEvent<HTMLDivElement>): void => {
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

  const handleReset = (e: JSX.TargetedMouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation();
    onReset();
  };

  const handleColorInput = (e: JSX.TargetedEvent<HTMLInputElement, Event>): void => {
    const value = (e.target as HTMLInputElement).value;
    if (pendingCustomColorRef) {
      pendingCustomColorRef.current = value;
    }
  };

  const handleColorContextMenu = (e: JSX.TargetedMouseEvent<HTMLButtonElement>, colorDef: ColorDef): void => {
    if (colorDef.isReset === true || colorDef.isAddButton === true) return;
    e.preventDefault();
    e.stopPropagation();

    setEditTargetId(colorDef.id);
    setEditingOpacity(colorDef.opacity ?? 1);
    justOpenedEditRef.current = true;
    setTimeout(() => { justOpenedEditRef.current = false; }, 100);
  };

  const handleLongPressStart = (colorDef: ColorDef): void => {
    if (colorDef.isReset === true || colorDef.isAddButton === true) return;
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;

      setEditTargetId(colorDef.id);
      setEditingOpacity(colorDef.opacity ?? 1);
      justOpenedEditRef.current = true;
      setTimeout(() => { justOpenedEditRef.current = false; }, 300);
    }, 500);
  };

  const handleLongPressCancel = (): void => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleDeleteClick = (e: JSX.TargetedMouseEvent<HTMLButtonElement>, colorId: string): void => {
    e.preventDefault();
    e.stopPropagation();
    if (onDeleteCustomColor) {
      onDeleteCustomColor(colorId);
    }
    setEditTargetId(null);
  };

  const handleEditOpacityChange = (e: JSX.TargetedEvent<HTMLInputElement, Event>): void => {
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
    { id: 'reset', color: '' as HexColor, label: 'Reset to default', isReset: true },
    ...paletteColorsWithOverrides,
    ...customColors.map(c => ({ ...c, label: c.label ?? c.color, isCustom: true })),
    { id: 'add-custom', color: '' as HexColor, label: 'Add custom color', isAddButton: true }
  ];

  const horizontalStyle = align === 'right'
    ? { right: '0', left: 'auto' }
    : { left: '0' };

  let pickerStyle: JSX.CSSProperties;

  if (floatingMode) {
    pickerStyle = {};
  } else if (portalled && anchorRef?.current) {
    const rect = anchorRef.current.getBoundingClientRect();
    const gap = 8;
    pickerStyle = {
      position: 'fixed',
      left: `${rect.left}px`,
      ...(position === 'above'
        ? { bottom: `${window.innerHeight - rect.top + gap}px` }
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
                title={colorDef.label}
              >
                <Icon icon="lucide-circle-x" />
              </button>
            );
          } else if (colorDef.isAddButton === true) {
            return (
              <div
                key={colorDef.id}
                className="windrose-color-swatch windrose-color-swatch-add"
                title={colorDef.label}
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
                  onTouchStart={() => handleLongPressStart(colorDef)}
                  onTouchEnd={handleLongPressCancel}
                  onTouchMove={handleLongPressCancel}
                  onMouseDown={handleLongPressCancel}
                  title={colorDef.label + (hasStoredOpacity ? ` (${Math.round((colorDef.opacity ?? 1) * 100)}%)` : '')}
                >
                  {selectedColor === colorDef.color && (
                    <span className="windrose-color-checkmark">
                      <Icon icon="lucide-check" />
                    </span>
                  )}
                </button>

                {isEditing && (
                  <div
                    className="windrose-color-edit-panel"
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
                      title="Delete custom color"
                    >
                      <Icon icon="lucide-trash-2" />
                    </button>
                  </div>
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
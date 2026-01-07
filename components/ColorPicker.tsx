/**
 * ColorPicker.tsx
 *
 * Color picker component with custom color support and opacity controls.
 */

import type { JSX } from 'preact';
import type { HexColor } from '#types/core/common.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);
const { getColorPalette, DEFAULT_COLOR } = await requireModuleByName("colorOperations.ts");

/** Color definition from palette */
export interface ColorDef {
  id: string;
  color: HexColor;
  label: string;
  opacity?: number;
  isCustom?: boolean;
  isReset?: boolean;
  isAddButton?: boolean;
  isPreview?: boolean;
}

/** Custom color with opacity */
export interface CustomColor {
  id: string;
  color: HexColor;
  label?: string;
  opacity?: number;
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
  pendingCustomColorRef?: React.MutableRefObject<HexColor | null>;
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
  onOpacityChange = null
}: ColorPickerProps): React.ReactElement | null => {
  const [previewColor, setPreviewColor] = dc.useState<HexColor | null>(null);
  const [editTargetId, setEditTargetId] = dc.useState<string | null>(null);
  const [editingOpacity, setEditingOpacity] = dc.useState(1);
  const colorInputRef = dc.useRef<HTMLInputElement>(null);
  const longPressTimerRef = dc.useRef<ReturnType<typeof setTimeout> | null>(null);
  const editingOpacityRef = dc.useRef(editingOpacity);
  const editTargetIdRef = dc.useRef(editTargetId);
  const justOpenedEditRef = dc.useRef(false);
  const longPressTriggeredRef = dc.useRef(false);

  editingOpacityRef.current = editingOpacity;
  editTargetIdRef.current = editTargetId;

  const saveOpacityChanges = dc.useCallback(() => {
    const targetId = editTargetIdRef.current;
    const currentOpacity = editingOpacityRef.current;

    if (!targetId) return;

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

  const saveAndCloseEditPanel = dc.useCallback(() => {
    if (!editTargetIdRef.current) return;
    if (justOpenedEditRef.current) return;

    saveOpacityChanges();
    setEditTargetId(null);
  }, [saveOpacityChanges]);

  dc.useEffect(() => {
    if (!isOpen && editTargetIdRef.current) {
      saveOpacityChanges();
      setEditTargetId(null);
    }
  }, [isOpen, saveOpacityChanges]);

  if (!isOpen) return null;

  const handlePickerClick = (e: JSX.TargetedMouseEvent<HTMLDivElement>): void => {
    e.stopPropagation();
  };

  const handlePickerMouseDown = (e: JSX.TargetedMouseEvent<HTMLDivElement>): void => {
    e.stopPropagation();

    if (editTargetId && !(e.target as Element).closest('.dmt-color-edit-panel')) {
      if (!justOpenedEditRef.current) {
        saveAndCloseEditPanel();
      }
    }
  };

  const handlePickerTouch = (e: JSX.TargetedTouchEvent<HTMLDivElement>): void => {
    e.stopPropagation();

    if (editTargetId && !(e.target as Element).closest('.dmt-color-edit-panel')) {
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
    const value = (e.target as HTMLInputElement).value as HexColor;
    setPreviewColor(value);
    if (pendingCustomColorRef) {
      pendingCustomColorRef.current = value;
    }
  };

  const handleAddClick = (): void => {
    setPreviewColor('#888888' as HexColor);
    if (pendingCustomColorRef) {
      pendingCustomColorRef.current = '#888888' as HexColor;
    }
  };

  const handleColorContextMenu = (e: JSX.TargetedMouseEvent<HTMLButtonElement>, colorDef: ColorDef): void => {
    if (colorDef.isReset || colorDef.isAddButton || colorDef.isPreview) return;
    e.preventDefault();
    e.stopPropagation();

    setEditTargetId(colorDef.id);
    setEditingOpacity(colorDef.opacity ?? 1);
    justOpenedEditRef.current = true;
    setTimeout(() => { justOpenedEditRef.current = false; }, 100);
  };

  const handleLongPressStart = (colorDef: ColorDef): void => {
    if (colorDef.isReset || colorDef.isAddButton || colorDef.isPreview) return;
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
    const override = paletteColorOpacityOverrides[c.id];
    return override !== undefined ? { ...c, opacity: override } : c;
  });

  const allColors: ColorDef[] = [
    { id: 'reset', color: '' as HexColor, label: 'Reset to default', isReset: true },
    ...paletteColorsWithOverrides,
    ...customColors.map(c => ({ ...c, label: c.label ?? c.color, isCustom: true })),
    ...(previewColor ? [{
      id: 'preview',
      color: previewColor,
      label: 'Selecting...',
      isPreview: true
    }] : []),
    { id: 'add-custom', color: '' as HexColor, label: 'Add custom color', isAddButton: true }
  ];

  const horizontalStyle = align === 'right'
    ? { right: '0', left: 'auto' }
    : { left: '0' };

  return (
    <div
      className="dmt-color-picker"
      onClick={handlePickerClick}
      onMouseDown={handlePickerMouseDown}
      onTouchStart={handlePickerTouch}
      onTouchMove={handlePickerTouch}
      onTouchEnd={handlePickerTouch}
      style={{
        position: 'absolute',
        ...(position === 'above'
          ? { bottom: 'calc(100% + 8px)', top: 'auto' }
          : { top: 'calc(100% + 8px)' }
        ),
        ...horizontalStyle,
        zIndex: 1501
      }}
    >
      <div className="dmt-color-picker-header">
        <span className="dmt-color-picker-title">{title}</span>
      </div>

      <div className="dmt-color-grid">
        {allColors.map(colorDef => {
          if (colorDef.isReset) {
            return (
              <button
                key={colorDef.id}
                className="dmt-color-swatch dmt-color-swatch-reset"
                onClick={handleReset}
                title={colorDef.label}
              >
                <dc.Icon icon="lucide-circle-x" />
              </button>
            );
          } else if (colorDef.isPreview) {
            return (
              <div
                key={colorDef.id}
                className="dmt-color-swatch dmt-color-swatch-preview"
                style={{ backgroundColor: colorDef.color }}
                title="Selecting..."
              >
                <span className="dmt-color-preview-spinner">
                  <dc.Icon icon="lucide-loader" />
                </span>
              </div>
            );
          } else if (colorDef.isAddButton) {
            return (
              <div
                key={colorDef.id}
                className="dmt-color-swatch dmt-color-swatch-add"
                title={colorDef.label}
                onClick={handleAddClick}
              >
                <input
                  ref={colorInputRef}
                  type="color"
                  className="dmt-color-input-as-button"
                  onInput={handleColorInput}
                  defaultValue={selectedColor || '#ffffff'}
                  aria-label="Add custom color"
                />
                <span className="dmt-color-add-icon-overlay">+</span>
              </div>
            );
          } else {
            const isEditing = editTargetId === colorDef.id;
            const displayOpacity = isEditing ? editingOpacity : (colorDef.opacity ?? 1);
            const hasStoredOpacity = (colorDef.opacity ?? 1) < 1;

            return (
              <div key={colorDef.id} style={{ position: 'relative', display: 'inline-block' }}>
                <button
                  className={`dmt-color-swatch interactive-child ${selectedColor === colorDef.color ? 'dmt-color-swatch-selected' : ''}`}
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
                    <span className="dmt-color-checkmark">
                      <dc.Icon icon="lucide-check" />
                    </span>
                  )}
                </button>

                {isEditing && (
                  <div
                    className="dmt-color-edit-panel"
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                  >
                    <div className="dmt-color-edit-opacity">
                      <span className="dmt-color-edit-opacity-label">Opacity</span>
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
                      <span className="dmt-color-edit-opacity-value">{Math.round(editingOpacity * 100)}%</span>
                    </div>

                    <button
                      className="dmt-color-edit-delete"
                      onClick={(e) => handleDeleteClick(e, colorDef.id)}
                      title="Delete custom color"
                    >
                      <dc.Icon icon="lucide-trash-2" />
                    </button>
                  </div>
                )}
              </div>
            );
          }
        })}
      </div>

      {onOpacityChange && (
        <div className="dmt-color-opacity-section">
          <div className="dmt-color-opacity-header">
            <span className="dmt-color-opacity-label">Opacity</span>
            <span className="dmt-color-opacity-value">{Math.round(opacity * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round(opacity * 100)}
            onChange={(e) => onOpacityChange(parseInt((e.target as HTMLInputElement).value, 10) / 100)}
            className="dmt-color-opacity-slider"
          />
        </div>
      )}
    </div>
  );
};

return { ColorPicker, DEFAULT_COLOR };

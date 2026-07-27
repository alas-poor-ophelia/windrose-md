/**
 * IconPickerPopup.tsx
 *
 * Compact icon picker popup following the ColorPicker popup pattern
 * (overlay + optional portal anchored to a trigger button). Offers the
 * RPGAwesome icon set with search, plus a literal-symbol path: a short
 * search string can be applied directly as a unicode/emoji glyph.
 *
 * Selected identifiers use the same dual format as layer and object icons:
 * an `ra-*` class name, or a literal symbol string.
 */

import type { CSSProperties, VNode } from 'preact';
import { Fragment } from 'preact';
import { useMemo, useState } from 'preact/hooks';

import { RA_ICONS, searchIcons } from '../../assets/rpgAwesomeIcons';
import { ModalPortal } from '../modals/ModalPortal';
import { Icon } from './Icon';

/** Props for IconPickerPopup */
export interface IconPickerPopupProps {
  /** Whether the picker is open */
  isOpen: boolean;
  /** Currently selected icon (`ra-*` class or literal symbol), or null */
  selectedIcon: string | null;
  /** Callback when an icon or symbol is chosen */
  onIconSelect: (icon: string) => void;
  /** Callback to clear the icon */
  onClear: () => void;
  /** Callback to close the picker */
  onClose: () => void;
  /** Picker title */
  title?: string;
  /** Vertical position relative to the anchor */
  position?: 'above' | 'below';
  /** Render in a portal anchored to anchorRef (escapes overflow clipping) */
  portalled?: boolean;
  /** Anchor element for portalled positioning */
  anchorRef?: { current: HTMLElement | null };
}

/** Search strings this short are offered as literal symbols (emoji, ★, etc.) */
const SYMBOL_QUERY_MAX_LENGTH = 3;

const IconPickerPopup = ({
  isOpen,
  selectedIcon,
  onIconSelect,
  onClear,
  onClose,
  title = 'Icon',
  position = 'below',
  portalled = false,
  anchorRef
}: IconPickerPopupProps): VNode | null => {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const trimmed = query.trim();
    if (trimmed === '') {
      return Object.entries(RA_ICONS).map(([iconClass, data]) => ({ iconClass, ...data }));
    }
    return searchIcons(trimmed);
  }, [query]);

  if (!isOpen) return null;

  const trimmedQuery = query.trim();
  const offerSymbol = trimmedQuery !== '' && trimmedQuery.length <= SYMBOL_QUERY_MAX_LENGTH;

  let pickerStyle: CSSProperties;
  if (portalled && anchorRef?.current) {
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
      left: '0',
      ...(position === 'above'
        ? { bottom: 'calc(100% + 8px)', top: 'auto' }
        : { top: 'calc(100% + 8px)' }
      )
    };
  }

  const pickerEl = (
    <div
      className="windrose-icon-picker"
      style={pickerStyle}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      <div className="windrose-icon-picker-header">
        <span className="windrose-icon-picker-title">{title}</span>
        <button
          className="windrose-icon-picker-clear"
          title="Clear icon"
          aria-label="Clear icon"
          onClick={onClear}
        >
          <Icon icon="lucide-circle-x" size={14} />
        </button>
      </div>

      <input
        type="text"
        className="windrose-icon-picker-search"
        placeholder="Search icons, or type a symbol…"
        value={query}
        onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
      />

      {offerSymbol && (
        <button
          className="windrose-icon-picker-symbol"
          onClick={() => onIconSelect(trimmedQuery)}
        >
          Use “{trimmedQuery}” as symbol
        </button>
      )}

      <div className="windrose-icon-picker-grid">
        {results.map(icon => (
          <button
            key={icon.iconClass}
            className={`windrose-icon-picker-cell interactive-child ${selectedIcon === icon.iconClass ? 'is-selected' : ''}`}
            title={icon.label}
            aria-label={icon.label}
            onClick={() => onIconSelect(icon.iconClass)}
          >
            <span className="windrose-icon-picker-glyph">{icon.char}</span>
          </button>
        ))}
        {results.length === 0 && (
          <div className="windrose-icon-picker-empty">No icons match</div>
        )}
      </div>
    </div>
  );

  const overlayEl = (
    <div
      className="windrose-icon-picker-overlay"
      onClick={onClose}
      onTouchEnd={(e) => { e.preventDefault(); onClose(); }}
    />
  );

  if (portalled) {
    return <ModalPortal><Fragment>{overlayEl}{pickerEl}</Fragment></ModalPortal>;
  }
  return <Fragment>{overlayEl}{pickerEl}</Fragment>;
};

export { IconPickerPopup };

/**
 * LayerEditModal.tsx
 */

import type { JSX, VNode } from 'preact';
import type { MapLayer } from '#types/core/map.types';
import type { IconWithClass } from '#types/objects/icon.types';

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { RA_CATEGORIES, RA_ICONS, getIconInfo, getIconsByCategory, searchIcons } from '../../assets/rpgAwesomeIcons';






const LAYER_NAME_MAX_LENGTH = 25;
const LAYER_NAME_TRUNCATE_AT = 22;
const ICON_GRID_MAX_VISIBLE = 100;

const QUICK_SYMBOLS = [
  '1', '2', '3', '4', '5', '6', '7', '8', '9',
  '★', '☆', '●', '○', '◆', '◇', '■', '□',
  '▲', '△', '▼', '▽', '⚔', '🏰', '⛪', '🗝',
  '🚪', '⬆', '⬇', '🔥', '💧', '🌳', '⚡', '💀'
];

type IconMode = 'none' | 'symbol' | 'rpgawesome';

/** Props for LayerEditModal */
export interface LayerEditModalProps {
  /** The layer being edited */
  layer: MapLayer;
  /** Default name to show when name matches layer order */
  defaultName: string;
  /** Callback when save is clicked */
  onSave: (name: string, icon: string | null) => void;
  /** Callback when modal is cancelled */
  onCancel: () => void;
}

const LayerEditModal = ({
  layer,
  defaultName,
  onSave,
  onCancel
}: LayerEditModalProps): VNode => {
  const isDefaultLayerName = layer.name == null || layer.name === '' || layer.name === defaultName;
  const initialName = isDefaultLayerName ? '' : layer.name;
  const initialIcon = (layer.icon != null && layer.icon !== '') ? layer.icon : null;
  const initialMode: IconMode = (initialIcon != null && initialIcon !== '')
    ? (initialIcon.startsWith('ra-') ? 'rpgawesome' : 'symbol')
    : 'none';

  const [name, setName] = useState(initialName);
  const [iconMode, setIconMode] = useState<IconMode>(initialMode);
  const [symbol, setSymbol] = useState(
    initialIcon != null && initialIcon !== '' && !initialIcon.startsWith('ra-') ? initialIcon : ''
  );
  const [iconClass, setIconClass] = useState(
    initialIcon != null && initialIcon !== '' && initialIcon.startsWith('ra-') ? initialIcon : ''
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [iconCategory, setIconCategory] = useState('all');

  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, []);

  const handleKeyDown = (e: JSX.TargetedKeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const handleSave = (): void => {
    // Read from input ref directly to avoid stale state when Enter is pressed quickly
    const currentName = nameInputRef.current?.value ?? name;
    const finalName = currentName.trim() || defaultName;
    let finalIcon: string | null = null;

    if (iconMode === 'symbol' && symbol) {
      finalIcon = symbol;
    } else if (iconMode === 'rpgawesome' && iconClass) {
      finalIcon = iconClass;
    }

    onSave(finalName, finalIcon);
  };

  const handleModalClick = (e: JSX.TargetedMouseEvent<HTMLDivElement>): void => {
    e.stopPropagation();
  };

  const getDisplayName = (): string => {
    return name.trim() || defaultName;
  };

  const getDisplayIcon = (): string | null => {
    if (iconMode === 'symbol' && symbol !== '') return symbol;
    if (iconMode === 'rpgawesome' && iconClass !== '') {
      const info = getIconInfo(iconClass);
      return info?.char ?? null;
    }
    return null;
  };

  const filteredIcons = useMemo((): IconWithClass[] => {
    if (searchQuery.trim()) {
      return searchIcons(searchQuery);
    }
    if (iconCategory === 'all') {
      return Object.entries(RA_ICONS).map(([cls, data]) => ({
        iconClass: cls,
        ...data
      }));
    }
    return getIconsByCategory(iconCategory);
  }, [searchQuery, iconCategory]);

  return (
    <div className="windrose-modal-overlay" onMouseDown={onCancel}>
      <div
        className="windrose-modal-content windrose-layer-edit-modal"
        onMouseDown={handleModalClick}
      >
        <h3 className="windrose-modal-title">Edit Layer</h3>

        {/* Name input */}
        <div className="windrose-layer-edit-section">
          <label className="windrose-layer-edit-label">Name</label>
          <input
            ref={nameInputRef}
            type="text"
            className="windrose-modal-input"
            value={name}
            onChange={(e) => setName((e.target as HTMLInputElement).value)}
            onKeyDown={handleKeyDown}
            placeholder={defaultName}
          />
        </div>

        {/* Icon mode toggle */}
        <div className="windrose-layer-edit-section">
          <label className="windrose-layer-edit-label">Icon (optional)</label>
          <div className="windrose-icon-mode-toggle">
            <button
              type="button"
              className={`windrose-icon-mode-btn ${iconMode === 'none' ? 'active' : ''}`}
              onClick={() => setIconMode('none')}
            >
              None
            </button>
            <button
              type="button"
              className={`windrose-icon-mode-btn ${iconMode === 'symbol' ? 'active' : ''}`}
              onClick={() => setIconMode('symbol')}
            >
              Symbol
            </button>
            <button
              type="button"
              className={`windrose-icon-mode-btn ${iconMode === 'rpgawesome' ? 'active' : ''}`}
              onClick={() => setIconMode('rpgawesome')}
            >
              RPGAwesome
            </button>
          </div>
        </div>

        {/* Symbol picker */}
        {iconMode === 'symbol' && (
          <div className="windrose-layer-edit-section">
            <div className="windrose-symbol-input-row">
              <input
                type="text"
                className="windrose-symbol-input"
                value={symbol}
                onChange={(e) => setSymbol((e.target as HTMLInputElement).value)}
                placeholder="Type or select..."
                maxLength={8}
              />
              <div className="windrose-symbol-preview">
                {symbol || '?'}
              </div>
            </div>
            <div className="windrose-quick-symbols-grid">
              {QUICK_SYMBOLS.map((sym) => (
                <button
                  key={sym}
                  type="button"
                  className={`windrose-quick-symbol-btn ${symbol === sym ? 'selected' : ''}`}
                  onClick={() => setSymbol(sym)}
                >
                  {sym}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* RPGAwesome picker */}
        {iconMode === 'rpgawesome' && (
          <div className="windrose-layer-edit-section windrose-icon-picker">
            <input
              type="text"
              className="windrose-icon-search"
              value={searchQuery}
              onChange={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
              placeholder="Search icons..."
            />
            <div className="windrose-icon-category-tabs">
              <button
                type="button"
                className={`windrose-icon-category-tab ${iconCategory === 'all' ? 'active' : ''}`}
                onClick={() => setIconCategory('all')}
              >
                All
              </button>
              {RA_CATEGORIES.map((cat: { id: string; label: string }) => (
                <button
                  key={cat.id}
                  type="button"
                  className={`windrose-icon-category-tab ${iconCategory === cat.id ? 'active' : ''}`}
                  onClick={() => setIconCategory(cat.id)}
                >
                  {cat.label}
                </button>
              ))}
            </div>
            <div className="windrose-icon-grid">
              {filteredIcons.slice(0, ICON_GRID_MAX_VISIBLE).map((icon) => (
                <button
                  key={icon.iconClass}
                  type="button"
                  className={`windrose-icon-grid-btn ${iconClass === icon.iconClass ? 'selected' : ''}`}
                  onClick={() => setIconClass(icon.iconClass)}
                  title={icon.label}
                >
                  <span className="ra">{icon.char}</span>
                </button>
              ))}
              {filteredIcons.length > ICON_GRID_MAX_VISIBLE && (
                <div className="windrose-icon-grid-more">
                  +{filteredIcons.length - ICON_GRID_MAX_VISIBLE} more...
                </div>
              )}
              {filteredIcons.length === 0 && (
                <div className="windrose-icon-grid-empty">No icons found</div>
              )}
            </div>
          </div>
        )}

        {/* Preview */}
        <div className="windrose-layer-edit-section">
          <label className="windrose-layer-edit-label">Preview</label>
          <div className="windrose-layer-preview">
            <div className={`windrose-layer-preview-btn ${getDisplayIcon() != null || getDisplayName().length > 2 ? 'pill' : ''}`}>
              {getDisplayIcon() != null && (
                <span className={iconMode === 'rpgawesome' ? 'ra windrose-layer-preview-icon' : 'windrose-layer-preview-icon'}>
                  {getDisplayIcon()}
                </span>
              )}
              <span className="windrose-layer-preview-name">
                {getDisplayName().length > LAYER_NAME_MAX_LENGTH
                  ? getDisplayName().slice(0, LAYER_NAME_TRUNCATE_AT) + '...'
                  : getDisplayName()}
              </span>
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="windrose-modal-buttons">
          <button
            type="button"
            className="windrose-modal-btn windrose-modal-btn-cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="windrose-modal-btn windrose-modal-btn-submit"
            onClick={handleSave}
          >
            Save
          </button>
        </div>

        <div className="windrose-modal-hint">
          Press Enter to save, Esc to cancel
        </div>
      </div>
    </div>
  );
};

export { LayerEditModal };
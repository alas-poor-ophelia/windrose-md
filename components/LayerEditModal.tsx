 * LayerEditModal.tsx
 *

import type { JSX } from 'preact';
import type { MapLayer } from '#types/core/map.types';
import type { IconWithClass, IconMap, IconCategory } from '#types/objects/icon.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const {
  RA_CATEGORIES,
  RA_ICONS,
  getIconInfo,
  getIconsByCategory,
  searchIcons
} = await requireModuleByName("rpgAwesomeIcons.ts") as {
  RA_CATEGORIES: IconCategory[];
  RA_ICONS: IconMap;
  getIconInfo: (iconClass: string) => { char: string; label: string; category: string } | null;
  getIconsByCategory: (categoryId: string) => IconWithClass[];
  searchIcons: (query: string) => IconWithClass[];
};

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
}: LayerEditModalProps): React.ReactElement => {
  const isDefaultLayerName = !layer.name || layer.name === defaultName;
  const initialName = isDefaultLayerName ? '' : layer.name;
  const initialIcon = layer.icon || null;
  const initialMode: IconMode = initialIcon
    ? (initialIcon.startsWith('ra-') ? 'rpgawesome' : 'symbol')
    : 'none';

  const [name, setName] = dc.useState(initialName);
  const [iconMode, setIconMode] = dc.useState<IconMode>(initialMode);
  const [symbol, setSymbol] = dc.useState(
    initialIcon && !initialIcon.startsWith('ra-') ? initialIcon : ''
  );
  const [iconClass, setIconClass] = dc.useState(
    initialIcon && initialIcon.startsWith('ra-') ? initialIcon : ''
  );
  const [searchQuery, setSearchQuery] = dc.useState('');
  const [iconCategory, setIconCategory] = dc.useState('all');

  const nameInputRef = dc.useRef<HTMLInputElement>(null);

  dc.useEffect(() => {
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
    if (iconMode === 'symbol' && symbol) return symbol;
    if (iconMode === 'rpgawesome' && iconClass) {
      const info = getIconInfo(iconClass);
      return info?.char || null;
    }
    return null;
  };

  const filteredIcons = dc.useMemo((): IconWithClass[] => {
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
    <div className="dmt-modal-overlay" onMouseDown={onCancel}>
      <div
        className="dmt-modal-content dmt-layer-edit-modal"
        onMouseDown={handleModalClick}
      >
        <h3 className="dmt-modal-title">Edit Layer</h3>

        {/* Name input */}
        <div className="dmt-layer-edit-section">
          <label className="dmt-layer-edit-label">Name</label>
          <input
            ref={nameInputRef}
            type="text"
            className="dmt-modal-input"
            value={name}
            onChange={(e) => setName((e.target as HTMLInputElement).value)}
            onKeyDown={handleKeyDown}
            placeholder={defaultName}
          />
        </div>

        {/* Icon mode toggle */}
        <div className="dmt-layer-edit-section">
          <label className="dmt-layer-edit-label">Icon (optional)</label>
          <div className="dmt-icon-mode-toggle">
            <button
              type="button"
              className={`dmt-icon-mode-btn ${iconMode === 'none' ? 'active' : ''}`}
              onClick={() => setIconMode('none')}
            >
              None
            </button>
            <button
              type="button"
              className={`dmt-icon-mode-btn ${iconMode === 'symbol' ? 'active' : ''}`}
              onClick={() => setIconMode('symbol')}
            >
              Symbol
            </button>
            <button
              type="button"
              className={`dmt-icon-mode-btn ${iconMode === 'rpgawesome' ? 'active' : ''}`}
              onClick={() => setIconMode('rpgawesome')}
            >
              RPGAwesome
            </button>
          </div>
        </div>

        {/* Symbol picker */}
        {iconMode === 'symbol' && (
          <div className="dmt-layer-edit-section">
            <div className="dmt-symbol-input-row">
              <input
                type="text"
                className="dmt-symbol-input"
                value={symbol}
                onChange={(e) => setSymbol((e.target as HTMLInputElement).value)}
                placeholder="Type or select..."
                maxLength={8}
              />
              <div className="dmt-symbol-preview">
                {symbol || '?'}
              </div>
            </div>
            <div className="dmt-quick-symbols-grid">
              {QUICK_SYMBOLS.map((sym) => (
                <button
                  key={sym}
                  type="button"
                  className={`dmt-quick-symbol-btn ${symbol === sym ? 'selected' : ''}`}
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
          <div className="dmt-layer-edit-section dmt-icon-picker">
            <input
              type="text"
              className="dmt-icon-search"
              value={searchQuery}
              onChange={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
              placeholder="Search icons..."
            />
            <div className="dmt-icon-category-tabs">
              <button
                type="button"
                className={`dmt-icon-category-tab ${iconCategory === 'all' ? 'active' : ''}`}
                onClick={() => setIconCategory('all')}
              >
                All
              </button>
              {RA_CATEGORIES.map((cat: { id: string; label: string }) => (
                <button
                  key={cat.id}
                  type="button"
                  className={`dmt-icon-category-tab ${iconCategory === cat.id ? 'active' : ''}`}
                  onClick={() => setIconCategory(cat.id)}
                >
                  {cat.label}
                </button>
              ))}
            </div>
            <div className="dmt-icon-grid">
              {filteredIcons.slice(0, ICON_GRID_MAX_VISIBLE).map((icon) => (
                <button
                  key={icon.iconClass}
                  type="button"
                  className={`dmt-icon-grid-btn ${iconClass === icon.iconClass ? 'selected' : ''}`}
                  onClick={() => setIconClass(icon.iconClass)}
                  title={icon.label}
                >
                  <span className="ra">{icon.char}</span>
                </button>
              ))}
              {filteredIcons.length > ICON_GRID_MAX_VISIBLE && (
                <div className="dmt-icon-grid-more">
                  +{filteredIcons.length - ICON_GRID_MAX_VISIBLE} more...
                </div>
              )}
              {filteredIcons.length === 0 && (
                <div className="dmt-icon-grid-empty">No icons found</div>
              )}
            </div>
          </div>
        )}

        {/* Preview */}
        <div className="dmt-layer-edit-section">
          <label className="dmt-layer-edit-label">Preview</label>
          <div className="dmt-layer-preview">
            <div className={`dmt-layer-preview-btn ${getDisplayIcon() || getDisplayName().length > 2 ? 'pill' : ''}`}>
              {getDisplayIcon() && (
                <span className={iconMode === 'rpgawesome' ? 'ra dmt-layer-preview-icon' : 'dmt-layer-preview-icon'}>
                  {getDisplayIcon()}
                </span>
              )}
              <span className="dmt-layer-preview-name">
                {getDisplayName().length > LAYER_NAME_MAX_LENGTH
                  ? getDisplayName().slice(0, LAYER_NAME_TRUNCATE_AT) + '...'
                  : getDisplayName()}
              </span>
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="dmt-modal-buttons">
          <button
            type="button"
            className="dmt-modal-btn dmt-modal-btn-cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="dmt-modal-btn dmt-modal-btn-submit"
            onClick={handleSave}
          >
            Save
          </button>
        </div>

        <div className="dmt-modal-hint">
          Press Enter to save, Esc to cancel
        </div>
      </div>
    </div>
  );
};

return { LayerEditModal };

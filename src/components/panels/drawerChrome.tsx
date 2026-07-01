// Shared drawer chrome — the header and search primitives used by BOTH the tile
// pane (TileAssetBrowser) and the objects pane (ObjectSidebar) so the two read as
// one drawer. Content differs per pane; this is the common frame threaded with a
// title, an optional grid/list view toggle, and a trailing action slot.

import type { ComponentChildren, VNode } from 'preact';
import { Icon } from '../shared/Icon';

export type DrawerViewMode = 'grid' | 'list';

interface DrawerPaneHeadProps {
  /** Section title — restyled to match the right dock's panel headers (uppercase, muted). */
  title: string;
  /** Grid/list toggle. Omit both to hide the toggle (e.g. compact block header). */
  viewMode?: DrawerViewMode;
  onViewModeChange?: (mode: DrawerViewMode) => void;
  /** Trailing buttons — settings/organize/collapse for tiles, close for objects. */
  actions?: ComponentChildren;
}

/** The unified pane header. Shared class so tiles and objects match exactly. */
const DrawerPaneHead = ({ title, viewMode, onViewModeChange, actions }: DrawerPaneHeadProps): VNode => (
  <div className="windrose-tb-head">
    <div className="windrose-tb-title">{title}</div>
    {viewMode != null && onViewModeChange != null && (
      <div className="windrose-tb-viewtoggle" role="group" aria-label="View mode">
        <button
          className={`windrose-tb-iconbtn ${viewMode === 'grid' ? 'active' : 'ghost'}`}
          title="Grid view"
          aria-pressed={viewMode === 'grid'}
          onClick={() => onViewModeChange('grid')}
        >
          <Icon icon="lucide-layout-grid" size={15} />
        </button>
        <button
          className={`windrose-tb-iconbtn ${viewMode === 'list' ? 'active' : 'ghost'}`}
          title="List view"
          aria-pressed={viewMode === 'list'}
          onClick={() => onViewModeChange('list')}
        >
          <Icon icon="lucide-list" size={15} />
        </button>
      </div>
    )}
    {actions != null && <div className="windrose-tb-head-actions">{actions}</div>}
  </div>
);

interface DrawerSearchProps {
  value: string;
  placeholder: string;
  onInput: (value: string) => void;
}

/** The search field inner (icon + input). Callers wrap it in `.windrose-tb-filter`
 *  so tiles can sit a Filter button beside it and objects can stand alone. */
const DrawerSearch = ({ value, placeholder, onInput }: DrawerSearchProps): VNode => (
  <div className="windrose-tb-search">
    <Icon icon="lucide-search" size={14} />
    <input
      placeholder={placeholder}
      value={value}
      onInput={(e: Event) => onInput((e.target as HTMLInputElement).value)}
    />
  </div>
);

export { DrawerPaneHead, DrawerSearch };

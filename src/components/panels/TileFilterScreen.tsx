// Dedicated Filter screen (power-user) — drills Tags / Packs as searchable
// checklists. Shares filter state with the quick chips: the facets carry the
// live has/toggle closures, so checking a row here updates the chip row too.

import type { VNode } from 'preact';

import { useState } from 'preact/hooks';
import { Icon } from '../shared/Icon';

export interface FilterFacet {
  id: string;
  label: string;
  icon: string;
  values: string[];
  labelFor?: (v: string) => string;
  has: (v: string) => boolean;
  toggle: (v: string) => void;
  size: number;
}

export interface TileFilterScreenProps {
  /** 'types' = top level, else a facet id ('tags' | 'packs'). */
  view: string;
  /** Navigate within the screen (facet id or 'types'); null closes it. */
  onViewChange: (view: string | null) => void;
  facets: FilterFacet[];
  activeFilterCount: number;
  onClearAll: () => void;
  isGrid: boolean;
  mapType?: string;
}

const TileFilterScreen = ({
  view,
  onViewChange,
  facets,
  activeFilterCount,
  onClearAll,
  isGrid,
  mapType,
}: TileFilterScreenProps): VNode => {
  const [filterSearch, setFilterSearch] = useState('');

  return (
    <div className="windrose-tb-fscreen">
      <div className="windrose-tb-fhead">
        <button
          className="windrose-tb-iconbtn"
          title="Back"
          onClick={() => { onViewChange(view === 'types' ? null : 'types'); }}
        >
          <Icon icon="lucide-arrow-left" size={15} />
        </button>
        <div className="windrose-tb-fcrumb">
          {view === 'types' ? (
            'Filter'
          ) : (
            <>
              <span className="dim">Filter</span>
              <Icon icon="lucide-chevron-right" size={11} className="windrose-tb-crumb-chev" />
              {facets.find(f => f.id === view)?.label ?? ''}
            </>
          )}
        </div>
        <button
          className="windrose-tb-iconbtn ghost"
          style={{ marginLeft: 'auto' }}
          title="Close"
          onClick={() => { onViewChange(null); }}
        >
          <Icon icon="lucide-x" size={15} />
        </button>
      </div>

      {view === 'types' ? (
        <>
          <div className="windrose-tb-fscroll">
            {facets.map(f => (
              <button
                key={f.id}
                className="windrose-tb-frow"
                onClick={() => { setFilterSearch(''); onViewChange(f.id); }}
              >
                <Icon icon={f.icon} size={16} />
                <span className="lbl">{f.label}</span>
                {f.size > 0 && <span className="badge">{f.size}</span>}
                <Icon icon="lucide-chevron-right" size={15} />
              </button>
            ))}
            <div className="windrose-tb-frow note">
              <Icon icon="lucide-layout-dashboard" size={16} />
              <span className="lbl">Grid</span>
              <span className="auto">auto · {isGrid ? 'grid' : String(mapType)} map</span>
            </div>
          </div>
          {activeFilterCount > 0 && (
            <button className="windrose-tb-fbig ghost" onClick={onClearAll}>
              Clear all filters
            </button>
          )}
        </>
      ) : (() => {
        const f = facets.find(x => x.id === view);
        if (f == null) return null;
        const q = filterSearch.toLowerCase();
        const vis = f.values.filter(v =>
          String(f.labelFor != null ? f.labelFor(v) : v).toLowerCase().includes(q));
        return (
          <>
            <div className="windrose-tb-fsearchwrap">
              <div className="windrose-tb-search">
                <Icon icon="lucide-search" size={14} />
                <input
                  autoFocus
                  placeholder={`Search ${f.label.toLowerCase()}…`}
                  value={filterSearch}
                  onInput={(e: Event) => setFilterSearch((e.target as HTMLInputElement).value)}
                />
                {filterSearch !== '' && (
                  <button
                    className="windrose-tb-iconbtn ghost"
                    style={{ width: 20, height: 20 }}
                    title="Clear search"
                    onClick={() => { setFilterSearch(''); }}
                  >
                    <Icon icon="lucide-x" size={12} />
                  </button>
                )}
              </div>
            </div>
            <div className="windrose-tb-fscroll">
              {vis.map(v => {
                const on = f.has(v);
                const lbl = f.labelFor != null ? f.labelFor(v) : v;
                return (
                  <button key={v} className="windrose-tb-vrow" onClick={() => { f.toggle(v); }}>
                    <span className={`windrose-tb-fcheck ${on ? 'on' : ''}`}>
                      {on && <Icon icon="lucide-check" size={13} />}
                    </span>
                    <span className="vlbl">{lbl}</span>
                  </button>
                );
              })}
              {vis.length === 0 && (
                <div className="windrose-tb-fempty">No {f.label.toLowerCase()} match “{filterSearch}”.</div>
              )}
            </div>
            <button className="windrose-tb-fbig" onClick={() => { onViewChange('types'); }}>
              <Icon icon="lucide-check" size={15} />
              Done{f.size > 0 ? ` · ${f.size}` : ''}
            </button>
          </>
        );
      })()}
    </div>
  );
};

export { TileFilterScreen };

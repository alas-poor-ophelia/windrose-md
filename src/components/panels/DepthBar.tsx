import type { VNode } from 'preact';
import type { TileLayerRole } from '#types/tiles/tile.types';
import type { RoleMeta as DepthMeta } from '../../assets/tileRoles';

import { useState, useCallback } from 'preact/hooks';
import { Icon } from '../shared/Icon';
import { ROLE_META as DEPTHS, roleMeta as depthMeta } from '../../assets/tileRoles';

// ==========================================
// EyeToggle
// ==========================================

interface EyeToggleProps {
  on: boolean;
  onClick?: () => void;
  size?: number;
}

function EyeToggle({ on, onClick, size = 12 }: EyeToggleProps): VNode {
  return (
    <span
      className="windrose-db-eye"
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      title={on ? 'Layer visible — click to hide' : 'Layer hidden — click to show'}
    >
      <Icon icon={on ? 'eye' : 'eye-off'} size={size} />
    </span>
  );
}

// ==========================================
// DepthBar (horizontal, for open panel)
// ==========================================

interface DepthBarProps {
  active: TileLayerRole;
  onPick: (depth: TileLayerRole) => void;
  hidden: Set<TileLayerRole>;
  onToggleHide: (depth: TileLayerRole) => void;
  tileCounts?: Record<TileLayerRole, number>;
  compact?: boolean;
}

function DepthBar({ active, onPick, hidden, onToggleHide, tileCounts, compact = false }: DepthBarProps): VNode {
  const [fanOpen, setFanOpen] = useState(false);

  const handleSegmentClick = useCallback((id: TileLayerRole) => {
    if (id === active) {
      setFanOpen(o => !o);
    } else {
      onPick(id);
      setFanOpen(false);
    }
  }, [active, onPick]);

  const handleFanPick = useCallback((id: TileLayerRole) => {
    onPick(id);
    setFanOpen(false);
  }, [onPick]);

  const stack = [...DEPTHS].reverse();

  return (
    <div className={`windrose-db-wrap${compact ? ' is-compact' : ''}`}>
      <div className="windrose-db-bar">
        {DEPTHS.map(d => {
          const isActive = d.id === active;
          const isOff = hidden.has(d.id);
          const count = tileCounts?.[d.id] ?? 0;
          const cls = [
            'windrose-db-seg',
            isActive ? 'is-active' : '',
            isActive && fanOpen ? 'is-open' : '',
          ].filter(Boolean).join(' ');

          return (
            <button
              key={d.id}
              className={cls}
              title={`${d.label} · ${count} tiles${isOff ? ' · hidden' : ''}`}
              onClick={() => handleSegmentClick(d.id)}
            >
              <span className="windrose-db-cap" style={{ '--depth-color': `var(--windrose-depth-${d.id})`, opacity: isOff ? 0.4 : isActive ? 1 : 0.65 }} />
              <Icon icon={d.icon} size={isActive ? 15 : 14} className={`windrose-db-icon ${isOff ? 'is-disabled' : ''}`} />
              {isActive && <span className="windrose-db-lbl">{d.label}</span>}
              {isActive && !compact && <span className="windrose-db-cnt">{count}</span>}
              {isActive && (
                <EyeToggle on={!isOff} onClick={() => onToggleHide(d.id)} />
              )}
              {isActive && (
                <span className="windrose-db-chev">
                  <Icon icon="chevron-down" size={12} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {fanOpen && (
        <>
          <span className="windrose-db-scrim" onClick={() => setFanOpen(false)} />
          <div className="windrose-db-fan">
            <div className="windrose-db-fanhint">
              <span>↑ top of stack</span>
              <span>painted last</span>
            </div>
            {stack.map(d => {
              const isActive = d.id === active;
              const isOff = hidden.has(d.id);
              const count = tileCounts?.[d.id] ?? 0;
              const cls = [
                'windrose-db-fanrow',
                isActive ? 'is-active' : '',
                isOff ? 'is-off' : '',
              ].filter(Boolean).join(' ');

              return (
                <button
                  key={d.id}
                  className={cls}
                  onClick={() => handleFanPick(d.id)}
                >
                  <span className="windrose-db-cap" style={{ '--depth-color': `var(--windrose-depth-${d.id})`, opacity: isOff ? 0.4 : 1 }} />
                  <Icon icon={d.icon} size={15} className={`windrose-db-icon ${isOff ? 'is-disabled' : ''}`} />
                  <span className="windrose-db-lbl">{d.label}</span>
                  <span className="windrose-db-cnt">{count}</span>
                  <EyeToggle on={!isOff} onClick={() => onToggleHide(d.id)} />
                </button>
              );
            })}
            <div className="windrose-db-fanhint" style={{ paddingTop: 6, paddingBottom: 2 }}>
              <span>↓ ground</span>
              <span>painted first</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ==========================================
// DepthRibbon (vertical, for collapsed spine)
// ==========================================

interface DepthRibbonProps {
  active: TileLayerRole;
  onPick: (depth: TileLayerRole) => void;
  hidden: Set<TileLayerRole>;
  onToggleHide: (depth: TileLayerRole) => void;
  tileCounts?: Record<TileLayerRole, number>;
}

function DepthRibbon({ active, onPick, hidden, onToggleHide, tileCounts }: DepthRibbonProps): VNode {
  const stack = [...DEPTHS].reverse();

  return (
    <div className="windrose-dsr">
      <div className="windrose-dsr-label">top</div>
      {stack.map(d => {
        const isActive = d.id === active;
        const isOff = hidden.has(d.id);
        const count = tileCounts?.[d.id] ?? 0;
        const cls = [
          'windrose-dsr-row',
          isActive ? 'is-active' : '',
        ].filter(Boolean).join(' ');

        return (
          <div
            key={d.id}
            className={cls}
            onClick={() => onPick(d.id)}
            title={`${d.label} · ${count} tiles${isOff ? ' · hidden' : ''}`}
            style={{ opacity: isOff && !isActive ? 0.55 : 1 }}
          >
            <span className="windrose-dsr-bar" style={{ '--depth-color': `var(--windrose-depth-${d.id})`, opacity: isOff ? 0.3 : isActive ? 1 : 0.85 }} />
            <Icon icon={d.icon} size={16} className={`windrose-dsr-icon ${isActive ? 'is-active' : ''}`} />
            {isOff
              ? <EyeToggle on={false} onClick={() => onToggleHide(d.id)} size={11} />
              : <span className="windrose-dsr-cnt" style={{ color: isActive ? 'var(--windrose-border-primary)' : undefined }}>{count}</span>
            }
          </div>
        );
      })}
      <div className="windrose-dsr-spacer" />
      <div className="windrose-dsr-label">gnd</div>
    </div>
  );
}

export { DepthBar, DepthRibbon, EyeToggle, DEPTHS, depthMeta };
export type { DepthBarProps, DepthRibbonProps, DepthMeta };

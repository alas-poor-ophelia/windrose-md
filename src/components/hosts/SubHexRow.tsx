// SubHexRow.tsx - Sub-hex breadcrumb row under the map header: breadcrumb
// trail, adjacent sub-map toggle, and copy-link-to-this-sub-hex. The row
// height tweens open (.is-open) after the dive settles.

import type { VNode, ComponentProps } from 'preact';
import { SubHexBreadcrumb } from '../controls/SubHexBreadcrumb';
import { Icon } from '../shared/Icon';
import { tooltipRef } from '../shared/obsidianTooltip';

interface SubHexRowProps {
  /** Row expanded (delayed reveal). */
  open: boolean;
  /** Row content rendered (inside a sub-hex, not in picture frame). */
  show: boolean;
  breadcrumbs: ComponentProps<typeof SubHexBreadcrumb>['breadcrumbs'];
  onNavigate: ComponentProps<typeof SubHexBreadcrumb>['onNavigate'];
  hasAdjacent: boolean;
  showAdjacent: boolean;
  onToggleAdjacent: () => void;
  /** Copy-link needs a host note, so it is block mode only. */
  onCopyLink: (() => void) | null;
}

const ROW_BUTTON_STYLE = {
  padding: '2px 8px',
  fontSize: '11px',
  border: '1px solid var(--background-modifier-border)',
  borderRadius: '4px',
  cursor: 'pointer',
  whiteSpace: 'nowrap'
};

const SubHexRow = ({ open, show, breadcrumbs, onNavigate, hasAdjacent, showAdjacent, onToggleAdjacent, onCopyLink }: SubHexRowProps): VNode => (
  <div className={`windrose-subhex-row${open ? ' is-open' : ''}`}>
    <div className="windrose-subhex-row-inner">
      {show && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <SubHexBreadcrumb breadcrumbs={breadcrumbs} onNavigate={onNavigate} />
          {hasAdjacent && (
            <button
              onClick={onToggleAdjacent}
              ref={tooltipRef(showAdjacent ? 'Hide adjacent sub-maps' : 'Show adjacent sub-maps')}
              style={{
                ...ROW_BUTTON_STYLE,
                background: showAdjacent ? 'var(--interactive-accent)' : 'var(--background-secondary)',
                color: showAdjacent ? 'var(--text-on-accent)' : 'var(--text-muted)',
              }}
            >
              <Icon icon="lucide-layers" />
            </button>
          )}
          {onCopyLink != null && (
            <button
              onClick={onCopyLink}
              ref={tooltipRef('Copy link to this sub-hex view')}
              style={{
                ...ROW_BUTTON_STYLE,
                background: 'var(--background-secondary)',
                color: 'var(--text-muted)',
              }}
            >
              <Icon icon="lucide-link" />
            </button>
          )}
        </div>
      )}
    </div>
  </div>
);

export { SubHexRow };

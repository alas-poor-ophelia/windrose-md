import type { ComponentChildren, VNode } from 'preact';
import { useCallback, useState } from 'preact/hooks';

import { Icon } from '../shared/Icon';

interface DockPanelProps {
  title: string;
  onUndock?: (position: { x: number; y: number }) => void;
  children: ComponentChildren;
  className?: string;
  /** Panel absorbs remaining vertical space in the dock */
  flexFill?: boolean;
  defaultCollapsed?: boolean;
  /** Controlled section-collapse state. When provided, the panel is driven by
   *  the parent (so a ribbon click can expand it); omit for internal state. */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** When set, renders a button at the header's right corner that collapses the
   *  whole dock column to its icon ribbon. Placed only on the top (Layers) panel. */
  onCollapseDock?: () => void;
}

function DockPanel({
  title,
  onUndock,
  children,
  className,
  flexFill = false,
  defaultCollapsed = false,
  collapsed,
  onToggleCollapse,
  onCollapseDock,
}: DockPanelProps): VNode {
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
  const isControlled = collapsed !== undefined;
  const isCollapsed = isControlled ? collapsed : internalCollapsed;

  const handleToggle = useCallback(() => {
    if (isControlled) onToggleCollapse?.();
    else setInternalCollapsed(prev => !prev);
  }, [isControlled, onToggleCollapse]);

  const handleUndock = useCallback((e: MouseEvent) => {
    if (!onUndock) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onUndock({ x: rect.left - 260, y: rect.top });
  }, [onUndock]);

  return (
    <div
      className={`windrose-dock-panel${flexFill ? ' windrose-dock-panel-fill' : ''}${isCollapsed ? ' windrose-dock-panel-collapsed' : ''} ${className ?? ''}`}
    >
      <div className="windrose-dock-panel-header" onClick={handleToggle}>
        <span className={`windrose-dock-panel-chevron${isCollapsed ? ' collapsed' : ''}`}>
          <Icon icon="lucide-chevron-down" size={14} />
        </span>
        <span className="windrose-dock-panel-title">{title}</span>
        {onUndock && (
          <button
            className="windrose-dock-panel-undock"
            onClick={(e) => { e.stopPropagation(); handleUndock(e as unknown as MouseEvent); }}
            title="Pop out panel"
          >
            <Icon icon="lucide-maximize-2" size={12} />
          </button>
        )}
        {onCollapseDock && (
          <button
            className="windrose-dock-panel-collapse"
            onClick={(e) => { e.stopPropagation(); onCollapseDock(); }}
            title="Collapse panels to ribbon"
          >
            <Icon icon="lucide-panel-right-close" size={14} />
          </button>
        )}
      </div>
      {!isCollapsed && (
        <div className="windrose-dock-panel-body">
          {children}
        </div>
      )}
    </div>
  );
}

export { DockPanel };
export type { DockPanelProps };

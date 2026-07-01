/**
 * DockRibbon.tsx
 *
 * Full-pane right dock, collapsed form: a thin vertical strip of icon buttons,
 * one per DOCKED sub-panel (Layers / Colors / View). Mirrors the block-mode
 * EdgeRail's icon rail, but the panels here share a single vertical stack, so
 * a click simply re-expands the dock (and the clicked section). Icons for
 * popped-out panels are omitted by the caller. Unlike the block-mode rail, this
 * ribbon shows ONLY while the dock is collapsed — never alongside the panels.
 */

import type { VNode } from 'preact';

import { Icon } from '../shared/Icon';

interface DockRibbonItem {
  id: string;
  icon: string;
  title: string;
}

interface DockRibbonProps {
  items: DockRibbonItem[];
  onExpand: (id: string) => void;
}

const DockRibbon = ({ items, onExpand }: DockRibbonProps): VNode => (
  <div className="windrose-dock-ribbon">
    {items.map(item => (
      <button
        key={item.id}
        className="windrose-dock-ribbon-btn interactive-child"
        onClick={() => onExpand(item.id)}
        title={item.title}
      >
        <Icon icon={item.icon} size={18} />
      </button>
    ))}
  </div>
);

export { DockRibbon };
export type { DockRibbonItem };

/**
 * EdgeRail.tsx
 *
 * Block-mode left dock: a 42px icon rail (Layers / Colors / View [+ Regions])
 * whose active icon folds open a ~198px panel beside it — a left drawer that
 * mirrors the right tile drawer's fold-to-ribbon. One panel at a time, picked
 * by the rail icon. Default folded (rail only) so a 600x400 map stays usable.
 * Folds as a left-anchored overlay (does NOT push the canvas) — deliberately,
 * to avoid the per-frame canvas resize-storm a width-pushing sibling causes.
 */

import type { ComponentChildren, VNode } from 'preact';

import { useRef } from 'preact/hooks';
import { Icon } from '../shared/Icon';

/** Folded-open panel width (px). Inner content is pinned to this in the SCSS. */
const DRAWER_WIDTH = 198;

interface EdgeRailPanel {
  id: string;
  icon: string;
  title: string;
  content: ComponentChildren;
}

interface EdgeRailProps {
  panels: EdgeRailPanel[];
  /** Controlled open panel id (null = folded to rail). Lets canvas controls drive the rail too. */
  openId: string | null;
  onOpenChange: (id: string | null) => void;
}

const EdgeRail = ({ panels, openId, onOpenChange }: EdgeRailProps): VNode => {
  const toggle = (id: string): void => {
    onOpenChange(openId === id ? null : id);
  };

  const openPanel = panels.find(p => p.id === openId);

  // Keep the last-open panel's content mounted through the fold-out animation so
  // the drawer collapses with its content still painted (mirrors DrawerDock).
  const lastPanelRef = useRef<EdgeRailPanel | undefined>(openPanel);
  if (openPanel != null) lastPanelRef.current = openPanel;
  const shown = openPanel ?? lastPanelRef.current;
  const isOpen = openPanel != null;

  return (
    <div className="windrose-edge-rail-root">
      <div className="windrose-edge-rail">
        {panels.map(panel => (
          <button
            key={panel.id}
            className={`windrose-edge-rail-btn interactive-child ${openId === panel.id ? 'on' : ''}`}
            onClick={() => toggle(panel.id)}
            title={panel.title}
          >
            <Icon icon={panel.icon} size={18} />
          </button>
        ))}
      </div>

      <div
        className={`windrose-edge-rail-drawer ${isOpen ? 'is-open' : 'is-collapsed'}`}
        style={{
          // Drive the fold via inline style (same proven pattern as DrawerDock).
          // Class-driven width transitions don't commit reliably for this overlay
          // in Obsidian's live-preview embed, so animate the values directly.
          width: isOpen ? DRAWER_WIDTH : 0,
          opacity: isOpen ? 1 : 0,
          visibility: isOpen ? 'visible' : 'hidden',
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: isOpen
            ? 'width .42s cubic-bezier(.2,.8,.2,1), opacity .26s ease'
            : 'width .42s cubic-bezier(.2,.8,.2,1), opacity .26s ease, visibility 0s linear .45s',
        }}
      >
        {shown != null && (
          // Per-page header ("Layers"/"Colors"/…) removed by request — the rail
          // icon toggles the drawer closed, so no collapse button is needed here.
          <div className="windrose-edge-rail-drawer-body">
            {shown.content}
          </div>
        )}
      </div>
    </div>
  );
};

export { EdgeRail };

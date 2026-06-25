/**
 * EdgeRail.tsx
 *
 * Block-mode 42px left icon rail. Each icon toggles a ~198px flyout panel
 * that overlays the left of the canvas (does NOT push it). Default closed,
 * so a 600x400 map stays usable. Replaces the old `windrose-left-panels`
 * floating chip-list.
 */

import type { ComponentChildren, VNode } from 'preact';

import { useEffect, useRef } from 'preact/hooks';
import { Icon } from '../shared/Icon';

interface EdgeRailPanel {
  id: string;
  icon: string;
  title: string;
  content: ComponentChildren;
}

interface EdgeRailProps {
  panels: EdgeRailPanel[];
  /** Controlled open panel id (null = all closed). Lets canvas controls drive the rail too. */
  openId: string | null;
  onOpenChange: (id: string | null) => void;
}

const EdgeRail = ({ panels, openId, onOpenChange }: EdgeRailProps): VNode => {
  const rootRef = useRef<HTMLDivElement>(null);

  const toggle = (id: string): void => {
    onOpenChange(openId === id ? null : id);
  };

  useEffect((): (() => void) | undefined => {
    if (openId == null) return undefined;

    const handleClickOutside = (e: MouseEvent | TouchEvent): void => {
      if (rootRef.current != null && !rootRef.current.contains(e.target as Node)) {
        onOpenChange(null);
      }
    };

    // Defer binding so the click that opened the flyout doesn't immediately close it.
    const timer = window.setTimeout(() => {
      activeDocument.addEventListener('mousedown', handleClickOutside);
      activeDocument.addEventListener('touchstart', handleClickOutside, { passive: true });
    }, 10);

    return () => {
      window.clearTimeout(timer);
      activeDocument.removeEventListener('mousedown', handleClickOutside);
      activeDocument.removeEventListener('touchstart', handleClickOutside);
    };
  }, [openId, onOpenChange]);

  const openPanel = panels.find(p => p.id === openId);

  return (
    <div className="windrose-edge-rail-root" ref={rootRef}>
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

      {openPanel != null && (
        <div className="windrose-edge-rail-flyout">
          <div className="windrose-edge-rail-flyout-header">
            <span>{openPanel.title}</span>
            <button
              className="windrose-edge-rail-flyout-close interactive-child"
              onClick={() => onOpenChange(null)}
              title="Close"
            >
              <Icon icon="lucide-x" size={14} />
            </button>
          </div>
          <div className="windrose-edge-rail-flyout-body">
            {openPanel.content}
          </div>
        </div>
      )}
    </div>
  );
};

export { EdgeRail };

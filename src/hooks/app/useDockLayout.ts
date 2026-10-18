// useDockLayout.ts - Full-pane right dock layout: whole-column collapse to an
// icon ribbon (persisted in the view's workspace state via the callback) and
// per-section collapse (controlled, so a ribbon click can expand a section).

import { useCallback, useState } from 'preact/hooks';

interface DockLayout {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  sectionCollapsed: Record<string, boolean>;
  toggleSection: (id: string) => void;
  /** Ribbon click: expand the column and the clicked section. */
  expandFromRibbon: (id: string) => void;
}

function useDockLayout(savedCollapsed: boolean | undefined, onCollapsedChange: ((collapsed: boolean) => void) | undefined): DockLayout {
  // Unlike the block-mode rail, the ribbon replaces the panels — it never shows alongside them.
  const [collapsed, setCollapsedState] = useState<boolean>(savedCollapsed ?? false);
  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedState(value);
    onCollapsedChange?.(value);
  }, [onCollapsedChange]);
  // View (and the Almanac, when offered) start collapsed; View matches its former defaultCollapsed.
  const [sectionCollapsed, setSectionCollapsed] = useState<Record<string, boolean>>({ layers: false, colorPicker: false, view: true, almanac: true });
  const toggleSection = useCallback((id: string) => {
    setSectionCollapsed(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);
  const expandFromRibbon = useCallback((id: string) => {
    setCollapsed(false);
    setSectionCollapsed(prev => ({ ...prev, [id]: false }));
  }, [setCollapsed]);
  return { collapsed, setCollapsed, sectionCollapsed, toggleSection, expandFromRibbon };
}

export { useDockLayout };
export type { DockLayout };

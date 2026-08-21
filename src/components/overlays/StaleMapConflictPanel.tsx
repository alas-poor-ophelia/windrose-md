/**
 * StaleMapConflictPanel.tsx
 *
 * Blocking panel rendered INSTEAD of the canvas when this mount's save was
 * refused as stale: another mount of the same map (a second pane or embed)
 * saved first, so this instance's whole in-memory tree is behind the file.
 * Letting it keep editing would either keep failing to save or — if forced —
 * clobber the other pane's committed work with a stale full-entry replace.
 *
 * The only safe way forward is a reload; at most ~2 seconds of edits in THIS
 * pane (one debounce window) are lost, announced rather than silently
 * destroying the other pane's session.
 */

import type { VNode } from 'preact';

interface StaleMapConflictPanelProps {
  /** Acknowledge the conflict and re-read the data file. */
  onReload: () => void;
}

const StaleMapConflictPanel = ({ onReload }: StaleMapConflictPanelProps): VNode => {
  return (
    <div className="windrose-loading">
      <p>This map was changed in another pane or window.</p>
      <p>Reload to continue editing here — unsaved changes in this view will be lost.</p>
      <p>
        <button className="mod-cta" onClick={onReload}>
          Reload map
        </button>
      </p>
    </div>
  );
};

export { StaleMapConflictPanel };

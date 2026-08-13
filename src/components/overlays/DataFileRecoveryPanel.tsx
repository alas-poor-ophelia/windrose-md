/**
 * DataFileRecoveryPanel.tsx
 *
 * Blocking panel rendered INSTEAD of the canvas when the map data file exists
 * but cannot be read. No canvas means no edits, so nothing can overwrite a file
 * whose contents are in an unknown state.
 *
 * Offers the one safe repair we can perform automatically: restore the newest
 * usable `.bak` slot written by saveMapData's rotation. The unreadable file is
 * always preserved alongside first — this panel never destroys evidence.
 */

import type { VNode } from 'preact';

import { Notice } from 'obsidian';
import { useCallback, useEffect, useState } from 'preact/hooks';

import { useApp } from '../../context/AppContext';
import { findBestBackup, restoreFromBackup } from '../../persistence/fileOperations';
import type { DataFileBackup } from '../../persistence/fileOperations';
import { ConfirmModal } from '../../settings/modals/ConfirmModal';

interface DataFileRecoveryPanelProps {
  /** Vault path of the unreadable data file. */
  dataPath: string;
  /** Reload the map data after a successful restore. Omitted → the user is told to reopen. */
  onRestored?: () => void;
}

type ProbeState = 'probing' | 'found' | 'none';

const DataFileRecoveryPanel = ({ dataPath, onRestored }: DataFileRecoveryPanelProps): VNode => {
  const app = useApp();
  const [probe, setProbe] = useState<ProbeState>('probing');
  const [backup, setBackup] = useState<DataFileBackup | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void findBestBackup(app).then((found) => {
      if (cancelled) return;
      setBackup(found);
      setProbe(found != null ? 'found' : 'none');
    });
    return () => { cancelled = true; };
  }, [app]);

  const handleRestore = useCallback(async (): Promise<void> => {
    if (backup == null || busy) return;
    setBusy(true);
    try {
      const when = backup.mtime > 0 ? new Date(backup.mtime).toLocaleString() : 'an unknown time';
      const maps = backup.mapCount === 1 ? '1 map' : `${String(backup.mapCount)} maps`;
      const confirmed = await new ConfirmModal(app, {
        message: [
          `Restore backup from ${when}? It contains ${maps}.`,
          `The current unreadable file will be preserved as ${dataPath}.corrupt-<timestamp>.`,
        ].join('\n'),
        confirmText: 'Restore',
        cancelText: 'Cancel',
      }).openAndGetValue();
      if (!confirmed) return;

      const result = await restoreFromBackup(app, backup);
      if (!result.ok) {
        new Notice('Backup could not be restored. Check the developer console for details.', 10_000);
        return;
      }
      if (onRestored != null) {
        new Notice('Backup restored.');
        onRestored();
      } else {
        new Notice('Backup restored. Reopen the map to load it.', 10_000);
      }
    } finally {
      setBusy(false);
    }
  }, [app, backup, busy, dataPath, onRestored]);

  return (
    <div className="windrose-loading">
      <p>Map data file could not be read. To avoid overwriting your data, editing is disabled.</p>
      <p><code>{dataPath}</code></p>
      <p>Restore or repair the file, then reload Obsidian.</p>
      <p>
        <button
          className="mod-cta"
          disabled={probe !== 'found' || busy}
          onClick={() => { void handleRestore(); }}
        >
          Restore from backup
        </button>
      </p>
      {probe === 'none' && <p>No usable backup found.</p>}
    </div>
  );
};

export { DataFileRecoveryPanel };

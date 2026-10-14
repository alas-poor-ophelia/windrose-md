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
import { createEmptyDataFile, findBestBackup, restoreFromBackup } from '../../persistence/fileOperations';
import type { DataFileBackup } from '../../persistence/fileOperations';
import { ConfirmModal } from '../../settings/modals/ConfirmModal';

interface DataFileRecoveryPanelProps {
  /** Vault path of the unreadable data file. */
  dataPath: string;
  /**
   * 'schema': the map needs a newer or fixed plugin version. The file itself
   * is fine, so no backup restore is offered (it would discard recent edits
   * and not help). 'missing': the configured file does not exist (DATA-08);
   * offers a user-confirmed empty store or a re-check, never auto-creates.
   * Default 'unreadable'.
   */
  kind?: 'unreadable' | 'schema' | 'missing';
  /**
   * kind 'missing' only: where a same-named store was found outside the
   * configured folder (MapDataFileMissingError.foundAt). Shown so the user
   * can move it back instead of starting an empty store.
   */
  foundAt?: string | null;
  /** Reload the map data after a successful restore. Omitted → the user is told to reopen. */
  onRestored?: () => void;
}

type ProbeState = 'probing' | 'found' | 'none';

const DataFileRecoveryPanel = ({ dataPath, kind = 'unreadable', foundAt = null, onRestored }: DataFileRecoveryPanelProps): VNode => {
  const app = useApp();
  const [probe, setProbe] = useState<ProbeState>('probing');
  const [backup, setBackup] = useState<DataFileBackup | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (kind !== 'unreadable') return undefined;
    let cancelled = false;
    void findBestBackup(app).then((found) => {
      if (cancelled) return;
      setBackup(found);
      setProbe(found != null ? 'found' : 'none');
    });
    return () => { cancelled = true; };
  }, [app, kind]);

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

  const handleCreate = useCallback(async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      const confirmed = await new ConfirmModal(app, {
        message: [
          `Create a new empty data file at ${dataPath}?`,
          'If this vault is synced, make sure your existing data file is not simply still downloading, or the empty file could overwrite it.',
        ].join('\n'),
        confirmText: 'Create',
        cancelText: 'Cancel',
      }).openAndGetValue();
      if (!confirmed) return;
      if (!(await createEmptyDataFile(app))) {
        new Notice('Data file was not created. A file may already exist at that path.', 10_000);
      }
      if (onRestored != null) onRestored();
      else new Notice('Reopen the map to load it.', 10_000);
    } finally {
      setBusy(false);
    }
  }, [app, busy, dataPath, onRestored]);

  if (kind === 'missing') {
    return (
      <div className="windrose-loading">
        <p>Data file not found. To avoid overwriting your maps, editing is disabled.</p>
        <p><code>{dataPath}</code></p>
        {foundAt != null && foundAt !== ''
          ? (
            <p className="windrose-datafile-found-at">
              A data file with this name was found at <code>{foundAt}</code>. Move it back to <code>{dataPath}</code>, or create a new data file here.
            </p>
          )
          : <p>If the file was moved or is still syncing, put it back and check again. Otherwise create a new empty data file here.</p>}
        <p>
          <button className="mod-cta" disabled={busy} onClick={() => { onRestored?.(); }}>
            Check again
          </button>
          {' '}
          <button disabled={busy} onClick={() => { void handleCreate(); }}>
            Create a new data file here
          </button>
        </p>
      </div>
    );
  }

  if (kind === 'schema') {
    return (
      <div className="windrose-loading">
        <p>This map needs a newer or fixed version of the plugin. To avoid changing it, editing is disabled.</p>
        <p>The data file is not damaged. Update the plugin, then reload Obsidian.</p>
      </div>
    );
  }

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

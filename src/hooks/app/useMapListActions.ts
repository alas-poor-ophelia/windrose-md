// useMapListActions.ts - Full-pane map header actions: the map list (picker),
// select / new / generate-dungeon navigation, and delete-map with its
// resurrection guard. Block mode uses only delete (from map settings).

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { App } from 'obsidian';
import type { MapType } from '#types/index';
import { listMaps, deleteMapData, setPendingNewMapOptions } from '../../persistence/fileOperations';
import type { MapListEntry } from '../../persistence/fileOperations';
import { ConfirmModal } from '../../settings/modals/ConfirmModal';
import { NewMapModal } from '../../components/modals/NewMapModal';
import { InsertDungeonModal } from '../../settings/modals/InsertDungeonModal';
import type { DungeonInsertOptions } from '../../settings/modals/InsertDungeonModal';

interface UseMapListActionsOptions {
  app: App;
  fullPane: boolean;
  mapId: string;
  mapName: string;
  mapType: MapType;
  /** Root map data name, read at delete time to label the confirm prompt. */
  rootMapName: string | undefined;
  markDeleted: () => void;
  onMapChange?: (mapId: string, mapName: string, mapType: MapType, ladderM?: number) => void;
  onMapDeleted?: () => void;
  /** Block mode: show the "map deleted" placeholder in place of the map. */
  setMapDeleted: (deleted: boolean) => void;
}

interface MapListActions {
  mapListEntries: MapListEntry[];
  setMapListEntries: (update: (prev: MapListEntry[]) => MapListEntry[]) => void;
  handleMapSelect: (entry: MapListEntry) => void;
  handleNewMap: () => void;
  handleGenerateDungeon: () => void;
  handleDeleteMap: () => Promise<void>;
}

function useMapListActions({ app, fullPane, mapId, mapName, mapType, rootMapName, markDeleted, onMapChange, onMapDeleted, setMapDeleted }: UseMapListActionsOptions): MapListActions {
  const [mapListEntries, setMapListEntries] = useState<MapListEntry[]>([]);
  // The list loads once per (fullPane, app); the current map is read at load
  // time through a ref rather than re-listing the vault when it changes.
  const currentMapRef = useRef({ mapId, mapName, mapType });
  currentMapRef.current = { mapId, mapName, mapType };
  useEffect(() => {
    if (!fullPane) return;
    void listMaps(app).then(entries => {
      const current = currentMapRef.current;
      if (current.mapId && !entries.some(e => e.id === current.mapId)) {
        entries.push({ id: current.mapId, name: current.mapName || '', type: current.mapType || 'grid' });
      }
      setMapListEntries(entries);
    });
  }, [fullPane, app]);

  const handleMapSelect = useCallback((entry: MapListEntry) => {
    onMapChange?.(entry.id, entry.name, entry.type);
  }, [onMapChange]);

  const handleNewMap = useCallback(() => {
    new NewMapModal(app, (newId, newName, newType, ladderM) => {
      // The map is built lazily on its first load, by whichever host opens it
      // (full-pane view or an embed block), so the preset is parked here, at
      // the dialog, rather than in any one host's map-change handler.
      if (ladderM !== undefined && newType === 'hex') setPendingNewMapOptions(newId, { ladderM });
      onMapChange?.(newId, newName, newType, ladderM);
    }).open();
  }, [app, onMapChange]);

  // Generates a brand-new map (not the currently open one) and navigates to
  // it — mirrors the "insert-random-dungeon" command's generate+save step,
  // minus the editor/code-block half that has no equivalent in full-pane view.
  const handleGenerateDungeon = useCallback(() => {
    const plugin = app.plugins.plugins['windrose-md'] as unknown as
      {
        createRandomDungeonMap(
          mapName: string,
          cells: Record<string, unknown>[],
          objects: unknown[],
          edges: unknown[],
          options: DungeonInsertOptions
        ): Promise<string>;
      } | undefined;
    if (plugin == null) return;
    new InsertDungeonModal(app, async (newMapName, cells, objects, edges, options) => {
      const newId = await plugin.createRandomDungeonMap(newMapName, cells, objects, edges, options);
      onMapChange?.(newId, newMapName, 'grid');
    }).open();
  }, [app, onMapChange]);

  // Read at delete time via ref so handleDeleteMap doesn't churn identity on
  // every map edit just to name the confirm prompt.
  const rootMapNameRef = useRef<string | undefined>(undefined);
  rootMapNameRef.current = rootMapName;

  const handleDeleteMap = useCallback(async (): Promise<void> => {
    if (mapId == null || mapId === '') return;
    const dataName = rootMapNameRef.current ?? '';
    const displayName = mapName !== '' ? mapName : dataName !== '' ? dataName : mapId;
    const lines = [
      `Delete "${displayName}"? This permanently removes the map's data and cannot be undone.`,
    ];
    if (!fullPane) {
      lines.push('The windrose-map code block in your note will remain — remove it manually.');
    } else {
      lines.push('Note blocks that show this map will remain and show it as deleted — remove them manually.');
    }
    const confirmed = await new ConfirmModal(app, {
      message: lines.join('\n'),
      confirmText: 'Delete map',
      cancelText: 'Cancel',
      isDestructive: true,
    }).openAndGetValue();
    if (!confirmed) return;

    // Resurrection guard: disable all saves for this instance BEFORE deleting, so
    // no trailing autosave can rewrite (and thus recreate) the map.
    markDeleted();
    await deleteMapData(app, mapId);

    if (fullPane) {
      onMapDeleted?.();
    } else {
      setMapDeleted(true);
    }
  }, [app, mapId, mapName, fullPane, markDeleted, onMapDeleted, setMapDeleted]);

  return { mapListEntries, setMapListEntries, handleMapSelect, handleNewMap, handleGenerateDungeon, handleDeleteMap };
}

export { useMapListActions };
export type { MapListActions };

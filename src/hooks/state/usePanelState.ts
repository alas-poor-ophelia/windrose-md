/**
 * usePanelState.ts
 *
 * Manages modal/panel state for DungeonMapTracker:
 * - Settings plugin detection and installer display
 * - Settings modal visibility
 * - Layer edit modal state
 * - Settings change listener (forces re-render on dmt-settings-changed)
 */

import type {
  MapData, MapLayer, MapObject, Cell, BackgroundImage,
  UIPreferences, MapSettings,
} from '#types/index';
import type { HexBounds } from '#types/core/map.types';

import { useEffect, useMemo, useState } from 'preact/hooks';
import { getLayerById } from '../../persistence/layerAccessor';

import { axialToOffset, offsetToAxial, isWithinOffsetBounds } from '../../geometry/core/offsetCoordinates';










interface UsePanelStateOptions {
  mapData: MapData | null;
  updateMapData: (data: MapData) => void;
}

interface UsePanelStateResult {
  showSettingsModal: boolean;
  setShowSettingsModal: (v: boolean) => void;
  editingLayerId: string | null;
  setEditingLayerId: (v: string | null) => void;
  editingLayer: MapLayer | null;
  handleSettingsClick: () => void;
  handleSettingsSave: (
    settingsData: MapSettings,
    preferencesData: UIPreferences,
    hexBounds?: HexBounds | null,
    backgroundImage?: BackgroundImage | null,
    hexSize?: number | null,
    deleteOrphanedContent?: boolean
  ) => void;
  handleSettingsClose: () => void;
}

function usePanelState({ mapData, updateMapData }: UsePanelStateOptions): UsePanelStateResult {
  const [, setSettingsVersion] = useState(0);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);

  const editingLayer = useMemo(() => {
    return editingLayerId != null && editingLayerId !== '' ? getLayerById(mapData, editingLayerId) : null;
  }, [editingLayerId, mapData]);

  // Listen for settings changes and force re-render
  useEffect(() => {
    const handleSettingsChange = (): void => {
      setSettingsVersion((prev: number) => prev + 1);
    };

    window.addEventListener('dmt-settings-changed', handleSettingsChange);

    return () => {
      window.removeEventListener('dmt-settings-changed', handleSettingsChange);
    };
  }, []);

  // =========================================================================
  // Handlers
  // =========================================================================

  const handleSettingsClick = (): void => {
    setShowSettingsModal(true);
  };

  const handleSettingsClose = (): void => {
    setShowSettingsModal(false);
  };

  const handleSettingsSave = (
    settingsData: MapSettings,
    preferencesData: UIPreferences,
    hexBounds: HexBounds | null = null,
    backgroundImage: BackgroundImage | null = null,
    hexSize: number | null = null,
    deleteOrphanedContent: boolean = false
  ): void => {
    if (!mapData) return;

    const newMapData: MapData = {
      ...mapData,
      settings: settingsData,
      uiPreferences: preferencesData,
      objectSetId: settingsData.objectSetId ?? null
    };

    if (hexBounds !== null && mapData.mapType === 'hex') {
      newMapData.hexBounds = hexBounds;

      if (deleteOrphanedContent) {
        const orientation = mapData.orientation || 'flat';
        const isRadial = hexBounds.maxRing !== undefined;

        const isInBounds = (q: number, r: number): boolean => {
          if (isRadial) {
            const ring = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
            return ring <= (hexBounds.maxRing ?? 0);
          }
          const { col, row } = axialToOffset(q, r, orientation);
          return isWithinOffsetBounds(col, row, hexBounds);
        };

        const isFogCellInBounds = (col: number, row: number): boolean => {
          if (isRadial) {
            const { q, r } = offsetToAxial(col, row, orientation);
            const ring = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
            return ring <= (hexBounds.maxRing ?? 0);
          }
          return isWithinOffsetBounds(col, row, hexBounds);
        };

        if (newMapData.layers.length > 0) {
          newMapData.layers = newMapData.layers.map((layer: MapLayer) => {
            const filteredCells = layer.cells?.filter((cell: Cell) =>
              isInBounds((cell as unknown as { q: number; r: number }).q, (cell as unknown as { q: number; r: number }).r)
            );
            const filteredObjects = layer.objects?.filter((obj: MapObject) =>
              isInBounds(obj.position.x, obj.position.y)
            );
            const filteredFog = layer.fogOfWar?.foggedCells?.filter(
              (fc: { col: number; row: number }) => isFogCellInBounds(fc.col, fc.row)
            );
            const fogChanged = filteredFog !== layer.fogOfWar?.foggedCells;
            if (filteredCells === layer.cells && filteredObjects === layer.objects && !fogChanged) return layer;
            return {
              ...layer,
              cells: filteredCells ?? [],
              objects: filteredObjects ?? [],
              ...(layer.fogOfWar && fogChanged ? {
                fogOfWar: { ...layer.fogOfWar, foggedCells: filteredFog ?? [] }
              } : {})
            };
          });
        }
      }
    }

    if (hexBounds !== null && mapData.mapType === 'hex') {
      const wasRadial = mapData.hexBounds?.maxRing !== undefined;
      const isNowRadial = hexBounds.maxRing !== undefined;
      if (wasRadial !== isNowRadial) {
        if (isNowRadial) {
          newMapData.viewState = { ...mapData.viewState, center: { x: 0, y: 0 }, zoom: mapData.viewState?.zoom ?? 1 };
        } else {
          const orientation = mapData.orientation || 'flat';
          const hSize = hexSize ?? mapData.hexSize ?? 40;
          const centerCol = Math.floor(hexBounds.maxCol / 2);
          const centerRow = Math.floor(hexBounds.maxRow / 2);
          const { q, r } = offsetToAxial(centerCol, centerRow, orientation);
          let worldX: number, worldY: number;
          if (orientation === 'flat') {
            worldX = hSize * (3 / 2) * q;
            worldY = hSize * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r);
          } else {
            worldX = hSize * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r);
            worldY = hSize * (3 / 2) * r;
          }
          newMapData.viewState = { ...mapData.viewState, center: { x: worldX, y: worldY }, zoom: mapData.viewState?.zoom ?? 1 };
        }
      }
    }

    newMapData.backgroundImage = backgroundImage ?? undefined;

    if (hexSize !== null && mapData.mapType === 'hex') {
      newMapData.hexSize = hexSize;
    }

    updateMapData(newMapData);
    setSettingsVersion((prev: number) => prev + 1);
  };

  return {
    showSettingsModal, setShowSettingsModal,
    editingLayerId, setEditingLayerId,
    editingLayer,
    handleSettingsClick, handleSettingsSave, handleSettingsClose
  };
}

export { usePanelState };
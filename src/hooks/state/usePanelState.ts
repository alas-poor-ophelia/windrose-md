/**
 * usePanelState.ts
 *
 * Manages modal/panel state for DungeonMapTracker:
 * - Settings plugin detection and installer display
 * - Settings modal visibility
 * - Layer edit modal state
 * - Settings change listener (forces re-render on windrose-settings-changed)
 */

import type { MapDataUpdater } from '#types/hooks/mapData.types';
import type {
  MapData, MapLayer, MapObject, Cell, BackgroundImage,
  UIPreferences, MapSettings,
} from '#types/index';
import { isHexCell } from '#types/core/cell.types';
import type { HexBounds } from '#types/core/map.types';
import { hasDepthContent, deepestAuthoredRung, isDepthQuarantined, type LadderPatch } from '../../core/lodFlags';
import type { MapWeatherSave } from '../../context/MapSettingsContext';

import { useEffect, useMemo, useState } from 'preact/hooks';
import { getLayerById } from '../../persistence/layerAccessor';

import { offsetToAxial, isAxialInHexBounds, isOffsetInHexBounds } from '../../geometry/core/offsetCoordinates';
import { HexGeometry } from '../../geometry/core/HexGeometry';
import { DEFAULTS } from '../../core/dmtConstants';
import { filterLevelsToBounds, ladderForAuthoredRungs } from '../../persistence/resizeOperations';










interface UsePanelStateOptions {
  mapData: MapData | null;
  updateMapData: MapDataUpdater;
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
    deleteOrphanedContent?: boolean,
    weather?: MapWeatherSave | null,
    ladderPatch?: LadderPatch
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

    window.addEventListener('windrose-settings-changed', handleSettingsChange);

    return () => {
      window.removeEventListener('windrose-settings-changed', handleSettingsChange);
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
    deleteOrphanedContent: boolean = false,
    weather: MapWeatherSave | null = null,
    ladderPatch: LadderPatch = { kind: 'keep' }
  ): void => {
    if (!mapData) return;

    updateMapData((prev: MapData) => {
      let newMapData: MapData = {
        ...prev,
        settings: settingsData,
        uiPreferences: preferencesData,
        objectSetId: settingsData.objectSetId ?? null
      };

      // Weather tab (only when it was offered): absent = no map-level zone /
      // animation on (root) or inherited (sub-hex level), so the keys are
      // removed rather than stored as defaults
      if (weather != null) {
        delete newMapData.weatherZoneId;
        delete newMapData.weatherAnimate;
        if (weather.weatherZoneId != null && weather.weatherZoneId !== '') newMapData.weatherZoneId = weather.weatherZoneId;
        if (typeof weather.weatherAnimate === 'boolean') newMapData.weatherAnimate = weather.weatherAnimate;
      }

      if (hexBounds !== null && prev.mapType === 'hex') {
        newMapData.hexBounds = hexBounds;

        if (deleteOrphanedContent) {
          const orientation = prev.orientation ?? 'flat';
          // Same predicate the settings modal uses to count orphans
          const isInBounds = (q: number, r: number): boolean =>
            isAxialInHexBounds(q, r, hexBounds, orientation);
          const isFogCellInBounds = (col: number, row: number): boolean =>
            isOffsetInHexBounds(col, row, hexBounds, orientation);

          if (newMapData.layers.length > 0) {
            newMapData.layers = newMapData.layers.map((layer: MapLayer) => {
              const filteredCells = layer.cells?.filter((cell: Cell) =>
                isHexCell(cell) && isInBounds(cell.q, cell.r)
              );
              // Root-bounds filter on level-0 objects only: an object homed on a
              // ladder rung carries RUNG coordinates, which this root test would
              // misread; filterLevelsToBounds judges those by their root ancestor.
              const filteredObjects = layer.objects?.filter((obj: MapObject) =>
                (obj.homeLevel ?? 0) > 0 || isInBounds(obj.position.x, obj.position.y)
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

          // Rung (>= 1) cells: keep only those whose lattice ancestor exists under
          // the NEW bounds. Written through setLevelCells, so emptied rungs go away.
          const ladder = ladderForAuthoredRungs(
            newMapData,
            new HexGeometry(hexSize ?? prev.hexSize ?? DEFAULTS.hexSize, orientation, hexBounds)
          );
          if (ladder !== null) newMapData = filterLevelsToBounds(newMapData, ladder);
        }
      }

      if (hexBounds !== null && prev.mapType === 'hex') {
        const wasRadial = prev.hexBounds?.maxRing !== undefined;
        const isNowRadial = hexBounds.maxRing !== undefined;
        if (wasRadial !== isNowRadial) {
          if (isNowRadial) {
            newMapData.viewState = { ...prev.viewState, center: { x: 0, y: 0 }, zoom: prev.viewState?.zoom ?? 1 };
          } else {
            const orientation = prev.orientation ?? 'flat';
            const hSize = hexSize ?? prev.hexSize ?? 40;
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
            newMapData.viewState = { ...prev.viewState, center: { x: worldX, y: worldY }, zoom: prev.viewState?.zoom ?? 1 };
          }
        }
      }

      newMapData.backgroundImage = backgroundImage ?? undefined;

      if (hexSize !== null && prev.mapType === 'hex') {
        newMapData.hexSize = hexSize;
      }

      // Ladder patch from the settings opt-in (ladderSettingsPatch): `set`
      // arrives already merged over the stored lod; `keep` leaves the stored
      // lod exactly as it was. `remove` was decided against the modal's
      // snapshot, so it is re-checked against the LIVE map: rungs written
      // since (another pane, an MCP write) turn it into `keep`, because
      // stripping `lod` under depth content would quarantine the map (PX-07).
      // `set` is re-checked the same way. Under live depth content the stored
      // `m` is kept (a new `m` re-partitions every rung cell) and `maxLevel`
      // never drops below the deepest authored rung. A map quarantined for
      // rungs without a `lod` block is left as it is: a `set` would
      // un-quarantine it with parameters its content was never laid out on.
      if (prev.mapType === 'hex') {
        if (ladderPatch.kind === 'set') {
          if (isDepthQuarantined(prev).reason === 'levels-without-lod') {
            // keep: the stored state (no lod) stays exactly as it was
          } else if (prev.lod != null && hasDepthContent(prev)) {
            newMapData.lod = {
              ...ladderPatch.lod,
              m: prev.lod.m,
              maxLevel: Math.max(ladderPatch.lod.maxLevel, deepestAuthoredRung(prev))
            };
          } else {
            newMapData.lod = ladderPatch.lod;
          }
        } else if (ladderPatch.kind === 'remove' && !hasDepthContent(prev)) {
          delete newMapData.lod;
        }
      }

      return newMapData;
    });
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
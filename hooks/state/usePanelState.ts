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
  MapData, MapLayer, MapObject, Cell, HexBounds, BackgroundImage,
  UIPreferences, MapSettings,
} from '#types/index';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { getLayerById } = await requireModuleByName("layerAccessor.ts") as {
  getLayerById: (mapData: MapData | null, layerId: string) => MapLayer | null;
};

const { shouldOfferUpgrade } = await requireModuleByName("SettingsPluginInstaller.tsx") as {
  shouldOfferUpgrade: () => boolean;
};

const { axialToOffset, offsetToAxial, isWithinOffsetBounds } = await requireModuleByName("offsetCoordinates.ts") as {
  axialToOffset: (q: number, r: number, orientation: string) => { col: number; row: number };
  offsetToAxial: (col: number, row: number, orientation: string) => { q: number; r: number };
  isWithinOffsetBounds: (col: number, row: number, bounds: HexBounds) => boolean;
};

interface UsePanelStateOptions {
  mapData: MapData | null;
  updateMapData: (data: MapData) => void;
}

interface UsePanelStateResult {
  showSettingsModal: boolean;
  setShowSettingsModal: (v: boolean) => void;
  showPluginInstaller: boolean;
  setShowPluginInstaller: (v: boolean) => void;
  editingLayerId: string | null;
  setEditingLayerId: (v: string | null) => void;
  editingLayer: MapLayer | null;
  pluginInstalled: boolean | null;
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
  handlePluginInstall: () => void;
  handlePluginDecline: () => void;
}

function usePanelState({ mapData, updateMapData }: UsePanelStateOptions): UsePanelStateResult {
  const [pluginInstalled, setPluginInstalled] = dc.useState<boolean | null>(null);
  const [showPluginInstaller, setShowPluginInstaller] = dc.useState(false);
  const [settingsVersion, setSettingsVersion] = dc.useState(0);
  const [showSettingsModal, setShowSettingsModal] = dc.useState(false);
  const [editingLayerId, setEditingLayerId] = dc.useState<string | null>(null);

  const editingLayer = dc.useMemo(() => {
    return editingLayerId ? getLayerById(mapData, editingLayerId) : null;
  }, [editingLayerId, mapData]);

  // Check if settings plugin is installed
  dc.useEffect(() => {
    async function checkPlugin(): Promise<void> {
      try {
        const pluginDir = '.obsidian/plugins/dungeon-map-tracker-settings';
        const exists = await dc.app.vault.adapter.exists(pluginDir);
        setPluginInstalled(exists);
      } catch (error) {
        console.error('[DungeonMapTracker] Error checking plugin:', error);
        setPluginInstalled(false);
      }
    }
    checkPlugin();
  }, []);

  // Determine if we should show the plugin installer (install or upgrade mode)
  dc.useEffect(() => {
    if (pluginInstalled === null || !mapData) return;

    if (!pluginInstalled && !mapData.settingsPluginDeclined) {
      setShowPluginInstaller(true);
      return;
    }

    if (pluginInstalled && shouldOfferUpgrade()) {
      setShowPluginInstaller(true);
      return;
    }

    setShowPluginInstaller(false);
  }, [pluginInstalled, mapData]);

  // Listen for settings changes and force re-render
  dc.useEffect(() => {
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

  const handlePluginInstall = (): void => {
    setPluginInstalled(true);
    setShowPluginInstaller(false);
  };

  const handlePluginDecline = (): void => {
    if (mapData) {
      updateMapData({
        ...mapData,
        settingsPluginDeclined: true
      });
    }
    setShowPluginInstaller(false);
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
            return ring <= hexBounds.maxRing!;
          }
          const { col, row } = axialToOffset(q, r, orientation);
          return isWithinOffsetBounds(col, row, hexBounds);
        };

        const isFogCellInBounds = (col: number, row: number): boolean => {
          if (isRadial) {
            const { q, r } = offsetToAxial(col, row, orientation);
            const ring = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
            return ring <= hexBounds.maxRing!;
          }
          return isWithinOffsetBounds(col, row, hexBounds);
        };

        if (newMapData.layers && newMapData.layers.length > 0) {
          newMapData.layers = newMapData.layers.map((layer: MapLayer) => {
            const filteredCells = layer.cells?.filter((cell: Cell) =>
              isInBounds(cell.q, cell.r)
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
          newMapData.viewState = { ...mapData.viewState, center: { x: 0, y: 0 } };
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
          newMapData.viewState = { ...mapData.viewState, center: { x: worldX, y: worldY } };
        }
      }
    }

    newMapData.backgroundImage = backgroundImage;

    if (hexSize !== null && mapData.mapType === 'hex') {
      newMapData.hexSize = hexSize;
    }

    updateMapData(newMapData);
    setSettingsVersion((prev: number) => prev + 1);
  };

  return {
    showSettingsModal, setShowSettingsModal,
    showPluginInstaller, setShowPluginInstaller,
    editingLayerId, setEditingLayerId,
    editingLayer,
    pluginInstalled,
    handleSettingsClick, handleSettingsSave, handleSettingsClose,
    handlePluginInstall, handlePluginDecline
  };
}

return { usePanelState };

/**
 * usePanelState.ts
 *
 * Manages modal/panel state for DungeonMapTracker:
 * - Settings plugin detection and installer display
 * - Settings modal visibility
 * - Layer edit modal state
 * - Settings change listener (forces re-render on dmt-settings-changed)
 */

import type { MapData, MapLayer } from '#types/core/map.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { getLayerById } = await requireModuleByName("layerAccessor.ts") as {
  getLayerById: (mapData: MapData | null, layerId: string) => MapLayer | null;
};

const { shouldOfferUpgrade } = await requireModuleByName("SettingsPluginInstaller.tsx") as {
  shouldOfferUpgrade: () => boolean;
};

interface UsePanelStateOptions {
  mapData: MapData | null;
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
}

function usePanelState({ mapData }: UsePanelStateOptions): UsePanelStateResult {
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

  return {
    showSettingsModal, setShowSettingsModal,
    showPluginInstaller, setShowPluginInstaller,
    editingLayerId, setEditingLayerId,
    editingLayer,
    pluginInstalled
  };
}

return { usePanelState };

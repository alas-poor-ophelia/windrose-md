import { Plugin, Notice, TFile } from 'obsidian';
import type { PluginSettings } from '#types/settings/settings.types';
import type { MapType } from '#types/index';
import { render, h } from 'preact';
import { DungeonMapTracker } from './DungeonMapTracker';
import { AppContext } from './context/AppContext';
import { InsertMapModal } from './components/modals/InsertMapModal';
import { InsertDungeonModal } from './settings/modals/InsertDungeonModal';
import * as dungeonGenerator from './generation/dungeonGenerator';
import * as objectPlacer from './generation/objectPlacer';
import { registerDeepLinks } from './core/deepLinkRegistration';
import { setPlugin, clearPlugin, FALLBACK_SETTINGS } from './core/settingsAccessor';
import { WindroseMDSettingsTab } from './settings/WindroseSettingsTab';
import { VIEW_TYPE_WINDROSE_MAP, WindroseMapView } from './views/WindroseMapView';

/** Cell produced by the dungeon generator with grid coordinates. */
interface DungeonCell {
  x: number;
  y: number;
  [key: string]: unknown;
}

/** Options bag passed from the dungeon generator. */
interface DungeonGenOptions {
  preset?: string;
  configOverrides?: { autoFogEnabled?: boolean; [key: string]: unknown };
  distancePerCell?: number;
  distanceUnit?: string;
  stockingMetadata?: {
    rooms?: Array<{ id: string; x: number; y: number; width: number; height: number; radius?: number; shape?: string; parts?: Array<{ x: number; y: number; width: number; height: number }> }>;
    entryRoomId?: string;
  };
  [key: string]: unknown;
}

export default class WindrosePlugin extends Plugin {
  settings: PluginSettings = {} as PluginSettings;
  dataFilePath: string = 'windrose-md-data.json';
  private mountedElements: Set<HTMLElement> = new Set();

  async onload(): Promise<void> {
    await this.migrateFromOldPlugin();
    await this.loadSettings();
    this.initMcpNamespace();
    await this.resolveDebugConfig();
    await this.resolveDataFilePath();
    this.checkForConflicts();

    setPlugin(this);

    // eslint-disable-next-line no-console
    console.log('[Windrose] Plugin loaded, version:', this.manifest.version, 'data:', this.dataFilePath);

    this.registerView(VIEW_TYPE_WINDROSE_MAP, (leaf) => new WindroseMapView(leaf));
    this.addRibbonIcon('compass', 'Open Windrose Map', () => this.activateMapView());
    this.addCommand({
      id: 'open-map-view',
      name: 'Open map in full pane',
      callback: () => this.activateMapView(),
    });
    this.addCommand({
      id: 'open-new-map-view',
      name: 'Open new map view tab',
      callback: () => this.openNewMapView(),
    });

    this.registerMarkdownCodeBlockProcessor('windrose-map', (source, el, ctx) => {
      const config = parseYamlConfig(source);
      const mapId = config.id ?? '';
      const mapName = config.name ?? 'Unnamed Map';
      const mapType = (config.type ?? 'grid') as MapType;

      if (mapId === '') {
        el.createEl('div', {
          text: 'Windrose: missing required "ID" field in windrose-map block.',
          cls: 'windrose-error'
        });
        return;
      }

      render(
        h(AppContext.Provider, { value: this.app },
          h(DungeonMapTracker, { mapId, mapName, mapType, notePath: ctx.sourcePath })
        ),
        el
      );
      this.mountedElements.add(el);
    });

    registerDeepLinks(this);

    this.addSettingTab(new WindroseMDSettingsTab(this.app, this));

    this.addCommand({
      id: 'insert-new-map',
      name: 'Insert map',
      editorCallback: (editor) => {
        new InsertMapModal(this.app, (mapId, mapName, mapType) => {
          const codeBlock = [
            '```windrose-map',
            `id: ${mapId}`,
            `name: ${mapName}`,
            `type: ${mapType}`,
            '```'
          ].join('\n');
          editor.replaceSelection(codeBlock);
        }).open();
      }
    });

    this.addCommand({
      id: 'insert-random-dungeon',
      name: 'Generate random dungeon',
      editorCallback: async (editor) => {
        new InsertDungeonModal(this.app, this, async (mapName, cells, objects, edges, options) => {
          const mapId = 'map-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
          await this.saveDungeonToJson(mapId, mapName, cells as DungeonCell[], objects, edges, options as DungeonGenOptions);

          const codeBlock = [
            '```windrose-map',
            `id: ${mapId}`,
            `name: ${mapName}`,
            'type: grid',
            '```'
          ].join('\n');

          editor.replaceSelection(codeBlock);
        }).open();
      }
    });
  }

  onunload(): void {
    for (const el of this.mountedElements) {
      render(null, el);
    }
    this.mountedElements.clear();
    clearPlugin();
    delete window.__windrose;
  }

  async activateMapView(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_WINDROSE_MAP);
    if (leaves.length > 0) {
      this.app.workspace.revealLeaf(leaves[0]);
      return;
    }
    await this.openNewMapView();
  }

  private async openNewMapView(): Promise<void> {
    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_TYPE_WINDROSE_MAP, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  private initMcpNamespace(): void {
    window.__windrose = window.__windrose ?? {};
    window.__windrose.version = this.manifest.version;
  }

  private async resolveDebugConfig(): Promise<void> {
    try {
      let content: string | null = null;
      const debugFile = this.app.vault.getAbstractFileByPath('WINDROSE-DEBUG.json');
      if (debugFile instanceof TFile) {
        content = await this.app.vault.read(debugFile);
      } else if (await this.app.vault.adapter.exists('WINDROSE-DEBUG.json')) {
        content = await this.app.vault.adapter.read('WINDROSE-DEBUG.json');
      }

      if (content != null && content !== '') {
        const config = JSON.parse(content) as Record<string, unknown>;
        if (typeof config.dataFilePath === 'string' && config.dataFilePath !== '') {
          this.dataFilePath = config.dataFilePath;
          // eslint-disable-next-line no-console
          console.log('[Windrose] Debug data path:', config.dataFilePath);
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[Windrose] Failed to load WINDROSE-DEBUG.json:', e);
    }
  }

  private async migrateFromOldPlugin(): Promise<void> {
    const existing = await this.loadData() as Record<string, unknown> | null;
    if (existing != null && Object.keys(existing).length > 1) return;

    const oldDataPath = `${this.app.vault.configDir}/plugins/dungeon-map-tracker-settings/data.json`;
    try {
      if (!await this.app.vault.adapter.exists(oldDataPath)) return;

      const content = await this.app.vault.adapter.read(oldDataPath);
      const oldSettings = JSON.parse(content) as Record<string, unknown>;

      const { version, ...importable } = oldSettings;
      this.settings = { ...FALLBACK_SETTINGS, ...importable } as PluginSettings;
      await this.saveData(this.settings);

      new Notice(
        'Windrose: Settings imported from your previous Windrose MapDesigner installation. ' +
        'You can now disable the old "Windrose MapDesigner" plugin under Community Plugins.',
        15000
      );
      // eslint-disable-next-line no-console
      console.log('[Windrose] Migrated settings from dungeon-map-tracker-settings');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[Windrose] Could not migrate old settings:', e);
    }
  }

  private async resolveDataFilePath(): Promise<void> {
    if (this.dataFilePath !== 'windrose-md-data.json') return;
    if (await this.app.vault.adapter.exists(this.dataFilePath)) return;

    const allFiles = this.app.vault.getFiles();
    const dataFile = allFiles.find(f => f.name === 'windrose-md-data.json');
    if (dataFile != null) {
      this.dataFilePath = dataFile.path;
      // eslint-disable-next-line no-console
      console.log('[Windrose] Auto-discovered data file at:', dataFile.path);
    }
  }

  private checkForConflicts(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plugins = (this.app as any).plugins?.plugins as Record<string, { _loaded?: boolean }> | undefined;
    if (plugins?.['dungeon-map-tracker-settings']?._loaded === true) {
      new Notice(
        'Windrose: The old "Windrose MapDesigner" settings plugin is still active. ' +
        'Please disable it in Settings → Community Plugins to avoid conflicts. ' +
        'Your settings have been imported into the new standalone plugin.',
        20000
      );
      // eslint-disable-next-line no-console
      console.warn('[Windrose] Old plugin dungeon-map-tracker-settings is still active');
    }
  }

  async loadDungeonGenerator(): Promise<typeof dungeonGenerator> {
    return dungeonGenerator;
  }

  async loadObjectPlacer(): Promise<typeof objectPlacer> {
    return objectPlacer;
  }

  private buildFogOfWar(cells: DungeonCell[], options: DungeonGenOptions): { enabled: boolean; foggedCells: Array<{ col: number; row: number }> } | null {
    const autoFogEnabled = options?.configOverrides?.autoFogEnabled;
    if (autoFogEnabled !== true) return null;

    const stockingMeta = options?.stockingMetadata;
    if (stockingMeta?.rooms == null || cells.length === 0) return null;

    const entryRoomId = stockingMeta.entryRoomId;
    const entryRoom = stockingMeta.rooms.find((r) => r.id === entryRoomId);

    const entryRoomCells = new Set<string>();
    if (entryRoom != null) {
      for (let x = entryRoom.x; x < entryRoom.x + entryRoom.width; x++) {
        for (let y = entryRoom.y; y < entryRoom.y + entryRoom.height; y++) {
          if (entryRoom.shape === 'circle' && entryRoom.radius != null) {
            const centerX = entryRoom.x + entryRoom.radius;
            const centerY = entryRoom.y + entryRoom.radius;
            const dx = x + 0.5 - centerX;
            const dy = y + 0.5 - centerY;
            if (dx * dx + dy * dy <= entryRoom.radius * entryRoom.radius) {
              entryRoomCells.add(`${x},${y}`);
            }
          } else if (entryRoom.shape === 'composite' && entryRoom.parts) {
            for (const part of entryRoom.parts) {
              if (x >= part.x && x < part.x + part.width &&
                  y >= part.y && y < part.y + part.height) {
                entryRoomCells.add(`${x},${y}`);
                break;
              }
            }
          } else {
            entryRoomCells.add(`${x},${y}`);
          }
        }
      }
    }

    const foggedCells = cells
      .filter((c) => !entryRoomCells.has(`${c.x},${c.y}`))
      .map((c) => ({ col: c.x, row: c.y }));

    return { enabled: true, foggedCells };
  }

  private async saveDungeonToJson(mapId: string, mapName: string, cells: DungeonCell[], objects: unknown[], edges: unknown[], options: DungeonGenOptions): Promise<void> {
    const SCHEMA_VERSION = 2;

    try {
      const dataFilePath = this.dataFilePath;
      let allData: { maps: Record<string, unknown> } = { maps: {} };

      const abstractFile = this.app.vault.getAbstractFileByPath(dataFilePath);
      const file = abstractFile instanceof TFile ? abstractFile : null;
      if (file != null) {
        const content = await this.app.vault.read(file);
        allData = JSON.parse(content) as { maps: Record<string, unknown> };
      }

      if (allData.maps == null) allData.maps = {};

      const layerId = 'layer-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

      let centerX = 5, centerY = 5;
      const gridSize = 32;
      if (cells.length > 0) {
        const minX = Math.min(...cells.map((c) => c.x));
        const maxX = Math.max(...cells.map((c) => c.x));
        const minY = Math.min(...cells.map((c) => c.y));
        const maxY = Math.max(...cells.map((c) => c.y));
        centerX = (minX + maxX) / 2;
        centerY = (minY + maxY) / 2;
      }

      const mapData = {
        name: mapName,
        description: "",
        mapType: "grid",
        northDirection: 0,
        customColors: [],
        sidebarCollapsed: false,
        expandedState: false,
        generationSettings: {
          preset: options.preset,
          configOverrides: options.configOverrides ?? {},
          distancePerCell: options.distancePerCell ?? 5,
          distanceUnit: options.distanceUnit ?? 'ft',
          stockingMetadata: options.stockingMetadata ?? null
        },
        settings: {
          useGlobalSettings: false,
          overrides: {
            distancePerCellGrid: options.distancePerCell ?? 5,
            distanceUnitGrid: options.distanceUnit ?? 'ft'
          }
        },
        uiPreferences: {
          rememberPanZoom: true,
          rememberSidebarState: true,
          rememberExpandedState: false
        },
        lastTextLabelSettings: null,
        schemaVersion: SCHEMA_VERSION,
        activeLayerId: layerId,
        layerPanelVisible: false,
        layers: [{
          id: layerId,
          name: 'Layer 1',
          order: 0,
          visible: true,
          cells: cells,
          edges: edges ?? [],
          objects: objects ?? [],
          textLabels: [],
          fogOfWar: this.buildFogOfWar(cells, options)
        }],
        gridSize: gridSize,
        dimensions: { width: 300, height: 300 },
        viewState: {
          zoom: 1.5,
          center: { x: centerX, y: centerY }
        }
      };

      allData.maps[mapId] = mapData;

      const jsonString = JSON.stringify(allData, null, 2);
      if (file != null) {
        await this.app.vault.modify(file, jsonString);
      } else {
        const dirPath = dataFilePath.substring(0, dataFilePath.lastIndexOf('/'));
        if (dirPath !== '') {
          try { await this.app.vault.createFolder(dirPath); } catch { /* exists */ }
        }
        await this.app.vault.create(dataFilePath, jsonString);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[Windrose] Failed to save dungeon:', error);
      throw error;
    }
  }

  async loadSettings(): Promise<void> {
    const loaded = (await this.loadData()) as Partial<PluginSettings> | null;
    this.settings = { ...FALLBACK_SETTINGS, ...loaded };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    window.dispatchEvent(new CustomEvent('windrose-settings-changed'));
  }
}

function parseYamlConfig(source: string): Record<string, string> {
  const config: Record<string, string> = {};
  for (const line of source.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    config[trimmed.slice(0, colonIdx).trim()] = trimmed.slice(colonIdx + 1).trim();
  }
  return config;
}

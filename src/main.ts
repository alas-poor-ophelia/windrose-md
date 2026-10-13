import { Plugin, Notice, TFile, MarkdownRenderChild } from 'obsidian';
import type { PluginSettings } from '#types/settings/settings.types';
import type { MapType } from '#types/index';
import type { MapData, MapLayer } from '#types/core/map.types';
import { render, h } from 'preact';
import { DungeonMapTracker } from './DungeonMapTracker';
import { AppContext } from './context/AppContext';
import { InsertMapModal } from './components/modals/InsertMapModal';
import { InsertDungeonModal } from './settings/modals/InsertDungeonModal';
import { registerDeepLinks } from './core/deepLinkRegistration';
import { setPlugin, clearPlugin, FALLBACK_SETTINGS } from './core/settingsAccessor';
import { decideOnboardingState, isFeatureEnabled } from './core/featureFlags';
import { WindroseMDSettingsTab } from './settings/WindroseSettingsTab';
import { VIEW_TYPE_WINDROSE_MAP, WindroseMapView } from './views/WindroseMapView';
import { recordPerfTelemetry } from './utils/perfTelemetry';
import { writeCanvasCapabilityReport } from './utils/canvasCapabilityReport';
import { recordInputEventProbe } from './utils/inputEventProbe';
import { recordZoomTrace } from './utils/zoomTraceProbe';
import { scanTilesetFolder } from './assets/tilesetOperations';
import { buildMapEntry, createMapEntry, getSaveQueue, listMapsResult } from './persistence/fileOperations';
import { disposeImageCache } from './assets/imageOperations';
import { clearAll as clearThumbnailCache } from './assets/thumbnailCache';
import { flushAll, installLifecycleJournaling, journalAll } from './persistence/saveCoordinator';
import { pruneJournal } from './persistence/saveJournal';
import { notifyPartyNoteRenamed } from './persistence/partyNoteOperations';
import { runImportDetectionPass } from './assets/importDetectionPass';
import {
  ensureTileMetadataLoaded,
  isTileMetadataCorrupt,
  commitTileMetadataDelta,
  bulkSetDdSourceType,
  flushTileMetadataSave,
  resetTileMetadataStore,
} from './persistence/tileMetadata';
import { flushTilesetArtSaves } from './persistence/tilesetArtSettings';
import type { TileEntry } from '#types/tiles/tile.types';

/** View center used when a generated dungeon has no cells to derive bounds from. */
const DUNGEON_FALLBACK_CENTER = { x: 5, y: 5 };

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

/**
 * The map entry for a generated dungeon: createNewMap('grid') plus the
 * generator's content and settings. Kept field-for-field identical to the
 * literal it replaced (layer name 'Layer 1', zoom 1.5 centred on the cells'
 * bounding box, per-map distance overrides) except for the createNewMap
 * defaults the old literal omitted and load-time migration backfilled anyway:
 * boards/activeBoardId, the layer's boardId and an empty curves array.
 */
function buildGeneratedDungeonMap(
  mapName: string,
  cells: DungeonCell[],
  objects: unknown[],
  edges: unknown[],
  options: DungeonGenOptions,
  fogOfWar: { enabled: boolean; foggedCells: Array<{ col: number; row: number }> } | null
): MapData {
  let centerX = DUNGEON_FALLBACK_CENTER.x, centerY = DUNGEON_FALLBACK_CENTER.y;
  if (cells.length > 0) {
    const minX = Math.min(...cells.map((c) => c.x));
    const maxX = Math.max(...cells.map((c) => c.x));
    const minY = Math.min(...cells.map((c) => c.y));
    const maxY = Math.max(...cells.map((c) => c.y));
    centerX = (minX + maxX) / 2;
    centerY = (minY + maxY) / 2;
  }

  return buildMapEntry(mapName, 'grid', {
    // Boundary cast: the persisted generation settings carry distance fields
    // the GenerationSettings type does not declare.
    generationSettings: {
      preset: options.preset,
      configOverrides: options.configOverrides ?? {},
      distancePerCell: options.distancePerCell ?? 5,
      distanceUnit: options.distanceUnit ?? 'ft',
      stockingMetadata: options.stockingMetadata ?? null
    } as unknown as MapData['generationSettings'],
    settings: {
      useGlobalSettings: false,
      overrides: {
        distancePerCellGrid: options.distancePerCell ?? 5,
        distanceUnitGrid: options.distanceUnit ?? 'ft'
      }
    } as unknown as MapData['settings'],
    viewState: {
      zoom: 1.5,
      center: { x: centerX, y: centerY }
    }
  }, {
    name: 'Layer 1',
    // Boundary cast: generator output is untyped JS.
    cells: cells as unknown as MapLayer['cells'],
    edges: (edges ?? []) as MapLayer['edges'],
    objects: (objects ?? []) as MapLayer['objects'],
    textLabels: [],
    // Boundary cast: generated fog carries no texture field (as before).
    fogOfWar: fogOfWar as MapLayer['fogOfWar']
  });
}

export default class WindrosePlugin extends Plugin {
  override settings: PluginSettings = {} as PluginSettings;
  dataFilePath: string = 'windrose-md-data.json';
  private mountedElements: Set<HTMLElement> = new Set();
  /** Raw loadData() result, kept for fresh-vs-upgrade onboarding detection. */
  private rawLoadedSettings: Partial<PluginSettings> | null = null;

  override async onload(): Promise<void> {
    await this.migrateFromOldPlugin();
    await this.loadSettings();
    this.initMcpNamespace();
    await this.resolveDebugConfig();
    await this.resolveOnboardingState();
    this.checkForConflicts();

    setPlugin(this);

    console.debug('[Windrose] Plugin loaded, version:', this.manifest.version, 'data:', this.dataFilePath);

    this.registerView(VIEW_TYPE_WINDROSE_MAP, (leaf) => new WindroseMapView(leaf));
    this.addRibbonIcon('compass', 'Open map view', () => this.activateMapView());
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
    this.addCommand({
      id: 'record-perf-telemetry',
      name: 'Record performance telemetry (60s)',
      // checkCallback form: re-evaluated every palette open, so toggling
      // developerMode takes effect without a plugin reload.
      checkCallback: (checking) => {
        if (this.settings.developerMode !== true) return false;
        if (checking) return true;
        void recordPerfTelemetry(this.app);
        return true;
      },
    });
    this.addCommand({
      id: 'input-event-probe',
      name: 'Record input event probe (15s)',
      checkCallback: (checking) => {
        if (this.settings.developerMode !== true) return false;
        if (checking) return true;
        void recordInputEventProbe(this.app);
        return true;
      },
    });
    this.addCommand({
      id: 'zoom-trace-probe',
      name: 'Record zoom trace (25s)',
      checkCallback: (checking) => {
        if (this.settings.developerMode !== true) return false;
        if (checking) return true;
        void recordZoomTrace(this.app);
        return true;
      },
    });
    this.addCommand({
      id: 'canvas-capability-report',
      name: 'Write canvas capability report',
      checkCallback: (checking) => {
        if (this.settings.developerMode !== true) return false;
        if (checking) return true;
        void writeCanvasCapabilityReport(this.app);
        return true;
      },
    });

    this.registerMarkdownCodeBlockProcessor('windrose-map', (source, el, ctx) => {
      const config = parseYamlConfig(source);
      const mapId = config.id ?? '';
      const mapName = config.name ?? 'Unnamed Map';
      const mapType = (config.type ?? 'grid') as MapType;
      const initialSubHexPath = config.subhex ?? '';

      if (mapId === '') {
        el.createDiv({
          text: 'Windrose: missing required "ID" field in windrose-map block.',
          cls: 'windrose-error'
        });
        return;
      }

      render(
        h(AppContext.Provider, { value: this.app },
          h(DungeonMapTracker, { mapId, mapName, mapType, notePath: ctx.sourcePath, initialSubHexPath })
        ),
        el
      );
      this.mountedElements.add(el);

      // Obsidian removes the block's DOM without notifying Preact, so without
      // this the component tree stays mounted (effects running, no unmount
      // flush) until plugin unload. The render child unmounts the tree when
      // the block actually leaves the document — which is also what lets
      // useDebouncedSave's unmount flush save pending edits on navigation.
      const child = new MarkdownRenderChild(el);
      child.register(() => {
        render(null, el);
        this.mountedElements.delete(el);
      });
      ctx.addChild(child);
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
      // checkCallback form: re-evaluated every palette open, so toggling the
      // dungeonGenerator feature takes effect without a plugin reload.
      editorCheckCallback: (checking, editor) => {
        if (!isFeatureEnabled('dungeonGenerator')) return false;
        if (checking) return true;
        new InsertDungeonModal(this.app, async (mapName, cells, objects, edges, options) => {
          const mapId = await this.createRandomDungeonMap(mapName, cells, objects, edges, options as DungeonGenOptions);

          const codeBlock = [
            '```windrose-map',
            `id: ${mapId}`,
            `name: ${mapName}`,
            'type: grid',
            '```'
          ].join('\n');

          editor.replaceSelection(codeBlock);
        }).open();
        return true;
      }
    });

    this.addCommand({
      id: 'rescan-tile-classification',
      name: 'Rescan tile classification (fill missing)',
      callback: () => { void this.rescanTileClassification(); },
    });

    // Data-loss guards. Obsidian awaits the promises added to the quit Tasks
    // bag, which is the only hook that can hold the event loop open long enough
    // for a multi-megabyte chunked vault write to finish.
    this.registerEvent(this.app.workspace.on('quit', (tasks) => {
      tasks.addPromise((async () => {
        await flushAll();
        await getSaveQueue();
      })());
    }));

    // Beacon notes follow renames: mounted beacons repoint their stored path.
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      if (file instanceof TFile) notifyPartyNoteRenamed(oldPath, file.path);
    }));

    // Suspend/hide has no such guarantee, so those paths journal synchronously.
    this.register(installLifecycleJournaling(this.app));
    // Age-only prune now; once the layout is ready, also drop journal entries
    // (live, kept, conflict) for maps that no longer exist. Skipped when the
    // data file is unreadable: a failed read must never look like "no maps".
    pruneJournal(this.app);
    this.app.workspace.onLayoutReady(() => {
      void listMapsResult(this.app).then((result) => {
        if (result.status === 'ok') pruneJournal(this.app, { liveMapIds: result.maps.map(m => m.id) });
      });
    });
  }

  /**
   * Fill-missing reclassification over every registered tileset folder — the
   * recovery path when an import's classification phase failed or the metadata
   * store was lost. Every write is fill-missing-only (idempotent), and render-
   * mode predictions are never applied here (RCA 2026-06-09: bulk render-mode
   * writes retroactively re-render already-placed tiles; the RCA doc was
   * deleted, read it with `git show 3d42268d:docs/RCA-2026-06-09-performance-collapse.md`).
   */
  async rescanTileClassification(): Promise<void> {
    const folders = this.settings.tilesetFolders ?? [];
    if (folders.length === 0) {
      new Notice('Windrose: no tileset folders registered.');
      return;
    }
    new Notice('Windrose: rescanning tile classification…');
    try {
      const allTiles: TileEntry[] = [];
      for (const folder of folders) {
        allTiles.push(...await scanTilesetFolder(this.app, folder));
      }
      // `base` is the shared store as of now; the scan below runs against it
      // and only the fields it changes are merged back, so edits made while
      // the scan is decoding tiles survive (wave-5 finding 1).
      const base = await ensureTileMetadataLoaded(this.app);
      if (isTileMetadataCorrupt()) {
        new Notice('Windrose: tile metadata file is unreadable; rescan skipped — see console.');
        return;
      }
      let metadata = base;

      // DD extraction names strip folders by their source type ("strips →
      // source dir"), so a lost ddSourceType is recoverable from the folder
      // name for pack tiles. Restoring it re-arms the walls pane and the
      // opening form (portals) after a metadata loss.
      const DD_SOURCE_FOLDERS = new Set(['walls', 'paths', 'portals', 'terrain', 'patterns']);
      const ddEntries: Array<{ vaultPath: string; sourceType: string }> = [];
      for (const t of allTiles) {
        if (!t.vaultPath.includes('/dungeondraft-packs/')) continue;
        if (metadata[t.vaultPath]?.ddSourceType != null) continue;
        const top = (t.category ?? '').split('/')[0]?.toLowerCase();
        if (top != null && DD_SOURCE_FOLDERS.has(top)) {
          ddEntries.push({ vaultPath: t.vaultPath, sourceType: top });
        }
      }
      if (ddEntries.length > 0) metadata = bulkSetDdSourceType(metadata, ddEntries);

      // Strips are line assets: scan them for signals but never predict
      // depth/render/span for them (mirrors runDdImport's skipPredictions).
      const skip = new Set<string>();
      for (const t of allTiles) {
        const src = metadata[t.vaultPath]?.ddSourceType?.toLowerCase();
        if (src === 'walls' || src === 'paths') skip.add(t.vaultPath);
      }

      const { metadata: next, stats } = await runImportDetectionPass(this.app, allTiles, metadata, {
        applyRenderMode: false,
        skipPredictions: skip,
      });
      const saved = await commitTileMetadataDelta(this.app, base, next);
      if (!saved) {
        new Notice('Windrose: rescan finished but the metadata save was refused — see console.');
        return;
      }
      window.dispatchEvent(new Event('windrose-settings-changed'));
      new Notice(
        `Windrose: classification rescan done — ${stats.scanned} scanned, ` +
        `${stats.depth} tiers, ${stats.spans} footprints, ${ddEntries.length} source types restored.`,
        10_000
      );
    } catch (e) {
      console.error('[Windrose] Tile classification rescan failed:', e);
      new Notice('Windrose: tile classification rescan failed — see console for details.');
    }
  }

  override onunload(): void {
    // Unmounting runs each tree's cleanup, which fires an unawaited save. If
    // the unload is part of an app shutdown that save may never land, so every
    // mounted map's pending data is journalled synchronously first.
    journalAll(this.app);
    for (const el of this.mountedElements) {
      render(null, el);
    }
    this.mountedElements.clear();
    // Pending tile saves must not die with the plugin: tileset art writes
    // flush synchronously, the metadata flush is async, and only after it
    // settles is the module-level store dropped.
    flushTilesetArtSaves();
    void flushTileMetadataSave().finally(resetTileMetadataStore);
    disposeImageCache();
    clearThumbnailCache();
    clearPlugin();
    delete window.__windrose;
  }

  async activateMapView(): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_WINDROSE_MAP);
    if (leaves.length > 0) {
      await this.app.workspace.revealLeaf(leaves[0]);
      return;
    }
    await this.openNewMapView();
  }

  private async openNewMapView(): Promise<void> {
    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_TYPE_WINDROSE_MAP, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  private initMcpNamespace(): void {
    window.__windrose = window.__windrose ?? {};
    window.__windrose.version = this.manifest.version;
    window.__windrose.ready = true;
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
          console.debug('[Windrose] Debug data path:', config.dataFilePath);
        }
      }
    } catch (e) {
      console.warn('[Windrose] Failed to load WINDROSE-DEBUG.json:', e);
    }
  }

  private get oldPluginDataPath(): string {
    return `${this.app.vault.configDir}/plugins/dungeon-map-tracker-settings/data.json`;
  }

  private async readOldPluginData(): Promise<Record<string, unknown> | null> {
    if (!await this.app.vault.adapter.exists(this.oldPluginDataPath)) return null;
    const content = await this.app.vault.adapter.read(this.oldPluginDataPath);
    return JSON.parse(content) as Record<string, unknown>;
  }

  private async migrateFromOldPlugin(): Promise<void> {
    const existing = await this.loadData() as Record<string, unknown> | null;
    if (existing != null && Object.keys(existing).length > 1) return;

    try {
      const oldSettings = await this.readOldPluginData();
      if (oldSettings == null) return;

      const { version, ...importable } = oldSettings;
      void version; // legacy field, not carried over
      this.settings = { ...FALLBACK_SETTINGS, ...importable };
      await this.saveData(this.settings);

      new Notice(
        'Windrose: Settings imported from your previous Windrose MapDesigner installation. ' +
        'You can now disable the old "Windrose MapDesigner" plugin under Community Plugins.',
        15000
      );
      console.debug('[Windrose] Migrated settings from dungeon-map-tracker-settings');
    } catch (e) {
      console.warn('[Windrose] Could not migrate old settings:', e);
    }
  }

  async mergeFromOldPlugin(): Promise<{ imported: string[] }> {
    const imported: string[] = [];

    const oldSettings = await this.readOldPluginData();
    if (oldSettings == null) {
      return { imported };
    }

    const old = oldSettings as Partial<PluginSettings>;
    const cur = this.settings;

    if (old.objectSets != null && old.objectSets.length > 0) {
      const existingIds = new Set((cur.objectSets ?? []).map(s => s.id));
      const newSets = old.objectSets.filter(s => !existingIds.has(s.id));
      if (newSets.length > 0) {
        cur.objectSets = [...(cur.objectSets ?? []), ...newSets];
        imported.push(`${newSets.length} object set(s)`);
      }
    }

    if ((old.activeObjectSetId ?? '') !== '' && (cur.activeObjectSetId ?? '') === '') {
      cur.activeObjectSetId = old.activeObjectSetId;
    }

    if ((old.customGridObjects?.length ?? 0) > 0 && (cur.customGridObjects?.length ?? 0) === 0) {
      cur.customGridObjects = old.customGridObjects;
      imported.push('custom grid objects');
    }
    if ((old.customGridCategories?.length ?? 0) > 0 && (cur.customGridCategories?.length ?? 0) === 0) {
      cur.customGridCategories = old.customGridCategories;
      imported.push('custom grid categories');
    }
    if ((old.customHexObjects?.length ?? 0) > 0 && (cur.customHexObjects?.length ?? 0) === 0) {
      cur.customHexObjects = old.customHexObjects;
      imported.push('custom hex objects');
    }
    if ((old.customHexCategories?.length ?? 0) > 0 && (cur.customHexCategories?.length ?? 0) === 0) {
      cur.customHexCategories = old.customHexCategories;
      imported.push('custom hex categories');
    }

    if (old.gridObjectOverrides && Object.keys(old.gridObjectOverrides).length > 0 && !(cur.gridObjectOverrides && Object.keys(cur.gridObjectOverrides).length > 0)) {
      cur.gridObjectOverrides = old.gridObjectOverrides;
      imported.push('grid object overrides');
    }
    if (old.hexObjectOverrides && Object.keys(old.hexObjectOverrides).length > 0 && !(cur.hexObjectOverrides && Object.keys(cur.hexObjectOverrides).length > 0)) {
      cur.hexObjectOverrides = old.hexObjectOverrides;
      imported.push('hex object overrides');
    }

    if (imported.length > 0) {
      await this.saveData(this.settings);
    }

    return { imported };
  }

  async hasOldPluginData(): Promise<boolean> {
    return this.app.vault.adapter.exists(this.oldPluginDataPath);
  }

  private checkForConflicts(): void {
    const appWithPlugins = this.app as typeof this.app & {
      plugins?: { plugins?: Record<string, { _loaded?: boolean }> };
    };
    const plugins = appWithPlugins.plugins?.plugins;
    if (plugins?.['dungeon-map-tracker-settings']?._loaded === true) {
      new Notice(
        'Windrose: The old "Windrose MapDesigner" settings plugin is still active. ' +
        'Please disable it in Settings → Community Plugins to avoid conflicts. ' +
        'Your settings have been imported into the new standalone plugin.',
        20000
      );
      console.warn('[Windrose] Old plugin dungeon-map-tracker-settings is still active');
    }
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

  /**
   * Mint a new mapId, generate + save a dungeon into it, and return the id.
   * The reusable "generate a new map" half of dungeon generation — no editor,
   * no code block. Shared by the command-palette generator (which inserts a
   * code block into the active note) and the full-pane view's generate action
   * (which navigates to the new map instead).
   */
  async createRandomDungeonMap(mapName: string, cells: Record<string, unknown>[], objects: unknown[], edges: unknown[], options: DungeonGenOptions): Promise<string> {
    const mapId = 'map-' + Date.now() + '-' + Math.random().toString(36).slice(2, 11);
    await this.saveDungeonToJson(mapId, mapName, cells as DungeonCell[], objects, edges, options);
    return mapId;
  }

  /**
   * Write a generated dungeon into the shared data file.
   *
   * The map is createNewMap('grid') plus the generator's overrides, persisted
   * through createMapEntry: the same guarded write path as every autosave
   * (data-file mutex, unparseable-file refusal, .bak rotation, compact JSON,
   * write-generation bump). Throws when the write fails.
   */
  private async saveDungeonToJson(mapId: string, mapName: string, cells: DungeonCell[], objects: unknown[], edges: unknown[], options: DungeonGenOptions): Promise<void> {
    try {
      const mapData = buildGeneratedDungeonMap(mapName, cells, objects, edges, options, this.buildFogOfWar(cells, options));
      await createMapEntry(this.app, mapId, mapData);
    } catch (error) {
      console.error('[Windrose] Failed to save dungeon:', error);
      throw error;
    }
  }

  async loadSettings(): Promise<void> {
    const loaded = (await this.loadData()) as Partial<PluginSettings> | null;
    this.rawLoadedSettings = loaded;
    this.settings = { ...FALLBACK_SETTINGS, ...loaded };
  }

  /**
   * One-time fresh-vs-upgrade detection for the onboarding survey.
   * Fresh installs (no settings, no map data) get 'pending' (survey);
   * everyone else gets 'whatsnew' (one-time notice). Persists via saveData
   * directly — saveSettings would dispatch the settings-changed event into
   * a half-initialized workspace.
   */
  private async resolveOnboardingState(): Promise<void> {
    if (this.settings.onboardingState != null) return;
    const mapDataExists = await this.app.vault.adapter.exists(this.dataFilePath);
    this.settings.onboardingState = decideOnboardingState(this.rawLoadedSettings, mapDataExists);
    await this.saveData(this.settings);
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

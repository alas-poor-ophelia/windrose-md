import type { App, Vault, TAbstractFile } from 'obsidian';

interface PluginLike {
  app: App;
  settings: Record<string, unknown>;
}

interface ObjectSetData {
  hex?: {
    objectOverrides?: Record<string, Record<string, unknown>>;
    customObjects?: Record<string, unknown>[];
    customCategories?: Record<string, unknown>[];
  };
  grid?: {
    objectOverrides?: Record<string, Record<string, unknown>>;
    customObjects?: Record<string, unknown>[];
    customCategories?: Record<string, unknown>[];
  };
}

interface ObjectSet {
  id: string;
  name: string;
  source: string;
  folderPath?: string;
  data: ObjectSetData;
}

interface ExportOptions {
  includeHex?: boolean;
  includeGrid?: boolean;
  name?: string;
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export const ObjectSetHelpers = {
  generateId(): string {
    return 'set-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  },

  resolveImagePaths(data: Record<string, Record<string, unknown>>, imagesFolder: string, vault: Vault): void {
    for (const side of ['hex', 'grid'] as const) {
      const sideData = data[side] as Record<string, unknown> | undefined;
      if (!sideData) continue;
      if (sideData.customObjects) {
        for (const obj of sideData.customObjects as Record<string, unknown>[]) {
          if (obj.imagePath && !(obj.imagePath as string).includes('/')) {
            const resolved = imagesFolder + '/' + obj.imagePath;
            if (vault.getAbstractFileByPath(resolved)) {
              obj.imagePath = resolved;
            }
          }
        }
      }
      if (sideData.objectOverrides) {
        for (const override of Object.values(sideData.objectOverrides as Record<string, Record<string, unknown>>)) {
          if (override.imagePath && !(override.imagePath as string).includes('/')) {
            const resolved = imagesFolder + '/' + override.imagePath;
            if (vault.getAbstractFileByPath(resolved)) {
              override.imagePath = resolved;
            }
          }
        }
      }
    }
  },

  saveCurrentAsSet(plugin: PluginLike, name: string): ObjectSet {
    const s = plugin.settings as Record<string, unknown>;
    if (!s.objectSets) s.objectSets = [];

    const set: ObjectSet = {
      id: ObjectSetHelpers.generateId(),
      name: name,
      source: 'manual',
      data: {
        hex: {
          objectOverrides: deepClone(s.hexObjectOverrides || {}),
          customObjects: deepClone(s.customHexObjects || []),
          customCategories: deepClone(s.customHexCategories || [])
        },
        grid: {
          objectOverrides: deepClone(s.gridObjectOverrides || {}),
          customObjects: deepClone(s.customGridObjects || []),
          customCategories: deepClone(s.customGridCategories || [])
        }
      }
    };

    (s.objectSets as ObjectSet[]).push(set);
    return set;
  },

  activateSet(plugin: PluginLike, setId: string): boolean {
    const s = plugin.settings as Record<string, unknown>;
    const sets = (s.objectSets || []) as ObjectSet[];
    const set = sets.find(st => st.id === setId);
    if (!set) return false;

    if (set.data.hex) {
      s.hexObjectOverrides = deepClone(set.data.hex.objectOverrides || {});
      s.customHexObjects = deepClone(set.data.hex.customObjects || []);
      s.customHexCategories = deepClone(set.data.hex.customCategories || []);
    }
    if (set.data.grid) {
      s.gridObjectOverrides = deepClone(set.data.grid.objectOverrides || {});
      s.customGridObjects = deepClone(set.data.grid.customObjects || []);
      s.customGridCategories = deepClone(set.data.grid.customCategories || []);
    }

    s.activeObjectSetId = setId;
    return true;
  },

  deactivateSet(plugin: PluginLike): void {
    plugin.settings.activeObjectSetId = null;
  },

  resetToDefaults(plugin: PluginLike): void {
    const s = plugin.settings;
    s.hexObjectOverrides = {};
    s.customHexObjects = [];
    s.customHexCategories = [];
    s.gridObjectOverrides = {};
    s.customGridObjects = [];
    s.customGridCategories = [];
    s.activeObjectSetId = null;
  },

  isDirty(plugin: PluginLike): boolean {
    const s = plugin.settings as Record<string, unknown>;
    const activeSetId = s.activeObjectSetId as string | null;

    const hexOverrides = (s.hexObjectOverrides || {}) as Record<string, unknown>;
    const hexObjects = (s.customHexObjects || []) as unknown[];
    const hexCategories = (s.customHexCategories || []) as unknown[];
    const gridOverrides = (s.gridObjectOverrides || {}) as Record<string, unknown>;
    const gridObjects = (s.customGridObjects || []) as unknown[];
    const gridCategories = (s.customGridCategories || []) as unknown[];

    if (!activeSetId) {
      return Object.keys(hexOverrides).length > 0 ||
        hexObjects.length > 0 || hexCategories.length > 0 ||
        Object.keys(gridOverrides).length > 0 ||
        gridObjects.length > 0 || gridCategories.length > 0;
    }

    const set = ((s.objectSets || []) as ObjectSet[]).find(st => st.id === activeSetId);
    if (!set) return true;

    const compare = (live: unknown, stored: unknown) => JSON.stringify(live) !== JSON.stringify(stored);

    const setHex = set.data.hex || {};
    if (compare(hexOverrides, setHex.objectOverrides || {})) return true;
    if (compare(hexObjects, setHex.customObjects || [])) return true;
    if (compare(hexCategories, setHex.customCategories || [])) return true;

    const setGrid = set.data.grid || {};
    if (compare(gridOverrides, setGrid.objectOverrides || {})) return true;
    if (compare(gridObjects, setGrid.customObjects || [])) return true;
    if (compare(gridCategories, setGrid.customCategories || [])) return true;

    return false;
  },

  deleteSet(plugin: PluginLike, setId: string): void {
    const s = plugin.settings as Record<string, unknown>;
    if (!s.objectSets) return;
    s.objectSets = (s.objectSets as ObjectSet[]).filter(st => st.id !== setId);
    if (s.activeObjectSetId === setId) {
      s.activeObjectSetId = null;
    }
  },

  renameSet(plugin: PluginLike, setId: string, newName: string): void {
    const s = plugin.settings as Record<string, unknown>;
    const set = ((s.objectSets || []) as ObjectSet[]).find(st => st.id === setId);
    if (set) set.name = newName;
  },

  getImagePaths(setData: ObjectSetData): string[] {
    const paths: string[] = [];
    for (const side of ['hex', 'grid'] as const) {
      const sideData = setData[side];
      if (!sideData) continue;
      if (sideData.customObjects) {
        for (const obj of sideData.customObjects) {
          if (obj.imagePath) paths.push(obj.imagePath as string);
        }
      }
      if (sideData.objectOverrides) {
        for (const override of Object.values(sideData.objectOverrides)) {
          if (override.imagePath) paths.push(override.imagePath as string);
        }
      }
    }
    return [...new Set(paths)];
  },

  deduplicateName(existingSets: ObjectSet[], name: string): string {
    const names = new Set(existingSets.map(s => s.name));
    if (!names.has(name)) return name;
    let counter = 2;
    while (names.has(name + ' (' + counter + ')')) counter++;
    return name + ' (' + counter + ')';
  },

  async exportSetToFolder(plugin: PluginLike, setId: string, destFolder: string, options?: ExportOptions): Promise<string> {
    const s = plugin.settings as Record<string, unknown>;
    const set = ((s.objectSets || []) as ObjectSet[]).find(st => st.id === setId);
    if (!set) throw new Error('Set not found');

    const includeHex = options?.includeHex !== false;
    const includeGrid = options?.includeGrid !== false;
    const setName = (options?.name || set.name).replace(/[\\/:*?"<>|]/g, '_');

    const exportData: Record<string, unknown> = {
      windroseMD_objectSet: true,
      version: '1.0',
      name: options?.name || set.name
    };

    const exportSetData: Record<string, unknown> = {};
    if (includeHex && set.data.hex) {
      exportSetData.hex = deepClone(set.data.hex);
    }
    if (includeGrid && set.data.grid) {
      exportSetData.grid = deepClone(set.data.grid);
    }

    const imagePaths = ObjectSetHelpers.getImagePaths(exportSetData as ObjectSetData);
    const imageMap: Record<string, string> = {};
    for (const fullPath of imagePaths) {
      const filename = fullPath.split('/').pop()!;
      imageMap[fullPath] = filename;
    }

    for (const side of ['hex', 'grid'] as const) {
      const sideData = exportSetData[side] as Record<string, unknown> | undefined;
      if (!sideData) continue;
      if (sideData.customObjects) {
        for (const obj of sideData.customObjects as Record<string, unknown>[]) {
          if (obj.imagePath && imageMap[obj.imagePath as string]) {
            obj.imagePath = imageMap[obj.imagePath as string];
          }
        }
      }
      if (sideData.objectOverrides) {
        for (const override of Object.values(sideData.objectOverrides as Record<string, Record<string, unknown>>)) {
          if (override.imagePath && imageMap[override.imagePath as string]) {
            override.imagePath = imageMap[override.imagePath as string];
          }
        }
      }
    }

    exportData.hex = exportSetData.hex;
    exportData.grid = exportSetData.grid;

    const basePath = destFolder ? destFolder + '/' + setName : 'object-sets/' + setName;

    try { await plugin.app.vault.createFolder(basePath); } catch { /* exists */ }

    const jsonPath = basePath + '/objects.json';
    const jsonContent = JSON.stringify(exportData, null, 2);
    const existingJson = plugin.app.vault.getAbstractFileByPath(jsonPath);
    if (existingJson) {
      await plugin.app.vault.modify(existingJson as TAbstractFile & { path: string }, jsonContent);
    } else {
      await plugin.app.vault.create(jsonPath, jsonContent);
    }

    if (imagePaths.length > 0) {
      const imgFolder = basePath + '/images';
      try { await plugin.app.vault.createFolder(imgFolder); } catch { /* exists */ }

      for (const fullPath of imagePaths) {
        const sourceFile = plugin.app.vault.getAbstractFileByPath(fullPath);
        if (!sourceFile) {
          console.warn('[Windrose] Export: image not found:', fullPath);
          continue;
        }
        const filename = imageMap[fullPath];
        const destPath = imgFolder + '/' + filename;
        const existingImg = plugin.app.vault.getAbstractFileByPath(destPath);
        if (!existingImg) {
          const binary = await plugin.app.vault.readBinary(sourceFile as TAbstractFile & { path: string });
          await plugin.app.vault.createBinary(destPath, binary);
        }
      }
    }

    return basePath;
  },

  async importSetFromFolder(plugin: PluginLike, folderPath: string): Promise<ObjectSet> {
    const folder = plugin.app.vault.getAbstractFileByPath(folderPath) as TAbstractFile & { children?: unknown[] } | null;
    if (!folder || !folder.children) {
      throw new Error('Folder not found: ' + folderPath);
    }

    const jsonFile = plugin.app.vault.getAbstractFileByPath(folderPath + '/objects.json');
    if (!jsonFile) {
      throw new Error('No objects.json found in ' + folderPath);
    }

    const content = await plugin.app.vault.read(jsonFile as TAbstractFile & { path: string });
    const data = JSON.parse(content);

    if (!data.windroseMD_objectSet) {
      throw new Error('Not a valid Windrose object set (missing windroseMD_objectSet flag)');
    }

    ObjectSetHelpers.resolveImagePaths(data, folderPath + '/images', plugin.app.vault);

    const s = plugin.settings as Record<string, unknown>;
    if (!s.objectSets) s.objectSets = [];

    const setName = ObjectSetHelpers.deduplicateName(s.objectSets as ObjectSet[], data.name || 'Imported Set');

    const set: ObjectSet = {
      id: ObjectSetHelpers.generateId(),
      name: setName,
      source: 'folder',
      folderPath: folderPath,
      data: {
        hex: data.hex || undefined,
        grid: data.grid || undefined
      }
    };

    (s.objectSets as ObjectSet[]).push(set);
    return set;
  },

  async scanAutoLoadFolder(plugin: PluginLike): Promise<number> {
    const folderPath = plugin.settings.objectSetsAutoLoadFolder as string | undefined;
    if (!folderPath) return 0;

    const folder = plugin.app.vault.getAbstractFileByPath(folderPath) as TAbstractFile & { children?: (TAbstractFile & { children?: unknown[]; name: string; path: string })[] } | null;
    if (!folder || !folder.children) return 0;

    if (!plugin.settings.objectSets) plugin.settings.objectSets = [];

    let added = 0;
    for (const child of folder.children) {
      if (!child.children) continue;

      const jsonFile = plugin.app.vault.getAbstractFileByPath(child.path + '/objects.json');
      if (!jsonFile) continue;

      try {
        const content = await plugin.app.vault.read(jsonFile as TAbstractFile & { path: string });
        const data = JSON.parse(content);
        if (!data.windroseMD_objectSet) continue;

        const existing = (plugin.settings.objectSets as ObjectSet[]).find(
          st => st.source === 'folder' && st.folderPath === child.path
        );

        ObjectSetHelpers.resolveImagePaths(data, child.path + '/images', plugin.app.vault);

        if (existing) {
          existing.name = data.name || existing.name;
          existing.data = { hex: data.hex, grid: data.grid };
        } else {
          const setName = ObjectSetHelpers.deduplicateName(
            plugin.settings.objectSets as ObjectSet[],
            data.name || child.name
          );

          (plugin.settings.objectSets as ObjectSet[]).push({
            id: ObjectSetHelpers.generateId(),
            name: setName,
            source: 'folder',
            folderPath: child.path,
            data: { hex: data.hex, grid: data.grid }
          });
          added++;
        }
      } catch (e) {
        console.warn('[Windrose] Scan: failed to read', child.path, (e as Error).message);
      }
    }

    return added;
  }
};

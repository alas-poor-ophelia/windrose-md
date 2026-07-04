import { TFile, TFolder } from 'obsidian';
import type { App, Vault } from 'obsidian';
import type { PluginSettings, ObjectSet, ObjectSetData } from '#types/settings/settings.types';

interface PluginLike {
  app: App;
  settings: PluginSettings;
}

interface ExportOptions {
  includeHex?: boolean;
  includeGrid?: boolean;
  name?: string;
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

export const ObjectSetHelpers = {
  generateId(): string {
    return 'set-' + Date.now() + '-' + Math.random().toString(36).slice(2, 11);
  },

  resolveImagePaths(data: ObjectSetData, imagesFolder: string, vault: Vault): void {
    for (const side of ['hex', 'grid'] as const) {
      const sideData = data[side];
      if (sideData == null) continue;
      if (sideData.customObjects != null) {
        for (const obj of sideData.customObjects) {
          if (obj.imagePath != null && !obj.imagePath.includes('/')) {
            const resolved = imagesFolder + '/' + obj.imagePath;
            if (vault.getAbstractFileByPath(resolved) != null) {
              obj.imagePath = resolved;
            }
          }
        }
      }
      if (sideData.objectOverrides != null) {
        for (const override of Object.values(sideData.objectOverrides)) {
          if (override.imagePath != null && !override.imagePath.includes('/')) {
            const resolved = imagesFolder + '/' + override.imagePath;
            if (vault.getAbstractFileByPath(resolved) != null) {
              override.imagePath = resolved;
            }
          }
        }
      }
    }
  },

  saveCurrentAsSet(plugin: PluginLike, name: string): ObjectSet {
    const s = plugin.settings;
    s.objectSets ??= [];

    const set: ObjectSet = {
      id: ObjectSetHelpers.generateId(),
      name: name,
      source: 'manual',
      data: {
        hex: {
          objectOverrides: deepClone(s.hexObjectOverrides ?? {}),
          customObjects: deepClone(s.customHexObjects ?? []),
          customCategories: deepClone(s.customHexCategories ?? [])
        },
        grid: {
          objectOverrides: deepClone(s.gridObjectOverrides ?? {}),
          customObjects: deepClone(s.customGridObjects ?? []),
          customCategories: deepClone(s.customGridCategories ?? [])
        }
      }
    };

    s.objectSets.push(set);
    return set;
  },

  activateSet(plugin: PluginLike, setId: string): boolean {
    const s = plugin.settings;
    const sets = s.objectSets ?? [];
    const set = sets.find(st => st.id === setId);
    if (set == null) return false;

    if (set.data.hex != null) {
      s.hexObjectOverrides = deepClone(set.data.hex.objectOverrides ?? {});
      s.customHexObjects = deepClone(set.data.hex.customObjects ?? []);
      s.customHexCategories = deepClone(set.data.hex.customCategories ?? []);
    }
    if (set.data.grid != null) {
      s.gridObjectOverrides = deepClone(set.data.grid.objectOverrides ?? {});
      s.customGridObjects = deepClone(set.data.grid.customObjects ?? []);
      s.customGridCategories = deepClone(set.data.grid.customCategories ?? []);
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
    const s = plugin.settings;
    const activeSetId = s.activeObjectSetId;

    const hexOverrides = s.hexObjectOverrides ?? {};
    const hexObjects = s.customHexObjects ?? [];
    const hexCategories = s.customHexCategories ?? [];
    const gridOverrides = s.gridObjectOverrides ?? {};
    const gridObjects = s.customGridObjects ?? [];
    const gridCategories = s.customGridCategories ?? [];

    if (activeSetId == null || activeSetId === '') {
      return Object.keys(hexOverrides).length > 0 ||
        hexObjects.length > 0 || hexCategories.length > 0 ||
        Object.keys(gridOverrides).length > 0 ||
        gridObjects.length > 0 || gridCategories.length > 0;
    }

    const set = (s.objectSets ?? []).find(st => st.id === activeSetId);
    if (set == null) return true;

    const compare = (live: unknown, stored: unknown): boolean => JSON.stringify(live) !== JSON.stringify(stored);

    const setHex = set.data.hex ?? {};
    if (compare(hexOverrides, setHex.objectOverrides ?? {})) return true;
    if (compare(hexObjects, setHex.customObjects ?? [])) return true;
    if (compare(hexCategories, setHex.customCategories ?? [])) return true;

    const setGrid = set.data.grid ?? {};
    if (compare(gridOverrides, setGrid.objectOverrides ?? {})) return true;
    if (compare(gridObjects, setGrid.customObjects ?? [])) return true;
    if (compare(gridCategories, setGrid.customCategories ?? [])) return true;

    return false;
  },

  deleteSet(plugin: PluginLike, setId: string): void {
    const s = plugin.settings;
    if (s.objectSets == null) return;
    s.objectSets = s.objectSets.filter(st => st.id !== setId);
    if (s.activeObjectSetId === setId) {
      s.activeObjectSetId = null;
    }
  },

  renameSet(plugin: PluginLike, setId: string, newName: string): void {
    const s = plugin.settings;
    const set = (s.objectSets ?? []).find(st => st.id === setId);
    if (set != null) set.name = newName;
  },

  getImagePaths(setData: ObjectSetData): string[] {
    const paths: string[] = [];
    for (const side of ['hex', 'grid'] as const) {
      const sideData = setData[side];
      if (sideData == null) continue;
      if (sideData.customObjects != null) {
        for (const obj of sideData.customObjects) {
          if (obj.imagePath != null) paths.push(obj.imagePath);
        }
      }
      if (sideData.objectOverrides != null) {
        for (const override of Object.values(sideData.objectOverrides)) {
          if (override.imagePath != null) paths.push(override.imagePath);
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
    const s = plugin.settings;
    const set = (s.objectSets ?? []).find(st => st.id === setId);
    if (set == null) throw new Error('Set not found');

    const includeHex = options?.includeHex !== false;
    const includeGrid = options?.includeGrid !== false;
    const setName = (options?.name != null && options.name !== '' ? options.name : set.name).replace(/[\\/:*?"<>|]/g, '_');

    const exportData: Record<string, unknown> = {
      windroseMD_objectSet: true,
      version: '1.0',
      name: options?.name != null && options.name !== '' ? options.name : set.name
    };

    const exportSetData: ObjectSetData = {};
    if (includeHex && set.data.hex) {
      exportSetData.hex = deepClone(set.data.hex);
    }
    if (includeGrid && set.data.grid) {
      exportSetData.grid = deepClone(set.data.grid);
    }

    const imagePaths = ObjectSetHelpers.getImagePaths(exportSetData);
    const imageMap: Record<string, string> = {};
    for (const fullPath of imagePaths) {
      const filename = fullPath.split('/').pop() ?? fullPath;
      imageMap[fullPath] = filename;
    }

    for (const side of ['hex', 'grid'] as const) {
      const sideData = exportSetData[side];
      if (sideData == null) continue;
      if (sideData.customObjects != null) {
        for (const obj of sideData.customObjects) {
          if (obj.imagePath != null && imageMap[obj.imagePath] != null) {
            obj.imagePath = imageMap[obj.imagePath];
          }
        }
      }
      if (sideData.objectOverrides != null) {
        for (const override of Object.values(sideData.objectOverrides)) {
          if (override.imagePath != null && imageMap[override.imagePath] != null) {
            override.imagePath = imageMap[override.imagePath];
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
    if (existingJson instanceof TFile) {
      await plugin.app.vault.modify(existingJson, jsonContent);
    } else {
      await plugin.app.vault.create(jsonPath, jsonContent);
    }

    if (imagePaths.length > 0) {
      const imgFolder = basePath + '/images';
      try { await plugin.app.vault.createFolder(imgFolder); } catch { /* exists */ }

      for (const fullPath of imagePaths) {
        const sourceFile = plugin.app.vault.getAbstractFileByPath(fullPath);
        if (!(sourceFile instanceof TFile)) {
          console.warn('[Windrose] Export: image not found:', fullPath);
          continue;
        }
        const filename = imageMap[fullPath];
        const destPath = imgFolder + '/' + filename;
        const existingImg = plugin.app.vault.getAbstractFileByPath(destPath);
        if (existingImg == null) {
          const binary = await plugin.app.vault.readBinary(sourceFile);
          await plugin.app.vault.createBinary(destPath, binary);
        }
      }
    }

    return basePath;
  },

  async importSetFromFolder(plugin: PluginLike, folderPath: string): Promise<ObjectSet> {
    const folder = plugin.app.vault.getAbstractFileByPath(folderPath);
    if (!(folder instanceof TFolder)) {
      throw new Error('Folder not found: ' + folderPath);
    }

    const jsonFile = plugin.app.vault.getAbstractFileByPath(folderPath + '/objects.json');
    if (!(jsonFile instanceof TFile)) {
      throw new Error('No objects.json found in ' + folderPath);
    }

    const content = await plugin.app.vault.read(jsonFile);
    const data = JSON.parse(content) as ObjectSetData & { windroseMD_objectSet?: boolean; name?: string };

    if (data.windroseMD_objectSet == null) {
      throw new Error('Not a valid Windrose object set (missing windroseMD_objectSet flag)');
    }

    ObjectSetHelpers.resolveImagePaths(data, folderPath + '/images', plugin.app.vault);

    const s = plugin.settings;
    s.objectSets ??= [];

    const setName = ObjectSetHelpers.deduplicateName(s.objectSets, data.name ?? 'Imported Set');

    const set: ObjectSet = {
      id: ObjectSetHelpers.generateId(),
      name: setName,
      source: 'folder',
      folderPath: folderPath,
      data: {
        hex: data.hex ?? undefined,
        grid: data.grid ?? undefined
      }
    };

    s.objectSets.push(set);
    return set;
  },

  async scanAutoLoadFolder(plugin: PluginLike): Promise<number> {
    const folderPath = plugin.settings.objectSetsAutoLoadFolder;
    if (folderPath == null || folderPath === '') return 0;

    const folder = plugin.app.vault.getAbstractFileByPath(folderPath);
    if (!(folder instanceof TFolder)) return 0;

    plugin.settings.objectSets ??= [];

    let added = 0;
    for (const child of folder.children) {
      if (!(child instanceof TFolder)) continue;

      const jsonFile = plugin.app.vault.getAbstractFileByPath(child.path + '/objects.json');
      if (!(jsonFile instanceof TFile)) continue;

      try {
        const content = await plugin.app.vault.read(jsonFile);
        const data = JSON.parse(content) as ObjectSetData & { windroseMD_objectSet?: boolean; name?: string };
        if (data.windroseMD_objectSet == null) continue;

        const existing = plugin.settings.objectSets.find(
          st => st.source === 'folder' && st.folderPath === child.path
        );

        ObjectSetHelpers.resolveImagePaths(data, child.path + '/images', plugin.app.vault);

        if (existing != null) {
          existing.name = data.name ?? existing.name;
          existing.data = { hex: data.hex, grid: data.grid };
        } else {
          const setName = ObjectSetHelpers.deduplicateName(
            plugin.settings.objectSets,
            data.name ?? child.name
          );

          plugin.settings.objectSets.push({
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

return `// settingsPlugin-ObjectSetHelpers.js
// Object set management helpers - save, activate, import, export, scan
// This file is concatenated into the settings plugin template by the assembler

/**
 * Object set management helpers.
 * All methods take the plugin instance for access to settings and vault.
 */
const ObjectSetHelpers = {
  generateId() {
    return 'set-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  },

  /**
   * Snapshot current hex+grid object data into a new ObjectSet.
   */
  saveCurrentAsSet(plugin, name) {
    const s = plugin.settings;
    if (!s.objectSets) s.objectSets = [];

    const set = {
      id: ObjectSetHelpers.generateId(),
      name: name,
      source: 'manual',
      data: {
        hex: {
          objectOverrides: JSON.parse(JSON.stringify(s.hexObjectOverrides || {})),
          customObjects: JSON.parse(JSON.stringify(s.customHexObjects || [])),
          customCategories: JSON.parse(JSON.stringify(s.customHexCategories || []))
        },
        grid: {
          objectOverrides: JSON.parse(JSON.stringify(s.gridObjectOverrides || {})),
          customObjects: JSON.parse(JSON.stringify(s.customGridObjects || [])),
          customCategories: JSON.parse(JSON.stringify(s.customGridCategories || []))
        }
      }
    };

    s.objectSets.push(set);
    return set;
  },

  /**
   * Copy-on-activate: overwrite hex/grid settings keys from set data.
   * Only overwrites sides that are present in the set (partial apply).
   */
  activateSet(plugin, setId) {
    const s = plugin.settings;
    const sets = s.objectSets || [];
    const set = sets.find(st => st.id === setId);
    if (!set) return false;

    if (set.data.hex) {
      s.hexObjectOverrides = JSON.parse(JSON.stringify(set.data.hex.objectOverrides || {}));
      s.customHexObjects = JSON.parse(JSON.stringify(set.data.hex.customObjects || []));
      s.customHexCategories = JSON.parse(JSON.stringify(set.data.hex.customCategories || []));
    }
    if (set.data.grid) {
      s.gridObjectOverrides = JSON.parse(JSON.stringify(set.data.grid.objectOverrides || {}));
      s.customGridObjects = JSON.parse(JSON.stringify(set.data.grid.customObjects || []));
      s.customGridCategories = JSON.parse(JSON.stringify(set.data.grid.customCategories || []));
    }

    s.activeObjectSetId = setId;
    return true;
  },

  /**
   * Clear activeObjectSetId. Leaves current objects in place.
   */
  deactivateSet(plugin) {
    plugin.settings.activeObjectSetId = null;
  },

  /**
   * Reset all object customizations to built-in defaults for both map types.
   * Clears overrides, custom objects, custom categories, and active set tracking.
   */
  resetToDefaults(plugin) {
    const s = plugin.settings;
    s.hexObjectOverrides = {};
    s.customHexObjects = [];
    s.customHexCategories = [];
    s.gridObjectOverrides = {};
    s.customGridObjects = [];
    s.customGridCategories = [];
    s.activeObjectSetId = null;
  },

  /**
   * Check if live object settings differ from the active set (or from defaults).
   * Returns true if the user has unsaved modifications.
   */
  isDirty(plugin) {
    const s = plugin.settings;
    const activeSetId = s.activeObjectSetId;

    const hexOverrides = s.hexObjectOverrides || {};
    const hexObjects = s.customHexObjects || [];
    const hexCategories = s.customHexCategories || [];
    const gridOverrides = s.gridObjectOverrides || {};
    const gridObjects = s.customGridObjects || [];
    const gridCategories = s.customGridCategories || [];

    if (!activeSetId) {
      // On Defaults - dirty if any customizations exist
      return Object.keys(hexOverrides).length > 0 ||
        hexObjects.length > 0 || hexCategories.length > 0 ||
        Object.keys(gridOverrides).length > 0 ||
        gridObjects.length > 0 || gridCategories.length > 0;
    }

    // On a named set - compare live state to stored snapshot
    const set = (s.objectSets || []).find(st => st.id === activeSetId);
    if (!set) return true;

    const compare = (live, stored) => JSON.stringify(live) !== JSON.stringify(stored);

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

  /**
   * Delete a set by ID. Clears activeObjectSetId if it was the active set.
   */
  deleteSet(plugin, setId) {
    const s = plugin.settings;
    if (!s.objectSets) return;
    s.objectSets = s.objectSets.filter(st => st.id !== setId);
    if (s.activeObjectSetId === setId) {
      s.activeObjectSetId = null;
    }
  },

  /**
   * Rename a set in place.
   */
  renameSet(plugin, setId, newName) {
    const s = plugin.settings;
    const set = (s.objectSets || []).find(st => st.id === setId);
    if (set) set.name = newName;
  },

  /**
   * Get all imagePath values from a set's custom objects.
   */
  getImagePaths(setData) {
    const paths = [];
    for (const side of ['hex', 'grid']) {
      const sideData = setData[side];
      if (!sideData || !sideData.customObjects) continue;
      for (const obj of sideData.customObjects) {
        if (obj.imagePath) paths.push(obj.imagePath);
      }
    }
    return [...new Set(paths)];
  },

  /**
   * Deduplicate a set name against existing sets.
   * Returns the name as-is if unique, or appends " (2)", " (3)", etc.
   */
  deduplicateName(existingSets, name) {
    const names = new Set(existingSets.map(s => s.name));
    if (!names.has(name)) return name;
    let counter = 2;
    while (names.has(name + ' (' + counter + ')')) counter++;
    return name + ' (' + counter + ')';
  },

  /**
   * Export a set to a vault folder.
   * Creates <destFolder>/<setName>/objects.json and copies images to images/.
   */
  async exportSetToFolder(plugin, setId, destFolder, options) {
    const s = plugin.settings;
    const set = (s.objectSets || []).find(st => st.id === setId);
    if (!set) throw new Error('Set not found');

    const includeHex = options?.includeHex !== false;
    const includeGrid = options?.includeGrid !== false;
    const setName = (options?.name || set.name).replace(/[\\\\/:*?"<>|]/g, '_');

    // Build export data
    const exportData = {
      windroseMD_objectSet: true,
      version: '1.0',
      name: options?.name || set.name
    };

    const exportSetData = {};
    if (includeHex && set.data.hex) {
      exportSetData.hex = JSON.parse(JSON.stringify(set.data.hex));
    }
    if (includeGrid && set.data.grid) {
      exportSetData.grid = JSON.parse(JSON.stringify(set.data.grid));
    }

    // Collect image paths and rewrite to relative filenames
    const imagePaths = ObjectSetHelpers.getImagePaths(exportSetData);
    const imageMap = {};
    for (const fullPath of imagePaths) {
      const filename = fullPath.split('/').pop();
      imageMap[fullPath] = filename;
    }

    // Rewrite imagePath in export data to relative filenames
    for (const side of ['hex', 'grid']) {
      if (!exportSetData[side] || !exportSetData[side].customObjects) continue;
      for (const obj of exportSetData[side].customObjects) {
        if (obj.imagePath && imageMap[obj.imagePath]) {
          obj.imagePath = imageMap[obj.imagePath];
        }
      }
    }

    exportData.hex = exportSetData.hex;
    exportData.grid = exportSetData.grid;

    // Write to vault
    const basePath = destFolder ? destFolder + '/' + setName : 'object-sets/' + setName;

    // Ensure folders exist
    try { await plugin.app.vault.createFolder(basePath); } catch (e) { /* exists */ }

    const jsonPath = basePath + '/objects.json';
    const jsonContent = JSON.stringify(exportData, null, 2);
    const existingJson = plugin.app.vault.getAbstractFileByPath(jsonPath);
    if (existingJson) {
      await plugin.app.vault.modify(existingJson, jsonContent);
    } else {
      await plugin.app.vault.create(jsonPath, jsonContent);
    }

    // Copy images
    if (imagePaths.length > 0) {
      const imgFolder = basePath + '/images';
      try { await plugin.app.vault.createFolder(imgFolder); } catch (e) { /* exists */ }

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
          const binary = await plugin.app.vault.readBinary(sourceFile);
          await plugin.app.vault.createBinary(destPath, binary);
        }
      }
    }

    return basePath;
  },

  /**
   * Import a set from a vault folder containing objects.json.
   * Resolves relative image filenames back to vault paths.
   */
  async importSetFromFolder(plugin, folderPath) {
    const folder = plugin.app.vault.getAbstractFileByPath(folderPath);
    if (!folder || !folder.children) {
      throw new Error('Folder not found: ' + folderPath);
    }

    const jsonFile = plugin.app.vault.getAbstractFileByPath(folderPath + '/objects.json');
    if (!jsonFile) {
      throw new Error('No objects.json found in ' + folderPath);
    }

    const content = await plugin.app.vault.read(jsonFile);
    const data = JSON.parse(content);

    if (!data.windroseMD_objectSet) {
      throw new Error('Not a valid Windrose object set (missing windroseMD_objectSet flag)');
    }

    // Resolve relative image filenames to vault paths
    const imagesFolder = folderPath + '/images';
    for (const side of ['hex', 'grid']) {
      if (!data[side] || !data[side].customObjects) continue;
      for (const obj of data[side].customObjects) {
        if (obj.imagePath && !obj.imagePath.includes('/')) {
          // Relative filename — resolve to images subfolder
          const resolved = imagesFolder + '/' + obj.imagePath;
          const imageFile = plugin.app.vault.getAbstractFileByPath(resolved);
          if (imageFile) {
            obj.imagePath = resolved;
          } else {
            console.warn('[Windrose] Import: image not found:', resolved);
          }
        }
      }
    }

    // Build set object
    const s = plugin.settings;
    if (!s.objectSets) s.objectSets = [];

    const setName = ObjectSetHelpers.deduplicateName(s.objectSets, data.name || 'Imported Set');

    const set = {
      id: ObjectSetHelpers.generateId(),
      name: setName,
      source: 'folder',
      folderPath: folderPath,
      data: {
        hex: data.hex || undefined,
        grid: data.grid || undefined
      }
    };

    s.objectSets.push(set);
    return set;
  },

  /**
   * Scan the auto-load folder for valid object set packages.
   * Adds or updates folder-sourced sets. Does not remove stale ones
   * (user may have moved folders around).
   */
  async scanAutoLoadFolder(plugin) {
    const folderPath = plugin.settings.objectSetsAutoLoadFolder;
    if (!folderPath) return 0;

    const folder = plugin.app.vault.getAbstractFileByPath(folderPath);
    if (!folder || !folder.children) return 0;

    if (!plugin.settings.objectSets) plugin.settings.objectSets = [];

    let added = 0;
    for (const child of folder.children) {
      // Only look at subfolders
      if (!child.children) continue;

      const jsonFile = plugin.app.vault.getAbstractFileByPath(child.path + '/objects.json');
      if (!jsonFile) continue;

      try {
        const content = await plugin.app.vault.read(jsonFile);
        const data = JSON.parse(content);
        if (!data.windroseMD_objectSet) continue;

        // Check if this folder is already tracked
        const existing = plugin.settings.objectSets.find(
          st => st.source === 'folder' && st.folderPath === child.path
        );

        if (existing) {
          // Update data in place
          existing.name = data.name || existing.name;
          existing.data = { hex: data.hex, grid: data.grid };
        } else {
          // Resolve image paths before adding
          const imagesFolder = child.path + '/images';
          for (const side of ['hex', 'grid']) {
            if (!data[side] || !data[side].customObjects) continue;
            for (const obj of data[side].customObjects) {
              if (obj.imagePath && !obj.imagePath.includes('/')) {
                const resolved = imagesFolder + '/' + obj.imagePath;
                const imageFile = plugin.app.vault.getAbstractFileByPath(resolved);
                if (imageFile) {
                  obj.imagePath = resolved;
                }
              }
            }
          }

          const setName = ObjectSetHelpers.deduplicateName(
            plugin.settings.objectSets,
            data.name || child.name
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
        console.warn('[Windrose] Scan: failed to read', child.path, e.message);
      }
    }

    return added;
  }
};`;

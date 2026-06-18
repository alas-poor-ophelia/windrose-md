import { requestUrl, Notice } from 'obsidian';
import { TFile } from 'obsidian';
import type { App } from 'obsidian';
import { unzipSync } from 'fflate';
import type { RegistryPack, InstalledPack } from '#types/content-packs/contentPack.types';
import type { PluginSettings } from '#types/settings/settings.types';
import { CONTENT_PACKS_FOLDER } from './contentPackConstants';
import { ObjectSetHelpers } from '../settings/helpers/objectSetHelpers';

interface PluginLike {
  app: App;
  settings: PluginSettings;
  saveSettings(): Promise<void>;
}

function getExtractPath(pack: RegistryPack, settings: PluginSettings): string {
  switch (pack.type) {
    case 'object-pack': {
      const autoLoadFolder = settings.objectSetsAutoLoadFolder;
      if (autoLoadFolder != null && autoLoadFolder !== '') {
        return autoLoadFolder + '/' + pack.id;
      }
      return CONTENT_PACKS_FOLDER + '/object-packs/' + pack.id;
    }
    case 'fog-pack':
      return CONTENT_PACKS_FOLDER + '/fog';
    case 'font-pack':
      return CONTENT_PACKS_FOLDER + '/fonts';
    default:
      return CONTENT_PACKS_FOLDER + '/' + String(pack.type);
  }
}

async function ensureFolder(app: App, path: string): Promise<void> {
  const parts = path.split('/');
  let current = '';
  for (const part of parts) {
    current = current === '' ? part : current + '/' + part;
    try { await app.vault.createFolder(current); } catch { /* exists */ }
  }
}

async function downloadAndInstallPack(
  plugin: PluginLike,
  pack: RegistryPack
): Promise<InstalledPack> {
  new Notice('Downloading ' + pack.name + '...');

  const response = await requestUrl({ url: pack.downloadUrl });
  const zipData = new Uint8Array(response.arrayBuffer);
  const extracted = unzipSync(zipData);

  const basePath = getExtractPath(pack, plugin.settings);
  await ensureFolder(plugin.app, basePath);

  for (const [filePath, fileData] of Object.entries(extracted)) {
    if (filePath.endsWith('/')) {
      await ensureFolder(plugin.app, basePath + '/' + filePath.slice(0, -1));
      continue;
    }

    const segments = filePath.split('/');
    const relativePath = segments.length > 1 ? segments.slice(1).join('/') : filePath;
    const fullPath = basePath + '/' + relativePath;

    const parentDir = fullPath.substring(0, fullPath.lastIndexOf('/'));
    if (parentDir !== basePath) {
      await ensureFolder(plugin.app, parentDir);
    }

    const existing = plugin.app.vault.getAbstractFileByPath(fullPath);
    if (existing instanceof TFile) {
      await plugin.app.vault.modifyBinary(existing, fileData.buffer);
    } else if (filePath.endsWith('.json')) {
      const text = new TextDecoder().decode(fileData);
      await plugin.app.vault.create(fullPath, text);
    } else {
      await plugin.app.vault.createBinary(fullPath, fileData.buffer);
    }
  }

  if (pack.type === 'object-pack') {
    try {
      await ObjectSetHelpers.importSetFromFolder(plugin as any, basePath);
    } catch (err) {
      console.warn('[Windrose] Object set auto-import failed:', err);
    }
  }

  const installed: InstalledPack = {
    id: pack.id,
    name: pack.name,
    type: pack.type,
    version: pack.version,
    installedAt: Date.now(),
    vaultPath: basePath,
  };

  if (plugin.settings.installedContentPacks == null) {
    plugin.settings.installedContentPacks = [];
  }

  const existingIdx = plugin.settings.installedContentPacks.findIndex((p: InstalledPack) => p.id === pack.id);
  if (existingIdx >= 0) {
    plugin.settings.installedContentPacks[existingIdx] = installed;
  } else {
    plugin.settings.installedContentPacks.push(installed);
  }
  await plugin.saveSettings();

  new Notice(pack.name + ' installed successfully.');
  return installed;
}

export { downloadAndInstallPack };
export type { PluginLike };

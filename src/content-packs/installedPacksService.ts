import { Notice } from 'obsidian';
import type { App } from 'obsidian';
import type { InstalledPack, RegistryPack } from '#types/content-packs/contentPack.types';
import type { PluginSettings } from '#types/settings/settings.types';

interface PluginLike {
  app: App;
  settings: PluginSettings;
  saveSettings(): Promise<void>;
}

function getInstalledPacks(plugin: PluginLike): InstalledPack[] {
  return plugin.settings.installedContentPacks ?? [];
}

function isPackInstalled(plugin: PluginLike, packId: string): boolean {
  return getInstalledPacks(plugin).some(p => p.id === packId);
}

function getInstalledVersion(plugin: PluginLike, packId: string): string | undefined {
  return getInstalledPacks(plugin).find(p => p.id === packId)?.version;
}

function hasUpdate(installed: InstalledPack, registry: RegistryPack): boolean {
  return installed.version !== registry.version;
}

/** A pack may only trash a folder that is named after the pack itself. */
function ownsFolder(pack: InstalledPack): boolean {
  const last = pack.vaultPath.split('/').filter(seg => seg !== '').pop();
  return last === pack.id;
}

/** Currently has no UI caller; kept correct for when an uninstall control is wired. */
async function uninstallPack(plugin: PluginLike, packId: string): Promise<void> {
  const packs = getInstalledPacks(plugin);
  const pack = packs.find(p => p.id === packId);
  if (pack == null) return;

  if (pack.type === 'travel-pack') {
    // Travel packs live in settings, not vault folders
    plugin.settings.travelPacks = (plugin.settings.travelPacks ?? []).filter(p => p.id !== packId);
  } else if (pack.vaultPath !== '') {
    if (ownsFolder(pack)) {
      const folder = plugin.app.vault.getAbstractFileByPath(pack.vaultPath);
      if (folder != null) {
        await plugin.app.fileManager.trashFile(folder);
      }
    } else {
      // Legacy fog/font installs shared one folder across packs and kept no
      // per-file record, so deleting it would remove other packs' files.
      new Notice(
        pack.name + ' was installed into a shared folder (' + pack.vaultPath +
        '). It was removed from the installed list, but its files were left in place.'
      );
    }
  }

  plugin.settings.installedContentPacks = packs.filter(p => p.id !== packId);
  await plugin.saveSettings();
}

export { getInstalledPacks, isPackInstalled, getInstalledVersion, hasUpdate, uninstallPack };

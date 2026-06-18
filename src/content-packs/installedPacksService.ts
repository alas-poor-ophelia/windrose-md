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

async function uninstallPack(plugin: PluginLike, packId: string): Promise<void> {
  const packs = getInstalledPacks(plugin);
  const pack = packs.find(p => p.id === packId);
  if (pack == null) return;

  const folder = plugin.app.vault.getAbstractFileByPath(pack.vaultPath);
  if (folder != null) {
    await plugin.app.fileManager.trashFile(folder);
  }

  plugin.settings.installedContentPacks = packs.filter(p => p.id !== packId);
  await plugin.saveSettings();
}

export { getInstalledPacks, isPackInstalled, getInstalledVersion, hasUpdate, uninstallPack };

import { Modal, Notice } from 'obsidian';
import type { App } from 'obsidian';
import type { PluginSettings } from '#types/settings/settings.types';
import type { PackType, RegistryPack } from '#types/content-packs/contentPack.types';
import { fetchRegistry } from './registryService';
import { downloadAndInstallPack } from './downloadService';
import { isPackInstalled, getInstalledVersion, hasUpdate } from './installedPacksService';

interface PluginLike {
  app: App;
  settings: PluginSettings;
  saveSettings(): Promise<void>;
}

const TAB_CONFIG: { type: PackType; label: string }[] = [
  { type: 'object-pack', label: 'Object Packs' },
  { type: 'fog-pack', label: 'Fog of War' },
];

class ContentPackBrowserModal extends Modal {
  private plugin: PluginLike;
  private activeTab: PackType;
  private onInstalled?: () => void;
  private tabButtons: Record<string, HTMLElement> = {};
  private listContainer!: HTMLElement;
  private didInstall = false;

  constructor(app: App, plugin: PluginLike, initialTab: PackType, onInstalled?: () => void) {
    super(app);
    this.plugin = plugin;
    this.activeTab = initialTab;
    this.onInstalled = onInstalled;
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('windrose-content-pack-modal');

    contentEl.createEl('h2', { text: 'Content packs' });

    const tabBar = contentEl.createDiv({ cls: 'windrose-content-pack-tabs' });
    for (const tab of TAB_CONFIG) {
      const btn = tabBar.createEl('button', {
        text: tab.label,
        cls: 'windrose-content-pack-tab' + (this.activeTab === tab.type ? ' active' : ''),
        attr: { type: 'button' },
      });
      btn.onclick = () => {
        if (this.activeTab === tab.type) return;
        this.activeTab = tab.type;
        this.updateTabButtons();
        void this.renderPackList();
      };
      this.tabButtons[tab.type] = btn;
    }

    this.listContainer = contentEl.createDiv({ cls: 'windrose-content-pack-list' });

    await this.renderPackList();
  }

  onClose(): void {
    if (this.didInstall && this.onInstalled) {
      this.onInstalled();
    }
  }

  private updateTabButtons(): void {
    for (const [type, btn] of Object.entries(this.tabButtons)) {
      if (type === this.activeTab) {
        btn.addClass('active');
      } else {
        btn.removeClass('active');
      }
    }
  }

  private async validateInstalledPacks(): Promise<void> {
    const packs = this.plugin.settings.installedContentPacks;
    if (packs == null || packs.length === 0) return;

    let changed = false;
    const valid = [];
    for (const pack of packs) {
      const filesExist = await this.app.vault.adapter.exists(pack.vaultPath);
      if (!filesExist) {
        changed = true;
        continue;
      }

      if (pack.type === 'object-pack') {
        const sets = this.plugin.settings.objectSets ?? [];
        const setExists = sets.some(s => s.folderPath === pack.vaultPath);
        if (!setExists) {
          changed = true;
          continue;
        }
      }

      valid.push(pack);
    }

    if (changed) {
      this.plugin.settings.installedContentPacks = valid;
      await this.plugin.saveSettings();
    }
  }

  private async renderPackList(): Promise<void> {
    const container = this.listContainer;
    container.empty();

    container.createDiv({ cls: 'windrose-content-pack-loading', text: 'Loading content packs...' });

    try {
      await this.validateInstalledPacks();
      const registry = await fetchRegistry();
      container.empty();

      const packs = registry.packs.filter(p => p.type === this.activeTab);

      if (packs.length === 0) {
        container.createDiv({
          cls: 'windrose-content-pack-empty',
          text: 'No packs available in this category.',
        });
        return;
      }

      for (const pack of packs) {
        this.renderPackItem(container, pack);
      }
    } catch {
      container.empty();
      container.createDiv({
        cls: 'windrose-content-pack-error',
        text: 'Failed to load content packs. Check your internet connection.',
      });
    }
  }

  private renderPackItem(container: HTMLElement, pack: RegistryPack): void {
    const item = container.createDiv({ cls: 'windrose-content-pack-item' });

    const info = item.createDiv({ cls: 'windrose-content-pack-info' });
    info.createDiv({ cls: 'windrose-content-pack-name', text: pack.name });
    info.createDiv({ cls: 'windrose-content-pack-author', text: 'by ' + pack.author });
    info.createDiv({ cls: 'windrose-content-pack-desc', text: pack.description });

    const sizeKB = Math.round(pack.size / 1024);
    info.createDiv({ cls: 'windrose-content-pack-meta', text: sizeKB + ' KB · v' + pack.version });

    const action = item.createDiv({ cls: 'windrose-content-pack-action' });

    const installed = isPackInstalled(this.plugin, pack.id);
    const installedVersion = getInstalledVersion(this.plugin, pack.id);

    if (installed && installedVersion != null) {
      const installedPack = (this.plugin.settings.installedContentPacks ?? [])
        .find(p => p.id === pack.id);
      if (installedPack != null && hasUpdate(installedPack, pack)) {
        const updateBtn = action.createEl('button', {
          text: 'Update',
          cls: 'windrose-content-pack-btn windrose-content-pack-btn-update',
          attr: { type: 'button' },
        });
        updateBtn.onclick = () => void this.installPack(pack, updateBtn);
      } else {
        action.createSpan({
          text: 'Installed ✓',
          cls: 'windrose-content-pack-installed',
        });
      }
    } else {
      const installBtn = action.createEl('button', {
        text: 'Install',
        cls: 'windrose-content-pack-btn',
        attr: { type: 'button' },
      });
      installBtn.onclick = () => void this.installPack(pack, installBtn);
    }
  }

  private async installPack(pack: RegistryPack, btn: HTMLElement): Promise<void> {
    btn.textContent = 'Installing...';
    btn.addClass('windrose-content-pack-btn-disabled');
    (btn as HTMLButtonElement).disabled = true;

    try {
      await downloadAndInstallPack(this.plugin, pack);
      this.didInstall = true;

      const parent = btn.parentElement;
      if (parent != null) {
        parent.empty();
        parent.createSpan({
          text: 'Installed ✓',
          cls: 'windrose-content-pack-installed',
        });
      }
    } catch (err) {
      btn.textContent = 'Install';
      btn.removeClass('windrose-content-pack-btn-disabled');
      (btn as HTMLButtonElement).disabled = false;
      new Notice('Failed to install ' + pack.name + '. Check the console for details.');
      console.error('[Windrose] Pack install failed:', err);
    }
  }
}

export { ContentPackBrowserModal };

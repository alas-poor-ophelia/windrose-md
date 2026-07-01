import type { App, Plugin} from 'obsidian';
import { Notice, PluginSettingTab, Setting } from 'obsidian';
import type { PluginSettings } from '#types/settings/settings.types';
import type { SectionRef, ObjectSettingsForMapType, ObjectSettingsUpdate } from './tabs/settingsTabContext';
import { TabRenderCoreMethods } from './tabs/TabRenderCore';
import { TabRenderSettingsMethods } from './tabs/TabRenderSettings';
import { TabRenderColorsMethods } from './tabs/TabRenderColors';
import { TabRenderObjectsMethods } from './tabs/TabRenderObjects';
import { TabRenderTilesetsMethods } from './tabs/TabRenderTilesets';
import { TabRenderKeyboardShortcutsMethods } from './tabs/TabRenderKeyboardShortcuts';

interface WindrosePlugin extends Plugin {
  settings: PluginSettings;
  saveSettings(): Promise<void>;
  mergeFromOldPlugin(): Promise<{ imported: string[] }>;
  hasOldPluginData(): Promise<boolean>;
}

// Declaration merging: tells TypeScript this class has the mixin methods that are
// added at runtime via Object.assign(prototype, ...Methods) below. Deliberate and
// safe. The "proper" structural fix (mixins as free functions) is DEFERRED to the
// Obsidian declarative Settings API migration — that rewrites this whole tab, so
// restructuring now would be throwaway work. See project_eslint_0_3_migration.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface WindroseMDSettingsTab {
  renderSearchBar(containerEl: HTMLElement): void;
  renderHexSettingsContent(el: HTMLElement): void;
  renderColorSettingsContent(el: HTMLElement): void;
  renderFogOfWarSettingsContent(el: HTMLElement): void;
  renderMapBehaviorSettingsContent(el: HTMLElement): void;
  renderDistanceMeasurementSettingsContent(el: HTMLElement): void;
  renderColorPaletteContent(el: HTMLElement): void;
  renderColorList(container: HTMLElement): void;
  renderColorRow(container: HTMLElement, color: Record<string, unknown>, index: number, isCustom: boolean): void;
  renderObjectTypesContent(el: HTMLElement): void;
  renderObjectList(container: HTMLElement): void;
  renderObjectRow(container: HTMLElement, obj: Record<string, unknown>, isCustom: boolean, index?: number): void;
  renderObjectSetsBlock(containerEl: HTMLElement): void;
  setupDragDropForList(listEl: HTMLElement, items: unknown[], onReorder: () => void): void;
  renderTilesetFoldersContent(el: HTMLElement): void;
  renderKeyboardShortcutsContent(el: HTMLElement): void;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see interface note above (deferred to Settings API migration)
class WindroseMDSettingsTab extends PluginSettingTab {
  plugin: WindrosePlugin;
  settingsChanged: boolean;
  objectFilter: string;
  selectedMapType: 'grid' | 'hex';
  noResultsEl!: HTMLElement;
  sections: SectionRef[];

  constructor(app: App, plugin: WindrosePlugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.settingsChanged = false;
    this.objectFilter = '';
    this.selectedMapType = 'grid';
    this.sections = [];
  }

  private renderImportBanner(containerEl: HTMLElement): void {
    void this.plugin.hasOldPluginData().then(hasOld => {
      if (!hasOld) return;
      new Setting(containerEl)
        .setName('Import settings from previous installation')
        .setDesc('Found settings from the old Windrose MapDesigner plugin. Import object sets, custom objects, and overrides.')
        .addButton(btn => btn
          .setButtonText('Import')
          .setCta()
          .onClick(async () => {
            const { imported } = await this.plugin.mergeFromOldPlugin();
            if (imported.length > 0) {
              new Notice(`Windrose: Imported ${imported.join(', ')}`, 10000);
              this.settingsChanged = true;
              this.display();
            } else {
              new Notice('Windrose: Nothing new to import — all settings already present.', 5000);
            }
          }));
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- lastElementChild was just appended by the new Setting() chain above
      containerEl.prepend(containerEl.lastElementChild!);
    });
  }

  getObjectSettingsForMapType(): ObjectSettingsForMapType {
    const settings = this.plugin.settings;
    if (this.selectedMapType === 'hex') {
      return {
        objectOverrides: settings.hexObjectOverrides ?? {},
        customObjects: settings.customHexObjects ?? [],
        customCategories: settings.customHexCategories ?? []
      };
    } else {
      return {
        objectOverrides: settings.gridObjectOverrides ?? {},
        customObjects: settings.customGridObjects ?? [],
        customCategories: settings.customGridCategories ?? []
      };
    }
  }

  updateObjectSettingsForMapType(updates: ObjectSettingsUpdate): void {
    if (this.selectedMapType === 'hex') {
      if (updates.objectOverrides !== undefined) {
        this.plugin.settings.hexObjectOverrides = updates.objectOverrides;
      }
      if (updates.customObjects !== undefined) {
        this.plugin.settings.customHexObjects = updates.customObjects;
      }
      if (updates.customCategories !== undefined) {
        this.plugin.settings.customHexCategories = updates.customCategories;
      }
    } else {
      if (updates.objectOverrides !== undefined) {
        this.plugin.settings.gridObjectOverrides = updates.objectOverrides;
      }
      if (updates.customObjects !== undefined) {
        this.plugin.settings.customGridObjects = updates.customObjects;
      }
      if (updates.customCategories !== undefined) {
        this.plugin.settings.customGridCategories = updates.customCategories;
      }
    }
  }

  createCollapsibleSection(containerEl: HTMLElement, title: string, renderFn: (el: HTMLElement) => void, options: { open?: boolean } = {}): HTMLDetailsElement {
    const details = containerEl.createEl('details', { cls: 'windrose-settings-section' });
    if (options.open === true) details.setAttribute('open', '');

    this.sections.push({ details, title });

    const summary = details.createEl('summary');
    summary.createEl('span', { text: title });

    const contentEl = details.createEl('div', { cls: 'windrose-settings-section-content' });

    renderFn(contentEl);

    (details as HTMLDetailsElement & { settingItems?: Element[] }).settingItems = Array.from(contentEl.querySelectorAll('.setting-item'));

    return details;
  }

  display(): void {
    const { containerEl } = this;

    const openSections = new Set<string>();
    if (this.sections != null) {
      this.sections.forEach(({ details, title }) => {
        if (details.hasAttribute('open')) {
          openSections.add(title);
        }
      });
    }

    containerEl.empty();

    this.sections = [];

    this.renderSearchBar(containerEl);
    this.renderImportBanner(containerEl);

    this.createCollapsibleSection(containerEl, 'Hex Map Settings',
      (el) => this.renderHexSettingsContent(el),
      { open: openSections.has('Hex Map Settings') });
    this.createCollapsibleSection(containerEl, 'Color Settings',
      (el) => this.renderColorSettingsContent(el),
      { open: openSections.has('Color Settings') });
    this.createCollapsibleSection(containerEl, 'Color Palette',
      (el) => this.renderColorPaletteContent(el),
      { open: openSections.has('Color Palette') });
    this.createCollapsibleSection(containerEl, 'Fog of War',
      (el) => this.renderFogOfWarSettingsContent(el),
      { open: openSections.has('Fog of War') });
    this.createCollapsibleSection(containerEl, 'Map Behavior',
      (el) => this.renderMapBehaviorSettingsContent(el),
      { open: openSections.has('Map Behavior') });
    this.createCollapsibleSection(containerEl, 'Distance Measurement',
      (el) => this.renderDistanceMeasurementSettingsContent(el),
      { open: openSections.has('Distance Measurement') });
    this.createCollapsibleSection(containerEl, 'Tile Sets',
      (el) => this.renderTilesetFoldersContent(el),
      { open: openSections.has('Tile Sets') });
    this.createCollapsibleSection(containerEl, 'Object Types',
      (el) => this.renderObjectTypesContent(el),
      { open: openSections.has('Object Types') });
    this.createCollapsibleSection(containerEl, 'Keyboard Shortcuts',
      (el) => this.renderKeyboardShortcutsContent(el),
      { open: openSections.has('Keyboard Shortcuts') });
  }

  hide(): void {
    if (this.settingsChanged) {
      window.dispatchEvent(new CustomEvent('windrose-settings-changed', {
        detail: { timestamp: Date.now() }
      }));
      this.settingsChanged = false;
    }
  }
}

Object.assign(WindroseMDSettingsTab.prototype, TabRenderCoreMethods);
Object.assign(WindroseMDSettingsTab.prototype, TabRenderSettingsMethods);
Object.assign(WindroseMDSettingsTab.prototype, TabRenderColorsMethods);
Object.assign(WindroseMDSettingsTab.prototype, TabRenderObjectsMethods);
Object.assign(WindroseMDSettingsTab.prototype, TabRenderTilesetsMethods);
Object.assign(WindroseMDSettingsTab.prototype, TabRenderKeyboardShortcutsMethods);

export { WindroseMDSettingsTab };

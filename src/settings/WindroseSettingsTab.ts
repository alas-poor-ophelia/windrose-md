import type { App, Plugin, SettingDefinitionItem } from 'obsidian';
import { Notice, PluginSettingTab, Setting } from 'obsidian';
import type { PluginSettings, WindroseFeature } from '#types/settings/settings.types';
import type { SectionRef, ObjectSettingsForMapType, ObjectSettingsUpdate } from './tabs/settingsTabContext';
import { TabRenderCoreMethods } from './tabs/TabRenderCore';
import { TabRenderSettingsMethods } from './tabs/TabRenderSettings';
import { TabRenderColorsMethods } from './tabs/TabRenderColors';
import { TabRenderObjectsMethods } from './tabs/TabRenderObjects';
import { TabRenderTilesetsMethods } from './tabs/TabRenderTilesets';
import { TabRenderTravelPacksMethods } from './tabs/TabRenderTravelPacks';
import { TabRenderKeyboardShortcutsMethods } from './tabs/TabRenderKeyboardShortcuts';
import { TabRenderFeaturesMethods } from './tabs/TabRenderFeatures';
import { FEATURE_DEFINITIONS, isFeatureEnabled } from '../core/featureFlags';

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
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- mixin methods are Object.assign'd onto the prototype at runtime (see note above); restructuring is deferred to the Settings API migration
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
  renderFeaturesContent(el: HTMLElement): void;
  renderTravelPacksContent(el: HTMLElement): void;
  importTravelPackFile(file: File): Promise<void>;
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
    if (this.plugin.settings.oldImportBannerDismissed === true) return;
    void this.plugin.hasOldPluginData().then(hasOld => {
      if (!hasOld) return;
      // display() may run again (emptying the container) while hasOldPluginData
      // is still in flight; both resolved promises then append, doubling the
      // banner. Remove any banner a prior resolution already placed.
      containerEl.querySelector('.windrose-old-import-banner')?.remove();
      const setting = new Setting(containerEl)
        .setName('Import settings from previous installation')
        .setDesc('Found settings from the previous installation. Import object sets, custom objects, and overrides.')
        .addButton(btn => btn
          .setButtonText('Import')
          .setCta()
          .onClick(async () => {
            const { imported } = await this.plugin.mergeFromOldPlugin();
            if (imported.length > 0) {
              new Notice(`Windrose: Imported ${imported.join(', ')}`, 10000);
              this.plugin.settings.oldImportBannerDismissed = true;
              await this.plugin.saveSettings();
              this.settingsChanged = true;
              this.renderImperativeTab();
            } else {
              new Notice('Windrose: Nothing new to import — all settings already present.', 5000);
            }
          }))
        .addButton(btn => btn
          .setButtonText('Dismiss')
          .onClick(async () => {
            this.plugin.settings.oldImportBannerDismissed = true;
            await this.plugin.saveSettings();
            this.renderImperativeTab();
          }));
      setting.settingEl.addClass('windrose-old-import-banner');
      containerEl.prepend(setting.settingEl);
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
    summary.createSpan({ text: title });

    const contentEl = details.createDiv({ cls: 'windrose-settings-section-content' });

    renderFn(contentEl);

    (details as HTMLDetailsElement & { settingItems?: Element[] }).settingItems = Array.from(contentEl.querySelectorAll('.setting-item'));

    return details;
  }

  // --- Declarative Settings API spike (Obsidian 1.13+) ---
  // Gated behind a localStorage flag so shipped builds keep the imperative
  // display() path until the full migration lands: a non-empty return here
  // makes 1.13+ render ONLY these definitions and skip display() entirely.
  // On app < 1.13 nothing calls this method at all.
  // Enable:  localStorage.setItem('windrose-declarative-settings-spike', '1')

  getSettingDefinitions(): SettingDefinitionItem[] {
    if (window.localStorage.getItem('windrose-declarative-settings-spike') !== '1') return [];
    return [{
      type: 'group',
      heading: 'Features',
      items: FEATURE_DEFINITIONS.map(def => ({
        name: def.label,
        desc: def.desc,
        control: {
          type: 'toggle' as const,
          key: `features.${def.id}`,
          defaultValue: true
        }
      }))
    }];
  }

  getControlValue(key: string): unknown {
    if (key.startsWith('features.')) {
      const id = key.slice('features.'.length) as WindroseFeature;
      return this.plugin.settings.features?.[id] ?? true;
    }
    // Spike only declares features.* keys; nothing else should reach here.
    return undefined;
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    if (!key.startsWith('features.')) return;
    const id = key.slice('features.'.length) as WindroseFeature;
    this.plugin.settings.features = {
      ...this.plugin.settings.features,
      [id]: value === true
    };
    // saveSettings() dispatches windrose-settings-changed itself, so open
    // map views slim down live — same semantics as the imperative path.
    await this.plugin.saveSettings();
  }

  display(): void {
    this.renderImperativeTab();
  }

  // Pre-1.13 imperative render path. Lives under an undeprecated name so
  // internal re-render call sites don't trip the no-deprecated gate;
  // display() above is the framework-facing fallback shell.
  renderImperativeTab(): void {
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

    this.createCollapsibleSection(containerEl, 'Features',
      (el) => this.renderFeaturesContent(el),
      { open: openSections.has('Features') });
    if (isFeatureEnabled('hexMaps')) {
      this.createCollapsibleSection(containerEl, 'Hex Map Settings',
        (el) => this.renderHexSettingsContent(el),
        { open: openSections.has('Hex Map Settings') });
    }
    this.createCollapsibleSection(containerEl, 'Color Settings',
      (el) => this.renderColorSettingsContent(el),
      { open: openSections.has('Color Settings') });
    this.createCollapsibleSection(containerEl, 'Color Palette',
      (el) => this.renderColorPaletteContent(el),
      { open: openSections.has('Color Palette') });
    if (isFeatureEnabled('fogOfWar')) {
      this.createCollapsibleSection(containerEl, 'Fog of War',
        (el) => this.renderFogOfWarSettingsContent(el),
        { open: openSections.has('Fog of War') });
    }
    this.createCollapsibleSection(containerEl, 'Map Behavior',
      (el) => this.renderMapBehaviorSettingsContent(el),
      { open: openSections.has('Map Behavior') });
    if (isFeatureEnabled('measurement')) {
      this.createCollapsibleSection(containerEl, 'Distance Measurement',
        (el) => this.renderDistanceMeasurementSettingsContent(el),
        { open: openSections.has('Distance Measurement') });
      this.createCollapsibleSection(containerEl, 'Travel Packs',
        (el) => this.renderTravelPacksContent(el),
        { open: openSections.has('Travel Packs') });
    }
    if (isFeatureEnabled('tiles')) {
      this.createCollapsibleSection(containerEl, 'Tile Sets',
        (el) => this.renderTilesetFoldersContent(el),
        { open: openSections.has('Tile Sets') });
    }
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
Object.assign(WindroseMDSettingsTab.prototype, TabRenderTravelPacksMethods);
Object.assign(WindroseMDSettingsTab.prototype, TabRenderKeyboardShortcutsMethods);
Object.assign(WindroseMDSettingsTab.prototype, TabRenderFeaturesMethods);

export { WindroseMDSettingsTab };

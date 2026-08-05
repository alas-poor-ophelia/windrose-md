import type { App, Plugin, SettingDefinitionItem } from 'obsidian';
import { PluginSettingTab } from 'obsidian';
import type { PluginSettings } from '#types/settings/settings.types';
import type { ObjectSettingsForMapType, ObjectSettingsUpdate } from './tabs/settingsTabContext';
import { buildSettingDefinitions, getSettingControlValue, setSettingControlValue } from './settingDefinitions';

interface WindrosePlugin extends Plugin {
  settings: PluginSettings;
  saveSettings(): Promise<void>;
  mergeFromOldPlugin(): Promise<{ imported: string[] }>;
  hasOldPluginData(): Promise<boolean>;
}

// Declarative settings tab (Obsidian 1.13+ Settings API). Rendering, search
// indexing, and list mechanics are framework-owned; this class supplies the
// definition arrays (settingDefinitions.ts and friends) and the control
// value plumbing. The pre-1.13 imperative render path (display() + the
// 8-file render-mixin Object.assign structure) was demolished when
// minAppVersion moved to 1.13.0 — see docs/proposals/settings-api-migration.md.
class WindroseMDSettingsTab extends PluginSettingTab {
  plugin: WindrosePlugin;
  settingsChanged: boolean;
  selectedMapType: 'grid' | 'hex';
  cachedHasOldData: boolean;

  constructor(app: App, plugin: WindrosePlugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.settingsChanged = false;
    this.selectedMapType = 'grid';
    // Definitions must stay synchronous, so the old-plugin-data check runs
    // once here; the import banner's visible() reads the cached result.
    this.cachedHasOldData = false;
    void this.plugin.hasOldPluginData().then(hasOld => {
      this.cachedHasOldData = hasOld;
      if (hasOld) {
        this.refreshDomState();
      }
    });
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return buildSettingDefinitions(this);
  }

  getControlValue(key: string): unknown {
    return getSettingControlValue(this, key);
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    await setSettingControlValue(this, key, value);
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

  hide(): void {
    if (this.settingsChanged) {
      window.dispatchEvent(new CustomEvent('windrose-settings-changed', {
        detail: { timestamp: Date.now() }
      }));
      this.settingsChanged = false;
    }
  }
}

export { WindroseMDSettingsTab };

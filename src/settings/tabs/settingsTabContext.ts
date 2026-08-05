import type { App } from 'obsidian';
import type { PluginSettings, ObjectOverride, CustomObject, CustomCategory } from '#types/settings/settings.types';

interface WindrosePlugin {
  app: App;
  settings: PluginSettings;
  saveSettings(): Promise<void>;
  mergeFromOldPlugin(): Promise<{ imported: string[] }>;
  hasOldPluginData(): Promise<boolean>;
}

interface ObjectSettingsForMapType {
  objectOverrides: Record<string, ObjectOverride>;
  customObjects: CustomObject[];
  customCategories: CustomCategory[];
}

interface ObjectSettingsUpdate {
  objectOverrides?: Record<string, ObjectOverride>;
  customObjects?: CustomObject[];
  customCategories?: CustomCategory[];
}

/**
 * Structural surface of WindroseMDSettingsTab consumed by the declarative
 * definition builders (settingDefinitions.ts, settingDefinitionLists.ts,
 * settingDefinitionObjects.ts). update()/refreshDomState() come from the
 * Obsidian 1.13 SettingTab base class.
 */
interface SettingsTabThis {
  app: App;
  containerEl: HTMLElement;
  plugin: WindrosePlugin;
  settingsChanged: boolean;
  selectedMapType: 'grid' | 'hex';
  /** Result of the async hasOldPluginData() check, kicked off at construction
   *  so getSettingDefinitions() stays synchronous and cheap. */
  cachedHasOldData: boolean;
  update(): void;
  refreshDomState(): void;
  getObjectSettingsForMapType(): ObjectSettingsForMapType;
  updateObjectSettingsForMapType(updates: ObjectSettingsUpdate): void;
}

export type { SettingsTabThis, WindrosePlugin, ObjectSettingsForMapType, ObjectSettingsUpdate };

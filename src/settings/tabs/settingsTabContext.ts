import type { App } from 'obsidian';
import type { PluginSettings, ObjectOverride, CustomObject, CustomCategory } from '#types/settings/settings.types';

interface WindrosePlugin {
  settings: PluginSettings;
  saveSettings(): Promise<void>;
}

interface SectionRef {
  details: HTMLDetailsElement & { settingItems?: HTMLElement[] };
  title: string;
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

interface SettingsTabThis {
  // From PluginSettingTab
  app: App;
  containerEl: HTMLElement;

  // From constructor
  plugin: WindrosePlugin;
  settingsChanged: boolean;
  objectFilter: string;
  selectedMapType: 'grid' | 'hex';

  // Dynamic properties
  noResultsEl: HTMLElement;
  sections: SectionRef[];

  // Class methods
  display(): void;
  getObjectSettingsForMapType(): ObjectSettingsForMapType;
  updateObjectSettingsForMapType(updates: ObjectSettingsUpdate): void;
  createCollapsibleSection(containerEl: HTMLElement, title: string, renderFn: (el: HTMLElement) => void, options?: { open?: boolean }): HTMLDetailsElement;

  // Core mixin
  renderSearchBar(containerEl: HTMLElement): void;

  // Settings mixin
  renderHexSettingsContent(el: HTMLElement): void;
  renderColorSettingsContent(el: HTMLElement): void;
  renderFogOfWarSettingsContent(el: HTMLElement): void;
  renderMapBehaviorSettingsContent(el: HTMLElement): void;
  renderDistanceMeasurementSettingsContent(el: HTMLElement): void;

  // Colors mixin
  renderColorPaletteContent(el: HTMLElement): void;
  renderColorList(container: HTMLElement): void;
  renderColorRow(container: HTMLElement, color: Record<string, unknown>, index: number, isCustom: boolean): void;

  // Objects mixin
  renderObjectTypesContent(el: HTMLElement): void;
  renderObjectList(container: HTMLElement): void;
  renderObjectRow(container: HTMLElement, obj: Record<string, unknown>, isCustom: boolean, index?: number): void;
  renderObjectSetsBlock(containerEl: HTMLElement): void;
  setupDragDropForList(listEl: HTMLElement, items: unknown[], onReorder: () => void): void;

  // Tilesets mixin
  renderTilesetFoldersContent(el: HTMLElement): void;

  // Keyboard shortcuts mixin
  renderKeyboardShortcutsContent(el: HTMLElement): void;
}

export type { SettingsTabThis, WindrosePlugin, SectionRef, ObjectSettingsForMapType, ObjectSettingsUpdate };

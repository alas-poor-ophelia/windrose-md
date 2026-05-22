// Type declaration shim for WindroseSettingsTab.js
import type { App, Plugin } from 'obsidian';
import { PluginSettingTab } from 'obsidian';

export class WindroseMDSettingsTab extends PluginSettingTab {
  constructor(app: App, plugin: Plugin);
  display(): void;
}

import type { SettingsTabThis } from './settingsTabContext';
import { Setting } from 'obsidian';
import { FEATURE_DEFINITIONS } from '../../core/featureFlags';

// TabRenderFeatures.ts
// WindroseMDSettingsTab render methods - Features section
//
// One toggle per gateable feature. Saves immediately (not the deferred
// settingsChanged/hide() path) so open map views slim down live while the
// settings tab is still open.

export const TabRenderFeaturesMethods = {
  renderFeaturesContent(this: SettingsTabThis, containerEl: HTMLElement): void {
    containerEl.createEl('p', {
      text: 'Show or hide entire feature groups. Disabling a feature hides its tools and panels — existing map content always stays visible.',
      cls: 'setting-item-description'
    });

    for (const def of FEATURE_DEFINITIONS) {
      new Setting(containerEl)
        .setName(def.label)
        .setDesc(def.desc)
        .addToggle(toggle => toggle
          .setValue(this.plugin.settings.features?.[def.id] ?? true)
          .onChange(async (value: boolean) => {
            this.plugin.settings.features = {
              ...this.plugin.settings.features,
              [def.id]: value
            };
            await this.plugin.saveSettings();
            // Re-render so feature-gated sections (Hex, Fog, Tiles, …)
            // appear/disappear immediately.
            this.display();
          }));
    }
  }
};

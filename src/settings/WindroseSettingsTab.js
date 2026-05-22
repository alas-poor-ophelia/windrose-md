// @ts-nocheck
/* eslint-disable */
/**
 * WindroseSettingsTab.js
 *
 * Extracted from src/settingsplugin/ template system by scripts/extract-settings.mjs
 * This is the global plugin settings tab for Windrose.
 *
 * Architecture: thin class skeleton with mixin binding.
 * Helpers in ./helpers/, modals in ./modals/, tab renders in ./tabs/.
 */

import { PluginSettingTab } from 'obsidian';
import { TabRenderCoreMethods } from './tabs/TabRenderCore';
import { TabRenderSettingsMethods } from './tabs/TabRenderSettings';
import { TabRenderColorsMethods } from './tabs/TabRenderColors';
import { TabRenderObjectsMethods } from './tabs/TabRenderObjects';
import { TabRenderTilesetsMethods } from './tabs/TabRenderTilesets';
import { TabRenderKeyboardShortcutsMethods } from './tabs/TabRenderKeyboardShortcuts';

// =============================================================================
// SETTINGS TAB CLASS
// =============================================================================

class WindroseMDSettingsTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.settingsChanged = false;
    this.objectFilter = '';
    this.selectedMapType = 'grid'; // 'grid' or 'hex' for object editing
  }
  
  // ---------------------------------------------------------------------------
  // Helper: Get object settings for the selected map type
  // Returns a normalized object { objectOverrides, customObjects, customCategories }
  // ---------------------------------------------------------------------------
  
  getObjectSettingsForMapType() {
    const settings = this.plugin.settings;
    if (this.selectedMapType === 'hex') {
      return {
        objectOverrides: settings.hexObjectOverrides || {},
        customObjects: settings.customHexObjects || [],
        customCategories: settings.customHexCategories || []
      };
    } else {
      return {
        objectOverrides: settings.gridObjectOverrides || {},
        customObjects: settings.customGridObjects || [],
        customCategories: settings.customGridCategories || []
      };
    }
  }
  
  // ---------------------------------------------------------------------------
  // Helper: Update object settings for the selected map type
  // ---------------------------------------------------------------------------
  
  updateObjectSettingsForMapType(updates) {
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

  // ---------------------------------------------------------------------------
  // Helper: Create collapsible section with details/summary
  // ---------------------------------------------------------------------------
  
  createCollapsibleSection(containerEl, title, renderFn, options = {}) {
    const details = containerEl.createEl('details', { cls: 'dmt-settings-section' });
    if (options.open) details.setAttribute('open', '');
    
    // Store section reference for search filtering
    if (!this.sections) this.sections = [];
    this.sections.push({ details, title });
    
    const summary = details.createEl('summary');
    summary.createEl('span', { text: title });
    
    const contentEl = details.createEl('div', { cls: 'dmt-settings-section-content' });
    
    // Track settings within this section for search
    const settingItems = [];
    const originalCreateEl = contentEl.createEl.bind(contentEl);
    
    // Render the section content
    renderFn(contentEl);
    
    // Collect all setting-item elements for search filtering
    details.settingItems = Array.from(contentEl.querySelectorAll('.setting-item'));
    
    return details;
  }
  
  // ---------------------------------------------------------------------------
  // Helper: Render search bar
  // ---------------------------------------------------------------------------
  

  // ---------------------------------------------------------------------------
  // Main display method - orchestrates section rendering
  // ---------------------------------------------------------------------------

  display() {
    const { containerEl } = this;
    
    // Preserve which sections are currently open before rebuilding
    const openSections = new Set();
    if (this.sections) {
      this.sections.forEach(({ details, title }) => {
        if (details.hasAttribute('open')) {
          openSections.add(title);
        }
      });
    }
    
    containerEl.empty();
    
    // Reset section tracking for search
    this.sections = [];
    
    this.renderSearchBar(containerEl);
    
    // Render collapsible sections (restore open state if previously open)
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

  
  hide() {
    // Only dispatch event if settings were actually changed
    if (this.settingsChanged) {
      window.dispatchEvent(new CustomEvent('dmt-settings-changed', {
        detail: { timestamp: Date.now() }
      }));
      this.settingsChanged = false;
    }
    
  }
}

// =============================================================================
// MIXIN BINDING
// =============================================================================

Object.assign(WindroseMDSettingsTab.prototype, TabRenderCoreMethods);
Object.assign(WindroseMDSettingsTab.prototype, TabRenderSettingsMethods);
Object.assign(WindroseMDSettingsTab.prototype, TabRenderColorsMethods);
Object.assign(WindroseMDSettingsTab.prototype, TabRenderObjectsMethods);
Object.assign(WindroseMDSettingsTab.prototype, TabRenderTilesetsMethods);
Object.assign(WindroseMDSettingsTab.prototype, TabRenderKeyboardShortcutsMethods);

// =============================================================================
// EXPORT
// =============================================================================

export { WindroseMDSettingsTab };

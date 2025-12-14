// settingsPluginMain.js - Template for Windrose MapDesigner Settings Plugin
// Returns the plugin source as a string for templating by SettingsPluginInstaller
// This wrapper allows the file to be dc.require()'d without Datacore trying to execute it as an Obsidian plugin

return `// settingsPluginMain.js - Windrose MapDesigner Settings Plugin
// This file is generated from a template by SettingsPluginInstaller
// Default values are injected at install time from dmtConstants and objectTypes

/**
 * ============================================================================
 * TABLE OF CONTENTS
 * ============================================================================
 * 
 * Line ~30:    VERSION & IMPORTS
 * Line ~40:    DATA CONSTANTS (BUILT_IN_OBJECTS, CATEGORIES, QUICK_SYMBOLS)
 * Line ~65:    BUILT_IN_COLORS (color palette defaults)
 * Line ~90:    HELPER NAMESPACES (ObjectHelpers, ColorHelpers, DragHelpers, IconHelpers, RPGAwesomeHelpers)
 * Line ~365:   STYLES (DMT_SETTINGS_STYLES)
 * Line ~1140:  MODAL CLASSES (ObjectEditModal, CategoryEditModal, ColorEditModal, ExportModal, ImportModal)
 * Line ~2120:  MAIN PLUGIN CLASS (WindroseMDSettingsPlugin)
 * Line ~2200:  SETTINGS TAB CLASS (WindroseMDSettingsTab)
 * 
 * ============================================================================
 */

// =============================================================================
// VERSION & IMPORTS
// =============================================================================

const PLUGIN_VERSION = '{{PLUGIN_VERSION}}';

const { Plugin, PluginSettingTab, Setting, Modal, setIcon } = require('obsidian');

// =============================================================================
// DATA CONSTANTS
// Injected from objectTypes.js at install time - single source of truth
// =============================================================================

const BUILT_IN_OBJECTS = {{BUILT_IN_OBJECTS}};

const BUILT_IN_CATEGORIES = {{BUILT_IN_CATEGORIES}};

const CATEGORY_ORDER = {{CATEGORY_ORDER}};

// RPGAwesome icon data - injected from rpgAwesomeIcons.js at install time
const RA_ICONS = {{RA_ICONS}};

const RA_CATEGORIES = {{RA_CATEGORIES}};

// Quick symbols palette for object creation
const QUICK_SYMBOLS = [
  '★', '☆', '✦', '✧', '✪', '✫', '✯', '⚑',
  '●', '○', '◆', '◇', '■', '□', '▲', '△', '▼', '▽',
  '♠', '♤', '♣', '♧', '♥', '♡', '♦', '♢',
  '⚔', '⚒', '🗡', '🧹', '⚔', '⛏', '📱',
  '☠', '⚠', '☢', '☣', '⚡', '🔥', '💧',
  '⚑', '⚒', '⛳', '🚩', '➤', '➜', '⬤',
  '⚙', '⚗', '🔮', '💎', '🗝', '📜', '🎭', '👑',
  '🛡', '🏰', '⛪', '🗿', '⚱', '🏺', '🪔'
];

// =============================================================================
// BUILT-IN COLOR PALETTE
// Default colors for drawing and objects
// =============================================================================

const BUILT_IN_COLORS = [
  { id: 'default', color: '#c4a57b', label: 'Default (Tan)' },
  { id: 'stone', color: '#808080', label: 'Stone Gray' },
  { id: 'dark-stone', color: '#505050', label: 'Dark Gray' },
  { id: 'water', color: '#4a9eff', label: 'Water Blue' },
  { id: 'forest', color: '#4ade80', label: 'Forest Green' },
  { id: 'danger', color: '#ef4444', label: 'Danger Red' },
  { id: 'sand', color: '#fbbf24', label: 'Sand Yellow' },
  { id: 'magic', color: '#a855f7', label: 'Magic Purple' },
  { id: 'fire', color: '#fb923c', label: 'Fire Orange' },
  { id: 'ice', color: '#14b8a6', label: 'Ice Teal' }
];

// =============================================================================
// HELPER NAMESPACES
// Pure functions for data transformation - no side effects, easy to test/debug
// =============================================================================


/**
 * Object resolution helpers
 * Transform raw settings into resolved object/category lists
 */
const ObjectHelpers = {
  /**
   * Get all resolved object types (built-in + custom, with overrides applied)
   * @param {Object} settings - Plugin settings
   * @returns {Array} Resolved object array with isBuiltIn, isModified flags
   */
  getResolved(settings) {
    const { objectOverrides = {}, customObjects = [] } = settings;
    
    const resolvedBuiltIns = BUILT_IN_OBJECTS
      .filter(obj => !objectOverrides[obj.id]?.hidden)
      .map((obj, index) => {
        const override = objectOverrides[obj.id];
        const defaultOrder = index * 10;
        if (override) {
          const { hidden, ...overrideProps } = override;
          return { 
            ...obj, 
            ...overrideProps, 
            order: override.order ?? defaultOrder, 
            isBuiltIn: true, 
            isModified: true 
          };
        }
        return { ...obj, order: defaultOrder, isBuiltIn: true, isModified: false };
      });
    
    const resolvedCustom = customObjects.map((obj, index) => ({
      ...obj,
      order: obj.order ?? (1000 + index * 10),
      isCustom: true,
      isBuiltIn: false
    }));
    
    return [...resolvedBuiltIns, ...resolvedCustom];
  },
  
  /**
   * Get all resolved categories (built-in + custom, sorted by order)
   * @param {Object} settings - Plugin settings
   * @returns {Array} Sorted category array with isBuiltIn flag
   */
  getCategories(settings) {
    const { customCategories = [] } = settings;
    
    const resolvedBuiltIns = BUILT_IN_CATEGORIES.map(c => ({
      ...c,
      isBuiltIn: true,
      order: CATEGORY_ORDER[c.id] ?? 50
    }));
    
    const resolvedCustom = customCategories.map(c => ({
      ...c,
      isCustom: true,
      isBuiltIn: false,
      order: c.order ?? 100
    }));
    
    return [...resolvedBuiltIns, ...resolvedCustom].sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
  },
  
  /**
   * Get hidden built-in objects
   * @param {Object} settings - Plugin settings
   * @returns {Array} Hidden objects with isBuiltIn, isHidden flags
   */
  getHidden(settings) {
    const { objectOverrides = {} } = settings;
    return BUILT_IN_OBJECTS
      .filter(obj => objectOverrides[obj.id]?.hidden)
      .map(obj => ({ ...obj, isBuiltIn: true, isHidden: true }));
  },
  
  /**
   * Get all categories including notes (for dropdowns)
   * @param {Object} settings - Plugin settings
   * @returns {Array} All categories
   */
  getAllCategories(settings) {
    const { customCategories = [] } = settings;
    const builtIn = BUILT_IN_CATEGORIES.map(c => ({ ...c, isBuiltIn: true }));
    const custom = customCategories.map(c => ({ ...c, isCustom: true }));
    return [...builtIn, ...custom];
  },
  
  /**
   * Get default ID order for a category (for drag/drop comparison)
   * @param {string} categoryId - Category ID
   * @param {Object} settings - Plugin settings
   * @returns {Array} Array of object IDs in default order
   */
  getDefaultIdOrder(categoryId, settings) {
    const { objectOverrides = {} } = settings;
    return BUILT_IN_OBJECTS
      .filter(o => o.category === categoryId && !objectOverrides[o.id]?.hidden)
      .map(o => o.id);
  }
};

/**
 * Color palette resolution helpers
 * Transform raw settings into resolved color list
 */
const ColorHelpers = {
  /**
   * Get all resolved colors (built-in + custom, with overrides applied)
   * @param {Object} settings - Plugin settings
   * @returns {Array} Resolved color array with isBuiltIn, isModified flags
   */
  getResolved(settings) {
    const { colorPaletteOverrides = {}, customPaletteColors = [] } = settings;
    
    const resolvedBuiltIns = BUILT_IN_COLORS
      .filter(c => !colorPaletteOverrides[c.id]?.hidden)
      .map((c, index) => {
        const override = colorPaletteOverrides[c.id];
        if (override) {
          const { hidden, ...overrideProps } = override;
          return { 
            ...c, 
            ...overrideProps, 
            order: override.order ?? index,
            isBuiltIn: true, 
            isModified: true 
          };
        }
        return { ...c, order: index, isBuiltIn: true, isModified: false };
      });
    
    const resolvedCustom = customPaletteColors.map((c, index) => ({
      ...c,
      order: c.order ?? (100 + index),
      isCustom: true,
      isBuiltIn: false
    }));
    
    return [...resolvedBuiltIns, ...resolvedCustom].sort((a, b) => a.order - b.order);
  },
  
  /**
   * Get hidden color IDs
   * @param {Object} settings - Plugin settings
   * @returns {Set} Set of hidden color IDs
   */
  getHidden(settings) {
    const { colorPaletteOverrides = {} } = settings;
    return new Set(
      Object.entries(colorPaletteOverrides)
        .filter(([id, override]) => override.hidden)
        .map(([id]) => id)
    );
  }
};

/**
 * Drag and drop helpers
 */
const DragHelpers = {
  /**
   * Find element to insert before during drag operation
   * @param {HTMLElement} container - Container element
   * @param {number} y - Mouse Y position
   * @returns {HTMLElement|undefined} Element to insert before
   */
  getAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.dmt-settings-object-row:not(.dmt-dragging)')];
    
    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }
};

/**
 * Icon helpers
 */
const IconHelpers = {
  /**
   * Set icon on element with fallback
   * @param {HTMLElement} el - Target element
   * @param {string} iconId - Lucide icon ID
   */
  set(el, iconId) {
    if (typeof setIcon !== 'undefined') {
      setIcon(el, iconId);
    } else {
      // Fallback: create a simple text representation
      const icons = {
        'pencil': '✎',
        'eye': '👁',
        'eye-off': '🚫',
        'rotate-ccw': '↺',
        'trash-2': '🗑',
        'grip-vertical': '⋮⋮',
        'x': '✕',
        'search': '🔍'
      };
      el.textContent = icons[iconId] || '?';
    }
  }
};

/**
 * RPGAwesome icon helpers
 */
const RPGAwesomeHelpers = {
  /**
   * Get icons filtered by category
   * @param {string} categoryId - Category ID or 'all'
   * @returns {Array} Array of { iconClass, char, label, category }
   */
  getByCategory(categoryId) {
    const icons = Object.entries(RA_ICONS).map(([iconClass, data]) => ({
      iconClass,
      ...data
    }));
    
    if (categoryId === 'all') return icons;
    return icons.filter(i => i.category === categoryId);
  },
  
  /**
   * Search icons by label
   * @param {string} query - Search query
   * @returns {Array} Matching icons
   */
  search(query) {
    const q = query.toLowerCase().trim();
    if (!q) return this.getByCategory('all');
    
    return Object.entries(RA_ICONS)
      .filter(([iconClass, data]) => 
        iconClass.toLowerCase().includes(q) || 
        data.label.toLowerCase().includes(q)
      )
      .map(([iconClass, data]) => ({ iconClass, ...data }));
  },
  
  /**
   * Get sorted categories for tab display
   * @returns {Array} Array of { id, label, order }
   */
  getCategories() {
    return [...RA_CATEGORIES].sort((a, b) => a.order - b.order);
  },
  
  /**
   * Validate an icon class exists
   * @param {string} iconClass - Icon class to validate
   * @returns {boolean}
   */
  isValid(iconClass) {
    return iconClass && RA_ICONS.hasOwnProperty(iconClass);
  },
  
  /**
   * Get icon info
   * @param {string} iconClass - Icon class
   * @returns {Object|null} Icon data or null
   */
  getInfo(iconClass) {
    return RA_ICONS[iconClass] || null;
  }
};

// =============================================================================
// STYLES
// All CSS for the settings UI - injected into document.head when tab is shown
// =============================================================================

const DMT_SETTINGS_STYLES = \`
  /* Subheadings */
  .dmt-settings-subheading {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-muted);
    margin: 1.5em 0 0.5em 0;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--background-modifier-border);
  }
  
  /* Search/Filter */
  .dmt-settings-search-container {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 1em;
  }
  
  .dmt-settings-search-input {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background: var(--background-primary);
    font-size: 14px;
  }
  
  .dmt-settings-search-input:focus {
    border-color: var(--interactive-accent);
    outline: none;
  }
  
  .dmt-settings-search-clear {
    background: transparent;
    border: none;
    padding: 6px;
    border-radius: 4px;
    cursor: pointer;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .dmt-settings-search-clear:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }
  
  .dmt-settings-no-results {
    text-align: center;
    padding: 2em;
    color: var(--text-muted);
    font-style: italic;
  }
  
  /* Category containers */
  .dmt-settings-category {
    margin: 1em 0;
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    overflow: hidden;
  }
  
  .dmt-settings-category-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: var(--background-secondary);
    border-bottom: 1px solid var(--background-modifier-border);
  }
  
  .dmt-settings-category-label {
    font-weight: 600;
    font-size: 0.95em;
  }
  
  .dmt-settings-category-actions {
    display: flex;
    gap: 4px;
  }
  
  /* Object rows */
  .dmt-settings-object-list {
    padding: 4px 0;
  }
  
  .dmt-settings-object-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    transition: background-color 0.15s ease;
  }
  
  .dmt-settings-object-row:hover {
    background: var(--background-modifier-hover);
  }
  
  .dmt-drag-handle {
    color: var(--text-muted);
    cursor: grab;
    padding: 0 4px;
    font-size: 1em;
    opacity: 0.4;
    user-select: none;
    flex-shrink: 0;
  }
  
  .dmt-settings-object-row:hover .dmt-drag-handle {
    opacity: 1;
  }
  
  .dmt-dragging {
    opacity: 0.5;
    background: var(--interactive-accent) !important;
    border-radius: 4px;
  }
  
  .dmt-settings-object-symbol {
    font-family: 'Noto Emoji', 'Noto Sans Symbols 2', sans-serif;
    font-size: 1.4em;
    width: 32px;
    text-align: center;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .dmt-settings-object-symbol .ra {
    font-size: 1.2em;
    line-height: 1;
  }
  
  .dmt-settings-object-label {
    flex: 1;
    min-width: 0;
  }
  
  .dmt-settings-object-label.dmt-settings-modified {
    font-style: italic;
    color: var(--text-accent);
  }
  
  .dmt-settings-object-label.dmt-settings-modified::after {
    content: ' (modified)';
    font-size: 0.8em;
    opacity: 0.7;
  }
  
  .dmt-settings-object-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }
  
  .dmt-settings-icon-btn {
    background: transparent;
    border: none;
    padding: 4px 6px;
    border-radius: 4px;
    cursor: pointer;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .dmt-settings-icon-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }
  
  .dmt-settings-icon-btn-danger:hover {
    color: var(--text-error);
  }
  
  /* Hidden section */
  .dmt-settings-hidden-section {
    margin-top: 2em;
    padding-top: 1em;
    border-top: 1px solid var(--background-modifier-border);
  }
  
  .dmt-settings-hidden-list {
    margin-top: 8px;
    opacity: 0.7;
  }
  
  .dmt-settings-hidden-list .dmt-settings-object-row {
    background: var(--background-secondary);
  }
  
  /* Modal Styles */
  .dmt-object-edit-modal,
  .dmt-category-edit-modal {
    padding: 0;
  }
  
  .dmt-symbol-input {
    font-family: 'Noto Emoji', 'Noto Sans Symbols 2', sans-serif;
    font-size: 1.5em;
    width: 80px;
    text-align: center;
    padding: 8px;
  }
  
  .dmt-symbol-preview {
    font-family: 'Noto Emoji', 'Noto Sans Symbols 2', sans-serif;
    font-size: 2em;
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--background-secondary);
    border-radius: 8px;
    margin-left: 8px;
  }
  
  .dmt-quick-symbols {
    margin: 1em 0;
  }
  
  .dmt-quick-symbols-label {
    display: block;
    font-size: 0.9em;
    color: var(--text-muted);
    margin-bottom: 8px;
  }
  
  .dmt-quick-symbols-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    max-height: 150px;
    overflow-y: auto;
    padding: 4px;
    background: var(--background-secondary);
    border-radius: 8px;
  }
  
  .dmt-quick-symbol-btn {
    font-family: 'Noto Emoji', 'Noto Sans Symbols 2', sans-serif;
    width: 32px;
    height: 32px;
    font-size: 1.2em;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .dmt-quick-symbol-btn:hover {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
  }
  
  .dmt-modal-buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 1.5em;
    padding-top: 1em;
    border-top: 1px solid var(--background-modifier-border);
  }
  
  /* Import/Export Modal Styles */
  .dmt-export-modal,
  .dmt-import-modal {
    padding: 0;
  }
  
  .dmt-export-empty {
    text-align: center;
    padding: 1em;
    color: var(--text-muted);
    font-style: italic;
  }
  
  .dmt-import-file-container {
    margin: 1em 0;
  }
  
  .dmt-import-file-container input[type="file"] {
    width: 100%;
    padding: 1em;
    border: 2px dashed var(--background-modifier-border);
    border-radius: 8px;
    background: var(--background-secondary);
    cursor: pointer;
  }
  
  .dmt-import-file-container input[type="file"]:hover {
    border-color: var(--interactive-accent);
  }
  
  .dmt-import-preview {
    margin: 1em 0;
    padding: 1em;
    background: var(--background-secondary);
    border-radius: 8px;
  }
  
  .dmt-import-preview p {
    margin: 0.25em 0;
  }
  
  .dmt-import-date {
    font-size: 0.85em;
    color: var(--text-muted);
  }
  
  .dmt-import-error {
    color: var(--text-error);
    font-weight: 500;
  }
  
  .dmt-import-options {
    margin-top: 1em;
  }
  
  /* Icon Type Toggle */
  .dmt-icon-type-toggle {
    display: flex;
    gap: 8px;
    margin-bottom: 1em;
  }
  
  .dmt-icon-type-btn {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.15s ease;
  }
  
  .dmt-icon-type-btn:hover {
    background: var(--background-modifier-hover);
  }
  
  .dmt-icon-type-btn.active {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border-color: var(--interactive-accent);
  }
  
  /* Icon Picker Container */
  .dmt-icon-picker {
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    background: var(--background-secondary);
    margin-bottom: 1em;
  }
  
  .dmt-icon-picker-search {
    padding: 8px;
    border-bottom: 1px solid var(--background-modifier-border);
  }
  
  .dmt-icon-picker-search input {
    width: 100%;
    padding: 6px 10px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background: var(--background-primary);
    font-size: 14px;
  }
  
  .dmt-icon-picker-search input:focus {
    border-color: var(--interactive-accent);
    outline: none;
  }
  
  /* Category Tabs */
  .dmt-icon-picker-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 8px;
    border-bottom: 1px solid var(--background-modifier-border);
    background: var(--background-primary-alt);
  }
  
  .dmt-icon-picker-tab {
    padding: 4px 8px;
    border: 1px solid transparent;
    background: transparent;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    color: var(--text-muted);
    transition: all 0.15s ease;
  }
  
  .dmt-icon-picker-tab:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }
  
  .dmt-icon-picker-tab.active {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
  }
  
  /* Icon Grid */
  .dmt-icon-picker-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
    gap: 4px;
    padding: 8px;
    max-height: 200px;
    overflow-y: auto;
  }
  
  .dmt-icon-picker-icon {
    width: 40px;
    height: 40px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    transition: all 0.15s ease;
  }
  
  .dmt-icon-picker-icon:hover {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
    transform: scale(1.1);
  }
  
  .dmt-icon-picker-icon.selected {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border-color: var(--interactive-accent);
  }
  
  .dmt-icon-picker-icon .ra {
    font-size: 20px;
    line-height: 1;
  }
  
  .dmt-icon-picker-empty {
    padding: 2em;
    text-align: center;
    color: var(--text-muted);
    font-style: italic;
  }
  
  /* Selected Icon Preview */
  .dmt-icon-preview-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px;
    border-top: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
  }
  
  .dmt-icon-preview-large {
    width: 48px;
    height: 48px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
    background: var(--background-secondary);
  }
  
  .dmt-icon-preview-large .ra {
    font-size: 28px;
    line-height: 1;
  }
  
  .dmt-icon-preview-info {
    flex: 1;
  }
  
  .dmt-icon-preview-label {
    font-weight: 500;
    margin-bottom: 2px;
  }
  
  .dmt-icon-preview-class {
    font-size: 12px;
    color: var(--text-muted);
    font-family: var(--font-monospace);
  }
  
  /* RPGAwesome icon font - must be bundled in DungeonMapTracker - FONTS.css */
  /* Font-family name must be exactly 'rpgawesome' */
  .ra {
    font-family: 'rpgawesome' !important;
    font-style: normal;
    font-variant: normal;
    font-weight: normal;
    line-height: 1;
    speak: never;
    text-transform: none;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  /* ===========================================
   * Collapsible Sections
   * =========================================== */
  .dmt-settings-section {
    margin: 0 0 8px 0;
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    overflow: hidden;
  }
  
  .dmt-settings-section > summary {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    background: var(--background-secondary);
    cursor: pointer;
    font-weight: 600;
    font-size: 15px;
    list-style: none;
    user-select: none;
  }
  
  .dmt-settings-section > summary::-webkit-details-marker {
    display: none;
  }
  
  .dmt-settings-section > summary::before {
    content: 'â–¶';
    font-size: 10px;
    transition: transform 0.2s ease;
    color: var(--text-muted);
  }
  
  .dmt-settings-section[open] > summary::before {
    transform: rotate(90deg);
  }
  
  .dmt-settings-section > summary:hover {
    background: var(--background-modifier-hover);
  }
  
  .dmt-settings-section-content {
    padding: 12px 16px;
    border-top: 1px solid var(--background-modifier-border);
  }
  
  .dmt-settings-section-content > .setting-item:first-child {
    border-top: none;
    padding-top: 0;
  }
  
  /* ===========================================
   * Settings Search
   * =========================================== */
  .dmt-settings-search-wrapper {
    margin-bottom: 16px;
    position: sticky;
    top: 0;
    background: var(--background-primary);
    padding: 8px 0;
    z-index: 10;
  }
  
  .dmt-settings-search-box {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    background: var(--background-primary);
  }
  
  .dmt-settings-search-box:focus-within {
    border-color: var(--interactive-accent);
  }
  
  .dmt-settings-search-box input {
    flex: 1;
    border: none;
    background: transparent;
    font-size: 14px;
    outline: none;
  }
  
  .dmt-settings-search-box .search-icon {
    color: var(--text-muted);
  }
  
  .dmt-settings-search-box .clear-btn {
    background: transparent;
    border: none;
    padding: 2px 6px;
    cursor: pointer;
    color: var(--text-muted);
    border-radius: 4px;
  }
  
  .dmt-settings-search-box .clear-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }
  
  .dmt-settings-no-results {
    text-align: center;
    padding: 2em;
    color: var(--text-muted);
    font-style: italic;
  }
  
  /* Hide non-matching settings during search */
  .dmt-setting-hidden {
    display: none !important;
  }
  
  /* Highlight matching text */
  .dmt-search-match {
    background: var(--text-highlight-bg);
    border-radius: 2px;
  }
  
  /* ===========================================
   * Color Palette Section
   * =========================================== */
  .dmt-color-list {
    padding: 8px 0;
  }
  
  .dmt-color-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    transition: background-color 0.15s ease;
  }
  
  .dmt-color-row:hover {
    background: var(--background-modifier-hover);
  }
  
  .dmt-color-row-swatch {
    width: 28px;
    height: 28px;
    border-radius: 4px;
    border: 2px solid var(--background-modifier-border);
    flex-shrink: 0;
  }
  
  .dmt-color-row-label {
    flex: 1;
    min-width: 0;
  }
  
  .dmt-color-row-name {
    font-weight: 500;
  }
  
  .dmt-color-row-modified,
  .dmt-color-row-custom {
    font-size: 0.85em;
    color: var(--text-muted);
    font-style: italic;
  }
  
  .dmt-color-row-hex {
    font-size: 0.85em;
    color: var(--text-muted);
    background: var(--background-secondary);
    padding: 2px 6px;
    border-radius: 3px;
  }
  
  .dmt-color-row-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }
  
  .dmt-settings-category-muted {
    opacity: 0.7;
  }
  
  .dmt-settings-empty-message {
    padding: 16px;
    text-align: center;
    color: var(--text-muted);
    font-style: italic;
  }
  
  /* Color Edit Modal */
  .dmt-color-edit-modal {
    padding: 16px;
  }
  
  .dmt-color-hex-input {
    font-family: var(--font-monospace);
    width: 90px !important;
  }
  
  .dmt-color-original-info {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    margin: 12px 0;
    background: var(--background-secondary);
    border-radius: 4px;
    font-size: 0.9em;
    color: var(--text-muted);
  }
  
  .dmt-color-mini-swatch {
    display: inline-block;
    width: 16px;
    height: 16px;
    border-radius: 3px;
    border: 1px solid var(--background-modifier-border);
    vertical-align: middle;
  }
  
  .dmt-modal-buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--background-modifier-border);
  }
  
  .dmt-btn-icon {
    background: transparent;
    border: none;
    padding: 4px;
    border-radius: 4px;
    cursor: pointer;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .dmt-btn-icon:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }
  
  .dmt-btn-icon.dmt-btn-danger:hover {
    background: var(--background-modifier-error);
    color: var(--text-on-accent);
  }
\`;

// =============================================================================
// MODAL CLASSES
// Each modal is self-contained with its own state and rendering logic
// =============================================================================

/**
 * Modal for creating/editing objects
 */
class ObjectEditModal extends Modal {
  constructor(app, plugin, existingObject, onSave, mapType = 'grid') {
    super(app);
    this.plugin = plugin;
    this.existingObject = existingObject;
    this.onSave = onSave;
    this.mapType = mapType;
    
    // Form state
    this.symbol = existingObject?.symbol || '';
    this.iconClass = existingObject?.iconClass || '';
    this.label = existingObject?.label || '';
    this.category = existingObject?.category || 'features';
    
    // UI state - determine initial mode based on existing object
    this.useIcon = !!existingObject?.iconClass;
    this.iconSearchQuery = '';
    this.iconCategory = 'all';
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dmt-object-edit-modal');
    
    const isEditing = !!this.existingObject;
    
    contentEl.createEl('h2', { text: isEditing ? 'Edit Object' : 'Create Custom Object' });
    
    // Icon type toggle
    const toggleContainer = contentEl.createDiv({ cls: 'dmt-icon-type-toggle' });
    
    const unicodeBtn = toggleContainer.createEl('button', { 
      text: 'Unicode Symbol',
      cls: 'dmt-icon-type-btn' + (this.useIcon ? '' : ' active'),
      attr: { type: 'button' }
    });
    
    const iconBtn = toggleContainer.createEl('button', { 
      text: 'RPGAwesome Icon',
      cls: 'dmt-icon-type-btn' + (this.useIcon ? ' active' : ''),
      attr: { type: 'button' }
    });
    
    // Container for symbol input (shown when useIcon is false)
    this.symbolContainer = contentEl.createDiv({ cls: 'dmt-symbol-container' });
    
    // Container for icon picker (shown when useIcon is true)
    this.iconPickerContainer = contentEl.createDiv({ cls: 'dmt-icon-picker-container' });
    
    // Toggle handlers
    unicodeBtn.onclick = () => {
      if (!this.useIcon) return;
      this.useIcon = false;
      unicodeBtn.addClass('active');
      iconBtn.removeClass('active');
      this.renderSymbolInput();
      this.renderIconPicker();
    };
    
    iconBtn.onclick = () => {
      if (this.useIcon) return;
      this.useIcon = true;
      iconBtn.addClass('active');
      unicodeBtn.removeClass('active');
      this.renderSymbolInput();
      this.renderIconPicker();
    };
    
    // Initial render of symbol/icon sections
    this.renderSymbolInput();
    this.renderIconPicker();
    
    // Label input
    new Setting(contentEl)
      .setName('Label')
      .setDesc('Display name for this object')
      .addText(text => text
        .setValue(this.label)
        .setPlaceholder('e.g., Treasure Chest')
        .onChange(value => {
          this.label = value;
        }));
    
    // Category dropdown
    const allCategories = ObjectHelpers.getAllCategories(this.plugin.settings);
    new Setting(contentEl)
      .setName('Category')
      .setDesc('Group this object belongs to')
      .addDropdown(dropdown => {
        for (const cat of allCategories) {
          dropdown.addOption(cat.id, cat.label);
        }
        dropdown.setValue(this.category);
        dropdown.onChange(value => {
          this.category = value;
        });
      });
    
    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: 'dmt-modal-buttons' });
    
    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => this.close();
    
    const saveBtn = buttonContainer.createEl('button', { text: 'Save', cls: 'mod-cta' });
    saveBtn.onclick = () => this.save();
  }
  
  renderSymbolInput() {
    const container = this.symbolContainer;
    container.empty();
    
    if (this.useIcon) {
      container.style.display = 'none';
      return;
    }
    container.style.display = 'block';
    
    // Symbol input with preview
    const symbolSetting = new Setting(container)
      .setName('Symbol')
      .setDesc('Paste any Unicode character or emoji');
    
    const symbolInput = symbolSetting.controlEl.createEl('input', {
      type: 'text',
      cls: 'dmt-symbol-input',
      value: this.symbol,
      attr: { placeholder: 'Paste symbol...' }
    });
    symbolInput.addEventListener('input', (e) => {
      this.symbol = e.target.value.trim();
      this.updateSymbolPreview();
    });
    
    // Focus the symbol input after a short delay
    setTimeout(() => symbolInput.focus(), 50);
    
    // Symbol preview
    const previewEl = symbolSetting.controlEl.createDiv({ cls: 'dmt-symbol-preview' });
    previewEl.textContent = this.symbol || '?';
    this.symbolPreviewEl = previewEl;
    this.symbolInputEl = symbolInput;
    
    // Quick symbols
    const quickSymbolsContainer = container.createDiv({ cls: 'dmt-quick-symbols' });
    quickSymbolsContainer.createEl('label', { text: 'Quick Symbols', cls: 'dmt-quick-symbols-label' });
    const symbolGrid = quickSymbolsContainer.createDiv({ cls: 'dmt-quick-symbols-grid' });
    
    for (const sym of QUICK_SYMBOLS) {
      const symBtn = symbolGrid.createEl('button', { 
        text: sym, 
        cls: 'dmt-quick-symbol-btn',
        attr: { type: 'button' }
      });
      symBtn.onclick = () => {
        this.symbol = sym;
        symbolInput.value = sym;
        this.updateSymbolPreview();
      };
    }
  }
  
  renderIconPicker() {
    const container = this.iconPickerContainer;
    container.empty();
    
    if (!this.useIcon) {
      container.style.display = 'none';
      return;
    }
    container.style.display = 'block';
    
    const picker = container.createDiv({ cls: 'dmt-icon-picker' });
    
    // Search input
    const searchContainer = picker.createDiv({ cls: 'dmt-icon-picker-search' });
    const searchInput = searchContainer.createEl('input', {
      type: 'text',
      value: this.iconSearchQuery,
      attr: { placeholder: 'Search icons...' }
    });
    searchInput.addEventListener('input', (e) => {
      this.iconSearchQuery = e.target.value;
      this.renderIconGrid();
    });
    
    // Category tabs
    const tabsContainer = picker.createDiv({ cls: 'dmt-icon-picker-tabs' });
    
    // "All" tab
    const allTab = tabsContainer.createEl('button', {
      text: 'All',
      cls: 'dmt-icon-picker-tab' + (this.iconCategory === 'all' ? ' active' : ''),
      attr: { type: 'button' }
    });
    allTab.onclick = () => {
      this.iconCategory = 'all';
      this.renderIconTabs(tabsContainer);
      this.renderIconGrid();
    };
    
    // Category tabs
    const categories = RPGAwesomeHelpers.getCategories();
    for (const cat of categories) {
      const tab = tabsContainer.createEl('button', {
        text: cat.label,
        cls: 'dmt-icon-picker-tab' + (this.iconCategory === cat.id ? ' active' : ''),
        attr: { type: 'button', 'data-category': cat.id }
      });
      tab.onclick = () => {
        this.iconCategory = cat.id;
        this.renderIconTabs(tabsContainer);
        this.renderIconGrid();
      };
    }
    this.tabsContainer = tabsContainer;
    
    // Icon grid
    this.iconGridContainer = picker.createDiv({ cls: 'dmt-icon-picker-grid' });
    this.renderIconGrid();
    
    // Selected icon preview
    this.iconPreviewContainer = picker.createDiv({ cls: 'dmt-icon-preview-row' });
    this.updateIconPreview();
  }
  
  renderIconTabs(container) {
    // Update active state on all tabs
    const tabs = container.querySelectorAll('.dmt-icon-picker-tab');
    tabs.forEach(tab => {
      const catId = tab.getAttribute('data-category') || 'all';
      if (catId === this.iconCategory) {
        tab.addClass('active');
      } else {
        tab.removeClass('active');
      }
    });
  }
  
  renderIconGrid() {
    const container = this.iconGridContainer;
    if (!container) return;
    container.empty();
    
    // Get icons based on search or category
    let icons;
    if (this.iconSearchQuery.trim()) {
      icons = RPGAwesomeHelpers.search(this.iconSearchQuery);
    } else {
      icons = RPGAwesomeHelpers.getByCategory(this.iconCategory);
    }
    
    if (icons.length === 0) {
      container.createDiv({ cls: 'dmt-icon-picker-empty', text: 'No icons found' });
      return;
    }
    
    // Render icon buttons
    for (const icon of icons) {
      const iconBtn = container.createEl('button', {
        cls: 'dmt-icon-picker-icon' + (this.iconClass === icon.iconClass ? ' selected' : ''),
        attr: { 
          type: 'button',
          title: icon.label
        }
      });
      
      // Create the icon span with the character
      const iconSpan = iconBtn.createEl('span', { cls: 'ra' });
      iconSpan.textContent = icon.char;
      
      iconBtn.onclick = () => {
        this.iconClass = icon.iconClass;
        // Update selection state
        container.querySelectorAll('.dmt-icon-picker-icon').forEach(btn => btn.removeClass('selected'));
        iconBtn.addClass('selected');
        this.updateIconPreview();
      };
    }
  }
  
  updateSymbolPreview() {
    if (this.symbolPreviewEl) {
      this.symbolPreviewEl.textContent = this.symbol || '?';
    }
  }
  
  updateIconPreview() {
    const container = this.iconPreviewContainer;
    if (!container) return;
    container.empty();
    
    if (!this.iconClass) {
      container.createDiv({ cls: 'dmt-icon-preview-info', text: 'Select an icon above' });
      return;
    }
    
    const iconInfo = RPGAwesomeHelpers.getInfo(this.iconClass);
    if (!iconInfo) {
      container.createDiv({ cls: 'dmt-icon-preview-info', text: 'Invalid icon selected' });
      return;
    }
    
    // Large preview
    const previewBox = container.createDiv({ cls: 'dmt-icon-preview-large' });
    const iconSpan = previewBox.createEl('span', { cls: 'ra' });
    iconSpan.textContent = iconInfo.char;
    
    // Info
    const infoBox = container.createDiv({ cls: 'dmt-icon-preview-info' });
    infoBox.createDiv({ cls: 'dmt-icon-preview-label', text: iconInfo.label });
    infoBox.createDiv({ cls: 'dmt-icon-preview-class', text: this.iconClass });
  }
  
  save() {
    // Validate based on mode
    if (this.useIcon) {
      if (!this.iconClass || !RPGAwesomeHelpers.isValid(this.iconClass)) {
        alert('Please select a valid icon');
        return;
      }
    } else {
      if (!this.symbol || this.symbol.length === 0 || this.symbol.length > 8) {
        alert('Please enter a valid symbol (1-8 characters)');
        return;
      }
    }
    
    if (!this.label || this.label.trim().length === 0) {
      alert('Please enter a label');
      return;
    }
    
    // Get the correct settings keys for this map type
    const overridesKey = this.mapType === 'hex' ? 'hexObjectOverrides' : 'gridObjectOverrides';
    const customObjectsKey = this.mapType === 'hex' ? 'customHexObjects' : 'customGridObjects';
    
    if (this.existingObject?.isBuiltIn) {
      // Modifying a built-in: save as override
      if (!this.plugin.settings[overridesKey]) {
        this.plugin.settings[overridesKey] = {};
      }
      
      const original = BUILT_IN_OBJECTS.find(o => o.id === this.existingObject.id);
      const override = {};
      
      // Handle symbol/iconClass based on mode
      if (this.useIcon) {
        if (this.iconClass !== original.iconClass) override.iconClass = this.iconClass;
        // Clear symbol override if switching to icon
        if (original.symbol && !this.iconClass) override.symbol = null;
      } else {
        if (this.symbol !== original.symbol) override.symbol = this.symbol;
        // Clear iconClass override if switching to symbol
        if (original.iconClass) override.iconClass = null;
      }
      
      if (this.label !== original.label) override.label = this.label;
      if (this.category !== original.category) override.category = this.category;
      
      // Preserve hidden state if it exists
      if (this.plugin.settings[overridesKey][this.existingObject.id]?.hidden) {
        override.hidden = true;
      }
      
      // Preserve order if it exists
      if (this.plugin.settings[overridesKey][this.existingObject.id]?.order !== undefined) {
        override.order = this.plugin.settings[overridesKey][this.existingObject.id].order;
      }
      
      if (Object.keys(override).length > 0) {
        this.plugin.settings[overridesKey][this.existingObject.id] = override;
      } else {
        delete this.plugin.settings[overridesKey][this.existingObject.id];
      }
    } else if (this.existingObject?.isCustom) {
      // Editing existing custom object
      if (!this.plugin.settings[customObjectsKey]) {
        this.plugin.settings[customObjectsKey] = [];
      }
      const idx = this.plugin.settings[customObjectsKey].findIndex(o => o.id === this.existingObject.id);
      if (idx !== -1) {
        const updated = {
          ...this.plugin.settings[customObjectsKey][idx],
          label: this.label.trim(),
          category: this.category
        };
        
        // Set symbol or iconClass based on mode
        if (this.useIcon) {
          updated.iconClass = this.iconClass;
          delete updated.symbol;
        } else {
          updated.symbol = this.symbol;
          delete updated.iconClass;
        }
        
        this.plugin.settings[customObjectsKey][idx] = updated;
      }
    } else {
      // Creating new custom object
      if (!this.plugin.settings[customObjectsKey]) {
        this.plugin.settings[customObjectsKey] = [];
      }
      
      const newObject = {
        id: 'custom-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        label: this.label.trim(),
        category: this.category
      };
      
      // Set symbol or iconClass based on mode
      if (this.useIcon) {
        newObject.iconClass = this.iconClass;
      } else {
        newObject.symbol = this.symbol;
      }
      
      this.plugin.settings[customObjectsKey].push(newObject);
    }
    
    this.onSave();
    this.close();
  }
  
  onClose() {
    this.contentEl.empty();
  }
}

/**
 * Modal for creating/editing categories
 */
class CategoryEditModal extends Modal {
  constructor(app, plugin, existingCategory, onSave, mapType = 'grid') {
    super(app);
    this.plugin = plugin;
    this.existingCategory = existingCategory;
    this.onSave = onSave;
    this.mapType = mapType;
    
    this.label = existingCategory?.label || '';
    this.order = existingCategory?.order ?? 100;
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dmt-category-edit-modal');
    
    const isEditing = !!this.existingCategory;
    
    contentEl.createEl('h2', { text: isEditing ? 'Edit Category' : 'Create Custom Category' });
    
    let nameInputEl = null;
    new Setting(contentEl)
      .setName('Name')
      .setDesc('Display name for this category')
      .addText(text => {
        nameInputEl = text.inputEl;
        text.setValue(this.label)
          .setPlaceholder('e.g., Alchemy')
          .onChange(value => {
            this.label = value;
          });
      });
    
    // Focus the name input after a short delay
    if (nameInputEl) {
      setTimeout(() => nameInputEl.focus(), 50);
    }
    
    new Setting(contentEl)
      .setName('Sort Order')
      .setDesc('Lower numbers appear first (built-ins use 0-50)')
      .addText(text => text
        .setValue(String(this.order))
        .setPlaceholder('100')
        .onChange(value => {
          const num = parseInt(value, 10);
          if (!isNaN(num)) {
            this.order = num;
          }
        }));
    
    const buttonContainer = contentEl.createDiv({ cls: 'dmt-modal-buttons' });
    
    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => this.close();
    
    const saveBtn = buttonContainer.createEl('button', { text: 'Save', cls: 'mod-cta' });
    saveBtn.onclick = () => this.save();
  }
  
  save() {
    if (!this.label || this.label.trim().length === 0) {
      alert('Please enter a category name');
      return;
    }
    
    // Get the correct settings key for this map type
    const categoriesKey = this.mapType === 'hex' ? 'customHexCategories' : 'customGridCategories';
    
    if (!this.plugin.settings[categoriesKey]) {
      this.plugin.settings[categoriesKey] = [];
    }
    
    if (this.existingCategory) {
      const idx = this.plugin.settings[categoriesKey].findIndex(c => c.id === this.existingCategory.id);
      if (idx !== -1) {
        this.plugin.settings[categoriesKey][idx] = {
          ...this.plugin.settings[categoriesKey][idx],
          label: this.label.trim(),
          order: this.order
        };
      }
    } else {
      const newCategory = {
        id: 'custom-cat-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        label: this.label.trim(),
        order: this.order
      };
      
      this.plugin.settings[categoriesKey].push(newCategory);
    }
    
    this.onSave();
    this.close();
  }
  
  onClose() {
    this.contentEl.empty();
  }
}

/**
 * Modal for creating/editing palette colors
 */
class ColorEditModal extends Modal {
  constructor(app, plugin, existingColor, onSave) {
    super(app);
    this.plugin = plugin;
    this.existingColor = existingColor;
    this.onSave = onSave;
    this.isBuiltIn = existingColor?.isBuiltIn || false;
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dmt-color-edit-modal');
    
    const isEdit = !!this.existingColor;
    const isBuiltIn = this.isBuiltIn;
    
    contentEl.createEl('h2', { 
      text: isEdit 
        ? (isBuiltIn ? \`Edit: \${this.existingColor.label}\` : 'Edit Custom Color')
        : 'Add Custom Color' 
    });
    
    // Get original built-in values if editing a built-in
    const originalBuiltIn = isBuiltIn 
      ? BUILT_IN_COLORS.find(c => c.id === this.existingColor.id)
      : null;
    
    // Initialize form values
    let colorValue = this.existingColor?.color || '#808080';
    let labelValue = this.existingColor?.label || '';
    
    // Color picker
    new Setting(contentEl)
      .setName('Color')
      .setDesc('Choose the color value')
      .addColorPicker(picker => picker
        .setValue(colorValue)
        .onChange(value => {
          colorValue = value;
          hexInput.value = value;
        }))
      .addText(text => {
        text.inputEl.addClass('dmt-color-hex-input');
        text.setPlaceholder('#RRGGBB')
          .setValue(colorValue)
          .onChange(value => {
            if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
              colorValue = value;
            }
          });
        // Store reference for color picker sync
        var hexInput = text.inputEl;
      });
    
    // Label input
    new Setting(contentEl)
      .setName('Label')
      .setDesc('Display name for this color')
      .addText(text => text
        .setPlaceholder('e.g., Ocean Blue')
        .setValue(labelValue)
        .onChange(value => {
          labelValue = value;
        }));
    
    // Show original values for built-ins
    if (isBuiltIn && originalBuiltIn) {
      const origInfo = contentEl.createEl('div', { cls: 'dmt-color-original-info' });
      origInfo.createEl('span', { text: 'Original: ' });
      const origSwatch = origInfo.createEl('span', { 
        cls: 'dmt-color-mini-swatch',
        attr: { style: \`background-color: \${originalBuiltIn.color}\` }
      });
      origInfo.createEl('span', { text: \` \${originalBuiltIn.label} (\${originalBuiltIn.color})\` });
    }
    
    // Action buttons
    const btnContainer = contentEl.createEl('div', { cls: 'dmt-modal-buttons' });
    
    const saveBtn = btnContainer.createEl('button', { 
      text: 'Save', 
      cls: 'mod-cta' 
    });
    saveBtn.addEventListener('click', async () => {
      // Validate
      if (!labelValue.trim()) {
        alert('Please enter a label for this color.');
        return;
      }
      if (!/^#[0-9A-Fa-f]{6}$/.test(colorValue)) {
        alert('Please enter a valid hex color (e.g., #4A9EFF)');
        return;
      }
      
      if (isBuiltIn) {
        // Save as override
        if (!this.plugin.settings.colorPaletteOverrides) {
          this.plugin.settings.colorPaletteOverrides = {};
        }
        const existingOverride = this.plugin.settings.colorPaletteOverrides[this.existingColor.id] || {};
        this.plugin.settings.colorPaletteOverrides[this.existingColor.id] = {
          ...existingOverride,
          color: colorValue,
          label: labelValue
        };
      } else if (isEdit) {
        // Update existing custom color
        const idx = this.plugin.settings.customPaletteColors.findIndex(c => c.id === this.existingColor.id);
        if (idx !== -1) {
          this.plugin.settings.customPaletteColors[idx] = {
            ...this.plugin.settings.customPaletteColors[idx],
            color: colorValue,
            label: labelValue
          };
        }
      } else {
        // Add new custom color
        if (!this.plugin.settings.customPaletteColors) {
          this.plugin.settings.customPaletteColors = [];
        }
        this.plugin.settings.customPaletteColors.push({
          id: 'custom-' + Date.now(),
          color: colorValue,
          label: labelValue
        });
      }
      
      this.onSave();
      this.close();
    });
    
    const cancelBtn = btnContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.addEventListener('click', () => this.close());
  }
  
  onClose() {
    this.contentEl.empty();
  }
}

/**
 * Modal for exporting object customizations
 */
class ExportModal extends Modal {
  constructor(app, plugin, mapType = 'grid') {
    super(app);
    this.plugin = plugin;
    this.mapType = mapType;
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dmt-export-modal');
    
    const mapTypeLabel = this.mapType === 'hex' ? 'Hex' : 'Grid';
    contentEl.createEl('h2', { text: \`Export \${mapTypeLabel} Object Customizations\` });
    
    // Get the correct settings keys for this map type
    const overridesKey = this.mapType === 'hex' ? 'hexObjectOverrides' : 'gridObjectOverrides';
    const customObjectsKey = this.mapType === 'hex' ? 'customHexObjects' : 'customGridObjects';
    const categoriesKey = this.mapType === 'hex' ? 'customHexCategories' : 'customGridCategories';
    
    const objectOverrides = this.plugin.settings[overridesKey] || {};
    const customObjects = this.plugin.settings[customObjectsKey] || [];
    const customCategories = this.plugin.settings[categoriesKey] || [];
    
    const hasOverrides = Object.keys(objectOverrides).length > 0;
    const hasCustom = customObjects.length > 0 || customCategories.length > 0;
    
    // Selection checkboxes
    let exportOverrides = hasOverrides;
    let exportCustom = hasCustom;
    
    // Explain what will be exported
    if (hasOverrides || hasCustom) {
      contentEl.createEl('p', { 
        text: 'Select what to include in the export file:',
        cls: 'setting-item-description'
      });
    }
    
    if (hasOverrides) {
      new Setting(contentEl)
        .setName(\`Built-in modifications (\${Object.keys(objectOverrides).length})\`)
        .setDesc('Changes to symbol, label, or order of built-in objects')
        .addToggle(toggle => toggle
          .setValue(exportOverrides)
          .onChange(v => { exportOverrides = v; }));
    }
    
    if (hasCustom) {
      const customCount = customObjects.length + customCategories.length;
      new Setting(contentEl)
        .setName(\`Custom objects & categories (\${customCount})\`)
        .setDesc(\`\${customObjects.length} object(s), \${customCategories.length} category(ies)\`)
        .addToggle(toggle => toggle
          .setValue(exportCustom)
          .onChange(v => { exportCustom = v; }));
    }
    
    if (!hasOverrides && !hasCustom) {
      contentEl.createEl('p', { 
        text: \`No customizations to export for \${mapTypeLabel} maps. Modify built-in objects or create custom ones first.\`,
        cls: 'dmt-export-empty'
      });
      return;
    }
    
    // Filename input
    const defaultFilename = \`windrose-\${this.mapType}-objects-\${new Date().toISOString().split('T')[0]}.json\`;
    let filename = defaultFilename;
    
    new Setting(contentEl)
      .setName('Filename')
      .setDesc('Will be saved to your vault root')
      .addText(text => text
        .setValue(filename)
        .onChange(v => { filename = v; }));
    
    // Export button
    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText('Export to Vault')
        .setCta()
        .onClick(async () => {
          const exportData = {
            windroseMD_objectExport: true,
            exportedAt: new Date().toISOString(),
            version: '1.0',
            mapType: this.mapType
          };
          
          if (exportOverrides && hasOverrides) {
            exportData.objectOverrides = objectOverrides;
          }
          if (exportCustom && hasCustom) {
            if (customObjects.length > 0) exportData.customObjects = customObjects;
            if (customCategories.length > 0) exportData.customCategories = customCategories;
          }
          
          // Save to vault
          const json = JSON.stringify(exportData, null, 2);
          const finalFilename = filename.endsWith('.json') ? filename : filename + '.json';
          
          try {
            // Check if file exists
            const existingFile = this.app.vault.getAbstractFileByPath(finalFilename);
            if (existingFile) {
              if (!confirm(\`File "\${finalFilename}" already exists. Overwrite?\`)) {
                return;
              }
              await this.app.vault.modify(existingFile, json);
            } else {
              await this.app.vault.create(finalFilename, json);
            }
            
            alert(\`Exported to: \${finalFilename}\`);
            this.close();
          } catch (err) {
            alert(\`Export failed: \${err.message}\`);
          }
        }));
  }
  
  onClose() {
    this.contentEl.empty();
  }
}

/**
 * Modal for importing object customizations
 */
class ImportModal extends Modal {
  constructor(app, plugin, onImport, mapType = 'grid') {
    super(app);
    this.plugin = plugin;
    this.onImport = onImport;
    this.mapType = mapType;
    this.importData = null;
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dmt-import-modal');
    
    const mapTypeLabel = this.mapType === 'hex' ? 'Hex' : 'Grid';
    contentEl.createEl('h2', { text: \`Import \${mapTypeLabel} Object Customizations\` });
    
    contentEl.createEl('p', { 
      text: \`Select a Windrose MD object export file (.json) to import into \${mapTypeLabel} maps.\`,
      cls: 'setting-item-description'
    });
    
    // File picker
    const fileContainer = contentEl.createDiv({ cls: 'dmt-import-file-container' });
    const fileInput = fileContainer.createEl('input', {
      type: 'file',
      attr: { accept: '.json' }
    });
    
    // Preview area (hidden until file selected)
    const previewArea = contentEl.createDiv({ cls: 'dmt-import-preview' });
    previewArea.style.display = 'none';
    
    // Import options (hidden until file validated)
    const optionsArea = contentEl.createDiv({ cls: 'dmt-import-options' });
    optionsArea.style.display = 'none';
    
    let mergeMode = 'merge'; // 'merge' or 'replace'
    
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        // Validate it's a Windrose export
        if (!data.windroseMD_objectExport) {
          previewArea.empty();
          previewArea.createEl('p', { 
            text: 'This file is not a valid Windrose MD object export.',
            cls: 'dmt-import-error'
          });
          previewArea.style.display = 'block';
          optionsArea.style.display = 'none';
          this.importData = null;
          return;
        }
        
        this.importData = data;
        
        // Show preview
        previewArea.empty();
        previewArea.createEl('p', { text: 'Valid Windrose MD export file' });
        if (data.exportedAt) {
          previewArea.createEl('p', { 
            text: \`Exported: \${new Date(data.exportedAt).toLocaleString()}\`,
            cls: 'dmt-import-date'
          });
        }
        
        // Show original map type if present
        if (data.mapType) {
          const sourceType = data.mapType === 'hex' ? 'Hex' : 'Grid';
          if (data.mapType !== this.mapType) {
            previewArea.createEl('p', { 
              text: \`Note: This was exported from \${sourceType} maps but will be imported to \${mapTypeLabel} maps.\`,
              cls: 'dmt-import-note'
            });
          }
        }
        
        const overrideCount = data.objectOverrides ? Object.keys(data.objectOverrides).length : 0;
        const customObjCount = data.customObjects?.length || 0;
        const customCatCount = data.customCategories?.length || 0;
        
        if (overrideCount > 0) {
          previewArea.createEl('p', { text: \`â€¢ \${overrideCount} built-in modification(s)\` });
        }
        if (customObjCount > 0) {
          previewArea.createEl('p', { text: \`â€¢ \${customObjCount} custom object(s)\` });
        }
        if (customCatCount > 0) {
          previewArea.createEl('p', { text: \`â€¢ \${customCatCount} custom category(ies)\` });
        }
        
        previewArea.style.display = 'block';
        
        // Show import options
        optionsArea.empty();
        new Setting(optionsArea)
          .setName('Import Mode')
          .setDesc('How to handle existing customizations')
          .addDropdown(dropdown => dropdown
            .addOption('merge', 'Merge (keep existing, add new)')
            .addOption('replace', 'Replace (remove existing first)')
            .setValue(mergeMode)
            .onChange(v => { mergeMode = v; }));
        
        optionsArea.style.display = 'block';
        
      } catch (err) {
        previewArea.empty();
        previewArea.createEl('p', { 
          text: \`Error reading file: \${err.message}\`,
          cls: 'dmt-import-error'
        });
        previewArea.style.display = 'block';
        optionsArea.style.display = 'none';
        this.importData = null;
      }
    });
    
    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: 'dmt-modal-buttons' });
    
    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => this.close();
    
    const importBtn = buttonContainer.createEl('button', { text: 'Import', cls: 'mod-cta' });
    importBtn.onclick = async () => {
      if (!this.importData) {
        alert('Please select a valid export file first.');
        return;
      }
      
      // Get the correct settings keys for this map type
      const overridesKey = this.mapType === 'hex' ? 'hexObjectOverrides' : 'gridObjectOverrides';
      const customObjectsKey = this.mapType === 'hex' ? 'customHexObjects' : 'customGridObjects';
      const categoriesKey = this.mapType === 'hex' ? 'customHexCategories' : 'customGridCategories';
      
      const data = this.importData;
      
      if (mergeMode === 'replace') {
        // Clear existing for this map type
        this.plugin.settings[overridesKey] = {};
        this.plugin.settings[customObjectsKey] = [];
        this.plugin.settings[categoriesKey] = [];
      }
      
      // Import overrides
      if (data.objectOverrides) {
        if (!this.plugin.settings[overridesKey]) {
          this.plugin.settings[overridesKey] = {};
        }
        Object.assign(this.plugin.settings[overridesKey], data.objectOverrides);
      }
      
      // Import custom objects (avoid duplicates by ID)
      if (data.customObjects) {
        if (!this.plugin.settings[customObjectsKey]) {
          this.plugin.settings[customObjectsKey] = [];
        }
        for (const obj of data.customObjects) {
          const existingIdx = this.plugin.settings[customObjectsKey].findIndex(o => o.id === obj.id);
          if (existingIdx !== -1) {
            this.plugin.settings[customObjectsKey][existingIdx] = obj;
          } else {
            this.plugin.settings[customObjectsKey].push(obj);
          }
        }
      }
      
      // Import custom categories (avoid duplicates by ID)
      if (data.customCategories) {
        if (!this.plugin.settings[categoriesKey]) {
          this.plugin.settings[categoriesKey] = [];
        }
        for (const cat of data.customCategories) {
          const existingIdx = this.plugin.settings[categoriesKey].findIndex(c => c.id === cat.id);
          if (existingIdx !== -1) {
            this.plugin.settings[categoriesKey][existingIdx] = cat;
          } else {
            this.plugin.settings[categoriesKey].push(cat);
          }
        }
      }
      
      await this.plugin.saveSettings();
      this.onImport();
      this.close();
    };
  }
  
  onClose() {
    this.contentEl.empty();
  }
}

// =============================================================================
// MAIN PLUGIN CLASS
// =============================================================================

class WindroseMDSettingsPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new WindroseMDSettingsTab(this.app, this));
  }

  onunload() {}

  async loadSettings() {
    try {
      const data = await this.loadData();
      this.settings = Object.assign({
        version: '{{PLUGIN_VERSION}}',
        hexOrientation: '{{DEFAULT_HEX_ORIENTATION}}',
        gridLineColor: '{{DEFAULT_GRID_LINE_COLOR}}',
        gridLineWidth: 1,
        backgroundColor: '{{DEFAULT_BACKGROUND_COLOR}}',
        borderColor: '{{DEFAULT_BORDER_COLOR}}',
        coordinateKeyColor: '{{DEFAULT_COORDINATE_KEY_COLOR}}',
        coordinateTextColor: '{{DEFAULT_COORDINATE_TEXT_COLOR}}',
        coordinateTextShadow: '{{DEFAULT_COORDINATE_TEXT_SHADOW}}',
        coordinateKeyMode: 'hold',
        expandedByDefault: false,
        // Canvas dimensions
        canvasHeight: 600,
        canvasHeightMobile: 400,
        // Distance measurement settings
        distancePerCellGrid: 5,
        distancePerCellHex: 6,
        distanceUnitGrid: 'ft',
        distanceUnitHex: 'mi',
        gridDiagonalRule: 'alternating',
        distanceDisplayFormat: 'both',
        // Object customization - separate for hex and grid maps
        hexObjectOverrides: {},
        customHexObjects: [],
        customHexCategories: [],
        gridObjectOverrides: {},
        customGridObjects: [],
        customGridCategories: [],
        // Color palette customization
        colorPaletteOverrides: {},
        customPaletteColors: [],
        // Fog of War defaults
        fogOfWarBlurEnabled: false,
        fogOfWarBlurFactor: 0.20,
        // Controls visibility
        alwaysShowControls: false
      }, data || {});
    } catch (error) {
      console.warn('[DMT Settings] Error loading settings, using defaults:', error);
      this.settings = {
        version: '{{PLUGIN_VERSION}}',
        hexOrientation: '{{DEFAULT_HEX_ORIENTATION}}',
        gridLineColor: '{{DEFAULT_GRID_LINE_COLOR}}',
        gridLineWidth: 1,
        backgroundColor: '{{DEFAULT_BACKGROUND_COLOR}}',
        borderColor: '{{DEFAULT_BORDER_COLOR}}',
        coordinateKeyColor: '{{DEFAULT_COORDINATE_KEY_COLOR}}',
        coordinateTextColor: '{{DEFAULT_COORDINATE_TEXT_COLOR}}',
        coordinateTextShadow: '{{DEFAULT_COORDINATE_TEXT_SHADOW}}',
        coordinateKeyMode: 'hold',
        expandedByDefault: false,
        // Canvas dimensions
        canvasHeight: 600,
        canvasHeightMobile: 400,
        // Distance measurement settings
        distancePerCellGrid: 5,
        distancePerCellHex: 6,
        distanceUnitGrid: 'ft',
        distanceUnitHex: 'mi',
        gridDiagonalRule: 'alternating',
        distanceDisplayFormat: 'both',
        // Object customization - separate for hex and grid maps
        hexObjectOverrides: {},
        customHexObjects: [],
        customHexCategories: [],
        gridObjectOverrides: {},
        customGridObjects: [],
        customGridCategories: [],
        // Color palette customization
        colorPaletteOverrides: {},
        customPaletteColors: [],
        // Fog of War defaults
        fogOfWarBlurEnabled: false,
        fogOfWarBlurFactor: 0.20,
        // Controls visibility
        alwaysShowControls: false
      };
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

// =============================================================================
// SETTINGS TAB CLASS
// =============================================================================

class WindroseMDSettingsTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.settingsChanged = false;
    this.styleEl = null;
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
  
  renderSearchBar(containerEl) {
    const wrapper = containerEl.createEl('div', { cls: 'dmt-settings-search-wrapper' });
    const searchBox = wrapper.createEl('div', { cls: 'dmt-settings-search-box' });
    
    // Search icon
    const searchIcon = searchBox.createEl('span', { cls: 'search-icon' });
    IconHelpers.set(searchIcon, 'search');
    
    // Input
    const input = searchBox.createEl('input', {
      type: 'text',
      placeholder: 'Search settings...'
    });
    
    // Clear button (hidden initially)
    const clearBtn = searchBox.createEl('button', { cls: 'clear-btn' });
    clearBtn.style.display = 'none';
    IconHelpers.set(clearBtn, 'x');
    
    // No results message (hidden initially)
    this.noResultsEl = containerEl.createEl('div', { 
      cls: 'dmt-settings-no-results',
      text: 'No settings found matching your search.'
    });
    this.noResultsEl.style.display = 'none';
    
    // Search handler
    const handleSearch = (query) => {
      const q = query.toLowerCase().trim();
      clearBtn.style.display = q ? 'block' : 'none';
      
      if (!q) {
        // Clear search - show all, collapse sections
        this.sections?.forEach(({ details }) => {
          details.style.display = '';
          details.settingItems?.forEach(item => {
            item.classList.remove('dmt-setting-hidden');
          });
          details.removeAttribute('open');
        });
        this.noResultsEl.style.display = 'none';
        return;
      }
      
      let anyMatches = false;
      
      this.sections?.forEach(({ details, title }) => {
        let sectionHasMatch = title.toLowerCase().includes(q);
        
        details.settingItems?.forEach(item => {
          const nameEl = item.querySelector('.setting-item-name');
          const descEl = item.querySelector('.setting-item-description');
          const name = nameEl?.textContent?.toLowerCase() || '';
          const desc = descEl?.textContent?.toLowerCase() || '';
          
          const matches = name.includes(q) || desc.includes(q);
          
          if (matches) {
            item.classList.remove('dmt-setting-hidden');
            sectionHasMatch = true;
          } else {
            item.classList.add('dmt-setting-hidden');
          }
        });
        
        if (sectionHasMatch) {
          details.style.display = '';
          details.setAttribute('open', '');
          anyMatches = true;
        } else {
          details.style.display = 'none';
        }
      });
      
      this.noResultsEl.style.display = anyMatches ? 'none' : 'block';
    };
    
    input.addEventListener('input', (e) => handleSearch(e.target.value));
    clearBtn.addEventListener('click', () => {
      input.value = '';
      handleSearch('');
      input.focus();
    });
  }
  
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
    
    this.injectStyles();
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
    this.createCollapsibleSection(containerEl, 'Object Types', 
      (el) => this.renderObjectTypesContent(el),
      { open: openSections.has('Object Types') });
  }

  // ---------------------------------------------------------------------------
  // Section: Hex Map Settings
  // ---------------------------------------------------------------------------
  
  renderHexSettingsContent(containerEl) {
    // Hex Orientation
    new Setting(containerEl)
      .setName('Hex Grid Orientation')
      .setDesc('Default orientation for hex grids (flat-top or pointy-top)')
      .addDropdown(dropdown => dropdown
        .addOption('flat', 'Flat-Top')
        .addOption('pointy', 'Pointy-Top')
        .setValue(this.plugin.settings.hexOrientation)
        .onChange(async (value) => {
          this.plugin.settings.hexOrientation = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }));

    // Coordinate Key Mode
    new Setting(containerEl)
      .setName('Coordinate Overlay Mode')
      .setDesc('How the C key activates coordinate labels: hold to show temporarily, or toggle on/off')
      .addDropdown(dropdown => dropdown
        .addOption('hold', 'Hold to Show')
        .addOption('toggle', 'Toggle On/Off')
        .setValue(this.plugin.settings.coordinateKeyMode || 'hold')
        .onChange(async (value) => {
          this.plugin.settings.coordinateKeyMode = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }));

    // Coordinate Text Color
    new Setting(containerEl)
      .setName('Coordinate Text Color')
      .setDesc('Primary color for hex coordinate overlay text (hex format: #RRGGBB)')
      .addColorPicker(color => color
        .setValue(this.plugin.settings.coordinateTextColor)
        .onChange(async (value) => {
          this.plugin.settings.coordinateTextColor = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }))
      .addText(text => text
        .setPlaceholder('{{DEFAULT_COORDINATE_TEXT_COLOR}}')
        .setValue(this.plugin.settings.coordinateTextColor)
        .onChange(async (value) => {
          if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
            this.plugin.settings.coordinateTextColor = value;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }))
      .addExtraButton(btn => btn
        .setIcon('rotate-ccw')
        .setTooltip('Reset to default')
        .onClick(async () => {
          this.plugin.settings.coordinateTextColor = '{{DEFAULT_COORDINATE_TEXT_COLOR}}';
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));

    // Coordinate Text Shadow
    new Setting(containerEl)
      .setName('Coordinate Text Shadow')
      .setDesc('Shadow/outline color for hex coordinate overlay text (hex format: #RRGGBB)')
      .addColorPicker(color => color
        .setValue(this.plugin.settings.coordinateTextShadow)
        .onChange(async (value) => {
          this.plugin.settings.coordinateTextShadow = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }))
      .addText(text => text
        .setPlaceholder('{{DEFAULT_COORDINATE_TEXT_SHADOW}}')
        .setValue(this.plugin.settings.coordinateTextShadow)
        .onChange(async (value) => {
          if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
            this.plugin.settings.coordinateTextShadow = value;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }))
      .addExtraButton(btn => btn
        .setIcon('rotate-ccw')
        .setTooltip('Reset to default')
        .onClick(async () => {
          this.plugin.settings.coordinateTextShadow = '{{DEFAULT_COORDINATE_TEXT_SHADOW}}';
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));
  }

  // ---------------------------------------------------------------------------
  // Section: Color Settings
  // ---------------------------------------------------------------------------
  
  renderColorSettingsContent(containerEl) {
    containerEl.createEl('p', { 
      text: 'These settings control default colors and behavior for all WindroseMD maps in this vault.',
      cls: 'setting-item-description'
    });
    
    // Grid Line Color
    new Setting(containerEl)
      .setName('Grid Line Color')
      .setDesc('Color for grid lines (hex format: #RRGGBB)')
      .addColorPicker(color => color
        .setValue(this.plugin.settings.gridLineColor)
        .onChange(async (value) => {
          this.plugin.settings.gridLineColor = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }))
      .addText(text => text
        .setPlaceholder('{{DEFAULT_GRID_LINE_COLOR}}')
        .setValue(this.plugin.settings.gridLineColor)
        .onChange(async (value) => {
          if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
            this.plugin.settings.gridLineColor = value;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }))
      .addExtraButton(btn => btn
        .setIcon('rotate-ccw')
        .setTooltip('Reset to default')
        .onClick(async () => {
          this.plugin.settings.gridLineColor = '{{DEFAULT_GRID_LINE_COLOR}}';
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));

    // Grid Line Width (grid maps only)
    new Setting(containerEl)
      .setName('Grid Line Width')
      .setDesc('Thickness of grid lines in pixels (1-5). Applies to grid maps only.')
      .addSlider(slider => slider
        .setLimits(1, 5, 1)
        .setValue(this.plugin.settings.gridLineWidth ?? 1)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.gridLineWidth = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }))
      .addExtraButton(btn => btn
        .setIcon('rotate-ccw')
        .setTooltip('Reset to default (1px)')
        .onClick(async () => {
          this.plugin.settings.gridLineWidth = 1;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));

    // Background Color
    new Setting(containerEl)
      .setName('Background Color')
      .setDesc('Canvas background color (hex format: #RRGGBB)')
      .addColorPicker(color => color
        .setValue(this.plugin.settings.backgroundColor)
        .onChange(async (value) => {
          this.plugin.settings.backgroundColor = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }))
      .addText(text => text
        .setPlaceholder('{{DEFAULT_BACKGROUND_COLOR}}')
        .setValue(this.plugin.settings.backgroundColor)
        .onChange(async (value) => {
          if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
            this.plugin.settings.backgroundColor = value;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }))
      .addExtraButton(btn => btn
        .setIcon('rotate-ccw')
        .setTooltip('Reset to default')
        .onClick(async () => {
          this.plugin.settings.backgroundColor = '{{DEFAULT_BACKGROUND_COLOR}}';
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));

    // Border Color
    new Setting(containerEl)
      .setName('Border Color')
      .setDesc('Color for painted cell borders (hex format: #RRGGBB)')
      .addColorPicker(color => color
        .setValue(this.plugin.settings.borderColor)
        .onChange(async (value) => {
          this.plugin.settings.borderColor = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }))
      .addText(text => text
        .setPlaceholder('{{DEFAULT_BORDER_COLOR}}')
        .setValue(this.plugin.settings.borderColor)
        .onChange(async (value) => {
          if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
            this.plugin.settings.borderColor = value;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }))
      .addExtraButton(btn => btn
        .setIcon('rotate-ccw')
        .setTooltip('Reset to default')
        .onClick(async () => {
          this.plugin.settings.borderColor = '{{DEFAULT_BORDER_COLOR}}';
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));

    // Coordinate Key Color
    new Setting(containerEl)
      .setName('Coordinate Key Color')
      .setDesc('Background color for coordinate key indicator (hex format: #RRGGBB)')
      .addColorPicker(color => color
        .setValue(this.plugin.settings.coordinateKeyColor)
        .onChange(async (value) => {
          this.plugin.settings.coordinateKeyColor = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }))
      .addText(text => text
        .setPlaceholder('{{DEFAULT_COORDINATE_KEY_COLOR}}')
        .setValue(this.plugin.settings.coordinateKeyColor)
        .onChange(async (value) => {
          if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
            this.plugin.settings.coordinateKeyColor = value;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }))
      .addExtraButton(btn => btn
        .setIcon('rotate-ccw')
        .setTooltip('Reset to default')
        .onClick(async () => {
          this.plugin.settings.coordinateKeyColor = '{{DEFAULT_COORDINATE_KEY_COLOR}}';
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));
  }

  // ---------------------------------------------------------------------------
  // Section: Color Palette
  // ---------------------------------------------------------------------------
  
  renderColorPaletteContent(containerEl) {
    containerEl.createEl('p', { 
      text: 'Customize the color palette used for drawing cells and objects. Edit built-in colors, add custom colors, or hide colors you don\\'t use.',
      cls: 'setting-item-description'
    });
    
    // Add Custom Color button
    new Setting(containerEl)
      .setName('Add Custom Color')
      .setDesc('Create a new color for your palette')
      .addButton(btn => btn
        .setButtonText('+ Add Color')
        .setCta()
        .onClick(() => {
          new ColorEditModal(this.app, this.plugin, null, async () => {
            this.settingsChanged = true;
            await this.plugin.saveSettings();
            this.display();
          }).open();
        }));
    
    // Reset All Colors button  
    new Setting(containerEl)
      .setName('Reset Palette')
      .setDesc('Restore all built-in colors to defaults and remove custom colors')
      .addButton(btn => btn
        .setButtonText('Reset All')
        .setWarning()
        .onClick(async () => {
          if (confirm('Reset all colors to defaults? This will remove all customizations.')) {
            this.plugin.settings.colorPaletteOverrides = {};
            this.plugin.settings.customPaletteColors = [];
            this.settingsChanged = true;
            await this.plugin.saveSettings();
            this.display();
          }
        }));
    
    // Render color list
    this.renderColorList(containerEl);
  }
  
  renderColorList(containerEl) {
    const resolvedColors = ColorHelpers.getResolved(this.plugin.settings);
    const hiddenColors = ColorHelpers.getHidden(this.plugin.settings);
    
    // Separate into visible and hidden
    const visibleColors = resolvedColors.filter(c => !hiddenColors.has(c.id));
    const hiddenBuiltIns = BUILT_IN_COLORS.filter(c => hiddenColors.has(c.id));
    
    // Visible colors container
    const visibleContainer = containerEl.createEl('div', { cls: 'dmt-settings-category' });
    const visibleHeader = visibleContainer.createEl('div', { cls: 'dmt-settings-category-header' });
    visibleHeader.createEl('span', { text: \`Active Colors (\${visibleColors.length})\`, cls: 'dmt-settings-category-label' });
    
    const visibleList = visibleContainer.createEl('div', { cls: 'dmt-color-list' });
    
    visibleColors.forEach(color => {
      this.renderColorRow(visibleList, color, false);
    });
    
    if (visibleColors.length === 0) {
      visibleList.createEl('div', { 
        text: 'No colors visible. Use "Show" to restore hidden colors.',
        cls: 'dmt-settings-empty-message'
      });
    }
    
    // Hidden colors (if any)
    if (hiddenBuiltIns.length > 0) {
      const hiddenContainer = containerEl.createEl('div', { cls: 'dmt-settings-category dmt-settings-category-muted' });
      const hiddenHeader = hiddenContainer.createEl('div', { cls: 'dmt-settings-category-header' });
      hiddenHeader.createEl('span', { text: \`Hidden Colors (\${hiddenBuiltIns.length})\`, cls: 'dmt-settings-category-label' });
      
      const hiddenList = hiddenContainer.createEl('div', { cls: 'dmt-color-list' });
      
      hiddenBuiltIns.forEach(color => {
        // Build display version with override if exists
        const override = this.plugin.settings.colorPaletteOverrides?.[color.id];
        const displayColor = override ? { ...color, ...override, isBuiltIn: true, isModified: true } : { ...color, isBuiltIn: true };
        this.renderColorRow(hiddenList, displayColor, true);
      });
    }
  }
  
  renderColorRow(containerEl, color, isHidden) {
    const row = containerEl.createEl('div', { cls: 'dmt-color-row' });
    
    // Color swatch
    const swatch = row.createEl('div', { 
      cls: 'dmt-color-row-swatch',
      attr: { style: \`background-color: \${color.color}\` }
    });
    
    // Label with modified indicator
    const labelContainer = row.createEl('div', { cls: 'dmt-color-row-label' });
    labelContainer.createEl('span', { text: color.label, cls: 'dmt-color-row-name' });
    
    if (color.isModified) {
      labelContainer.createEl('span', { text: ' (modified)', cls: 'dmt-color-row-modified' });
    }
    if (color.isCustom) {
      labelContainer.createEl('span', { text: ' (custom)', cls: 'dmt-color-row-custom' });
    }
    
    // Hex value
    row.createEl('code', { text: color.color, cls: 'dmt-color-row-hex' });
    
    // Actions
    const actions = row.createEl('div', { cls: 'dmt-color-row-actions' });
    
    // Edit button
    const editBtn = actions.createEl('button', { cls: 'dmt-btn-icon', attr: { 'aria-label': 'Edit color' } });
    IconHelpers.set(editBtn, 'pencil');
    editBtn.addEventListener('click', () => {
      new ColorEditModal(this.app, this.plugin, color, async () => {
        this.settingsChanged = true;
        await this.plugin.saveSettings();
        this.display();
      }).open();
    });
    
    // Show/Hide button (for built-in colors only)
    if (color.isBuiltIn) {
      const visBtn = actions.createEl('button', { cls: 'dmt-btn-icon', attr: { 'aria-label': isHidden ? 'Show color' : 'Hide color' } });
      IconHelpers.set(visBtn, isHidden ? 'eye' : 'eye-off');
      visBtn.addEventListener('click', async () => {
        if (!this.plugin.settings.colorPaletteOverrides) {
          this.plugin.settings.colorPaletteOverrides = {};
        }
        if (!this.plugin.settings.colorPaletteOverrides[color.id]) {
          this.plugin.settings.colorPaletteOverrides[color.id] = {};
        }
        this.plugin.settings.colorPaletteOverrides[color.id].hidden = !isHidden;
        
        // Clean up empty override
        if (Object.keys(this.plugin.settings.colorPaletteOverrides[color.id]).length === 1 
            && !this.plugin.settings.colorPaletteOverrides[color.id].hidden) {
          delete this.plugin.settings.colorPaletteOverrides[color.id];
        }
        
        this.settingsChanged = true;
        await this.plugin.saveSettings();
        this.display();
      });
      
      // Reset button (if modified)
      if (color.isModified) {
        const resetBtn = actions.createEl('button', { cls: 'dmt-btn-icon', attr: { 'aria-label': 'Reset to default' } });
        IconHelpers.set(resetBtn, 'rotate-ccw');
        resetBtn.addEventListener('click', async () => {
          delete this.plugin.settings.colorPaletteOverrides[color.id];
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        });
      }
    }
    
    // Delete button (for custom colors only)
    if (color.isCustom) {
      const delBtn = actions.createEl('button', { cls: 'dmt-btn-icon dmt-btn-danger', attr: { 'aria-label': 'Delete color' } });
      IconHelpers.set(delBtn, 'trash-2');
      delBtn.addEventListener('click', async () => {
        this.plugin.settings.customPaletteColors = this.plugin.settings.customPaletteColors.filter(c => c.id !== color.id);
        this.settingsChanged = true;
        await this.plugin.saveSettings();
        this.display();
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Section: Fog of War
  // ---------------------------------------------------------------------------
  
  renderFogOfWarSettingsContent(containerEl) {
    containerEl.createEl('p', { 
      text: 'Default fog of war appearance settings for new maps. Individual maps can override these in their settings.',
      cls: 'setting-item-description'
    });
    
    // Soft Edges Toggle
    new Setting(containerEl)
      .setName('Soft Edges')
      .setDesc('Enable a blur effect at fog boundaries for a softer, more atmospheric look')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.fogOfWarBlurEnabled)
        .onChange(async (value) => {
          this.plugin.settings.fogOfWarBlurEnabled = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display(); // Refresh to show/hide blur intensity slider
        }));
    
    // Blur Intensity Slider (only show when blur is enabled)
    if (this.plugin.settings.fogOfWarBlurEnabled) {
      const blurPercent = Math.round((this.plugin.settings.fogOfWarBlurFactor || 0.20) * 100);
      
      new Setting(containerEl)
        .setName('Blur Intensity')
        .setDesc(\`Size of blur effect as percentage of cell size (currently \${blurPercent}%)\`)
        .addSlider(slider => slider
          .setLimits(5, 50, 1)
          .setValue(blurPercent)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.fogOfWarBlurFactor = value / 100;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }))
        .addExtraButton(btn => btn
          .setIcon('rotate-ccw')
          .setTooltip('Reset to default (20%)')
          .onClick(async () => {
            this.plugin.settings.fogOfWarBlurFactor = 0.20;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
            this.display();
          }));
    }
  }

  // ---------------------------------------------------------------------------
  // Section: Map Behavior
  // ---------------------------------------------------------------------------
  
  renderMapBehaviorSettingsContent(containerEl) {
    // Expanded by Default
    new Setting(containerEl)
      .setName('Start Maps Expanded')
      .setDesc('When enabled, maps will start in expanded (fullscreen) mode by default')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.expandedByDefault)
        .onChange(async (value) => {
          this.plugin.settings.expandedByDefault = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }));

    // Always Show Controls
    new Setting(containerEl)
      .setName('Always Show Controls')
      .setDesc('Keep map controls visible at all times instead of auto-hiding')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.alwaysShowControls)
        .onChange(async (value) => {
          this.plugin.settings.alwaysShowControls = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }));

    // Canvas Height (Desktop)
    new Setting(containerEl)
      .setName('Canvas Height (Desktop)')
      .setDesc('Default height in pixels for map canvas on desktop devices')
      .addText(text => text
        .setPlaceholder('600')
        .setValue(String(this.plugin.settings.canvasHeight))
        .onChange(async (value) => {
          const num = parseInt(value);
          if (!isNaN(num)) {
            this.plugin.settings.canvasHeight = num;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }));

    // Canvas Height (Mobile)
    new Setting(containerEl)
      .setName('Canvas Height (Mobile/Touch)')
      .setDesc('Default height in pixels for map canvas on mobile and touch devices')
      .addText(text => text
        .setPlaceholder('400')
        .setValue(String(this.plugin.settings.canvasHeightMobile))
        .onChange(async (value) => {
          const num = parseInt(value);
          if (!isNaN(num)) {
            this.plugin.settings.canvasHeightMobile = num;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }));
  }

  // ---------------------------------------------------------------------------
  // Section: Distance Measurement
  // ---------------------------------------------------------------------------
  
  renderDistanceMeasurementSettingsContent(containerEl) {
    // Grid: Distance per cell
    new Setting(containerEl)
      .setName('Grid Map: Distance per Cell')
      .setDesc('Distance each cell represents on grid maps (default: 5 ft for D&D)')
      .addText(text => text
        .setPlaceholder('5')
        .setValue(String(this.plugin.settings.distancePerCellGrid))
        .onChange(async (value) => {
          const num = parseFloat(value);
          if (!isNaN(num) && num > 0) {
            this.plugin.settings.distancePerCellGrid = num;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }))
      .addDropdown(dropdown => dropdown
        .addOption('ft', 'feet')
        .addOption('m', 'meters')
        .addOption('mi', 'miles')
        .addOption('km', 'kilometers')
        .addOption('yd', 'yards')
        .setValue(this.plugin.settings.distanceUnitGrid)
        .onChange(async (value) => {
          this.plugin.settings.distanceUnitGrid = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }));

    // Hex: Distance per cell
    new Setting(containerEl)
      .setName('Hex Map: Distance per Hex')
      .setDesc('Distance each hex represents on hex maps (default: 6 miles for world maps)')
      .addText(text => text
        .setPlaceholder('6')
        .setValue(String(this.plugin.settings.distancePerCellHex))
        .onChange(async (value) => {
          const num = parseFloat(value);
          if (!isNaN(num) && num > 0) {
            this.plugin.settings.distancePerCellHex = num;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }))
      .addDropdown(dropdown => dropdown
        .addOption('mi', 'miles')
        .addOption('km', 'kilometers')
        .addOption('ft', 'feet')
        .addOption('m', 'meters')
        .addOption('yd', 'yards')
        .setValue(this.plugin.settings.distanceUnitHex)
        .onChange(async (value) => {
          this.plugin.settings.distanceUnitHex = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }));

    // Grid diagonal rule
    new Setting(containerEl)
      .setName('Grid Diagonal Movement')
      .setDesc('How to calculate diagonal distance on grid maps')
      .addDropdown(dropdown => dropdown
        .addOption('alternating', 'Alternating (5-10-5-10, D&D 5e)')
        .addOption('equal', 'Equal (Chebyshev, all moves = 1)')
        .addOption('euclidean', 'True Distance (Euclidean)')
        .setValue(this.plugin.settings.gridDiagonalRule)
        .onChange(async (value) => {
          this.plugin.settings.gridDiagonalRule = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }));

    // Display format
    new Setting(containerEl)
      .setName('Distance Display Format')
      .setDesc('How to display measured distances')
      .addDropdown(dropdown => dropdown
        .addOption('both', 'Cells and Units (e.g., "3 cells (15 ft)")')
        .addOption('cells', 'Cells Only (e.g., "3 cells")')
        .addOption('units', 'Units Only (e.g., "15 ft")')
        .setValue(this.plugin.settings.distanceDisplayFormat)
        .onChange(async (value) => {
          this.plugin.settings.distanceDisplayFormat = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }));
  }

  // ---------------------------------------------------------------------------
  // Section: Object Types
  // ---------------------------------------------------------------------------
  
  renderObjectTypesContent(containerEl) {
    containerEl.createEl('p', { 
      text: 'Customize map objects: modify built-in objects, create custom objects, or hide objects you don\\'t use.',
      cls: 'setting-item-description'
    });
    
    // Map Type selector dropdown
    new Setting(containerEl)
      .setName('Map Type')
      .setDesc('Select which map type to configure objects for')
      .addDropdown(dropdown => dropdown
        .addOption('grid', 'Grid Maps')
        .addOption('hex', 'Hex Maps')
        .setValue(this.selectedMapType)
        .onChange((value) => {
          this.selectedMapType = value;
          this.display();
        }));
    
    // Get settings for the selected map type
    const mapTypeSettings = this.getObjectSettingsForMapType();
    
    // Add Custom Object button
    new Setting(containerEl)
      .setName('Add Custom Object')
      .setDesc('Create a new map object with your own symbol')
      .addButton(btn => btn
        .setButtonText('+ Add Object')
        .setCta()
        .onClick(() => {
          new ObjectEditModal(this.app, this.plugin, null, async () => {
            this.settingsChanged = true;
            await this.plugin.saveSettings();
            this.display();
          }, this.selectedMapType).open();
        }));
    
    // Add Custom Category button
    new Setting(containerEl)
      .setName('Add Custom Category')
      .setDesc('Create a new category to organize objects')
      .addButton(btn => btn
        .setButtonText('+ Add Category')
        .onClick(() => {
          new CategoryEditModal(this.app, this.plugin, null, async () => {
            this.settingsChanged = true;
            await this.plugin.saveSettings();
            this.display();
          }, this.selectedMapType).open();
        }));
    
    // Import/Export buttons
    new Setting(containerEl)
      .setName('Import / Export')
      .setDesc('Share object configurations as JSON files')
      .addButton(btn => btn
        .setButtonText('Import')
        .onClick(() => {
          new ImportModal(this.app, this.plugin, async () => {
            this.settingsChanged = true;
            this.display();
          }, this.selectedMapType).open();
        }))
      .addButton(btn => btn
        .setButtonText('Export')
        .onClick(() => {
          new ExportModal(this.app, this.plugin, this.selectedMapType).open();
        }));
    
    // Get resolved data using helpers with map-type-specific settings
    const allCategories = ObjectHelpers.getCategories(mapTypeSettings);
    const allObjects = ObjectHelpers.getResolved(mapTypeSettings);
    const hiddenObjects = ObjectHelpers.getHidden(mapTypeSettings);
    
    // Check if there are any customizations for this map type
    const hasOverrides = Object.keys(mapTypeSettings.objectOverrides || {}).length > 0;
    const hasCustomObjects = (mapTypeSettings.customObjects || []).length > 0;
    const hasCustomCategories = (mapTypeSettings.customCategories || []).length > 0;
    const hasAnyCustomizations = hasOverrides || hasCustomObjects || hasCustomCategories;
    
    // Reset All button (only show if there are customizations)
    if (hasAnyCustomizations) {
      new Setting(containerEl)
        .setName('Reset All Customizations')
        .setDesc(\`Remove all custom objects, categories, and modifications for \${this.selectedMapType} maps\`)
        .addButton(btn => btn
          .setButtonText('Reset All')
          .setWarning()
          .onClick(async () => {
            const counts = [];
            if (hasOverrides) counts.push(\`\${Object.keys(mapTypeSettings.objectOverrides).length} modification(s)\`);
            if (hasCustomObjects) counts.push(\`\${mapTypeSettings.customObjects.length} custom object(s)\`);
            if (hasCustomCategories) counts.push(\`\${mapTypeSettings.customCategories.length} custom category(ies)\`);
            
            if (confirm(\`This will remove \${counts.join(', ')} for \${this.selectedMapType} maps. Maps using custom objects will show "?" placeholders.\\n\\nContinue?\`)) {
              this.updateObjectSettingsForMapType({
                objectOverrides: {},
                customObjects: [],
                customCategories: []
              });
              this.settingsChanged = true;
              await this.plugin.saveSettings();
              this.display();
            }
          }));
    }
    
    // Search/filter input
    const searchContainer = containerEl.createDiv({ cls: 'dmt-settings-search-container' });
    const searchInput = searchContainer.createEl('input', {
      type: 'text',
      cls: 'dmt-settings-search-input',
      attr: { placeholder: 'Filter objects...' },
      value: this.objectFilter || ''
    });
    searchInput.addEventListener('input', (e) => {
      this.objectFilter = e.target.value.toLowerCase().trim();
      this.renderObjectList(objectListContainer, allCategories, allObjects, hiddenObjects);
    });
    
    if (this.objectFilter) {
      const clearBtn = searchContainer.createEl('button', {
        cls: 'dmt-settings-search-clear',
        attr: { 'aria-label': 'Clear filter', title: 'Clear filter' }
      });
      IconHelpers.set(clearBtn, 'x');
      clearBtn.onclick = () => {
        this.objectFilter = '';
        searchInput.value = '';
        this.renderObjectList(objectListContainer, allCategories, allObjects, hiddenObjects);
      };
    }
    
    // Object list container (for filtered re-renders)
    const objectListContainer = containerEl.createDiv({ cls: 'dmt-settings-object-list-container' });
    this.renderObjectList(objectListContainer, allCategories, allObjects, hiddenObjects);
  }

  // ---------------------------------------------------------------------------
  // Object list rendering (called by renderObjectTypesSection)
  // ---------------------------------------------------------------------------
  
  renderObjectList(container, allCategories, allObjects, hiddenObjects) {
    container.empty();
    
    const filter = this.objectFilter || '';
    const isDraggable = !filter; // Disable drag when filtering
    
    // Filter objects if search term present
    const filteredObjects = filter
      ? allObjects.filter(obj => 
          obj.label.toLowerCase().includes(filter) || 
          (obj.symbol && obj.symbol.toLowerCase().includes(filter)) ||
          (obj.iconClass && obj.iconClass.toLowerCase().includes(filter)))
      : allObjects;
    
    const filteredHidden = filter
      ? hiddenObjects.filter(obj =>
          obj.label.toLowerCase().includes(filter) ||
          (obj.symbol && obj.symbol.toLowerCase().includes(filter)) ||
          (obj.iconClass && obj.iconClass.toLowerCase().includes(filter)))
      : hiddenObjects;
    
    // Show "no results" message if filter returns nothing
    if (filter && filteredObjects.length === 0 && filteredHidden.length === 0) {
      container.createDiv({ 
        cls: 'dmt-settings-no-results',
        text: \`No objects matching "\${filter}"\`
      });
      return;
    }
    
    // Render each category (skip 'notes' - note_pin is handled specially in the map UI)
    for (const category of allCategories) {
      if (category.id === 'notes') continue;
      
      let categoryObjects = filteredObjects.filter(obj => obj.category === category.id);
      if (categoryObjects.length === 0 && category.isBuiltIn) continue;
      if (categoryObjects.length === 0 && filter) continue;
      
      // Sort by order
      categoryObjects = categoryObjects.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      
      const categoryContainer = container.createDiv({ cls: 'dmt-settings-category' });
      
      // Category header with object count
      const categoryHeader = categoryContainer.createDiv({ cls: 'dmt-settings-category-header' });
      const labelText = category.label + (categoryObjects.length > 0 ? \` (\${categoryObjects.length})\` : '');
      categoryHeader.createSpan({ text: labelText, cls: 'dmt-settings-category-label' });
      
      // Edit/Delete for custom categories
      if (category.isCustom) {
        const categoryActions = categoryHeader.createDiv({ cls: 'dmt-settings-category-actions' });
        
        const editBtn = categoryActions.createEl('button', { cls: 'dmt-settings-icon-btn', attr: { 'aria-label': 'Edit category', title: 'Edit category' } });
        IconHelpers.set(editBtn, 'pencil');
        editBtn.onclick = () => {
          new CategoryEditModal(this.app, this.plugin, category, async () => {
            this.settingsChanged = true;
            await this.plugin.saveSettings();
            this.display();
          }).open();
        };
        
        // Get unfiltered count for delete validation
        const allCategoryObjects = allObjects.filter(obj => obj.category === category.id);
        const deleteBtn = categoryActions.createEl('button', { cls: 'dmt-settings-icon-btn dmt-settings-icon-btn-danger', attr: { 'aria-label': 'Delete category', title: 'Delete category' } });
        IconHelpers.set(deleteBtn, 'trash-2');
        deleteBtn.onclick = async () => {
          if (allCategoryObjects.length > 0) {
            alert(\`Cannot delete "\${category.label}" - it contains \${allCategoryObjects.length} object(s). Move or delete them first.\`);
            return;
          }
          if (confirm(\`Delete category "\${category.label}"?\`)) {
            const categoriesKey = this.selectedMapType === 'hex' ? 'customHexCategories' : 'customGridCategories';
            if (this.plugin.settings[categoriesKey]) {
              this.plugin.settings[categoriesKey] = this.plugin.settings[categoriesKey].filter(c => c.id !== category.id);
            }
            this.settingsChanged = true;
            await this.plugin.saveSettings();
            this.display();
          }
        };
      }
      
      // Object list with drag/drop support
      const objectList = categoryContainer.createDiv({ cls: 'dmt-settings-object-list' });
      objectList.dataset.categoryId = category.id;
      
      // Only enable drag/drop when not filtering
      if (!filter) {
        this.setupDragDropForList(objectList, category);
      }
      
      for (const obj of categoryObjects) {
        this.renderObjectRow(objectList, obj, false, !filter);
      }
    }
    
    // Hidden objects section
    if (filteredHidden.length > 0) {
      const hiddenContainer = container.createDiv({ cls: 'dmt-settings-hidden-section' });
      
      const hiddenHeader = new Setting(hiddenContainer)
        .setName(\`Hidden Objects (\${filteredHidden.length})\`)
        .setDesc('Built-in objects you\\'ve hidden from the palette');
      
      const hiddenList = hiddenContainer.createDiv({ cls: 'dmt-settings-object-list dmt-settings-hidden-list' });
      hiddenList.style.display = 'none';
      
      hiddenHeader.addButton(btn => btn
        .setButtonText('Show')
        .onClick(() => {
          const isVisible = hiddenList.style.display !== 'none';
          hiddenList.style.display = isVisible ? 'none' : 'block';
          btn.setButtonText(isVisible ? 'Show' : 'Hide');
        }));
      
      for (const obj of filteredHidden) {
        this.renderObjectRow(hiddenList, obj, true);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Drag/drop setup for object lists
  // ---------------------------------------------------------------------------
  
  setupDragDropForList(objectList, category) {
    objectList.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      
      const dragging = objectList.querySelector('.dmt-dragging');
      if (!dragging) return;
      
      const afterElement = DragHelpers.getAfterElement(objectList, e.clientY);
      if (afterElement == null) {
        objectList.appendChild(dragging);
      } else {
        objectList.insertBefore(dragging, afterElement);
      }
    });
    
    objectList.addEventListener('dragenter', (e) => {
      e.preventDefault();
    });
    
    objectList.addEventListener('drop', async (e) => {
      e.preventDefault();
      
      // Get the correct settings keys for the selected map type
      const overridesKey = this.selectedMapType === 'hex' ? 'hexObjectOverrides' : 'gridObjectOverrides';
      const customObjectsKey = this.selectedMapType === 'hex' ? 'customHexObjects' : 'customGridObjects';
      
      // Get new order from DOM positions
      const rows = [...objectList.querySelectorAll('.dmt-settings-object-row')];
      
      // Get default ID order for this category
      const defaultIdOrder = ObjectHelpers.getDefaultIdOrder(category.id, this.getObjectSettingsForMapType());
      
      // Apply new orders to settings
      rows.forEach((row, actualPosition) => {
        const id = row.dataset.objectId;
        const isBuiltIn = row.dataset.isBuiltIn === 'true';
        const newOrder = actualPosition * 10;
        
        if (isBuiltIn) {
          const defaultPosition = defaultIdOrder.indexOf(id);
          
          if (actualPosition === defaultPosition) {
            // In default position - remove order override if present
            if (this.plugin.settings[overridesKey]?.[id]) {
              delete this.plugin.settings[overridesKey][id].order;
              if (Object.keys(this.plugin.settings[overridesKey][id]).length === 0) {
                delete this.plugin.settings[overridesKey][id];
              }
            }
          } else {
            // Not in default position - save order override
            if (!this.plugin.settings[overridesKey]) {
              this.plugin.settings[overridesKey] = {};
            }
            if (!this.plugin.settings[overridesKey][id]) {
              this.plugin.settings[overridesKey][id] = {};
            }
            this.plugin.settings[overridesKey][id].order = newOrder;
          }
          
          // Update modified indicator in DOM immediately
          const labelEl = row.querySelector('.dmt-settings-object-label');
          if (labelEl) {
            const override = this.plugin.settings[overridesKey]?.[id];
            const hasAnyOverride = override && Object.keys(override).length > 0;
            labelEl.classList.toggle('dmt-settings-modified', !!hasAnyOverride);
          }
        } else {
          // Custom objects - always save order
          const customObjects = this.plugin.settings[customObjectsKey] || [];
          const customObj = customObjects.find(o => o.id === id);
          if (customObj) {
            customObj.order = newOrder;
          }
        }
      });
      
      this.settingsChanged = true;
      await this.plugin.saveSettings();
    });
  }

  // ---------------------------------------------------------------------------
  // Single object row rendering
  // ---------------------------------------------------------------------------
  
  renderObjectRow(container, obj, isHiddenSection = false, canDrag = false) {
    const row = container.createDiv({ cls: 'dmt-settings-object-row' });
    
    // Get the correct settings keys for the selected map type
    const overridesKey = this.selectedMapType === 'hex' ? 'hexObjectOverrides' : 'gridObjectOverrides';
    const customObjectsKey = this.selectedMapType === 'hex' ? 'customHexObjects' : 'customGridObjects';
    
    // Data attributes for drag/drop
    row.dataset.objectId = obj.id;
    row.dataset.isBuiltIn = String(!!obj.isBuiltIn);
    row.dataset.originalOrder = String(obj.order ?? 0);
    
    // Drag handle (only if draggable and not in hidden section)
    if (canDrag && !isHiddenSection) {
      row.setAttribute('draggable', 'true');
      row.classList.add('dmt-draggable');
      
      const dragHandle = row.createSpan({ cls: 'dmt-drag-handle' });
      IconHelpers.set(dragHandle, 'grip-vertical');
      
      row.style.userSelect = 'none';
      row.style.webkitUserSelect = 'none';
      
      row.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', obj.id);
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => {
          row.classList.add('dmt-dragging');
        }, 0);
      });
      
      row.addEventListener('dragend', (e) => {
        row.classList.remove('dmt-dragging');
      });
    }
    
    // Symbol or Icon
    const symbolEl = row.createSpan({ cls: 'dmt-settings-object-symbol' });
    if (obj.iconClass && RPGAwesomeHelpers.isValid(obj.iconClass)) {
      const iconInfo = RPGAwesomeHelpers.getInfo(obj.iconClass);
      const iconSpan = symbolEl.createEl('span', { cls: 'ra' });
      iconSpan.textContent = iconInfo.char;
    } else {
      symbolEl.textContent = obj.symbol || '?';
    }
    
    // Label
    const labelEl = row.createSpan({ text: obj.label, cls: 'dmt-settings-object-label' });
    if (obj.isModified) {
      labelEl.addClass('dmt-settings-modified');
    }
    
    // Actions
    const actions = row.createDiv({ cls: 'dmt-settings-object-actions' });
    
    // Edit button
    const editBtn = actions.createEl('button', { cls: 'dmt-settings-icon-btn', attr: { 'aria-label': 'Edit', title: 'Edit object' } });
    IconHelpers.set(editBtn, 'pencil');
    editBtn.onclick = () => {
      new ObjectEditModal(this.app, this.plugin, obj, async () => {
        this.settingsChanged = true;
        await this.plugin.saveSettings();
        this.display();
      }, this.selectedMapType).open();
    };
    
    if (obj.isBuiltIn) {
      if (isHiddenSection) {
        // Unhide button
        const unhideBtn = actions.createEl('button', { cls: 'dmt-settings-icon-btn', attr: { 'aria-label': 'Unhide', title: 'Show in palette' } });
        IconHelpers.set(unhideBtn, 'eye');
        unhideBtn.onclick = async () => {
          if (this.plugin.settings[overridesKey]?.[obj.id]) {
            delete this.plugin.settings[overridesKey][obj.id].hidden;
            if (Object.keys(this.plugin.settings[overridesKey][obj.id]).length === 0) {
              delete this.plugin.settings[overridesKey][obj.id];
            }
          }
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        };
      } else {
        // Hide button
        const hideBtn = actions.createEl('button', { cls: 'dmt-settings-icon-btn', attr: { 'aria-label': 'Hide', title: 'Hide from palette' } });
        IconHelpers.set(hideBtn, 'eye-off');
        hideBtn.onclick = async () => {
          if (!this.plugin.settings[overridesKey]) {
            this.plugin.settings[overridesKey] = {};
          }
          if (!this.plugin.settings[overridesKey][obj.id]) {
            this.plugin.settings[overridesKey][obj.id] = {};
          }
          this.plugin.settings[overridesKey][obj.id].hidden = true;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        };
      }
      
      // Reset button (only for modified)
      if (obj.isModified) {
        const resetBtn = actions.createEl('button', { cls: 'dmt-settings-icon-btn', attr: { 'aria-label': 'Reset to default', title: 'Reset to default' } });
        IconHelpers.set(resetBtn, 'rotate-ccw');
        resetBtn.onclick = async () => {
          if (confirm(\`Reset "\${obj.label}" to its default symbol and name?\`)) {
            if (this.plugin.settings[overridesKey]) {
              delete this.plugin.settings[overridesKey][obj.id];
            }
            this.settingsChanged = true;
            await this.plugin.saveSettings();
            this.display();
          }
        };
      }
    } else {
      // Delete button for custom objects
      const deleteBtn = actions.createEl('button', { cls: 'dmt-settings-icon-btn dmt-settings-icon-btn-danger', attr: { 'aria-label': 'Delete', title: 'Delete object' } });
      IconHelpers.set(deleteBtn, 'trash-2');
      deleteBtn.onclick = async () => {
        if (confirm(\`Delete "\${obj.label}"? Maps using this object will show a "?" placeholder.\`)) {
          if (this.plugin.settings[customObjectsKey]) {
            this.plugin.settings[customObjectsKey] = this.plugin.settings[customObjectsKey].filter(o => o.id !== obj.id);
          }
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Styles injection
  // ---------------------------------------------------------------------------
  
  injectStyles() {
    if (this.styleEl) {
      this.styleEl.remove();
    }
    
    this.styleEl = document.createElement('style');
    this.styleEl.textContent = DMT_SETTINGS_STYLES;
    document.head.appendChild(this.styleEl);
  }
  
  hide() {
    // Only dispatch event if settings were actually changed
    if (this.settingsChanged) {
      window.dispatchEvent(new CustomEvent('dmt-settings-changed', {
        detail: { timestamp: Date.now() }
      }));
      this.settingsChanged = false;
    }
    
    // Clean up injected styles
    if (this.styleEl) {
      this.styleEl.remove();
      this.styleEl = null;
    }
  }
}

module.exports = WindroseMDSettingsPlugin;`;
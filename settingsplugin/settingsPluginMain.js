// settingsPluginMain.js - Template for Windrose MapDesigner Settings Plugin
// Returns the plugin source as a string for templating by SettingsPluginInstaller
// This wrapper allows the file to be dc.require()'d without Datacore trying to execute it as an Obsidian plugin

return `// settingsPluginMain.js - Template for Windrose MapDesigner Settings Plugin
// This file is used by SettingsPluginInstaller to create the plugin
// Default color values are injected at install time from dmtConstants

// VERSION MARKER - Used to detect when upgrades are available
const PLUGIN_VERSION = '{{PLUGIN_VERSION}}';

const { Plugin, PluginSettingTab, Setting, Modal, setIcon } = require('obsidian');

// Built-in object types (mirror of objectTypes.js)
const BUILT_IN_OBJECTS = [
  { id: 'note_pin', symbol: '📌', label: 'Note Pin', category: 'notes' },
  { id: 'entrance', symbol: '⬤', label: 'Entrance/Exit', category: 'navigation' },
  { id: 'stairs-up', symbol: '▲', label: 'Stairs Up', category: 'navigation' },
  { id: 'stairs-down', symbol: '▼', label: 'Stairs Down', category: 'navigation' },
  { id: 'ladder', symbol: '☡', label: 'Ladder', category: 'navigation' },
  { id: 'door-vertical', symbol: '╫', label: 'Door (Vertical)', category: 'navigation' },
  { id: 'door-horizontal', symbol: '═', label: 'Door (Horizontal)', category: 'navigation' },
  { id: 'secret-door', symbol: '≡', label: 'Secret Door', category: 'navigation' },
  { id: 'portal', symbol: '⊛', label: 'Portal/Teleport', category: 'navigation' },
  { id: 'trap', symbol: '✱', label: 'Trap', category: 'hazards' },
  { id: 'hazard', symbol: '⚠', label: 'Hazard', category: 'hazards' },
  { id: 'pit', symbol: '◊', label: 'Pit', category: 'hazards' },
  { id: 'poison', symbol: '☠', label: 'Poison', category: 'hazards' },
  { id: 'chest', symbol: '🪎', label: 'Chest/Treasure', category: 'features' },
  { id: 'crate', symbol: '📦', label: 'Crate/Barrel', category: 'features' },
  { id: 'sack', symbol: '💰', label: 'Sack/Bag', category: 'features' },
  { id: 'altar', symbol: '⛧', label: 'Altar', category: 'features' },
  { id: 'coffin', symbol: '⚰', label: 'Coffin', category: 'features' },
  { id: 'statue', symbol: '♜', label: 'Statue', category: 'features' },
  { id: 'cage', symbol: '⛓', label: 'Chains/Cage', category: 'features' },
  { id: 'book', symbol: '🕮', label: 'Book/Shelf', category: 'features' },
  { id: 'table', symbol: '▭', label: 'Table', category: 'features' },
  { id: 'chair', symbol: '🪑', label: 'Chair', category: 'features' },
  { id: 'bed', symbol: '🛏', label: 'Bed', category: 'features' },
  { id: 'anvil', symbol: '⚒', label: 'Anvil/Forge', category: 'features' },
  { id: 'cauldron', symbol: '⚗', label: 'Cauldron', category: 'features' },
  { id: 'fountain', symbol: '⛲', label: 'Fountain', category: 'features' },
  { id: 'lever', symbol: '⚡', label: 'Lever/Switch', category: 'features' },
  { id: 'flower', symbol: '⚘', label: 'Flower', category: 'features' },
  { id: 'plant', symbol: '❊', label: 'Plant', category: 'features' },
  { id: 'tree-dec', symbol: '🌳', label: 'Tree', category: 'features' },
  { id: 'tree-ev', symbol: '🌲', label: 'Tree', category: 'features' },
  { id: 'tree-lfls', symbol: '🪾', label: 'Tree', category: 'features' },
  { id: 'monster', symbol: '♅', label: 'Monster/Enemy', category: 'encounters' },
  { id: 'boss', symbol: '♛', label: 'Boss', category: 'encounters' },
  { id: 'boss-alt', symbol: '💀', label: 'Boss (alt)', category: 'encounters' },
  { id: 'npc', symbol: '☺', label: 'NPC', category: 'encounters' },
  { id: 'npc-alt', symbol: '🧝', label: 'NPC', category: 'encounters' },
  { id: 'guard', symbol: '⚔', label: 'Guard', category: 'encounters' },
  { id: 'poi', symbol: '◉', label: 'Point of Interest', category: 'markers' },
  { id: 'flag', symbol: '⚑', label: 'Note/Flag', category: 'markers' }
];

const BUILT_IN_CATEGORIES = [
  { id: 'notes', label: 'Notes' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'hazards', label: 'Hazards' },
  { id: 'features', label: 'Features' },
  { id: 'encounters', label: 'Encounters' },
  { id: 'markers', label: 'Markers' }
];

const CATEGORY_ORDER = {
  'notes': 0,
  'navigation': 10,
  'hazards': 20,
  'features': 30,
  'encounters': 40,
  'markers': 50
};

// Quick symbols palette for object creation
const QUICK_SYMBOLS = [
  '★', '☆', '✦', '✧', '✪', '✫', '✯', '⚝',
  '●', '○', '◆', '◇', '■', '□', '▲', '△', '▼', '▽',
  '♠', '♤', '♣', '♧', '♥', '♡', '♦', '♢',
  '⚔', '⚒', '🗡', '🏹', '⚓', '⛏', '🔱',
  '☠', '⚠', '☢', '☣', '⚡', '🔥', '💧',
  '⚑', '⚐', '⛳', '🚩', '➤', '➜', '⬤',
  '⚙', '⚗', '🔮', '💎', '🗝', '📜', '🎭', '👁',
  '🏛', '🏰', '⛪', '🗿', '⚱', '🏺', '🪔'
];

// Object Edit Modal
class ObjectEditModal extends Modal {
  constructor(app, plugin, existingObject, onSave) {
    super(app);
    this.plugin = plugin;
    this.existingObject = existingObject;
    this.onSave = onSave;
    
    // Form state
    this.symbol = existingObject?.symbol || '';
    this.label = existingObject?.label || '';
    this.category = existingObject?.category || 'features';
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dmt-object-edit-modal');
    
    const isEditing = !!this.existingObject;
    const isBuiltIn = this.existingObject?.isBuiltIn;
    
    contentEl.createEl('h2', { text: isEditing ? 'Edit Object' : 'Create Custom Object' });
    
    // Symbol input
    const symbolSetting = new Setting(contentEl)
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
      this.updatePreview();
    });
    
    // Focus the symbol input after a short delay (allows modal to fully render)
    setTimeout(() => symbolInput.focus(), 50);
    
    // Symbol preview
    const previewEl = symbolSetting.controlEl.createDiv({ cls: 'dmt-symbol-preview' });
    previewEl.textContent = this.symbol || '?';
    this.previewEl = previewEl;
    
    // Quick symbols
    const quickSymbolsContainer = contentEl.createDiv({ cls: 'dmt-quick-symbols' });
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
        this.updatePreview();
      };
    }
    
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
    const allCategories = this.getAllCategories();
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
  
  updatePreview() {
    if (this.previewEl) {
      this.previewEl.textContent = this.symbol || '?';
    }
  }
  
  getAllCategories() {
    const { customCategories = [] } = this.plugin.settings;
    const builtIn = BUILT_IN_CATEGORIES.map(c => ({ ...c, isBuiltIn: true }));
    const custom = customCategories.map(c => ({ ...c, isCustom: true }));
    return [...builtIn, ...custom];
  }
  
  save() {
    // Validate
    if (!this.symbol || this.symbol.length === 0 || this.symbol.length > 8) {
      alert('Please enter a valid symbol (1-8 characters)');
      return;
    }
    if (!this.label || this.label.trim().length === 0) {
      alert('Please enter a label');
      return;
    }
    
    if (this.existingObject?.isBuiltIn) {
      // Modifying a built-in: save as override
      if (!this.plugin.settings.objectOverrides) {
        this.plugin.settings.objectOverrides = {};
      }
      
      const original = BUILT_IN_OBJECTS.find(o => o.id === this.existingObject.id);
      const override = {};
      
      if (this.symbol !== original.symbol) override.symbol = this.symbol;
      if (this.label !== original.label) override.label = this.label;
      if (this.category !== original.category) override.category = this.category;
      
      // Preserve hidden state if it exists
      if (this.plugin.settings.objectOverrides[this.existingObject.id]?.hidden) {
        override.hidden = true;
      }
      
      if (Object.keys(override).length > 0) {
        this.plugin.settings.objectOverrides[this.existingObject.id] = override;
      } else {
        delete this.plugin.settings.objectOverrides[this.existingObject.id];
      }
    } else if (this.existingObject?.isCustom) {
      // Editing existing custom object
      const idx = this.plugin.settings.customObjects.findIndex(o => o.id === this.existingObject.id);
      if (idx !== -1) {
        this.plugin.settings.customObjects[idx] = {
          ...this.plugin.settings.customObjects[idx],
          symbol: this.symbol,
          label: this.label.trim(),
          category: this.category
        };
      }
    } else {
      // Creating new custom object
      if (!this.plugin.settings.customObjects) {
        this.plugin.settings.customObjects = [];
      }
      
      const newObject = {
        id: 'custom-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        symbol: this.symbol,
        label: this.label.trim(),
        category: this.category
      };
      
      this.plugin.settings.customObjects.push(newObject);
    }
    
    this.onSave();
    this.close();
  }
  
  onClose() {
    this.contentEl.empty();
  }
}

// Category Edit Modal
class CategoryEditModal extends Modal {
  constructor(app, plugin, existingCategory, onSave) {
    super(app);
    this.plugin = plugin;
    this.existingCategory = existingCategory;
    this.onSave = onSave;
    
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
    
    if (!this.plugin.settings.customCategories) {
      this.plugin.settings.customCategories = [];
    }
    
    if (this.existingCategory) {
      const idx = this.plugin.settings.customCategories.findIndex(c => c.id === this.existingCategory.id);
      if (idx !== -1) {
        this.plugin.settings.customCategories[idx] = {
          ...this.plugin.settings.customCategories[idx],
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
      
      this.plugin.settings.customCategories.push(newCategory);
    }
    
    this.onSave();
    this.close();
  }
  
  onClose() {
    this.contentEl.empty();
  }
}

// Export Modal
class ExportModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dmt-export-modal');
    
    contentEl.createEl('h2', { text: 'Export Object Customizations' });
    
    const { objectOverrides = {}, customObjects = [], customCategories = [] } = this.plugin.settings;
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
        text: 'No customizations to export. Modify built-in objects or create custom ones first.',
        cls: 'dmt-export-empty'
      });
      return;
    }
    
    // Filename input
    const defaultFilename = \`windrose-objects-\${new Date().toISOString().split('T')[0]}.json\`;
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
            version: '1.0'
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

// Import Modal
class ImportModal extends Modal {
  constructor(app, plugin, onImport) {
    super(app);
    this.plugin = plugin;
    this.onImport = onImport;
    this.importData = null;
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dmt-import-modal');
    
    contentEl.createEl('h2', { text: 'Import Object Customizations' });
    
    // File input
    const fileContainer = contentEl.createDiv({ cls: 'dmt-import-file-container' });
    const fileInput = fileContainer.createEl('input', {
      type: 'file',
      attr: { accept: '.json' }
    });
    
    const previewContainer = contentEl.createDiv({ cls: 'dmt-import-preview' });
    previewContainer.style.display = 'none';
    
    const importOptionsContainer = contentEl.createDiv({ cls: 'dmt-import-options' });
    importOptionsContainer.style.display = 'none';
    
    let importMode = 'merge'; // 'merge' or 'replace'
    
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        // Validate it's our export format
        if (!data.windroseMD_objectExport) {
          previewContainer.innerHTML = '<p class="dmt-import-error">Invalid file: Not a Windrose MD object export.</p>';
          previewContainer.style.display = 'block';
          importOptionsContainer.style.display = 'none';
          this.importData = null;
          return;
        }
        
        this.importData = data;
        
        // Show preview
        const counts = [];
        if (data.objectOverrides) counts.push(\`\${Object.keys(data.objectOverrides).length} built-in modification(s)\`);
        if (data.customObjects) counts.push(\`\${data.customObjects.length} custom object(s)\`);
        if (data.customCategories) counts.push(\`\${data.customCategories.length} custom category(ies)\`);
        
        previewContainer.innerHTML = \`
          <p><strong>Found:</strong> \${counts.join(', ')}</p>
          <p class="dmt-import-date">Exported: \${new Date(data.exportedAt).toLocaleString()}</p>
        \`;
        previewContainer.style.display = 'block';
        importOptionsContainer.style.display = 'block';
        
      } catch (err) {
        previewContainer.innerHTML = \`<p class="dmt-import-error">Error reading file: \${err.message}</p>\`;
        previewContainer.style.display = 'block';
        importOptionsContainer.style.display = 'none';
        this.importData = null;
      }
    });
    
    // Import mode selection
    new Setting(importOptionsContainer)
      .setName('Import Mode')
      .setDesc('How to handle existing customizations')
      .addDropdown(dropdown => dropdown
        .addOption('merge', 'Merge (update matches, keep others)')
        .addOption('replace', 'Replace (remove all existing first)')
        .setValue(importMode)
        .onChange(v => { importMode = v; }));
    
    // Import button
    new Setting(importOptionsContainer)
      .addButton(btn => btn
        .setButtonText('Import')
        .setCta()
        .onClick(async () => {
          if (!this.importData) return;
          
          const data = this.importData;
          
          if (importMode === 'replace') {
            // Clear existing
            this.plugin.settings.objectOverrides = {};
            this.plugin.settings.customObjects = [];
            this.plugin.settings.customCategories = [];
          }
          
          // Import overrides
          if (data.objectOverrides) {
            if (!this.plugin.settings.objectOverrides) {
              this.plugin.settings.objectOverrides = {};
            }
            for (const [id, override] of Object.entries(data.objectOverrides)) {
              this.plugin.settings.objectOverrides[id] = override;
            }
          }
          
          // Import custom categories (merge by id)
          if (data.customCategories) {
            if (!this.plugin.settings.customCategories) {
              this.plugin.settings.customCategories = [];
            }
            for (const cat of data.customCategories) {
              const existingIdx = this.plugin.settings.customCategories.findIndex(c => c.id === cat.id);
              if (existingIdx !== -1) {
                this.plugin.settings.customCategories[existingIdx] = cat;
              } else {
                this.plugin.settings.customCategories.push(cat);
              }
            }
          }
          
          // Import custom objects (merge by id)
          if (data.customObjects) {
            if (!this.plugin.settings.customObjects) {
              this.plugin.settings.customObjects = [];
            }
            for (const obj of data.customObjects) {
              const existingIdx = this.plugin.settings.customObjects.findIndex(o => o.id === obj.id);
              if (existingIdx !== -1) {
                this.plugin.settings.customObjects[existingIdx] = obj;
              } else {
                this.plugin.settings.customObjects.push(obj);
              }
            }
          }
          
          await this.plugin.saveSettings();
          this.onImport();
          this.close();
        }));
  }
  
  onClose() {
    this.contentEl.empty();
  }
}

class WindroseMDSettingsPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new WindroseMDSettingsTab(this.app, this));
  }

  async loadSettings() {
    try {
      const data = await this.loadData();
      this.settings = Object.assign({}, {
        version: '{{PLUGIN_VERSION}}',
        hexOrientation: '{{DEFAULT_HEX_ORIENTATION}}',
        gridLineColor: '{{DEFAULT_GRID_LINE_COLOR}}',
        backgroundColor: '{{DEFAULT_BACKGROUND_COLOR}}',
        borderColor: '{{DEFAULT_BORDER_COLOR}}',
        coordinateKeyColor: '{{DEFAULT_COORDINATE_KEY_COLOR}}',
        coordinateTextColor: '{{DEFAULT_COORDINATE_TEXT_COLOR}}',
        coordinateTextShadow: '{{DEFAULT_COORDINATE_TEXT_SHADOW}}',
        coordinateKeyMode: 'hold', // 'hold' or 'toggle'
        expandedByDefault: false,
        // Object customization
        objectOverrides: {},    // { [builtInId]: { label?, symbol?, category?, hidden? } }
        customObjects: [],      // [{ id, symbol, label, category }]
        customCategories: []    // [{ id, label, order }]
      }, data || {});
    } catch (error) {
      console.warn('[DMT Settings] Error loading settings, using defaults:', error);
      // Use defaults if loading fails
      this.settings = {
        version: '{{PLUGIN_VERSION}}',
        hexOrientation: '{{DEFAULT_HEX_ORIENTATION}}',
        gridLineColor: '{{DEFAULT_GRID_LINE_COLOR}}',
        backgroundColor: '{{DEFAULT_BACKGROUND_COLOR}}',
        borderColor: '{{DEFAULT_BORDER_COLOR}}',
        coordinateKeyColor: '{{DEFAULT_COORDINATE_KEY_COLOR}}',
        coordinateTextColor: '{{DEFAULT_COORDINATE_TEXT_COLOR}}',
        coordinateTextShadow: '{{DEFAULT_COORDINATE_TEXT_SHADOW}}',
        coordinateKeyMode: 'hold', // 'hold' or 'toggle'
        expandedByDefault: false,
        // Object customization
        objectOverrides: {},
        customObjects: [],
        customCategories: []
      };
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class WindroseMDSettingsTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.settingsChanged = false; // Track if any settings were modified
    this.styleEl = null;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    
    // Inject styles for object settings UI
    this.injectStyles();

    new Setting(containerEl).setName("Hex Map Settings").setHeading();

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

    
    new Setting(containerEl).setName("Color Settings").setHeading();
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
      .setDesc('Color for hex coordinate labels (hex format: #RRGGBB)')
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


    new Setting(containerEl).setName("UI Preferences").setHeading();
    
    // Expanded by Default
    new Setting(containerEl)
      .setName('Expanded by Default')
      .setDesc('Start maps in expanded (full-width) mode')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.expandedByDefault)
        .onChange(async (value) => {
          this.plugin.settings.expandedByDefault = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }));

    // Object Types Section
    this.renderObjectTypesSection(containerEl);
  }
  
  renderObjectTypesSection(containerEl) {
    new Setting(containerEl).setName("Object Types").setHeading();
    
    containerEl.createEl('p', { 
      text: 'Customize map objects: modify built-in objects, create custom objects, or hide objects you don\\'t use.',
      cls: 'setting-item-description'
    });
    
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
          }).open();
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
          }).open();
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
          }).open();
        }))
      .addButton(btn => btn
        .setButtonText('Export')
        .onClick(() => {
          new ExportModal(this.app, this.plugin).open();
        }));
    
    // Get resolved objects and categories
    const allCategories = this.getResolvedCategories();
    const allObjects = this.getResolvedObjectTypes();
    const hiddenObjects = this.getHiddenObjects();
    
    // Check if there are any customizations
    const hasOverrides = Object.keys(this.plugin.settings.objectOverrides || {}).length > 0;
    const hasCustomObjects = (this.plugin.settings.customObjects || []).length > 0;
    const hasCustomCategories = (this.plugin.settings.customCategories || []).length > 0;
    const hasAnyCustomizations = hasOverrides || hasCustomObjects || hasCustomCategories;
    
    // Reset All button (only show if there are customizations)
    if (hasAnyCustomizations) {
      new Setting(containerEl)
        .setName('Reset All Customizations')
        .setDesc('Remove all custom objects, categories, and modifications to built-in objects')
        .addButton(btn => btn
          .setButtonText('Reset All')
          .setWarning()
          .onClick(async () => {
            const counts = [];
            if (hasOverrides) counts.push(\`\${Object.keys(this.plugin.settings.objectOverrides).length} modification(s)\`);
            if (hasCustomObjects) counts.push(\`\${this.plugin.settings.customObjects.length} custom object(s)\`);
            if (hasCustomCategories) counts.push(\`\${this.plugin.settings.customCategories.length} custom category(ies)\`);
            
            if (confirm(\`This will remove \${counts.join(', ')}. Maps using custom objects will show "?" placeholders.\\n\\nContinue?\`)) {
              this.plugin.settings.objectOverrides = {};
              this.plugin.settings.customObjects = [];
              this.plugin.settings.customCategories = [];
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
      this.setIcon(clearBtn, 'x');
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
  
  renderObjectList(container, allCategories, allObjects, hiddenObjects) {
    container.empty();
    
    const filter = this.objectFilter || '';
    const isDraggable = !filter; // Disable drag when filtering
    
    // Filter objects if search term present
    const filteredObjects = filter
      ? allObjects.filter(obj => 
          obj.label.toLowerCase().includes(filter) || 
          obj.symbol.toLowerCase().includes(filter))
      : allObjects;
    
    const filteredHidden = filter
      ? hiddenObjects.filter(obj =>
          obj.label.toLowerCase().includes(filter) ||
          obj.symbol.toLowerCase().includes(filter))
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
      // Also skip custom categories with no matching objects when filtering
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
        this.setIcon(editBtn, 'pencil');
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
        this.setIcon(deleteBtn, 'trash-2');
        deleteBtn.onclick = async () => {
          if (allCategoryObjects.length > 0) {
            alert(\`Cannot delete "\${category.label}" - it contains \${allCategoryObjects.length} object(s). Move or delete them first.\`);
            return;
          }
          if (confirm(\`Delete category "\${category.label}"?\`)) {
            this.plugin.settings.customCategories = this.plugin.settings.customCategories.filter(c => c.id !== category.id);
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
        objectList.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          
          const dragging = objectList.querySelector('.dmt-dragging');
          if (!dragging) {

            return;
          }
          
          const afterElement = this.getDragAfterElement(objectList, e.clientY);
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
          
          // Get new order from DOM positions
          const rows = [...objectList.querySelectorAll('.dmt-settings-object-row')];
          
          // Get default ID order for this category (from BUILT_IN_OBJECTS, excluding hidden)
          const { objectOverrides = {} } = this.plugin.settings;
          const categoryBuiltIns = BUILT_IN_OBJECTS
            .filter(o => o.category === category.id && !objectOverrides[o.id]?.hidden);
          const defaultIdOrder = categoryBuiltIns.map(o => o.id);
          
          
          // Apply new orders to settings - only save if position differs from default
          rows.forEach((row, actualPosition) => {
            const id = row.dataset.objectId;
            const isBuiltIn = row.dataset.isBuiltIn === 'true';
            const newOrder = actualPosition * 10;
            
            if (isBuiltIn) {
              // Find default position within this category
              const defaultPosition = defaultIdOrder.indexOf(id);
              
              if (actualPosition === defaultPosition) {
                // In default position - remove order override if present
                if (this.plugin.settings.objectOverrides[id]) {
                  delete this.plugin.settings.objectOverrides[id].order;
                  // Clean up empty override object
                  if (Object.keys(this.plugin.settings.objectOverrides[id]).length === 0) {
                    delete this.plugin.settings.objectOverrides[id];
                  }
                }
              } else {
                // Not in default position - save order override
                if (!this.plugin.settings.objectOverrides[id]) {
                  this.plugin.settings.objectOverrides[id] = {};
                }
                this.plugin.settings.objectOverrides[id].order = newOrder;
              }
              
              // Update modified indicator in DOM immediately
              const labelEl = row.querySelector('.dmt-settings-object-label');
              if (labelEl) {
                const override = this.plugin.settings.objectOverrides[id];
                const hasAnyOverride = override && Object.keys(override).length > 0;
                labelEl.classList.toggle('dmt-settings-modified', !!hasAnyOverride);
              }
            } else {
              // Custom objects - always save order
              const customObj = this.plugin.settings.customObjects.find(o => o.id === id);
              if (customObj) {
                customObj.order = newOrder;
              }
            }
          });
          
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        });
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
  
  renderObjectRow(container, obj, isHiddenSection = false, canDrag = false) {
    const row = container.createDiv({ cls: 'dmt-settings-object-row' });
    
    // Data attributes for drag/drop
    row.dataset.objectId = obj.id;
    row.dataset.isBuiltIn = String(!!obj.isBuiltIn);
    row.dataset.originalOrder = String(obj.order ?? 0);  // Store original order for comparison
    
    // Drag handle (only if draggable and not in hidden section)
    if (canDrag && !isHiddenSection) {
      // Use setAttribute for better cross-platform support
      row.setAttribute('draggable', 'true');
      row.classList.add('dmt-draggable');
      
      const dragHandle = row.createSpan({ cls: 'dmt-drag-handle' });
      this.setIcon(dragHandle, 'grip-vertical');
      
      // Prevent text selection interfering with drag
      row.style.userSelect = 'none';
      row.style.webkitUserSelect = 'none';
      
      row.addEventListener('dragstart', (e) => {

        // Required: set data for the drag operation
        e.dataTransfer.setData('text/plain', obj.id);
        e.dataTransfer.effectAllowed = 'move';
        
        // Use setTimeout to allow the drag image to be captured first
        setTimeout(() => {
          row.classList.add('dmt-dragging');
        }, 0);
      });
      
      row.addEventListener('dragend', (e) => {

        row.classList.remove('dmt-dragging');
      });
    }
    
    // Symbol
    row.createSpan({ text: obj.symbol, cls: 'dmt-settings-object-symbol' });
    
    // Label
    const labelEl = row.createSpan({ text: obj.label, cls: 'dmt-settings-object-label' });
    if (obj.isModified) {
      labelEl.addClass('dmt-settings-modified');
    }
    
    // Actions
    const actions = row.createDiv({ cls: 'dmt-settings-object-actions' });
    
    // Edit button
    const editBtn = actions.createEl('button', { cls: 'dmt-settings-icon-btn', attr: { 'aria-label': 'Edit', title: 'Edit object' } });
    this.setIcon(editBtn, 'pencil');
    editBtn.onclick = () => {
      new ObjectEditModal(this.app, this.plugin, obj, async () => {
        this.settingsChanged = true;
        await this.plugin.saveSettings();
        this.display();
      }).open();
    };
    
    if (obj.isBuiltIn) {
      if (isHiddenSection) {
        // Unhide button
        const unhideBtn = actions.createEl('button', { cls: 'dmt-settings-icon-btn', attr: { 'aria-label': 'Unhide', title: 'Show in palette' } });
        this.setIcon(unhideBtn, 'eye');
        unhideBtn.onclick = async () => {
          if (this.plugin.settings.objectOverrides[obj.id]) {
            delete this.plugin.settings.objectOverrides[obj.id].hidden;
            if (Object.keys(this.plugin.settings.objectOverrides[obj.id]).length === 0) {
              delete this.plugin.settings.objectOverrides[obj.id];
            }
          }
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        };
      } else {
        // Hide button
        const hideBtn = actions.createEl('button', { cls: 'dmt-settings-icon-btn', attr: { 'aria-label': 'Hide', title: 'Hide from palette' } });
        this.setIcon(hideBtn, 'eye-off');
        hideBtn.onclick = async () => {
          if (!this.plugin.settings.objectOverrides[obj.id]) {
            this.plugin.settings.objectOverrides[obj.id] = {};
          }
          this.plugin.settings.objectOverrides[obj.id].hidden = true;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        };
      }
      
      // Reset button (only for modified)
      if (obj.isModified) {
        const resetBtn = actions.createEl('button', { cls: 'dmt-settings-icon-btn', attr: { 'aria-label': 'Reset to default', title: 'Reset to default' } });
        this.setIcon(resetBtn, 'rotate-ccw');
        resetBtn.onclick = async () => {
          if (confirm(\`Reset "\${obj.label}" to its default symbol and name?\`)) {
            delete this.plugin.settings.objectOverrides[obj.id];
            this.settingsChanged = true;
            await this.plugin.saveSettings();
            this.display();
          }
        };
      }
    } else {
      // Delete button for custom objects
      const deleteBtn = actions.createEl('button', { cls: 'dmt-settings-icon-btn dmt-settings-icon-btn-danger', attr: { 'aria-label': 'Delete', title: 'Delete object' } });
      this.setIcon(deleteBtn, 'trash-2');
      deleteBtn.onclick = async () => {
        if (confirm(\`Delete "\${obj.label}"? Maps using this object will show a "?" placeholder.\`)) {
          this.plugin.settings.customObjects = this.plugin.settings.customObjects.filter(o => o.id !== obj.id);
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }
      };
    }
  }
  
  setIcon(el, iconId) {
    // Use Obsidian's setIcon if available, otherwise fallback
    if (typeof setIcon !== 'undefined') {
      setIcon(el, iconId);
    } else if (this.app.plugins) {
      // Fallback: create a simple text representation
      const icons = {
        'pencil': '✎',
        'eye': '👁',
        'eye-off': '🚫',
        'rotate-ccw': '↺',
        'trash-2': '🗑',
        'grip-vertical': '⋮⋮',
        'x': '✕'
      };
      el.textContent = icons[iconId] || '?';
    }
  }
  
  // Helper for drag and drop - finds element to insert before
  getDragAfterElement(container, y) {
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
  
  getResolvedObjectTypes() {
    const { objectOverrides = {}, customObjects = [] } = this.plugin.settings;
    
    const resolvedBuiltIns = BUILT_IN_OBJECTS
      .filter(obj => !objectOverrides[obj.id]?.hidden)
      .map((obj, index) => {
        const override = objectOverrides[obj.id];
        const defaultOrder = index * 10;
        if (override) {
          const { hidden, ...overrideProps } = override;
          return { ...obj, ...overrideProps, order: override.order ?? defaultOrder, isBuiltIn: true, isModified: true };
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
  }
  
  getResolvedCategories() {
    const { customCategories = [] } = this.plugin.settings;
    
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
  }
  
  getHiddenObjects() {
    const { objectOverrides = {} } = this.plugin.settings;
    return BUILT_IN_OBJECTS
      .filter(obj => objectOverrides[obj.id]?.hidden)
      .map(obj => ({ ...obj, isBuiltIn: true, isHidden: true }));
  }
  
  injectStyles() {
    // Remove existing style element if present
    if (this.styleEl) {
      this.styleEl.remove();
    }
    
    const css = \`
      /* Object Settings Styles */
      
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
      
      .dmt-settings-category {
        margin: 1em 0;
        border: 1px solid var(--background-modifier-border);
        border-radius: 8px;
        overflow: hidden;
      }
      
      .dmt-settings-category-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        background: var(--background-secondary);
        font-weight: 600;
      }
      
      .dmt-settings-category-actions {
        display: flex;
        gap: 4px;
      }
      
      .dmt-settings-object-list {
        padding: 4px;
      }
      
      .dmt-settings-object-row {
        display: flex;
        align-items: center;
        padding: 6px 8px;
        border-radius: 4px;
        gap: 8px;
      }
      
      .dmt-settings-object-row:hover {
        background: var(--background-modifier-hover);
      }
      
      /* Drag and Drop Styles */
      .dmt-draggable {
        cursor: grab;
      }
      
      .dmt-draggable:active {
        cursor: grabbing;
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
    \`;
    
    this.styleEl = document.createElement('style');
    this.styleEl.textContent = css;
    document.head.appendChild(this.styleEl);
  }
  
  hide() {
    // Only dispatch event if settings were actually changed
    if (this.settingsChanged) {
      window.dispatchEvent(new CustomEvent('dmt-settings-changed', {
        detail: { timestamp: Date.now() }
      }));
      this.settingsChanged = false; // Reset flag
    }
    
    // Clean up injected styles
    if (this.styleEl) {
      this.styleEl.remove();
      this.styleEl = null;
    }
  }
}

module.exports = WindroseMDSettingsPlugin;`;
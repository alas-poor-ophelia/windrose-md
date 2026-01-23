// settingsPluginMain.js - Template for Windrose MapDesigner Settings Plugin
// Returns the plugin source as a string for templating by SettingsPluginInstaller
// This wrapper allows the file to be dc.require()'d without Datacore trying to execute it as a standard script

return `// settingsPluginMain.js - Windrose MapDesigner Settings Plugin
// This file is generated from a template by SettingsPluginInstaller
// Default values are injected at install time from dmtConstants and objectTypes

/**
 * ============================================================================
 * TABLE OF CONTENTS
 * ============================================================================
 * 
 * Line ~30:    VERSION & IMPORTS
 * Line ~35:    DATA CONSTANTS (BUILT_IN_OBJECTS, CATEGORIES, QUICK_SYMBOLS)
 * Line ~67:    BUILT_IN_COLORS (color palette defaults)
 * Line ~76:    HELPER_NAMESPACES - Injected at assembly time
 * Line ~83:    MODAL_CLASSES - Injected at assembly time
 * Line ~85:    MAIN PLUGIN CLASS (WindroseMDSettingsPlugin)
 * Line ~450:   SETTINGS TAB CLASS (WindroseMDSettingsTab)
 *              - TAB_RENDER_METHODS - Injected at assembly time
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
// Injected from objectTypes.ts at install time - single source of truth
// =============================================================================

const BUILT_IN_OBJECTS = {{BUILT_IN_OBJECTS}};

const BUILT_IN_CATEGORIES = {{BUILT_IN_CATEGORIES}};

const CATEGORY_ORDER = {{CATEGORY_ORDER}};

// RPGAwesome icon data - injected from rpgAwesomeIcons.ts at install time
const RA_ICONS = {{RA_ICONS}};

const RA_CATEGORIES = {{RA_CATEGORIES}};

// Quick symbols palette - injected at install time
const QUICK_SYMBOLS = {{QUICK_SYMBOLS}};

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
// Injected at assembly time from settingsPlugin-*Helpers.js files
// =============================================================================

{{HELPER_NAMESPACES}}

// =============================================================================
// MODAL CLASSES
// Injected at assembly time from settingsPlugin-*Modal.js files
// =============================================================================

{{MODAL_CLASSES}}

class WindroseMDSettingsPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new WindroseMDSettingsTab(this.app, this));
    
    // Register command to insert a new map
    this.addCommand({
      id: 'insert-new-map',
      name: 'Insert new map',
      editorCallback: (editor, view) => {
        new InsertMapModal(this.app, (mapName, mapType) => {
          const mapId = 'map-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
          
          const codeBlock = [
            '\`\`\`datacorejsx',
            '',
            'const { View: DungeonMapTracker } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md.md"), "DungeonMapTracker"));',
            '',
            \`const mapId = "\${mapId}";\`,
            \`const mapName = "\${mapName}";\`,
            \`const mapType = "\${mapType}";\`,
            '',
            'return <DungeonMapTracker mapId={mapId} mapName={mapName} mapType={mapType} />;',
            '\`\`\`'
          ].join('\\n');
          
          editor.replaceSelection(codeBlock);
        }).open();
      }
    });
    
    // Register Obsidian protocol handler for deep links
    // Format: obsidian://windrose?notePath|mapId,x,y,zoom,layerId
    this.registerObsidianProtocolHandler('windrose', async (params) => {
      // The data comes as URL search params - we need to parse the raw query
      // params.action = 'windrose', and the rest is in the query string
      const rawQuery = Object.keys(params).find(key => key.includes('|'));
      if (!rawQuery) {
        console.error('[Windrose] Invalid deep link format');
        return;
      }

      const pipeIndex = rawQuery.indexOf('|');
      if (pipeIndex === -1) {
        console.error('[Windrose] Missing pipe separator in deep link');
        return;
      }

      const notePath = rawQuery.slice(0, pipeIndex);
      const coordData = rawQuery.slice(pipeIndex + 1);
      const parts = coordData.split(',');

      if (parts.length !== 5) {
        console.error('[Windrose] Invalid coordinate data in deep link');
        return;
      }

      const [mapId, x, y, zoom, layerId] = parts;

      try {
        // Remove .md extension if present for openLinkText
        const linkPath = notePath.replace(/\\.md$/, '');
        await this.app.workspace.openLinkText(linkPath, '', false);

        // Small delay to let the note render before navigating
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('dmt-navigate-to', {
            detail: {
              mapId,
              x: parseFloat(x),
              y: parseFloat(y),
              zoom: parseFloat(zoom),
              layerId,
              timestamp: Date.now()
            }
          }));
        }, 100);
      } catch (err) {
        console.error('[Windrose] Failed to open note:', err);
        new Notice('Failed to open map note');
      }
    });

    // Register command to generate a random dungeon
    this.addCommand({
      id: 'insert-random-dungeon',
      name: 'Generate random dungeon',
      editorCallback: async (editor, view) => {
        new InsertDungeonModal(this.app, this, async (mapName, cells, objects, options) => {
          const mapId = 'map-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
          await this.saveDungeonToJson(mapId, mapName, cells, objects, options);

          // Debug mode uses source entry point instead of compiled
          const debugFile = this.app.vault.getAbstractFileByPath('WINDROSE-DEBUG.json');
          const codeBlock = debugFile
            ? [
                '\`\`\`datacorejsx',
                'window.__dmtBasePath = "Projects/dungeon-map-tracker";',
                '',
                'const { DungeonMapTracker } = await dc.require(dc.resolvePath("DungeonMapTracker.tsx"));',
                '',
                \`const mapId = "\${mapId}";\`,
                \`const mapName = "\${mapName}";\`,
                'const mapType = "grid";',
                '',
                'return <DungeonMapTracker mapId={mapId} mapName={mapName} mapType={mapType} />;',
                '\`\`\`'
              ].join('\\n')
            : [
                '\`\`\`datacorejsx',
                '',
                'const { View: DungeonMapTracker } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md.md"), "DungeonMapTracker"));',
                '',
                \`const mapId = "\${mapId}";\`,
                \`const mapName = "\${mapName}";\`,
                'const mapType = "grid";',
                '',
                'return <DungeonMapTracker mapId={mapId} mapName={mapName} mapType={mapType} />;',
                '\`\`\`'
              ].join('\\n');

          editor.replaceSelection(codeBlock);
        }).open();
      }
    });
  }

  onunload() {}

  /**
   * Get the path to the Windrose data file.
   * Priority: 1) WINDROSE-DEBUG.json override, 2) Auto-discover by filename, 3) Default to vault root
   * @returns {Promise<string>} The resolved data file path
   */
  async getDataFilePath() {
    // 1. Check for debug override at vault root
    const debugFile = this.app.vault.getAbstractFileByPath('WINDROSE-DEBUG.json');
    if (debugFile) {
      try {
        const content = await this.app.vault.read(debugFile);
        const config = JSON.parse(content);
        if (config.dataFilePath) {
          console.log('[Windrose DEBUG] Using data file:', config.dataFilePath);
          return config.dataFilePath;
        }
      } catch (e) {
        console.warn('[Windrose] Failed to read WINDROSE-DEBUG.json:', e);
      }
    }
    
    // 2. Auto-discover by filename
    const allFiles = this.app.vault.getFiles();
    const dataFile = allFiles.find(f => f.name === 'windrose-md-data.json');
    if (dataFile) {
      return dataFile.path;
    }
    
    // 3. Default to vault root (file will be created if needed)
    return 'windrose-md-data.json';
  }

  /**
   * Load the dungeon generator module.
   * In debug mode (WINDROSE-DEBUG.json with dungeonGeneratorPath), loads from a .js file directly.
   * Otherwise, extracts from compiled-windrose-md.md.
   * @returns {Promise<Object>} The dungeon generator module exports
   */
  async loadDungeonGenerator() {
    // 1. Check for debug override
    const debugFile = this.app.vault.getAbstractFileByPath('WINDROSE-DEBUG.json');
    if (debugFile) {
      try {
        const debugContent = await this.app.vault.read(debugFile);
        const config = JSON.parse(debugContent);
        if (config.dungeonGeneratorPath) {
          console.log('[Windrose DEBUG] Loading generator from:', config.dungeonGeneratorPath);
          const generatorFile = this.app.vault.getAbstractFileByPath(config.dungeonGeneratorPath);
          if (!generatorFile) {
            throw new Error('Debug dungeonGeneratorPath not found: ' + config.dungeonGeneratorPath);
          }
          const code = await this.app.vault.read(generatorFile);
          const moduleFunc = new Function(code);
          return moduleFunc();
        }
      } catch (e) {
        console.warn('[Windrose] Debug generator load failed, falling back to compiled:', e.message);
      }
    }
    
    // 2. Production: Load from compiled markdown
    const allFiles = this.app.vault.getFiles();
    const compiledFile = allFiles.find(f => f.name === 'compiled-windrose-md.md');
    
    if (!compiledFile) {
      throw new Error(
        'Could not find compiled-windrose-md.md in your vault. ' +
        'Please ensure Windrose MapDesigner is properly installed.'
      );
    }
    
    // Read the file content
    const fileContent = await this.app.vault.read(compiledFile);
    
    // Extract the dungeonGenerator code block
    // Format: # dungeonGenerator\\n\\n\`\`\`js\\n...code...\\n\`\`\`
    const headerPattern = /^# dungeonGenerator\\s*\\n+\`\`\`(?:js|javascript)?\\n([\\s\\S]*?)\\n\`\`\`/m;
    const match = fileContent.match(headerPattern);
    
    if (!match) {
      throw new Error(
        'Could not find dungeonGenerator section in compiled-windrose-md.md. ' +
        'The file may be corrupted or from an incompatible version.'
      );
    }
    
    const code = match[1];
    
    // Execute the code to get exports
    // The module uses "return { ... }" pattern
    try {
      const moduleFunc = new Function(code);
      return moduleFunc();
    } catch (e) {
      throw new Error('Failed to load dungeon generator: ' + e.message);
    }
  }

  /**
   * Load the object placer module for dungeon stocking.
   * In debug mode (WINDROSE-DEBUG.json with objectPlacerPath), loads from a .js file directly.
   * Otherwise, extracts from compiled-windrose-md.md.
   * @returns {Promise<Object>} The object placer module exports
   */
  async loadObjectPlacer() {
    // 1. Check for debug override
    const debugFile = this.app.vault.getAbstractFileByPath('WINDROSE-DEBUG.json');
    if (debugFile) {
      try {
        const debugContent = await this.app.vault.read(debugFile);
        const config = JSON.parse(debugContent);
        if (config.objectPlacerPath) {
          console.log('[Windrose DEBUG] Loading objectPlacer from:', config.objectPlacerPath);
          const placerFile = this.app.vault.getAbstractFileByPath(config.objectPlacerPath);
          if (!placerFile) {
            throw new Error('Debug objectPlacerPath not found: ' + config.objectPlacerPath);
          }
          const code = await this.app.vault.read(placerFile);
          const moduleFunc = new Function(code);
          return moduleFunc();
        }
      } catch (e) {
        console.warn('[Windrose] Debug objectPlacer load failed, falling back to compiled:', e.message);
      }
    }

    // 2. Production: Load from compiled markdown
    const allFiles = this.app.vault.getFiles();
    const compiledFile = allFiles.find(f => f.name === 'compiled-windrose-md.md');

    if (!compiledFile) {
      throw new Error(
        'Could not find compiled-windrose-md.md in your vault. ' +
        'Please ensure Windrose MapDesigner is properly installed.'
      );
    }

    // Read the file content
    const fileContent = await this.app.vault.read(compiledFile);

    // Extract the objectPlacer code block
    const headerPattern = /^# objectPlacer\\s*\\n+\`\`\`(?:js|javascript)?\\n([\\s\\S]*?)\\n\`\`\`/m;
    const match = fileContent.match(headerPattern);

    if (!match) {
      throw new Error(
        'Could not find objectPlacer section in compiled-windrose-md.md. ' +
        'The file may be corrupted or from an incompatible version.'
      );
    }

    const code = match[1];

    // Execute the code to get exports
    try {
      const moduleFunc = new Function(code);
      return moduleFunc();
    } catch (e) {
      throw new Error('Failed to load object placer: ' + e.message);
    }
  }

  /**
   * Save a generated dungeon directly to the JSON data file
   */
  async saveDungeonToJson(mapId, mapName, cells, objects, options) {
    const SCHEMA_VERSION = 2;
    
    try {
      const dataFilePath = await this.getDataFilePath();
      let allData = { maps: {} };
      
      // Load existing data
      const file = this.app.vault.getAbstractFileByPath(dataFilePath);
      if (file) {
        const content = await this.app.vault.read(file);
        allData = JSON.parse(content);
      }
      
      if (!allData.maps) allData.maps = {};
      
      // Generate layer ID
      const layerId = 'layer-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      
      // Calculate viewport center from generated cells (in grid cell coordinates)
      let centerX = 5, centerY = 5;
      const gridSize = 32;
      if (cells.length > 0) {
        const minX = Math.min(...cells.map(c => c.x));
        const maxX = Math.max(...cells.map(c => c.x));
        const minY = Math.min(...cells.map(c => c.y));
        const maxY = Math.max(...cells.map(c => c.y));
        // Center is in grid cell coordinates, NOT pixels
        centerX = (minX + maxX) / 2;
        centerY = (minY + maxY) / 2;
      }
      
      // Create the map data structure
      const mapData = {
        name: mapName,
        description: "",
        mapType: "grid",
        northDirection: 0,
        customColors: [],
        sidebarCollapsed: false,
        expandedState: false,
        // Store generation settings for re-roll feature
        generationSettings: {
          preset: options.preset,
          configOverrides: options.configOverrides || {},
          distancePerCell: options.distancePerCell || 5,
          distanceUnit: options.distanceUnit || 'ft'
        },
        settings: {
          useGlobalSettings: false,
          overrides: {
            distancePerCellGrid: options.distancePerCell || 5,
            distanceUnitGrid: options.distanceUnit || 'ft'
          }
        },
        uiPreferences: {
          rememberPanZoom: true,
          rememberSidebarState: true,
          rememberExpandedState: false
        },
        lastTextLabelSettings: null,
        schemaVersion: SCHEMA_VERSION,
        activeLayerId: layerId,
        layerPanelVisible: false,
        layers: [{
          id: layerId,
          name: 'Layer 1',
          order: 0,
          visible: true,
          cells: cells,
          edges: [],
          objects: objects || [],
          textLabels: [],
          fogOfWar: null
        }],
        gridSize: gridSize,
        dimensions: { width: 300, height: 300 },
        viewState: {
          zoom: 1.5,
          center: { x: centerX, y: centerY }
        }
      };
      
      // Save to allData
      allData.maps[mapId] = mapData;
      
      // Write back to file
      const jsonString = JSON.stringify(allData, null, 2);
      if (file) {
        await this.app.vault.modify(file, jsonString);
      } else {
        // Create directory if needed
        const dirPath = dataFilePath.substring(0, dataFilePath.lastIndexOf('/'));
        try {
          await this.app.vault.createFolder(dirPath);
        } catch (e) {
          // Folder may already exist
        }
        await this.app.vault.create(dataFilePath, jsonString);
      }
      
    } catch (error) {
      console.error('[Windrose] Failed to save dungeon:', error);
      throw error;
    }
  }

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
    this.createCollapsibleSection(containerEl, 'Object Types', 
      (el) => this.renderObjectTypesContent(el),
      { open: openSections.has('Object Types') });
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
// TAB RENDER MIXINS
// Methods injected into WindroseMDSettingsTab prototype at assembly time
// =============================================================================

{{TAB_RENDER_METHODS}}

// Mix in the render methods to WindroseMDSettingsTab
Object.assign(WindroseMDSettingsTab.prototype, TabRenderCoreMethods);
Object.assign(WindroseMDSettingsTab.prototype, TabRenderSettingsMethods);
Object.assign(WindroseMDSettingsTab.prototype, TabRenderColorsMethods);
Object.assign(WindroseMDSettingsTab.prototype, TabRenderObjectsMethods);

module.exports = WindroseMDSettingsPlugin;`;
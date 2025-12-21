// settingsPluginAssembler.js
// Orchestrator for assembling the Windrose MapDesigner Settings Plugin
// 
// Phase 4: Assembles helpers and modals from separate files, CSS is external
//
// Usage:
//   const { assembleSettingsPlugin, getStylesCSS } = await dc.require(dc.resolvePath("settingsPluginAssembler.js"));
//   const pluginTemplate = assembleSettingsPlugin();
//   const stylesCSS = getStylesCSS();

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

// Load the base template
const BASE_TEMPLATE = await requireModuleByName("settingsPluginMain.js");

// Helper files to load (order doesn't matter - no dependencies between them)
const HELPER_FILES = [
  'settingsPlugin-ObjectHelpers.js',
  'settingsPlugin-ColorHelpers.js',
  'settingsPlugin-DragHelpers.js',
  'settingsPlugin-IconHelpers.js',
  'settingsPlugin-RPGAwesomeHelpers.js'
];

// Modal files to load (order doesn't matter - each is self-contained)
const MODAL_FILES = [
  'settingsPlugin-InsertMapModal.js',
  'settingsPlugin-InsertDungeonModal.js',
  'settingsPlugin-ObjectEditModal.js',
  'settingsPlugin-CategoryEditModal.js',
  'settingsPlugin-ColorEditModal.js',
  'settingsPlugin-ExportModal.js',
  'settingsPlugin-ImportModal.js'
];

// Tab render method files (order matters - they're class methods)
const TAB_RENDER_FILES = [
  'settingsPlugin-TabRenderCore.js',
  'settingsPlugin-TabRenderSettings.js',
  'settingsPlugin-TabRenderColors.js',
  'settingsPlugin-TabRenderObjects.js'
];

// Track missing files for error reporting
const missingFiles = [];

/**
 * Load a source file and strip header comments
 * @param {string} filename - File name to load
 * @returns {Promise<string>} File content with headers stripped
 */
async function loadSourceFile(filename) {
  try {
    const files = dc.app.vault.getFiles();
    const file = files.find(f => f.path.endsWith(filename));
    if (file) {
      const content = await dc.app.vault.read(file);
      // Strip the header comments (lines starting with //)
      const lines = content.split('\n');
      let startLine = 0;
      for (let i = 0; i < lines.length; i++) {
        if (!lines[i].startsWith('//') && lines[i].trim() !== '') {
          startLine = i;
          break;
        }
      }
      console.log(`[settingsPluginAssembler] Loaded ${filename} (${lines.length} lines)`);
      return lines.slice(startLine).join('\n');
    }
    console.error(`[settingsPluginAssembler] MISSING FILE: ${filename}`);
    missingFiles.push(filename);
    return '';
  } catch (e) {
    console.error(`[settingsPluginAssembler] Error loading ${filename}:`, e);
    missingFiles.push(filename);
    return '';
  }
}

/**
 * Load multiple source files and concatenate
 * @param {string[]} filenames - Array of filenames
 * @returns {Promise<string>} Concatenated content
 */
async function loadAndConcatenate(filenames) {
  let result = '';
  for (const filename of filenames) {
    const content = await loadSourceFile(filename);
    if (content) {
      result += content + '\n\n';
    }
  }
  return result.trim();
}

// Load all source files
const HELPERS_CONTENT = await loadAndConcatenate(HELPER_FILES);
const MODALS_CONTENT = await loadAndConcatenate(MODAL_FILES);
const TAB_RENDER_CONTENT = await loadAndConcatenate(TAB_RENDER_FILES);

console.log(`[settingsPluginAssembler] Helpers content length: ${HELPERS_CONTENT.length}`);
console.log(`[settingsPluginAssembler] Modals content length: ${MODALS_CONTENT.length}`);
console.log(`[settingsPluginAssembler] Tab render content length: ${TAB_RENDER_CONTENT.length}`);

// Check for missing files and warn
if (missingFiles.length > 0) {
  console.error(`[settingsPluginAssembler] CRITICAL: ${missingFiles.length} source files missing!`);
  console.error(`[settingsPluginAssembler] Missing: ${missingFiles.join(', ')}`);
  console.error(`[settingsPluginAssembler] The plugin will NOT work correctly.`);
  console.error(`[settingsPluginAssembler] Please ensure all settingsPlugin-*.js files are in your vault.`);
}

// Load the CSS file content
let STYLES_CSS_CONTENT = '';
try {
  const files = dc.app.vault.getFiles();
  const cssFile = files.find(f => f.path.endsWith('settingsPlugin-styles.css'));
  
  if (cssFile) {
    STYLES_CSS_CONTENT = await dc.app.vault.read(cssFile);
    console.log('[settingsPluginAssembler] Loaded CSS file:', cssFile.path);
  } else {
    console.warn('[settingsPluginAssembler] CSS file not found in vault');
  }
} catch (e) {
  console.warn('[settingsPluginAssembler] Could not load CSS file:', e);
}

/**
 * Get the CSS content for the settings plugin
 * @returns {string} CSS content to write to styles.css
 */
function getStylesCSS() {
  return STYLES_CSS_CONTENT;
}

/**
 * Assemble the settings plugin JavaScript
 * 
 * Phase 4: Injects helpers and modals from separate files
 *          CSS is loaded by Obsidian from styles.css only
 * 
 * @returns {string} The plugin template string (with {{PLACEHOLDER}} markers)
 */
function assembleSettingsPlugin() {
  // Validate that we have content to inject
  if (!HELPERS_CONTENT) {
    throw new Error('[settingsPluginAssembler] HELPERS_CONTENT is empty! Missing helper files: ' + 
      HELPER_FILES.join(', '));
  }
  if (!MODALS_CONTENT) {
    throw new Error('[settingsPluginAssembler] MODALS_CONTENT is empty! Missing modal files: ' + 
      MODAL_FILES.join(', '));
  }
  if (!TAB_RENDER_CONTENT) {
    throw new Error('[settingsPluginAssembler] TAB_RENDER_CONTENT is empty! Missing tab render files: ' + 
      TAB_RENDER_FILES.join(', '));
  }
  
  // Use function replacer to avoid $ pattern interpretation in replacement strings
  // (template literals like ${var} in the source files would otherwise cause issues)
  let result = BASE_TEMPLATE
    .replace(/\{\{HELPER_NAMESPACES\}\}/g, () => HELPERS_CONTENT)
    .replace(/\{\{MODAL_CLASSES\}\}/g, () => MODALS_CONTENT)
    .replace(/\{\{TAB_RENDER_METHODS\}\}/g, () => TAB_RENDER_CONTENT);
  
  // Verify placeholders were replaced
  if (result.includes('{{HELPER_NAMESPACES}}')) {
    throw new Error('[settingsPluginAssembler] Failed to replace {{HELPER_NAMESPACES}} placeholder!');
  }
  if (result.includes('{{MODAL_CLASSES}}')) {
    throw new Error('[settingsPluginAssembler] Failed to replace {{MODAL_CLASSES}} placeholder!');
  }
  if (result.includes('{{TAB_RENDER_METHODS}}')) {
    throw new Error('[settingsPluginAssembler] Failed to replace {{TAB_RENDER_METHODS}} placeholder!');
  }
  
  console.log(`[settingsPluginAssembler] Assembly complete. Output: ${result.length} chars`);
  return result;
}

// Export the assembler functions
return {
  assembleSettingsPlugin,
  getStylesCSS,
  // Export for debugging/version checking
  ASSEMBLER_VERSION: '1.4.0-phase5',
  // Flags for assembly mode
  CSS_MODE: 'external-only',
  HELPERS_MODE: 'assembled',
  MODALS_MODE: 'assembled',
  TAB_RENDER_MODE: 'assembled',
  // Export for diagnostics
  missingFiles
};
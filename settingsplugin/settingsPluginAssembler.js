// settingsPluginAssembler.js
// Assembles the Windrose MapDesigner Settings Plugin from component files

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

// Load all component files directly
const BASE_TEMPLATE = await requireModuleByName("settingsPluginMain.js");

const ObjectHelpers = await requireModuleByName("settingsPlugin-ObjectHelpers.js");
const ColorHelpers = await requireModuleByName("settingsPlugin-ColorHelpers.js");
const DragHelpers = await requireModuleByName("settingsPlugin-DragHelpers.js");
const IconHelpers = await requireModuleByName("settingsPlugin-IconHelpers.js");
const RPGAwesomeHelpers = await requireModuleByName("settingsPlugin-RPGAwesomeHelpers.js");
const DungeonEssenceVisualizer = await requireModuleByName("settingsPlugin-DungeonEssenceVisualizer.js");
const ObjectSetHelpers = await requireModuleByName("settingsPlugin-ObjectSetHelpers.js");

const InsertMapModal = await requireModuleByName("settingsPlugin-InsertMapModal.js");
const InsertDungeonModal = await requireModuleByName("settingsPlugin-InsertDungeonModal.js");
const ObjectEditModal = await requireModuleByName("settingsPlugin-ObjectEditModal.js");
const CategoryEditModal = await requireModuleByName("settingsPlugin-CategoryEditModal.js");
const ColorEditModal = await requireModuleByName("settingsPlugin-ColorEditModal.js");
const ExportModal = await requireModuleByName("settingsPlugin-ExportModal.js");
const ImportModal = await requireModuleByName("settingsPlugin-ImportModal.js");
const ObjectSetRenameModal = await requireModuleByName("settingsPlugin-ObjectSetRenameModal.js");
const ObjectSetExportModal = await requireModuleByName("settingsPlugin-ObjectSetExportModal.js");
const ObjectSetImportModal = await requireModuleByName("settingsPlugin-ObjectSetImportModal.js");

const TabRenderCore = await requireModuleByName("settingsPlugin-TabRenderCore.js");
const TabRenderSettings = await requireModuleByName("settingsPlugin-TabRenderSettings.js");
const TabRenderColors = await requireModuleByName("settingsPlugin-TabRenderColors.js");
const TabRenderObjects = await requireModuleByName("settingsPlugin-TabRenderObjects.js");

const STYLES_CSS = await requireModuleByName("settingsPlugin-styles.js");

// Concatenate content
const HELPERS_CONTENT = [
  ObjectHelpers, ColorHelpers, DragHelpers, IconHelpers, RPGAwesomeHelpers, DungeonEssenceVisualizer, ObjectSetHelpers
].join('\n\n');

const MODALS_CONTENT = [
  InsertMapModal, InsertDungeonModal, ObjectEditModal, CategoryEditModal, ColorEditModal, ExportModal, ImportModal, ObjectSetRenameModal, ObjectSetExportModal, ObjectSetImportModal
].join('\n\n');

const TAB_RENDER_CONTENT = [
  TabRenderCore, TabRenderSettings, TabRenderColors, TabRenderObjects
].join('\n\n');

// Assembly function
function assembleSettingsPlugin() {
  return BASE_TEMPLATE
    .replace(/\{\{HELPER_NAMESPACES\}\}/g, () => HELPERS_CONTENT)
    .replace(/\{\{MODAL_CLASSES\}\}/g, () => MODALS_CONTENT)
    .replace(/\{\{TAB_RENDER_METHODS\}\}/g, () => TAB_RENDER_CONTENT);
}

function getStylesCSS() {
  return STYLES_CSS;
}

return {
  assembleSettingsPlugin,
  getStylesCSS,
  ASSEMBLER_VERSION: '2.0.0'
};
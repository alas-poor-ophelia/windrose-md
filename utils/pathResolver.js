// utils/pathResolver.js - Path resolution utilities

/**
 * Get the base path from global storage
 * @returns {string} The base path for imports
 * @throws {Error} If not set
 */
function getBasePath() {
  if (!window.__dmtBasePath) {
    throw new Error("Dungeon Map Tracker base path not initialized. Ensure the datacorejsx block sets window.__dmtBasePath.");
  }
  return window.__dmtBasePath;
}

/**
 * Get the JSON data file path
 * @returns {string} The path for the JSON data file
 */
function getJsonPath() {
  const basePath = getBasePath();
  
  //DEPRECATING GARDEN PATH. EXISTING NOTES AND GARDENS SHOULD NOW USE COMPILED SCRIPT.
  // if (basePath.startsWith("Garden/")) {
  //   return "Garden/90 - Data/12 - Meta/JSON/dungeon-maps-data.json";
  // } else {
    return "Garden/90 - Data/12 - Meta/JSON/dungeon-maps-data.json";
  // }
}

/**
 * Helper function to require a module using the resolved base path
 * @param {string} relativePath - Path relative to the base path (e.g., "hooks/useMapData.js")
 * @returns {Promise} The required module
 */
async function requireModule(relativePath) {
  const basePath = getBasePath();
  const fullPath = `${basePath}/${relativePath}`;
  return await dc.require(fullPath);
}

/**
 * Resolve a module path using dc.resolvePath (filename-based)
 * @param {string} fileName - Filename with extension (e.g., "useMapData.js")
 * @returns {Promise} The required module
 * @throws {Error} If resolution fails
 */
async function requireModuleByName(fileName) {
  const resolvedPath = dc.resolvePath(fileName);
  
  // Check if resolution failed (returns input unchanged when not found)
  if (resolvedPath === fileName) {
    throw new Error(`Failed to resolve module: "${fileName}". File not found or name is not unique.`);
  }
  
  return await dc.require(resolvedPath);
}

return { getBasePath, getJsonPath, requireModule, requireModuleByName };
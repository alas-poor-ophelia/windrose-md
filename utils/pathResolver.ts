/**
 * pathResolver.ts - Path resolution utilities
 *
 * Core module for resolving and requiring other modules in the Datacore environment.
 */

declare global {
  interface Window {
    __dmtBasePath?: string;
  }
}

/**
 * Get the base path from global storage
 * @throws Error if not set
 */
function getBasePath(): string {
  if (!window.__dmtBasePath) {
    throw new Error("Dungeon Map Tracker base path not initialized. Ensure the datacorejsx block sets window.__dmtBasePath.");
  }
  return window.__dmtBasePath;
}

// Default dev path
const DEFAULT_DATA_PATH = "Garden/90 - Data/12 - Meta/JSON/dungeon-maps-data.json";

// Resolve data file path at module load time
// Priority: 1) WINDROSE-DEBUG.json override, 2) Hardcoded dev default
let resolvedDataPath: string = DEFAULT_DATA_PATH;

try {
  const debugFile = app.vault.getAbstractFileByPath('WINDROSE-DEBUG.json');
  if (debugFile) {
    const content = await app.vault.read(debugFile);
    const config = JSON.parse(content);
    if (config.dataFilePath) {
      resolvedDataPath = config.dataFilePath;
    }
  }
} catch (e) {
  console.warn('[pathResolver] Failed to load WINDROSE-DEBUG.json:', (e as Error).message);
}

/**
 * Get the JSON data file path.
 * Returns the resolved path from WINDROSE-DEBUG.json or the default.
 */
function getJsonPath(): string {
  // Validate base path is initialized
  getBasePath();
  return resolvedDataPath;
}

/**
 * Helper function to require a module using the resolved base path
 * @param relativePath - Path relative to the base path (e.g., "hooks/useMapData.ts")
 */
async function requireModule<T = unknown>(relativePath: string): Promise<T> {
  const basePath = getBasePath();
  const fullPath = `${basePath}/${relativePath}`;
  return await dc.require(fullPath) as T;
}

/**
 * Resolve a module path using dc.resolvePath (filename-based)
 * @param fileName - Filename with extension (e.g., "useMapData.ts")
 * @throws Error if resolution fails
 */
async function requireModuleByName<T = unknown>(fileName: string): Promise<T> {
  const resolvedPath = dc.resolvePath(fileName);

  // Check if resolution failed (returns input unchanged when not found)
  if (resolvedPath === fileName) {
    throw new Error(`Failed to resolve module: "${fileName}". File not found or name is not unique.`);
  }

  return await dc.require(resolvedPath) as T;
}

return { getBasePath, getJsonPath, requireModule, requireModuleByName };

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

/**
 * Build an index of all markdown notes in the vault
 * Returns array of note paths suitable for autocomplete
 * @returns {Promise<Array<string>>} Array of vault-relative note paths
 */
async function buildNoteIndex() {
  try {
    const markdownFiles = app.vault.getMarkdownFiles();
    
    // Return array of paths without the .md extension for cleaner display
    // Store full path for actual linking
    return markdownFiles.map(file => ({
      path: file.path,           // Full path with .md
      displayName: file.basename // Name without extension
    }));
  } catch (error) {
    console.error('[buildNoteIndex] Error indexing vault notes:', error);
    return [];
  }
}

/**
 * Get note suggestions for autocomplete
 * Returns array of display names only
 * @returns {Promise<Array<string>>} Array of note display names
 */
async function getNoteDisplayNames() {
  const index = await buildNoteIndex();
  return index.map(note => note.displayName);
}

/**
 * Get full note path from display name
 * @param {string} displayName - Note name without extension
 * @returns {Promise<string|null>} Full vault path or null if not found
 */
async function getFullPathFromDisplayName(displayName) {
  const index = await buildNoteIndex();
  const match = index.find(note => note.displayName === displayName);
  return match ? match.path : null;
}

/**
 * Get display name from full path
 * @param {string} fullPath - Full vault path with .md extension
 * @returns {string} Display name without extension
 */
function getDisplayNameFromPath(fullPath) {
  if (!fullPath) return '';
  // Remove .md extension and get just the filename
  return fullPath.replace(/\.md$/, '').split('/').pop();
}

/**
 * Open a note in a new tab using Obsidian API
 * @param {string} notePath - Vault-relative note path
 * @returns {Promise<boolean>} True if successful
 */
async function openNoteInNewTab(notePath) {
  if (!notePath) {
    console.warn('[openNoteInNewTab] No note path provided');
    return false;
  }
  
  try {
    // Open in new tab (third parameter true = new leaf)
    // Second parameter empty string means no source file for relative links
    await app.workspace.openLinkText(notePath.replace(/\.md$/, ''), '', true);
    return true;
  } catch (error) {
    console.error('[openNoteInNewTab] Error opening note:', error);
    return false;
  }
}

/**
 * Validate that a note path exists in the vault
 * @param {string} notePath - Vault-relative note path
 * @returns {Promise<boolean>} True if note exists
 */
async function isValidNotePath(notePath) {
  if (!notePath) return false;
  
  try {
    const file = app.vault.getAbstractFileByPath(notePath);
    return file !== null && file !== undefined;
  } catch (error) {
    console.error('[isValidNotePath] Error validating path:', error);
    return false;
  }
}

/**
 * Format a note path for display (remove .md, show just basename)
 * @param {string} notePath - Full vault path
 * @returns {string} Formatted display name
 */
function formatNoteForDisplay(notePath) {
  if (!notePath) return '';
  return getDisplayNameFromPath(notePath);
}

return {
  buildNoteIndex,
  getNoteDisplayNames,
  getFullPathFromDisplayName,
  getDisplayNameFromPath,
  openNoteInNewTab,
  isValidNotePath,
  formatNoteForDisplay
};
/**
 * noteOperations.ts
 * 
 * Operations for managing note links and vault note indexing.
 * Interfaces with Obsidian's vault API for note discovery and navigation.
 */

// Type-only imports
import type { NoteIndexEntry } from '#types/objects/note.types';
import type { TFile, TAbstractFile, App } from 'obsidian';

// Global app reference from Obsidian
declare const app: App;

// ===========================================
// Note Index Functions
// ===========================================

/**
 * Build an index of all markdown notes in the vault.
 * Returns array of note paths suitable for autocomplete.
 */
async function buildNoteIndex(): Promise<NoteIndexEntry[]> {
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
 * Get note suggestions for autocomplete.
 * Returns array of display names only.
 */
async function getNoteDisplayNames(): Promise<string[]> {
  const index = await buildNoteIndex();
  return index.map(note => note.displayName);
}

/**
 * Get full note path from display name.
 */
async function getFullPathFromDisplayName(displayName: string): Promise<string | null> {
  const index = await buildNoteIndex();
  const match = index.find(note => note.displayName === displayName);
  return match ? match.path : null;
}

/**
 * Get display name from full path.
 */
function getDisplayNameFromPath(fullPath: string | null | undefined): string {
  if (!fullPath) return '';
  // Remove .md extension and get just the filename
  return fullPath.replace(/\.md$/, '').split('/').pop() || '';
}

// ===========================================
// Note Navigation
// ===========================================

/**
 * Open a note in a new tab using Obsidian API.
 */
async function openNoteInNewTab(notePath: string | null | undefined): Promise<boolean> {
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

// ===========================================
// Validation
// ===========================================

/**
 * Validate that a note path exists in the vault.
 */
async function isValidNotePath(notePath: string | null | undefined): Promise<boolean> {
  if (!notePath) return false;
  
  try {
    const file = app.vault.getAbstractFileByPath(notePath);
    return file !== null && file !== undefined;
  } catch (error) {
    console.error('[isValidNotePath] Error validating path:', error);
    return false;
  }
}

// ===========================================
// Formatting
// ===========================================

/**
 * Format a note path for display (remove .md, show just basename).
 */
function formatNoteForDisplay(notePath: string | null | undefined): string {
  if (!notePath) return '';
  return getDisplayNameFromPath(notePath);
}

// ===========================================
// Exports
// ===========================================

return {
  buildNoteIndex,
  getNoteDisplayNames,
  getFullPathFromDisplayName,
  getDisplayNameFromPath,
  openNoteInNewTab,
  isValidNotePath,
  formatNoteForDisplay
};
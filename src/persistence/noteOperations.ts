/**
 * noteOperations.ts
 * 
 * Operations for managing note links and vault note indexing.
 * Interfaces with Obsidian's vault API for note discovery and navigation.
 */

// Type-only imports
import type { NoteIndexEntry } from '#types/objects/note.types';
import type { App } from 'obsidian';

import { getApp } from '../core/settingsAccessor';


// ===========================================
// Note Index Functions
// ===========================================

/**
 * Build an index of all markdown notes in the vault.
 * Returns array of note paths suitable for autocomplete.
 */
async function buildNoteIndex(app: App): Promise<NoteIndexEntry[]> {
  try {
    const markdownFiles = app.vault.getMarkdownFiles();

    const entries: NoteIndexEntry[] = markdownFiles.map(file => ({
      path: file.path,
      displayName: file.basename
    }));

    const nameCounts = new Map<string, number>();
    for (const entry of entries) {
      nameCounts.set(entry.displayName, (nameCounts.get(entry.displayName) ?? 0) + 1);
    }

    for (const entry of entries) {
      if ((nameCounts.get(entry.displayName) ?? 0) > 1) {
        const parts = entry.path.replace(/\.md$/, '').split('/');
        parts.pop();
        entry.subtitle = parts.length > 2
          ? parts.slice(-2).join('/')
          : parts.join('/') || '/';
      }
    }

    return entries;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[buildNoteIndex] Error indexing vault notes:', error);
    return [];
  }
}

/**
 * Get note entries for autocomplete with disambiguation subtitles.
 */
async function getNoteEntries(): Promise<NoteIndexEntry[]> {
  return buildNoteIndex(getApp());
}

/**
 * Get note suggestions for autocomplete.
 * Returns array of display names only.
 */
async function getNoteDisplayNames(): Promise<string[]> {
  const index = await buildNoteIndex(getApp());
  return index.map(note => note.displayName);
}

/**
 * Get full note path from display name.
 */
async function getFullPathFromDisplayName(displayName: string): Promise<string | null> {
  const index = await buildNoteIndex(getApp());
  const match = index.find(note => note.displayName === displayName);
  return match ? match.path : null;
}

/**
 * Get display name from full path.
 */
function getDisplayNameFromPath(fullPath: string | null | undefined): string {
  if (fullPath == null || fullPath === '') return '';
  // Remove .md extension and get just the filename
  return fullPath.replace(/\.md$/, '').split('/').pop() ?? '';
}

// ===========================================
// Note Navigation
// ===========================================

/**
 * Open a note in a new tab using Obsidian API.
 */
async function openNoteInNewTab(notePath: string | null | undefined): Promise<boolean> {
  if (notePath == null || notePath === '') {
    // eslint-disable-next-line no-console
    console.warn('[openNoteInNewTab] No note path provided');
    return false;
  }

  try {
    const app = getApp();
    await app.workspace.openLinkText(notePath.replace(/\.md$/, ''), '', true);
    return true;
  } catch (error) {
    // eslint-disable-next-line no-console
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
  if (notePath == null || notePath === '') return false;

  try {
    const app = getApp();
    const file = app.vault.getAbstractFileByPath(notePath);
    return file !== null && file !== undefined;
  } catch (error) {
    // eslint-disable-next-line no-console
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
  if (notePath == null || notePath === '') return '';
  return getDisplayNameFromPath(notePath);
}

// ===========================================
// Exports
// ===========================================

export { buildNoteIndex, getNoteEntries, getNoteDisplayNames, getFullPathFromDisplayName, getDisplayNameFromPath, openNoteInNewTab, isValidNotePath, formatNoteForDisplay };
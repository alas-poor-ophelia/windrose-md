/**
 * Note Pin Interaction Hook Type Definitions
 * Path: types/hooks/notePinInteraction.types.ts
 *
 * Types for useNotePinInteraction hook - manages Note Pin placement,
 * note link modal state, and note link save/cancel operations.
 */

import type { ToolId } from '../tools/tool.types';
import type { ObjectTypeId } from '../objects/object.types';

// ===========================================
// Handler Functions
// ===========================================

/** Note Pin placement handler */
export type HandleNotePinPlacement = (gridX: number, gridY: number) => boolean;

/** Note link save handler */
export type HandleNoteLinkSave = (notePath: string | null) => void;

/** Note link cancel handler */
export type HandleNoteLinkCancel = () => void;

/** Edit note link handler */
export type HandleEditNoteLink = (objectId: string) => void;

// ===========================================
// Ref Types
// ===========================================

/** Ref for tracking save state to prevent race conditions */
export interface JustSavedRef {
  current: boolean;
}

// ===========================================
// Hook Result Type
// ===========================================

/** Return type for useNotePinInteraction hook */
export interface UseNotePinInteractionResult {
  handleNotePinPlacement: HandleNotePinPlacement;
  handleNoteLinkSave: HandleNoteLinkSave;
  handleNoteLinkCancel: HandleNoteLinkCancel;
  handleEditNoteLink: HandleEditNoteLink;
}

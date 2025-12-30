/**
 * Tool Type Definitions
 * Path: types/tools/tool.types.ts
 * 
 * Tool state and selection types.
 * Populated during useToolState.js migration.
 */

// ===========================================
// Tool Identifiers
// ===========================================

/** Available tools in the palette */
export type ToolId =
  | 'select'
  | 'paint'
  | 'erase'
  | 'fill'
  | 'eyedropper'
  | 'shape'
  | 'segment'
  | 'object'
  | 'text'
  | 'note'
  | 'measure'
  | 'fog'
  | 'pan';

// ===========================================
// Tool State
// ===========================================

/** Current tool state */
export interface ToolState {
  activeTool: ToolId;
  previousTool: ToolId | null;
  toolOptions: ToolOptions;
}

/** Tool-specific options */
export interface ToolOptions {
  brushSize: number;
  // Add more as discovered during migration
}

// ===========================================
// Tool Actions
// ===========================================

/** Tool switch action */
export interface ToolSwitchAction {
  type: 'SWITCH_TOOL';
  payload: {
    tool: ToolId;
    preservePrevious?: boolean;
  };
}

// TODO: Expand during useToolState.js migration
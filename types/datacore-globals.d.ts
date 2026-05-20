/**
 * Datacore Global Extensions
 * Path: types/datacore-globals.d.ts
 * 
 * The @blacksmithgu/datacore package provides DatacoreLocalApi types,
 * but we need to ensure dc is available globally and extend/clarify
 * some aspects for our usage.
 */

import type { DatacoreLocalApi } from '@blacksmithgu/datacore';

// Ensure dc is available globally in all modules
declare global {
  const dc: DatacoreLocalApi;

  interface Window {
    __windrose?: {
      obsidian?: typeof import('obsidian');
      version?: string;
      ready?: boolean;
      pendingNavigate?: { mapPath?: string; consumed?: boolean };
      mcpInstances?: Record<string, unknown>;
      dataFilePath?: string;
      [key: string]: unknown;
    };
  }
}

// Re-export commonly used Datacore types for convenience
export type { DatacoreLocalApi };

// Datacore's Preact re-exports (these come from dc.* at runtime)
// Add any additional Datacore-specific types we discover during migration
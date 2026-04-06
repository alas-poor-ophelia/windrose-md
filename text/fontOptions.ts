/**
 * fontOptions.ts - Cross-platform font definitions for text labels
 */

import type { HexColor } from '#types/core/common.types';

/** Font option definition */
interface FontOption {
  id: string;
  name: string;
  css: string;
}

/**
 * Font options with CSS font stacks optimized for cross-platform compatibility
 * Each stack prioritizes system fonts and falls back gracefully
 */
const FONT_OPTIONS: FontOption[] = [
  {
    id: 'sans',
    name: 'Sans-Serif',
    css: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
  },
  {
    id: 'serif',
    name: 'Serif',
    css: 'Georgia, Cambria, "Times New Roman", Times, serif'
  },
  {
    id: 'mono',
    name: 'Monospace',
    css: '"Courier New", Courier, "Liberation Mono", monospace'
  },
  {
    id: 'script',
    name: 'Script',
    css: '"Brush Script MT", "Bradley Hand", "Segoe Script", "Lucida Handwriting", "Apple Chancery", cursive'
  },
  {
    id: 'cinzel',
    name: 'Cinzel',
    css: '"Cinzel", serif'
  },
  {
    id: 'IM Fell English',
    name: 'IM Fell English',
    css: '"IM Fell English", serif'
  },
  {
    id: 'MedievalSharp',
    name: 'MedievalSharp',
    css: '"MedievalSharp", cursive'
  },
  {
    id: 'Pirata One',
    name: 'Pirata One',
    css: '"Pirata One", cursive'
  },
];

/** Default font settings for new text labels */
const DEFAULT_FONT = 'sans';
const DEFAULT_FONT_SIZE = 16;
const DEFAULT_TEXT_COLOR: HexColor = '#ffffff';

/** Font size constraints */
const FONT_SIZE_MIN = 8;
const FONT_SIZE_MAX = 72;
const FONT_SIZE_STEP = 2;

/**
 * Get CSS font family string by font ID
 */
function getFontCss(fontId: string): string {
  const font = FONT_OPTIONS.find(f => f.id === fontId);
  return font ? font.css : FONT_OPTIONS[0].css;
}

/**
 * Get font option by ID
 */
function getFontOption(fontId: string): FontOption {
  return FONT_OPTIONS.find(f => f.id === fontId) || FONT_OPTIONS[0];
}

return {
  FONT_OPTIONS,
  DEFAULT_FONT,
  DEFAULT_FONT_SIZE,
  DEFAULT_TEXT_COLOR,
  FONT_SIZE_MIN,
  FONT_SIZE_MAX,
  FONT_SIZE_STEP,
  getFontCss,
  getFontOption
};

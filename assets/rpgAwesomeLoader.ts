/**
 * rpgAwesomeLoader.ts - Font loading utility for RPGAwesome icon font
 * Handles loading the font for both canvas rendering and CSS display
 */

import type { IconMap } from '#types/objects/icon.types';

/** Font loading state */
let fontLoaded = false;
let fontLoadPromise: Promise<boolean> | null = null;

/**
 * CSS for the @font-face declaration
 */
const RPGAWESOME_FONT_CSS = `
@font-face {
  font-family: 'rpgawesome';
  src: url('{{FONT_PATH}}') format('woff');
  font-weight: normal;
  font-style: normal;
}

/* Base class for RPGAwesome icons */
.ra {
  font-family: 'rpgawesome' !important;
  font-style: normal;
  font-variant: normal;
  font-weight: normal;
  line-height: 1;
  speak: never;
  text-transform: none;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
`;

/**
 * Load the RPGAwesome font
 * @returns True if font loaded successfully
 */
async function loadRPGAwesomeFont(fontPath: string): Promise<boolean> {
  if (fontLoadPromise) {
    return fontLoadPromise;
  }

  fontLoadPromise = new Promise<boolean>(async (resolve) => {
    try {
      if (document.fonts.check('1em rpgawesome')) {
        fontLoaded = true;
        resolve(true);
        return;
      }

      if (typeof FontFace !== 'undefined') {
        try {
          const font = new FontFace('rpgawesome', `url(${fontPath})`);
          await font.load();
          document.fonts.add(font);
          fontLoaded = true;
          resolve(true);
          return;
        } catch (fontFaceError) {
          console.warn('[RPGAwesome] FontFace API failed, falling back to CSS injection:', fontFaceError);
        }
      }

      const styleId = 'rpgawesome-font-style';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = RPGAWESOME_FONT_CSS.replace('{{FONT_PATH}}', fontPath);
        document.head.appendChild(style);
      }

      await document.fonts.load('1em rpgawesome');

      if (document.fonts.check('1em rpgawesome')) {
        fontLoaded = true;
        resolve(true);
      } else {
        console.warn('[RPGAwesome] Font may not have loaded correctly');
        resolve(false);
      }
    } catch (error) {
      console.error('[RPGAwesome] Failed to load font:', error);
      fontLoaded = false;
      resolve(false);
    }
  });

  return fontLoadPromise;
}

/**
 * Check if font is currently loaded
 */
function isRPGAwesomeFontLoaded(): boolean {
  return fontLoaded || document.fonts.check('1em rpgawesome');
}

/**
 * Reset font loading state (for testing/debugging)
 */
function resetFontLoadState(): void {
  fontLoaded = false;
  fontLoadPromise = null;
}

/**
 * Inject RPGAwesome CSS classes into document
 */
function injectIconCSS(iconMap: IconMap): void {
  const styleId = 'rpgawesome-icon-classes';
  if (document.getElementById(styleId)) {
    return;
  }

  let css = '';
  for (const [iconClass, data] of Object.entries(iconMap)) {
    const codePoint = data.char.charCodeAt(0).toString(16);
    css += '.ra.' + iconClass + ':before { content: "\\' + codePoint + '"; }\n';
  }

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = css;
  document.head.appendChild(style);
}

return {
  loadRPGAwesomeFont,
  isRPGAwesomeFontLoaded,
  resetFontLoadState,
  injectIconCSS,
  RPGAWESOME_FONT_CSS
};

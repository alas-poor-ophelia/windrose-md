// rpgAwesomeLoader.js - Font loading utility for RPGAwesome icon font
// Handles loading the font for both canvas rendering and CSS display

/**
 * Font loading state
 */
let fontLoaded = false;
let fontLoadPromise = null;

/**
 * CSS for the @font-face declaration
 * This will be injected into the document when needed
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
 * @param {string} fontPath - Path to the woff font file
 * @returns {Promise<boolean>} True if font loaded successfully
 */
async function loadRPGAwesomeFont(fontPath) {
  // Return cached promise if already loading/loaded
  if (fontLoadPromise) {
    return fontLoadPromise;
  }
  
  fontLoadPromise = new Promise(async (resolve) => {
    try {
      // Check if font is already available
      if (document.fonts.check('1em rpgawesome')) {
        fontLoaded = true;
        resolve(true);
        return;
      }
      
      // Use FontFace API if available (modern browsers)
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
      
      // Fallback: inject CSS @font-face
      const styleId = 'rpgawesome-font-style';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = RPGAWESOME_FONT_CSS.replace('{{FONT_PATH}}', fontPath);
        document.head.appendChild(style);
      }
      
      // Wait for font to load via document.fonts
      await document.fonts.load('1em rpgawesome');
      
      // Verify it loaded
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
 * @returns {boolean}
 */
function isRPGAwesomeFontLoaded() {
  return fontLoaded || document.fonts.check('1em rpgawesome');
}

/**
 * Reset font loading state (for testing/debugging)
 */
function resetFontLoadState() {
  fontLoaded = false;
  fontLoadPromise = null;
}

/**
 * Inject RPGAwesome CSS classes into document
 * This is separate from font loading - used for the icon class definitions
 * @param {Object} iconMap - The RA_ICONS map from rpgAwesomeIcons.js
 */
function injectIconCSS(iconMap) {
  const styleId = 'rpgawesome-icon-classes';
  if (document.getElementById(styleId)) {
    return; // Already injected
  }
  
  // Build CSS for each icon class
  let css = '';
  for (const [iconClass, data] of Object.entries(iconMap)) {
    // Convert unicode character to CSS content format
    // data.char is the actual unicode character, get its code point
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
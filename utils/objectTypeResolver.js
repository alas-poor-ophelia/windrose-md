/**
 * objectTypeResolver.js
 * 
 * Resolves object types by merging built-in definitions with user customizations.
 * Handles:
 * - Object overrides (modified built-ins)
 * - Hidden objects
 * - Custom objects
 * - Custom categories
 * - Unknown object fallback
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { OBJECT_TYPES, CATEGORIES } = await requireModuleByName("objectTypes.ts");
const { getObjectSettings } = await requireModuleByName("settingsAccessor.ts");
const { RA_ICONS, getIconChar, getIconInfo } = await requireModuleByName("rpgAwesomeIcons.js");

/**
 * Fallback for unknown/deleted object types
 * Used when a map references an object type that no longer exists
 */
const UNKNOWN_OBJECT_FALLBACK = {
  id: '__unknown__',
  symbol: '?',
  label: 'Unknown Object',
  category: 'markers',
  isUnknown: true
};

/**
 * Check if an object type uses an RPGAwesome icon
 * @param {Object} objectType - The object type definition
 * @returns {boolean} True if the object uses an icon font
 */
function hasIconClass(objectType) {
  return objectType && typeof objectType.iconClass === 'string' && objectType.iconClass.length > 0;
}

/**
 * Get the render character for an object type
 * Handles both iconClass (RPGAwesome) and symbol (Unicode) with fallback
 * 
 * @param {Object} objectType - The object type definition
 * @returns {{ char: string, isIcon: boolean }} Character to render and whether it's an icon font
 */
function getRenderChar(objectType) {
  if (!objectType) {
    return { char: '?', isIcon: false };
  }
  
  // If iconClass is set, try to get the icon character
  if (hasIconClass(objectType)) {
    const iconChar = getIconChar(objectType.iconClass);
    if (iconChar) {
      return { char: iconChar, isIcon: true };
    }
    // iconClass was set but invalid - fall through to symbol/fallback
    console.warn(`[objectTypeResolver] Invalid iconClass: ${objectType.iconClass}`);
  }
  
  // Use symbol if available
  if (objectType.symbol) {
    return { char: objectType.symbol, isIcon: false };
  }
  
  // Final fallback
  return { char: '?', isIcon: false };
}

/**
 * Validate an iconClass value
 * @param {string} iconClass - The icon class to validate (e.g., 'ra-sword')
 * @returns {boolean} True if valid
 */
function isValidIconClass(iconClass) {
  if (!iconClass || typeof iconClass !== 'string') return false;
  return RA_ICONS.hasOwnProperty(iconClass);
}

/**
 * Default category order for built-in categories
 */
const BUILT_IN_CATEGORY_ORDER = {
  'notes': 0,
  'navigation': 10,
  'hazards': 20,
  'features': 30,
  'encounters': 40,
  'markers': 50
};

/**
 * Get effective object types list (built-ins + overrides + custom)
 * This is the main function consumers should use for listing available objects.
 * 
 * @param {string} mapType - 'hex' or 'grid' (defaults to 'grid')
 * @returns {Array} Merged and filtered object types
 */
function getResolvedObjectTypes(mapType = 'grid') {
  const settings = getObjectSettings(mapType);
  const { objectOverrides = {}, customObjects = [] } = settings;
  
  // Apply overrides to built-ins, filter out hidden ones
  // Built-in objects get default order based on their index in OBJECT_TYPES
  const resolvedBuiltIns = OBJECT_TYPES
    .filter(obj => !objectOverrides[obj.id]?.hidden)
    .map((obj, index) => {
      const override = objectOverrides[obj.id];
      const defaultOrder = index * 10; // Leave gaps for reordering
      if (override) {
        // Merge override properties (excluding 'hidden' which is handled above)
        const { hidden, ...overrideProps } = override;
        return {
          ...obj,
          ...overrideProps,
          order: override.order ?? defaultOrder,
          isBuiltIn: true,
          isModified: true
        };
      }
      return {
        ...obj,
        order: defaultOrder,
        isBuiltIn: true,
        isModified: false
      };
    });
  
  // Add custom objects with their flag
  // Custom objects use their order or a high default to appear at the end
  const resolvedCustom = customObjects.map((obj, index) => ({
    ...obj,
    order: obj.order ?? (1000 + index * 10),
    isCustom: true,
    isBuiltIn: false
  }));
  
  return [...resolvedBuiltIns, ...resolvedCustom];
}

/**
 * Get effective categories list (built-ins + custom), sorted by order
 * 
 * @param {string} mapType - 'hex' or 'grid' (defaults to 'grid')
 * @returns {Array} Merged and sorted categories
 */
function getResolvedCategories(mapType = 'grid') {
  const settings = getObjectSettings(mapType);
  const { customCategories = [] } = settings;
  
  // Add order to built-in categories
  const resolvedBuiltIns = CATEGORIES.map(c => ({
    ...c,
    isBuiltIn: true,
    order: BUILT_IN_CATEGORY_ORDER[c.id] ?? 50
  }));
  
  // Add custom categories with their flags
  const resolvedCustom = customCategories.map(c => ({
    ...c,
    isCustom: true,
    isBuiltIn: false,
    order: c.order ?? 100  // Default custom categories to end
  }));
  
  // Combine and sort by order
  return [...resolvedBuiltIns, ...resolvedCustom]
    .sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
}

/**
 * Get list of hidden built-in objects
 * Useful for showing a "hidden objects" section in settings
 * 
 * @param {string} mapType - 'hex' or 'grid' (defaults to 'grid')
 * @returns {Array} Hidden object definitions
 */
function getHiddenObjects(mapType = 'grid') {
  const settings = getObjectSettings(mapType);
  const { objectOverrides = {} } = settings;
  
  return OBJECT_TYPES
    .filter(obj => objectOverrides[obj.id]?.hidden)
    .map(obj => ({
      ...obj,
      isBuiltIn: true,
      isHidden: true
    }));
}

/**
 * Get a single object type by ID
 * Returns the resolved version (with overrides applied) or fallback for unknown
 * 
 * @param {string} typeId - The object type ID to look up
 * @param {string} mapType - 'hex' or 'grid' (defaults to 'grid')
 * @returns {Object} Object type definition (never null - returns fallback for unknown)
 */
function getObjectType(typeId, mapType = 'grid') {
  // Handle null/undefined
  if (!typeId) {
    return UNKNOWN_OBJECT_FALLBACK;
  }
  
  // Special case: return the fallback directly if requested
  if (typeId === '__unknown__') {
    return UNKNOWN_OBJECT_FALLBACK;
  }
  
  const settings = getObjectSettings(mapType);
  const { objectOverrides = {}, customObjects = [] } = settings;
  
  // Check built-in objects first (including hidden ones - they still need to render)
  const builtIn = OBJECT_TYPES.find(t => t.id === typeId);
  if (builtIn) {
    const override = objectOverrides[typeId];
    if (override) {
      const { hidden, ...overrideProps } = override;
      return {
        ...builtIn,
        ...overrideProps,
        isBuiltIn: true,
        isModified: true,
        isHidden: hidden || false
      };
    }
    return {
      ...builtIn,
      isBuiltIn: true,
      isModified: false
    };
  }
  
  // Check custom objects
  const custom = customObjects.find(t => t.id === typeId);
  if (custom) {
    return {
      ...custom,
      isCustom: true,
      isBuiltIn: false
    };
  }
  
  // Not found - return fallback
  return UNKNOWN_OBJECT_FALLBACK;
}

/**
 * Check if an object type exists (built-in or custom, not hidden)
 * 
 * @param {string} typeId - The object type ID
 * @param {string} mapType - 'hex' or 'grid' (defaults to 'grid')
 * @returns {boolean} True if type exists and is not hidden
 */
function objectTypeExists(typeId, mapType = 'grid') {
  const objType = getObjectType(typeId, mapType);
  return objType.id !== '__unknown__' && !objType.isHidden;
}

/**
 * Get the original (unmodified) built-in object definition
 * Used for "reset to default" functionality
 * 
 * @param {string} typeId - The built-in object type ID
 * @returns {Object|null} Original definition or null if not a built-in
 */
function getOriginalBuiltIn(typeId) {
  const builtIn = OBJECT_TYPES.find(t => t.id === typeId);
  return builtIn ? { ...builtIn, isBuiltIn: true } : null;
}

/**
 * Generate a unique ID for a custom object
 * 
 * @returns {string} Unique ID with 'custom-' prefix
 */
function generateCustomObjectId() {
  return 'custom-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

/**
 * Generate a unique ID for a custom category
 * 
 * @returns {string} Unique ID with 'custom-cat-' prefix
 */
function generateCustomCategoryId() {
  return 'custom-cat-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

/**
 * Validate a symbol string
 * Returns true if the symbol is valid (non-empty, reasonable length)
 * 
 * @param {string} symbol - The symbol to validate
 * @returns {boolean} True if valid
 */
function isValidSymbol(symbol) {
  if (!symbol || typeof symbol !== 'string') return false;
  // Allow 1-4 characters (some emoji are multi-codepoint)
  const trimmed = symbol.trim();
  return trimmed.length >= 1 && trimmed.length <= 8;
}

/**
 * Validate an object definition
 * Objects can have either a symbol (Unicode) OR an iconClass (RPGAwesome), or both
 * 
 * @param {Object} obj - Object definition to validate
 * @returns {{ valid: boolean, errors: string[] }} Validation result
 */
function validateObjectDefinition(obj) {
  const errors = [];
  
  const hasSymbol = obj.symbol && isValidSymbol(obj.symbol);
  const hasIcon = obj.iconClass && isValidIconClass(obj.iconClass);
  
  // Must have at least one of symbol or iconClass
  if (!hasSymbol && !hasIcon) {
    if (obj.iconClass && !hasIcon) {
      errors.push('Invalid icon selection');
    } else if (obj.symbol && !hasSymbol) {
      errors.push('Symbol must be 1-8 characters');
    } else {
      errors.push('Either a symbol or an icon is required');
    }
  }
  
  if (!obj.label || typeof obj.label !== 'string' || obj.label.trim().length === 0) {
    errors.push('Label is required');
  }
  
  if (!obj.category || typeof obj.category !== 'string') {
    errors.push('Category is required');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// Export all functions
return {
  // Core resolution
  getResolvedObjectTypes,
  getResolvedCategories,
  getObjectType,
  getHiddenObjects,
  
  // Icon/symbol helpers
  hasIconClass,
  getRenderChar,
  isValidIconClass,
  
  // Utilities
  objectTypeExists,
  getOriginalBuiltIn,
  generateCustomObjectId,
  generateCustomCategoryId,
  isValidSymbol,
  validateObjectDefinition,
  
  // Constants
  UNKNOWN_OBJECT_FALLBACK,
  BUILT_IN_CATEGORY_ORDER,
  
  // Re-export icon data for convenience
  RA_ICONS
};
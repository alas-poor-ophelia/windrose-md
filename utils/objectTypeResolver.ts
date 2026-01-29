/**
 * objectTypeResolver.ts
 *
 * Resolves object types by merging built-in definitions with user customizations.
 * Handles:
 * - Object overrides (modified built-ins)
 * - Hidden objects
 * - Custom objects
 * - Custom categories
 * - Unknown object fallback
 */

import type { MapType } from '#types/core/map.types';
import type { IconData, IconMap } from '#types/objects/icon.types';

// Types from #types/objects/object.types.ts and #types/settings/settings.types.ts
// Duplicated here for datacore runtime compatibility (path aliases not resolved at runtime)

/** Base object type (from objectTypes.ts) */
interface ObjectType {
  id: string;
  symbol: string;
  label: string;
  category: string;
}

/** Resolved object type definition */
interface ObjectTypeDefinition {
  id: string;
  symbol?: string;
  iconClass?: string;
  imagePath?: string;  // Vault image path for custom image objects
  label: string;
  category: string;
  order?: number;
  isBuiltIn?: boolean;
  isModified?: boolean;
  isCustom?: boolean;
  isHidden?: boolean;
  isUnknown?: boolean;
}

/** Base category (from objectTypes.ts) */
interface Category {
  id: string;
  label: string;
}

/** Resolved category definition */
interface CategoryDefinition {
  id: string;
  label: string;
  order?: number;
  isBuiltIn?: boolean;
  isCustom?: boolean;
}

/** Object override settings */
interface ObjectOverride {
  hidden?: boolean;
  symbol?: string;
  iconClass?: string;
  label?: string;
  category?: string;
  order?: number;
}

/** Object settings from settings accessor */
interface ObjectSettings {
  objectOverrides?: Record<string, ObjectOverride>;
  customObjects?: ObjectTypeDefinition[];
  customCategories?: CategoryDefinition[];
}

/** Render character result */
interface RenderChar {
  char: string;
  isIcon: boolean;
  isImage?: boolean;    // True if rendering via image (imagePath)
  imagePath?: string;   // Vault image path for image rendering
}

/** Validation result */
interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

/** Object types module */
interface ObjectTypesModule {
  OBJECT_TYPES: ObjectType[];
  CATEGORIES: Category[];
}

/** Settings accessor module */
interface SettingsAccessorModule {
  getObjectSettings: (mapType: MapType) => ObjectSettings;
}

/** RPG Awesome icons module */
interface RPGAwesomeIconsModule {
  RA_ICONS: IconMap;
  getIconChar: (iconClass: string) => string | null;
  getIconInfo: (iconClass: string) => IconData | null;
}

const { OBJECT_TYPES, CATEGORIES } = await requireModuleByName("objectTypes.ts") as ObjectTypesModule;
const { getObjectSettings } = await requireModuleByName("settingsAccessor.ts") as SettingsAccessorModule;
const { RA_ICONS, getIconChar, getIconInfo } = await requireModuleByName("rpgAwesomeIcons.ts") as RPGAwesomeIconsModule;

/**
 * Fallback for unknown/deleted object types
 * Used when a map references an object type that no longer exists
 */
const UNKNOWN_OBJECT_FALLBACK: ObjectTypeDefinition = {
  id: '__unknown__',
  symbol: '?',
  label: 'Unknown Object',
  category: 'markers',
  isUnknown: true
};

/**
 * Check if an object type uses an RPGAwesome icon
 */
function hasIconClass(objectType: ObjectTypeDefinition | null | undefined): boolean {
  return objectType != null && typeof objectType.iconClass === 'string' && objectType.iconClass.length > 0;
}

/**
 * Check if an object type uses a custom image
 */
function hasImagePath(objectType: ObjectTypeDefinition | null | undefined): boolean {
  return objectType != null && typeof objectType.imagePath === 'string' && objectType.imagePath.length > 0;
}

/**
 * Get the render character for an object type
 * Handles imagePath (custom image), iconClass (RPGAwesome), and symbol (Unicode) with fallback
 */
function getRenderChar(objectType: ObjectTypeDefinition | null | undefined): RenderChar {
  if (!objectType) {
    return { char: '?', isIcon: false };
  }

  // Check for custom image first (highest priority)
  if (hasImagePath(objectType)) {
    return { char: '', isIcon: false, isImage: true, imagePath: objectType.imagePath };
  }

  // If iconClass is set, try to get the icon character
  if (hasIconClass(objectType)) {
    const iconChar = getIconChar(objectType.iconClass!);
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
 */
function isValidIconClass(iconClass: string | null | undefined): boolean {
  if (!iconClass || typeof iconClass !== 'string') return false;
  return Object.prototype.hasOwnProperty.call(RA_ICONS, iconClass);
}

/**
 * Default category order for built-in categories
 */
const BUILT_IN_CATEGORY_ORDER: Record<string, number> = {
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
 */
function getResolvedObjectTypes(mapType: MapType = 'grid'): ObjectTypeDefinition[] {
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
 */
function getResolvedCategories(mapType: MapType = 'grid'): CategoryDefinition[] {
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
    order: c.order ?? 100 // Default custom categories to end
  }));

  // Combine and sort by order
  return [...resolvedBuiltIns, ...resolvedCustom]
    .sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
}

/**
 * Get list of hidden built-in objects
 * Useful for showing a "hidden objects" section in settings
 */
function getHiddenObjects(mapType: MapType = 'grid'): ObjectTypeDefinition[] {
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
 */
function getObjectType(typeId: string | null | undefined, mapType: MapType = 'grid'): ObjectTypeDefinition {
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
 */
function objectTypeExists(typeId: string, mapType: MapType = 'grid'): boolean {
  const objType = getObjectType(typeId, mapType);
  return objType.id !== '__unknown__' && !objType.isHidden;
}

/**
 * Get the original (unmodified) built-in object definition
 * Used for "reset to default" functionality
 */
function getOriginalBuiltIn(typeId: string): ObjectTypeDefinition | null {
  const builtIn = OBJECT_TYPES.find(t => t.id === typeId);
  return builtIn ? { ...builtIn, isBuiltIn: true } : null;
}

/**
 * Generate a unique ID for a custom object
 */
function generateCustomObjectId(): string {
  return 'custom-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

/**
 * Generate a unique ID for a custom category
 */
function generateCustomCategoryId(): string {
  return 'custom-cat-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

/**
 * Validate a symbol string
 * Returns true if the symbol is valid (non-empty, reasonable length)
 */
function isValidSymbol(symbol: string | null | undefined): boolean {
  if (!symbol || typeof symbol !== 'string') return false;
  // Allow 1-4 characters (some emoji are multi-codepoint)
  const trimmed = symbol.trim();
  return trimmed.length >= 1 && trimmed.length <= 8;
}

/**
 * Validate an image path
 * Returns true if the path is a non-empty string
 */
function isValidImagePath(imagePath: string | null | undefined): boolean {
  return typeof imagePath === 'string' && imagePath.trim().length > 0;
}

/**
 * Validate an object definition
 * Objects can have a symbol (Unicode), iconClass (RPGAwesome), or imagePath (custom image)
 */
function validateObjectDefinition(obj: Partial<ObjectTypeDefinition>): ValidationResult {
  const errors: string[] = [];

  const hasSymbol = obj.symbol && isValidSymbol(obj.symbol);
  const hasIcon = obj.iconClass && isValidIconClass(obj.iconClass);
  const hasImage = obj.imagePath && isValidImagePath(obj.imagePath);

  // Must have at least one of symbol, iconClass, or imagePath
  if (!hasSymbol && !hasIcon && !hasImage) {
    if (obj.iconClass && !hasIcon) {
      errors.push('Invalid icon selection');
    } else if (obj.symbol && !hasSymbol) {
      errors.push('Symbol must be 1-8 characters');
    } else if (obj.imagePath && !hasImage) {
      errors.push('Invalid image path');
    } else {
      errors.push('Either a symbol, icon, or image is required');
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

  // Icon/symbol/image helpers
  hasIconClass,
  hasImagePath,
  getRenderChar,
  isValidIconClass,
  isValidImagePath,

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

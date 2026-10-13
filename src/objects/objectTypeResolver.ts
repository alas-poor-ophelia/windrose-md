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
import type {
  ObjectTypeDefinition,
  CategoryDefinition,
  RenderChar,
  ValidationResult
} from '#types/objects/object.types';
import type { ObjectOverride } from '#types/settings/settings.types';

import { OBJECT_TYPES, CATEGORIES } from './objectTypes';
import { getObjectSettings, getObjectSettingsForSet } from '../core/settingsAccessor';
import { RA_ICONS, getIconChar } from '../assets/rpgAwesomeIcons';

/**
 * The object-related slice of settings that resolution reads. Accepts the
 * per-map-type object settings from settingsAccessor as well as the raw
 * settings records the settings tab passes around.
 */
interface ObjectSettings {
  objectOverrides?: Record<string, ObjectOverride>;
  customObjects?: ObjectTypeDefinition[];
  customCategories?: CategoryDefinition[];
}

/** A resolved object type: always carries an order and a built-in flag */
type ResolvedObjectType = ObjectTypeDefinition & { order: number; isBuiltIn: boolean };

/** A resolved category: always carries an order and a built-in flag */
type ResolvedCategory = CategoryDefinition & { order: number; isBuiltIn: boolean };

/** Resolve object settings: per-map set -> global -> defaults */
function resolveObjectSettings(mapType: MapType, objectSetId?: string | null): ObjectSettings {
  if (objectSetId != null && objectSetId !== '') {
    const setSettings = getObjectSettingsForSet(objectSetId, mapType);
    if (setSettings != null) return setSettings;
  }
  return getObjectSettings(mapType);
}

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

const INTERNAL_TYPES: Record<string, ObjectTypeDefinition> = {
  'note_pin': { id: 'note_pin', symbol: '📌', label: 'Note Pin', category: 'markers', isBuiltIn: true }
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
  if (objectType == null) {
    return { char: '?', isIcon: false };
  }

  // Check for custom image first (highest priority)
  if (hasImagePath(objectType)) {
    return { char: '', isIcon: false, isImage: true, imagePath: objectType.imagePath };
  }

  // If iconClass is set, try to get the icon character
  if (hasIconClass(objectType)) {
    const iconChar = getIconChar(objectType.iconClass ?? '');
    if (iconChar != null && iconChar !== '') {
      return { char: iconChar, isIcon: true };
    }
    // iconClass was set but invalid - fall through to symbol/fallback
    console.warn(`[objectTypeResolver] Invalid iconClass: ${objectType.iconClass}`);
  }

  // Use symbol if available
  if (objectType.symbol != null && objectType.symbol !== '') {
    return { char: objectType.symbol, isIcon: false };
  }

  // Final fallback
  return { char: '?', isIcon: false };
}

/**
 * Validate an iconClass value
 */
function isValidIconClass(iconClass: string | null | undefined): boolean {
  if (iconClass == null || typeof iconClass !== 'string' || iconClass === '') return false;
  return Object.prototype.hasOwnProperty.call(RA_ICONS, iconClass);
}

/**
 * Default sort order for built-in categories. The single source of truth for
 * category ordering: the map palette and the settings tab both resolve
 * through mergeBuiltInAndCustomCategories, so a custom category's "Sort
 * order" lands in the same slot in both places.
 */
const BUILT_IN_CATEGORY_ORDER: Record<string, number> = {
  'navigation': 10,
  'hazards': 20,
  'features': 30,
  'encounters': 40,
  'markers': 50
};

/**
 * Merge built-in objects (overrides applied, hidden ones removed) with custom
 * objects. Pure: reads only the given settings slice.
 * Built-ins default to index*10 order; customs default to 1000+index*10.
 */
function mergeBuiltInAndCustomObjects(settings: ObjectSettings): ResolvedObjectType[] {
  const { objectOverrides = {}, customObjects = [] } = settings;

  const resolvedBuiltIns: ResolvedObjectType[] = OBJECT_TYPES
    .filter(obj => objectOverrides[obj.id]?.hidden !== true)
    .map((obj, index) => {
      const override = objectOverrides[obj.id];
      const defaultOrder = index * 10; // Leave gaps for reordering
      if (override != null) {
        // Merge override properties (excluding 'hidden' which is handled above)
        const { hidden, ...overrideProps } = override;
        void hidden; // handled above; excluded from the spread
        return {
          ...obj,
          ...overrideProps,
          order: override.order ?? defaultOrder,
          isBuiltIn: true,
          isModified: true
        };
      }
      return { ...obj, order: defaultOrder, isBuiltIn: true, isModified: false };
    });

  // Custom objects use their order or a high default to appear at the end
  const resolvedCustom: ResolvedObjectType[] = customObjects.map((obj, index) => ({
    ...obj,
    order: obj.order ?? (1000 + index * 10),
    isCustom: true,
    isBuiltIn: false
  }));

  return [...resolvedBuiltIns, ...resolvedCustom];
}

/**
 * Merge built-in categories with custom categories, sorted by order.
 * Pure: reads only the given settings slice.
 */
function mergeBuiltInAndCustomCategories(settings: ObjectSettings): ResolvedCategory[] {
  const { customCategories = [] } = settings;

  const resolvedBuiltIns: ResolvedCategory[] = CATEGORIES.map(c => ({
    ...c,
    isBuiltIn: true,
    order: BUILT_IN_CATEGORY_ORDER[c.id] ?? 50
  }));

  const resolvedCustom: ResolvedCategory[] = customCategories.map(c => ({
    ...c,
    isCustom: true,
    isBuiltIn: false,
    order: c.order ?? 100 // Default custom categories to end
  }));

  return [...resolvedBuiltIns, ...resolvedCustom].sort((a, b) => a.order - b.order);
}

/**
 * Get effective object types list (built-ins + overrides + custom)
 * This is the main function consumers should use for listing available objects.
 */
function getResolvedObjectTypes(mapType: MapType = 'grid', objectSetId?: string | null): ResolvedObjectType[] {
  return mergeBuiltInAndCustomObjects(resolveObjectSettings(mapType, objectSetId));
}

/**
 * Get effective categories list (built-ins + custom), sorted by order
 */
function getResolvedCategories(mapType: MapType = 'grid', objectSetId?: string | null): ResolvedCategory[] {
  return mergeBuiltInAndCustomCategories(resolveObjectSettings(mapType, objectSetId));
}

/**
 * Get a single object type by ID
 * Returns the resolved version (with overrides applied) or fallback for unknown
 */
function getObjectType(typeId: string | null | undefined, mapType: MapType = 'grid', objectSetId?: string | null): ObjectTypeDefinition {
  // Handle null/undefined
  if (typeId == null || typeId === '') {
    return UNKNOWN_OBJECT_FALLBACK;
  }

  // Special case: return the fallback directly if requested
  if (typeId === '__unknown__') {
    return UNKNOWN_OBJECT_FALLBACK;
  }

  const settings = resolveObjectSettings(mapType, objectSetId);
  const { objectOverrides = {}, customObjects = [] } = settings;

  // Check built-in objects first (including hidden ones - they still need to render)
  const builtIn = OBJECT_TYPES.find(t => t.id === typeId);
  if (builtIn) {
    const override = objectOverrides[typeId];
    if (override != null) {
      const { hidden, ...overrideProps } = override;
      void hidden; // excluded from the spread
      return {
        ...builtIn,
        ...overrideProps,
        isBuiltIn: true,
        isModified: true,
        isHidden: hidden === true
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

  // Check internal types (valid for programmatic use, not shown in sidebar)
  const internal = INTERNAL_TYPES[typeId];
  if (internal != null) return internal;

  // Not found - return fallback
  return UNKNOWN_OBJECT_FALLBACK;
}

/**
 * Validate a symbol string
 * Returns true if the symbol is valid (non-empty, reasonable length)
 */
function isValidSymbol(symbol: string | null | undefined): boolean {
  if (symbol == null || typeof symbol !== 'string' || symbol === '') return false;
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

  const hasSymbol = obj.symbol != null && obj.symbol !== '' && isValidSymbol(obj.symbol);
  const hasIcon = obj.iconClass != null && obj.iconClass !== '' && isValidIconClass(obj.iconClass);
  const hasImage = obj.imagePath != null && obj.imagePath !== '' && isValidImagePath(obj.imagePath);

  // Must have at least one of symbol, iconClass, or imagePath
  if (!hasSymbol && !hasIcon && !hasImage) {
    if (obj.iconClass != null && obj.iconClass !== '' && !hasIcon) {
      errors.push('Invalid icon selection');
    } else if (obj.symbol != null && obj.symbol !== '' && !hasSymbol) {
      errors.push('Symbol must be 1-8 characters');
    } else if (obj.imagePath != null && obj.imagePath !== '' && !hasImage) {
      errors.push('Invalid image path');
    } else {
      errors.push('Either a symbol, icon, or image is required');
    }
  }

  if (obj.label == null || typeof obj.label !== 'string' || obj.label.trim().length === 0) {
    errors.push('Label is required');
  }

  if (obj.category == null || typeof obj.category !== 'string') {
    errors.push('Category is required');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// Export all functions
export { // Core resolution
  getResolvedObjectTypes, getResolvedCategories, getObjectType,
  mergeBuiltInAndCustomObjects, mergeBuiltInAndCustomCategories, // Icon/symbol/image helpers
  hasIconClass, hasImagePath, getRenderChar, isValidIconClass, isValidImagePath, // Utilities
  isValidSymbol, validateObjectDefinition, // Constants
  UNKNOWN_OBJECT_FALLBACK };
export type { ResolvedObjectType, ResolvedCategory };
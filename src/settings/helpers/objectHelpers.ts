import type { App } from 'obsidian';
import { OBJECT_TYPES, CATEGORIES } from '../../objects/objectTypes';
import {
  mergeBuiltInAndCustomObjects,
  mergeBuiltInAndCustomCategories,
  type ResolvedObjectType,
  type ResolvedCategory
} from '../../objects/objectTypeResolver';
import { RPGAwesomeHelpers } from './rpgAwesomeHelpers';

const BUILT_IN_OBJECTS = OBJECT_TYPES;
const BUILT_IN_CATEGORIES = CATEGORIES;

interface ObjectEntry {
  id: string;
  category?: string;
  symbol?: string;
  label?: string;
  imagePath?: string;
  iconClass?: string;
  order?: number;
  [key: string]: unknown;
}

interface ResolvedObject extends ObjectEntry {
  order: number;
  isBuiltIn: boolean;
  isModified?: boolean;
  isCustom?: boolean;
  isHidden?: boolean;
}

interface CategoryEntry {
  id: string;
  label?: string;
  order?: number;
}

export const ObjectHelpers = {
  /** Built-ins (overrides applied, hidden removed) + custom objects. Delegates to the objects domain. */
  getResolved(settings: Record<string, unknown>): ResolvedObjectType[] {
    return mergeBuiltInAndCustomObjects(settings);
  },

  /** Built-in + custom categories sorted by order. Same order table as the map palette. */
  getCategories(settings: Record<string, unknown>): ResolvedCategory[] {
    return mergeBuiltInAndCustomCategories(settings);
  },

  getHidden(settings: Record<string, unknown>): ResolvedObject[] {
    const objectOverrides = (settings.objectOverrides ?? {}) as Record<string, { hidden?: boolean }>;
    return (BUILT_IN_OBJECTS as ObjectEntry[])
      .filter(obj => objectOverrides[obj.id]?.hidden === true)
      .map(obj => ({ ...obj, order: 0, isBuiltIn: true, isHidden: true }));
  },

  getAllCategories(settings: Record<string, unknown>): (CategoryEntry & { isBuiltIn?: boolean; isCustom?: boolean })[] {
    const customCategories = (settings.customCategories ?? []) as CategoryEntry[];
    const builtIn = BUILT_IN_CATEGORIES.map(c => ({ ...c, isBuiltIn: true }));
    const custom = customCategories.map(c => ({ ...c, isCustom: true }));
    return [...builtIn, ...custom];
  },

  getDefaultIdOrder(categoryId: string, settings: Record<string, unknown>): string[] {
    const objectOverrides = (settings.objectOverrides ?? {}) as Record<string, { hidden?: boolean }>;
    return (BUILT_IN_OBJECTS as ObjectEntry[])
      .filter(o => o.category === categoryId && objectOverrides[o.id]?.hidden !== true)
      .map(o => o.id);
  },

  renderObjectSymbol(obj: ObjectEntry, container: HTMLElement, app: App, options: { width?: string; height?: string } = {}): void {
    const { width = '20px', height = '20px' } = options;

    if (obj.imagePath != null && obj.imagePath !== '') {
      const imgEl = container.createEl('img', {
        cls: 'windrose-settings-object-image windrose-object-image-fit',
        attr: { src: app.vault.adapter.getResourcePath(obj.imagePath), alt: obj.label ?? '' }
      });
      imgEl.style.setProperty('width', width);
      imgEl.style.setProperty('height', height);
    } else if (obj.iconClass != null && obj.iconClass !== '' && RPGAwesomeHelpers.isValid(obj.iconClass)) {
      const iconInfo = RPGAwesomeHelpers.getInfo(obj.iconClass);
      const iconSpan = container.createSpan({ cls: 'ra' });
      iconSpan.textContent = iconInfo?.char ?? '?';
    } else {
      container.textContent = obj.symbol ?? '?';
    }
  }
};

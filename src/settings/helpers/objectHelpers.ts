import type { App } from 'obsidian';
import { OBJECT_TYPES, CATEGORIES } from '../../objects/objectTypes';
import { RPGAwesomeHelpers } from './rpgAwesomeHelpers';

const BUILT_IN_OBJECTS = OBJECT_TYPES;
const BUILT_IN_CATEGORIES = CATEGORIES;

const CATEGORY_ORDER: Record<string, number> = {};
CATEGORIES.forEach((c, index) => { CATEGORY_ORDER[c.id] = index; });

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

interface ResolvedCategory extends CategoryEntry {
  isBuiltIn: boolean;
  isCustom?: boolean;
  order: number;
}

export const ObjectHelpers = {
  getResolved(settings: Record<string, unknown>): ResolvedObject[] {
    const objectOverrides = (settings.objectOverrides ?? {}) as Record<string, Record<string, unknown>>;
    const customObjects = (settings.customObjects ?? []) as ObjectEntry[];

    const resolvedBuiltIns = (BUILT_IN_OBJECTS as ObjectEntry[])
      .filter(obj => (objectOverrides[obj.id] as Record<string, unknown> | undefined)?.hidden !== true)
      .map((obj, index) => {
        const override = objectOverrides[obj.id];
        const defaultOrder = index * 10;
        if (override != null) {
          const { hidden, ...overrideProps } = override;
          return {
            ...obj,
            ...overrideProps,
            order: (override.order as number) ?? defaultOrder,
            isBuiltIn: true,
            isModified: true
          } as ResolvedObject;
        }
        return { ...obj, order: defaultOrder, isBuiltIn: true, isModified: false } as ResolvedObject;
      });

    const resolvedCustom = customObjects.map((obj, index) => ({
      ...obj,
      order: obj.order ?? (1000 + index * 10),
      isCustom: true,
      isBuiltIn: false
    } as ResolvedObject));

    return [...resolvedBuiltIns, ...resolvedCustom];
  },

  getCategories(settings: Record<string, unknown>): ResolvedCategory[] {
    const customCategories = (settings.customCategories ?? []) as CategoryEntry[];

    const resolvedBuiltIns = BUILT_IN_CATEGORIES.map(c => ({
      ...c,
      isBuiltIn: true,
      order: CATEGORY_ORDER[c.id] ?? 50
    } as ResolvedCategory));

    const resolvedCustom = customCategories.map(c => ({
      ...c,
      isCustom: true,
      isBuiltIn: false,
      order: c.order ?? 100
    } as ResolvedCategory));

    return [...resolvedBuiltIns, ...resolvedCustom].sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
  },

  getHidden(settings: Record<string, unknown>): ResolvedObject[] {
    const objectOverrides = (settings.objectOverrides ?? {}) as Record<string, { hidden?: boolean }>;
    return (BUILT_IN_OBJECTS as ObjectEntry[])
      .filter(obj => objectOverrides[obj.id]?.hidden === true)
      .map(obj => ({ ...obj, order: 0, isBuiltIn: true, isHidden: true } as ResolvedObject));
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

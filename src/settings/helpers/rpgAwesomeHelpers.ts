import { RA_ICONS, RA_CATEGORIES } from '../../assets/rpgAwesomeIcons';

export interface RAIconEntry {
  iconClass: string;
  char: string;
  label: string;
  category: string;
}

export interface RACategory {
  id: string;
  label: string;
  order: number;
}

export const RPGAwesomeHelpers = {
  getByCategory(categoryId: string): RAIconEntry[] {
    const icons = Object.entries(RA_ICONS).map(([iconClass, data]) => ({
      iconClass,
      ...(data)
    }));

    if (categoryId === 'all') return icons;
    return icons.filter(i => i.category === categoryId);
  },

  search(query: string): RAIconEntry[] {
    const q = query.toLowerCase().trim();
    if (!q) return this.getByCategory('all');

    return Object.entries(RA_ICONS)
      .filter(([iconClass, data]) =>
        iconClass.toLowerCase().includes(q) ||
        (data as { label: string }).label.toLowerCase().includes(q)
      )
      .map(([iconClass, data]) => ({ iconClass, ...(data) }));
  },

  getCategories(): RACategory[] {
    return [...RA_CATEGORIES].sort((a: RACategory, b: RACategory) => a.order - b.order);
  },

  isValid(iconClass: string): boolean {
    return iconClass != null && iconClass !== '' && Object.prototype.hasOwnProperty.call(RA_ICONS, iconClass);
  },

  getInfo(iconClass: string): { char: string; label: string; category: string } | null {
    return (RA_ICONS as Record<string, { char: string; label: string; category: string }>)[iconClass] ?? null;
  }
};

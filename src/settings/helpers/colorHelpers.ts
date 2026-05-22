import { BUILT_IN_COLORS } from '../../core/settingsAccessor';

interface ColorEntry {
  id: string;
  [key: string]: unknown;
}

interface ResolvedColor extends ColorEntry {
  order: number;
  isBuiltIn: boolean;
  isModified?: boolean;
  isCustom?: boolean;
}

export const ColorHelpers = {
  getResolved(settings: Record<string, unknown>): ResolvedColor[] {
    const colorPaletteOverrides = (settings.colorPaletteOverrides || {}) as Record<string, Record<string, unknown>>;
    const customPaletteColors = (settings.customPaletteColors || []) as ColorEntry[];

    const resolvedBuiltIns = (BUILT_IN_COLORS as ColorEntry[])
      .filter(c => !(colorPaletteOverrides[c.id] as Record<string, unknown> | undefined)?.hidden)
      .map((c, index) => {
        const override = colorPaletteOverrides[c.id];
        if (override) {
          const { hidden, ...overrideProps } = override;
          return {
            ...c,
            ...overrideProps,
            order: (override.order as number) ?? index,
            isBuiltIn: true,
            isModified: true
          } as ResolvedColor;
        }
        return { ...c, order: index, isBuiltIn: true, isModified: false } as ResolvedColor;
      });

    const resolvedCustom = customPaletteColors.map((c, index) => ({
      ...c,
      order: (c as unknown as { order?: number }).order ?? (100 + index),
      isCustom: true,
      isBuiltIn: false
    } as ResolvedColor));

    return [...resolvedBuiltIns, ...resolvedCustom].sort((a, b) => a.order - b.order);
  },

  getHidden(settings: Record<string, unknown>): Set<string> {
    const colorPaletteOverrides = (settings.colorPaletteOverrides || {}) as Record<string, { hidden?: boolean }>;
    return new Set(
      Object.entries(colorPaletteOverrides)
        .filter(([, override]) => override.hidden)
        .map(([id]) => id)
    );
  }
};

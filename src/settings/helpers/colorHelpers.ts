import type { BuiltInColor, PaletteColor } from '#types/settings/settings.types';
import { BUILT_IN_COLORS } from '../../core/settingsAccessor';

interface ResolvedColor extends BuiltInColor {
  order: number;
  isBuiltIn: boolean;
  isModified?: boolean;
  isCustom?: boolean;
}

export const ColorHelpers = {
  getResolved(settings: Record<string, unknown>): ResolvedColor[] {
    const colorPaletteOverrides = (settings.colorPaletteOverrides ?? {}) as Record<string, Record<string, unknown>>;
    const customPaletteColors = (settings.customPaletteColors ?? []) as PaletteColor[];

    const resolvedBuiltIns = BUILT_IN_COLORS
      .filter(c => (colorPaletteOverrides[c.id] as Record<string, unknown> | undefined)?.hidden !== true)
      .map((c, index) => {
        const override = colorPaletteOverrides[c.id];
        if (override != null) {
          const { hidden, ...overrideProps } = override;
          return {
            ...c,
            ...overrideProps,
            order: (override.order as number) ?? index,
            isBuiltIn: true,
            isModified: true
          };
        }
        return { ...c, order: index, isBuiltIn: true, isModified: false };
      });

    const resolvedCustom = customPaletteColors.map((c, index) => ({
      ...c,
      order: c.order ?? (100 + index),
      isCustom: true,
      isBuiltIn: false
    }));

    return [...resolvedBuiltIns, ...resolvedCustom].sort((a, b) => a.order - b.order);
  },

  getHidden(settings: Record<string, unknown>): Set<string> {
    const colorPaletteOverrides = (settings.colorPaletteOverrides ?? {}) as Record<string, { hidden?: boolean }>;
    return new Set(
      Object.entries(colorPaletteOverrides)
        .filter(([, override]) => override.hidden === true)
        .map(([id]) => id)
    );
  }
};

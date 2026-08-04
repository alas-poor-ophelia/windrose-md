import type { SettingDefinitionItem, SettingGroupItem } from 'obsidian';
import type { WindroseFeature } from '#types/settings/settings.types';
import type { InstalledPack } from '#types/content-packs/contentPack.types';
import { THEME, DEFAULTS } from '../core/dmtConstants';
import { FEATURE_DEFINITIONS, isFeatureEnabled } from '../core/featureFlags';
import { ContentPackBrowserModal } from '../content-packs/ContentPackBrowserModal';
import { getInstalledPacks } from '../content-packs/installedPacksService';
import { fogPackImagePath } from '../content-packs/contentPackConstants';
import { getPackUnitOptions } from '../travel/travelPackOperations';
import { DUNGEON_STYLE_NAMES } from '../generation/dungeonStyleColors';
import { DUNGEON_STYLE_LABELS, addDungeonStyleColorPickers } from './tabs/TabRenderSettings';
import type { SettingsTabThis } from './tabs/settingsTabContext';

// settingDefinitions.ts
// Declarative Settings API (Obsidian 1.13+) definition arrays and control
// value plumbing for WindroseMDSettingsTab. Phase 1 of the migration in
// docs/proposals/settings-api-migration.md: all stock-control sections.
// The imperative TabRender* mixins remain as the pre-1.13 display() fallback
// until Phase 4 demolition.

const SETTING_DEFAULTS = {
  DEFAULT_GRID_LINE_COLOR: THEME.grid.lines,
  DEFAULT_BACKGROUND_COLOR: THEME.grid.background,
  DEFAULT_BORDER_COLOR: THEME.cells.border,
  DEFAULT_COORDINATE_KEY_COLOR: THEME.coordinateKey.color,
  DEFAULT_COORDINATE_TEXT_COLOR: THEME.coordinateText.color,
  DEFAULT_COORDINATE_TEXT_SHADOW: THEME.coordinateText.shadow,
};

// Keys read/written 1:1 against plugin.settings. Anything not listed here
// (and not a virtual or features.* key) is ignored by the accessors so a
// stray key can never scribble on arbitrary settings fields.
type DirectSettingKey =
  | 'hexOrientation'
  | 'coordinateKeyMode'
  | 'coordinateTextColor'
  | 'coordinateTextShadow'
  | 'gridLineColor'
  | 'gridLineWidth'
  | 'backgroundColor'
  | 'borderColor'
  | 'coordinateKeyColor'
  | 'fogOfWarBlurEnabled'
  | 'expandedByDefault'
  | 'alwaysShowControls'
  | 'canvasHeight'
  | 'canvasHeightMobile'
  | 'pictureFrameHeight'
  | 'pictureFrameHeightMobile'
  | 'distancePerCellGrid'
  | 'distanceUnitGrid'
  | 'distancePerCellHex'
  | 'distanceUnitHex'
  | 'gridDiagonalRule'
  | 'distanceDisplayFormat';

const DIRECT_KEYS = new Set<string>([
  'hexOrientation', 'coordinateKeyMode', 'coordinateTextColor', 'coordinateTextShadow',
  'gridLineColor', 'gridLineWidth', 'backgroundColor', 'borderColor', 'coordinateKeyColor',
  'fogOfWarBlurEnabled', 'expandedByDefault', 'alwaysShowControls',
  'canvasHeight', 'canvasHeightMobile', 'pictureFrameHeight', 'pictureFrameHeightMobile',
  'distancePerCellGrid', 'distanceUnitGrid', 'distancePerCellHex', 'distanceUnitHex',
  'gridDiagonalRule', 'distanceDisplayFormat',
] satisfies DirectSettingKey[]);

// Sliders present percentages; settings store fractions. These virtual keys
// carry the conversion so the stored shape stays untouched.
type PercentKey = 'fogOfWarBlurPercent' | 'hoverPreviewScalePercent' | 'hoverPreviewZoomPercent';

function getSettingControlValue(tab: SettingsTabThis, key: string): unknown {
  const settings = tab.plugin.settings;
  if (key.startsWith('features.')) {
    const id = key.slice('features.'.length) as WindroseFeature;
    return settings.features?.[id] ?? true;
  }
  switch (key as PercentKey) {
    case 'fogOfWarBlurPercent':
      return Math.round((settings.fogOfWarBlurFactor || 0.20) * 100);
    case 'hoverPreviewScalePercent':
      return Math.round((settings.hoverPreviewScale != null && settings.hoverPreviewScale !== 0 ? settings.hoverPreviewScale : 1.0) * 100);
    case 'hoverPreviewZoomPercent':
      return Math.round((settings.hoverPreviewZoom != null && settings.hoverPreviewZoom !== 0 ? settings.hoverPreviewZoom : 0.5) * 100);
  }
  if (DIRECT_KEYS.has(key)) {
    return (settings as unknown as Record<string, unknown>)[key];
  }
  return undefined;
}

async function setSettingControlValue(tab: SettingsTabThis, key: string, value: unknown): Promise<void> {
  const settings = tab.plugin.settings;

  if (key.startsWith('features.')) {
    const id = key.slice('features.'.length) as WindroseFeature;
    settings.features = {
      ...settings.features,
      [id]: value === true
    };
    // saveSettings() dispatches windrose-settings-changed itself, so open
    // map views slim down live — same semantics as the imperative path.
    await tab.plugin.saveSettings();
    // Feature-gated groups (Hex, Fog of war, Distance measurement) carry
    // visible() predicates; re-evaluate them in place.
    tab.refreshDomState();
    return;
  }

  switch (key as PercentKey) {
    case 'fogOfWarBlurPercent':
      if (typeof value !== 'number') return;
      settings.fogOfWarBlurFactor = value / 100;
      break;
    case 'hoverPreviewScalePercent':
      if (typeof value !== 'number') return;
      settings.hoverPreviewScale = value / 100;
      break;
    case 'hoverPreviewZoomPercent':
      if (typeof value !== 'number') return;
      settings.hoverPreviewZoom = value / 100;
      break;
    default:
      if (!DIRECT_KEYS.has(key)) return;
      (settings as unknown as Record<string, unknown>)[key] = value;
  }

  tab.settingsChanged = true;
  await tab.plugin.saveSettings();
  // The blur-intensity slider's visibility tracks the soft-edges toggle.
  tab.refreshDomState();
}

function colorItem(name: string, desc: string, key: DirectSettingKey, defaultValue: string): SettingGroupItem {
  return {
    name,
    desc,
    control: { type: 'color', key, defaultValue }
  };
}

function buildFeaturesGroup(): SettingDefinitionItem {
  return {
    type: 'group',
    heading: 'Features',
    items: [
      {
        name: '',
        desc: 'Show or hide entire feature groups. Disabling a feature hides its tools and panels — existing map content always stays visible.'
      },
      ...FEATURE_DEFINITIONS.map((def): SettingGroupItem => ({
        name: def.label,
        desc: def.desc,
        control: {
          type: 'toggle',
          key: `features.${def.id}`,
          defaultValue: true
        }
      }))
    ]
  };
}

function buildHexGroup(): SettingDefinitionItem {
  return {
    type: 'group',
    heading: 'Hex map settings',
    visible: () => isFeatureEnabled('hexMaps'),
    items: [
      {
        name: 'Hex grid orientation',
        desc: 'Default orientation for hex grids (flat-top or pointy-top)',
        control: {
          type: 'dropdown',
          key: 'hexOrientation',
          options: { flat: 'Flat-top', pointy: 'Pointy-top' },
          defaultValue: DEFAULTS.hexOrientation
        }
      },
      {
        name: 'Coordinate overlay mode',
        desc: 'How the coordinate key activates labels: hold to show temporarily, or toggle on and off',
        control: {
          type: 'dropdown',
          key: 'coordinateKeyMode',
          options: { hold: 'Hold to show', toggle: 'Toggle on/off' },
          defaultValue: 'hold'
        }
      },
      colorItem('Coordinate text color', 'Primary color for hex coordinate overlay text',
        'coordinateTextColor', SETTING_DEFAULTS.DEFAULT_COORDINATE_TEXT_COLOR),
      colorItem('Coordinate text shadow', 'Shadow/outline color for hex coordinate overlay text',
        'coordinateTextShadow', SETTING_DEFAULTS.DEFAULT_COORDINATE_TEXT_SHADOW)
    ]
  };
}

function buildColorGroup(): SettingDefinitionItem {
  return {
    type: 'group',
    heading: 'Color settings',
    items: [
      {
        name: '',
        desc: 'These settings control default colors and behavior for all windrosemd maps in this vault.'
      },
      colorItem('Grid line color', 'Color for grid lines',
        'gridLineColor', SETTING_DEFAULTS.DEFAULT_GRID_LINE_COLOR),
      {
        name: 'Grid line width',
        desc: 'Thickness of grid lines in pixels (1-5). Applies to grid maps only.',
        control: { type: 'slider', key: 'gridLineWidth', min: 1, max: 5, step: 1, defaultValue: 1 }
      },
      colorItem('Background color', 'Canvas background color',
        'backgroundColor', SETTING_DEFAULTS.DEFAULT_BACKGROUND_COLOR),
      colorItem('Border color', 'Color for painted cell borders',
        'borderColor', SETTING_DEFAULTS.DEFAULT_BORDER_COLOR),
      colorItem('Coordinate key color', 'Background color for coordinate key indicator',
        'coordinateKeyColor', SETTING_DEFAULTS.DEFAULT_COORDINATE_KEY_COLOR)
    ]
  };
}

function buildDungeonGenerationGroup(tab: SettingsTabThis): SettingDefinitionItem {
  return {
    type: 'group',
    heading: 'Dungeon generation',
    visible: () => isFeatureEnabled('dungeonGenerator'),
    items: [
      {
        name: '',
        desc: 'Default colors the random dungeon generator uses for each style. Pickers set the floor, wall, and water colors in that order.'
      },
      ...DUNGEON_STYLE_NAMES.map((style): SettingGroupItem => ({
        name: DUNGEON_STYLE_LABELS[style],
        desc: 'Floor, wall, and water colors',
        render: (setting) => {
          addDungeonStyleColorPickers(tab, setting, style, () => tab.update());
        }
      }))
    ]
  };
}

function fogPackRow(tab: SettingsTabThis, pack: InstalledPack): SettingGroupItem {
  const imagePath = fogPackImagePath(pack);
  const isActive = tab.plugin.settings.fogOfWarImage === imagePath;
  return {
    name: pack.name + (isActive ? ' (active)' : ''),
    desc: 'v' + pack.version,
    render: (setting) => {
      if (!isActive) {
        setting.addButton(btn => btn
          .setButtonText('Set as default')
          .onClick(async () => {
            tab.plugin.settings.fogOfWarImage = imagePath;
            tab.settingsChanged = true;
            await tab.plugin.saveSettings();
            tab.update();
          }));
      }
      setting.addExtraButton(btn => btn
        .setIcon('trash-2')
        .setTooltip('Remove')
        .onClick(async () => {
          const packs = tab.plugin.settings.installedContentPacks ?? [];
          tab.plugin.settings.installedContentPacks = packs.filter(p => p.id !== pack.id);
          if (isActive) {
            tab.plugin.settings.fogOfWarImage = null;
          }
          await tab.plugin.saveSettings();
          tab.settingsChanged = true;
          tab.update();
        }));
    }
  };
}

function buildFogGroup(tab: SettingsTabThis): SettingDefinitionItem {
  const fogPacks = getInstalledPacks(tab.plugin).filter(p => p.type === 'fog-pack');
  return {
    type: 'group',
    heading: 'Fog of war',
    visible: () => isFeatureEnabled('fogOfWar'),
    items: [
      {
        name: '',
        desc: 'Default fog of war appearance settings for new maps. Individual maps can override these in their settings.'
      },
      {
        name: 'Soft edges',
        desc: 'Enable a blur effect at fog boundaries for a softer, more atmospheric look',
        control: { type: 'toggle', key: 'fogOfWarBlurEnabled' }
      },
      {
        name: 'Blur intensity',
        desc: 'Size of blur effect as percentage of cell size',
        visible: () => tab.plugin.settings.fogOfWarBlurEnabled,
        control: {
          type: 'slider',
          key: 'fogOfWarBlurPercent',
          min: 5, max: 50, step: 1,
          defaultValue: 20,
          displayFormat: (value: number) => `${value}%`
        }
      },
      ...(fogPacks.length > 0 ? [{ name: 'Installed fog textures' } satisfies SettingGroupItem] : []),
      ...fogPacks.map(pack => fogPackRow(tab, pack)),
      {
        name: 'Browse fog textures',
        desc: 'Download tileable fog of war textures from the content library',
        render: (setting) => {
          setting.addButton(btn => btn
            .setButtonText('Browse')
            .onClick(() => {
              new ContentPackBrowserModal(tab.app, tab.plugin, 'fog-pack', () => {
                tab.settingsChanged = true;
                tab.update();
              }).open();
            }));
        }
      }
    ]
  };
}

function buildBehaviorGroup(): SettingDefinitionItem {
  return {
    type: 'group',
    heading: 'Map behavior',
    items: [
      {
        name: 'Start maps expanded',
        desc: 'When enabled, maps will start in expanded (fullscreen) mode by default',
        control: { type: 'toggle', key: 'expandedByDefault' }
      },
      {
        name: 'Always show controls',
        desc: 'Keep map controls visible at all times instead of auto-hiding',
        control: { type: 'toggle', key: 'alwaysShowControls' }
      },
      {
        name: 'Canvas height (desktop)',
        desc: 'Default height in pixels for map canvas on desktop devices',
        control: { type: 'number', key: 'canvasHeight', placeholder: '600', step: 1 }
      },
      {
        name: 'Canvas height (mobile/touch)',
        desc: 'Default height in pixels for map canvas on mobile and touch devices',
        control: { type: 'number', key: 'canvasHeightMobile', placeholder: '400', step: 1 }
      },
      {
        name: 'Picture frame height (desktop)',
        desc: 'Height in pixels for embedded maps in picture frame mode on desktop devices',
        control: { type: 'number', key: 'pictureFrameHeight', placeholder: '400', step: 1 }
      },
      {
        name: 'Picture frame height (mobile/touch)',
        desc: 'Height in pixels for embedded maps in picture frame mode on mobile and touch devices',
        control: { type: 'number', key: 'pictureFrameHeightMobile', placeholder: '300', step: 1 }
      },
      {
        name: 'Link preview size',
        desc: 'Scale of the hover preview panel',
        control: {
          type: 'slider', key: 'hoverPreviewScalePercent',
          min: 50, max: 200, step: 10, defaultValue: 100,
          displayFormat: (value: number) => `${value}%`
        }
      },
      {
        name: 'Link preview zoom',
        desc: 'How zoomed in the preview map appears',
        control: {
          type: 'slider', key: 'hoverPreviewZoomPercent',
          min: 10, max: 200, step: 10, defaultValue: 50,
          displayFormat: (value: number) => `${value}%`
        }
      }
    ]
  };
}

const GRID_UNITS: [string, string][] = [['ft', 'Feet'], ['m', 'Meters'], ['mi', 'Miles'], ['km', 'Kilometers'], ['yd', 'Yards']];
const HEX_UNITS: [string, string][] = [['mi', 'Miles'], ['km', 'Kilometers'], ['ft', 'Feet'], ['m', 'Meters'], ['yd', 'Yards']];

function buildUnitOptions(
  tab: SettingsTabThis,
  baseUnits: [string, string][],
  unitKey: 'distanceUnitGrid' | 'distanceUnitHex'
): Record<string, string> {
  const options: Record<string, string> = {};
  for (const [value, label] of baseUnits) {
    options[value] = label;
  }
  // Custom units from enabled travel packs (TM-24)
  const packUnits = getPackUnitOptions(
    tab.plugin.settings.travelPacks,
    baseUnits.map(([value]) => value)
  );
  for (const option of packUnits) {
    options[option.value] = option.label;
  }
  // Keep a unit from a since-disabled pack listed so the dropdown never
  // silently switches the setting
  const current = tab.plugin.settings[unitKey];
  if (current !== '' && !(current in options)) {
    options[current] = `${current} (pack disabled)`;
  }
  return options;
}

function buildMeasurementGroup(tab: SettingsTabThis): SettingDefinitionItem {
  return {
    type: 'group',
    heading: 'Distance measurement',
    visible: () => isFeatureEnabled('measurement'),
    items: [
      {
        name: 'Grid map: Distance per cell',
        desc: 'Distance each cell represents on grid maps (default: 5 ft for d&d)',
        control: {
          type: 'number', key: 'distancePerCellGrid', placeholder: '5', step: 'any',
          validate: (value: number) => (value > 0 ? undefined : 'Enter a distance greater than 0')
        }
      },
      {
        name: 'Grid map: Distance unit',
        desc: 'Unit for distances on grid maps',
        control: { type: 'dropdown', key: 'distanceUnitGrid', options: buildUnitOptions(tab, GRID_UNITS, 'distanceUnitGrid') }
      },
      {
        name: 'Hex map: Distance per hex',
        desc: 'Distance each hex represents on hex maps (default: 6 miles for world maps)',
        control: {
          type: 'number', key: 'distancePerCellHex', placeholder: '6', step: 'any',
          validate: (value: number) => (value > 0 ? undefined : 'Enter a distance greater than 0')
        }
      },
      {
        name: 'Hex map: Distance unit',
        desc: 'Unit for distances on hex maps',
        control: { type: 'dropdown', key: 'distanceUnitHex', options: buildUnitOptions(tab, HEX_UNITS, 'distanceUnitHex') }
      },
      {
        name: 'Grid diagonal movement',
        desc: 'How to calculate diagonal distance on grid maps',
        control: {
          type: 'dropdown',
          key: 'gridDiagonalRule',
          options: {
            alternating: 'Alternating (5-10-5-10, d&d 5e)',
            equal: 'Equal (chebyshev, all moves = 1)',
            euclidean: 'True distance (euclidean)'
          }
        }
      },
      {
        name: 'Distance display format',
        desc: 'How to display measured distances',
        control: {
          type: 'dropdown',
          key: 'distanceDisplayFormat',
          options: {
            both: 'Cells and units (e.g., "3 cells (15 ft)")',
            cells: 'Cells only (e.g., "3 cells")',
            units: 'Units only (e.g., "15 ft")'
          }
        }
      }
    ]
  };
}

/**
 * Phase 1 definition set: every stock-control section of the settings tab.
 * Color Palette, Object Types, Travel Packs, Tile Sets (lists) and Keyboard
 * Shortcuts arrive in Phases 2-3; until then this array must stay behind the
 * spike flag — on 1.13+ a non-empty return renders ONLY these definitions.
 */
function buildSettingDefinitions(tab: SettingsTabThis): SettingDefinitionItem[] {
  return [
    buildFeaturesGroup(),
    buildHexGroup(),
    buildColorGroup(),
    buildDungeonGenerationGroup(tab),
    buildFogGroup(tab),
    buildBehaviorGroup(),
    buildMeasurementGroup(tab)
  ];
}

export { buildSettingDefinitions, getSettingControlValue, setSettingControlValue };

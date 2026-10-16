# Plugin Settings Tab (src/settings)

The global Windrose entry in Obsidian's settings, built on the **declarative Settings API (Obsidian 1.13+)**. Rendering, search indexing and list mechanics are framework-owned; this directory supplies definition arrays and the control-value plumbing. There is no imperative `display()` render path. (Per-map settings are a different thing: `components/settings/CLAUDE.md`.)

## Files

```
WindroseSettingsTab.ts        # PluginSettingTab subclass: getSettingDefinitions(), getControlValue(), setControlValue(),
│                             #   object-settings helpers for the current map type (grid/hex)
├── settingDefinitions.ts     # buildSettingDefinitions(tab): stock sections, dungeon pickers, shortcuts, import banner;
│                             #   getSettingControlValue / setSettingControlValue (control value plumbing)
├── settingDefinitionLists.ts # List sections: colors, travel packs, tile sets
├── settingDefinitionObjects.ts # Object types / categories / object sets section
├── tabs/settingsTabContext.ts  # Structural plugin/tab types for definition builders
├── helpers/                  # FolderSuggest, colorHelpers, folderDetection, objectHelpers, objectSetHelpers, rpgAwesomeHelpers
├── modals/                   # Native Obsidian Modal classes (Add tiles, Object/Category/Color edit, Travel pack edit,
│                             #   Import/Export, Object set import/export/rename, Insert dungeon, Confirm, Prompt)
├── DeeplinkHover.ts          # Hover preview wiring for deep links
└── DungeonEssenceVisualizer.ts # Dungeon preview animation used by InsertDungeonModal
```

## Where control-value plumbing lives

- Controls in a definition array are identified by a string `key`.
- `getSettingControlValue(tab, key)` / `setSettingControlValue(tab, key, value)` in `settingDefinitions.ts` map keys to `plugin.settings`:
  - `features.<id>` keys read/write `settings.features` (absent = enabled).
  - Percent slider keys (`fogOfWarBlurPercent`, `hoverPreviewScalePercent`, `hoverPreviewZoomPercent`) convert to stored fractions.
  - Plain settings are listed in `DIRECT_KEYS` and are read/written as `settings[key]`.
- `WindroseSettingsTab.getControlValue`/`setControlValue` delegate to these. Saving goes through `plugin.saveSettings()`.
- Definitions must stay synchronous; async data (e.g. whether old-plugin data exists) is cached on the tab and read in `visible()`.

## Ladder capability setting

`lodLadder` (declared in `settingDefinitions.ts`, a developer toggle, not in DEFAULTS) is the CAPABILITY only: whether this install may use the lattice ladder. The per-map opt-in is `mapData.lod`, set through `components/settings/hexmap/LadderSection.tsx`. A map that carries `lod` is a ladder map on every install, flag or not; read the combined answer through `core/lodFlags.ts`, never the setting directly.

## Adding a setting

1. Add the field to `PluginSettings` in `types/settings/settings.types.ts` (and a default in `core/settingsAccessor.ts`).
2. Add a control to the appropriate definition builder. For a plain value, add its key to `DIRECT_KEYS` (and `DirectSettingKey`); for a converted value, add a case in the get/set functions.
3. Read it at runtime via `getSetting()` in `core/settingsAccessor.ts`, never from a stale copy.
4. UI strings must pass `npm run lint:scanner` (sentence case, no mid-sentence brand names).

## Gotchas

- No inline eslint-disable directives for rules outside the obsidianmd preset (see root `CLAUDE.md`).
- Modals here are native `Modal` subclasses, not Preact portals.
- Plugin `data.json` is plugin-owned; do not edit it while Obsidian is running.

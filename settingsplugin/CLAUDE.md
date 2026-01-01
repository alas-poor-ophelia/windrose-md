# Settings Plugin

## Purpose

A standalone Obsidian plugin that provides global settings, color palettes, object customization, and import/export functionality. This is SEPARATE from the main Windrose application - it's an optional companion plugin users can install.

## Critical: Build/Assembly Process

The settings plugin is **NOT** loaded at runtime like the main app. It's assembled into a standalone `main.js` file on **install or upgrade only**.

### How It Works

1. `SettingsPluginInstaller.jsx` detects either:
   - Plugin not installed (offers install)
   - Newer version available via `PACKAGED_PLUGIN_VERSION` (offers upgrade)

2. On install/upgrade, it calls `settingsPluginAssembler.js` which:
   - Loads all `settingsPlugin-*.js` source files via `dc.require()`
   - Each source file returns a **template string** (not executable code)
   - Concatenates them into sections (helpers, modals, tab renders)
   - Substitutes into `settingsPluginMain.js` template placeholders
   - Injects constants (OBJECT_TYPES, RA_ICONS, THEME values, etc.)

3. The assembled `main.js` is written to `.obsidian/plugins/dungeon-map-tracker-settings/`

4. Obsidian loads it as a standard plugin

### Why Template Strings?

This is a Datacore quirk. The project "compiler" needs to execute each file with Datacore to package them. If the files contained raw Obsidian plugin code, Datacore would fail to run them. By returning template strings, Datacore can execute the files successfully, and the actual plugin code is only assembled at install time.

```javascript
// settingsPlugin-SomeHelper.js - Returns template string, NOT executable code
return `
  // Helper functions for something
  function doSomething() {
    // ...
  }
`;
```

## File Structure

```
SettingsPluginInstaller.jsx    # React component for install/upgrade UI
settingsPluginAssembler.js     # Assembles template strings into main.js

settingsPluginMain.js          # Base template with placeholders:
                               # {{HELPER_NAMESPACES}}
                               # {{MODAL_CLASSES}}
                               # {{TAB_RENDER_METHODS}}

# Helper template strings (concatenated into {{HELPER_NAMESPACES}})
├── settingsPlugin-ObjectHelpers.js
├── settingsPlugin-ColorHelpers.js
├── settingsPlugin-DragHelpers.js
├── settingsPlugin-IconHelpers.js
├── settingsPlugin-RPGAwesomeHelpers.js
└── settingsPlugin-DungeonEssenceVisualizer.js

# Modal template strings (concatenated into {{MODAL_CLASSES}})
├── settingsPlugin-InsertMapModal.js
├── settingsPlugin-InsertDungeonModal.js
├── settingsPlugin-ObjectEditModal.js
├── settingsPlugin-CategoryEditModal.js
├── settingsPlugin-ColorEditModal.js
├── settingsPlugin-ExportModal.js
└── settingsPlugin-ImportModal.js

# Tab render template strings (concatenated into {{TAB_RENDER_METHODS}})
├── settingsPlugin-TabRenderCore.js
├── settingsPlugin-TabRenderSettings.js
├── settingsPlugin-TabRenderColors.js
└── settingsPlugin-TabRenderObjects.js

settingsPlugin-styles.js       # CSS content (written to styles.css)
settingsPlugin-quickSymbols.js # Quick symbol definitions
```

## Assembly Flow

```
User clicks "Install Plugin" or "Update Plugin"
  │
  ▼
SettingsPluginInstaller.jsx
  │
  ├─► generatePluginFiles()
  │     │
  │     ▼
  │   settingsPluginAssembler.js
  │     │
  │     ├─► Load all settingsPlugin-*.js via dc.require()
  │     │   (each returns a template string)
  │     │
  │     ├─► Concatenate into HELPERS, MODALS, TAB_RENDERS
  │     │
  │     └─► Replace placeholders in settingsPluginMain.js
  │
  ├─► Replace {{BUILT_IN_OBJECTS}}, {{RA_ICONS}}, etc.
  │
  └─► Write to .obsidian/plugins/dungeon-map-tracker-settings/
        ├── manifest.json
        ├── main.js (assembled)
        ├── styles.css
        └── data.json (user settings, preserved on upgrade)
```

## Key Differences from Main App

| Aspect | Main App | Settings Plugin |
|--------|----------|-----------------|
| Runtime | Datacore script | Obsidian plugin |
| Source format | Datacore JS/JSX | Template strings |
| When built | Never (interpreted) | On install/upgrade |
| Entry | Markdown code block | Plugin manifest |
| State | React Context | Obsidian Settings API |
| Persistence | JSON file in vault | Plugin data.json |

## Version Management

- `PACKAGED_PLUGIN_VERSION` in `SettingsPluginInstaller.jsx` defines current version
- `compareVersions()` checks if upgrade is available
- User can decline upgrade (stored in localStorage by version)
- `data.json` is preserved during upgrades (user settings safe)

## Adding New Plugin Features

1. Create `settingsPlugin-FeatureName.js` returning a template string
2. Add to appropriate section in `settingsPluginAssembler.js`
3. If new placeholder needed, add to `settingsPluginMain.js`
4. Bump `PACKAGED_PLUGIN_VERSION`
5. Test by triggering upgrade flow

## Common Gotchas

- **Template strings, not code** - Files return strings that become code after assembly
- **No Datacore at runtime** - Assembled plugin runs in Obsidian, not Datacore
- **Test the assembled output** - Syntax errors only appear after install
- **Unicode escaping** - PUA characters (RPG Awesome) need `\uXXXX` escaping
- **Preserve data.json** - Never overwrite on upgrade
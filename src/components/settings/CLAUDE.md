# Settings Components

## Purpose

This directory contains the per-map settings modal and its constituent UI components. These handle map configuration, appearance, measurement settings, and hex-specific options.

## Structure

```
MapSettingsModal.tsx         # Main modal container, tab navigation
├── AppearanceTab.tsx        # Colors, grid appearance, visibility
├── MeasurementTab.tsx       # Distance units, scale settings
├── PreferencesTab.tsx       # UI preferences, behavior options
├── NativeControls.tsx       # Native Obsidian modal controls
├── SettingItem.tsx          # Reusable setting item component
├── ResizeConfirmDialog.tsx  # Confirmation for destructive resizes
├── settingsReducer.ts       # Settings state reducer
├── gridmap/                 # Grid-specific settings sections
└── hexmap/                  # Hex-specific settings sections
```

Note: `CollapsibleSection` and `ColorPicker` now live in `components/shared/`.

## Patterns

### Tab Structure

Each tab component:
- Receives settings via `useMapSettings()` context
- Dispatches changes via settings reducer actions
- Groups related settings into Sections
- Handles its own validation

```javascript
function SomeTab() {
  const { settings, dispatch } = useMapSettings();
  
  const handleChange = (value) => {
    dispatch({ type: 'UPDATE_SETTING', payload: { key: 'settingName', value } });
  };
  
  return (
    <CollapsibleSection title="Section Name">
      {/* controls */}
    </CollapsibleSection>
  );
}
```

### Section Components

Sections are logical groupings within tabs:
- Self-contained UI for related settings
- Use `CollapsibleSection` for consistent expand/collapse
- Handle local validation before dispatching

### Modal Considerations

- Modal renders via `ModalPortal.tsx` (portal to document body)
- Must handle Escape key to close
- Must trap focus for accessibility
- Touch-friendly control sizing

## State Flow

```
User Input → Tab Component → dispatch(action) → settingsReducer → 
  → MapSettingsContext updates → All consumers re-render
```

Settings persist to map data JSON via `useDataHandlers`.

## Conditional Rendering

Many settings are grid-only or hex-only:
```javascript
const { settings } = useMapSettings();
const isHex = settings.mapType === 'hex';

return (
  <>
    {isHex && <HexSpecificControl />}
    {!isHex && <GridSpecificControl />}
    <SharedControl />
  </>
);
```

## Adding New Settings

1. Add to `types/settings/settings.types.ts` type definition
2. Add default value in `settingsReducer.ts`
3. Add reducer case for the action
4. Create UI in appropriate Tab/Section
5. Wire up via `dispatch({ type: 'UPDATE_SETTING', ... })`

## Common Gotchas

- **Don't mutate settings directly** - Always use dispatch
- **Validate before dispatch** - Reducer assumes valid data
- **Consider hex vs grid** - Most settings apply to both, some don't
- **Test on iPad** - Modals are tricky with virtual keyboard
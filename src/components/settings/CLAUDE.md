# Settings Components (per-map settings modal)

## Purpose

The per-map settings modal and its UI: appearance, measurement, preferences, and grid/hex-specific sections. (The plugin-wide Obsidian settings tab is a different thing: see `src/settings/CLAUDE.md`.)

## Structure

```
MapSettingsModal.tsx         # Modal shell + tab bar; wraps content in MapSettingsProvider via NativeModalPortal
├── AppearanceTab.tsx        # Colors, line width, object set, fog image
├── MeasurementTab.tsx       # Distance units / scale
├── PreferencesTab.tsx       # Remember pan/zoom, sidebar, expanded state
├── NativeControls.tsx       # Native Obsidian control wrappers (Setting components created imperatively)
├── SettingItem.tsx          # Label + description + control row
├── ImageSearchField.tsx     # Shared image-search input with autocomplete (grid + hex background image)
├── ResizeConfirmDialog.tsx  # Confirmation for destructive bounds resizes
├── settingsReducer.ts       # State shape, Actions, reducer, buildInitialState, bounds helpers
├── gridmap/GridBackgroundTab.tsx
└── hexmap/                  # HexGridTab + BackgroundImageSection, BoundsSection,
                             #   CoordinateDisplaySection, SizingModeSection, SubHexBackdropSection
```

`CollapsibleSection` and `ColorPicker` live in `components/shared/`.

## State and Context

- State is a `useReducer(settingsReducer, ...)` inside `MapSettingsProvider` (`src/context/MapSettingsContext.tsx`). The provider exists **only while this modal is open**.
- Tabs read through four selector hooks (each throws outside the provider):
  - `useModalShell()`: active tab, tabs, `mapType`/`isHexMap`, save/cancel, distance and preference fields
  - `useAppearance()`: overrides, global settings, color picker state, object set, fog image
  - `useBackgroundImage()`: image path/opacity/offset, sizing mode, density, measurement sizing, fine-tune
  - `useHexGrid()`: hex bounds, bounds shape/lock, coordinate display, resize confirm
- Tabs call the `handle*` / `set*` callbacks from these values; the provider dispatches reducer actions. Tabs rarely dispatch directly.
- Actions are the `Actions` constant in `settingsReducer.ts` (for example `SET_TAB`, `SET_OVERRIDE`, `SET_DISTANCE_SETTING`, `SET_HEX_BOUNDS`, `IMAGE_SELECTED`, `SET_DENSITY`, `SET_SIZING_MODE`, `TOGGLE_BOUNDS_LOCK`, `SET_PARENT_BACKDROP`).
- Save writes back into map data via the callbacks passed to the modal (see `onSave` flow in `MapSettingsContext.tsx`).

```
User input -> tab handler (from a selector hook) -> dispatch(Actions.X) -> settingsReducer
  -> provider recomputes context values -> consumers re-render -> Save -> onSave -> map data
```

## Modal Notes

- Opened through `NativeModalPortal` (`components/modals/`): a native Obsidian `Modal` hosting the Preact tree. `ModalPortal.tsx` is a different, fallback portal used by a few overlays; this modal does not use it.
- Touch-friendly sizing; test on iPad (virtual keyboard).

## Conditional Rendering

Hex-only vs grid-only sections branch on `isHexMap`/`mapType` from `useModalShell()`; the tab list itself is built per map type. `SubHexBackdropSection` is only relevant while editing a sub-hex map's settings.

## Adding a New Setting

1. Add the field to the right type (`types/settings/settings.types.ts`, or the `SettingsModalState` / `SettingsOverrides` shapes in `settingsReducer.ts`).
2. Seed it in `buildInitialState` in `settingsReducer.ts`.
3. Add an `Actions` entry and a `settingsReducer` case.
4. Expose it (value + handler) through the matching sub-context in `MapSettingsContext.tsx` (add to its `*ContextValue` interface and the memoized value).
5. Build the UI in the right tab/section using the selector hook.
6. Include it in the save path so it reaches map data, and test grid and hex.

## Gotchas

- Don't mutate state directly; dispatch.
- Don't import `MapSettingsContext` hooks from map layers: no provider exists there.
- Most settings apply to both map types; guard the exceptions.

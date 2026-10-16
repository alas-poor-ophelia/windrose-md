# Windrose MapDesigner - Claude Context

## Project Overview

Windrose MapDesigner is a TTRPG dungeon/world mapping tool built as a standalone Obsidian Community Plugin using Preact. It supports both grid and hex maps with drawing tools, object placement, text labels, fog of war, layer management, and coordinate systems.

**Philosophy**: "Digital graph paper in Obsidian" that grew into a full cartography application. Prioritizes stable foundations over quick wins, maintainability over cleverness, and touch-first design for cross-platform compatibility.

## Critical Constraints

### Standalone Plugin Architecture

This is a standard Obsidian Community Plugin using Preact (not React):

- **ES module imports/exports** — standard `import`/`export` syntax throughout
- **Preact hooks** — `useState`, `useCallback`, `useMemo`, `useEffect` from `preact/hooks`
- **esbuild bundling** — `esbuild.config.mjs` compiles to `main.js`
- **Obsidian API** — `import { Plugin, Modal, Setting } from 'obsidian'`
- **App access** — `useApp()` hook from `src/context/AppContext.tsx` in components, `app: App` parameter in utility functions

```typescript
// Standard Windrose pattern
import { useState, useCallback } from 'preact/hooks';
import { useMapState } from '../context/MapContext';
import type { Cell } from '#types/core/cell.types';

function MyComponent() {
  const { geometry } = useMapState();
  const [state, setState] = useState(null);
  // ...
}

export { MyComponent };
```

### TypeScript Configuration

- Standard TypeScript with all strict flags enabled
- Type files in `types/` directory with path alias `#types/*`
- JSX configured for Preact (`jsxImportSource: "preact"`)
- `tsconfig.check.json` for type checking (separate from build)

### Development Environment (Single-Repo Standalone)
`src/` is a real, tracked directory in this repo — the actual plugin source. Dependencies and tooling live at the dev root; the built plugin is deployed into the vault for testing:
```
windrose/                        # Development root (OUTSIDE vault)
├── node_modules/                # Dependencies live here, not in vault
├── esbuild.config.mjs           # Build config
├── package.json
├── tsconfig.json
├── types/                       # TypeScript type definitions
│   ├── core/  contexts/  hooks/  objects/  settings/  tiles/  tools/  content-packs/
│   └── index.ts                 # Barrel export (prefer direct '#types/core/...' imports)
├── tests/
│   ├── unit/                    # Vitest unit tests (~2,450 tests, ~4-5 s)
│   └── e2e/                     # obsidian-testing-framework + Vitest, drives real Obsidian
└── src/                         # Plugin source — real tracked directory (~315 files)
```

#### Why this structure:
- Source lives in the repo (version-controlled, single source of truth) — not in the vault
- Dependencies/tooling (TypeScript, ESLint, esbuild) run from the dev root with full Node.js access
- `npm run deploy` builds and copies the plugin into the vault for live testing in Obsidian
- Types are referenced via `#types/*` path alias

## Architecture Patterns

### Context + Hooks + Layers

The codebase follows a composition pattern:

- **Context Providers**: `AppContext`, `MapContext`, `MapSelectionContext`, `ObjectLinkingContext`, `EventHandlerContext`, `WeatherContext` (per-map weather store + fog view, inert outside a provider); `MapSettingsContext` exists only inside the per-map settings modal (see `context/CLAUDE.md`)
- **Custom Hooks**: Encapsulate complex logic (`useCanvasRenderer`, `useDrawingTools`, `useEventCoordinator`, etc.)
- **Layer Components**: Separate rendering concerns (`DrawingLayer`, `ObjectLayer`, `FogOfWarLayer`, etc.)

### Geometry Abstraction

- `BaseGeometry.ts` — Abstract base class with iOS canvas workarounds
- `GridGeometry.ts` — Square grid implementation
- `HexGeometry.ts` — Hexagonal grid implementation
- Components use geometry abstraction, never assume grid vs hex
- See `geometry/CLAUDE.md` for IGeometry methods, coordinate systems, and iOS canvas patterns

### Glossary

- **Beacon (UI) = PartyPin (code)**: the party marker. Persisted key is `partyPins`; user label is generated as `Beacon N`. Related files are named `partyPin*` / `party*`.
- **Sub-hex**: a hex cell drilled into as its own map (`subHexMaps`, `useSubHexNavigation`).
- **Full-pane**: the map opened as an Obsidian view (`views/WindroseMapView.ts`) rather than a code-block embed.
- `DungeonMapTracker` is the root map component (historical name); `dmtConstants.ts` holds shared constants.

### State Management

- Preact Context API for shared state
- Custom hooks with `useCallback`/`useMemo` for performance
- Settings managed through `settingsReducer.ts` and `settingsAccessor.ts` (reads from plugin singleton)

### Plugin Entry Point

`src/main.ts` — extends Obsidian's `Plugin` class:
- Registers `windrose-map` code block processor (YAML → map render)
- Registers deep link handlers (protocol, markdown, CM6 extension)
- Loads/saves plugin settings via `settingsAccessor.ts`
- Provides `App` instance to components via `AppContext`

## File Organization

```
src/
├── main.ts               # Plugin entry point
├── DungeonMapTracker.tsx  # Root map component (one per mounted map)
├── core/                  # App infrastructure
│   ├── dmtConstants.ts    # Constants, theme, defaults, schema version, segment tables
│   ├── settingsAccessor.ts # Plugin settings read/write
│   ├── featureFlags.ts    # Feature gating (absent = enabled)
│   ├── windroseEvents.ts  # Typed registry of windrose:* custom DOM events
│   ├── paintedViewStore.ts # Per-canvas record of the viewState last actually painted
│   ├── subHexBackdropStore.ts # Parent-map snapshot store for sub-hex dives
│   ├── deepLinkRegistration.ts # Deep link system (4-layer)
│   └── interactjs.ts      # interact.js wrapper
├── objects/               # Map object domain (objectOperations, partyPin*, shapeOverlay*, selection)
├── drawing/               # Pure map-editing math: cells, edges, walls, wall gaps, routes, tiles, scatter, terrain strokes
├── text/                  # Text label domain
├── travel/                # Travel packs (units, terrains, modes, allowances), segment terrain sampler, forecastWalk.ts (day-by-day walk of a route through forecast weather)
├── weather/               # Optional U+13080 Weather plugin (id `wadjet`) integration — public API only
│   ├── wadjetBridge.ts    # The ONE contact point: API lookup, 0.3.x vs apiVersion-1 feature detection, safe reads,
│   │                      #   event subscription (payloads, unload), connectZoneResolver / connectInterpreter
│   ├── weatherStore.ts    # WeatherStoreCore: per-map store core (report cache, view time, invalidation, rebind,
│   │                      #   45-day ground history, travel-rules setting bump)
│   ├── weatherAreas.ts    # Weather areas of the shown level (bound regions + map-level zone, sub-hex inheritance),
│   │                      #   resolveWeatherAnimate (Sky setting inherited like the zone)
│   ├── weatherFog.ts      # THE fog rule for weather UI: buildWeatherFogView / useWeatherFog (isFogged, areaRevealed,
│   │                      #   revealedAreas; regions revealed at >= 50% unfogged). Weather never reveals fogged cells/areas
│   ├── weatherZones.ts    # Region/cell → zone lookups, route segment fold, mounted-map zone snapshots
│   ├── windroseZoneResolver.ts # Answers `hex` and `windrose.region` locators (open maps sync; closed maps read-only async,
│   │                      #   parsed zones cached per map until the data file is modified)
│   ├── travelInterpreter.ts # `windrose.travel` interpreter; documents Windrose's travel result shape { speedMultiplier, label? }
│   ├── weatherTravelRules.ts # Rule table: report → speed multiplier + reasons
│   ├── weatherClassify.ts # Local classify/describe fallbacks for 0.3.x plugins
│   ├── weatherVisuals.ts  # Report → region tint / badge; formatTemperature (the one °C/°F formatter)
│   ├── weatherRegionMenu.ts # Region context-menu zone binding (unbind deletes the key)
│   ├── svgGlyph.ts        # Allowlist parser for the plugin's glyph SVG (never innerHTML; ids prefixed per instance)
│   ├── forecastRoute.ts   # A route's day-by-day weather costing (measure tool, departure window)
│   ├── skyWeather.ts      # Report → Sky parameters (precipitation, cloud, wind)
│   ├── skyClip.ts         # Weather area outlines (cells minus fog) as world-space shapes / SVG paths
│   ├── skyCells.ts        # Map-side shape inputs: cell corners, the whole-map cell list
│   ├── groundState.ts     # Snow cover / mud derivation (Windrose's, not the plugin's)
│   └── sky/               # Animated Sky layer engine (SkyEngine, skyMath, skySprites, skyTypes)
├── assets/                # Icons, tileset operations, and the tile import/prediction pipeline (import*, *Predictor, tile*)
├── content-packs/         # Content pack browser/download/install/registry, DD pack import
├── persistence/           # Data I/O & vault interaction (fileOperations, saveCoordinator, schemaMigration, exportOperations, layerAccessor, fogOperations, subHexPath)
├── utils/                 # Dev/diagnostic probes (perfTelemetry, zoomTraceProbe, inputEventProbe, canvasCapabilityReport) plus small shared guards: keyboardTargets.ts (typing-surface check for map key handlers), assertNever.ts (exhaustive-switch guard: `default: return assertNever(x)`)
├── views/                 # WindroseMapView.ts (full-pane Obsidian view)
├── geometry/
│   ├── core/              # Geometry abstractions (Base/Grid/Hex), createGeometry, contentFitView, subHexBackdrop
│   ├── renderers/         # Canvas draw functions
│   ├── fog/               # Fog-of-war rendering pipeline
│   ├── strokes/           # Terrain stroke geometry
│   └── curves/            # Bezier math & boolean ops
├── hooks/
│   ├── canvas/            # Canvas infrastructure
│   ├── drawing/           # Drawing tools
│   ├── objects/           # Object interactions
│   ├── state/             # State management & data
│   ├── app/               # Root-component composition hooks (DungeonMapTracker only)
│   └── interactions/      # Feature-specific tool interactions
├── components/
│   ├── controls/          # Map chrome & navigation
│   ├── modals/            # Modal dialogs (native Obsidian)
│   ├── overlays/          # Non-modal floating UI
│   ├── panels/            # Sidebar/docked panels
│   ├── toolbars/          # Action toolbars
│   ├── shared/            # Reusable primitives (Icon, InternalLink)
│   ├── hosts/             # DMT layout hosts: one prop bag per panel (panelBags/buildPanelBags), TileBrowserHost (block|fullpane|floating), edge rail, drawers, dock column, floating panels, canvas layers
│   ├── mapcanvas/         # Canvas layer components
│   └── settings/          # Settings UI components
├── context/               # Preact Contexts
├── settings/              # Obsidian settings tab (declarative 1.13+ Settings API); see settings/CLAUDE.md
│   ├── WindroseSettingsTab.ts       # Tab class: definitions + control value plumbing
│   ├── settingDefinitions.ts        # Stock sections, dungeon pickers, shortcuts, banner
│   ├── settingDefinitionLists.ts    # List sections: colors, travel packs, tile sets
│   ├── settingDefinitionObjects.ts  # Object types section
│   ├── helpers/           # Settings utilities
│   ├── modals/            # Settings modals
│   └── tabs/settingsTabContext.ts   # Structural tab type for definition builders
└── generation/            # Random map generation (dungeonGenerator.ts, objectPlacer.ts, dungeonStyleColors.ts; all TypeScript, golden-hash test in tests/unit/generation)
```

Non-source files live outside `src/`: `CHANGELOG.md` (read by the release workflow) at the repo root, and the sample map-block template and object set under `examples/`.

## Feature Map (post-2.0 features to files)

| Feature | Files |
|---------|-------|
| Beacon (party pin) | `objects/partyPinOperations.ts`, `objects/partyRangeQuery.ts`, `objects/partyRelatedNotes.ts`, `persistence/partyNoteOperations.ts`, `components/mapcanvas/PartyPinLayer.tsx` + `PartyPinInstance.tsx`, `components/overlays/PartyPin*.tsx`, `hooks/interactions/usePartyPin*.ts` |
| Weather (U+13080 Weather plugin) | `weather/`, `context/WeatherContext.tsx` (WeatherProvider + `useWeatherStore()`, one per mounted map, mounted in `DungeonMapTracker.tsx`; also provides the fog view read by `useWeatherFog()` from `weather/weatherFog.ts`), `components/mapcanvas/WeatherLayer.tsx` (tint, ground sheen, badges) + `WeatherSkyLayer.tsx` (animated Sky), `components/overlays/WeatherOverlay.tsx`, `components/overlays/MeasurementDayRibbon.tsx` + `hooks/interactions/useRouteWeather.ts` + `travel/forecastWalk.ts` (measure tool), `components/panels/AlmanacPanel.tsx` (block rail flyout + full-pane dock section), `components/settings/WeatherTab.tsx`, `scss/_almanac.scss`, `types/integrations/wadjet.types.ts` (verbatim mirror of the plugin's `types/wadjet.d.ts` + a 0.3.x tolerance layer), `types/contexts/weather.types.ts`. Gate on `store.hasWeather` (never re-derive it); Sky animation is `store.animate`; ground state is `store.ground(zone, day)`; anything that names or shows an area asks `useWeatherFog()` first |
| Travel and routes | `travel/` (packs, time, segment terrain sampler), `drawing/routeOperations.ts`, `components/mapcanvas/RouteLayer.tsx` + `MeasurementLayer.tsx`, `hooks/interactions/useTerrainSampling.ts`, `components/modals/SaveRouteModal.ts`, `settings/modals/TravelPackEditModal.ts` |
| Openings (wall gaps) | `drawing/wallGapOperations.ts`, `drawing/wallEditGeometry.ts`, `components/mapcanvas/WallLayer.tsx`, `hooks/walls/` (`useWallTools.ts` state + handlers, `useWallOverlay.ts` overlay canvas, `useWallToolSurface.ts` drawer-footer controls) (walls/paths: `drawing/wallPath*.ts`, `geometry/renderers/wallPathRenderer.ts`) |
| Full-pane view | `views/WindroseMapView.ts` |
| DMT app wiring | `hooks/app/` (map chrome state, dock layout, drawer ribbon, tile drawer/flyouts/tool coupling, tileset art handlers, board and map-list actions, layer links, adjacent sub-maps): composition hooks that keep `DungeonMapTracker.tsx` a thin root; panels render through `components/hosts/` |
| Sub-hex maps | `hooks/interactions/useSubHexNavigation.ts`, `persistence/subHexPath.ts` (hexKey-path read/write helpers), `core/subHexBackdropStore.ts`, `core/paintedViewStore.ts`, `geometry/core/subHexBackdrop.ts`, `geometry/renderers/subHexBackdropRenderer.ts`, `components/controls/SubHexBreadcrumb.tsx` |
| Export | `persistence/exportOperations.ts`, `components/modals/ExportImageModal.ts` |
| Dock panels | `components/panels/Dock*.tsx`, `DrawerDock.tsx`, `EdgeRail.tsx`, `AlmanacPanel.tsx` (block rail flyout / full-pane dock section, offered while the map has weather and some area is out of the fog), `hooks/state/useFloatingPanels.ts`; rendered via `components/hosts/` (add a panel prop in `panelBags.ts` + `buildPanelBags.ts`, never per layout) |
| Tile import wizard | `assets/import*.ts` (+ predictors, `tile*.ts`), `settings/modals/AddTilesModal.ts`, `components/panels/TileAssetBrowser.tsx` (+ `TileCell.tsx`, `TileBrowserFooter.tsx`, `hooks/tiles/useTileFilterPipeline.ts`), `TileOrganizePane.tsx` |
| Terrain strokes | `drawing/terrainStrokeOperations.ts`, `geometry/strokes/`, `components/mapcanvas/TerrainBrushLayer.tsx` |
| Pan/zoom performance | `hooks/canvas/useViewController.ts`, `useLiveOverlay*.ts` |
| Content packs | `content-packs/` |
| Save durability | `persistence/saveCoordinator.ts`, `saveJournal.ts`, `fileOperations.ts`, `hooks/state/useDebouncedSave.ts` |

## Key Principles

### Never Blame Caching
If something seems like a caching issue, it isn't. Find the actual code problem. This applies to:
- State not updating → Check dependency arrays, reference equality
- Stale data → Check data flow, not caching
- Visual glitches → Check render logic, not browser cache

### Follow Established Patterns
Don't introduce new paradigms. Match existing code patterns:
- New contexts follow `MapContext.tsx` pattern
- New hooks follow existing hook patterns
- New components follow layer composition pattern

### Cross-Platform First
Always consider:
- Touch interfaces (iPad primary mobile target)
- Touch target sizing (44px minimum)
- Pan/zoom gestures
- Desktop keyboard shortcuts as enhancement, not requirement

## Common Tasks

### Adding a New Utility Function
1. Create in the appropriate domain directory (`core/`, `objects/`, `drawing/`, `text/`, `travel/`, `assets/`, `content-packs/`, `persistence/`)
2. Add types to corresponding `types/*.types.ts`
3. Export via `export { myFunction }`
4. Import via `import { myFunction } from '../path/to/file'`
5. If the function needs Obsidian's App, take `app: App` as the first parameter

### Adding a New Hook
1. Create `use*.ts` file in the appropriate `hooks/` subdirectory (taxonomy in `hooks/CLAUDE.md`)
2. Use `useState`, `useCallback`, `useMemo`, `useEffect` from `preact/hooks`
3. Return stable references for functions
4. Document parameters and return type
5. Export via `export { useMyHook }`

### Adding a New Layer
1. Create `*Layer.tsx` component in `components/mapcanvas/`
2. Use `useMapState()` and other contexts for shared state
3. Handle both grid and hex via geometry abstraction
4. Add to `MapCanvas.tsx` layer composition

## Testing

### Unit Tests
```bash
npm run test:unit    # ~2,450 tests, ~4-5 s (Vitest, no Obsidian)
```

### E2E Tests
```bash
npm run build:dev && npm run test:e2e   # real Obsidian via obsidian-testing-framework + Vitest; 20-30+ min full suite
```
Never start an E2E run without the user's explicit go-ahead (see root `CLAUDE.md`).

### Type Check + Lint
```bash
npm run check          # tsc --noEmit + eslint
npm run lint:scanner   # store-scan replica lint; 0 problems required before release
```

**Always verify both grid AND hex maps** — geometry abstraction bugs often only appear on one type.

## Don't

- Create class components (functional + hooks only)
- Skip reading existing patterns before adding new code
- Assume grid-only (always consider hex)
- Use browser-specific APIs without fallbacks
- Add debug `console.log` without cleanup plan
- Read or write `compiled-windrose-md.md` (generated artifact)

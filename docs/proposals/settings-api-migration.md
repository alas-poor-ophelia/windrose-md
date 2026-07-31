# Proposal: Migrate Windrose to the Obsidian 1.13 Declarative Settings API

**Status:** Proposed (2026-07-30)
**Scope:** Plugin-global settings tab only (`src/settings/`). Per-map settings and all modals are explicitly out of scope.

## Background

Obsidian 1.13.0 (desktop 2026-05-28; mobile 1.13.4 on 2026-07-30) introduced a declarative
Settings API. Instead of `PluginSettingTab.display()` imperatively building DOM, a plugin
implements `getSettingDefinitions()` returning an array of definition objects; Obsidian owns
rendering, search indexing, validation UI, and list mechanics. When `getSettingDefinitions()`
returns a non-empty array, `display()` is bypassed; when absent, `display()` remains the
fallback, supported indefinitely.

Sources: [1.13.0 changelog](https://obsidian.md/changelog/2026-05-28-desktop-v1.13.0/),
[Settings docs](https://docs.obsidian.md/Plugins/User+interface/Settings),
[migration guide](https://docs.obsidian.md/plugins/guides/migrate-declarative-settings).
Live adopters: BRAT (`obsidian42-brat`), Notebook Navigator.

Windrose already anticipates this: `src/settings/WindroseSettingsTab.ts:22-27` documents the
mixin `Object.assign` structure as a temporary workaround *explicitly deferred to this
migration*.

### API surface (abridged)

- `SettingDefinitionControl` — declarative control (`toggle`, `text`, `textarea`, `number`,
  `slider`, `dropdown`, `file`, `folder`, `color`) with `key`, `defaultValue`, `validate`,
  `disabled`, `visible`, `aliases` (search synonyms).
- `SettingDefinitionAction` — button row with an imperative click handler.
- `SettingDefinitionRender` — full escape hatch: `(setting, group) => void | cleanup`.
- `SettingDefinitionGroup` (`type: 'group'`) — heading + nested items + `visible` predicate.
- `SettingDefinitionList` (`type: 'list'`) — managed list with `addItem`, `onReorder`,
  `onDelete`, `emptyState`.
- `SettingDefinitionPage` (`type: 'page'`) — sub-page navigation.
- Tab methods: `update()` (rebuild), `refreshDomState()` (re-evaluate `visible`/`disabled`
  without rebuild), `getControlValue`/`setControlValue` (storage indirection).

## Why migrate

1. **Global settings search.** Declared settings appear in Obsidian's 1.13 settings-window
   search; `display()`-only tabs do not. We also get to delete our custom in-tab search bar
   (`WindroseSettingsTab.ts:76-102`).
2. **Delete flagged tech debt.** The 8-file render-mixin `Object.assign` workaround
   (`tabs/settingsTabContext.ts` + `TabRender*.ts`, ~2,100 LOC) was written to be replaced by
   exactly this. The ESLint suppression goes with it.
3. **Native list mechanics.** `type: 'list'` with `onReorder`/`onDelete`/`addItem` replaces
   our hand-rolled drag-and-drop (`helpers/dragHelpers.ts`, the reorder logic in
   `TabRenderObjects.ts`) and the hand-built color-palette row list.
4. **Validation + defaults handling** become per-control declarations instead of ad-hoc
   `onChange` guards.
5. **Alignment before store submission** (Standalone Conversion Phase 7). Migrating before
   the community-store review means reviewers see the modern pattern, and the official
   `settings-tab/prefer-setting-definitions` ESLint rule passes.

## What migrates (mapping)

| Current surface | LOC | New shape |
|---|---|---|
| Features tab — 11 feature toggles | 37 | 11 `toggle` controls in a group; `visible`/`disabled` predicates replace manual re-render |
| Hex Map Settings — 2 dropdowns | (in 492) | `dropdown` controls |
| Color/Behavior/Measurement settings — 17 `Setting` calls (4 sliders, 5 dropdowns, toggles, 1 color picker) | 492 | stock `slider`/`dropdown`/`toggle`/`color` controls |
| Color Palette — hand-rolled row list + Add/Reset | 202 | `type: 'list'` + `render` per row (swatch, hex code, edit/hide/reset/delete buttons); `ColorEditModal` unchanged |
| Object Types — drag-reorderable list, search, 11 `Setting` calls | 823 | `type: 'list'` with `onReorder`/`onDelete`/`addItem`; per-row internals via `render`; group-level `search` matcher; buttons become `action` rows |
| Travel Packs / Tile Sets rows + manage buttons | 336 | `type: 'list'` + `action` rows; edit modals unchanged |
| Keyboard Shortcuts — per-action capture rows | 150 | `render` rows (no stock hotkey-capture control) |
| Import banner (conditional, async check) | (in 246) | `action` row with `visible: () => this.cachedHasOldData` — the async `hasOldPluginData()` check moves to `onload` (definitions must stay cheap; official guidance forbids I/O in `getSettingDefinitions()`) |
| Custom search bar | (in 246) | **deleted** — superseded by native settings search; add `aliases` for discoverability |
| Collapsible `<details>` sections | — | `type: 'group'` headings (NOT `type: 'page'` — see risk #1) |

## What does NOT change

- **All 13 native modals** (`src/settings/modals/`, 3,717 LOC) — launched from `action`
  rows exactly as they are launched from buttons today. Includes `AddTilesModal`,
  `InsertDungeonModal` + `DungeonEssenceVisualizer`, `ObjectEditModal`, etc.
- **Per-map settings** (`src/components/settings/`, 3,528 LOC Preact) — a separate modal
  system (`NativeModalPortal`), unrelated to `PluginSettingTab`. Untouched.
- **`settingsAccessor.ts`** (31 importers) — synchronous read API preserved as-is.
- **`windrose-settings-changed` event** (11 consumers) — kept as the propagation bus.
- **Persistence** — the API does not replace `loadData()`/`saveData()`; storage mechanism
  is unchanged.
- **Content-pack system** — shared infrastructure, reached via the same modal.

## Migration strategy

**Recommended: Path A (clean cut).** Bump `minAppVersion` to `1.13.0`, implement
`getSettingDefinitions()`, delete `display()` and the mixin scaffolding at the end.
Rationale: Windrose is BRAT-distributed pre-store; the compatibility tail is short, and
Path B (dual `display()` + definitions) doubles maintenance on every settings change.

**Gate before committing:** confirm the primary devices run 1.13+ — mobile 1.13.4 shipped
2026-07-30, so **iPad availability must be verified first**. If store submission lands
before the mobile rollout is comfortable, fall back to Path B for one release, then drop
`display()`.

### Phases

- **Phase 0 — Groundwork & spike** — **DONE 2026-07-30** (uncommitted). Results:
  - Deps: `obsidian@1.13.1` + `obsidian-typings@5.22.0` (the 1.12.7-targeted release)
    typecheck cleanly together. No 1.13-targeted `obsidian-typings` exists yet — watch
    for one before Phase 4. No hand-rolled shim needed.
  - **`display()` is formally `@deprecated` since 1.13.0 in the official typings**
    (stronger than the docs' "supported indefinitely") — our `no-deprecated` +
    `no-restricted-disable` lint gate forced extracting the imperative body to
    `renderImperativeTab()`, with `display()` as a thin fallback shell. Already done.
  - **Unknown (a) resolved:** `hide()` survives unchanged in the 1.13 typings, and it
    barely matters — `saveSettings()` (main.ts:594) dispatches
    `windrose-settings-changed` on every call, so propagation is per-change already;
    the `hide()` batch is a redundant secondary path.
  - Spike shipped in dual-mode behind localStorage flag
    `windrose-declarative-settings-spike`: `getSettingDefinitions()` serves the
    Features group (11 toggles, keys `features.*`), `getControlValue`/`setControlValue`
    overrides preserve absent-means-enabled semantics and live event dispatch.
    Verified live on 1.12.7: imperative path renders unchanged (11 sections,
    69 setting items), spike inert with flag off, leaf APIs round-trip correctly
    (read defaults, write, persist, event fired). Unit suite green (2078),
    `npm run check` zero-warning gate passes.
  - **Still blocked on live 1.13:** desktop app runs 1.12.7 — the declarative
    renderer itself (and unknown (b), iPad) cannot be observed until the apps update.
    With the flag on under 1.13, ONLY the Features group will render — do not ship
    the flag enabled or a non-empty unconditional return before Phases 1-3 complete.
- **Phase 1 — Plain controls** (mechanical; replaces `TabRenderFeatures`,
  `TabRenderSettings`, hex/measurement/behavior sections)
  All stock-control sections become definition arrays. Wire `setControlValue` override:
  write to `plugin.settings`, `saveSettings()`, set changed-flag (preserving current
  batched-event semantics).
- **Phase 2 — Lists** (the complex phase; replaces `TabRenderColors` list,
  `TabRenderObjects`, `TabRenderTravelPacks`, `TabRenderTilesets` rows, `dragHelpers`)
  Four `type: 'list'` conversions with `render` rows for custom internals. Object Types is
  the hardest (823 LOC: reorder + search + hidden-objects subsection + per-row actions).
- **Phase 3 — Remainder & wiring** (`TabRenderKeyboardShortcuts` via `render`, import
  banner via cached `visible`, delete custom search, `refreshDomState()` where feature
  toggles gate section visibility)
- **Phase 4 — Demolition & verify**
  Delete `display()`, the mixin `Object.assign` block, `settingsTabContext.ts`,
  `dragHelpers.ts`, the ESLint suppression. Full unit + E2E run; settings E2E tests will
  need selector updates (Obsidian-owned DOM replaces ours).

## Effort estimate

- **Blast radius:** confined to `src/settings/` — roughly 10 of its 29 files rewritten or
  deleted, plus one-line-scale touches to `main.ts`, `manifest.json`, `package.json`.
  Zero changes to per-map settings, modals, `settingsAccessor`, or the 11 event consumers.
- **Code delta:** ~2,500-2,900 LOC of imperative render code superseded by definition
  arrays that should come out meaningfully smaller; 13 modal files (3,717 LOC) carried
  across untouched.
- **Shape:** 5 sequential phases; Phase 1 is mechanical, Phase 2 carries most of the
  complexity, Phases 0 and 4 are small. Each phase lands independently (dual-render during
  transition is fine since `display()` remains the fallback until Phase 4).
- **Confidence:** high on the overall approach — the API demonstrably covers our control
  inventory, and two shipped plugins validate the pattern. Two unknowns front-loaded into
  the Phase 0 spike (`hide()` semantics, iPad renderer), one external dependency
  (iPad on Obsidian 1.13).

## Risks

1. **`update()` navigation-depth bug** ([forum #115706](https://forum.obsidian.md/t/bug-settings-wrong-navigation-depth-after-calling-update/115706)):
   calling `update()` with a sub-page open stacks navigation. Mitigation: use `groups`,
   not `pages`, and prefer `refreshDomState()` over `update()`.
2. **`hide()`-batched event dispatch** may not survive the new settings-window lifecycle.
   Mitigation: Phase 0 spike; fallback is per-change dispatch (consumers must be
   idempotent — most already are, they re-read settings wholesale).
3. **`getSettingDefinitions()` runs frequently** — must be pure/cheap. Our async
   `hasOldPluginData()` check and any pack scans move to cached state.
4. **`render` rows do not auto-save** — each custom row must call `saveSettings()`
   explicitly; easy to miss during Phase 2.
5. **`validate` is a UI gate only** — it does not repair already-persisted bad data;
   existing `loadSettings()` sanitization stays.
6. **Mobile renderer behavior unverified** — no official statement found either way;
   covered by the Phase 0 iPad check.
7. **E2E churn** — settings-related E2E tests target our DOM; Obsidian-owned DOM means
   selector rewrites (bounded: settings tests are a minority of the 11 E2E files).

## Recommendation

Proceed, sequenced **after** the current release push. Run Phase 0 as a standalone spike
first; it is cheap, and its two answers determine whether the rest is the mechanical
route it appears to be. The migration retires three pieces of standing debt (mixin
scaffolding, custom drag-and-drop, custom search) while shrinking the settings tab's
maintenance surface, and it positions the plugin correctly for store submission.

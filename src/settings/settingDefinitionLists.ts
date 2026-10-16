import type { SettingDefinitionItem, SettingGroupItem } from 'obsidian';
import { Notice, Platform } from 'obsidian';
import type { TravelPack } from '#types/settings/travelPack.types';
import { BUILT_IN_COLORS } from '../core/settingsAccessor';
import { isFeatureEnabled } from '../core/featureFlags';
import { ContentPackBrowserModal } from '../content-packs/ContentPackBrowserModal';
import {
  createTravelPack,
  removeTravelPack,
  serializeTravelPack,
  setTravelPackEnabled,
  upsertTravelPack,
  validateTravelPackImport,
} from '../travel/travelPackOperations';
import { ColorHelpers } from './helpers/colorHelpers';
import { FolderSuggest } from './helpers/FolderSuggest';
import { runFolderDetection, FOLDER_DETECT_DEBOUNCE_MS } from './helpers/folderDetection';
import { ColorEditModal } from './modals/ColorEditModal';
import { ConfirmModal } from './modals/ConfirmModal';
import { TravelPackEditModal } from './modals/TravelPackEditModal';
import { AddTilesModal } from './modals/AddTilesModal';
import type { SettingsTabThis } from './tabs/settingsTabContext';
import { scanTilesetFolder, isBundleFailureState, bundleFailureLabel } from '../assets/tilesetScan';
import type { BundleState } from '../assets/bundles/bundleRegistry';
import {
  entriesFor, getBundleModes, getBundleSegments, getBundleStateInfo, isBundleWriteInProgress, subscribeBundleRegistry,
} from '../assets/bundles/bundleRegistry';
import { bundleFolderInPlace } from '../assets/bundles/bundleFolderInPlace';
import { compactBundleRefusal, compactExistingBundle } from '../assets/bundles/bundleCompactExisting';
import { unbundleFolder, unbundleRefusal } from '../assets/bundles/bundleUnbundle';
import { cleanupBundleOrphans, listBundleOrphans, partitionOrphans } from '../assets/bundles/bundleCleanup';
import type { BundleOrphan } from '../assets/bundles/bundleCleanup';
import { SHARDS_DIR, SHARD_EXT } from '../assets/bundles/bundleFormat';
import {
  bundleFolderConfirmMessage, compactBundleConfirmMessage, formatCompactBundleResult, formatBundleBadge, formatBundleFolderResult, isBundleBadgeProblem,
  cleanupConfirmMessage, formatCleanupResult, formatUnbundleResult, unbundleConfirmMessage,
} from './helpers/bundleStatus';

// settingDefinitionLists.ts
// Declarative Settings API (Obsidian 1.13+) list sections: Color palette,
// Travel packs, and Tile sets. Phase 2 of the migration in
// docs/proposals/settings-api-migration.md. Section shape: an intro group
// carries the section heading (native lists force delete/drag affordances
// onto EVERY item row, so intro text cannot live inside a list that uses
// onDelete), then the bare list with its addItem affordance, then a trailing
// group with the section's manage/browse action rows.

// The 1.13 declarative renderer silently drops control-less items whose name
// is empty (verified live on 1.13.4: getElementForDefinition returns
// undefined for them). A no-op render callback makes the row render as a
// plain description paragraph, matching the imperative tab's intro text.
function infoItem(desc: string): SettingGroupItem {
  return { name: '', desc, searchable: false, render: () => {} };
}

// Obsidian keys declarative rows by their name ("duplicate setting key"
// console error, flaky re-render reconciliation on collision), so rows built
// from user-named data (packs, colors) get a " (2)", " (3)" suffix on exact
// duplicates.
function dedupeRowNames(rows: SettingGroupItem[]): SettingGroupItem[] {
  const seen = new Map<string, number>();
  return rows.map(row => {
    if (!('name' in row) || row.name === '') return row;
    const count = (seen.get(row.name) ?? 0) + 1;
    seen.set(row.name, count);
    return count === 1 ? row : { ...row, name: `${row.name} (${count})` };
  });
}

/** Shape of a resolved palette color row (ColorHelpers.getResolved element) */
interface DisplayColor {
  id: string;
  color: string;
  label: string;
  opacity?: number;
  isBuiltIn?: boolean;
  isModified?: boolean;
  isCustom?: boolean;
}

// --- Color palette ---

function saveAndRebuild(tab: SettingsTabThis): void {
  tab.settingsChanged = true;
  void tab.plugin.saveSettings().then(() => tab.update());
}

function colorRow(tab: SettingsTabThis, color: DisplayColor, isHidden: boolean): SettingGroupItem {
  const opacity = color.opacity ?? 1;
  const hexText = opacity < 1 ? `${color.color} @ ${Math.round(opacity * 100)}%` : color.color;
  const flair = color.isModified === true ? ' (modified)' : color.isCustom === true ? ' (custom)' : '';
  return {
    name: color.label,
    desc: hexText,
    render: (setting) => {
      // Re-renders reuse the row element and re-invoke render (the framework
      // only resets controlEl), so anything added outside controlEl must be
      // cleared first or it accumulates.
      setting.settingEl.querySelectorAll(':scope > .windrose-setting-color-swatch').forEach(n => n.remove());
      setting.nameEl.querySelectorAll('.windrose-color-row-modified').forEach(n => n.remove());
      const swatch = createDiv({ cls: 'windrose-setting-color-swatch' });
      swatch.style.backgroundColor = color.color;
      swatch.style.opacity = String(opacity);
      setting.settingEl.prepend(swatch);
      if (flair !== '') {
        setting.nameEl.createSpan({ text: flair, cls: 'windrose-color-row-modified' });
      }
      setting.addExtraButton(btn => btn
        .setIcon('pencil')
        .setTooltip('Edit color')
        .onClick(() => {
          new ColorEditModal(tab.app, tab.plugin, color, () => saveAndRebuild(tab)).open();
        }));
      if (color.isBuiltIn === true) {
        setting.addExtraButton(btn => btn
          .setIcon(isHidden ? 'eye' : 'eye-off')
          .setTooltip(isHidden ? 'Show color' : 'Hide color')
          .onClick(() => {
            const overrides = tab.plugin.settings.colorPaletteOverrides ??= {};
            overrides[color.id] ??= {};
            overrides[color.id].hidden = !isHidden;
            // Clean up an override that only says "not hidden"
            if (Object.keys(overrides[color.id]).length === 1 && overrides[color.id].hidden !== true) {
              delete overrides[color.id];
            }
            saveAndRebuild(tab);
          }));
        if (color.isModified === true) {
          setting.addExtraButton(btn => btn
            .setIcon('rotate-ccw')
            .setTooltip('Reset to default')
            .onClick(() => {
              if (tab.plugin.settings.colorPaletteOverrides) {
                delete tab.plugin.settings.colorPaletteOverrides[color.id];
              }
              saveAndRebuild(tab);
            }));
        }
      }
      if (color.isCustom === true) {
        setting.addExtraButton(btn => btn
          .setIcon('trash-2')
          .setTooltip('Delete color')
          .onClick(() => {
            tab.plugin.settings.customPaletteColors = (tab.plugin.settings.customPaletteColors ?? []).filter(c => c.id !== color.id);
            saveAndRebuild(tab);
          }));
      }
    }
  };
}

function buildColorPaletteSections(tab: SettingsTabThis): SettingDefinitionItem[] {
  const settingsRecord = tab.plugin.settings as unknown as Record<string, unknown>;
  const resolvedColors = ColorHelpers.getResolved(settingsRecord);
  const hiddenColors = ColorHelpers.getHidden(settingsRecord);
  const visibleColors = resolvedColors.filter(c => !hiddenColors.has(c.id));
  const hiddenBuiltIns = BUILT_IN_COLORS.filter(c => hiddenColors.has(c.id));

  const sections: SettingDefinitionItem[] = [{
    // No onDelete/onReorder: built-ins are hidden rather than deleted, so
    // rows carry their own edit/hide/reset/delete buttons and the list is
    // only used for its addItem affordance.
    type: 'list',
    heading: 'Color palette',
    addItem: {
      name: 'Add color',
      action: () => {
        new ColorEditModal(tab.app, tab.plugin, null, () => saveAndRebuild(tab)).open();
      }
    },
    items: [
      infoItem('Customize the color palette used for drawing cells and objects. Edit built-in colors, add custom colors, or hide colors you don\'t use.'),
      ...dedupeRowNames(visibleColors.map(c => colorRow(tab, c as unknown as DisplayColor, false)))
    ]
  }];

  if (hiddenBuiltIns.length > 0) {
    sections.push({
      type: 'group',
      heading: 'Hidden colors',
      items: hiddenBuiltIns.map(c => {
        const override = tab.plugin.settings.colorPaletteOverrides?.[c.id];
        const display: DisplayColor = override
          ? { ...c, ...override, isBuiltIn: true, isModified: true }
          : { ...c, isBuiltIn: true };
        return colorRow(tab, display, true);
      })
    });
  }

  sections.push({
    type: 'group',
    items: [{
      name: 'Reset palette',
      desc: 'Restore all built-in colors to defaults and remove custom colors',
      action: () => {
        void (async () => {
          if (await new ConfirmModal(tab.app, {
              message: 'Reset all colors to defaults? This will remove all customizations.',
              confirmText: 'Reset All',
              isDestructive: true
            }).openAndGetValue()) {
            tab.plugin.settings.colorPaletteOverrides = {};
            tab.plugin.settings.customPaletteColors = [];
            saveAndRebuild(tab);
          }
        })();
      }
    }]
  });

  return sections;
}

// --- Travel packs ---

/** Summarize a pack's contents for its list row */
function packSummary(pack: TravelPack): string {
  const parts = [
    `${pack.modes.length} mode(s)`,
    `${pack.terrains.length} terrain(s)`,
    `${pack.units.length} unit(s)`,
    `${pack.allowances.length} allowance(s)`,
  ];
  const summary = parts.join(' · ');
  return pack.description != null && pack.description !== ''
    ? `${pack.description} — ${summary}`
    : summary;
}

/** Vault-safe filename slug from a pack name */
function packSlug(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug === '' ? 'pack' : slug;
}

async function importTravelPackFile(tab: SettingsTabThis, file: File): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    new Notice('Import failed: the file is not valid JSON');
    return;
  }

  const result = validateTravelPackImport(parsed);
  if (!result.valid || result.pack == null) {
    new Notice('Import failed:\n' + result.errors.slice(0, 5).join('\n'), 10000);
    return;
  }

  const existing = (tab.plugin.settings.travelPacks ?? []).find(p => p.id === result.pack?.id);
  if (existing != null) {
    const confirmed = await new ConfirmModal(tab.app, {
      message: `A travel pack with this id already exists ("${existing.name}"). Replace it with "${result.pack.name}"?`,
      confirmText: 'Replace pack'
    }).openAndGetValue();
    if (!confirmed) return;
  }

  tab.plugin.settings.travelPacks = upsertTravelPack(tab.plugin.settings.travelPacks ?? [], result.pack);
  saveAndRebuild(tab);
  new Notice(`Imported travel pack "${result.pack.name}"`);
}

function travelPackRow(tab: SettingsTabThis, pack: TravelPack): SettingGroupItem {
  return {
    name: pack.name,
    desc: packSummary(pack),
    render: (setting) => {
      setting.addToggle(toggle => {
        toggle.setTooltip(pack.enabled ? 'Enabled — shown in map UI' : 'Disabled — hidden from map UI');
        toggle.setValue(pack.enabled);
        toggle.onChange(async (enabled) => {
          tab.plugin.settings.travelPacks = setTravelPackEnabled(tab.plugin.settings.travelPacks ?? [], pack.id, enabled);
          tab.settingsChanged = true;
          await tab.plugin.saveSettings();
        });
      });
      setting.addExtraButton(btn => btn
        .setIcon('pencil')
        .setTooltip('Edit pack')
        .onClick(() => {
          new TravelPackEditModal(tab.app, tab.plugin, pack.id, () => saveAndRebuild(tab)).open();
        }));
      setting.addExtraButton(btn => btn
        .setIcon('download')
        .setTooltip('Export to file')
        .onClick(async () => {
          const current = (tab.plugin.settings.travelPacks ?? []).find(p => p.id === pack.id);
          if (!current) return;
          const base = `windrose-travel-pack-${packSlug(current.name)}`;
          let filename = `${base}.json`;
          if (tab.app.vault.getAbstractFileByPath(filename) != null) {
            filename = `${base}-${Date.now()}.json`;
          }
          try {
            await tab.app.vault.create(filename, serializeTravelPack(current));
            new Notice(`Exported to ${filename} in the vault root`);
          } catch (e) {
            console.error('[Windrose] Travel pack export failed:', e);
            new Notice('Export failed — see console for details');
          }
        }));
    }
  };
}

function buildTravelPackSections(tab: SettingsTabThis): SettingDefinitionItem[] {
  const measurementEnabled = (): boolean => isFeatureEnabled('measurement');
  const packs = tab.plugin.settings.travelPacks ?? [];
  return [
    {
      type: 'group',
      heading: 'Travel packs',
      visible: measurementEnabled,
      items: [
        infoItem('Travel packs bundle the travel rules of a game system — custom units, terrain speed multipliers, travel modes, and per-day allowances. Enabled packs power travel times in the measure tool and the beacon.')
      ]
    },
    {
      type: 'list',
      visible: measurementEnabled,
      emptyState: 'No travel packs yet',
      addItem: {
        name: 'New travel pack',
        action: () => {
          void (async () => {
            const pack = createTravelPack('New travel pack');
            tab.plugin.settings.travelPacks = upsertTravelPack(tab.plugin.settings.travelPacks ?? [], pack);
            tab.settingsChanged = true;
            await tab.plugin.saveSettings();
            tab.update();
            new TravelPackEditModal(tab.app, tab.plugin, pack.id, () => saveAndRebuild(tab)).open();
          })();
        }
      },
      onDelete: (index) => {
        const pack = (tab.plugin.settings.travelPacks ?? [])[index] as TravelPack | undefined;
        if (pack == null) return;
        void (async () => {
          const confirmed = await new ConfirmModal(tab.app, {
            message: `Delete travel pack "${pack.name}"?\nMaps referencing it fall back to plain distance display.`,
            confirmText: 'Delete pack',
            isDestructive: true
          }).openAndGetValue();
          if (!confirmed) return;
          tab.plugin.settings.travelPacks = removeTravelPack(tab.plugin.settings.travelPacks ?? [], pack.id);
          saveAndRebuild(tab);
        })();
      },
      items: dedupeRowNames(packs.map(pack => travelPackRow(tab, pack)))
    },
    {
      type: 'group',
      visible: measurementEnabled,
      items: [
        {
          name: 'Import from file',
          desc: 'Import a travel pack from a JSON file',
          action: () => {
            const input = createEl('input', { type: 'file' });
            input.accept = '.json';
            input.addEventListener('change', () => {
              const file = input.files?.[0];
              if (!file) return;
              void importTravelPackFile(tab, file);
            });
            input.click();
          }
        },
        {
          name: 'Browse travel packs',
          desc: 'Download ready-made travel rule packs from the content library',
          action: () => {
            new ContentPackBrowserModal(tab.app, tab.plugin, 'travel-pack', () => saveAndRebuild(tab)).open();
          }
        }
      ]
    }
  ];
}

// --- Tile sets ---

function normalizeFolder(folder: string): string {
  return folder.trim().replace(/\/+$/, '');
}

/** Shard file count and total size for a bundled folder (list + stat; no bytes read). */
async function statBundleShards(tab: SettingsTabThis, folder: string): Promise<{ count: number; bytes: number }> {
  const adapter = tab.app.vault.adapter;
  let files: string[] = [];
  try {
    files = (await adapter.list(`${folder}/${SHARDS_DIR}`)).files.filter(f => f.endsWith(SHARD_EXT));
  } catch {
    return { count: 0, bytes: 0 };
  }
  const sizes = await Promise.all(files.map(async f => {
    try { return (await adapter.stat(f))?.size ?? 0; } catch { return 0; }
  }));
  return { count: files.length, bytes: sizes.reduce((a, b) => a + b, 0) };
}

/**
 * Status line under a tile folder row, recomputed on every bundle registry
 * change. The loose count reuses the Preview scan (scanTilesetFolder), which
 * also mounts the folder; it runs at most once per folder value, because a
 * mount bumps the registry and a per-bump rescan would loop. Shard stats are
 * keyed on state + entry count, so unrelated bumps reuse them.
 */
interface BundleBadgeView {
  folder: string;
  state: BundleState | null;
  reason?: string;
  looseFiles: number | null;
  /** Unreferenced bundle files (desktop, mounted only); null while unknown. */
  orphans?: BundleOrphan[] | null;
}

function attachBundleBadge(
  tab: SettingsTabThis,
  descEl: HTMLElement,
  initialFolder: string,
  onUpdate?: (view: BundleBadgeView) => void,
): { setFolder: (folder: string) => void; recheck: () => void; dispose: () => void } {
  const badgeEl = descEl.createDiv({ cls: 'windrose-tileset-bundle-badge' });
  let folder = normalizeFolder(initialFolder);
  let generation = 0;
  let scanStarted = false;
  let looseFiles: number | null = null;
  let shardKey = '';
  let shards: { count: number; bytes: number } | null = null;
  let orphans: BundleOrphan[] | null = null;
  let disposed = false;

  const refresh = (): void => {
    if (disposed) return;
    if (folder === '') { badgeEl.setText(''); onUpdate?.({ folder, state: null, reason: '', looseFiles: null, orphans: null }); return; }
    const info = getBundleStateInfo(folder);
    const gen = generation;
    // While the folder is a bundle the loose count is meaningless; re-arm the
    // scan so an Unbundle in this settings session shows "Loose: N files"
    // again instead of staying on "Checking folder…".
    if (info != null && info.state !== 'loose') {
      scanStarted = false;
      looseFiles = null;
    }
    if (!scanStarted && (info == null || info.state === 'loose')) {
      scanStarted = true;
      void scanTilesetFolder(tab.app, folder).then(tiles => {
        if (gen !== generation) return;
        looseFiles = tiles.length;
        refresh();
      }, () => { /* the scan already reports its own failures */ });
    }
    let tiles = 0;
    if (info != null && (info.state === 'mounted' || info.state === 'partial')) {
      tiles = entriesFor(folder).entries.length;
      // The segment set is part of the key: Compact and Clean up change the
      // shard files on disk without changing the state or the tile count.
      const key = `${info.state}:${tiles}:${getBundleSegments(folder).map(s => s.hash).join(',')}`;
      if (key !== shardKey) {
        shardKey = key;
        shards = null;
        orphans = null;
        void statBundleShards(tab, folder).then(result => {
          if (gen !== generation || key !== shardKey) return;
          shards = result;
          refresh();
        });
        // Lazy and cheap (list + stat), desktop only: drives the "Clean up" button.
        if (Platform.isDesktopApp && info.state === 'mounted') {
          void listBundleOrphans(tab.app, folder).then(result => {
            if (gen !== generation || key !== shardKey) return;
            orphans = result;
            refresh();
          }, () => { /* leave the button hidden */ });
        }
      }
    } else {
      orphans = null;
    }
    const writing = isBundleWriteInProgress(folder);
    const modes = getBundleModes(folder);
    badgeEl.setText(formatBundleBadge(info, { looseFiles, tiles, shards, writing, modes }));
    badgeEl.toggleClass('is-problem', isBundleBadgeProblem(info, writing));
    onUpdate?.({ folder, state: info?.state ?? null, reason: info?.reason ?? '', looseFiles, orphans });
  };

  const unsubscribe = subscribeBundleRegistry(refresh);
  refresh();
  return {
    setFolder: (next: string) => {
      const normalized = normalizeFolder(next);
      if (normalized === folder) return;
      folder = normalized;
      generation++;
      scanStarted = false;
      looseFiles = null;
      shardKey = '';
      shards = null;
      orphans = null;
      refresh();
    },
    recheck: () => {
      shardKey = '';
      refresh();
    },
    dispose: () => { disposed = true; unsubscribe(); },
  };
}

/**
 * "Bundle folder": confirm, bundle the loose folder in place with progress in
 * a Notice, then report the counts. The badge refreshes from the registry
 * bumps of the mount and remount.
 */
async function runBundleFolderAction(tab: SettingsTabThis, folder: string, files: number | null): Promise<void> {
  const confirmed = await new ConfirmModal(tab.app, {
    message: bundleFolderConfirmMessage(files),
    confirmText: 'Bundle',
    cancelText: 'Cancel',
  }).openAndGetValue();
  if (!confirmed) return;
  const progress = new Notice(`Bundling ${folder}…`, 0);
  try {
    const result = await bundleFolderInPlace(tab.app, folder, {
      onProgress: (done, total) => progress.setMessage(`Bundling ${folder}: ${done} of ${total} files…`),
    });
    progress.hide();
    new Notice(formatBundleFolderResult(result), 10_000);
  } catch (err) {
    progress.hide();
    console.error('[Windrose] Bundling the tile folder failed:', folder, err);
    new Notice(`Bundling ${folder} failed: ${(err as Error)?.message ?? String(err)}`);
  }
}

/**
 * "Compact bundle": refuse up front (trash deletes permanently, not exact,
 * a write in flight), confirm, compact with progress in a Notice, report.
 */
async function runCompactBundleAction(tab: SettingsTabThis, folder: string): Promise<void> {
  const refusal = compactBundleRefusal(tab.app, folder);
  if (refusal != null) { new Notice(refusal, 10_000); return; }
  const confirmed = await new ConfirmModal(tab.app, {
    message: compactBundleConfirmMessage(folder),
    confirmText: 'Compact',
    cancelText: 'Cancel',
  }).openAndGetValue();
  if (!confirmed) return;
  const progress = new Notice(`Compacting ${folder}…`, 0);
  try {
    const result = await compactExistingBundle(tab.app, folder, {
      onProgress: (done, total, phase) => progress.setMessage(`Compacting ${folder}: ${phase} ${done} of ${total}…`),
    });
    progress.hide();
    new Notice(formatCompactBundleResult(result), 10_000);
  } catch (err) {
    progress.hide();
    console.error('[Windrose] Compacting the tile bundle failed:', folder, err);
    new Notice(`Compacting ${folder} failed: ${(err as Error)?.message ?? String(err)}. The exact copy still serves every tile.`);
  }
}

/**
 * "Unbundle": refuse up front (not mounted, a write in flight), confirm,
 * export with progress in a Notice, report.
 */
async function runUnbundleAction(tab: SettingsTabThis, folder: string): Promise<void> {
  const refusal = unbundleRefusal(tab.app, folder);
  if (refusal != null) { new Notice(refusal, 10_000); return; }
  const confirmed = await new ConfirmModal(tab.app, {
    message: unbundleConfirmMessage(entriesFor(folder).entries.length, getBundleModes(folder).includes('compact')),
    confirmText: 'Unbundle',
    cancelText: 'Cancel',
  }).openAndGetValue();
  if (!confirmed) return;
  const progress = new Notice(`Unbundling ${folder}…`, 0);
  try {
    const result = await unbundleFolder(tab.app, folder, {
      onProgress: (done, total) => progress.setMessage(`Unbundling ${folder}: ${done} of ${total} images…`),
    });
    progress.hide();
    new Notice(formatUnbundleResult(result), 10_000);
  } catch (err) {
    progress.hide();
    console.error('[Windrose] Unbundling the tile bundle failed:', folder, err);
    new Notice(`Unbundling ${folder} failed: ${(err as Error)?.message ?? String(err)}. The bundle still serves every tile.`);
  }
}

/** "Clean up": confirm with counts, trash the unused bundle files older than 7 days, report. */
async function runCleanupAction(tab: SettingsTabThis, folder: string, onDone: () => void): Promise<void> {
  const { old, young } = partitionOrphans(await listBundleOrphans(tab.app, folder));
  if (old.length === 0 && young.length === 0) { onDone(); return; }
  const confirmed = await new ConfirmModal(tab.app, {
    message: cleanupConfirmMessage(old, young),
    confirmText: 'Clean up',
    cancelText: 'Cancel',
  }).openAndGetValue();
  if (!confirmed) return;
  try {
    new Notice(formatCleanupResult(await cleanupBundleOrphans(tab.app, folder)), 10_000);
  } catch (err) {
    console.error('[Windrose] Cleaning up the tile bundle failed:', folder, err);
    new Notice(`Cleaning up ${folder} failed: ${(err as Error)?.message ?? String(err)}`);
  } finally {
    onDone();
  }
}

function tilesetFolderRow(tab: SettingsTabThis, folderPath: string, index: number): SettingGroupItem {
  return {
    name: `Tile folder ${index + 1}`,
    render: (setting) => {
      let detectTimer: number | undefined;
      // Desktop only: bundling holds a 4 MiB shard plus a full image in memory
      // and rewrites the folder; mobile never shows the action.
      let bundleBtn: HTMLButtonElement | null = null;
      let view: BundleBadgeView = { folder: '', state: null, looseFiles: null };
      let running = false;
      let compactBtn: HTMLButtonElement | null = null;
      let compacting = false;
      let unbundleBtn: HTMLButtonElement | null = null;
      let unbundling = false;
      let cleanupBtn: HTMLButtonElement | null = null;
      let cleaning = false;
      const syncBundleButton = (): void => {
        const anyRun = compacting || running || unbundling || cleaning || isBundleWriteInProgress(view.folder);
        const mounted = view.folder !== '' && view.state === 'mounted';
        if (unbundleBtn != null) {
          unbundleBtn.toggle(mounted || unbundling);
          unbundleBtn.disabled = anyRun;
        }
        if (cleanupBtn != null) {
          cleanupBtn.toggle((mounted && (view.orphans?.length ?? 0) > 0) || cleaning);
          cleanupBtn.disabled = anyRun;
        }
        if (compactBtn != null) {
          const busy = anyRun;
          const exact = view.folder !== '' && view.state === 'mounted' && getBundleModes(view.folder).includes('exact');
          compactBtn.toggle(exact || compacting);
          compactBtn.disabled = busy;
        }
        if (bundleBtn == null) return;
        const writing = isBundleWriteInProgress(view.folder);
        const offerLoose = view.folder !== '' && view.state === 'loose' && (view.looseFiles ?? 0) > 0;
        // An interrupted run (marker and shards, no index) can be finished by running again.
        const resume = view.folder !== '' && view.state === 'not-on-device' && view.reason === 'index-missing' && !writing;
        bundleBtn.setText(resume ? 'Resume bundling' : 'Bundle folder');
        bundleBtn.toggle(offerLoose || resume || running);
        bundleBtn.disabled = running || writing;
      };
      const badge = attachBundleBadge(tab, setting.descEl, folderPath, next => {
        view = next;
        syncBundleButton();
      });
      if (Platform.isDesktopApp) {
        setting.addButton(btn => {
          bundleBtn = btn.buttonEl;
          btn.setButtonText('Bundle folder')
            .setTooltip('Store the images of this folder as a tile bundle in the same folder')
            .onClick(() => {
              if (running || view.folder === '') return;
              if (view.looseFiles == null && view.reason !== 'index-missing') return;
              running = true;
              syncBundleButton();
              void runBundleFolderAction(tab, view.folder, view.looseFiles).finally(() => {
                running = false;
                syncBundleButton();
              });
            });
        });
        setting.addButton(btn => {
          compactBtn = btn.buttonEl;
          btn.setButtonText('Compact bundle')
            .setTooltip('Re-encode the large images of this bundle in a smaller format')
            .onClick(() => {
              if (compacting || running || view.folder === '') return;
              compacting = true;
              syncBundleButton();
              void runCompactBundleAction(tab, view.folder).finally(() => {
                compacting = false;
                syncBundleButton();
              });
            });
        });
        setting.addButton(btn => {
          unbundleBtn = btn.buttonEl;
          btn.setButtonText('Unbundle')
            .setTooltip('Write the images of this bundle back as loose files')
            .onClick(() => {
              if (unbundling || compacting || running || cleaning || view.folder === '') return;
              unbundling = true;
              syncBundleButton();
              void runUnbundleAction(tab, view.folder).finally(() => {
                unbundling = false;
                syncBundleButton();
              });
            });
        });
        setting.addButton(btn => {
          cleanupBtn = btn.buttonEl;
          btn.setButtonText('Clean up')
            .setTooltip('Move bundle files no longer in use to the trash')
            .onClick(() => {
              if (cleaning || unbundling || compacting || running || view.folder === '') return;
              cleaning = true;
              syncBundleButton();
              void runCleanupAction(tab, view.folder, () => badge.recheck()).finally(() => {
                cleaning = false;
                syncBundleButton();
              });
            });
        });
        syncBundleButton();
      }
      setting.addSearch(search => {
        new FolderSuggest(tab.app, search.inputEl);
        search
          .setPlaceholder('Assets/tiles/baumgart')
          .setValue(folderPath)
          .onChange(async (value: string) => {
            const updated = [...(tab.plugin.settings.tilesetFolders ?? [])];
            updated[index] = value.trim();
            tab.plugin.settings.tilesetFolders = updated;
            tab.settingsChanged = true;
            await tab.plugin.saveSettings();
            // Debounced auto-detection once the path settles — the folder
            // set's "import moment" (scanTilesetFolder no-ops on non-folders).
            if (detectTimer != null) window.clearTimeout(detectTimer);
            detectTimer = window.setTimeout(() => {
              void runFolderDetection(tab.app, value);
              badge.setFolder(value);
            }, FOLDER_DETECT_DEBOUNCE_MS);
          });
      });
      // Drop a pending detection if the row is torn down mid-debounce
      return () => {
        if (detectTimer != null) window.clearTimeout(detectTimer);
        badge.dispose();
      };
    }
  };
}

function buildTilesetSections(tab: SettingsTabThis): SettingDefinitionItem[] {
  const tilesEnabled = (): boolean => isFeatureEnabled('tiles');
  const folders = tab.plugin.settings.tilesetFolders ?? [];
  const sections: SettingDefinitionItem[] = [
    {
      type: 'group',
      heading: 'Tile sets',
      visible: tilesEnabled,
      items: [
        infoItem('Configure vault folders containing hex tile images. Each folder becomes a tileset available to all hex maps. Subfolders are used as tile categories. Use the add button to import a .dungeondraft_pack or a folder of images — with tier mapping and tag suggestions.')
      ]
    },
    {
      type: 'list',
      visible: tilesEnabled,
      emptyState: 'No tile folders configured',
      addItem: {
        name: 'Add tiles',
        action: () => {
          const pluginLike = { app: tab.app, settings: tab.plugin.settings, saveSettings: () => tab.plugin.saveSettings() };
          new AddTilesModal(tab.app, pluginLike, () => saveAndRebuild(tab)).open();
        }
      },
      onDelete: (index) => {
        const updated = [...(tab.plugin.settings.tilesetFolders ?? [])];
        updated.splice(index, 1);
        tab.plugin.settings.tilesetFolders = updated;
        saveAndRebuild(tab);
      },
      items: folders.map((path, i) => tilesetFolderRow(tab, path, i))
    }
  ];

  if (folders.length > 0) {
    sections.push({
      type: 'group',
      visible: tilesEnabled,
      items: [{
        name: 'Preview',
        desc: 'Check what tiles would be loaded from configured folders',
        action: () => {
          void (async () => {
            let totalTiles = 0;
            const results: string[] = [];
            for (const folder of tab.plugin.settings.tilesetFolders ?? []) {
              if (!folder) continue;
              const normalizedFolder = folder.endsWith('/') ? folder.slice(0, -1) : folder;
              // Folder-scoped walk (loose images unioned with any mounted
              // bundle's entries), not a whole-vault getFiles() pass.
              const tiles = await scanTilesetFolder(tab.app, normalizedFolder);
              const bundle = entriesFor(normalizedFolder);
              let line = folder + ': ' + tiles.length + ' tile(s)';
              if (bundle.state === 'mounted' || bundle.state === 'partial') {
                line += ' (' + bundle.entries.length + ' bundled' + (bundle.state === 'partial' ? ', some unreadable' : '') + ')';
              } else if (isBundleFailureState(bundle.state)) {
                line += ' (tile bundle could not be loaded: ' + bundleFailureLabel(bundle.state) + ')';
              }
              totalTiles += tiles.length;
              results.push(line);
            }
            new Notice(results.join('\n') + '\nTotal: ' + totalTiles + ' tiles');
          })();
        }
      }]
    });
  }

  return sections;
}

export { buildColorPaletteSections, buildTravelPackSections, buildTilesetSections, packSummary, packSlug, infoItem, dedupeRowNames, saveAndRebuild };

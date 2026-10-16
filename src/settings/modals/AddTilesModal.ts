/**
 * AddTilesModal — the "Add tiles" import wizard (design: organize.jsx).
 *
 * One entry point for every tile source, three steps (four for a pack):
 *   1. Source — Dungeondraft pack or folder of images. Picking a pack hands
 *      off to DungeondraftImportModal (packs arrive pre-grouped/pre-tagged,
 *      so their steps 2-3 are already answered by the pack itself).
 *   1b. Storage (packs only) — Exact (default, byte for byte) or Compact
 *      (large images re-encoded as WebP, desktop only, one-way), with a
 *      sampled size estimate and an exact-vs-compact preview lineup.
 *   2. Map folders → tiers — one confident-or-check tier vote per subfolder,
 *      fixable with a dropdown (the "approved spine").
 *   3. Tags — folder-name tags are applied automatically; filename-mined
 *      suggestions are one-tap applies with rename support.
 *
 * Finish registers the folder, writes tier/tag metadata, and runs the
 * shared import detection pass (signals, render mode, footprint).
 */

import { Modal, Notice, Platform } from 'obsidian';
import type { App } from 'obsidian';
import { ConfirmModal } from './ConfirmModal';
import type { TileEntry, TileLayerRole } from '#types/tiles/tile.types';
import type { InstalledPack } from '#types/content-packs/contentPack.types';
import type { PluginLike, PckWizardAnalysis, DdWizardDecisions, DdStorage } from '../../content-packs/ddImportCore';
import { runDdImport, analyzePckForWizard, listTextureEntries } from '../../content-packs/ddImportCore';
import type { PckArchive, PckFileEntry, PckSource } from '../../content-packs/pckParser';
import { parsePck, FilePckSource, extractFileData } from '../../content-packs/pckParser';
import { sniffImageMime } from '../../assets/bundles/bundleFormat';
import {
  COMPACT_FLOOR_BYTES, COMPACT_QUALITY, compactEncode, estimateCompactRatio,
} from '../../assets/bundles/bundleCompact';
import type { DungeondraftPackMeta } from '../../content-packs/pckMetadata';
import { parsePackMetadata } from '../../content-packs/pckMetadata';
import { FolderSuggest } from '../helpers/FolderSuggest';
import { scanTilesetFolder } from '../../assets/tilesetOperations';
import {
  aggregateFolderTiers,
  mineFilenameTags,
} from '../../assets/importPlanner';
import type { FolderTierRow, TagSuggestion } from '../../assets/importPlanner';
import { runImportDetectionPass } from '../../assets/importDetectionPass';
import {
  ensureTileMetadataLoaded,
  commitTileMetadataDelta,
  bulkSetDepthAffinity,
  bulkSetImportTags,
} from '../../persistence/tileMetadata';

const TIER_LABELS: Record<TileLayerRole, string> = {
  ground: 'Terrain',
  structure: 'Structure',
  props: 'Props',
  decoration: 'Decoration',
};
const TIER_ORDER: TileLayerRole[] = ['ground', 'structure', 'props', 'decoration'];
type StepId = 'source' | 'storage' | 'tiers' | 'tags';
const STEP_TITLES: Record<StepId, string> = { source: 'Source', storage: 'Storage', tiers: 'Tiers', tags: 'Tags' };
/** Textures sampled (evenly spaced) for the compact size estimate. */
const ESTIMATE_SAMPLES = 40;
const PREVIEW_ZOOMS = [1, 2, 4];
const PREVIEW_CELL_PX = 150;

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
const FOLDER_SCAN_DEBOUNCE_MS = 500;

type SourceKind = 'pack' | 'folder';

class AddTilesModal extends Modal {
  private plugin: PluginLike;
  private onImported?: () => void;

  private step = 0;
  private source: SourceKind = 'pack';
  private folderPath = '';
  private tiles: TileEntry[] = [];
  private scanTimer: number | undefined;

  // Pack source state (directory parsed up front; file bytes stream on demand,
  // so multi-GB packs never allocate a whole-file buffer — nothing extracts
  // until Finish).
  private packSource: PckSource | null = null;
  private packArchive: PckArchive | null = null;
  private packMeta: DungeondraftPackMeta | null = null;
  private packAnalysis: PckWizardAnalysis | null = null;

  private tierRows: FolderTierRow[] = [];
  private tierChoice = new Map<string, TileLayerRole>();

  private suggestions: TagSuggestion[] = [];
  /** suggestion tag -> applied name (rename-aware); absent = not applied */
  private appliedTags = new Map<string, string>();
  /** manual tags applied to every imported tile */
  private manualTags: string[] = [];

  /** Bundle storage for a pack import (Storage step); folder sources never use it. */
  private storage: DdStorage = 'exact';
  /** Sampled size estimate for the current pack; null until computed. */
  private estimate: { exact: number; compact: number } | null = null;
  private estimating: Promise<void> | null = null;

  private finished = false;
  /** True while an import is writing files — close() speedbumps until done. */
  private importing = false;
  /** Set via the speedbump confirm; polled by the extraction loop. */
  private cancelRequested = false;
  private cancelPromptOpen = false;

  constructor(app: App, plugin: PluginLike, onImported?: () => void) {
    super(app);
    this.plugin = plugin;
    this.onImported = onImported;
  }

  /**
   * Backdrop clicks and Escape both route through close(). A large pack can
   * take many minutes to extract — a stray outside click must not dismiss
   * the progress view mid-import. Instead of a hard block, offer a real
   * cancel: confirm → the extraction loop stops cleanly and the modal
   * closes itself (already-extracted files stay; re-import resumes safely).
   */
  override close(): void {
    if (this.importing) {
      if (!this.cancelPromptOpen && !this.cancelRequested) {
        this.cancelPromptOpen = true;
        void new ConfirmModal(this.app, {
          message: 'An import is still running. Cancel it?\nFiles already extracted stay in the vault — re-importing this pack later resumes safely (files update in place).',
          confirmText: 'Cancel import',
          cancelText: 'Keep importing',
          isDestructive: true,
        }).openAndGetValue().then(confirmed => {
          this.cancelPromptOpen = false;
          if (confirmed) this.cancelRequested = true;
        });
      }
      return;
    }
    super.close();
  }

  override onOpen(): void {
    this.modalEl.addClass('windrose-add-tiles-modal');
    this.render();
  }

  override onClose(): void {
    if (this.scanTimer != null) window.clearTimeout(this.scanTimer);
    this.contentEl.empty();
    if (this.finished && this.onImported != null) this.onImported();
  }

  // ========================= shell =========================

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createEl('h2', { text: 'Add tiles' });
    this.renderStepper(contentEl);

    const body = contentEl.createDiv({ cls: 'windrose-wz-body' });
    const foot = contentEl.createDiv({ cls: 'windrose-wz-foot' });

    const id = this.stepIds()[this.step] ?? 'source';
    if (id === 'source') this.renderSource(body, foot);
    else if (id === 'storage') this.renderStorage(body, foot);
    else if (id === 'tiers') this.renderTiers(body, foot);
    else this.renderTags(body, foot);
  }

  /** The wizard's steps for the current source: packs add Storage after Source. */
  private stepIds(): StepId[] {
    return this.source === 'pack' ? ['source', 'storage', 'tiers', 'tags'] : ['source', 'tiers', 'tags'];
  }

  private goTo(id: StepId): void {
    this.step = Math.max(0, this.stepIds().indexOf(id));
    this.render();
  }

  /** The step before the current one (Back). */
  private goBack(): void {
    this.step = Math.max(0, this.step - 1);
    this.render();
  }

  private renderStepper(parent: HTMLElement): void {
    const steps = parent.createDiv({ cls: 'windrose-wz-steps' });
    const labels = this.stepIds().map(id => STEP_TITLES[id]);
    labels.forEach((label, i) => {
      const cls = i === this.step ? 'on' : i < this.step ? 'done' : '';
      const step = steps.createDiv({ cls: 'windrose-wz-step ' + cls });
      step.createSpan({ cls: 'windrose-wz-num', text: i < this.step ? '✓' : String(i + 1) });
      step.createSpan({ cls: 'windrose-wz-lbl', text: label });
      if (i < labels.length - 1) steps.createDiv({ cls: 'windrose-wz-sep' });
    });
  }

  // ========================= 1: Source =========================

  private renderSource(body: HTMLElement, foot: HTMLElement): void {
    body.createDiv({
      cls: 'windrose-wz-lead',
      text: 'What are you adding? Both routes land in the same next two steps — a pack just arrives further along.',
    });

    const cards = body.createDiv({ cls: 'windrose-wz-cards' });

    const packCard = this.renderSourceCard(cards, {
      kind: 'pack',
      title: 'Dungeondraft pack',
      desc: 'A .dungeondraft_pack file. Groups + tags read straight from the pack.',
      badge: 'categories & tags included',
    });
    const folderCard = this.renderSourceCard(cards, {
      kind: 'folder',
      title: 'Folder of images',
      desc: 'A vault folder of PNGs/WebPs. Subfolders map to tiers and tags are mined from filenames.',
    });

    // Pack file input + parse preview, visible when the pack card is selected.
    const packInputRow = packCard.createDiv({ cls: 'windrose-wz-folderin' });
    const fileInput = packInputRow.createEl('input', {
      type: 'file',
      attr: { accept: '.dungeondraft_pack' },
    });
    const packPreview = packCard.createDiv({ cls: 'windrose-wz-packprev' });
    if (this.packMeta != null && this.packAnalysis != null) {
      this.renderPackPreview(packPreview);
    }
    if (this.source !== 'pack') { packInputRow.hide(); packPreview.hide(); }

    // Folder path input, visible when the folder card is selected.
    const folderInputRow = folderCard.createDiv({ cls: 'windrose-wz-folderin' });
    const input = folderInputRow.createEl('input', {
      type: 'text',
      attr: { placeholder: 'Assets/tiles/fantasy-core', spellcheck: 'false' },
    });
    input.value = this.folderPath;
    new FolderSuggest(this.app, input);
    if (this.source !== 'folder') folderInputRow.hide();

    // Footer: Cancel / caption / Continue
    const cancelBtn = foot.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = (): void => this.close();
    const caption = foot.createSpan({ cls: 'windrose-wz-cap' });
    const continueBtn = foot.createEl('button', { text: 'Continue →', cls: 'mod-cta' });

    const updateReadiness = (): void => {
      if (this.source === 'pack') {
        const a = this.packAnalysis;
        caption.textContent = a != null
          ? `${a.cellTiles.length} tile(s) ready` +
            (a.stripCount > 0 ? ` · ${a.stripCount} wall/path strip(s)` : '')
          : 'Pick a .dungeondraft_pack file';
        // Strips-only packs are valid — walls/paths import automatically.
        continueBtn.disabled = a == null || (a.cellTiles.length === 0 && a.stripCount === 0);
      } else {
        caption.textContent = this.tiles.length > 0
          ? `${this.tiles.length} tile(s) ready`
          : 'Pick a folder containing images';
        continueBtn.disabled = this.tiles.length === 0;
      }
    };

    const select = (kind: SourceKind): void => {
      this.source = kind;
      packCard.toggleClass('on', kind === 'pack');
      folderCard.toggleClass('on', kind === 'folder');
      if (kind === 'folder') folderInputRow.show(); else folderInputRow.hide();
      if (kind === 'pack') { packInputRow.show(); packPreview.show(); }
      else { packInputRow.hide(); packPreview.hide(); }
      updateReadiness();
    };
    packCard.onclick = (e: MouseEvent): void => {
      if (e.target !== fileInput) select('pack');
    };
    folderCard.onclick = (e: MouseEvent): void => {
      // Clicking the input shouldn't re-run selection (and steal focus behavior).
      if (e.target !== input) select('folder');
    };

    fileInput.addEventListener('change', (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file == null) return;
      void this.handlePackFile(file, packPreview).then(updateReadiness);
    });

    input.addEventListener('input', () => {
      this.folderPath = input.value.trim();
      this.tiles = [];
      updateReadiness();
      if (this.scanTimer != null) window.clearTimeout(this.scanTimer);
      this.scanTimer = window.setTimeout(() => {
        void this.scanFolder().then(updateReadiness);
      }, FOLDER_SCAN_DEBOUNCE_MS);
    });

    continueBtn.onclick = (): void => {
      if (this.source === 'pack') {
        if (this.packAnalysis == null) return;
        // The pack's pseudo-tiles drive the same steps ②③ as a folder —
        // "a pack just arrives further along."
        this.tiles = this.packAnalysis.cellTiles;
      } else if (this.tiles.length === 0) {
        return;
      }
      this.tierRows = aggregateFolderTiers(this.tiles);
      this.tierChoice = new Map(this.tierRows.map(r => [r.category, r.tier]));
      this.suggestions = mineFilenameTags(this.tiles);
      this.goTo(this.source === 'pack' ? 'storage' : 'tiers');
    };

    select(this.source);
  }

  private async handlePackFile(file: File, preview: HTMLElement): Promise<void> {
    preview.empty();
    this.packSource = null;
    this.packArchive = null;
    this.packMeta = null;
    this.packAnalysis = null;
    this.estimate = null;
    this.estimating = null;
    preview.createEl('p', { text: 'Reading pack…' });

    try {
      // Stream the pack: only the directory + individual entries are read, so a
      // multi-GB file never trips Blob.arrayBuffer()'s single-allocation ceiling.
      const source = new FilePckSource(file);
      const archive = await parsePck(source);
      const result = await parsePackMetadata(source, archive);
      preview.empty();
      if (!result.ok) {
        preview.createEl('p', { text: result.error, cls: 'windrose-wz-error' });
        return;
      }
      this.packSource = source;
      this.packArchive = archive;
      this.packMeta = result.meta;
      this.packAnalysis = await analyzePckForWizard(source, archive);
      this.renderPackPreview(preview);
    } catch (err: unknown) {
      preview.empty();
      preview.createEl('p', {
        text: 'Failed to read pack: ' + (err as Error).message,
        cls: 'windrose-wz-error',
      });
    }
  }

  private renderPackPreview(preview: HTMLElement): void {
    const meta = this.packMeta;
    const analysis = this.packAnalysis;
    if (meta == null || analysis == null) return;
    preview.empty();
    const head = preview.createDiv();
    head.createEl('strong', { text: meta.name });
    head.createSpan({ text: ` by ${meta.author} · v${meta.version}` });
    preview.createEl('p', {
      text: `${analysis.cellTiles.length} tile(s) · ${analysis.stripCount} wall/path strip(s) · ` +
        `${analysis.packTags.length} tag(s)`,
    });
    const existing = (this.plugin.settings.installedContentPacks ?? [])
      .find((p: InstalledPack) => p.id === meta.id);
    if (existing != null) {
      preview.createEl('p', {
        cls: 'windrose-wz-warning',
        text: `Already imported (v${existing.version}) — finishing will overwrite existing files.`,
      });
    }
  }

  private renderSourceCard(
    parent: HTMLElement,
    opts: { kind: SourceKind; title: string; desc: string; badge?: string },
  ): HTMLElement {
    const card = parent.createDiv({ cls: 'windrose-wz-src' });
    const main = card.createDiv({ cls: 'windrose-wz-src-main' });
    main.createDiv({ cls: 'windrose-wz-src-title', text: opts.title });
    main.createDiv({ cls: 'windrose-wz-src-desc', text: opts.desc });
    if (opts.badge != null) {
      main.createSpan({ cls: 'windrose-wz-badge', text: '✦ ' + opts.badge });
    }
    card.createDiv({ cls: 'windrose-wz-radio' });
    return card;
  }

  private async scanFolder(): Promise<void> {
    const folder = this.folderPath.replace(/\/+$/, '');
    if (folder === '') {
      this.tiles = [];
      return;
    }
    try {
      this.tiles = await scanTilesetFolder(this.app, folder);
    } catch {
      this.tiles = [];
    }
  }

  // ========================= 1b: Storage (packs) =========================

  private renderStorage(body: HTMLElement, foot: HTMLElement): void {
    const desktop = Platform.isDesktopApp;
    if (!desktop) this.storage = 'exact';
    body.createDiv({
      cls: 'windrose-wz-lead',
      text: 'How should the tiles be stored? You can re-import the pack later to change this.',
    });
    const cards = body.createDiv({ cls: 'windrose-wz-cards' });
    const exactCard = this.renderChoiceCard(cards, 'Exact', 'Keeps every image byte for byte. Reversible.');
    const compactCard = this.renderChoiceCard(cards, 'Compact',
      'Re-encodes large images as smaller WebP (about 7× smaller on typical packs). ' +
      'Small images under 64 KB stay exact. One-way: the original bytes are not kept; re-import the pack to go back.');
    if (!desktop) {
      compactCard.addClass('is-disabled');
      compactCard.querySelector('.windrose-wz-src-main')
        ?.createDiv({ cls: 'windrose-wz-warning', text: 'Compact needs the desktop app.' });
    }
    const select = (mode: DdStorage): void => {
      this.storage = mode;
      exactCard.toggleClass('on', mode === 'exact');
      compactCard.toggleClass('on', mode === 'compact');
    };
    exactCard.onclick = (): void => select('exact');
    compactCard.onclick = (): void => { if (desktop) select('compact'); };
    select(this.storage);

    const estimateLine = body.createDiv({ cls: 'windrose-wz-estimate' });
    const showEstimate = (): void => {
      const e = this.estimate;
      estimateLine.setText(e == null
        ? 'Estimated size: estimating…'
        : `Estimated size: Exact ${formatMb(e.exact)} · Compact about ${formatMb(e.compact)}`);
    };
    if (desktop) {
      showEstimate();
      void this.ensureEstimate().then(showEstimate, () => estimateLine.setText('Estimated size: unavailable'));
      const previewBtn = body.createEl('button', { text: 'Preview', cls: 'windrose-wz-preview-btn' });
      previewBtn.onclick = (): void => {
        if (this.packSource == null) return;
        new CompactPreviewModal(this.app, this.packSource, this.previewEntries()).open();
      };
    } else {
      estimateLine.setText(`Estimated size: Exact ${formatMb(this.packTextureBytes())}`);
    }

    const backBtn = foot.createEl('button', { text: 'Back' });
    backBtn.onclick = (): void => this.goBack();
    foot.createSpan({ cls: 'windrose-wz-cap' });
    const continueBtn = foot.createEl('button', { text: 'Continue →', cls: 'mod-cta' });
    continueBtn.onclick = (): void => this.goTo('tiers');
  }

  /** A radio card in the source-card style (title, description, radio dot). */
  private renderChoiceCard(parent: HTMLElement, title: string, desc: string): HTMLElement {
    const card = parent.createDiv({ cls: 'windrose-wz-src' });
    const main = card.createDiv({ cls: 'windrose-wz-src-main' });
    main.createDiv({ cls: 'windrose-wz-src-title', text: title });
    main.createDiv({ cls: 'windrose-wz-src-desc', text: desc });
    card.createDiv({ cls: 'windrose-wz-radio' });
    return card;
  }

  private packTextures(): PckFileEntry[] {
    return this.packArchive == null ? [] : listTextureEntries(this.packArchive);
  }

  private packTextureBytes(): number {
    return this.packTextures().reduce((n, e) => n + e.size, 0);
  }

  /** Compute the sampled estimate once per pack (joins an estimate already running). */
  private ensureEstimate(): Promise<void> {
    if (this.estimate != null) return Promise.resolve();
    if (this.estimating != null) return this.estimating;
    const source = this.packSource;
    const textures = this.packTextures();
    const run = (async (): Promise<void> => {
      if (source == null) return;
      const k = Math.min(ESTIMATE_SAMPLES, textures.length);
      const samples: Array<{ bytes: Uint8Array; mime: string }> = [];
      for (let i = 0; i < k; i++) {
        const entry = textures[Math.floor((i * textures.length) / k)];
        try {
          const bytes = await extractFileData(source, entry);
          const mime = sniffImageMime(bytes);
          if (mime != null) samples.push({ bytes, mime });
        } catch {
          // An unreadable sample just drops out of the estimate.
        }
      }
      const ratio = await estimateCompactRatio(samples);
      const exact = textures.reduce((n, e) => n + e.size, 0);
      if (this.packSource === source) this.estimate = { exact, compact: exact * ratio };
    })();
    const tracked = run.finally(() => { if (this.estimating === tracked) this.estimating = null; });
    this.estimating = tracked;
    return tracked;
  }

  /** Preview picks: the largest texture, a median-sized one, and the smallest at or above the floor. */
  private previewEntries(): PckFileEntry[] {
    const bySize = this.packTextures().filter(e => e.size >= COMPACT_FLOOR_BYTES).sort((a, b) => b.size - a.size);
    if (bySize.length === 0) return [];
    const picks = [bySize[0], bySize[Math.floor(bySize.length / 2)], bySize[bySize.length - 1]];
    return picks.filter((e, i) => picks.indexOf(e) === i);
  }


  // ========================= 2: Tiers =========================

  private renderTiers(body: HTMLElement, foot: HTMLElement): void {
    const autoCount = this.tierRows.filter(r => r.auto).length;
    const checkCount = this.tierRows.length - autoCount;

    const lead = body.createDiv({ cls: 'windrose-wz-lead' });
    if (this.tierRows.length === 0 && this.source === 'pack') {
      lead.appendText('This pack contains no cell tiles to tier — nothing to review here.');
    } else {
      lead.createEl('b', { text: `${this.tierRows.length} folder(s) · ${this.tiles.length} tiles` });
      lead.appendText(' found. We guessed a tier for each — fix any that look wrong, then continue.');
    }
    if (this.source === 'pack' && (this.packAnalysis?.stripCount ?? 0) > 0) {
      lead.appendText(` ${this.packAnalysis?.stripCount} wall/path strip(s) import automatically as line assets.`);
    }

    const table = body.createDiv({ cls: 'windrose-wz-table' });
    for (const row of this.tierRows) {
      const rowEl = table.createDiv({ cls: 'windrose-wz-row' });
      const info = rowEl.createDiv({ cls: 'windrose-wz-row-info' });
      info.createDiv({ cls: 'windrose-wz-row-path', text: row.displayPath });
      info.createDiv({ cls: 'windrose-wz-row-count', text: `${row.tileCount} tiles` });

      rowEl.createSpan({
        cls: row.auto ? 'windrose-wz-auto' : 'windrose-wz-fix',
        text: row.auto ? 'auto' : 'check',
      });

      const select = rowEl.createEl('select', { cls: 'dropdown windrose-wz-tier' });
      for (const tier of TIER_ORDER) {
        const opt = select.createEl('option', { text: TIER_LABELS[tier] });
        opt.value = tier;
      }
      select.value = this.tierChoice.get(row.category) ?? row.tier;
      select.onchange = (): void => {
        this.tierChoice.set(row.category, select.value as TileLayerRole);
      };
    }

    const backBtn = foot.createEl('button', { text: 'Back' });
    backBtn.onclick = (): void => this.goBack();
    foot.createSpan({
      cls: 'windrose-wz-cap',
      text: `${autoCount} auto · ${checkCount} to check`,
    });
    const continueBtn = foot.createEl('button', { text: 'Continue →', cls: 'mod-cta' });
    continueBtn.onclick = (): void => this.goTo('tags');
  }

  // ========================= 3: Tags =========================

  private renderTags(body: HTMLElement, foot: HTMLElement): void {
    if (this.source === 'pack') {
      // Tags shipped inside the pack — applied automatically at import.
      const packTags = this.packAnalysis?.packTags ?? [];
      if (packTags.length > 0) {
        body.createDiv({ cls: 'windrose-wz-group', text: 'Imported with the pack · applied' });
        const chips = body.createDiv({ cls: 'windrose-wz-chips' });
        for (const { tag, count } of packTags.slice(0, 12)) {
          chips.createSpan({ cls: 'windrose-wz-chip', text: `✓ ${tag} ${count}` });
        }
        if (packTags.length > 12) {
          chips.createSpan({ cls: 'windrose-wz-chip', text: `+${packTags.length - 12} more` });
        }
      }
    } else {
      // Folder-name tags arrive automatically (folderTags in getAllTags).
      const folderTagNames = Array.from(new Set(
        this.tiles.flatMap(t => (t.category ?? '').split('/'))
          .filter(s => s !== '')
          .map(s => s.toLowerCase()),
      ));
      if (folderTagNames.length > 0) {
        body.createDiv({ cls: 'windrose-wz-group', text: 'From folder names · applied' });
        const chips = body.createDiv({ cls: 'windrose-wz-chips' });
        for (const name of folderTagNames.slice(0, 12)) {
          chips.createSpan({ cls: 'windrose-wz-chip', text: '✓ ' + name });
        }
        if (folderTagNames.length > 12) {
          chips.createSpan({ cls: 'windrose-wz-chip', text: `+${folderTagNames.length - 12} more` });
        }
      }
    }

    body.createDiv({ cls: 'windrose-wz-group', text: 'Suggested from filenames' });
    if (this.suggestions.length === 0) {
      body.createDiv({ cls: 'windrose-wz-lead', text: 'No recurring filename words found — you can still add tags manually below.' });
    }
    const maxCount = this.suggestions.length > 0 ? this.suggestions[0].count : 1;
    const rows = body.createDiv();
    for (const suggestion of this.suggestions) {
      this.renderTagRow(rows, suggestion, maxCount, foot);
    }

    // Manual tag: applies to every imported tile.
    const addRow = body.createDiv({ cls: 'windrose-wz-addrow' });
    const addInput = addRow.createEl('input', {
      type: 'text',
      attr: { placeholder: 'Add a tag manually (applies to all tiles)…', spellcheck: 'false' },
    });
    const addBtn = addRow.createEl('button', { text: 'Add' });
    const manualChips = body.createDiv({ cls: 'windrose-wz-chips' });
    const renderManual = (): void => {
      manualChips.empty();
      for (const name of this.manualTags) {
        const chip = manualChips.createSpan({ cls: 'windrose-wz-chip on', text: '✓ ' + name + ' ' });
        const x = chip.createSpan({ cls: 'windrose-wz-chip-x', text: '×' });
        x.onclick = (): void => {
          this.manualTags = this.manualTags.filter(t => t !== name);
          renderManual();
          this.updateTagCaption(foot);
        };
      }
    };
    addBtn.onclick = (): void => {
      const name = addInput.value.trim().toLowerCase();
      if (name === '' || this.manualTags.includes(name)) return;
      this.manualTags.push(name);
      addInput.value = '';
      renderManual();
      this.updateTagCaption(foot);
    };
    renderManual();

    const backBtn = foot.createEl('button', { text: 'Back' });
    backBtn.onclick = (): void => this.goBack();
    foot.createSpan({ cls: 'windrose-wz-cap' });
    const finishBtn = foot.createEl('button', { text: 'Finish import', cls: 'mod-cta' });
    finishBtn.onclick = (): void => {
      void this.finishImport(body, foot, finishBtn);
    };
    this.updateTagCaption(foot);
  }

  private renderTagRow(
    parent: HTMLElement,
    suggestion: TagSuggestion,
    maxCount: number,
    foot: HTMLElement,
  ): void {
    const row = parent.createDiv({ cls: 'windrose-wz-tag' });
    const top = row.createDiv({ cls: 'windrose-wz-tag-top' });
    top.createSpan({ cls: 'windrose-wz-tag-name', text: suggestion.tag });
    top.createSpan({ cls: 'windrose-wz-tag-count', text: String(suggestion.count) });
    const bar = top.createDiv({ cls: 'windrose-wz-tag-bar' });
    const fill = bar.createDiv({ cls: 'windrose-wz-tag-fill' });
    fill.setCssStyles({ width: `${Math.min(100, (suggestion.count / maxCount) * 100)}%` });
    const toggle = top.createEl('button', { cls: 'windrose-wz-toggle', text: 'Apply' });

    // Sample filename with the matched token highlighted.
    const { filename, start, length } = suggestion.sample;
    const sample = row.createDiv({ cls: 'windrose-wz-tag-sample' });
    if (start >= 0) {
      sample.appendText(filename.slice(0, start));
      sample.createSpan({ cls: 'windrose-wz-mark', text: filename.slice(start, start + length) });
      sample.appendText(filename.slice(start + length));
    } else {
      sample.appendText(filename);
    }

    const renameRow = row.createDiv({ cls: 'windrose-wz-rename' });
    renameRow.createSpan({ cls: 'windrose-wz-cap', text: 'name' });
    const renameInput = renameRow.createEl('input', {
      type: 'text',
      attr: { spellcheck: 'false' },
    });
    renameInput.value = suggestion.tag;
    renameInput.addEventListener('input', () => {
      if (this.appliedTags.has(suggestion.tag)) {
        this.appliedTags.set(suggestion.tag, renameInput.value.trim());
      }
    });
    renameRow.hide();

    const sync = (): void => {
      const on = this.appliedTags.has(suggestion.tag);
      toggle.setText(on ? '✓ Applied' : 'Apply');
      toggle.toggleClass('on', on);
      row.toggleClass('on', on);
      if (on) renameRow.show(); else renameRow.hide();
    };
    toggle.onclick = (): void => {
      if (this.appliedTags.has(suggestion.tag)) {
        this.appliedTags.delete(suggestion.tag);
      } else {
        this.appliedTags.set(suggestion.tag, renameInput.value.trim());
      }
      sync();
      this.updateTagCaption(foot);
    };
    sync();
  }

  /** Tags applied automatically, without an explicit toggle: folder-name tags for a
   *  folder import, pack-shipped tags for a pack import. These are rendered as
   *  already-applied chips in the body, so they must also count toward the caption
   *  and post-import summary — otherwise both read 0 until the user toggles a
   *  suggestion by hand. */
  private autoAppliedTagNames(): string[] {
    if (this.source === 'pack') {
      return Array.from(new Set((this.packAnalysis?.packTags ?? []).map(t => t.tag.toLowerCase())));
    }
    return Array.from(new Set(
      this.tiles.flatMap(t => (t.category ?? '').split('/'))
        .filter(s => s !== '')
        .map(s => s.toLowerCase()),
    ));
  }

  /** Total applied tags across auto (folder/pack), toggled suggestions, and manual. */
  private totalAppliedTagCount(): number {
    return this.autoAppliedTagNames().length + this.appliedTags.size + this.manualTags.length;
  }

  private updateTagCaption(foot: HTMLElement): void {
    const caption = foot.querySelector('.windrose-wz-cap');
    if (caption == null) return;
    const autoTags = this.autoAppliedTagNames();
    const applied = autoTags.length + this.appliedTags.size + this.manualTags.length;
    const tilesTouched = new Set<string>();
    for (const suggestion of this.suggestions) {
      if (this.appliedTags.has(suggestion.tag)) {
        for (const p of suggestion.paths) tilesTouched.add(p);
      }
    }
    // Auto folder/pack tags and manual tags apply across every imported tile.
    if (autoTags.length > 0 || this.manualTags.length > 0) {
      for (const t of this.tiles) tilesTouched.add(t.vaultPath);
    }
    const autoCats = this.tierRows.filter(r => r.auto).length;
    const catPart = autoCats > 0 ? ` · ${autoCats} categor${autoCats === 1 ? 'y' : 'ies'} auto-sorted` : '';
    caption.textContent = `${applied} tag(s) · ${tilesTouched.size} tiles${catPart}`;
  }

  // ========================= Finish =========================

  /** Step ②③ outcomes in the shape the DD pipeline consumes. */
  private buildWizardDecisions(): DdWizardDecisions {
    const tierByFolder = new Map<string, TileLayerRole>();
    for (const row of this.tierRows) {
      tierByFolder.set(row.category, this.tierChoice.get(row.category) ?? row.tier);
    }
    const extraTags: Array<{ tag: string; rels: string[] }> = [];
    for (const suggestion of this.suggestions) {
      const applied = this.appliedTags.get(suggestion.tag);
      if (applied == null || applied === '') continue;
      extraTags.push({ tag: applied, rels: suggestion.paths });
    }
    for (const manual of this.manualTags) {
      extraTags.push({ tag: manual, rels: this.tiles.map(t => t.vaultPath) });
    }
    return { tierByFolder, extraTags };
  }

  private async finishPackImport(
    body: HTMLElement,
    foot: HTMLElement,
    finishBtn: HTMLButtonElement,
  ): Promise<void> {
    if (this.packSource == null || this.packArchive == null || this.packMeta == null) return;
    finishBtn.disabled = true;
    finishBtn.setText('Importing…');
    body.empty();
    foot.querySelectorAll('button').forEach(b => { b.disabled = true; });

    const progress = body.createDiv({ cls: 'windrose-wz-progress' });
    const progressBar = progress.createEl('progress', { attr: { max: '100', value: '0' } });
    progressBar.setCssStyles({ width: '100%' });
    const status = progress.createEl('p', { text: 'Preparing…' });

    try {
      const result = await runDdImport(
        this.app,
        this.plugin,
        this.packSource,
        this.packArchive,
        this.packMeta,
        (done, total, stage) => {
          if (this.cancelRequested) {
            status.setText('Cancelling…');
            return;
          }
          if (stage === 'extract') {
            progressBar.value = Math.round((done / total) * 90);
            status.setText(`Extracting: ${done}/${total}`);
          } else if (stage === 'metadata') {
            status.setText('Saving tag metadata…');
          } else if (stage === 'scan') {
            status.setText('Analyzing tile footprints…');
          }
        },
        this.buildWizardDecisions(),
        () => this.cancelRequested,
        { storage: this.storage },
      );

      if (result.cancelled) {
        new Notice(`${result.packName} import cancelled — ${result.imported} of ${result.total} textures extracted. Re-importing later resumes safely.`);
        this.finished = result.imported > 0;
        return;
      }

      if (result.error != null) {
        progress.empty();
        progress.createEl('p', {
          cls: 'windrose-wz-error',
          text: `Import of ${result.packName} failed: ${result.error}. No tile set was added (see developer console).`,
        });
        new Notice(`${result.packName} import failed: ${result.error}.`);
        finishBtn.setText('Finish import');
        finishBtn.disabled = false;
        return;
      }

      progressBar.value = 100;
      progress.empty();
      const replaced = result.looseReplaced ?? 0;
      const kept = result.looseKept?.length ?? 0;
      const keptPermanent = result.looseKeptPermanentDelete ?? 0;
      progress.createEl('p', {
        cls: result.failed > 0 || kept > 0 || keptPermanent > 0 ? 'windrose-wz-warning' : 'windrose-wz-done',
        text: `Imported ${result.imported} of ${result.total} textures from ${result.packName}.` +
          (result.failed > 0 ? ` ${result.failed} file(s) failed (see developer console).` : '') +
          (replaced > 0 ? ` Replaced ${replaced} loose ${replaced === 1 ? 'file' : 'files'} with the bundle.` : '') +
          (kept > 0 ? ` Kept ${kept} loose ${kept === 1 ? 'file' : 'files'} the bundle does not replace with identical bytes (see developer console).` : '') +
          (keptPermanent > 0
            ? ` Kept ${keptPermanent} loose ${keptPermanent === 1 ? 'file' : 'files'} from the earlier import because your trash setting deletes files permanently; remove them yourself once the bundle looks right.`
            : '') +
          (result.compact != null
            ? ` Compact: ${result.compact.compacted} images re-encoded, ${result.compact.keptExact} kept exact, saved ${formatMb(result.compact.bytesSaved)}.`
            : ''),
      });
      new Notice(`${result.packName} imported (${result.imported}/${result.total} textures).`);

      this.finished = true;
      finishBtn.setText('Done');
      finishBtn.disabled = false;
      finishBtn.onclick = (): void => this.close();
    } catch (err: unknown) {
      console.error('[Windrose] Pack import failed:', err);
      progress.empty();
      progress.createEl('p', {
        cls: 'windrose-wz-error',
        text: 'Import failed: ' + (err as Error).message,
      });
      finishBtn.setText('Finish import');
      finishBtn.disabled = false;
    }
  }

  private async finishImport(
    body: HTMLElement,
    foot: HTMLElement,
    finishBtn: HTMLButtonElement,
  ): Promise<void> {
    this.importing = true;
    try {
      await this.runFinishImport(body, foot, finishBtn);
    } finally {
      this.importing = false;
    }
    // A confirmed cancel means "I want out" — close once the loop unwinds
    if (this.cancelRequested) this.close();
  }

  private async runFinishImport(
    body: HTMLElement,
    foot: HTMLElement,
    finishBtn: HTMLButtonElement,
  ): Promise<void> {
    if (this.source === 'pack') {
      await this.finishPackImport(body, foot, finishBtn);
      return;
    }
    finishBtn.disabled = true;
    finishBtn.setText('Importing…');
    body.empty();
    foot.querySelectorAll('button').forEach(b => { b.disabled = true; });

    const progress = body.createDiv({ cls: 'windrose-wz-progress' });
    const progressBar = progress.createEl('progress', { attr: { max: '100', value: '5' } });
    progressBar.setCssStyles({ width: '100%' });
    const status = progress.createEl('p', { text: 'Registering tileset folder…' });

    try {
      const folder = this.folderPath.replace(/\/+$/, '');
      const settings = this.plugin.settings;
      settings.tilesetFolders ??= [];
      if (!settings.tilesetFolders.includes(folder)) {
        settings.tilesetFolders.push(folder);
        await this.plugin.saveSettings();
      }

      // Snapshot of the shared store; only this import's delta is merged back.
      const base = await ensureTileMetadataLoaded(this.app);
      let metadata = base;
      // Import-moment guard (2026-06-09 RCA): prior metadata means this set
      // was known before and may have placements — withhold render-mode.
      const hasPrior = this.tiles.some(t => metadata[t.vaultPath] != null);

      status.setText('Applying tiers and tags…');
      const tierEntries: Array<{ vaultPath: string; depth: TileLayerRole }> = [];
      for (const row of this.tierRows) {
        const tier = this.tierChoice.get(row.category) ?? row.tier;
        for (const vaultPath of row.paths) tierEntries.push({ vaultPath, depth: tier });
      }
      metadata = bulkSetDepthAffinity(metadata, tierEntries);

      const tagsByPath = new Map<string, string[]>();
      const push = (path: string, tag: string): void => {
        if (tag === '') return;
        const list = tagsByPath.get(path);
        if (list != null) { if (!list.includes(tag)) list.push(tag); }
        else tagsByPath.set(path, [tag]);
      };
      for (const suggestion of this.suggestions) {
        const applied = this.appliedTags.get(suggestion.tag);
        if (applied == null) continue;
        for (const p of suggestion.paths) push(p, applied);
      }
      for (const manual of this.manualTags) {
        for (const t of this.tiles) push(t.vaultPath, manual);
      }
      if (tagsByPath.size > 0) {
        metadata = bulkSetImportTags(
          metadata,
          Array.from(tagsByPath.entries()).map(([vaultPath, tags]) => ({ vaultPath, tags })),
        );
      }

      status.setText('Scanning tiles for auto-detection…');
      const { metadata: next, stats } = await runImportDetectionPass(this.app, this.tiles, metadata, {
        applyRenderMode: !hasPrior,
        onScanProgress: (done, total) => {
          progressBar.value = 10 + Math.round((done / total) * 85);
          status.setText(`Scanning tiles ${done}/${total}…`);
        },
      });
      if (!await commitTileMetadataDelta(this.app, base, next)) {
        new Notice('Windrose: tile metadata save was refused — tiers and tags were not saved. See console.');
      }
      window.dispatchEvent(new Event('windrose-settings-changed'));

      progressBar.value = 100;
      progress.empty();
      const autoCats = this.tierRows.filter(r => r.auto).length;
      progress.createEl('p', {
        cls: 'windrose-wz-done',
        text: `Imported ${this.tiles.length} tile(s): ${stats.scanned} scanned · ` +
          `${stats.region} terrain · ${stats.spans} multi-cell · ` +
          `${this.totalAppliedTagCount()} tag(s) applied · ` +
          `${autoCats} categor${autoCats === 1 ? 'y' : 'ies'} auto-sorted.`,
      });
      new Notice(`Windrose: "${folder}" imported (${this.tiles.length} tiles).`);

      this.finished = true;
      finishBtn.setText('Done');
      finishBtn.disabled = false;
      finishBtn.onclick = (): void => this.close();
    } catch (err: unknown) {
      console.error('[Windrose] Add tiles import failed:', err);
      progress.empty();
      progress.createEl('p', {
        cls: 'windrose-wz-error',
        text: 'Import failed: ' + (err as Error).message,
      });
      finishBtn.setText('Finish import');
      finishBtn.disabled = false;
    }
  }
}

/**
 * Exact vs Compact lineup: per texture, rows Exact / Compact, columns 100 /
 * 200 / 400 %, each a centre crop drawn with bilinear smoothing over a
 * checkerboard (the way the dev lineup compared candidates).
 */
class CompactPreviewModal extends Modal {
  private readonly bitmaps: ImageBitmap[] = [];
  private closed = false;

  constructor(app: App, private readonly source: PckSource, private readonly entries: PckFileEntry[]) {
    super(app);
  }

  override onOpen(): void {
    this.modalEl.addClass('windrose-add-tiles-modal');
    this.contentEl.createEl('h2', { text: 'Compact preview' });
    if (this.entries.length === 0) {
      this.contentEl.createEl('p', { text: 'This pack has no images large enough to re-encode.' });
      return;
    }
    const status = this.contentEl.createEl('p', { cls: 'windrose-wz-cap', text: 'Encoding…' });
    void this.renderAll().then(() => status.remove(), (e: unknown) => {
      status.setText('Preview failed: ' + (e instanceof Error ? e.message : String(e)));
    });
  }

  override onClose(): void {
    this.closed = true;
    for (const b of this.bitmaps) b.close();
    this.bitmaps.length = 0;
    this.contentEl.empty();
  }

  private async bitmap(bytes: Uint8Array, mime: string): Promise<ImageBitmap> {
    const bmp = await createImageBitmap(new Blob([bytes.slice()], { type: mime }));
    if (this.closed) bmp.close(); else this.bitmaps.push(bmp);
    return bmp;
  }

  private async renderAll(): Promise<void> {
    for (const entry of this.entries) {
      if (this.closed) return;
      const bytes = await extractFileData(this.source, entry);
      const mime = sniffImageMime(bytes) ?? 'image/png';
      const enc = await compactEncode(bytes, mime, { quality: COMPACT_QUALITY, floorBytes: COMPACT_FLOOR_BYTES });
      const exactBmp = await this.bitmap(bytes, mime);
      const compactBmp = enc.kind === 'compact' ? await this.bitmap(enc.bytes, enc.mime) : exactBmp;
      if (this.closed) return;
      const block = this.contentEl.createDiv({ cls: 'windrose-wz-lineup' });
      const name = entry.path.split('/').pop() ?? entry.path;
      block.createDiv({
        cls: 'windrose-wz-lineup-title',
        text: enc.kind === 'compact'
          ? `${name}: ${formatMb(bytes.byteLength)} → ${formatMb(enc.bytes.byteLength)}`
          : `${name}: ${formatMb(bytes.byteLength)}, kept exact (${enc.reason ?? 'no gain'})`,
      });
      const grid = block.createDiv({ cls: 'windrose-wz-lineup-grid' });
      grid.createDiv();
      for (const z of PREVIEW_ZOOMS) grid.createDiv({ cls: 'windrose-wz-cap', text: `${z * 100} %` });
      const rows: Array<[string, ImageBitmap]> = [['Exact', exactBmp], ['Compact', compactBmp]];
      for (const [label, bmp] of rows) {
        grid.createDiv({ cls: 'windrose-wz-cap', text: label });
        for (const z of PREVIEW_ZOOMS) drawLineupCell(grid.createEl('canvas'), bmp, z);
      }
    }
  }
}

/** Checkerboard, then the bitmap's centre crop at `zoom`, bilinear. */
function drawLineupCell(canvas: HTMLCanvasElement, bmp: ImageBitmap, zoom: number): void {
  canvas.width = PREVIEW_CELL_PX;
  canvas.height = PREVIEW_CELL_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const sq = 10;
  for (let y = 0; y < PREVIEW_CELL_PX; y += sq) {
    for (let x = 0; x < PREVIEW_CELL_PX; x += sq) {
      ctx.fillStyle = ((x + y) / sq) % 2 === 0 ? '#cccccc' : '#ffffff';
      ctx.fillRect(x, y, sq, sq);
    }
  }
  const side = PREVIEW_CELL_PX / zoom;
  const sw = Math.min(side, bmp.width);
  const sh = Math.min(side, bmp.height);
  const sx = (bmp.width - sw) / 2;
  const sy = (bmp.height - sh) / 2;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'low';
  ctx.drawImage(bmp, sx, sy, sw, sh, (PREVIEW_CELL_PX - sw * zoom) / 2, (PREVIEW_CELL_PX - sh * zoom) / 2, sw * zoom, sh * zoom);
}

export { AddTilesModal };

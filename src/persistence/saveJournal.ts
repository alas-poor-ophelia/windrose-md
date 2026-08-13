/**
 * saveJournal.ts
 *
 * Synchronous crash journal for pending map edits.
 *
 * The data file is written asynchronously through `vault.modify`, which chunks
 * large writes. If the JS event loop dies mid-write (app quit, iOS suspend,
 * process kill) the file is left truncated and the pending edits are gone. A
 * journal entry is written SYNCHRONOUSLY — via Obsidian's `saveLocalStorage`,
 * which lands before the frame ends and cannot be interrupted — immediately
 * before every async save that runs at a dangerous moment. If the save landed,
 * the entry is cleared; if it didn't, the next load offers to restore it.
 *
 * Never uses raw `localStorage` (Obsidian namespaces per vault) and never
 * throws into its callers: a failed journal must not break a save.
 */

import type { MapData } from '#types/core/map.types';
import type { App } from 'obsidian';
import { Modal } from 'obsidian';

import { canonicalizeTileIds, isMapTombstoned, readRawMapEntry } from './fileOperations';

const JOURNAL_KEY_PREFIX = 'windrose-journal:';
const JOURNAL_INDEX_KEY = 'windrose-journal-index';
const JOURNAL_VERSION = 1;

/**
 * Entries larger than this are skipped: localStorage quota is a few MB per
 * origin and a failed quota write would evict OTHER maps' journals.
 */
const MAX_JOURNAL_PAYLOAD = 2_000_000;

/** Entries older than a week are assumed abandoned. */
const JOURNAL_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface JournalEntry {
  v: number;
  mapId: string;
  savedAt: number;
  /** JSON.stringify of the pending MapData, post-canonicalization. */
  payload: string;
}

/** What the user chose in the restore prompt. */
type JournalChoice = 'restore' | 'discard' | 'keep';

function journalKey(mapId: string): string {
  return JOURNAL_KEY_PREFIX + mapId;
}

function readIndex(app: App): string[] {
  try {
    const raw = app.loadLocalStorage(JOURNAL_INDEX_KEY) as string | null;
    if (raw == null || raw === '') return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function writeIndex(app: App, ids: string[]): void {
  app.saveLocalStorage(JOURNAL_INDEX_KEY, JSON.stringify(ids));
}

/**
 * Journal `pendingData` for `mapId`. Synchronous by construction — call it
 * BEFORE firing the async save it protects.
 */
function journalPending(app: App, mapId: string, pendingData: MapData): void {
  try {
    // Match what saveMapData would write, so the on-disk comparison at load
    // time is a plain string equality.
    canonicalizeTileIds(pendingData);
    const payload = JSON.stringify(pendingData);

    if (payload.length > MAX_JOURNAL_PAYLOAD) {
      console.debug('[Windrose] Save journal skipped, payload too large:', payload.length);
      return;
    }

    const entry: JournalEntry = { v: JOURNAL_VERSION, mapId, savedAt: Date.now(), payload };
    const serialized = JSON.stringify(entry);

    try {
      app.saveLocalStorage(journalKey(mapId), serialized);
    } catch {
      // Quota: drop this map's own entry (the biggest thing we're allowed to
      // evict) and try exactly once more.
      try {
        clearJournal(app, mapId);
        app.saveLocalStorage(journalKey(mapId), serialized);
      } catch {
        console.debug('[Windrose] Save journal write failed, giving up for map:', mapId);
        return;
      }
    }

    const index = readIndex(app);
    if (!index.includes(mapId)) {
      try {
        writeIndex(app, [...index, mapId]);
      } catch {
        /* index is a convenience for pruning; a lost update is harmless */
      }
    }
  } catch (e) {
    console.debug('[Windrose] Save journal skipped:', e);
  }
}

/** Drop the journal entry for `mapId` (called after any successful save). */
function clearJournal(app: App, mapId: string): void {
  try {
    app.saveLocalStorage(journalKey(mapId), null);
    const index = readIndex(app);
    if (index.includes(mapId)) {
      writeIndex(app, index.filter(id => id !== mapId));
    }
  } catch (e) {
    console.debug('[Windrose] Save journal clear failed:', e);
  }
}

/** The journal entry for `mapId`, or null when absent/unusable. */
function readJournal(app: App, mapId: string): JournalEntry | null {
  try {
    const raw = app.loadLocalStorage(journalKey(mapId)) as string | null;
    if (raw == null || raw === '') return null;
    const parsed = JSON.parse(raw) as Partial<JournalEntry>;
    if (parsed?.v !== JOURNAL_VERSION) return null;
    if (typeof parsed.payload !== 'string' || parsed.payload === '') return null;
    return {
      v: JOURNAL_VERSION,
      mapId,
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
      payload: parsed.payload,
    };
  } catch {
    return null;
  }
}

/**
 * Drop stale journal entries: older than a week, or (when `liveMapIds` is
 * supplied) belonging to a map that no longer exists.
 */
function pruneJournal(app: App, options?: { liveMapIds?: string[] }): void {
  try {
    const live = options?.liveMapIds != null ? new Set(options.liveMapIds) : null;
    const index = readIndex(app);
    const now = Date.now();
    const kept: string[] = [];

    for (const mapId of index) {
      const entry = readJournal(app, mapId);
      const stale = entry == null
        || now - entry.savedAt > JOURNAL_MAX_AGE_MS
        || (live != null && !live.has(mapId));
      if (stale) {
        app.saveLocalStorage(journalKey(mapId), null);
      } else {
        kept.push(mapId);
      }
    }

    if (kept.length !== index.length) writeIndex(app, kept);
  } catch (e) {
    console.debug('[Windrose] Save journal prune failed:', e);
  }
}

/**
 * Whether a journal entry still represents unsaved work.
 * 'clean' — the protected save landed, the entry can be dropped silently.
 * 'divergent' — disk disagrees (or has nothing); the user must be asked.
 */
function compareJournalToDisk(payload: string, onDiskRaw: string | null): 'clean' | 'divergent' {
  return onDiskRaw != null && onDiskRaw === payload ? 'clean' : 'divergent';
}

function formatRelativeTime(timestamp: number): string {
  const delta = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return 'less than a minute ago';
  if (minutes < 60) return minutes === 1 ? 'a minute ago' : String(minutes) + ' minutes ago';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? 'an hour ago' : String(hours) + ' hours ago';
  const days = Math.floor(hours / 24);
  return days === 1 ? 'a day ago' : String(days) + ' days ago';
}

/**
 * Native Obsidian modal offering the three journal outcomes. Replay is NEVER
 * silent: a restore overwrites whatever is on disk, so the user decides.
 */
class JournalRestoreModal extends Modal {
  private savedAt: number;
  private mapLabel: string;
  private resolved = false;
  private resolvePromise!: (choice: JournalChoice) => void;

  constructor(app: App, savedAt: number, mapLabel: string) {
    super(app);
    this.savedAt = savedAt;
    this.mapLabel = mapLabel;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.titleEl.setText('Unsaved changes found');

    contentEl.createEl('p', {
      text: 'Unsaved changes from ' + formatRelativeTime(this.savedAt) + ' were found for this map. Restore them?',
    });
    if (this.mapLabel !== '') {
      contentEl.createEl('p', { cls: 'mod-muted', text: this.mapLabel });
    }

    const buttons = contentEl.createDiv({ cls: 'windrose-modal-buttons' });

    const keepBtn = buttons.createEl('button', { text: 'Keep for later' });
    keepBtn.onclick = () => this.finish('keep');

    const discardBtn = buttons.createEl('button', { text: 'Discard', cls: 'mod-warning' });
    discardBtn.onclick = () => this.finish('discard');

    const restoreBtn = buttons.createEl('button', { text: 'Restore', cls: 'mod-cta' });
    restoreBtn.onclick = () => this.finish('restore');
  }

  private finish(choice: JournalChoice): void {
    this.resolved = true;
    this.resolvePromise(choice);
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
    // Dismissing the modal is the conservative option: nothing is lost.
    if (!this.resolved && this.resolvePromise != null) this.resolvePromise('keep');
  }

  openAndGetChoice(): Promise<JournalChoice> {
    return new Promise<JournalChoice>((resolve) => {
      this.resolvePromise = resolve;
      this.open();
    });
  }
}

/**
 * Load-time journal replay. Returns the recovered MapData when the user chose
 * to restore, otherwise null (nothing to do).
 *
 * Order matters: tombstone check first (never resurrect a deleted map), then
 * the on-disk comparison (a landed save clears silently), and only then the
 * prompt.
 */
async function resolveJournalOnLoad(app: App, mapId: string, mapLabel = ''): Promise<MapData | null> {
  const entry = readJournal(app, mapId);
  if (entry == null) return null;

  if (isMapTombstoned(mapId)) {
    clearJournal(app, mapId);
    return null;
  }

  const onDiskRaw = await readRawMapEntry(app, mapId);
  if (compareJournalToDisk(entry.payload, onDiskRaw) === 'clean') {
    clearJournal(app, mapId);
    return null;
  }

  const choice = await new JournalRestoreModal(app, entry.savedAt, mapLabel).openAndGetChoice();
  if (choice === 'keep') return null;

  if (choice === 'discard') {
    clearJournal(app, mapId);
    return null;
  }

  try {
    // Deliberately NOT cleared here. The restored data still only exists in
    // memory; the debounced save that follows clears the entry once it lands.
    // Clearing now would lose the edits a second time if the app died (or the
    // view unmounted) between this prompt and that save.
    return JSON.parse(entry.payload) as MapData;
  } catch (e) {
    console.error('[Windrose] Journal payload could not be parsed, discarding:', e);
    clearJournal(app, mapId);
    return null;
  }
}

export {
  journalPending,
  clearJournal,
  readJournal,
  pruneJournal,
  compareJournalToDisk,
  resolveJournalOnLoad,
  formatRelativeTime,
  MAX_JOURNAL_PAYLOAD,
  JOURNAL_MAX_AGE_MS,
  JOURNAL_INDEX_KEY,
  JOURNAL_KEY_PREFIX,
};
export type { JournalEntry, JournalChoice };

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
 * Three slots per map, so no one of them can disable another:
 *  - live (`windrose-journal:<id>`): the newest unconfirmed edits. Written by
 *    every journaling path, cleared by every landed save.
 *  - kept (`windrose-journal-kept:<id>`): entries the user deferred with "Keep
 *    for later". Routine saves never touch them; never aged out.
 *  - conflict (`windrose-journal-conflict:<id>`): edits refused as stale when
 *    their pane closed. Offered on the next load as a non-default choice.
 *
 * Never uses raw `localStorage` (Obsidian namespaces per vault) and never
 * throws into its callers: a failed journal must not break a save.
 */

import type { MapData } from '#types/core/map.types';
import type { App } from 'obsidian';
import { Modal } from 'obsidian';

import { canonicalizeTileIds, isMapTombstoned, readRawMapEntry } from './fileOperations';
import { isNewerSchema, migrateMapData } from './schemaMigration';

const JOURNAL_KEY_PREFIX = 'windrose-journal:';
const JOURNAL_INDEX_KEY = 'windrose-journal-index';
/** "Keep for later" entries (an array per map; see KEPT_MAX_PER_MAP). */
const KEPT_KEY_PREFIX = 'windrose-journal-kept:';
const KEPT_INDEX_KEY = 'windrose-journal-kept-index';
/** Entries set aside after a stale refusal at unmount (see moveJournalToConflict). */
const CONFLICT_KEY_PREFIX = 'windrose-journal-conflict:';
const CONFLICT_INDEX_KEY = 'windrose-journal-conflict-index';
const JOURNAL_VERSION = 1;

/**
 * Bound on deferred entries per map. Each "keep" of a NEW divergent entry adds
 * one; past the bound the oldest is dropped (with a console warning) so
 * localStorage cannot grow without limit.
 */
const KEPT_MAX_PER_MAP = 5;

/**
 * Entries larger than this are skipped: localStorage quota is a few MB per
 * origin and a failed quota write would evict OTHER maps' journals.
 */
const MAX_JOURNAL_PAYLOAD = 2_000_000;

/** Live entries older than a week are assumed abandoned (kept/conflict are not aged out). */
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

/** Which slot a load-time candidate came from. */
type JournalSource = 'live' | 'kept' | 'conflict';

function journalKey(mapId: string): string {
  return JOURNAL_KEY_PREFIX + mapId;
}

function readIdList(app: App, key: string): string[] {
  try {
    const raw = app.loadLocalStorage(key) as string | null;
    if (raw == null || raw === '') return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function addToIdList(app: App, key: string, mapId: string): void {
  const ids = readIdList(app, key);
  if (!ids.includes(mapId)) app.saveLocalStorage(key, JSON.stringify([...ids, mapId]));
}

function removeFromIdList(app: App, key: string, mapId: string): void {
  const ids = readIdList(app, key);
  if (ids.includes(mapId)) app.saveLocalStorage(key, JSON.stringify(ids.filter(id => id !== mapId)));
}

function readIndex(app: App): string[] {
  return readIdList(app, JOURNAL_INDEX_KEY);
}

function writeIndex(app: App, ids: string[]): void {
  app.saveLocalStorage(JOURNAL_INDEX_KEY, JSON.stringify(ids));
}

/** Parse one stored entry; null when absent or unusable. */
function parseEntry(raw: unknown, mapId: string): JournalEntry | null {
  if (raw == null || typeof raw !== 'object') return null;
  const parsed = raw as Partial<JournalEntry>;
  if (parsed.v !== JOURNAL_VERSION) return null;
  if (typeof parsed.payload !== 'string' || parsed.payload === '') return null;
  return {
    v: JOURNAL_VERSION,
    mapId,
    savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
    payload: parsed.payload,
  };
}

function readSlot(app: App, key: string, mapId: string): JournalEntry | null {
  try {
    const raw = app.loadLocalStorage(key) as string | null;
    if (raw == null || raw === '') return null;
    return parseEntry(JSON.parse(raw) as unknown, mapId);
  } catch {
    return null;
  }
}

/**
 * Journal `pendingData` for `mapId` into the LIVE slot. Synchronous by
 * construction — call it BEFORE firing the async save it protects.
 *
 * Returns true only when the entry was actually written. False means nothing
 * protects these edits (payload over MAX_JOURNAL_PAYLOAD, quota, or a
 * serialization error); callers must not report a recovery copy.
 */
function journalPending(app: App, mapId: string, pendingData: MapData): boolean {
  try {
    // Match what saveMapData would write, so the on-disk comparison at load
    // time is a plain string equality. Canonicalizes a copy; the live tree is
    // never edited.
    const payload = JSON.stringify(canonicalizeTileIds(pendingData));

    if (payload.length > MAX_JOURNAL_PAYLOAD) {
      console.debug('[Windrose] Save journal skipped, payload too large:', payload.length);
      return false;
    }

    const entry: JournalEntry = { v: JOURNAL_VERSION, mapId, savedAt: Date.now(), payload };
    const serialized = JSON.stringify(entry);

    try {
      app.saveLocalStorage(journalKey(mapId), serialized);
    } catch {
      // Quota: drop this map's own live entry (the biggest thing we're
      // allowed to evict; never a kept or conflict entry) and try once more.
      try {
        removeJournalEntry(app, mapId);
        app.saveLocalStorage(journalKey(mapId), serialized);
      } catch {
        console.debug('[Windrose] Save journal write failed, giving up for map:', mapId);
        return false;
      }
    }

    try {
      addToIdList(app, JOURNAL_INDEX_KEY, mapId);
    } catch {
      /* index is a convenience for pruning; a lost update is harmless */
    }
    return true;
  } catch (e) {
    console.debug('[Windrose] Save journal skipped:', e);
    return false;
  }
}

/**
 * Drop the LIVE journal entry for `mapId` (called after any landed save).
 * Kept and conflict entries are untouched unless `includeKept` is set: only an
 * explicit decision (the map being deleted) may pass it, and it then clears
 * every slot for the map.
 */
function clearJournal(app: App, mapId: string, options?: { includeKept?: boolean }): void {
  removeJournalEntry(app, mapId);
  if (options?.includeKept === true) {
    removeKeptEntries(app, mapId);
    removeConflictEntry(app, mapId);
  }
}

/** Whether `mapId` holds at least one "keep for later" entry. */
function isJournalKept(app: App, mapId: string): boolean {
  return readKeptEntries(app, mapId).length > 0;
}

function removeJournalEntry(app: App, mapId: string): void {
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

/** The LIVE journal entry for `mapId`, or null when absent/unusable. */
function readJournal(app: App, mapId: string): JournalEntry | null {
  return readSlot(app, journalKey(mapId), mapId);
}

// -------------------------------------------
// Kept ("Keep for later") slot
// -------------------------------------------

/** Deferred entries for `mapId`, oldest first. */
function readKeptEntries(app: App, mapId: string): JournalEntry[] {
  try {
    const raw = app.loadLocalStorage(KEPT_KEY_PREFIX + mapId) as string | null;
    if (raw == null || raw === '') return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(e => parseEntry(e, mapId)).filter((e): e is JournalEntry => e != null);
  } catch {
    return [];
  }
}

/** Throws on quota so the caller can leave the entry where it was. */
function writeKeptEntries(app: App, mapId: string, entries: JournalEntry[]): void {
  if (entries.length === 0) {
    removeKeptEntries(app, mapId);
    return;
  }
  app.saveLocalStorage(KEPT_KEY_PREFIX + mapId, JSON.stringify(entries));
  addToIdList(app, KEPT_INDEX_KEY, mapId);
}

function removeKeptEntries(app: App, mapId: string): void {
  try {
    app.saveLocalStorage(KEPT_KEY_PREFIX + mapId, null);
    removeFromIdList(app, KEPT_INDEX_KEY, mapId);
  } catch (e) {
    console.debug('[Windrose] Kept journal clear failed:', e);
  }
}

/** Append `entry` to the kept slot (bounded). Returns false when it could not be stored. */
function addKeptEntry(app: App, mapId: string, entry: JournalEntry): boolean {
  try {
    const entries = [...readKeptEntries(app, mapId), entry];
    while (entries.length > KEPT_MAX_PER_MAP) {
      const dropped = entries.shift();
      console.warn('[Windrose] Too many kept journal entries for map, dropping the oldest:', mapId, dropped?.savedAt);
    }
    writeKeptEntries(app, mapId, entries);
    return true;
  } catch (e) {
    console.warn('[Windrose] Could not store a kept journal entry:', e);
    return false;
  }
}

// -------------------------------------------
// Conflict slot (DATA-13)
// -------------------------------------------

/** Outcome of moveJournalToConflict. */
type ConflictMoveResult = 'moved' | 'nothing' | 'failed';

/**
 * Set the LIVE journal entry for `mapId` aside under the conflict key instead
 * of deleting it. Used when the unmount flush is refused as stale: the edits
 * are based on an outdated tree, so replaying them as a normal journal entry
 * would clobber another pane's work, but silently deleting them loses real
 * edits. One conflict slot per map (a newer conflict replaces an older one).
 *
 * 'failed' (quota): the live entry is REMOVED anyway — leaving it would make
 * the next load offer it as ordinary unsaved changes, a default-button
 * clobber of the other pane's work. The caller must say nothing was kept.
 */
function moveJournalToConflict(app: App, mapId: string): ConflictMoveResult {
  let raw: string | null;
  try {
    raw = app.loadLocalStorage(journalKey(mapId)) as string | null;
  } catch {
    return 'failed';
  }
  if (raw == null || raw === '') return 'nothing';
  try {
    app.saveLocalStorage(CONFLICT_KEY_PREFIX + mapId, raw);
    addToIdList(app, CONFLICT_INDEX_KEY, mapId);
    removeJournalEntry(app, mapId);
    return 'moved';
  } catch (e) {
    console.warn('[Windrose] Moving journal entry to conflict key failed, dropping it:', e);
    removeJournalEntry(app, mapId);
    return 'failed';
  }
}

/** The conflict entry set aside for `mapId`, or null. */
function readConflictJournal(app: App, mapId: string): JournalEntry | null {
  return readSlot(app, CONFLICT_KEY_PREFIX + mapId, mapId);
}

function removeConflictEntry(app: App, mapId: string): void {
  try {
    app.saveLocalStorage(CONFLICT_KEY_PREFIX + mapId, null);
    removeFromIdList(app, CONFLICT_INDEX_KEY, mapId);
  } catch (e) {
    console.debug('[Windrose] Conflict journal clear failed:', e);
  }
}

// -------------------------------------------
// Pruning
// -------------------------------------------

/**
 * Drop stale journal entries.
 *
 * Live entries: older than a week, or (when `liveMapIds` is supplied) for a
 * map that no longer exists. Kept and conflict entries are NEVER aged out —
 * they are offered at every load until the user decides — and are dropped
 * only when `liveMapIds` proves the map is gone.
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

    if (live == null) return;
    for (const mapId of readIdList(app, KEPT_INDEX_KEY)) {
      if (!live.has(mapId)) removeKeptEntries(app, mapId);
    }
    for (const mapId of readIdList(app, CONFLICT_INDEX_KEY)) {
      if (!live.has(mapId)) removeConflictEntry(app, mapId);
    }
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
 *
 * For a conflict entry (edits from a pane that closed after another pane
 * saved), restoring overwrites that other pane's work, so "Keep for later" is
 * the highlighted choice and restore is labelled as an override.
 */
class JournalRestoreModal extends Modal {
  private savedAt: number;
  private mapLabel: string;
  private source: JournalSource;
  private resolved = false;
  private resolvePromise!: (choice: JournalChoice) => void;

  constructor(app: App, savedAt: number, mapLabel: string, source: JournalSource) {
    super(app);
    this.savedAt = savedAt;
    this.mapLabel = mapLabel;
    this.source = source;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    const conflict = this.source === 'conflict';
    this.titleEl.setText(conflict ? 'Conflicting edits from a closed pane' : 'Unsaved changes found');

    contentEl.createEl('p', {
      text: conflict
        ? 'Edits from ' + formatRelativeTime(this.savedAt) + ' could not be saved because this map was changed in another pane. ' +
          'Restoring them replaces the current map with that older copy plus those edits.'
        : 'Unsaved changes from ' + formatRelativeTime(this.savedAt) + ' were found for this map. Restore them?',
    });
    if (this.mapLabel !== '') {
      contentEl.createEl('p', { cls: 'mod-muted', text: this.mapLabel });
    }

    const buttons = contentEl.createDiv({ cls: 'windrose-modal-buttons' });

    const keepBtn = buttons.createEl('button', { text: 'Keep for later', cls: conflict ? 'mod-cta' : undefined });
    keepBtn.onclick = () => this.finish('keep');

    const discardBtn = buttons.createEl('button', { text: 'Discard', cls: 'mod-warning' });
    discardBtn.onclick = () => this.finish('discard');

    const restoreBtn = buttons.createEl('button', {
      text: conflict ? 'Restore anyway' : 'Restore',
      cls: conflict ? undefined : 'mod-cta',
    });
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

interface JournalCandidate {
  source: JournalSource;
  entry: JournalEntry;
}

/** Remove one candidate from its slot. */
function dropCandidate(app: App, mapId: string, c: JournalCandidate): void {
  if (c.source === 'live') removeJournalEntry(app, mapId);
  else if (c.source === 'conflict') removeConflictEntry(app, mapId);
  else {
    try {
      writeKeptEntries(app, mapId, readKeptEntries(app, mapId).filter(e => e.savedAt !== c.entry.savedAt || e.payload !== c.entry.payload));
    } catch (e) {
      console.debug('[Windrose] Kept journal update failed:', e);
    }
  }
}

/**
 * "Keep for later" for one candidate. A live entry moves to the kept slot so
 * live journaling stays free for new edits; kept/conflict entries stay put.
 */
function keepCandidate(app: App, mapId: string, c: JournalCandidate): void {
  if (c.source !== 'live') return;
  // If the kept slot cannot take it, the entry stays live (it is offered
  // again next load, but new journaling may replace it).
  if (addKeptEntry(app, mapId, c.entry)) removeJournalEntry(app, mapId);
}

/**
 * Parse + migrate a payload for restore. Null when it must not be restored by
 * this build (parse failure: dropped; newer schema or migration failure:
 * left in place so it is offered again).
 */
function preparePayload(app: App, mapId: string, c: JournalCandidate): MapData | null {
  let parsed: MapData;
  try {
    parsed = JSON.parse(c.entry.payload) as MapData;
  } catch (e) {
    console.error('[Windrose] Journal payload could not be parsed, discarding:', e);
    dropCandidate(app, mapId, c);
    return null;
  }

  if (isNewerSchema(parsed)) {
    console.warn('[Windrose] Journal payload uses a newer map schema, keeping it for later.');
    keepCandidate(app, mapId, c);
    return null;
  }

  try {
    // DATA-20: the restored tree replaces the loaded one wholesale, so it
    // must get the same per-map migration/sanitizing the loader applies
    // (legacy fields, missing arrays, sub-hex maps at any depth).
    return migrateMapData(parsed);
  } catch (e) {
    // Parses but cannot be migrated: do not hand a half-shaped tree to the
    // editor, and do not throw the edits away either.
    console.error('[Windrose] Journal payload could not be migrated, keeping it for later:', e);
    keepCandidate(app, mapId, c);
    return null;
  }
}

/**
 * Load-time journal replay. Returns the recovered MapData when the user chose
 * to restore, otherwise null (nothing to do).
 *
 * Order matters: tombstone check first (never resurrect a deleted map), then
 * each candidate — live, then kept (newest first), then the conflict copy —
 * is compared with disk (a landed save clears silently) and only then
 * prompted. A "keep" ends the round (no nagging through the rest).
 */
async function resolveJournalOnLoad(
  app: App,
  mapId: string,
  mapLabel = '',
  /** Test seam: replaces the modal prompt. */
  prompt?: (savedAt: number, mapLabel: string, source: JournalSource) => Promise<JournalChoice>
): Promise<MapData | null> {
  const candidates: JournalCandidate[] = [];
  const liveEntry = readJournal(app, mapId);
  if (liveEntry != null) candidates.push({ source: 'live', entry: liveEntry });
  for (const entry of [...readKeptEntries(app, mapId)].reverse()) candidates.push({ source: 'kept', entry });
  const conflictEntry = readConflictJournal(app, mapId);
  if (conflictEntry != null) candidates.push({ source: 'conflict', entry: conflictEntry });
  if (candidates.length === 0) return null;

  if (isMapTombstoned(mapId)) {
    clearJournal(app, mapId, { includeKept: true });
    return null;
  }

  const onDiskRaw = await readRawMapEntry(app, mapId);

  for (const c of candidates) {
    if (compareJournalToDisk(c.entry.payload, onDiskRaw) === 'clean') {
      dropCandidate(app, mapId, c);
      continue;
    }

    const choice = prompt != null
      ? await prompt(c.entry.savedAt, mapLabel, c.source)
      : await new JournalRestoreModal(app, c.entry.savedAt, mapLabel, c.source).openAndGetChoice();

    if (choice === 'keep') {
      keepCandidate(app, mapId, c);
      return null;
    }
    if (choice === 'discard') {
      dropCandidate(app, mapId, c);
      continue;
    }

    const restored = preparePayload(app, mapId, c);
    if (restored == null) return null;

    // Deliberately NOT cleared. The restored data still only exists in
    // memory; the debounced save that follows clears the LIVE entry once it
    // lands. A kept/conflict entry is moved into the live slot for exactly
    // that, so the app dying before the save still leaves a copy.
    if (c.source !== 'live') {
      try {
        app.saveLocalStorage(journalKey(mapId), JSON.stringify(c.entry));
        addToIdList(app, JOURNAL_INDEX_KEY, mapId);
        dropCandidate(app, mapId, c);
      } catch (e) {
        // Leave it in its slot; the landing save will not clear it, so it is
        // offered once more (and compares clean if the save landed).
        console.debug('[Windrose] Could not move the restored entry to the live slot:', e);
      }
    }
    return restored;
  }
  return null;
}

export {
  journalPending,
  clearJournal,
  isJournalKept,
  readKeptEntries,
  moveJournalToConflict,
  readConflictJournal,
  readJournal,
  pruneJournal,
  compareJournalToDisk,
  resolveJournalOnLoad,
  formatRelativeTime,
  MAX_JOURNAL_PAYLOAD,
  JOURNAL_MAX_AGE_MS,
  JOURNAL_INDEX_KEY,
  JOURNAL_KEY_PREFIX,
  KEPT_KEY_PREFIX,
  KEPT_MAX_PER_MAP,
  CONFLICT_KEY_PREFIX,
};
export type { JournalEntry, JournalChoice, JournalSource, ConflictMoveResult };

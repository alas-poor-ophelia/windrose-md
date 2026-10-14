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
 * Three kinds of slot per map, so no one of them can disable another:
 *  - live: the newest unconfirmed edits, ONE SLOT PER WRITER (mounted
 *    instance), so pane A's landed save can never erase pane B's crash copy.
 *    Written before every save (useDebouncedSave) and by every shutdown
 *    path; cleared by that writer's own landed save, and only when the
 *    landed version is at least the journaled one. The payload is stored
 *    unwrapped under `windrose-journal:<slot>` (one escaping level, MEM-22)
 *    with a small metadata record under `windrose-journal-meta:<slot>`;
 *    payloads over RAW_PAYLOAD_LIMIT are deflated (DATA-05). The writerless
 *    slot `<mapId>` holds restored entries until the next landed save.
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
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';
import { Modal, Notice } from 'obsidian';

import { canonicalizeTileIds, isMapTombstoned, readRawMapEntry } from './fileOperations';
import { isNewerSchema, migrateMapData } from './schemaMigration';

const JOURNAL_KEY_PREFIX = 'windrose-journal:';
/** Metadata for a live slot (LiveMeta). Absent for a legacy v1 entry. */
const JOURNAL_META_PREFIX = 'windrose-journal-meta:';
/** Live index: slot ids (`<mapId>` or `<mapId>@@<writerId>`). */
const JOURNAL_INDEX_KEY = 'windrose-journal-index';
const WRITER_SEPARATOR = '@@';
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
 * Live payloads up to this many characters are stored as plain JSON; larger
 * ones are deflated (level 1: this runs synchronously on the UI thread before
 * every save, so speed beats ratio). Kept low so a plain slot never costs more
 * than ~300 KB of the shared UTF-16 localStorage quota (wave-5 finding 11).
 */
const RAW_PAYLOAD_LIMIT = 150_000;

/**
 * Stored (possibly compressed) live payloads larger than this are refused.
 * localStorage holds UTF-16 (~2 bytes/char) in a ~5 MB origin quota shared
 * with Obsidian (iOS). A refusal is surfaced once per map per session.
 */
const MAX_JOURNAL_PAYLOAD = 1_500_000;

/**
 * v3: the metadata is ALSO embedded as a header line in the payload string, so
 * one localStorage write carries a self-consistent pair (wave-5 finding 6: a
 * quota failure between two writes tore the pair and both copies read as
 * null). The separate meta key is a cache for cheap reads; v2 slots (meta key
 * only, length-checked) still read.
 */
const LIVE_META_VERSION = 3;
const PAYLOAD_HEADER = 'WJ3:';

type PayloadEncoding = 'json' | 'deflate64';

/** Metadata of a live slot, stored separately so reading it never touches the payload. */
interface LiveMeta {
  v: number;
  mapId: string;
  writerId: string | null;
  savedAt: number;
  /** The writer's save version (useDebouncedSave saveVersionRef); null when unknown. */
  version: number | null;
  enc: PayloadEncoding;
  /** Stored payload length, to detect a payload/meta pair torn by a quota failure. */
  len: number;
  /**
   * Writerless slot only: when a load-time restore wrote it. A landed save
   * clears it only if that writer journaled after this moment (wave-5
   * finding 5: a sibling pane's older tree must not erase a restored copy).
   */
  restoredAt?: number | null;
}

/** Live entries older than a week are assumed abandoned (kept/conflict are not aged out). */
const JOURNAL_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface JournalEntry {
  v: number;
  mapId: string;
  savedAt: number;
  /** JSON.stringify of the pending MapData, post-canonicalization (always decoded). */
  payload: string;
}

/** A live entry plus where it lives. */
interface LiveEntry extends JournalEntry {
  slot: string;
  writerId: string | null;
  version: number | null;
}

/** What the user chose in the restore prompt. */
type JournalChoice = 'restore' | 'discard' | 'keep';

/** Which slot a load-time candidate came from. */
type JournalSource = 'live' | 'kept' | 'conflict';

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

function slotId(mapId: string, writerId?: string | null): string {
  return writerId != null && writerId !== '' ? mapId + WRITER_SEPARATOR + writerId : mapId;
}

function mapIdOfSlot(slot: string): string {
  const at = slot.indexOf(WRITER_SEPARATOR);
  return at < 0 ? slot : slot.slice(0, at);
}

/** Live slots of `mapId` named in the index (plus the writerless slot). */
function liveSlotsFor(app: App, mapId: string): string[] {
  const slots = readIndex(app).filter(s => mapIdOfSlot(s) === mapId);
  return slots.includes(mapId) ? slots : [...slots, mapId];
}

function encodePayload(json: string): { enc: PayloadEncoding; data: string } {
  if (json.length <= RAW_PAYLOAD_LIMIT) return { enc: 'json', data: json };
  // Base64 never needs JSON escaping; map JSON deflates roughly tenfold.
  return { enc: 'deflate64', data: btoa(strFromU8(deflateSync(strToU8(json), { level: 1 }), true)) };
}

function decodePayload(enc: PayloadEncoding, data: string): string {
  return enc === 'deflate64' ? strFromU8(inflateSync(strToU8(atob(data), true))) : data;
}

function normalizeMeta(raw: string, slot: string): LiveMeta | null {
  const meta = JSON.parse(raw) as Partial<LiveMeta>;
  if ((meta.v !== 2 && meta.v !== LIVE_META_VERSION) || typeof meta.len !== 'number') return null;
  return {
    v: meta.v,
    mapId: typeof meta.mapId === 'string' ? meta.mapId : mapIdOfSlot(slot),
    writerId: typeof meta.writerId === 'string' ? meta.writerId : null,
    savedAt: typeof meta.savedAt === 'number' ? meta.savedAt : 0,
    version: typeof meta.version === 'number' ? meta.version : null,
    enc: meta.enc === 'deflate64' ? 'deflate64' : 'json',
    len: meta.len,
    restoredAt: typeof meta.restoredAt === 'number' ? meta.restoredAt : null,
  };
}

/** Split a v3 framed payload into its header metadata and data; null when not framed. */
function unframePayload(stored: string, slot: string): { meta: LiveMeta; data: string } | null {
  if (!stored.startsWith(PAYLOAD_HEADER)) return null;
  const nl = stored.indexOf('\n');
  if (nl < 0) return null;
  const meta = normalizeMeta(stored.slice(PAYLOAD_HEADER.length, nl), slot);
  return meta != null ? { meta, data: stored.slice(nl + 1) } : null;
}

function readMeta(app: App, slot: string): LiveMeta | null {
  try {
    const raw = app.loadLocalStorage(JOURNAL_META_PREFIX + slot) as string | null;
    if (raw != null && raw !== '') return normalizeMeta(raw, slot);
    // Meta key missing (its write failed after the payload's): the payload header carries it.
    const stored = app.loadLocalStorage(JOURNAL_KEY_PREFIX + slot) as string | null;
    return stored != null ? unframePayload(stored, slot)?.meta ?? null : null;
  } catch {
    return null;
  }
}

/** One live slot, decoded; null when absent, torn or unusable. Reads legacy v1 entries too. */
function readLiveSlot(app: App, slot: string): LiveEntry | null {
  try {
    const stored = app.loadLocalStorage(JOURNAL_KEY_PREFIX + slot) as string | null;
    if (stored == null || stored === '') return null;
    const framed = unframePayload(stored, slot);
    if (framed != null) {
      const m = framed.meta;
      return {
        v: JOURNAL_VERSION, mapId: m.mapId, savedAt: m.savedAt,
        payload: decodePayload(m.enc, framed.data), slot, writerId: m.writerId, version: m.version,
      };
    }
    const meta = readMeta(app, slot);
    if (meta == null) {
      // Legacy (pre-split) entry: the whole JournalEntry JSON under the payload key.
      const legacy = parseEntry(JSON.parse(stored) as unknown, mapIdOfSlot(slot));
      return legacy != null ? { ...legacy, slot, writerId: null, version: null } : null;
    }
    if (stored.length !== meta.len) return null;
    return {
      v: JOURNAL_VERSION, mapId: meta.mapId, savedAt: meta.savedAt,
      payload: decodePayload(meta.enc, stored), slot, writerId: meta.writerId, version: meta.version,
    };
  } catch {
    return null;
  }
}

function removeLiveSlot(app: App, slot: string): void {
  try {
    app.saveLocalStorage(JOURNAL_KEY_PREFIX + slot, null);
    app.saveLocalStorage(JOURNAL_META_PREFIX + slot, null);
    removeFromIdList(app, JOURNAL_INDEX_KEY, slot);
  } catch (e) {
    console.debug('[Windrose] Save journal clear failed:', e);
  }
}

/** Maps already told (this session) that their journal is too large. */
const tooLargeWarned = new Set<string>();

function warnJournalTooLarge(mapId: string, size: number): void {
  console.warn('[Windrose] Save journal skipped, payload too large even compressed:', mapId, size);
  if (tooLargeWarned.has(mapId)) return;
  tooLargeWarned.add(mapId);
  new Notice(
    'Windrose: this map is too large for its crash-recovery copy. Saves and backups still protect it, ' +
    'but edits made in the seconds before a crash cannot be recovered.',
    10_000
  );
}

/**
 * Write one live slot. Index first (it is how the slot is found again), then
 * the cached meta key is dropped (a removal cannot hit the quota), then ONE
 * write of the framed payload (header + data), then the meta cache. Never
 * deletes the older payload first: on a quota failure the previous framed
 * copy stays readable through its own header.
 */
function writeLiveSlot(
  app: App,
  mapId: string,
  writerId: string | null,
  version: number | null,
  json: string,
  savedAt: number,
  restoredAt: number | null = null
): boolean {
  const { enc, data } = encodePayload(json);
  if (data.length > MAX_JOURNAL_PAYLOAD) {
    warnJournalTooLarge(mapId, json.length);
    return false;
  }
  const slot = slotId(mapId, writerId);
  const meta: LiveMeta = { v: LIVE_META_VERSION, mapId, writerId, savedAt, version, enc, len: data.length, restoredAt };
  const metaJson = JSON.stringify(meta);
  try {
    addToIdList(app, JOURNAL_INDEX_KEY, slot);
    app.saveLocalStorage(JOURNAL_META_PREFIX + slot, null);
    app.saveLocalStorage(JOURNAL_KEY_PREFIX + slot, PAYLOAD_HEADER + metaJson + '\n' + data);
  } catch (e) {
    console.warn('[Windrose] Save journal write failed (storage full?) for map:', mapId, e);
    return false;
  }
  try {
    app.saveLocalStorage(JOURNAL_META_PREFIX + slot, metaJson);
  } catch {
    // The payload header carries the same metadata; the cache is optional.
  }
  return true;
}

/**
 * Journal `pendingData` for `mapId` into the writer's LIVE slot. Synchronous
 * by construction — call it BEFORE firing the async save it protects.
 *
 * `writerId` is the mounted instance (one slot each); `version` is the
 * writer's save version, so an older save settling cannot clear a newer
 * entry (see clearJournal). Both optional: without a writer the shared
 * writerless slot is used.
 *
 * Returns true only when the entry was actually written. False means nothing
 * protects these edits (too large even compressed, quota, or a serialization
 * error); callers must not report a recovery copy.
 */
function journalPending(
  app: App,
  mapId: string,
  pendingData: MapData,
  options?: { writerId?: string; version?: number }
): boolean {
  try {
    // Match what saveMapData would write, so the on-disk comparison at load
    // time is a plain string equality. Canonicalizes a copy; the live tree is
    // never edited.
    const json = JSON.stringify(canonicalizeTileIds(pendingData));
    return writeLiveSlot(app, mapId, options?.writerId ?? null, options?.version ?? null, json, Date.now());
  } catch (e) {
    console.debug('[Windrose] Save journal skipped:', e);
    return false;
  }
}

/**
 * Drop LIVE journal entries for `mapId` after a landed (or refused) save.
 *
 * With `writerId`: only that writer's slot (plus the shared writerless slot,
 * which holds a restored entry), and with `upToVersion` only when the slot's
 * journaled version is not newer than the save that landed. Without
 * `writerId`: every live slot of the map.
 *
 * Kept and conflict entries are untouched unless `includeKept` is set: only an
 * explicit decision (the map being deleted) may pass it, and it then clears
 * every slot for the map.
 */
function clearJournal(
  app: App,
  mapId: string,
  options?: { writerId?: string; upToVersion?: number; includeKept?: boolean; keepRestored?: boolean }
): void {
  const writerId = options?.writerId;
  if (writerId != null && options?.includeKept !== true) {
    const own = slotId(mapId, writerId);
    const ownMeta = readMeta(app, own);
    const ownVersion = ownMeta?.version ?? null;
    // keepRestored: a copy restored into this slot (restoredAt set) is not
    // this writer's refused tree; only its own next journal replaces it.
    const restoredHere = options?.keepRestored === true && ownMeta?.restoredAt != null;
    if (!restoredHere && (options?.upToVersion == null || ownVersion == null || ownVersion <= options.upToVersion)) {
      removeLiveSlot(app, own);
    }
    // A restored writerless copy is cleared only by a writer that journaled
    // after the restore (its tree can contain the restored edits); a sibling
    // pane landing an older tree leaves it (wave-5 finding 5).
    const restoredAt = readMeta(app, mapId)?.restoredAt ?? null;
    if (restoredAt == null || (ownMeta != null && ownMeta.savedAt >= restoredAt)) {
      removeLiveSlot(app, mapId);
    }
  } else {
    for (const slot of liveSlotsFor(app, mapId)) removeLiveSlot(app, slot);
  }
  if (options?.includeKept === true) {
    removeKeptEntries(app, mapId);
    removeConflictEntry(app, mapId);
  }
}

/**
 * Drop `writerId`'s live slot only while it still holds a restored copy
 * (restoredAt set). Called once a save of the restored tree (or a later one)
 * has landed, so the MAX_SAFE_INTEGER sentinel version cannot outlive it when
 * the pane's own journalNow was skipped (parallax wave-7 finding 4). A slot
 * the pane has journaled since (restoredAt null) is left to clearJournal.
 */
function dropRestoredSlot(app: App, mapId: string, writerId: string): void {
  const own = slotId(mapId, writerId);
  if (readMeta(app, own)?.restoredAt != null) removeLiveSlot(app, own);
}

/** Whether `mapId` holds at least one "keep for later" entry. */
function isJournalKept(app: App, mapId: string): boolean {
  return readKeptEntries(app, mapId).length > 0;
}

// Live writer registry (wave-5 finding 4). Fed by saveCoordinator's
// register/unregisterSaveInstance (the registry lives here only to avoid an
// import cycle). A slot whose writer is still mounted is that pane's crash
// copy for an in-flight save, NOT an orphan: it must never be offered for
// restore to another pane, dropped by that pane's choice, or pruned.
const liveWriters = new Set<string>();

function setJournalWriterLive(writerId: string, live: boolean): void {
  if (live) liveWriters.add(writerId);
  else liveWriters.delete(writerId);
}

/**
 * Pre-nonce writer ids (`windrose-save-<n>`, before live check N6) restarted
 * at every plugin load; current ids are `<bootNonce>-<n>`, unique across loads,
 * so no mounted pane can own a legacy slot: it is always a stale crash copy.
 */
const LEGACY_WRITER_ID = /^windrose-save-\d+$/;

/** Exact-id match against the mounted writers; legacy-format slots are never live. */
function isLiveWriterSlot(entry: LiveEntry): boolean {
  return entry.writerId != null && !LEGACY_WRITER_ID.test(entry.writerId) && liveWriters.has(entry.writerId);
}

/** Every live entry of `mapId`, newest first. */
function readLiveEntries(app: App, mapId: string): LiveEntry[] {
  return liveSlotsFor(app, mapId)
    .map(slot => readLiveSlot(app, slot))
    .filter((e): e is LiveEntry => e != null)
    .sort((a, b) => b.savedAt - a.savedAt);
}

/** The newest LIVE journal entry for `mapId` (any writer), or null. */
function readJournal(app: App, mapId: string): LiveEntry | null {
  return readLiveEntries(app, mapId)[0] ?? null;
}

/** Strip slot bookkeeping before storing an entry in the kept/conflict slots. */
function plainEntry(e: JournalEntry): JournalEntry {
  return { v: JOURNAL_VERSION, mapId: e.mapId, savedAt: e.savedAt, payload: e.payload };
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
function moveJournalToConflict(app: App, mapId: string, writerId?: string): ConflictMoveResult {
  const slot = slotId(mapId, writerId);
  const entry = readLiveSlot(app, slot);
  if (entry == null) return 'nothing';
  try {
    app.saveLocalStorage(CONFLICT_KEY_PREFIX + mapId, JSON.stringify(plainEntry(entry)));
    addToIdList(app, CONFLICT_INDEX_KEY, mapId);
    removeLiveSlot(app, slot);
    return 'moved';
  } catch (e) {
    console.warn('[Windrose] Moving journal entry to conflict key failed, dropping it:', e);
    removeLiveSlot(app, slot);
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

    for (const slot of index) {
      const entry = readLiveSlot(app, slot);
      if (entry != null && isLiveWriterSlot(entry)) {
        kept.push(slot);
        continue;
      }
      const stale = entry == null
        || now - entry.savedAt > JOURNAL_MAX_AGE_MS
        || (live != null && !live.has(mapIdOfSlot(slot)));
      if (stale) {
        app.saveLocalStorage(JOURNAL_KEY_PREFIX + slot, null);
        app.saveLocalStorage(JOURNAL_META_PREFIX + slot, null);
      } else {
        kept.push(slot);
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

  override onOpen(): void {
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

  override onClose(): void {
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
  /** Live slot id (live candidates only). */
  slot?: string;
}

/** Remove one candidate from its slot. */
function dropCandidate(app: App, mapId: string, c: JournalCandidate): void {
  if (c.source === 'live') removeLiveSlot(app, c.slot ?? mapId);
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
  if (addKeptEntry(app, mapId, plainEntry(c.entry))) removeLiveSlot(app, c.slot ?? mapId);
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
 * One restore decision per map per plugin load (multi-pane live check). Every
 * pane mounting a map calls resolveJournalOnLoad; while one round for a map is
 * open, later callers await it and return null instead of prompting for the
 * same slot. The deciding pane applies a restore; the others adopt the store
 * once that pane's save of the restored tree lands (saveCoordinator
 * onRestoreLanded). Module state: it resets with every plugin load.
 */
interface ResolutionRound {
  round: Promise<MapData | null>;
  /** Writer id of the pane whose load opened the round (null: none given). */
  writerId: string | null;
}
const resolutionsInFlight = new Map<string, ResolutionRound>();

/** Candidates deferred ("Keep for later" or Escape) this load, per map: not offered again until the next load. */
const deferredThisLoad = new Map<string, Set<string>>();

function candidateKey(e: JournalEntry): string {
  return String(e.savedAt) + ':' + String(e.payload.length);
}

function isDeferredThisLoad(mapId: string, e: JournalEntry): boolean {
  return deferredThisLoad.get(mapId)?.has(candidateKey(e)) === true;
}

function markDeferredThisLoad(mapId: string, e: JournalEntry): void {
  let set = deferredThisLoad.get(mapId);
  if (set == null) { set = new Set<string>(); deferredThisLoad.set(mapId, set); }
  set.add(candidateKey(e));
}

/** Test seam: forget this load's per-map decisions (a fresh plugin load). */
function resetJournalLoadState(): void {
  resolutionsInFlight.clear();
  deferredThisLoad.clear();
}

/** Whether a live candidate still sits, unchanged, in its slot (another pane may have resolved it). */
function liveCandidatePresent(app: App, c: JournalCandidate): boolean {
  if (c.source !== 'live') return true;
  const now = readLiveSlot(app, c.slot ?? c.entry.mapId);
  return now != null && now.savedAt === c.entry.savedAt && now.payload === c.entry.payload;
}

async function resolveJournalOnLoad(
  app: App,
  mapId: string,
  mapLabel = '',
  prompt?: (savedAt: number, mapLabel: string, source: JournalSource) => Promise<JournalChoice>,
  restoringWriterId?: string
): Promise<MapData | null> {
  const open = resolutionsInFlight.get(mapId);
  if (open != null) {
    // The same pane re-ran its load (rename, reload) while its own prompt is
    // open: join that round, so a Restore confirmed now is applied by this
    // load instead of being dropped with the cancelled one (parallax-livefix 1).
    if (restoringWriterId != null && open.writerId === restoringWriterId) return open.round;
    // Another pane of this map is deciding: never a second prompt for the
    // same slot. Its outcome reaches this pane through the store.
    try { await open.round; } catch { /* the deciding pane reports its own failure */ }
    return null;
  }
  const round = resolveJournalRound(app, mapId, mapLabel, prompt, restoringWriterId);
  const entry: ResolutionRound = { round, writerId: restoringWriterId ?? null };
  resolutionsInFlight.set(mapId, entry);
  try {
    return await round;
  } finally {
    if (resolutionsInFlight.get(mapId) === entry) resolutionsInFlight.delete(mapId);
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
async function resolveJournalRound(
  app: App,
  mapId: string,
  mapLabel = '',
  /** Test seam: replaces the modal prompt. */
  prompt?: (savedAt: number, mapLabel: string, source: JournalSource) => Promise<JournalChoice>,
  /**
   * The restoring pane's writer id. When given, the restored copy lives in
   * that pane's own slot (owner-stamped; its landed save clears it). Absent:
   * the shared writerless slot stamped with the restore time.
   */
  restoringWriterId?: string
): Promise<MapData | null> {
  const candidates: JournalCandidate[] = [];
  // One live candidate per writer slot (several panes may have crashed), newest first.
  // A mounted sibling pane's slot is skipped: it is that pane's in-flight crash copy.
  for (const entry of readLiveEntries(app, mapId)) {
    if (isLiveWriterSlot(entry) || isDeferredThisLoad(mapId, entry)) continue;
    candidates.push({ source: 'live', entry, slot: entry.slot });
  }
  for (const entry of [...readKeptEntries(app, mapId)].reverse()) {
    if (!isDeferredThisLoad(mapId, entry)) candidates.push({ source: 'kept', entry });
  }
  const conflictEntry = readConflictJournal(app, mapId);
  if (conflictEntry != null && !isDeferredThisLoad(mapId, conflictEntry)) candidates.push({ source: 'conflict', entry: conflictEntry });
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
      // The store may have moved while the prompt was open (another pane
      // restored this tree and saved it): a copy identical to the store is
      // not unsaved work, and a slot already resolved elsewhere is gone.
      // Neither is set aside "for later".
      if (compareJournalToDisk(c.entry.payload, await readRawMapEntry(app, mapId)) === 'clean') {
        dropCandidate(app, mapId, c);
        return null;
      }
      if (!liveCandidatePresent(app, c)) return null;
      markDeferredThisLoad(mapId, c.entry);
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
    // lands. Any other slot (kept, conflict, or a dead writer's live slot) is
    // moved into the shared writerless live slot, which every landed save
    // clears, so the app dying before the save still leaves a copy. If the
    // move fails the entry stays where it was and is offered once more
    // (comparing clean once the save has landed).
    // The writerless copy is stamped with the restore time (see clearJournal).
    // Into a pane's own slot: version MAX_SAFE_INTEGER (never Infinity: JSON
    // turns it into null, which any landed save clears) so a save that was
    // already in flight before the restore cannot clear it; the pane's next
    // journalNow overwrites it with the real version. restoredAt marks it so
    // a stale refusal leaves it too (parallax wave-6 finding 3).
    const targetWriter = restoringWriterId ?? null;
    const inPlace = c.source === 'live' && c.slot === slotId(mapId, targetWriter);
    const restoredVersion = targetWriter == null ? null : Number.MAX_SAFE_INTEGER;
    if (writeLiveSlot(app, mapId, targetWriter, restoredVersion, c.entry.payload, c.entry.savedAt, Date.now()) && !inPlace) {
      dropCandidate(app, mapId, c);
    }
    return restored;
  }
  return null;
}

export { journalPending, clearJournal, dropRestoredSlot, isJournalKept, readKeptEntries, moveJournalToConflict, readConflictJournal, readJournal, pruneJournal, setJournalWriterLive, compareJournalToDisk, resolveJournalOnLoad, resetJournalLoadState, MAX_JOURNAL_PAYLOAD, JOURNAL_MAX_AGE_MS, JOURNAL_INDEX_KEY, JOURNAL_KEY_PREFIX, JOURNAL_META_PREFIX, RAW_PAYLOAD_LIMIT, KEPT_KEY_PREFIX, KEPT_MAX_PER_MAP, CONFLICT_KEY_PREFIX };
export type { LiveEntry, JournalSource, ConflictMoveResult };

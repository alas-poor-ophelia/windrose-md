/**
 * bundleStatus.ts
 * Pure wording for tile-bundle status: the per-folder badge in the Tile sets
 * settings section and the tile browser's empty-state notices. Inputs come
 * from the bundle registry (getBundleStateInfo); nothing here reads the vault.
 *
 * `folder-absent` is the registry's answer for a folder that does not exist
 * at all. That is a mistyped or deleted path, not a bundle that has yet to
 * sync, so it never produces a "not on this device" notice.
 */

import type { BundleState } from '../../assets/bundles/bundleRegistry';
import type { BundleFolderResult } from '../../assets/bundles/bundleFolderInPlace';
import type { CompactBundleResult } from '../../assets/bundles/bundleCompactExisting';
import type { UnbundleResult } from '../../assets/bundles/bundleUnbundle';
import type { BundleCleanupResult, BundleOrphan } from '../../assets/bundles/bundleCleanup';

interface BundleStateLike {
  state: BundleState;
  reason: string;
}

interface BundleBadgeCounts {
  /** Image files found by the loose scan; null while unknown. */
  looseFiles?: number | null;
  /** Bundled tile entries (mounted/partial). */
  tiles?: number;
  /** Shard files and their total size; null while unknown. */
  shards?: { count: number; bytes: number } | null;
  /** A bundle write to this folder is running right now (isBundleWriteInProgress). */
  writing?: boolean;
  /** Modes of the serving segments (getBundleModes); one exact or compact mode is named in the badge. */
  modes?: readonly string[];
}

interface BundleNotice {
  folder: string;
  kind: 'not-on-device' | 'failed';
  /** Heading shown above the sentence (the folder), or null when the sentence names it. */
  title: string | null;
  message: string;
}

const NOT_SYNCED_MESSAGE = "This pack's bundle files have not synced to this device. In Sync settings, turn on Sync all other types.";

/** `index-missing` with the marker present: a bundle write on this device stopped before its commit point. */
const INCOMPLETE_MESSAGE = 'Tile bundle is incomplete (bundling did not finish). Bundle the folder again, or re-import the pack, to complete it.';

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function formatMegabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
}

/** Short status line for one tileset folder. Null info = not looked at yet. */
function formatBundleBadge(info: BundleStateLike | null, counts: BundleBadgeCounts = {}): string {
  if (info == null) return 'Checking folder…';
  if (counts.writing === true && info.state === 'not-on-device' && info.reason === 'index-missing') return 'Bundling…';
  switch (info.state) {
    case 'loose':
      return counts.looseFiles == null ? 'Loose: counting files…' : `Loose: ${plural(counts.looseFiles, 'file', 'files')}`;
    case 'mounted':
    case 'partial': {
      const mode = counts.modes?.length === 1 && (counts.modes[0] === 'exact' || counts.modes[0] === 'compact')
        ? ` (${counts.modes[0]})` : '';
      let line = `Bundled${mode}: ${plural(counts.tiles ?? 0, 'tile', 'tiles')}`;
      if (counts.shards != null) {
        line += ` in ${plural(counts.shards.count, 'shard', 'shards')}, ${formatMegabytes(counts.shards.bytes)}`;
      }
      if (info.state === 'partial') line += ' (some tiles unreadable)';
      return line;
    }
    case 'not-on-device':
      if (info.reason === 'folder-absent') return 'Folder not found';
      return info.reason === 'index-missing' ? 'Tile bundle is incomplete (bundling did not finish)' : 'Bundle not on this device yet';
    case 'unmounted-corrupt':
      return `Bundle could not be loaded (${info.reason !== '' ? info.reason : 'corrupt index'})`;
    case 'unsupported-version':
      return 'Bundle needs a newer plugin version';
  }
}

/** True when the badge describes a problem the user should notice. */
function isBundleBadgeProblem(info: BundleStateLike | null, writing = false): boolean {
  if (info == null) return false;
  if (writing && info.state === 'not-on-device' && info.reason === 'index-missing') return false;
  return info.state === 'unmounted-corrupt' || info.state === 'unsupported-version'
    || (info.state === 'not-on-device' && info.reason !== 'folder-absent');
}

/** Empty-state notices for every registered folder whose bundle serves nothing. */
function collectBundleNotices(
  folders: readonly string[],
  getInfo: (folder: string) => BundleStateLike | null,
): BundleNotice[] {
  const notices: BundleNotice[] = [];
  const seen = new Set<string>();
  for (const raw of folders) {
    const folder = raw.trim().replace(/\/+$/, '');
    if (folder === '' || seen.has(folder)) continue;
    seen.add(folder);
    const info = getInfo(folder);
    if (info == null) continue;
    if (info.state === 'not-on-device' && info.reason === 'index-missing') {
      notices.push({ folder, kind: 'failed', title: folder, message: INCOMPLETE_MESSAGE });
    } else if (info.state === 'not-on-device' && info.reason !== 'folder-absent') {
      notices.push({ folder, kind: 'not-on-device', title: folder, message: NOT_SYNCED_MESSAGE });
    } else if (info.state === 'unmounted-corrupt' || info.state === 'unsupported-version') {
      const reason = info.state === 'unsupported-version'
        ? 'needs a newer plugin version'
        : (info.reason !== '' ? info.reason : 'corrupt index');
      notices.push({ folder, kind: 'failed', title: null, message: `Tile bundle in ${folder} could not be loaded (${reason}).` });
    }
  }
  return notices;
}

/**
 * Whether the tile browser's empty state should show the bundle notices.
 * Only when the tilesets in scope contribute no tiles at all and no filter
 * (search, tag, pack, category) is narrowing them, or when every registered
 * folder is in a failure state. A filter that yields nothing is not a bundle
 * problem, and one broken folder must not explain another's empty result.
 */
function shouldShowBundleNotice(opts: {
  notices: readonly BundleNotice[];
  folders: readonly string[];
  scopedTileCount: number;
  filtersActive: boolean;
}): boolean {
  if (opts.notices.length === 0) return false;
  const distinct = new Set(opts.folders.map(f => f.trim().replace(/\/+$/, '')).filter(f => f !== ''));
  if (distinct.size > 0 && opts.notices.length >= distinct.size) return true;
  return opts.scopedTileCount === 0 && !opts.filtersActive;
}

/** Confirm-modal question before "Bundle folder" (files = loose image count). */
function bundleFolderConfirmMessage(files: number | null): string {
  return `Bundle ${files == null ? 'the images in this folder' : plural(files, 'file', 'files')} into a few shard files? The images keep working exactly as before. ` +
    'The loose files are moved to the trash only after every one has been read back byte-identical from the bundle.';
}

/** Completion sentence for a "Bundle folder" run (or its refusal). */
function formatBundleFolderResult(result: BundleFolderResult): string {
  if (result.status === 'refused') return result.message;
  let text = `Bundled ${plural(result.bundled, 'tile', 'tiles')} in ${result.folder} into ` +
    `${plural(result.shards, 'shard', 'shards')} (${formatMegabytes(result.bytes)}).`;
  const skipped = result.skipped.length;
  if (skipped > 0) text += ` Left out ${plural(skipped, 'file', 'files')} that could not be read (see developer console).`;
  if (result.replaced > 0) text += ` Replaced ${plural(result.replaced, 'loose file', 'loose files')} with the bundle.`;
  const kept = result.kept.length;
  if (kept > 0) {
    text += ` Kept ${plural(kept, 'loose file', 'loose files')} the bundle does not replace with identical bytes (see developer console).`;
  }
  if (result.keptPermanentDelete > 0) {
    text += ` Kept ${plural(result.keptPermanentDelete, 'loose file', 'loose files')} because your trash setting deletes files permanently; ` +
      'remove them yourself once the bundle looks right.';
  }
  return text;
}

/** Confirm-modal question before "Compact bundle". */
function compactBundleConfirmMessage(folder: string): string {
  return `Compact ${folder}? Large images are re-encoded as smaller WebP (small images stay exact). ` +
    'This is one-way: the exact bytes are moved to the trash after the compact copy is verified. ' +
    'Re-import the pack to get them back.';
}

/** Completion sentence for a "Compact bundle" run (or its refusal). */
function formatCompactBundleResult(result: CompactBundleResult): string {
  if (result.status !== 'done') return result.message;
  const counts = `${plural(result.reencoded, 'image', 'images')} re-encoded, ${result.keptExact} kept exact`;
  let text: string;
  if (!result.retired) {
    text = `Wrote a compact copy of ${result.folder} (${counts}), but kept the exact copy because ${result.keptReason}. ` +
      'The exact copy still serves every tile (see developer console).';
  } else {
    const saved = Math.max(0, result.bytesBefore - result.bytesAfter);
    text = `Compacted ${result.folder}: ${counts}, saved ${formatMegabytes(saved)} (now ${formatMegabytes(result.bytesAfter)}).`;
  }
  return result.message !== '' ? `${text} ${result.message}` : text;
}

/** Confirm-modal question before "Unbundle" (images = served entries). */
function unbundleConfirmMessage(images: number, compact: boolean): string {
  let text = `Write the ${plural(images, 'image', 'images')} of this bundle back as loose files and move the bundle files to the trash?`;
  if (compact) text += ' This bundle is compact: the files will be the re-encoded copies, not the original pack images.';
  return text;
}

/** Completion sentence for an "Unbundle" run (or its refusal). */
function formatUnbundleResult(result: UnbundleResult): string {
  if (result.status !== 'done') return result.message;
  const written = `${plural(result.written, 'file', 'files')} written`;
  let text: string;
  if (result.retired) {
    text = `Unbundled ${result.folder}: ${written}, bundle files moved to the trash.`;
  } else if (result.keptPermanentDelete) {
    text = `Unbundled ${result.folder}: ${written}. The bundle files were left in place because your trash setting deletes files permanently. ` +
      "When the loose files look right, delete the folder's bundle.wrbundle file and its index, shards and thumbs folders.";
  } else if (result.idMismatches.length > 0) {
    text = `Unbundled ${result.folder}: ${written}. Kept the bundle: ` +
      `${plural(result.idMismatches.length, 'tile', 'tiles')} would get different ids as loose files (see developer console).`;
  } else {
    text = `Unbundled ${result.folder}: ${written}, bundle files kept.`;
  }
  if (result.identical > 0) text += ` ${plural(result.identical, 'file was', 'files were')} already there with the same bytes.`;
  if (result.conflicts.length > 0) text += ` Kept ${plural(result.conflicts.length, 'conflicting file', 'conflicting files')} (see developer console).`;
  if (result.failed.length > 0) text += ` Could not export ${plural(result.failed.length, 'image', 'images')} (see developer console).`;
  if (result.newSegment) text += ' New bundle files arrived during the run (sync); unbundle again to export them.';
  if (result.trashFailed > 0) {
    text += ` Could not move ${plural(result.trashFailed, 'bundle file', 'bundle files')} to the trash; the bundle still serves its tiles.`;
  }
  if (result.compact) text += ' The exported files are the re-encoded copies, not the original pack images.';
  return text;
}

/** Confirm-modal question before "Clean up" (old = trashable, young = kept). */
function cleanupConfirmMessage(old: readonly BundleOrphan[], young: readonly BundleOrphan[]): string {
  const bytes = [...old, ...young].reduce((n, o) => n + o.size, 0);
  let text = `Found ${plural(old.length + young.length, 'unused bundle file', 'unused bundle files')} (${formatMegabytes(bytes)}). ` +
    'Move the ones older than 7 days to the trash?';
  if (young.length > 0) text += ` ${young.length} of them ${young.length === 1 ? 'is' : 'are'} younger than 7 days and will be kept.`;
  return text;
}

/** Completion sentence for a "Clean up" run. */
function formatCleanupResult(result: BundleCleanupResult): string {
  if (result.refused != null) return result.refused;
  const bytes = result.trashed.reduce((n, o) => n + o.size, 0);
  let text = `Cleaned up ${result.folder}: moved ${plural(result.trashed.length, 'unused bundle file', 'unused bundle files')} ` +
    `(${formatMegabytes(bytes)}) to the trash.`;
  if (result.keptYoung.length > 0) text += ` Kept ${plural(result.keptYoung.length, 'file', 'files')} younger than 7 days.`;
  if (result.failed.length > 0) text += ` Could not move ${plural(result.failed.length, 'file', 'files')} (see developer console).`;
  if (result.stopped === true) text += ' Stopped early because new bundle files arrived during the clean-up; run it again later.';
  return text;
}

export {
  unbundleConfirmMessage, formatUnbundleResult, cleanupConfirmMessage, formatCleanupResult,
  compactBundleConfirmMessage, formatCompactBundleResult,
  bundleFolderConfirmMessage, formatBundleFolderResult,
  formatBundleBadge, isBundleBadgeProblem, collectBundleNotices, shouldShowBundleNotice, formatMegabytes,
  NOT_SYNCED_MESSAGE, INCOMPLETE_MESSAGE,
};
export type { BundleBadgeCounts, BundleNotice, BundleStateLike };

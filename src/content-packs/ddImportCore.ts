/**
 * ddImportCore.ts
 *
 * Headless Dungeondraft pack import pipeline, extracted from
 * DungeondraftImportModal so it can be unit-tested and driven without UI.
 * The modal is a thin shell over runDdImport().
 */

import type { App } from 'obsidian';
import { Notice, TFile, TFolder } from 'obsidian';
import type { PluginSettings } from '#types/settings/settings.types';
import type { InstalledPack } from '#types/content-packs/contentPack.types';
import type { TileEntry, TileLayerRole } from '#types/tiles/tile.types';
import type { PckArchive, PckFileEntry, PckSource } from './pckParser';
import { extractFileData, md5Hex } from './pckParser';
import type { DungeondraftPackMeta } from './pckMetadata';
import { parseDungeondraftTags, parseWallSidecars } from './pckMetadata';
import { CONTENT_PACKS_FOLDER } from './contentPackConstants';
import {
	ensureTileMetadataLoaded,
	commitTileMetadataDelta,
	bulkSetImportTags,
	bulkSetDdSourceType,
	bulkSetDepthAffinity,
	bulkSetWallStripInfo,
	bulkMarkWallEndCaps,
} from '../persistence/tileMetadata';
import { runImportDetectionPass } from '../assets/importDetectionPass';
import { ensureFolder } from '../persistence/vaultFolders';
import { mintTileId } from '../assets/tileIds';
import { BundleWriter } from '../assets/bundles/bundleWriter';
import { isSafeBundleKey, sha256Hex, sniffImageMime } from '../assets/bundles/bundleFormat';
import {
	beginBundleWrite, endBundleWrite, isBundleReadFailure, mountBundleFolder, readEntryBytes,
} from '../assets/bundles/bundleRegistry';
import { INDEX_DIR, MARKER_FILE, SHARDS_DIR, THUMBS_DIR } from '../assets/bundles/bundleFormat';
import { acceptShippedThumb, decodeTile } from '../assets/bundles/bundleThumbs';

interface PluginLike {
	app: App;
	settings: PluginSettings;
	saveSettings(): Promise<void>;
}

interface AssetCounts {
	objects: number;
	patterns: number;
	terrain: number;
	walls: number;
	paths: number;
	/** Doors/windows/thresholds — plain single PNGs, never a strip source (§3). */
	portals: number;
	other: number;
	total: number;
}

/** DD source directories whose textures are line-strip assets, not cell tiles. */
const STRIP_SOURCE_TYPES = new Set(['walls', 'paths']);

/**
 * `portals` is deliberately NOT in STRIP_SOURCE_TYPES: doors/windows are
 * plain centered images (256px-wide = 1 cell convention), not tiling strips —
 * they seat into a wall GAP as a unit, they aren't drawn/repeated along it.
 */
const TEXTURE_DIRS = ['objects', 'patterns', 'terrain', 'walls', 'paths', 'portals'] as const;

function countAssets(archive: PckArchive): AssetCounts {
	const counts: AssetCounts = {
		objects: 0, patterns: 0, terrain: 0, walls: 0, paths: 0, portals: 0, other: 0, total: 0,
	};
	for (const f of archive.files) {
		if (!f.path.endsWith('.webp') && !f.path.endsWith('.png')) continue;
		if (f.path.includes('/thumbnails/')) continue;
		if (f.path.includes('/textures/objects/')) counts.objects++;
		else if (f.path.includes('/textures/patterns/')) counts.patterns++;
		else if (f.path.includes('/textures/terrain/')) counts.terrain++;
		else if (f.path.includes('/textures/walls/')) counts.walls++;
		else if (f.path.includes('/textures/paths/')) counts.paths++;
		else if (f.path.includes('/textures/portals/')) counts.portals++;
		else counts.other++;
	}
	counts.total =
		counts.objects + counts.patterns + counts.terrain + counts.walls + counts.paths + counts.portals + counts.other;
	return counts;
}

/**
 * Map a raw .pck entry path to a vault-relative texture path.
 *
 * Godot/Dungeondraft entries look like `res://packs/<id>/textures/objects/...`.
 * The category + tag + ddSourceType logic all expect a path that begins at the
 * `textures/` segment, so slice from there per-file. Deriving a single prefix
 * from files[0] is unsafe: files[0] is the pack manifest (not a texture), so the
 * prefix comes back empty and every path stays un-stripped — mis-nesting the
 * whole pack and breaking ddSourceType detection (see H-515).
 */
function toRelativeTexturePath(rawPath: string): string {
	const idx = rawPath.indexOf('textures/');
	if (idx >= 0) return rawPath.slice(idx);
	return rawPath.replace(/^res:\/\/(?:packs\/[^/]+\/)?/, '');
}

/** Source type from a relative texture path, e.g. "textures/walls/X.webp" -> "walls". */
function sourceTypeOf(relativePath: string): string | null {
	const m = relativePath.match(/^textures\/(\w+)\//);
	return m != null ? m[1] : null;
}

/** Filename stem: "Wall_Glass_01_a.webp" -> "Wall_Glass_01_a". */
function stemOf(filename: string): string {
	return filename.replace(/\.(webp|png)$/i, '');
}

/**
 * Vault folder (= drawer category) a texture lands in on extraction: strips
 * stay in their source-type folder so `_end` caps sit beside their strips;
 * tagged cell tiles go under their first pack tag; untagged ones under their
 * source-relative subpath. The wizard's tier rows key on this same rule so
 * step-② decisions land on the folders the user will actually see.
 *
 * [Bracketed] runs in tags are pack/artist prefixes ("[EA] Chairs"), not
 * category names — they are trimmed from the folder, and a tag that is ONLY
 * a bracket token ("[EA]") is ignored in favour of the path-derived folder.
 */
function destFolderOf(
	relativePath: string,
	sourceType: string | null,
	firstTag: string | undefined,
): string {
	if (sourceType != null && STRIP_SOURCE_TYPES.has(sourceType)) return sourceType;
	if (firstTag != null) {
		const debracketed = firstTag.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
		if (debracketed !== '') return unhideFolder(debracketed.replace(/[\\:*?"<>|]/g, '_'));
	}
	const parts = relativePath.split('/');
	return unhideFolder(parts.length > 2 ? parts.slice(1, -1).join('/') : parts[0] ?? 'misc');
}

/**
 * Obsidian's vault index skips any path segment that starts with a dot, so a
 * texture extracted under `.Cave/` exists on disk but is invisible to the tile
 * scanner. Some packs tag every object with a dot-prefixed category (Crosshead:
 * ".Cave", ".Garden", ".Tree"), which routed ~90% of their content into hidden
 * folders. Strip leading dots from every segment; a dots-only segment becomes "misc".
 */
function unhideFolder(folder: string): string {
	return folder
		.split('/')
		.map(seg => {
			const visible = seg.replace(/^\.+/, '');
			return visible === '' ? 'misc' : visible;
		})
		.join('/');
}

/** Texture entries eligible for import (webp/png under the known source dirs). */
function listTextureEntries(archive: PckArchive): PckArchive['files'] {
	return archive.files.filter(f => {
		if (!f.path.endsWith('.webp') && !f.path.endsWith('.png')) return false;
		if (f.path.includes('/thumbnails/')) return false;
		return TEXTURE_DIRS.some(dir => f.path.includes('/textures/' + dir + '/'));
	});
}

/** Pack tag lookup tables keyed by relative texture path. */
async function buildPackTagIndex(
	source: PckSource,
	archive: PckArchive,
): Promise<{ pathToFirstTag: Map<string, string>; pathToAllTags: Map<string, string[]> }> {
	const pathToFirstTag = new Map<string, string>();
	const pathToAllTags = new Map<string, string[]>();
	const tags = await parseDungeondraftTags(source, archive);
	const isBracketOnly = (t: string): boolean => /^\s*\[[^\]]*\]\s*$/.test(t);
	if (tags != null) {
		for (const [rawTag, paths] of Object.entries(tags.tags)) {
			// A dot-prefixed pack tag (".Cave") is a category-naming convention,
			// not part of the name — keep it browsable as "Cave".
			const tag = rawTag.replace(/^\.+/, '');
			if (tag === '') continue;
			for (const p of paths) {
				// First tag wins, except a bracket-only pack prefix ("[EA]")
				// yields to the first real tag that comes along.
				const first = pathToFirstTag.get(p);
				if (first == null || (isBracketOnly(first) && !isBracketOnly(tag))) {
					pathToFirstTag.set(p, tag);
				}
				const existing = pathToAllTags.get(p);
				if (existing != null) {
					existing.push(tag);
				} else {
					pathToAllTags.set(p, [tag]);
				}
			}
		}
	}
	return { pathToFirstTag, pathToAllTags };
}

interface PckWizardAnalysis {
	/**
	 * Pseudo tile entries for the pack's CELL textures (strips excluded):
	 * vaultPath = relative texture path, category = destination folder,
	 * tags = pack tags. Feed these to aggregateFolderTiers/mineFilenameTags.
	 */
	cellTiles: TileEntry[];
	/** Wall/path strip textures — line assets, not shown in tier/tag steps. */
	stripCount: number;
	/** Pack-shipped tags with cell-texture counts, descending. */
	packTags: Array<{ tag: string; count: number }>;
}

/**
 * In-memory analysis of a pack for the Add-tiles wizard steps ②③ —
 * no extraction, no vault writes.
 */
async function analyzePckForWizard(source: PckSource, archive: PckArchive): Promise<PckWizardAnalysis> {
	const { pathToFirstTag, pathToAllTags } = await buildPackTagIndex(source, archive);
	const cellTiles: TileEntry[] = [];
	let stripCount = 0;
	const tagCounts = new Map<string, number>();

	for (const entry of listTextureEntries(archive)) {
		const rel = toRelativeTexturePath(entry.path);
		const sourceType = sourceTypeOf(rel);
		if (sourceType != null && STRIP_SOURCE_TYPES.has(sourceType)) {
			stripCount++;
			continue;
		}
		const filename = rel.split('/').pop() ?? 'unknown';
		const tags = pathToAllTags.get(rel);
		cellTiles.push({
			id: stemOf(filename),
			filename,
			vaultPath: rel,
			category: destFolderOf(rel, sourceType, pathToFirstTag.get(rel)),
			tags,
		});
		for (const t of tags ?? []) {
			tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
		}
	}

	const packTags = Array.from(tagCounts.entries())
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.map(([tag, count]) => ({ tag, count }));
	return { cellTiles, stripCount, packTags };
}

/** Wizard-confirmed decisions applied on top of the automatic import pipeline. */
interface DdWizardDecisions {
	/** Confirmed tier per destination folder (keys = destFolderOf values). */
	tierByFolder?: ReadonlyMap<string, TileLayerRole>;
	/** Extra (mined/manual) tags -> relative texture paths. */
	extraTags?: ReadonlyArray<{ tag: string; rels: readonly string[] }>;
}

/** True for `_end` cap textures paired with a wall strip. */
function isEndCapFilename(filename: string): boolean {
	return /_end\.(webp|png)$/i.test(filename);
}

/**
 * Pair wall strips with their `_end` cap textures by filename stem within the
 * same source folder. Returns Map<strip relativePath, cap relativePath>.
 * "textures/walls/X_end.webp" caps "textures/walls/X.webp" (extension may differ).
 */
function pairWallEndCaps(relativePaths: string[]): Map<string, string> {
	const stripsByKey = new Map<string, string>();
	const caps: Array<{ key: string; path: string }> = [];

	for (const rel of relativePaths) {
		const dir = rel.substring(0, rel.lastIndexOf('/'));
		const filename = rel.split('/').pop() ?? '';
		const stem = stemOf(filename);
		if (isEndCapFilename(filename)) {
			caps.push({ key: dir + '/' + stem.replace(/_end$/i, ''), path: rel });
		} else {
			stripsByKey.set(dir + '/' + stem, rel);
		}
	}

	const result = new Map<string, string>();
	for (const { key, path } of caps) {
		const strip = stripsByKey.get(key);
		if (strip != null) result.set(strip, path);
	}
	return result;
}

interface DdImportResult {
	imported: number;
	failed: number;
	total: number;
	packName: string;
	/** True when the caller's isCancelled() stopped extraction early. */
	cancelled: boolean;
	/** Textures left out of the bundle (zero-byte, undecodable, duplicate path), also counted in failed. */
	skipped: Array<{ key: string; reason: string }>;
	/**
	 * Set when nothing was committed (the bundle index failed to write, or
	 * every texture was skipped): settings were left untouched.
	 */
	error?: string;
	/** Loose images from an earlier import moved to the trash once the bundle served their keys. */
	looseReplaced?: number;
	/** Loose images kept because the bundle does not serve identical bytes for them (folder-relative). */
	looseKept?: string[];
	/** Why each looseKept entry stayed (same order as looseKept). */
	looseKeptReasons?: Array<{ path: string; reason: string }>;
	/**
	 * Loose images left in place because Obsidian's trash setting deletes
	 * permanently (0 when retirement ran or nothing was loose).
	 */
	looseKeptPermanentDelete?: number;
}

type DdProgressFn = (done: number, total: number, stage: string) => void;

interface DdImportOptions {
	/** Store textures as a tile bundle (default true); false writes loose files. */
	bundle?: boolean;
}

/** One texture's routing: everything derived from its pack path before extraction. */
interface TexturePlan {
	entry: PckFileEntry;
	relativePath: string;
	filename: string;
	sourceType: string | null;
	isStrip: boolean;
	/** Destination folder under the pack folder (= drawer category). */
	folder: string;
	/** Bundle key relative to the pack folder: `${folder}/${filename}`, or the key of a byte-identical loose file from an earlier import (preferLooseKeys). */
	key: string;
	/** Vault path of the tile (a real file when loose, virtual when bundled). */
	destPath: string;
}

const BUNDLE_TARGET_SHARD_BYTES = 4 * 1024 * 1024;

/** Folder part of a bundle key ("" at the root). */
function keyDirOf(key: string): string {
	const i = key.lastIndexOf('/');
	return i >= 0 ? key.slice(0, i) : '';
}

/** Filename part of a bundle key. */
function keyBaseOf(key: string): string {
	return key.slice(key.lastIndexOf('/') + 1);
}

/**
 * Loose images from an earlier import, indexed by content: sha256 -> their
 * folder-relative keys (sorted), plus the set of byte lengths so textures
 * of any other length are never read twice. Unreadable files and keys a
 * bundle cannot hold are left out (default routing applies and retirement
 * keeps them).
 */
async function indexLooseByContent(
	app: App,
	basePath: string,
	loosePaths: string[],
): Promise<{ sizes: Set<number>; byHash: Map<string, string[]> }> {
	const sizes = new Set<number>();
	const byHash = new Map<string, string[]>();
	for (const path of loosePaths) {
		const key = path.slice(basePath.length + 1);
		if (!isSafeBundleKey(key)) continue;
		let bytes: Uint8Array;
		try {
			bytes = new Uint8Array(await app.vault.adapter.readBinary(path));
		} catch {
			continue;
		}
		if (bytes.byteLength === 0) continue;
		sizes.add(bytes.byteLength);
		const hash = await sha256Hex(bytes);
		const keys = byHash.get(hash);
		if (keys != null) keys.push(key);
		else byHash.set(hash, [key]);
	}
	for (const keys of byHash.values()) keys.sort();
	return { sizes, byHash };
}

/**
 * The existing loose layout wins: a texture whose bytes are identical to a
 * loose image from an earlier import (possibly routed by an older rule) is
 * bundled under that file's key, so its tile id stays the one the loose
 * scan minted (placed maps keep resolving) and retirement can replace the
 * file. Each loose key is claimed once, by an exact default-key match
 * first, then a same-basename texture, then any. Textures with no
 * byte-identical loose file keep the default routing. `folder` is left as
 * routed: it is the wizard's decision group for the texture.
 */
async function preferLooseKeys(
	app: App,
	source: PckSource,
	plans: TexturePlan[],
	basePath: string,
	loosePaths: string[],
): Promise<TexturePlan[]> {
	if (loosePaths.length === 0) return plans;
	const { sizes, byHash } = await indexLooseByContent(app, basePath, loosePaths);
	if (byHash.size === 0) return plans;
	const hashes = new Map<number, string>();
	for (let i = 0; i < plans.length; i++) {
		if (!sizes.has(plans[i].entry.size)) continue;
		try {
			const data = await extractFileData(source, plans[i].entry);
			if (data.byteLength > 0 && sizes.has(data.byteLength)) hashes.set(i, await sha256Hex(data));
		} catch {
			// Unreadable here means unreadable in the extraction loop too: it reports it.
		}
	}
	const claimed = new Set<string>();
	const chosen = new Map<number, string>();
	const passes: Array<(plan: TexturePlan, key: string) => boolean> = [
		(plan, key) => key === plan.key,
		(plan, key) => keyBaseOf(key) === plan.filename,
		() => true,
	];
	for (const accepts of passes) {
		for (const [i, hash] of hashes) {
			if (chosen.has(i)) continue;
			const key = byHash.get(hash)?.find(k => !claimed.has(k) && accepts(plans[i], k));
			if (key == null) continue;
			claimed.add(key);
			chosen.set(i, key);
		}
	}
	return plans.map((p, i) => {
		const key = chosen.get(i);
		return key == null || key === p.key ? p : { ...p, key, destPath: basePath + '/' + key };
	});
}

/** Dungeondraft-shipped thumbnails keyed by their file stem (md5 of the texture's res:// path). */
function indexShippedThumbs(archive: PckArchive): Map<string, PckFileEntry> {
	const out = new Map<string, PckFileEntry>();
	for (const f of archive.files) {
		const m = /\/thumbnails\/([0-9a-f]{32})\.(?:png|webp)$/i.exec(f.path);
		if (m != null) out.set(m[1].toLowerCase(), f);
	}
	return out;
}

/**
 * Write the planned textures into a tile bundle at basePath (exact mode,
 * 4 MiB shards), in category-then-filename order. Ids are minted over the
 * keys exactly as the loose scan would mint them over the same layout.
 * Zero-byte, unrecognised, undecodable and duplicate-path textures are
 * skipped and reported; a shipped thumbnail is used when it is a small
 * PNG/WebP, else one is rendered. The bundle is mounted before returning so
 * the detection pass reads the new entries through readTileBytes.
 */
async function extractToBundle(
	app: App,
	source: PckSource,
	archive: PckArchive,
	plansIn: TexturePlan[],
	basePath: string,
	meta: DungeondraftPackMeta,
	onProgress: DdProgressFn | undefined,
	isCancelled: (() => boolean) | undefined,
): Promise<{
	landed: TexturePlan[];
	skipped: Array<{ key: string; reason: string }>;
	failed: number;
	cancelled: boolean;
	/** Why nothing was committed; null when an index segment with at least one tile was written. */
	commitError: string | null;
}> {
	// Key folder, then key filename: for default-routed plans this is the
	// folder-then-filename order; a key kept from an earlier loose layout
	// sorts among its own folder's files, as the loose scan would.
	const plans = [...plansIn].sort((a, b) =>
		keyDirOf(a.key).localeCompare(keyDirOf(b.key)) || keyBaseOf(a.key).localeCompare(keyBaseOf(b.key)));
	const shippedThumbs = indexShippedThumbs(archive);
	const writer = new BundleWriter(app, basePath, {
		packId: meta.id, name: meta.name, mode: 'exact', targetShardBytes: BUNDLE_TARGET_SHARD_BYTES,
	});
	const added: TexturePlan[] = [];
	const skipped: Array<{ key: string; reason: string }> = [];
	const seenKeys = new Set<string>();
	const seenIds = new Set<string>();
	let failed = 0;
	let cancelled = false;

	for (let i = 0; i < plans.length; i++) {
		if (isCancelled?.() === true) {
			cancelled = true;
			break;
		}
		// Yield before the body so long runs of skipped/duplicate textures still yield.
		if (i > 0 && i % 20 === 0) {
			await new Promise(r => window.setTimeout(r, 0));
		}
		const plan = plans[i];
		try {
			if (seenKeys.has(plan.key)) {
				skipped.push({ key: plan.key, reason: 'another texture already uses this path' });
				continue;
			}
			seenKeys.add(plan.key);
			const data = await extractFileData(source, plan.entry);
			if (data.byteLength === 0) {
				skipped.push({ key: plan.key, reason: 'zero-byte texture' });
				continue;
			}
			const mime = sniffImageMime(data);
			if (mime == null) {
				skipped.push({ key: plan.key, reason: 'not a recognised image' });
				continue;
			}
			const shippedThumb = await readShippedThumb(source, shippedThumbs.get(md5Hex(plan.entry.path)), plan.key);
			const decoded = await decodeTile(data, mime, { renderThumb: shippedThumb == null });
			if (decoded == null) {
				skipped.push({ key: plan.key, reason: 'image failed to decode' });
				continue;
			}
			const id = mintTileId(plan.key, seenIds);
			await writer.add(plan.key, data, mime, id, decoded.dims, shippedThumb ?? decoded.thumb ?? undefined);
			added.push(plan);
		} catch (e) {
			failed++;
			console.error('[Windrose] Failed to bundle', plan.destPath, e);
		} finally {
			onProgress?.(i + 1, plans.length, 'extract');
		}
	}

	let landed: TexturePlan[] = [];
	let commitError: string | null = null;
	try {
		const result = await writer.finish();
		const writerSkipped = new Set(result.skipped.map(x => x.key));
		skipped.push(...result.skipped);
		landed = added.filter(p => !writerSkipped.has(p.key));
		if (result.indexFile === '' || result.entryCount === 0) {
			commitError = 'no texture could be bundled';
			landed = [];
		}
	} catch (e) {
		// No index segment was committed: nothing from this run is visible.
		failed += added.length;
		commitError = `the tile bundle could not be written (${e instanceof Error ? e.message : String(e)})`;
		console.error('[Windrose] Failed to commit the tile bundle for', basePath, e);
	}
	if (skipped.length > 0) {
		const lines = skipped.map(x => `  ${x.key}: ${x.reason}`).join('\n');
		console.warn(`[Windrose] ${skipped.length} texture(s) skipped importing ${meta.name}:\n${lines}`);
	}
	try {
		await mountBundleFolder(app, basePath);
	} catch (e) {
		console.error('[Windrose] Failed to mount the tile bundle at', basePath, e);
	}
	return { landed, skipped, failed, cancelled, commitError };
}

/**
 * A shipped Dungeondraft thumbnail when it reads and passes acceptShippedThumb;
 * null (render one instead) on any failure, so a corrupt or out-of-range
 * thumbnail entry never drops the tile itself.
 */
async function readShippedThumb(
	source: PckSource,
	entry: PckFileEntry | undefined,
	key: string,
): Promise<Uint8Array | null> {
	if (entry == null) return null;
	try {
		return acceptShippedThumb(await extractFileData(source, entry));
	} catch (e) {
		console.warn('[Windrose] Shipped thumbnail unreadable for', key, '- rendering one instead', e);
		return null;
	}
}

const LOOSE_IMAGE_RE = /\.(png|jpe?g|gif|webp)$/i;

/**
 * Loose image files under basePath (an earlier loose import of this pack),
 * excluding the bundle's own index/, shards/ and thumbs/ folders. Vault paths.
 */
async function listLooseImages(app: App, basePath: string): Promise<string[]> {
	const skipDirs = new Set([INDEX_DIR, SHARDS_DIR, THUMBS_DIR].map(d => `${basePath}/${d}`));
	const out: string[] = [];
	const queue = [basePath];
	while (queue.length > 0) {
		const dir = queue.pop();
		if (dir == null) continue;
		let listing: { files: string[]; folders: string[] };
		try {
			listing = await app.vault.adapter.list(dir);
		} catch {
			continue;
		}
		for (const sub of listing.folders) if (!skipDirs.has(sub)) queue.push(sub);
		for (const f of listing.files) {
			if (f === `${basePath}/${MARKER_FILE}`) continue;
			if (LOOSE_IMAGE_RE.test(f)) out.push(f);
		}
	}
	return out.sort();
}

/** Why a loose image from an earlier import was left in place. */
type LooseKeptReason = 'differs' | 'not-in-bundle' | 'not-indexed' | 'not-served' | 'trash-failed';

/** Same length and every byte equal. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
	if (a.byteLength !== b.byteLength) return false;
	for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
	return true;
}

/**
 * Obsidian's "Deleted files" setting (`system` | `local` | `none`), or null
 * when this build does not expose vault.getConfig (mobile, older API): the
 * caller then retires through fileManager.trashFile, which uses `.trash`.
 */
function trashOptionOf(app: App): string | null {
	const vault = app.vault as unknown as { getConfig?: (key: string) => unknown };
	if (typeof vault.getConfig !== 'function') return null;
	try {
		const v = vault.getConfig('trashOption');
		return typeof v === 'string' ? v : null;
	} catch {
		return null;
	}
}

/**
 * Move loose images to the trash once the mounted bundle serves the SAME
 * bytes for their paths. Each candidate is read back through readEntryBytes
 * (a real shard read, not an index lookup) and compared byte-for-byte with
 * the loose file; anything else stays, loose-wins keeps it in force, and it
 * is reported with a reason: `differs` (pack update or user override),
 * `not-in-bundle` (this run bundled nothing at that key and no mounted
 * segment serves it), `not-served` (the bundle has the key but the read
 * failed, or the loose file could not be read),
 * `not-indexed` (the vault has no TFile for it), `trash-failed`. Folders left
 * empty below basePath are trashed too. fileManager.trashFile honours the
 * user's trash setting; the caller skips this entirely when that setting
 * deletes permanently.
 */
async function retireLooseImages(
	app: App,
	basePath: string,
	loosePaths: string[],
	/** Folder-relative keys this run bundled. */
	bundledKeys: ReadonlySet<string>,
): Promise<{ replaced: number; kept: Array<{ path: string; reason: LooseKeptReason }> }> {
	const kept: Array<{ path: string; reason: LooseKeptReason }> = [];
	if (loosePaths.length === 0) return { replaced: 0, kept };
	let replaced = 0;
	const touchedDirs = new Set<string>();
	for (const path of loosePaths) {
		const rel = path.slice(basePath.length + 1);
		const file = app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			kept.push({ path: rel, reason: 'not-indexed' });
			continue;
		}
		const served = await readEntryBytes(app, path);
		if (isBundleReadFailure(served)) {
			kept.push({ path: rel, reason: bundledKeys.has(rel) ? 'not-served' : 'not-in-bundle' });
			continue;
		}
		let looseBytes: Uint8Array;
		try {
			looseBytes = new Uint8Array(await app.vault.adapter.readBinary(path));
		} catch {
			kept.push({ path: rel, reason: 'not-served' });
			continue;
		}
		if (!sameBytes(new Uint8Array(served.bytes), looseBytes)) {
			kept.push({ path: rel, reason: 'differs' });
			continue;
		}
		try {
			await app.fileManager.trashFile(file);
			replaced++;
			touchedDirs.add(path.slice(0, path.lastIndexOf('/')));
		} catch (e) {
			kept.push({ path: rel, reason: 'trash-failed' });
			console.error('[Windrose] Could not move the loose tile to the trash:', path, e);
		}
	}
	// Deepest first, walking up to (never including) basePath.
	const dirs = new Set<string>();
	for (let d of touchedDirs) {
		while (d.startsWith(basePath + '/')) {
			dirs.add(d);
			d = d.slice(0, d.lastIndexOf('/'));
		}
	}
	for (const dir of [...dirs].sort((a, b) => b.split('/').length - a.split('/').length)) {
		try {
			const listing = await app.vault.adapter.list(dir);
			if (listing.files.length > 0 || listing.folders.length > 0) continue;
			const folder = app.vault.getAbstractFileByPath(dir);
			if (folder instanceof TFolder) await app.fileManager.trashFile(folder);
		} catch (e) {
			console.warn('[Windrose] Could not remove the empty folder', dir, e);
		}
	}
	if (kept.length > 0) {
		const groups = new Map<LooseKeptReason, string[]>();
		for (const k of kept) {
			const g = groups.get(k.reason);
			if (g != null) g.push(k.path);
			else groups.set(k.reason, [k.path]);
		}
		const lines = [...groups].map(([reason, paths]) => `  ${reason} (${paths.length}):\n    ${paths.join('\n    ')}`);
		console.warn(`[Windrose] ${kept.length} loose file(s) in ${basePath} kept:\n${lines.join('\n')}`);
		const names = kept.slice(0, 3).map(k => k.path.split('/').pop() ?? k.path);
		const more = kept.length > 3 ? ', and more' : '';
		new Notice(
			`Windrose: kept ${kept.length} loose ${kept.length === 1 ? 'file' : 'files'} the new bundle does not replace ` +
			`(${names.join(', ')}${more}). See the developer console for details.`,
			10_000,
		);
	}
	return { replaced, kept };
}

/**
 * One import per pack folder at a time: two overlapping runs would write
 * index segments, retire loose files and register settings against each
 * other's half-finished state.
 */
const importsInFlight = new Map<string, Promise<DdImportResult>>();

/** Vault folder a Dungeondraft pack imports into. */
function packBasePath(meta: DungeondraftPackMeta): string {
	return CONTENT_PACKS_FOLDER + '/dungeondraft-packs/' + meta.id;
}

/**
 * Run the full Dungeondraft pack import: extract textures into the vault,
 * write tile metadata (tags, source types, depth/render-mode/span predictions,
 * wall strip pairing), register the tileset folder, and record the installed pack.
 * Callers go through runDdImport, which serializes runs per pack folder.
 */
async function runDdImportUnlocked(
	app: App,
	plugin: PluginLike,
	source: PckSource,
	archive: PckArchive,
	meta: DungeondraftPackMeta,
	onProgress?: DdProgressFn,
	wizard?: DdWizardDecisions,
	/**
	 * Polled before each file extraction; returning true stops the loop
	 * cleanly. Files already extracted keep their metadata passes below, so
	 * a cancelled import leaves a coherent partial install (re-importing the
	 * pack later overwrites in place and completes it).
	 */
	isCancelled?: () => boolean,
	/** bundle (default true): store textures as a tile bundle; false keeps the loose-file path. */
	opts: DdImportOptions = {},
): Promise<DdImportResult> {
	const basePath = packBasePath(meta);
	await ensureFolder(app, basePath);

	const textures = listTextureEntries(archive);

	const { pathToFirstTag, pathToAllTags } = await buildPackTagIndex(source, archive);
	// Wizard-applied (mined/manual) tags ride along with the pack tags so the
	// extraction loop below writes them into importTags in one pass.
	for (const { tag, rels } of wizard?.extraTags ?? []) {
		for (const rel of rels) {
			const existing = pathToAllTags.get(rel);
			if (existing == null) pathToAllTags.set(rel, [tag]);
			else if (!existing.includes(tag)) existing.push(tag);
		}
	}

	const wallSidecars = await parseWallSidecars(source, archive);
	const endCapByStrip = pairWallEndCaps(
		textures
			.map(t => toRelativeTexturePath(t.path))
			.filter(rel => {
				const src = sourceTypeOf(rel);
				return src != null && STRIP_SOURCE_TYPES.has(src);
			}),
	);

	const importTagEntries: Array<{ vaultPath: string; tags: string[] }> = [];
	const ddSourceEntries: Array<{ vaultPath: string; sourceType: string }> = [];
	// relativePath -> vault destPath, for resolving end-cap pairs after extraction
	const relToDest = new Map<string, string>();
	// destination folder -> extracted cell-tile vault paths (wizard tier application)
	const cellDestsByFolder = new Map<string, string[]>();
	let failedCount = 0;
	let cancelled = false;

	const plans: TexturePlan[] = textures.map(entry => {
		const relativePath = toRelativeTexturePath(entry.path);
		const filename = entry.path.split('/').pop() ?? 'unknown';
		const sourceType = sourceTypeOf(relativePath);
		const isStrip = sourceType != null && STRIP_SOURCE_TYPES.has(sourceType);
		const folder = destFolderOf(relativePath, sourceType, pathToFirstTag.get(relativePath));
		const key = folder + '/' + filename;
		return { entry, relativePath, filename, sourceType, isStrip, folder, key, destPath: basePath + '/' + key };
	});

	/** Record metadata for a texture that actually landed (loose file or bundle entry). */
	const recordLanded = (p: TexturePlan): void => {
		relToDest.set(p.relativePath, p.destPath);
		if (!p.isStrip) {
			const folderDests = cellDestsByFolder.get(p.folder);
			if (folderDests != null) folderDests.push(p.destPath);
			else cellDestsByFolder.set(p.folder, [p.destPath]);
		}
		const allTags = pathToAllTags.get(p.relativePath);
		if (allTags != null && allTags.length > 0) {
			importTagEntries.push({ vaultPath: p.destPath, tags: allTags });
		}
		if (p.sourceType != null) {
			ddSourceEntries.push({ vaultPath: p.destPath, sourceType: p.sourceType });
		}
	};

	let skipped: Array<{ key: string; reason: string }> = [];
	let looseReplaced = 0;
	let looseKept: string[] = [];
	let looseKeptReasons: Array<{ path: string; reason: string }> = [];
	let looseKeptPermanentDelete = 0;
	if (opts.bundle !== false) {
		// The vault watcher stays out of this folder until the bundle is
		// committed and mounted and any replaced loose files are gone.
		beginBundleWrite(basePath);
		let out: Awaited<ReturnType<typeof extractToBundle>>;
		try {
			const loose = await listLooseImages(app, basePath);
			const routed = await preferLooseKeys(app, source, plans, basePath, loose);
			out = await extractToBundle(app, source, archive, routed, basePath, meta, onProgress, isCancelled);
			// A cancelled run holds a partial bundle: it may still register
			// (below), but it never retires the earlier loose files.
			if (out.commitError == null && !out.cancelled && loose.length > 0) {
				if (trashOptionOf(app) === 'none') {
					// "Permanently delete" in Obsidian's settings: trashFile would
					// destroy the originals, so they stay and the user is told.
					looseKeptPermanentDelete = loose.length;
				} else {
					// Belt and braces: retirement never throws by design, but a throw
					// here must not skip registration of an already committed bundle.
					let retired: Awaited<ReturnType<typeof retireLooseImages>> = { replaced: 0, kept: [] };
					try {
						retired = await retireLooseImages(app, basePath, loose, new Set(out.landed.map(p => p.key)));
					} catch (e) {
						console.warn('[Windrose] Retiring loose files failed for', basePath, e);
					}
					looseReplaced = retired.replaced;
					looseKeptReasons = retired.kept;
					looseKept = retired.kept.map(k => k.path);
					// Clears the registry's loose-shadow answers for the trashed paths.
					// The bundle is already committed and mounted: a failure here
					// must not skip registration below.
					if (looseReplaced > 0) {
						try {
							await mountBundleFolder(app, basePath);
						} catch (e) {
							console.warn('[Windrose] Remount after retiring loose files failed for', basePath, e);
						}
					}
				}
			}
		} finally {
			endBundleWrite(basePath);
		}
		cancelled = out.cancelled;
		failedCount += out.failed;
		skipped = out.skipped;
		if (out.commitError != null) {
			// Nothing from this run is visible: leave tilesetFolders and
			// installedContentPacks untouched rather than register a folder
			// the registry would report as a bundle that never synced.
			console.error(`[Windrose] Import of ${meta.name} committed nothing: ${out.commitError}`);
			return {
				imported: 0,
				failed: failedCount + skipped.length,
				skipped,
				total: textures.length,
				packName: meta.name,
				cancelled,
				error: out.commitError,
			};
		}
		for (const p of out.landed) recordLanded(p);
	} else {
		for (let i = 0; i < plans.length; i++) {
			if (isCancelled?.() === true) {
				cancelled = true;
				break;
			}
			const plan = plans[i];
			const destPath = plan.destPath;
			try {
				const parentDir = destPath.substring(0, destPath.lastIndexOf('/'));
				await ensureFolder(app, parentDir);

				const data = await extractFileData(source, plan.entry);
				const arrayBuf = new ArrayBuffer(data.byteLength);
				new Uint8Array(arrayBuf).set(data);
				const existing = app.vault.getAbstractFileByPath(destPath);
				if (existing instanceof TFile) {
					await app.vault.modifyBinary(existing, arrayBuf);
				} else {
					await app.vault.createBinary(destPath, arrayBuf);
				}
			} catch (e) {
				// A single bad path (MAX_PATH, locked file, sync conflict) must not
				// abort the whole import and skip the metadata-write phase below.
				failedCount++;
				console.error('[Windrose] Failed to extract', destPath, e);
				onProgress?.(i + 1, plans.length, 'extract');
				continue;
			}

			// Record metadata only for files that actually landed in the vault.
			recordLanded(plan);
			onProgress?.(i + 1, plans.length, 'extract');

			if (i % 20 === 0) {
				await new Promise(r => window.setTimeout(r, 0));
			}
		}
	}

	// Classification phase. Wrapped so a failure here can never skip the
	// finalize below (folder registration + settings save + refresh event):
	// the files are already in the vault, and an unregistered half-import is
	// invisible until an app reload — worse than an unclassified-but-visible one.
	try {
	if (importTagEntries.length > 0 || ddSourceEntries.length > 0) {
		onProgress?.(textures.length, textures.length, 'metadata');
		// Snapshot of the shared store: the passes below run against it and
		// only the fields they change are merged back after the scan's await.
		const base = await ensureTileMetadataLoaded(app);
		let metadata = base;
		if (importTagEntries.length > 0) {
			metadata = bulkSetImportTags(metadata, importTagEntries);
		}
		if (ddSourceEntries.length > 0) {
			metadata = bulkSetDdSourceType(metadata, ddSourceEntries);
		}

		// Wall strip pairing: end caps + sidecar default colors.
		const wallStripEntries: Array<{ vaultPath: string; endCapPath?: string; defaultColor?: string }> = [];
		const endCapVaultPaths: string[] = [];
		for (const { vaultPath, sourceType } of ddSourceEntries) {
			if (!STRIP_SOURCE_TYPES.has(sourceType)) continue;
			const filename = vaultPath.split('/').pop() ?? '';
			if (isEndCapFilename(filename)) {
				endCapVaultPaths.push(vaultPath);
				continue;
			}
			const rel = 'textures/' + sourceType + '/' + filename;
			const capRel = endCapByStrip.get(rel);
			const endCapPath = capRel != null ? relToDest.get(capRel) : undefined;
			const defaultColor = wallSidecars.get(stemOf(filename))?.color;
			if (endCapPath != null || defaultColor != null) {
				wallStripEntries.push({ vaultPath, endCapPath, defaultColor });
			}
		}
		if (wallStripEntries.length > 0) {
			metadata = bulkSetWallStripInfo(metadata, wallStripEntries);
		}
		if (endCapVaultPaths.length > 0) {
			metadata = bulkMarkWallEndCaps(metadata, endCapVaultPaths);
		}

		// Detection scan + predictions at import — the guaranteed trigger,
		// shared with the settings folder-add path (importDetectionPass).
		// Strips are scanned too (srcH = native strip height feeds the wall
		// renderer) but never get depth/render-mode/span predictions.
		const stripPaths = new Set(
			ddSourceEntries.filter(e => STRIP_SOURCE_TYPES.has(e.sourceType)).map(e => e.vaultPath),
		);
		const writtenTiles = ddSourceEntries.map(({ vaultPath }) => ({
			id: '',
			filename: vaultPath.split('/').pop() ?? '',
			vaultPath,
			tags: [],
		}));
		if (writtenTiles.length > 0) {
			onProgress?.(textures.length, textures.length, 'scan');
			const passResult = await runImportDetectionPass(app, writtenTiles, metadata, {
				applyRenderMode: true,
				skipPredictions: stripPaths,
			});
			metadata = passResult.metadata;
		}

		// Wizard step-② confirmations outrank the automatic predictions above —
		// the user explicitly reviewed each folder's tier.
		if (wizard?.tierByFolder != null && wizard.tierByFolder.size > 0) {
			const tierEntries: Array<{ vaultPath: string; depth: TileLayerRole }> = [];
			for (const [folder, dests] of cellDestsByFolder) {
				const tier = wizard.tierByFolder.get(folder);
				if (tier == null) continue;
				for (const vaultPath of dests) tierEntries.push({ vaultPath, depth: tier });
			}
			if (tierEntries.length > 0) {
				metadata = bulkSetDepthAffinity(metadata, tierEntries);
			}
		}

		// Merges into the shared store (which notifies the renderer, so open
		// maps resolve the new per-tile render modes without a reload) and saves.
		const saved = await commitTileMetadataDelta(app, base, metadata);
		if (!saved) throw new Error('tile metadata save was refused or failed');
	}
	} catch (e) {
		console.error('[Windrose] Pack classification phase failed:', e);
		new Notice(
			'Windrose: pack files imported, but tile classification could not be saved. ' +
			'Re-import the pack to complete classification (files re-extract in place).',
			12_000
		);
	}

	const tilesetFolders = plugin.settings.tilesetFolders ?? [];
	if (!tilesetFolders.includes(basePath)) {
		tilesetFolders.push(basePath);
		plugin.settings.tilesetFolders = tilesetFolders;
	}

	const installed: InstalledPack = {
		id: meta.id,
		name: meta.name,
		type: 'object-pack',
		version: meta.version,
		installedAt: Date.now(),
		vaultPath: basePath,
	};

	plugin.settings.installedContentPacks ??= [];
	const existingIdx = plugin.settings.installedContentPacks
		.findIndex((p: InstalledPack) => p.id === meta.id);
	if (existingIdx >= 0) {
		plugin.settings.installedContentPacks[existingIdx] = installed;
	} else {
		plugin.settings.installedContentPacks.push(installed);
	}

	await plugin.saveSettings();

	window.dispatchEvent(new Event('windrose-settings-changed'));

	return {
		imported: relToDest.size,
		failed: failedCount + skipped.length,
		skipped,
		total: textures.length,
		packName: meta.name,
		cancelled,
		...(opts.bundle !== false ? { looseReplaced, looseKept, looseKeptReasons, looseKeptPermanentDelete } : {}),
	};
}

/**
 * Run the full Dungeondraft pack import (runDdImportUnlocked), one run per
 * pack folder at a time: a second run for the same pack while one is in
 * flight is refused with an error result and touches nothing.
 */
async function runDdImport(
	app: App,
	plugin: PluginLike,
	source: PckSource,
	archive: PckArchive,
	meta: DungeondraftPackMeta,
	onProgress?: DdProgressFn,
	wizard?: DdWizardDecisions,
	isCancelled?: () => boolean,
	opts: DdImportOptions = {},
): Promise<DdImportResult> {
	const basePath = packBasePath(meta);
	if (importsInFlight.has(basePath)) {
		return {
			imported: 0,
			failed: 0,
			skipped: [],
			total: listTextureEntries(archive).length,
			packName: meta.name,
			cancelled: false,
			error: 'another import of this pack is still running; wait for it to finish and try again',
		};
	}
	const run = runDdImportUnlocked(app, plugin, source, archive, meta, onProgress, wizard, isCancelled, opts);
	importsInFlight.set(basePath, run);
	try {
		return await run;
	} finally {
		importsInFlight.delete(basePath);
	}
}

export {
	runDdImport,
	countAssets,
	toRelativeTexturePath,
	pairWallEndCaps,
	sourceTypeOf,
	stemOf,
	isEndCapFilename,
	destFolderOf,
	analyzePckForWizard,
};
export type { PluginLike, PckWizardAnalysis, DdWizardDecisions, DdImportOptions, DdImportResult };

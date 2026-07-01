/**
 * ddImportCore.ts
 *
 * Headless Dungeondraft pack import pipeline, extracted from
 * DungeondraftImportModal so it can be unit-tested and driven without UI.
 * The modal is a thin shell over runDdImport().
 */

import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import type { PluginSettings } from '#types/settings/settings.types';
import type { InstalledPack } from '#types/content-packs/contentPack.types';
import type { PckArchive } from './pckParser';
import { extractFileData } from './pckParser';
import type { DungeondraftPackMeta } from './pckMetadata';
import { parseDungeondraftTags, parseWallSidecars } from './pckMetadata';
import { CONTENT_PACKS_FOLDER } from './contentPackConstants';
import {
	loadTileMetadata,
	bulkSetImportTags,
	bulkSetDdSourceType,
	bulkSetWallStripInfo,
	bulkMarkWallEndCaps,
	saveTileMetadata,
	setTileMetadataForRender,
} from '../persistence/tileMetadata';
import { runImportDetectionPass } from '../assets/importDetectionPass';

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
	other: number;
	total: number;
}

/** DD source directories whose textures are line-strip assets, not cell tiles. */
const STRIP_SOURCE_TYPES = new Set(['walls', 'paths']);

const TEXTURE_DIRS = ['objects', 'patterns', 'terrain', 'walls', 'paths'] as const;

function countAssets(archive: PckArchive): AssetCounts {
	const counts: AssetCounts = { objects: 0, patterns: 0, terrain: 0, walls: 0, paths: 0, other: 0, total: 0 };
	for (const f of archive.files) {
		if (!f.path.endsWith('.webp') && !f.path.endsWith('.png')) continue;
		if (f.path.includes('/thumbnails/')) continue;
		if (f.path.includes('/textures/objects/')) counts.objects++;
		else if (f.path.includes('/textures/patterns/')) counts.patterns++;
		else if (f.path.includes('/textures/terrain/')) counts.terrain++;
		else if (f.path.includes('/textures/walls/')) counts.walls++;
		else if (f.path.includes('/textures/paths/')) counts.paths++;
		else counts.other++;
	}
	counts.total = counts.objects + counts.patterns + counts.terrain + counts.walls + counts.paths + counts.other;
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

async function ensureFolder(app: App, path: string): Promise<void> {
	const parts = path.split('/');
	let current = '';
	for (const part of parts) {
		current = current === '' ? part : current + '/' + part;
		try { await app.vault.createFolder(current); } catch { /* exists */ }
	}
}

interface DdImportResult {
	imported: number;
	failed: number;
	total: number;
	packName: string;
}

type DdProgressFn = (done: number, total: number, stage: string) => void;

/**
 * Run the full Dungeondraft pack import: extract textures into the vault,
 * write tile metadata (tags, source types, depth/render-mode/span predictions,
 * wall strip pairing), register the tileset folder, and record the installed pack.
 */
async function runDdImport(
	app: App,
	plugin: PluginLike,
	buffer: ArrayBuffer,
	archive: PckArchive,
	meta: DungeondraftPackMeta,
	onProgress?: DdProgressFn,
): Promise<DdImportResult> {
	const basePath = CONTENT_PACKS_FOLDER + '/dungeondraft-packs/' + meta.id;
	await ensureFolder(app, basePath);

	const textures = archive.files.filter(f => {
		if (!f.path.endsWith('.webp') && !f.path.endsWith('.png')) return false;
		if (f.path.includes('/thumbnails/')) return false;
		return TEXTURE_DIRS.some(dir => f.path.includes('/textures/' + dir + '/'));
	});

	const tags = parseDungeondraftTags(buffer, archive);
	const pathToFirstTag = new Map<string, string>();
	const pathToAllTags = new Map<string, string[]>();
	if (tags != null) {
		for (const [tag, paths] of Object.entries(tags.tags)) {
			for (const p of paths) {
				if (!pathToFirstTag.has(p)) {
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

	const wallSidecars = parseWallSidecars(buffer, archive);
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
	let failedCount = 0;

	for (let i = 0; i < textures.length; i++) {
		const entry = textures[i];
		const relativePath = toRelativeTexturePath(entry.path);
		const filename = entry.path.split('/').pop() ?? 'unknown';
		const sourceType = sourceTypeOf(relativePath);
		const isStrip = sourceType != null && STRIP_SOURCE_TYPES.has(sourceType);

		const tag = pathToFirstTag.get(relativePath);
		let destPath: string;
		if (isStrip) {
			// Walls/paths always land in their source-type folder so `_end` caps
			// stay beside their strips; DD tags would scatter the pairing.
			destPath = basePath + '/' + sourceType + '/' + filename;
		} else if (tag != null) {
			const safeTag = tag.replace(/[\\:*?"<>|]/g, '_');
			destPath = basePath + '/' + safeTag + '/' + filename;
		} else {
			const parts = relativePath.split('/');
			const category = parts.length > 2 ? parts.slice(1, -1).join('/') : parts[0] ?? 'misc';
			destPath = basePath + '/' + category + '/' + filename;
		}

		try {
			const parentDir = destPath.substring(0, destPath.lastIndexOf('/'));
			await ensureFolder(app, parentDir);

			const data = extractFileData(buffer, entry);
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
			onProgress?.(i + 1, textures.length, 'extract');
			continue;
		}

		// Record metadata only for files that actually landed in the vault.
		relToDest.set(relativePath, destPath);
		const allTags = pathToAllTags.get(relativePath);
		if (allTags != null && allTags.length > 0) {
			importTagEntries.push({ vaultPath: destPath, tags: allTags });
		}
		if (sourceType != null) {
			ddSourceEntries.push({ vaultPath: destPath, sourceType });
		}

		onProgress?.(i + 1, textures.length, 'extract');

		if (i % 20 === 0) {
			await new Promise(r => window.setTimeout(r, 0));
		}
	}

	if (importTagEntries.length > 0 || ddSourceEntries.length > 0) {
		onProgress?.(textures.length, textures.length, 'metadata');
		let metadata = await loadTileMetadata(app);
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

		await saveTileMetadata(app, metadata);
		// Push the freshly-written store into the renderer's accessor so any
		// open map resolves the new per-tile render modes without a full reload.
		setTileMetadataForRender(metadata);
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
		imported: textures.length - failedCount,
		failed: failedCount,
		total: textures.length,
		packName: meta.name,
	};
}

export {
	runDdImport,
	countAssets,
	toRelativeTexturePath,
	pairWallEndCaps,
	sourceTypeOf,
	stemOf,
	isEndCapFilename,
	STRIP_SOURCE_TYPES,
};
export type { AssetCounts, DdImportResult, DdProgressFn, PluginLike };

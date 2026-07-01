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
import type { TileLayerRole } from '#types/tiles/tile.types';
import type { PckArchive } from './pckParser';
import { extractFileData } from './pckParser';
import type { DungeondraftPackMeta } from './pckMetadata';
import { parseDungeondraftTags, parseWallSidecars } from './pckMetadata';
import { CONTENT_PACKS_FOLDER } from './contentPackConstants';
import {
	loadTileMetadata,
	bulkSetImportTags,
	bulkSetDdSourceType,
	bulkSetDepthAffinity,
	bulkSetRenderMode,
	bulkSetDetectionSignals,
	bulkSetDefaultSpan,
	bulkSetWallStripInfo,
	bulkMarkWallEndCaps,
	saveTileMetadata,
	setTileMetadataForRender,
} from '../persistence/tileMetadata';
import { predictDepthTier } from '../assets/depthPredictor';
import { predictRenderMode } from '../assets/renderModePredictor';
import { runDetectionScan } from '../assets/tileImageScan';
import { predictSpan, DEFAULT_PIXELS_PER_CELL } from '../assets/spanPredictor';

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

		// Cell-tile predictions (depth, render mode, span) never apply to
		// wall/path strips — they are line assets, not cell tiles.
		const cellEntries = ddSourceEntries.filter(e => !STRIP_SOURCE_TYPES.has(e.sourceType));

		const depthEntries: Array<{ vaultPath: string; depth: TileLayerRole }> = [];
		for (const { vaultPath } of cellEntries) {
			const tile = { id: '', filename: vaultPath.split('/').pop() ?? '', vaultPath, tags: [] };
			const entry = metadata[vaultPath];
			const { tier, confidence } = predictDepthTier(tile, entry);
			if (confidence >= 0.4) {
				depthEntries.push({ vaultPath, depth: tier });
			}
		}
		if (depthEntries.length > 0) {
			metadata = bulkSetDepthAffinity(metadata, depthEntries);
		}
		// Predict render mode from ddSourceType (terrain/patterns -> region).
		// Pixel-based refinement happens later via the browser's eager scan.
		const renderModeEntries: Array<{ vaultPath: string; mode: 'region' }> = [];
		for (const { vaultPath } of cellEntries) {
			const tile = { id: '', filename: vaultPath.split('/').pop() ?? '', vaultPath, tags: [] };
			const { mode, confidence } = predictRenderMode(tile, metadata[vaultPath]);
			if (mode === 'region' && confidence >= 0.5) {
				renderModeEntries.push({ vaultPath, mode: 'region' });
			}
		}
		if (renderModeEntries.length > 0) {
			metadata = bulkSetRenderMode(metadata, renderModeEntries);
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

		// Bake detection signals + footprint at import — the guaranteed trigger.
		// Decoupled from the browser's lazy scan so signals exist even if the
		// tile browser is never opened. Footprint uses the source size ÷ DD's
		// 256px authoring spec; region tiles tile seamlessly and are skipped.
		// Strips are scanned too (srcH = native strip height feeds the wall
		// renderer) but never get span predictions.
		const writtenPaths = ddSourceEntries.map(e => e.vaultPath);
		const stripPaths = new Set(
			ddSourceEntries.filter(e => STRIP_SOURCE_TYPES.has(e.sourceType)).map(e => e.vaultPath),
		);
		if (writtenPaths.length > 0) {
			onProgress?.(textures.length, textures.length, 'scan');
			const scanned = await runDetectionScan(app, writtenPaths, { concurrency: 4 });
			if (scanned.length > 0) {
				metadata = bulkSetDetectionSignals(metadata, scanned);
				const spanEntries: Array<{ vaultPath: string; spanW: number; spanH: number }> = [];
				for (const { vaultPath, signals } of scanned) {
					if (metadata[vaultPath]?.renderMode === 'region') continue;
					if (stripPaths.has(vaultPath)) continue;
					const { spanW, spanH } = predictSpan(signals.naturalW, signals.naturalH, DEFAULT_PIXELS_PER_CELL);
					if (spanW > 1 || spanH > 1) spanEntries.push({ vaultPath, spanW, spanH });
				}
				if (spanEntries.length > 0) {
					metadata = bulkSetDefaultSpan(metadata, spanEntries);
				}
			}
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

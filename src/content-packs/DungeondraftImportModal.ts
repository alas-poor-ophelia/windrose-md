import { Modal, Notice, TFile } from 'obsidian';
import type { App } from 'obsidian';
import type { PluginSettings } from '#types/settings/settings.types';
import type { InstalledPack } from '#types/content-packs/contentPack.types';
import type { TileLayerRole } from '#types/tiles/tile.types';
import { parsePck, extractFileData } from './pckParser';
import type { PckArchive } from './pckParser';
import { parsePackMetadata, parseDungeondraftTags } from './pckMetadata';
import type { DungeondraftPackMeta } from './pckMetadata';
import { CONTENT_PACKS_FOLDER } from './contentPackConstants';
import { loadTileMetadata, bulkSetImportTags, bulkSetDdSourceType, bulkSetDepthAffinity, bulkSetRenderMode, bulkSetDetectionSignals, bulkSetDefaultSpan, saveTileMetadata, setTileMetadataForRender } from '../persistence/tileMetadata';
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
	other: number;
	total: number;
}

function countAssets(archive: PckArchive): AssetCounts {
	let objects = 0, patterns = 0, terrain = 0, other = 0;
	for (const f of archive.files) {
		if (!f.path.endsWith('.webp') && !f.path.endsWith('.png')) continue;
		if (f.path.includes('/thumbnails/')) continue;
		if (f.path.includes('/textures/objects/')) objects++;
		else if (f.path.includes('/textures/patterns/')) patterns++;
		else if (f.path.includes('/textures/terrain/')) terrain++;
		else other++;
	}
	return { objects, patterns, terrain, other, total: objects + patterns + terrain + other };
}

async function ensureFolder(app: App, path: string): Promise<void> {
	const parts = path.split('/');
	let current = '';
	for (const part of parts) {
		current = current === '' ? part : current + '/' + part;
		try { await app.vault.createFolder(current); } catch { /* exists */ }
	}
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

class DungeondraftImportModal extends Modal {
	private plugin: PluginLike;
	private onImported?: () => void;
	private archive: PckArchive | null = null;
	private buffer: ArrayBuffer | null = null;
	private meta: DungeondraftPackMeta | null = null;
	private importBtn: HTMLButtonElement | null = null;

	constructor(app: App, plugin: PluginLike, onImported?: () => void) {
		super(app);
		this.plugin = plugin;
		this.onImported = onImported;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('windrose-dd-import-modal');

		contentEl.createEl('h2', { text: 'Import Dungeondraft pack' });

		contentEl.createEl('p', {
			text: 'Select a .dungeondraft_pack file to import its assets as tiles. Only packs that allow third-party software access can be imported.',
			cls: 'setting-item-description',
		});

		const fileContainer = contentEl.createDiv({ cls: 'windrose-dd-import-file' });
		const fileInput = fileContainer.createEl('input', {
			type: 'file',
			attr: { accept: '.dungeondraft_pack' },
		});

		const previewArea = contentEl.createDiv({ cls: 'windrose-dd-import-preview' });
		previewArea.hide();

		const progressArea = contentEl.createDiv({ cls: 'windrose-dd-import-progress' });
		progressArea.hide();

		fileInput.addEventListener('change', (e: Event) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (file == null) return;
			void this.handleFileSelected(file, previewArea);
		});

		const buttonContainer = contentEl.createDiv({ cls: 'windrose-modal-buttons' });

		const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelBtn.onclick = () => this.close();

		this.importBtn = buttonContainer.createEl('button', {
			text: 'Import',
			cls: 'mod-cta',
		});
		this.importBtn.disabled = true;
		this.importBtn.onclick = () => {
			void this.handleImport(previewArea, progressArea, fileInput);
		};
	}

	private async handleFileSelected(file: File, previewArea: HTMLElement): Promise<void> {
		previewArea.empty();
		previewArea.show();
		this.archive = null;
		this.buffer = null;
		this.meta = null;
		if (this.importBtn) this.importBtn.disabled = true;

		previewArea.createEl('p', { text: 'Reading file...' });

		try {
			const buffer = await file.arrayBuffer();
			const archive = parsePck(buffer);
			const result = parsePackMetadata(buffer, archive);

			previewArea.empty();

			if (!result.ok) {
				previewArea.createEl('p', {
					text: result.error,
					cls: 'windrose-dd-import-error',
				});
				return;
			}

			this.archive = archive;
			this.buffer = buffer;
			this.meta = result.meta;

			this.renderPreview(previewArea, result.meta, archive);

			if (this.importBtn) this.importBtn.disabled = false;
		} catch (err: unknown) {
			previewArea.empty();
			previewArea.createEl('p', {
				text: 'Failed to read pack: ' + (err as Error).message,
				cls: 'windrose-dd-import-error',
			});
		}
	}

	private renderPreview(
		container: HTMLElement,
		meta: DungeondraftPackMeta,
		archive: PckArchive,
	): void {
		const header = container.createDiv({ cls: 'windrose-dd-import-header' });
		header.createEl('strong', { text: meta.name });
		header.createEl('span', { text: ' by ' + meta.author });
		header.createEl('span', {
			text: ' · v' + meta.version,
			cls: 'windrose-dd-import-version',
		});

		const counts = countAssets(archive);
		const details = container.createDiv({ cls: 'windrose-dd-import-details' });

		if (counts.objects > 0) {
			details.createEl('p', { text: '• ' + counts.objects + ' object texture(s)' });
		}
		if (counts.patterns > 0) {
			details.createEl('p', { text: '• ' + counts.patterns + ' pattern texture(s)' });
		}
		if (counts.terrain > 0) {
			details.createEl('p', { text: '• ' + counts.terrain + ' terrain texture(s)' });
		}
		if (counts.other > 0) {
			details.createEl('p', { text: '• ' + counts.other + ' other texture(s)' });
		}
		const extractable = counts.objects + counts.patterns + counts.terrain;
		details.createEl('p', {
			text: extractable + ' textures will be extracted to your vault.',
			cls: 'windrose-dd-import-total',
		});

		const existing = (this.plugin.settings.installedContentPacks ?? [])
			.find((p: InstalledPack) => p.id === meta.id);
		if (existing != null) {
			container.createEl('p', {
				text: 'This pack is already imported (v' + existing.version + '). Re-importing will overwrite existing files.',
				cls: 'windrose-dd-import-warning',
			});
		}

		const tags = parseDungeondraftTags(this.buffer!, archive);
		if (tags != null) {
			const tagCount = Object.keys(tags.tags).length;
			if (tagCount > 0) {
				details.createEl('p', { text: '• ' + tagCount + ' tag categor(ies)' });
			}
		}
	}

	private async handleImport(
		previewArea: HTMLElement,
		progressArea: HTMLElement,
		fileInput: HTMLInputElement,
	): Promise<void> {
		if (this.archive == null || this.buffer == null || this.meta == null) return;
		if (this.importBtn == null) return;

		this.importBtn.disabled = true;
		this.importBtn.textContent = 'Importing...';
		fileInput.disabled = true;
		previewArea.hide();
		progressArea.show();

		const progressBar = progressArea.createEl('progress', {
			attr: { max: '100', value: '0' },
		});
		progressBar.setCssStyles({ width: '100%' });
		const statusText = progressArea.createEl('p', { text: 'Preparing...' });

		try {
			const basePath = CONTENT_PACKS_FOLDER + '/dungeondraft-packs/' + this.meta.id;
			await ensureFolder(this.app, basePath);

			const textures = this.archive.files.filter(f => {
				if (!f.path.endsWith('.webp') && !f.path.endsWith('.png')) return false;
				if (f.path.includes('/thumbnails/')) return false;
				return f.path.includes('/textures/objects/')
					|| f.path.includes('/textures/patterns/')
					|| f.path.includes('/textures/terrain/');
			});

			const tags = parseDungeondraftTags(this.buffer, this.archive);
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

			const importTagEntries: Array<{ vaultPath: string; tags: string[] }> = [];
			const ddSourceEntries: Array<{ vaultPath: string; sourceType: string }> = [];
			let failedCount = 0;

			for (let i = 0; i < textures.length; i++) {
				const entry = textures[i];
				const relativePath = toRelativeTexturePath(entry.path);
				const filename = entry.path.split('/').pop() ?? 'unknown';

				const tagKey = relativePath;
				const tag = pathToFirstTag.get(tagKey);
				let destPath: string;
				if (tag != null) {
					const safeTag = tag.replace(/[\\:*?"<>|]/g, '_');
					destPath = basePath + '/' + safeTag + '/' + filename;
				} else {
					const parts = relativePath.split('/');
					const category = parts.length > 2 ? parts.slice(1, -1).join('/') : parts[0] ?? 'misc';
					destPath = basePath + '/' + category + '/' + filename;
				}

				try {
					const parentDir = destPath.substring(0, destPath.lastIndexOf('/'));
					await ensureFolder(this.app, parentDir);

					const data = extractFileData(this.buffer, entry);
					const arrayBuf = new ArrayBuffer(data.byteLength);
					new Uint8Array(arrayBuf).set(data);
					const existing = this.app.vault.getAbstractFileByPath(destPath);
					if (existing instanceof TFile) {
						await this.app.vault.modifyBinary(existing, arrayBuf);
					} else {
						await this.app.vault.createBinary(destPath, arrayBuf);
					}
				} catch (e) {
					// A single bad path (MAX_PATH, locked file, sync conflict) must not
					// abort the whole import and skip the metadata-write phase below.
					failedCount++;
					// eslint-disable-next-line no-console
					console.error('[Windrose] Failed to extract', destPath, e);
					const failPct = Math.round(((i + 1) / textures.length) * 100);
					progressBar.value = failPct;
					statusText.textContent = 'Extracting: ' + (i + 1) + '/' + textures.length + ' (' + failPct + '%)';
					continue;
				}

				// Record metadata only for files that actually landed in the vault.
				const allTags = pathToAllTags.get(tagKey);
				if (allTags != null && allTags.length > 0) {
					importTagEntries.push({ vaultPath: destPath, tags: allTags });
				}
				const srcMatch = relativePath.match(/^textures\/(\w+)\//);
				if (srcMatch != null) {
					ddSourceEntries.push({ vaultPath: destPath, sourceType: srcMatch[1] });
				}

				const pct = Math.round(((i + 1) / textures.length) * 100);
				progressBar.value = pct;
				statusText.textContent = 'Extracting: ' + (i + 1) + '/' + textures.length + ' (' + pct + '%)';

				if (i % 20 === 0) {
					await new Promise(r => window.setTimeout(r, 0));
				}
			}

			if (importTagEntries.length > 0 || ddSourceEntries.length > 0) {
				statusText.textContent = 'Saving tag metadata...';
				let metadata = await loadTileMetadata(this.app);
				if (importTagEntries.length > 0) {
					metadata = bulkSetImportTags(metadata, importTagEntries);
				}
				if (ddSourceEntries.length > 0) {
					metadata = bulkSetDdSourceType(metadata, ddSourceEntries);
				}
				const depthEntries: Array<{ vaultPath: string; depth: TileLayerRole }> = [];
				for (const { vaultPath } of ddSourceEntries) {
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
				for (const { vaultPath } of ddSourceEntries) {
					const tile = { id: '', filename: vaultPath.split('/').pop() ?? '', vaultPath, tags: [] };
					const { mode, confidence } = predictRenderMode(tile, metadata[vaultPath]);
					if (mode === 'region' && confidence >= 0.5) {
						renderModeEntries.push({ vaultPath, mode: 'region' });
					}
				}
				if (renderModeEntries.length > 0) {
					metadata = bulkSetRenderMode(metadata, renderModeEntries);
				}

				// Bake detection signals + footprint at import — the guaranteed trigger.
				// Decoupled from the browser's lazy scan so signals exist even if the
				// tile browser is never opened. Footprint uses the source size ÷ DD's
				// 256px authoring spec; region tiles tile seamlessly and are skipped.
				const writtenPaths = ddSourceEntries.map(e => e.vaultPath);
				if (writtenPaths.length > 0) {
					statusText.textContent = 'Analyzing tile footprints...';
					const scanned = await runDetectionScan(this.app, writtenPaths, { concurrency: 4 });
					if (scanned.length > 0) {
						metadata = bulkSetDetectionSignals(metadata, scanned);
						const spanEntries: Array<{ vaultPath: string; spanW: number; spanH: number }> = [];
						for (const { vaultPath, signals } of scanned) {
							if (metadata[vaultPath]?.renderMode === 'region') continue;
							const { spanW, spanH } = predictSpan(signals.naturalW, signals.naturalH, DEFAULT_PIXELS_PER_CELL);
							if (spanW > 1 || spanH > 1) spanEntries.push({ vaultPath, spanW, spanH });
						}
						if (spanEntries.length > 0) {
							metadata = bulkSetDefaultSpan(metadata, spanEntries);
						}
					}
				}

				await saveTileMetadata(this.app, metadata);
				// Push the freshly-written store into the renderer's accessor so any
				// open map resolves the new per-tile render modes without a full reload.
				setTileMetadataForRender(metadata);
			}

			const tilesetFolders = this.plugin.settings.tilesetFolders ?? [];
			if (!tilesetFolders.includes(basePath)) {
				tilesetFolders.push(basePath);
				this.plugin.settings.tilesetFolders = tilesetFolders;
			}

			const installed: InstalledPack = {
				id: this.meta.id,
				name: this.meta.name,
				type: 'object-pack',
				version: this.meta.version,
				installedAt: Date.now(),
				vaultPath: basePath,
			};

			if (this.plugin.settings.installedContentPacks == null) {
				this.plugin.settings.installedContentPacks = [];
			}
			const existingIdx = this.plugin.settings.installedContentPacks
				.findIndex((p: InstalledPack) => p.id === this.meta!.id);
			if (existingIdx >= 0) {
				this.plugin.settings.installedContentPacks[existingIdx] = installed;
			} else {
				this.plugin.settings.installedContentPacks.push(installed);
			}

			await this.plugin.saveSettings();

			window.dispatchEvent(new Event('windrose-settings-changed'));

			progressArea.empty();
			progressArea.createEl('p', {
				text: 'Imported ' + (textures.length - failedCount) + ' of ' + textures.length + ' textures from ' + this.meta.name + '.'
						+ (failedCount > 0 ? ' ' + failedCount + ' file(s) failed (see developer console).' : ''),
				cls: failedCount > 0 ? 'windrose-dd-import-warning' : 'windrose-dd-import-success',
			});

			new Notice(this.meta.name + ' imported (' + (textures.length - failedCount) + '/' + textures.length + ' textures' + (failedCount > 0 ? ', ' + failedCount + ' failed' : '') + ').');

			if (this.importBtn) {
				this.importBtn.textContent = 'Done';
				this.importBtn.onclick = () => this.close();
				this.importBtn.disabled = false;
			}
		} catch (err: unknown) {
			progressArea.empty();
			progressArea.createEl('p', {
				text: 'Import failed: ' + (err as Error).message,
				cls: 'windrose-dd-import-error',
			});
			console.error('[Windrose] Dungeondraft import failed:', err);

			if (this.importBtn) {
				this.importBtn.textContent = 'Import';
				this.importBtn.disabled = false;
			}
			fileInput.disabled = false;
			previewArea.show();
		}
	}

	onClose(): void {
		this.buffer = null;
		this.archive = null;
		this.meta = null;
		this.contentEl.empty();
		if (this.onImported != null) {
			this.onImported();
		}
	}
}

export { DungeondraftImportModal, countAssets };
export type { AssetCounts };

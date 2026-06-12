import { Modal, Notice } from 'obsidian';
import type { App } from 'obsidian';
import type { InstalledPack } from '#types/content-packs/contentPack.types';
import { parsePck } from './pckParser';
import type { PckArchive } from './pckParser';
import { parsePackMetadata, parseDungeondraftTags } from './pckMetadata';
import type { DungeondraftPackMeta } from './pckMetadata';
import { runDdImport, countAssets } from './ddImportCore';
import type { AssetCounts, PluginLike } from './ddImportCore';

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

		contentEl.createEl('h2', { text: 'Import Dungeondraft Pack' });

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
		previewArea.style.display = 'none';

		const progressArea = contentEl.createDiv({ cls: 'windrose-dd-import-progress' });
		progressArea.style.display = 'none';

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
		}) as HTMLButtonElement;
		this.importBtn.disabled = true;
		this.importBtn.onclick = () => {
			void this.handleImport(previewArea, progressArea, fileInput);
		};
	}

	private async handleFileSelected(file: File, previewArea: HTMLElement): Promise<void> {
		previewArea.empty();
		previewArea.style.display = 'block';
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

		const lines: Array<[number, string]> = [
			[counts.objects, 'object texture(s)'],
			[counts.patterns, 'pattern texture(s)'],
			[counts.terrain, 'terrain texture(s)'],
			[counts.walls, 'wall texture(s)'],
			[counts.paths, 'path texture(s)'],
			[counts.other, 'other texture(s)'],
		];
		for (const [count, label] of lines) {
			if (count > 0) {
				details.createEl('p', { text: '• ' + count + ' ' + label });
			}
		}
		const extractable = counts.objects + counts.patterns + counts.terrain + counts.walls + counts.paths;
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
		previewArea.style.display = 'none';
		progressArea.style.display = 'block';

		const progressBar = progressArea.createEl('progress', {
			attr: { max: '100', value: '0' },
		}) as HTMLProgressElement;
		progressBar.style.width = '100%';
		const statusText = progressArea.createEl('p', { text: 'Preparing...' });

		try {
			const result = await runDdImport(
				this.app,
				this.plugin,
				this.buffer,
				this.archive,
				this.meta,
				(done, total, stage) => {
					if (stage === 'extract') {
						const pct = Math.round((done / total) * 100);
						progressBar.value = pct;
						statusText.textContent = 'Extracting: ' + done + '/' + total + ' (' + pct + '%)';
					} else if (stage === 'metadata') {
						statusText.textContent = 'Saving tag metadata...';
					} else if (stage === 'scan') {
						statusText.textContent = 'Analyzing tile footprints...';
					}
				},
			);

			progressArea.empty();
			progressArea.createEl('p', {
				text: 'Imported ' + result.imported + ' of ' + result.total + ' textures from ' + result.packName + '.'
						+ (result.failed > 0 ? ' ' + result.failed + ' file(s) failed (see developer console).' : ''),
				cls: result.failed > 0 ? 'windrose-dd-import-warning' : 'windrose-dd-import-success',
			});

			new Notice(result.packName + ' imported (' + result.imported + '/' + result.total + ' textures' + (result.failed > 0 ? ', ' + result.failed + ' failed' : '') + ').');

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
			previewArea.style.display = 'block';
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

/**
 * runDdImport writing a tile bundle: marker + one index + shards + thumbs, no
 * loose textures, ids minted like the loose scan, metadata keyed by the
 * virtual paths, zero-byte textures skipped and reported, duplicates stored
 * once, shipped Dungeondraft thumbnails reused, and a re-run after a lost
 * index succeeds.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TileMetadataStore, TileEntry } from '#types/tiles/tile.types';
import type { PluginSettings } from '#types/settings/settings.types';
import { parsePck, md5Hex } from '../../../src/content-packs/pckParser';
import { buildPckSource } from './pckFixture';
import { makeFakeVault, putFile, fakeImage, markIndexed } from '../assets/bundles/fakeVault';
import type { FakeVault } from '../assets/bundles/fakeVault';

const committed: TileMetadataStore[] = [];
const scannedTiles: TileEntry[][] = [];
const decodeCalls: Array<{ size: number; renderThumb: boolean | undefined }> = [];
/** When true, the mocked acceptShippedThumb throws (a corrupt shipped thumbnail). */
const thumbFault = { throws: false };
/** Notice messages shown by the importer. */
const notices: string[] = [];
/** When armed, the importer's next mountBundleFolder call rejects. */
const mountFault = { armed: false };

vi.mock('obsidian', async (importOriginal) => {
	const orig = await importOriginal<typeof import('obsidian')>();
	return {
		...orig,
		Notice: class {
			constructor(message: string) { notices.push(message); }
		},
	};
});
vi.mock('../../../src/assets/bundles/bundleRegistry', async (importOriginal) => {
	const orig = await importOriginal<typeof import('../../../src/assets/bundles/bundleRegistry')>();
	return {
		...orig,
		mountBundleFolder: (app: never, folder: string) => {
			if (mountFault.armed) {
				mountFault.armed = false;
				return Promise.reject(new Error('remount exploded'));
			}
			return orig.mountBundleFolder(app, folder);
		},
	};
});

vi.mock('../../../src/persistence/tileMetadata', async (importOriginal) => {
	const orig = await importOriginal<typeof import('../../../src/persistence/tileMetadata')>();
	return {
		...orig,
		ensureTileMetadataLoaded: () => Promise.resolve({}),
		commitTileMetadataDelta: (_app: unknown, _base: unknown, next: TileMetadataStore) => {
			committed.push(next);
			return Promise.resolve(true);
		},
	};
});
vi.mock('../../../src/assets/importDetectionPass', () => ({
	runImportDetectionPass: (_app: unknown, tiles: TileEntry[], metadata: TileMetadataStore) => {
		scannedTiles.push(tiles);
		return Promise.resolve({ metadata, stats: { scanned: 0, depth: 0, region: 0, spans: 0 } });
	},
}));
vi.mock('../../../src/assets/bundles/bundleThumbs', async (importOriginal) => {
	const orig = await importOriginal<typeof import('../../../src/assets/bundles/bundleThumbs')>();
	const { fakeImage: img } = await import('../assets/bundles/fakeVault');
	const rendered = img('png', 48, 77);
	return {
		...orig,
		acceptShippedThumb: (bytes: Uint8Array) => {
			if (thumbFault.throws) throw new RangeError('Offset is outside the bounds of the DataView');
			return orig.acceptShippedThumb(bytes);
		},
		decodeTile: (bytes: Uint8Array, _mime: string, opts: { renderThumb?: boolean } = {}) => {
			decodeCalls.push({ size: bytes.byteLength, renderThumb: opts.renderThumb });
			return Promise.resolve({ dims: { w: 256, h: 256 }, thumb: opts.renderThumb === false ? null : rendered });
		},
	};
});

const { runDdImport } = await import('../../../src/content-packs/ddImportCore');
const { scanTilesetFolder } = await import('../../../src/assets/tilesetScan');
const {
	_resetBundleRegistryForTests, entriesFor, beginBundleWrite, endBundleWrite, isBundleWriteInProgress,
} = await import('../../../src/assets/bundles/bundleRegistry');
const { BundleWriter } = await import('../../../src/assets/bundles/bundleWriter');

const PACK = 'res://packs/packX';
const BASE = 'windrose-content/dungeondraft-packs/packX';
const barrel = fakeImage('webp', 300, 1);
const rockPng = fakeImage('png', 200, 2);
const rockWebp = fakeImage('webp', 200, 3);

/** A 64x40 PNG header: what Dungeondraft ships as a texture thumbnail. */
function shippedThumbPng(): Uint8Array {
	const b = fakeImage('png', 64, 9);
	b.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
	const v = new DataView(b.buffer);
	v.setUint32(16, 64);
	v.setUint32(20, 40);
	return b;
}
const shippedThumb = shippedThumbPng();

function packFiles(): Array<{ path: string; data: Uint8Array }> {
	const barrelPath = `${PACK}/textures/objects/Barrel.webp`;
	return [
		{ path: `${PACK}/pack.json`, data: new TextEncoder().encode('{}') },
		{ path: `${PACK}/textures/objects/Rock.webp`, data: rockWebp },
		{ path: barrelPath, data: barrel },
		{ path: `${PACK}/textures/objects/Empty.png`, data: new Uint8Array(0) },
		{ path: `${PACK}/textures/objects/BarrelCopy.webp`, data: barrel.slice() },
		{ path: `${PACK}/textures/objects/Rock.png`, data: rockPng },
		{ path: `${PACK}/thumbnails/${md5Hex(barrelPath)}.png`, data: shippedThumb },
	];
}

const META = { id: 'packX', name: 'Pack X', version: '1', author: 'a', allow3rdParty: true } as never;

function makePlugin(fv: FakeVault) {
	const plugin = {
		app: fv.app,
		settings: { tilesetFolders: [], installedContentPacks: [] } as unknown as PluginSettings,
		saves: 0,
		saveSettings: () => { plugin.saves++; return Promise.resolve(); },
	};
	return plugin;
}

async function importInto(
	fv: FakeVault,
	bundle = true,
	files = packFiles(),
	plugin: ReturnType<typeof makePlugin> = makePlugin(fv),
) {
	const source = buildPckSource(files);
	const archive = await parsePck(source);
	return runDdImport(fv.app, plugin, source, archive, META, undefined, undefined, undefined, { bundle });
}

const under = (fv: FakeVault, dir: string): string[] =>
	[...fv.files.keys()].filter(p => p.startsWith(`${BASE}/${dir}/`));

function containsBytes(hay: Uint8Array, needle: Uint8Array): boolean {
	outer: for (let i = 0; i + needle.length <= hay.length; i++) {
		for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
		return true;
	}
	return false;
}

const VIRTUAL = ['Barrel.webp', 'BarrelCopy.webp', 'Rock.png', 'Rock.webp'].map(f => `${BASE}/objects/${f}`);

describe('runDdImport into a tile bundle', () => {
	let warn: ReturnType<typeof vi.spyOn>;
	beforeEach(() => {
		_resetBundleRegistryForTests();
		committed.length = 0;
		scannedTiles.length = 0;
		decodeCalls.length = 0;
		thumbFault.throws = false;
		notices.length = 0;
		mountFault.armed = false;
		vi.stubGlobal('window', { setTimeout: globalThis.setTimeout, dispatchEvent: () => true });
		warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
		warn.mockRestore();
	});

	it('writes a marker, one index, shards and thumbs, and no loose textures', async () => {
		const fv = makeFakeVault();
		const res = await importInto(fv);
		expect(fv.files.has(`${BASE}/bundle.wrbundle`)).toBe(true);
		expect(under(fv, 'index').filter(p => p.endsWith('.wridx'))).toHaveLength(1);
		expect(under(fv, 'shards').length).toBeGreaterThanOrEqual(1);
		expect(under(fv, 'thumbs').length).toBeGreaterThanOrEqual(1);
		expect([...fv.files.keys()].filter(p => /\.(png|webp)$/i.test(p))).toEqual([]);
		expect(res.imported).toBe(4);
		expect(res.total).toBe(5);
	});

	it('mints the same ids the loose scan mints over the equivalent layout', async () => {
		const fv = makeFakeVault();
		await importInto(fv);
		const bundled = await scanTilesetFolder(fv.app, BASE);

		const loose = makeFakeVault();
		const layout: Array<[string, Uint8Array]> = [
			['Barrel.webp', barrel], ['BarrelCopy.webp', barrel], ['Rock.png', rockPng], ['Rock.webp', rockWebp],
		];
		for (const [name, bytes] of layout) putFile(loose, `L/objects/${name}`, bytes);
		const looseTiles = await scanTilesetFolder(loose.app, 'L');

		const byKey = (tiles: TileEntry[], root: string): Record<string, string> =>
			Object.fromEntries(tiles.map(t => [t.vaultPath.slice(root.length + 1), t.id]));
		expect(byKey(bundled, BASE)).toEqual(byKey(looseTiles, 'L'));
		expect(byKey(bundled, BASE)['objects/Rock.webp']).toBe('objects/Rock.webp');
		expect(bundled.map(t => t.category)).toEqual(['objects', 'objects', 'objects', 'objects']);
	});

	it('keys metadata and the detection pass by the virtual paths', async () => {
		const fv = makeFakeVault();
		await importInto(fv);
		expect(committed).toHaveLength(1);
		expect(Object.keys(committed[0]).sort()).toEqual(VIRTUAL);
		expect(committed[0][VIRTUAL[0]]?.ddSourceType).toBe('objects');
		expect(scannedTiles[0].map(t => t.vaultPath).sort()).toEqual(VIRTUAL);
	});

	it('skips and reports a zero-byte texture', async () => {
		const fv = makeFakeVault();
		const res = await importInto(fv);
		expect(res.skipped).toEqual([{ key: 'objects/Empty.png', reason: 'zero-byte texture' }]);
		expect(res.failed).toBe(1);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('objects/Empty.png: zero-byte texture'));
		expect(decodeCalls.some(c => c.size === 0)).toBe(false);
	});

	it('stores byte-identical textures once', async () => {
		const fv = makeFakeVault();
		await importInto(fv);
		const shardBytes = under(fv, 'shards').reduce((n, p) => n + (fv.files.get(p)?.byteLength ?? 0), 0);
		const unique = barrel.byteLength + rockPng.byteLength + rockWebp.byteLength;
		expect(shardBytes).toBeGreaterThanOrEqual(unique);
		expect(shardBytes).toBeLessThan(unique + barrel.byteLength);
	});

	it('reuses a shipped thumbnail and renders the rest', async () => {
		const fv = makeFakeVault();
		await importInto(fv);
		const thumbShards = under(fv, 'thumbs').map(p => fv.files.get(p) ?? new Uint8Array(0));
		expect(thumbShards.some(b => containsBytes(b, shippedThumb))).toBe(true);
		expect(decodeCalls.find(c => c.size === barrel.byteLength && c.renderThumb === false)).toBeDefined();
		expect(decodeCalls.filter(c => c.renderThumb !== false)).toHaveLength(3);
	});

	it('succeeds when re-run after the index was lost', async () => {
		const fv = makeFakeVault();
		await importInto(fv);
		const [index] = under(fv, 'index');
		const shards = under(fv, 'shards').sort();
		fv.files.delete(index);
		_resetBundleRegistryForTests();
		const res = await importInto(fv);
		expect(res.imported).toBe(4);
		expect(under(fv, 'index').filter(p => p.endsWith('.wridx'))).toHaveLength(1);
		expect(under(fv, 'shards').sort()).toEqual(shards);
		expect((await scanTilesetFolder(fv.app, BASE)).map(t => t.id).sort())
			.toEqual(['objects/Barrel', 'objects/BarrelCopy', 'objects/Rock', 'objects/Rock.webp']);
	});

	it('keeps the loose path behind bundle: false', async () => {
		const fv = makeFakeVault();
		const res = await importInto(fv, false);
		expect(fv.files.has(`${BASE}/bundle.wrbundle`)).toBe(false);
		expect(fv.files.has(`${BASE}/objects/Barrel.webp`)).toBe(true);
		expect(res.imported).toBe(5);
	});
	it('replaces an earlier loose import only after the bundle serves each key, keeping unknown loose files', async () => {
		const fv = makeFakeVault();
		const loose: Array<[string, Uint8Array]> = [
			['objects/Barrel.webp', barrel], ['objects/BarrelCopy.webp', barrel],
			['objects/Rock.png', rockPng], ['objects/Rock.webp', rockWebp], ['terrain/Old.png', fakeImage('png', 90, 5)],
		];
		for (const [rel, bytes] of loose) {
			putFile(fv, `${BASE}/${rel}`, bytes);
			markIndexed(fv, `${BASE}/${rel}`);
		}
		markIndexed(fv, `${BASE}/objects`);
		markIndexed(fv, `${BASE}/terrain`);
		const seenAtTrash: Array<{ path: string; state: string; served: boolean; writing: boolean }> = [];
		fv.trashHook = (path: string) => {
			const view = entriesFor(BASE);
			seenAtTrash.push({
				path,
				state: view.state,
				served: view.entries.some(e => `${BASE}/${e.key}` === path && !e.pending),
				writing: isBundleWriteInProgress(BASE),
			});
		};
		const plugin = makePlugin(fv);
		plugin.settings.tilesetFolders = [BASE];
		const res = await importInto(fv, true, packFiles(), plugin);

		expect(res.error).toBeUndefined();
		expect(res.looseReplaced).toBe(4);
		expect(res.looseKept).toEqual(['terrain/Old.png']);
		const trashedFiles = seenAtTrash.filter(t => /\.(png|webp)$/.test(t.path));
		expect(trashedFiles.map(t => t.path).sort()).toEqual(VIRTUAL);
		expect(trashedFiles.every(t => t.state === 'mounted' && t.served && t.writing)).toBe(true);
		expect(fv.trashed).toContain(`${BASE}/objects`);
		expect(fv.trashed).not.toContain(`${BASE}/terrain`);
		expect(fv.files.has(`${BASE}/terrain/Old.png`)).toBe(true);
		expect(isBundleWriteInProgress(BASE)).toBe(false);
		const tiles = await scanTilesetFolder(fv.app, BASE);
		expect(tiles.map(t => t.vaultPath).sort()).toEqual([...VIRTUAL, `${BASE}/terrain/Old.png`].sort());
		expect(plugin.settings.tilesetFolders).toEqual([BASE]);
	});

	it('trashes nothing when the commit fails, registers nothing, and names the error', async () => {
		const fv = makeFakeVault();
		putFile(fv, `${BASE}/objects/Rock.png`, rockPng);
		markIndexed(fv, `${BASE}/objects/Rock.png`);
		vi.spyOn(BundleWriter.prototype, 'finish').mockRejectedValueOnce(new Error('disk full'));
		const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const plugin = makePlugin(fv);
		const res = await importInto(fv, true, packFiles(), plugin);
		expect(res.error).toBe('the tile bundle could not be written (disk full)');
		expect(res.imported).toBe(0);
		expect(plugin.settings.tilesetFolders).toEqual([]);
		expect(plugin.settings.installedContentPacks).toEqual([]);
		expect(plugin.saves).toBe(0);
		expect(committed).toHaveLength(0);
		expect(fv.trashed).toEqual([]);
		expect(fv.files.has(`${BASE}/objects/Rock.png`)).toBe(true);
		expect(isBundleWriteInProgress(BASE)).toBe(false);
		err.mockRestore();
	});

	it('registers nothing when every texture was skipped', async () => {
		const fv = makeFakeVault();
		const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const plugin = makePlugin(fv);
		const res = await importInto(fv, true, [
			{ path: `${PACK}/pack.json`, data: new TextEncoder().encode('{}') },
			{ path: `${PACK}/textures/objects/Empty.png`, data: new Uint8Array(0) },
			{ path: `${PACK}/textures/objects/Junk.png`, data: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]) },
		], plugin);
		expect(res.error).toBe('no texture could be bundled');
		expect(res.skipped.map(x => x.key).sort()).toEqual(['objects/Empty.png', 'objects/Junk.png']);
		expect(plugin.settings.tilesetFolders).toEqual([]);
		expect(plugin.settings.installedContentPacks).toEqual([]);
		expect(plugin.saves).toBe(0);
		expect(fv.files.has(`${BASE}/bundle.wrbundle`)).toBe(false);
		err.mockRestore();
	});

	it('keeps a tile whose shipped thumbnail is corrupt and renders its thumb instead', async () => {
		const fv = makeFakeVault();
		thumbFault.throws = true;
		const res = await importInto(fv);
		expect(res.error).toBeUndefined();
		expect(res.imported).toBe(4);
		expect(decodeCalls.filter(c => c.renderThumb !== false)).toHaveLength(4);
		const thumbShards = under(fv, 'thumbs').map(p => fv.files.get(p) ?? new Uint8Array(0));
		expect(thumbShards.some(b => containsBytes(b, shippedThumb))).toBe(false);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('Shipped thumbnail unreadable'), 'objects/Barrel.webp', expect.anything(), expect.anything());
	});
});

describe('bundle write-in-progress guard (vault watcher)', () => {
	beforeEach(() => { _resetBundleRegistryForTests(); });

	it('covers the folder and files under it until the matching end, and nests', () => {
		expect(isBundleWriteInProgress(BASE)).toBe(false);
		beginBundleWrite(BASE + '/');
		beginBundleWrite(BASE);
		expect(isBundleWriteInProgress(BASE)).toBe(true);
		expect(isBundleWriteInProgress(`${BASE}/shards/abc.wrshard`)).toBe(true);
		expect(isBundleWriteInProgress(`${BASE}2`)).toBe(false);
		endBundleWrite(BASE);
		expect(isBundleWriteInProgress(BASE)).toBe(true);
		endBundleWrite(BASE);
		expect(isBundleWriteInProgress(BASE)).toBe(false);
		endBundleWrite(BASE);
		expect(isBundleWriteInProgress(BASE)).toBe(false);
	});
});

describe('retiring an earlier loose import', () => {
	let warn: ReturnType<typeof vi.spyOn>;
	let err: ReturnType<typeof vi.spyOn>;
	beforeEach(() => {
		_resetBundleRegistryForTests();
		committed.length = 0;
		scannedTiles.length = 0;
		notices.length = 0;
		mountFault.armed = false;
		vi.stubGlobal('window', { setTimeout: globalThis.setTimeout, dispatchEvent: () => true });
		warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
	});
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	/** Put loose files (folder-relative) under BASE and index them and their folders. */
	function seedLoose(fv: FakeVault, entries: Array<[string, Uint8Array]>): void {
		for (const [rel, bytes] of entries) {
			putFile(fv, `${BASE}/${rel}`, bytes);
			markIndexed(fv, `${BASE}/${rel}`);
			markIndexed(fv, `${BASE}/${rel.slice(0, rel.lastIndexOf('/'))}`);
		}
	}
	const THREE: Array<[string, Uint8Array]> = [
		['objects/Barrel.webp', barrel], ['objects/Rock.png', rockPng], ['objects/Rock.webp', rockWebp],
	];

	it('trashes a loose file whose bytes the bundle serves identically, keeping them recoverable', async () => {
		const fv = makeFakeVault();
		seedLoose(fv, [['objects/Rock.png', rockPng]]);
		const res = await importInto(fv);
		expect(res.looseReplaced).toBe(1);
		expect(res.looseKept).toEqual([]);
		expect(fv.files.has(`${BASE}/objects/Rock.png`)).toBe(false);
		expect(fv.files.get(`.trash/${BASE}/objects/Rock.png`)).toEqual(rockPng);
		expect(notices).toEqual([]);
	});

	it('keeps a loose file whose bytes differ from the bundle (reason differs) and says so once', async () => {
		const fv = makeFakeVault();
		const edited = fakeImage('png', 200, 99);
		seedLoose(fv, [['objects/Rock.png', edited], ['objects/Rock.webp', rockWebp]]);
		const res = await importInto(fv);
		expect(res.looseReplaced).toBe(1);
		expect(res.looseKept).toEqual(['objects/Rock.png']);
		expect(res.looseKeptReasons).toEqual([{ path: 'objects/Rock.png', reason: 'differs' }]);
		expect(fv.files.get(`${BASE}/objects/Rock.png`)).toEqual(edited);
		expect(fv.trashed).not.toContain(`${BASE}/objects/Rock.png`);
		expect(notices).toHaveLength(1);
		expect(notices[0]).toContain('kept 1 loose file');
		expect(notices[0]).toContain('Rock.png');
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('differs (1):'));
	});

	it('keeps loose files the bundle cannot actually read back (reason not-served)', async () => {
		const fv = makeFakeVault();
		seedLoose(fv, THREE);
		// The shards vanish after the commit: the index still lists every key.
		const finish = BundleWriter.prototype.finish;
		vi.spyOn(BundleWriter.prototype, 'finish').mockImplementation(async function (this: InstanceType<typeof BundleWriter>) {
			const out = await finish.call(this);
			for (const p of under(fv, 'shards')) fv.files.delete(p);
			return out;
		});
		const res = await importInto(fv);
		expect(res.error).toBeUndefined();
		expect(res.looseReplaced).toBe(0);
		expect(res.looseKeptReasons?.map(k => k.reason)).toEqual(['not-served', 'not-served', 'not-served']);
		for (const [rel] of THREE) expect(fv.files.has(`${BASE}/${rel}`)).toBe(true);
		expect(fv.trashed).toEqual([]);
	});

	it('keeps the one file the trash refuses and still trashes the rest and registers', async () => {
		const fv = makeFakeVault();
		seedLoose(fv, THREE);
		fv.trashFails.add(`${BASE}/objects/Rock.png`);
		const plugin = makePlugin(fv);
		const res = await importInto(fv, true, packFiles(), plugin);
		expect(res.looseReplaced).toBe(2);
		expect(res.looseKeptReasons).toEqual([{ path: 'objects/Rock.png', reason: 'trash-failed' }]);
		expect(fv.trashed).toEqual([`${BASE}/objects/Barrel.webp`, `${BASE}/objects/Rock.webp`]);
		expect(fv.files.has(`${BASE}/objects/Rock.png`)).toBe(true);
		expect(plugin.settings.tilesetFolders).toEqual([BASE]);
		expect(plugin.saves).toBe(1);
		expect(err).toHaveBeenCalled();
	});

	it('trashes nothing when the run was cancelled, and still registers the partial bundle', async () => {
		const fv = makeFakeVault();
		seedLoose(fv, THREE);
		const plugin = makePlugin(fv);
		const source = buildPckSource(packFiles());
		const archive = await parsePck(source);
		let polls = 0;
		const res = await runDdImport(fv.app, plugin, source, archive, META, undefined, undefined, () => ++polls > 2, {});
		expect(res.cancelled).toBe(true);
		expect(res.imported).toBeGreaterThan(0);
		expect(res.looseReplaced).toBe(0);
		expect(fv.trashed).toEqual([]);
		for (const [rel] of THREE) expect(fv.files.has(`${BASE}/${rel}`)).toBe(true);
		expect(plugin.settings.tilesetFolders).toEqual([BASE]);
	});

	it('registers even when the remount after retirement throws', async () => {
		const fv = makeFakeVault();
		seedLoose(fv, [['objects/Rock.png', rockPng]]);
		fv.trashHook = () => { mountFault.armed = true; };
		const plugin = makePlugin(fv);
		const res = await importInto(fv, true, packFiles(), plugin);
		expect(res.looseReplaced).toBe(1);
		expect(plugin.settings.tilesetFolders).toEqual([BASE]);
		expect(plugin.settings.installedContentPacks).toHaveLength(1);
		expect(plugin.saves).toBe(1);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('Remount after retiring loose files failed'), BASE, expect.anything());
	});

	it('keeps every loose file when the trash setting deletes permanently', async () => {
		const fv = makeFakeVault();
		seedLoose(fv, THREE);
		fv.config.trashOption = 'none';
		const res = await importInto(fv);
		expect(res.looseReplaced).toBe(0);
		expect(res.looseKeptPermanentDelete).toBe(3);
		expect(fv.trashed).toEqual([]);
		for (const [rel] of THREE) expect(fv.files.has(`${BASE}/${rel}`)).toBe(true);
	});

	it('still retires through the trash when vault.getConfig is unavailable', async () => {
		const fv = makeFakeVault();
		seedLoose(fv, [['objects/Rock.png', rockPng]]);
		(fv.app.vault as unknown as { getConfig?: unknown }).getConfig = undefined;
		const res = await importInto(fv);
		expect(res.looseReplaced).toBe(1);
		expect(res.looseKeptPermanentDelete).toBe(0);
	});

	it('refuses a second concurrent import of the same pack', async () => {
		const fv = makeFakeVault();
		const plugin = makePlugin(fv);
		const first = importInto(fv, true, packFiles(), plugin);
		const second = await importInto(fv, true, packFiles(), plugin);
		expect(second.error).toContain('another import of this pack is still running');
		expect(second.imported).toBe(0);
		const done = await first;
		expect(done.error).toBeUndefined();
		expect(done.imported).toBe(4);
		expect(plugin.saves).toBe(1);
		const again = await importInto(fv, true, packFiles(), plugin);
		expect(again.error).toBeUndefined();
	});
});

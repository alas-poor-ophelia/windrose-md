import { describe, it, expect } from 'vitest';
import { parsePck, GDPC_MAGIC } from '../../../src/content-packs/pckParser';
import { parseWallSidecars } from '../../../src/content-packs/pckMetadata';
import {
	countAssets,
	toRelativeTexturePath,
	pairWallEndCaps,
	sourceTypeOf,
	stemOf,
	isEndCapFilename,
	destFolderOf,
	analyzePckForWizard,
} from '../../../src/content-packs/ddImportCore';

function buildPckBuffer(files: Array<{ path: string; data: Uint8Array }>): ArrayBuffer {
	const HEADER_SIZE = 0x58;
	const encoder = new TextEncoder();

	const encodedPaths = files.map(f => {
		const bytes = encoder.encode(f.path);
		return { raw: bytes, storedLen: bytes.length };
	});

	let tableSize = 0;
	for (const ep of encodedPaths) {
		tableSize += 4 + ep.storedLen + 8 + 8 + 16;
	}

	const dataStart = HEADER_SIZE + tableSize;
	const offsets: number[] = [];
	let currentOffset = dataStart;
	for (const f of files) {
		offsets.push(currentOffset);
		currentOffset += f.data.length;
	}

	const buffer = new ArrayBuffer(currentOffset);
	const view = new DataView(buffer);
	const bytes = new Uint8Array(buffer);

	view.setUint32(0, GDPC_MAGIC, true);
	view.setUint32(4, 1, true);
	view.setUint32(8, 3, true);
	view.setUint32(12, 4, true);
	view.setUint32(16, 2, true);
	view.setUint32(0x54, files.length, true);

	let cursor = 0x58;
	for (let i = 0; i < files.length; i++) {
		const ep = encodedPaths[i];
		view.setUint32(cursor, ep.storedLen, true);
		cursor += 4;
		bytes.set(ep.raw, cursor);
		cursor += ep.storedLen;
		view.setUint32(cursor, offsets[i], true);
		view.setUint32(cursor + 4, 0, true);
		cursor += 8;
		view.setUint32(cursor, files[i].data.length, true);
		view.setUint32(cursor + 4, 0, true);
		cursor += 8;
		cursor += 16;
	}

	for (let i = 0; i < files.length; i++) {
		bytes.set(files[i].data, offsets[i]);
	}

	return buffer;
}

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const px = new Uint8Array([1, 2, 3]);

describe('isEndCapFilename', () => {
	it('matches _end suffix in both extensions', () => {
		expect(isEndCapFilename('Wall_Glass_01_a_end.webp')).toBe(true);
		expect(isEndCapFilename('Wall_Glass_01_a_end.png')).toBe(true);
	});

	it('rejects strips and lookalikes', () => {
		expect(isEndCapFilename('Wall_Glass_01_a.webp')).toBe(false);
		// "_end" must be a suffix segment, not part of a word
		expect(isEndCapFilename('Dead_Trend.webp')).toBe(false);
	});
});

describe('stemOf', () => {
	it('strips webp/png extensions case-insensitively', () => {
		expect(stemOf('Wall_01_a.webp')).toBe('Wall_01_a');
		expect(stemOf('Wall_01_a.PNG')).toBe('Wall_01_a');
		expect(stemOf('no_extension')).toBe('no_extension');
	});
});

describe('sourceTypeOf', () => {
	it('extracts the textures subdirectory', () => {
		expect(sourceTypeOf('textures/walls/X.webp')).toBe('walls');
		expect(sourceTypeOf('textures/paths/Y.webp')).toBe('paths');
		expect(sourceTypeOf('textures/objects/sub/Z.webp')).toBe('objects');
	});

	it('returns null for non-texture paths', () => {
		expect(sourceTypeOf('data/walls/X.dungeondraft_wall')).toBe(null);
		expect(sourceTypeOf('pack.json')).toBe(null);
	});
});

describe('toRelativeTexturePath', () => {
	it('slices from the textures/ segment', () => {
		expect(toRelativeTexturePath('res://packs/abc123/textures/walls/X.webp'))
			.toBe('textures/walls/X.webp');
	});

	it('strips the res prefix when no textures segment exists', () => {
		expect(toRelativeTexturePath('res://packs/abc123/data/walls/X.dungeondraft_wall'))
			.toBe('data/walls/X.dungeondraft_wall');
	});
});

describe('pairWallEndCaps', () => {
	it('pairs caps with strips by stem in the same folder', () => {
		const pairs = pairWallEndCaps([
			'textures/walls/Wall_Glass_01_a.webp',
			'textures/walls/Wall_Glass_01_a_end.webp',
			'textures/walls/Wall_Glass_01_b.webp',
		]);
		expect(pairs.get('textures/walls/Wall_Glass_01_a.webp'))
			.toBe('textures/walls/Wall_Glass_01_a_end.webp');
		expect(pairs.has('textures/walls/Wall_Glass_01_b.webp')).toBe(false);
	});

	it('pairs across extensions (png cap for webp strip)', () => {
		const pairs = pairWallEndCaps([
			'textures/walls/Stone.webp',
			'textures/walls/Stone_end.png',
		]);
		expect(pairs.get('textures/walls/Stone.webp')).toBe('textures/walls/Stone_end.png');
	});

	it('does not pair across folders', () => {
		const pairs = pairWallEndCaps([
			'textures/walls/Stone.webp',
			'textures/paths/Stone_end.webp',
		]);
		expect(pairs.size).toBe(0);
	});

	it('ignores orphan caps', () => {
		const pairs = pairWallEndCaps(['textures/walls/Lonely_end.webp']);
		expect(pairs.size).toBe(0);
	});
});

describe('countAssets', () => {
	it('counts walls and paths alongside legacy categories', () => {
		const buffer = buildPckBuffer([
			{ path: 'res://packs/p1/pack.json', data: enc('{}') },
			{ path: 'res://packs/p1/textures/objects/a.webp', data: px },
			{ path: 'res://packs/p1/textures/terrain/b.webp', data: px },
			{ path: 'res://packs/p1/textures/walls/w.webp', data: px },
			{ path: 'res://packs/p1/textures/walls/w_end.webp', data: px },
			{ path: 'res://packs/p1/textures/paths/p.webp', data: px },
			{ path: 'res://packs/p1/textures/walls/thumbnails/w.webp', data: px },
		]);
		const archive = parsePck(buffer);
		const counts = countAssets(archive);
		expect(counts.objects).toBe(1);
		expect(counts.terrain).toBe(1);
		expect(counts.walls).toBe(2);
		expect(counts.paths).toBe(1);
		expect(counts.total).toBe(5);
	});
});

describe('parseWallSidecars', () => {
	it('parses sidecars keyed by stem, stripping leading # from colors', () => {
		const buffer = buildPckBuffer([
			{
				path: 'res://packs/p1/data/walls/Wall_A.dungeondraft_wall',
				data: enc('{"path":"textures/walls/Wall_A.webp","color":"#aabbcc"}'),
			},
			{
				path: 'res://packs/p1/data/walls/Wall_B.dungeondraft_wall',
				data: enc('{"path":"textures/walls/Wall_B.webp","color":"ffffff"}'),
			},
		]);
		const archive = parsePck(buffer);
		const sidecars = parseWallSidecars(buffer, archive);
		expect(sidecars.get('Wall_A')?.color).toBe('aabbcc');
		expect(sidecars.get('Wall_B')?.color).toBe('ffffff');
	});

	it('tolerates malformed sidecars', () => {
		const buffer = buildPckBuffer([
			{ path: 'res://packs/p1/data/walls/Bad.dungeondraft_wall', data: enc('not json') },
			{ path: 'res://packs/p1/data/walls/Good.dungeondraft_wall', data: enc('{"color":"112233"}') },
		]);
		const archive = parsePck(buffer);
		const sidecars = parseWallSidecars(buffer, archive);
		expect(sidecars.has('Bad')).toBe(false);
		expect(sidecars.get('Good')?.color).toBe('112233');
	});
});

describe('destFolderOf', () => {
	it('keeps strips in their source-type folder even when tagged', () => {
		expect(destFolderOf('textures/walls/Wall_Stone_01.webp', 'walls', 'Fancy Tag')).toBe('walls');
		expect(destFolderOf('textures/paths/Path_Dirt_01.webp', 'paths', undefined)).toBe('paths');
	});

	it('routes tagged cell tiles under their sanitized first tag', () => {
		expect(destFolderOf('textures/objects/Furniture/Chair_01.webp', 'objects', 'Furniture Wood'))
			.toBe('Furniture Wood');
		expect(destFolderOf('textures/objects/X.webp', 'objects', 'Bad:Tag?')).toBe('Bad_Tag_');
	});

	it('routes untagged cell tiles under their source-relative subpath', () => {
		expect(destFolderOf('textures/objects/Furniture/Beds/Bed_01.webp', 'objects', undefined))
			.toBe('objects/Furniture/Beds');
		expect(destFolderOf('textures/terrain/Grass_01.webp', 'terrain', undefined)).toBe('terrain');
	});
});

describe('analyzePckForWizard', () => {
	function buildWizardPack(): ArrayBuffer {
		const tagsJson = JSON.stringify({
			tags: {
				'Furniture Wood': [
					'textures/objects/Furniture/Chair_01.webp',
					'textures/objects/Furniture/Table_01.webp',
				],
			},
		});
		return buildPckBuffer([
			{ path: 'res://packs/t1/pack.json', data: enc('{}') },
			{ path: 'res://packs/t1/data/default.dungeondraft_tags', data: enc(tagsJson) },
			{ path: 'res://packs/t1/textures/objects/Furniture/Chair_01.webp', data: px },
			{ path: 'res://packs/t1/textures/objects/Furniture/Table_01.webp', data: px },
			{ path: 'res://packs/t1/textures/terrain/Grass_01.webp', data: px },
			{ path: 'res://packs/t1/textures/walls/Wall_Stone_01.webp', data: px },
		]);
	}

	it('builds cell pseudo-tiles keyed by destination folder, excluding strips', () => {
		const buffer = buildWizardPack();
		const analysis = analyzePckForWizard(buffer, parsePck(buffer));
		expect(analysis.cellTiles).toHaveLength(3);
		expect(analysis.stripCount).toBe(1);

		const chair = analysis.cellTiles.find(t => t.filename === 'Chair_01.webp');
		expect(chair?.vaultPath).toBe('textures/objects/Furniture/Chair_01.webp');
		expect(chair?.category).toBe('Furniture Wood');
		expect(chair?.tags).toEqual(['Furniture Wood']);

		const grass = analysis.cellTiles.find(t => t.filename === 'Grass_01.webp');
		expect(grass?.category).toBe('terrain');
		expect(grass?.tags).toBeUndefined();
	});

	it('counts pack tags over cell textures', () => {
		const buffer = buildWizardPack();
		const analysis = analyzePckForWizard(buffer, parsePck(buffer));
		expect(analysis.packTags).toEqual([{ tag: 'Furniture Wood', count: 2 }]);
	});

	it('handles packs without a tags file', () => {
		const buffer = buildPckBuffer([
			{ path: 'res://packs/t2/textures/objects/Rock_01.webp', data: px },
		]);
		const analysis = analyzePckForWizard(buffer, parsePck(buffer));
		expect(analysis.cellTiles).toHaveLength(1);
		expect(analysis.cellTiles[0].category).toBe('objects');
		expect(analysis.packTags).toEqual([]);
	});
});

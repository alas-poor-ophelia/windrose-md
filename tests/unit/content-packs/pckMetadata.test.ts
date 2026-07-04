import { describe, it, expect } from 'vitest';
import { parsePck, BufferPckSource } from '../../../src/content-packs/pckParser';
import {
	parsePackMetadata,
	parseDungeondraftTags,
	findPackJson,
	findTagsFile,
} from '../../../src/content-packs/pckMetadata';
import { GDPC_MAGIC } from '../../../src/content-packs/pckParser';

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

	const totalSize = currentOffset;
	const buffer = new ArrayBuffer(totalSize);
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

function buildPckSource(files: Array<{ path: string; data: Uint8Array }>): BufferPckSource {
	return new BufferPckSource(buildPckBuffer(files));
}

function textBytes(s: string): Uint8Array {
	return new TextEncoder().encode(s);
}

const VALID_PACK_JSON = JSON.stringify({
	name: 'Test Pack',
	id: 'ABC12345',
	version: '1.0.0',
	author: 'Test Author',
	allow_3rd_party_mapping_software_to_read: true,
	custom_color_overrides: {
		enabled: true,
		min_redness: 0.1,
		min_saturation: 0.5,
		red_tolerance: 0.3,
	},
});

const DENIED_PACK_JSON = JSON.stringify({
	name: 'Locked Pack',
	id: 'LOCKED01',
	version: '1.0.0',
	author: 'Strict Author',
	allow_3rd_party_mapping_software_to_read: false,
});

const VALID_TAGS = JSON.stringify({
	tags: {
		Furniture: [
			'textures/objects/chair.webp',
			'textures/objects/table.webp',
		],
		Lighting: [
			'textures/objects/torch.webp',
		],
	},
	sets: {
		'Interior': ['Furniture', 'Lighting'],
	},
});

describe('pckMetadata', () => {
	describe('findPackJson', () => {
		it('finds pack.json in a typical archive', async () => {
			const source = buildPckSource([
				{ path: 'res://packs/ABC/preview.png', data: new Uint8Array([1]) },
				{ path: 'res://packs/ABC/pack.json', data: textBytes(VALID_PACK_JSON) },
			]);
			const archive = await parsePck(source);
			const entry = findPackJson(archive);

			expect(entry).toBeDefined();
			expect(entry!.path).toBe('res://packs/ABC/pack.json');
		});

		it('returns undefined when no pack.json exists', async () => {
			const source = buildPckSource([
				{ path: 'res://packs/ABC/preview.png', data: new Uint8Array([1]) },
			]);
			const archive = await parsePck(source);

			expect(findPackJson(archive)).toBeUndefined();
		});
	});

	describe('findTagsFile', () => {
		it('finds .dungeondraft_tags file', async () => {
			const source = buildPckSource([
				{ path: 'res://packs/ABC/data/default.dungeondraft_tags', data: textBytes(VALID_TAGS) },
			]);
			const archive = await parsePck(source);
			const entry = findTagsFile(archive);

			expect(entry).toBeDefined();
			expect(entry!.path).toContain('.dungeondraft_tags');
		});
	});

	describe('parsePackMetadata', () => {
		it('parses valid pack metadata with 3rd party access', async () => {
			const source = buildPckSource([
				{ path: 'res://packs/ABC/pack.json', data: textBytes(VALID_PACK_JSON) },
			]);
			const archive = await parsePck(source);
			const result = await parsePackMetadata(source, archive);

			expect(result.ok).toBe(true);
			if (!result.ok) return;

			expect(result.meta.name).toBe('Test Pack');
			expect(result.meta.id).toBe('ABC12345');
			expect(result.meta.version).toBe('1.0.0');
			expect(result.meta.author).toBe('Test Author');
			expect(result.meta.allow3rdParty).toBe(true);
			expect(result.meta.colorOverrides).toEqual({
				enabled: true,
				minRedness: 0.1,
				minSaturation: 0.5,
				redTolerance: 0.3,
			});
		});

		it('rejects packs without 3rd party permission', async () => {
			const source = buildPckSource([
				{ path: 'res://packs/LOCKED/pack.json', data: textBytes(DENIED_PACK_JSON) },
			]);
			const archive = await parsePck(source);
			const result = await parsePackMetadata(source, archive);

			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.error).toContain('does not allow third-party');
		});

		it('rejects when allow_3rd_party field is missing', async () => {
			const json = JSON.stringify({ name: 'No Flag', id: 'X', version: '1', author: 'A' });
			const source = buildPckSource([
				{ path: 'res://packs/X/pack.json', data: textBytes(json) },
			]);
			const archive = await parsePck(source);
			const result = await parsePackMetadata(source, archive);

			expect(result.ok).toBe(false);
		});

		it('returns error when no pack.json exists', async () => {
			const source = buildPckSource([
				{ path: 'res://packs/X/image.png', data: new Uint8Array([1]) },
			]);
			const archive = await parsePck(source);
			const result = await parsePackMetadata(source, archive);

			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.error).toContain('No pack.json');
		});

		it('returns error for invalid JSON', async () => {
			const source = buildPckSource([
				{ path: 'res://packs/X/pack.json', data: textBytes('not json {{{') },
			]);
			const archive = await parsePck(source);
			const result = await parsePackMetadata(source, archive);

			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.error).toContain('Invalid JSON');
		});

		it('handles missing optional fields gracefully', async () => {
			const json = JSON.stringify({
				allow_3rd_party_mapping_software_to_read: true,
			});
			const source = buildPckSource([
				{ path: 'res://packs/X/pack.json', data: textBytes(json) },
			]);
			const archive = await parsePck(source);
			const result = await parsePackMetadata(source, archive);

			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.meta.name).toBe('Unknown');
			expect(result.meta.id).toBe('');
			expect(result.meta.author).toBe('Unknown');
			expect(result.meta.colorOverrides).toBeUndefined();
		});

		it('finds pack.json when duplicate exists at different path', async () => {
			const source = buildPckSource([
				{ path: 'res://packs/ABC/ABC.json', data: textBytes(VALID_PACK_JSON) },
				{ path: 'res://packs/ABC/pack.json', data: textBytes(VALID_PACK_JSON) },
			]);
			const archive = await parsePck(source);
			const result = await parsePackMetadata(source, archive);

			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.meta.name).toBe('Test Pack');
		});
	});

	describe('parseDungeondraftTags', () => {
		it('parses valid tags file', async () => {
			const source = buildPckSource([
				{ path: 'res://packs/ABC/data/default.dungeondraft_tags', data: textBytes(VALID_TAGS) },
			]);
			const archive = await parsePck(source);
			const tags = await parseDungeondraftTags(source, archive);

			expect(tags).not.toBeNull();
			expect(tags!.tags.Furniture).toHaveLength(2);
			expect(tags!.tags.Lighting).toHaveLength(1);
			expect(tags!.sets).toEqual({ Interior: ['Furniture', 'Lighting'] });
		});

		it('returns null when no tags file exists', async () => {
			const source = buildPckSource([
				{ path: 'res://packs/ABC/pack.json', data: textBytes(VALID_PACK_JSON) },
			]);
			const archive = await parsePck(source);

			expect(await parseDungeondraftTags(source, archive)).toBeNull();
		});

		it('returns null for invalid JSON', async () => {
			const source = buildPckSource([
				{ path: 'res://packs/ABC/data/default.dungeondraft_tags', data: textBytes('broken') },
			]);
			const archive = await parsePck(source);

			expect(await parseDungeondraftTags(source, archive)).toBeNull();
		});

		it('handles tags without sets', async () => {
			const json = JSON.stringify({ tags: { Misc: ['a.webp'] } });
			const source = buildPckSource([
				{ path: 'res://packs/X/data/default.dungeondraft_tags', data: textBytes(json) },
			]);
			const archive = await parsePck(source);
			const tags = await parseDungeondraftTags(source, archive);

			expect(tags).not.toBeNull();
			expect(tags!.tags.Misc).toEqual(['a.webp']);
			expect(tags!.sets).toBeUndefined();
		});
	});
});

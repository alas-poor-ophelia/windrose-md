import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { parsePck, extractFileData, BufferPckSource } from '../../../src/content-packs/pckParser';
import { parsePackMetadata, parseDungeondraftTags } from '../../../src/content-packs/pckMetadata';

const PACK_PATH = 'C:/Users/whipl/Downloads/EA - Sea & Sky v1.0.0.dungeondraft_pack';

describe('real Dungeondraft pack file', () => {
	const raw = readFileSync(PACK_PATH);
	const buffer = new ArrayBuffer(raw.byteLength);
	new Uint8Array(buffer).set(raw);
	const source = new BufferPckSource(buffer);

	it('parses the archive header', async () => {
		const archive = await parsePck(source);

		expect(archive.header.packVersion).toBe(1);
		expect(archive.header.godotMajor).toBe(3);
		expect(archive.header.fileCount).toBeGreaterThan(0);
		expect(archive.files).toHaveLength(archive.header.fileCount);
	});

	it('finds pack.json and reads metadata', async () => {
		const archive = await parsePck(source);
		const result = await parsePackMetadata(source, archive);

		expect(result.ok).toBe(true);
		if (!result.ok) return;

		expect(result.meta.name).toContain('Sea');
		expect(result.meta.id).toBeTruthy();
		expect(result.meta.author).toBeTruthy();
		expect(result.meta.allow3rdParty).toBe(true);
	});

	it('finds and parses dungeondraft_tags', async () => {
		const archive = await parsePck(source);
		const tags = await parseDungeondraftTags(source, archive);

		expect(tags).not.toBeNull();
		expect(Object.keys(tags!.tags).length).toBeGreaterThan(0);
	});

	it('contains expected file types', async () => {
		const archive = await parsePck(source);
		const extensions = new Set(
			archive.files.map(f => {
				const dot = f.path.lastIndexOf('.');
				return dot >= 0 ? f.path.slice(dot) : '';
			})
		);

		expect(extensions.has('.webp') || extensions.has('.png')).toBe(true);
		expect(extensions.has('.json')).toBe(true);
	});

	it('can extract a texture file as binary data', async () => {
		const archive = await parsePck(source);
		const textureEntry = archive.files.find(
			f => f.path.endsWith('.webp') || f.path.endsWith('.png')
		);

		expect(textureEntry).toBeDefined();
		if (!textureEntry) return;

		const data = await extractFileData(source, textureEntry);
		expect(data.byteLength).toBe(textureEntry.size);
		expect(data.byteLength).toBeGreaterThan(0);
	});

	it('reports file counts by category', async () => {
		const archive = await parsePck(source);

		const objects = archive.files.filter(f => f.path.includes('/textures/objects/'));
		const patterns = archive.files.filter(f => f.path.includes('/textures/patterns/'));
		const thumbnails = archive.files.filter(f => f.path.includes('/thumbnails/'));
		const json = archive.files.filter(f => f.path.endsWith('.json'));

		console.log(`Total files: ${archive.files.length}`);
		console.log(`Objects: ${objects.length}`);
		console.log(`Patterns: ${patterns.length}`);
		console.log(`Thumbnails: ${thumbnails.length}`);
		console.log(`JSON: ${json.length}`);

		expect(archive.files.length).toBeGreaterThan(10);
	});
});

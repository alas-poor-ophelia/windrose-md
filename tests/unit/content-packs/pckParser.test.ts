import { describe, it, expect } from 'vitest';
import { parsePck, extractFileData, readUint64LE, GDPC_MAGIC } from '../../../src/content-packs/pckParser';

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

function textBytes(s: string): Uint8Array {
	return new TextEncoder().encode(s);
}

describe('pckParser', () => {
	describe('parsePck', () => {
		it('parses a minimal single-file archive', () => {
			const data = textBytes('hello world');
			const buffer = buildPckBuffer([
				{ path: 'res://packs/TEST/hello.txt', data },
			]);

			const archive = parsePck(buffer);

			expect(archive.header.packVersion).toBe(1);
			expect(archive.header.godotMajor).toBe(3);
			expect(archive.header.godotMinor).toBe(4);
			expect(archive.header.godotPatch).toBe(2);
			expect(archive.header.fileCount).toBe(1);
			expect(archive.files).toHaveLength(1);
			expect(archive.files[0].path).toBe('res://packs/TEST/hello.txt');
			expect(archive.files[0].size).toBe(11);
		});

		it('parses multiple files', () => {
			const buffer = buildPckBuffer([
				{ path: 'res://packs/ABC/a.png', data: new Uint8Array([1, 2, 3]) },
				{ path: 'res://packs/ABC/b.webp', data: new Uint8Array([4, 5, 6, 7]) },
				{ path: 'res://packs/ABC/data/tags.json', data: textBytes('{}') },
			]);

			const archive = parsePck(buffer);

			expect(archive.header.fileCount).toBe(3);
			expect(archive.files).toHaveLength(3);
			expect(archive.files[0].path).toBe('res://packs/ABC/a.png');
			expect(archive.files[0].size).toBe(3);
			expect(archive.files[1].path).toBe('res://packs/ABC/b.webp');
			expect(archive.files[1].size).toBe(4);
			expect(archive.files[2].path).toBe('res://packs/ABC/data/tags.json');
			expect(archive.files[2].size).toBe(2);
		});

		it('handles various path lengths without alignment padding', () => {
			const paths = [
				'res://packs/X/a',
				'res://packs/X/ab',
				'res://packs/X/abc',
				'res://packs/X/abcd',
				'res://packs/X/abcde',
			];

			for (const path of paths) {
				const buffer = buildPckBuffer([
					{ path, data: new Uint8Array([42]) },
				]);
				const archive = parsePck(buffer);
				expect(archive.files[0].path).toBe(path);
			}
		});

		it('handles empty archive (zero files)', () => {
			const buffer = buildPckBuffer([]);
			const archive = parsePck(buffer);

			expect(archive.header.fileCount).toBe(0);
			expect(archive.files).toHaveLength(0);
		});

		it('rejects non-GDPC files', () => {
			const buffer = new ArrayBuffer(0x58);
			const view = new DataView(buffer);
			view.setUint32(0, 0x504B0304, true); // ZIP magic

			expect(() => parsePck(buffer)).toThrow('Not a valid Godot PCK file');
		});

		it('rejects files too small for a header', () => {
			const buffer = new ArrayBuffer(16);
			expect(() => parsePck(buffer)).toThrow('File too small');
		});

		it('rejects truncated file table', () => {
			const buffer = new ArrayBuffer(0x58);
			const view = new DataView(buffer);
			view.setUint32(0, GDPC_MAGIC, true);
			view.setUint32(0x54, 100, true);

			expect(() => parsePck(buffer)).toThrow('Unexpected end of file');
		});

		it('preserves MD5 bytes', () => {
			const buffer = buildPckBuffer([
				{ path: 'res://test.txt', data: textBytes('x') },
			]);

			const view = new DataView(buffer);
			let cursor = 0x58;
			const pathLen = view.getUint32(cursor, true);
			cursor += 4;
			cursor += pathLen + 16; // skip path + offset + size
			new Uint8Array(buffer, cursor, 16).set([
				0xAA, 0xBB, 0xCC, 0xDD, 0x11, 0x22, 0x33, 0x44,
				0x55, 0x66, 0x77, 0x88, 0x99, 0x00, 0xFF, 0xEE,
			]);

			const archive = parsePck(buffer);
			expect(archive.files[0].md5[0]).toBe(0xAA);
			expect(archive.files[0].md5[15]).toBe(0xEE);
		});
	});

	describe('extractFileData', () => {
		it('extracts correct bytes for a file entry', () => {
			const content = textBytes('file content here');
			const buffer = buildPckBuffer([
				{ path: 'res://packs/X/file.txt', data: content },
			]);

			const archive = parsePck(buffer);
			const extracted = extractFileData(buffer, archive.files[0]);

			expect(new TextDecoder().decode(extracted)).toBe('file content here');
		});

		it('extracts correct bytes when multiple files exist', () => {
			const buffer = buildPckBuffer([
				{ path: 'res://a.txt', data: textBytes('first') },
				{ path: 'res://b.txt', data: textBytes('second') },
				{ path: 'res://c.txt', data: textBytes('third') },
			]);

			const archive = parsePck(buffer);

			expect(new TextDecoder().decode(extractFileData(buffer, archive.files[0]))).toBe('first');
			expect(new TextDecoder().decode(extractFileData(buffer, archive.files[1]))).toBe('second');
			expect(new TextDecoder().decode(extractFileData(buffer, archive.files[2]))).toBe('third');
		});

		it('handles binary data correctly', () => {
			const binary = new Uint8Array([0x00, 0xFF, 0x89, 0x50, 0x4E, 0x47]);
			const buffer = buildPckBuffer([
				{ path: 'res://image.png', data: binary },
			]);

			const archive = parsePck(buffer);
			const extracted = extractFileData(buffer, archive.files[0]);

			expect(Array.from(extracted)).toEqual([0x00, 0xFF, 0x89, 0x50, 0x4E, 0x47]);
		});
	});

	describe('readUint64LE', () => {
		it('reads a small value correctly', () => {
			const buffer = new ArrayBuffer(8);
			const view = new DataView(buffer);
			view.setUint32(0, 12345, true);
			view.setUint32(4, 0, true);

			expect(readUint64LE(view, 0)).toBe(12345);
		});

		it('reads max 32-bit value correctly', () => {
			const buffer = new ArrayBuffer(8);
			const view = new DataView(buffer);
			view.setUint32(0, 0xFFFFFFFF, true);
			view.setUint32(4, 0, true);

			expect(readUint64LE(view, 0)).toBe(4294967295);
		});

		it('throws when high 32 bits are nonzero', () => {
			const buffer = new ArrayBuffer(8);
			const view = new DataView(buffer);
			view.setUint32(0, 0, true);
			view.setUint32(4, 1, true);

			expect(() => readUint64LE(view, 0)).toThrow('exceeds 4GB');
		});
	});
});

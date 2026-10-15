/** Build an in-memory Godot PCK (v1) archive for unit tests. */
import { GDPC_MAGIC, BufferPckSource } from '../../../src/content-packs/pckParser';

export function buildPckBuffer(files: Array<{ path: string; data: Uint8Array }>): ArrayBuffer {
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

export function buildPckSource(files: Array<{ path: string; data: Uint8Array }>): BufferPckSource {
	return new BufferPckSource(buildPckBuffer(files));
}

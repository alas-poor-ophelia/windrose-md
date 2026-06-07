interface PckFileEntry {
	path: string;
	offset: number;
	size: number;
	md5: Uint8Array;
}

interface PckHeader {
	packVersion: number;
	godotMajor: number;
	godotMinor: number;
	godotPatch: number;
	fileCount: number;
}

interface PckArchive {
	header: PckHeader;
	files: PckFileEntry[];
}

const GDPC_MAGIC = 0x43504447;

function readUint64LE(view: DataView, offset: number): number {
	const low = view.getUint32(offset, true);
	const high = view.getUint32(offset + 4, true);
	if (high > 0) {
		throw new Error('64-bit value exceeds 4GB — pack file too large');
	}
	return low;
}

function parsePck(buffer: ArrayBuffer): PckArchive {
	if (buffer.byteLength < 0x58) {
		throw new Error('File too small to be a valid PCK archive');
	}

	const view = new DataView(buffer);

	const magic = view.getUint32(0, true);
	if (magic !== GDPC_MAGIC) {
		throw new Error('Not a valid Godot PCK file (expected GDPC magic bytes)');
	}

	const header: PckHeader = {
		packVersion: view.getUint32(4, true),
		godotMajor: view.getUint32(8, true),
		godotMinor: view.getUint32(12, true),
		godotPatch: view.getUint32(16, true),
		fileCount: view.getUint32(0x54, true),
	};

	const files: PckFileEntry[] = [];
	let cursor = 0x58;
	const decoder = new TextDecoder('utf-8');

	for (let i = 0; i < header.fileCount; i++) {
		if (cursor + 4 > buffer.byteLength) {
			throw new Error(`Unexpected end of file at entry ${i}`);
		}

		const pathLen = view.getUint32(cursor, true);
		cursor += 4;

		if (cursor + pathLen + 32 > buffer.byteLength) {
			throw new Error(`Unexpected end of file reading entry ${i} path`);
		}

		const pathBytes = new Uint8Array(buffer, cursor, pathLen);
		let end = pathLen;
		while (end > 0 && pathBytes[end - 1] === 0) end--;
		const path = decoder.decode(pathBytes.subarray(0, end));
		cursor += pathLen;

		const offset = readUint64LE(view, cursor);
		cursor += 8;

		const size = readUint64LE(view, cursor);
		cursor += 8;

		const md5 = new Uint8Array(buffer.slice(cursor, cursor + 16));
		cursor += 16;

		files.push({ path, offset, size, md5 });
	}

	return { header, files };
}

function extractFileData(buffer: ArrayBuffer, entry: PckFileEntry): Uint8Array {
	return new Uint8Array(buffer, entry.offset, entry.size);
}

export { parsePck, extractFileData, readUint64LE, GDPC_MAGIC };
export type { PckArchive, PckFileEntry, PckHeader };

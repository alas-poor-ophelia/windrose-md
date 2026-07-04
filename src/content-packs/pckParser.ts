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

/**
 * Random-access byte source for a PCK archive.
 *
 * The whole point: a Dungeondraft pack can be multiple gigabytes, and
 * `Blob.arrayBuffer()` on such a file fails (`NotReadableError` — "The
 * requested file could not be read") because it tries to allocate one
 * contiguous ArrayBuffer past the V8 ceiling. Every PCK consumer only ever
 * reads specific byte ranges named by the directory, so we read those ranges
 * on demand instead of slurping the whole file.
 */
interface PckSource {
	byteLength: number;
	/** Read `length` bytes starting at `offset`. */
	read(offset: number, length: number): Promise<Uint8Array>;
}

/**
 * Streaming source backed by a browser `File`/`Blob`. `slice()` is a cheap
 * view and `.arrayBuffer()` on the slice materializes ONLY that range, so a
 * 4 GB pack never allocates more than one file's worth of bytes at a time.
 */
class FilePckSource implements PckSource {
	readonly byteLength: number;
	constructor(private readonly file: Blob) {
		this.byteLength = file.size;
	}
	async read(offset: number, length: number): Promise<Uint8Array> {
		const slice = this.file.slice(offset, offset + length);
		return new Uint8Array(await slice.arrayBuffer());
	}
}

/**
 * In-memory source over an existing ArrayBuffer — used by the content-pack
 * download path (bytes already resident) and by unit tests (fixture buffers).
 * `read` returns a zero-copy view into the shared buffer.
 */
class BufferPckSource implements PckSource {
	readonly byteLength: number;
	constructor(private readonly buffer: ArrayBuffer) {
		this.byteLength = buffer.byteLength;
	}
	read(offset: number, length: number): Promise<Uint8Array> {
		return Promise.resolve(new Uint8Array(this.buffer, offset, length));
	}
}

const GDPC_MAGIC = 0x43504447;

/**
 * Initial window read to parse the header + directory table. File data always
 * follows the directory, so this comfortably holds the directory for any real
 * pack (thousands of entries fit in a few MB); the rare overflow grows-and-retries.
 */
const INITIAL_DIRECTORY_WINDOW = 16 * 1024 * 1024;

function readUint64LE(view: DataView, offset: number): number {
	const low = view.getUint32(offset, true);
	const high = view.getUint32(offset + 4, true);
	if (high > 0) {
		throw new Error('64-bit value exceeds 4GB — pack file too large');
	}
	return low;
}

type ParseAttempt =
	| { status: 'ok'; archive: PckArchive }
	| { status: 'grow' }
	| { status: 'error'; error: string };

/**
 * Parse the header + directory out of a prefix window of the file. Returns
 * 'grow' (not an error) when the directory runs past the window but the file
 * has more bytes to read — the caller re-reads a larger window and retries.
 */
function tryParseDirectory(bytes: Uint8Array, fileLength: number): ParseAttempt {
	const windowLen = bytes.byteLength;
	const view = new DataView(bytes.buffer, bytes.byteOffset, windowLen);

	const magic = view.getUint32(0, true);
	if (magic !== GDPC_MAGIC) {
		return { status: 'error', error: 'Not a valid Godot PCK file (expected GDPC magic bytes)' };
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

	// Not enough bytes for the next `n`? Grow if the file continues past the
	// window, else the archive is genuinely truncated.
	const shortfall = (n: number): ParseAttempt | null => {
		if (cursor + n <= windowLen) return null;
		return windowLen < fileLength
			? { status: 'grow' }
			: { status: 'error', error: 'Unexpected end of file while reading PCK directory' };
	};

	for (let i = 0; i < header.fileCount; i++) {
		let g = shortfall(4);
		if (g != null) return g;
		const pathLen = view.getUint32(cursor, true);
		cursor += 4;

		g = shortfall(pathLen + 32); // path + offset(8) + size(8) + md5(16)
		if (g != null) return g;

		const pathBytes = bytes.subarray(cursor, cursor + pathLen);
		let end = pathLen;
		while (end > 0 && pathBytes[end - 1] === 0) end--;
		const path = decoder.decode(pathBytes.subarray(0, end));
		cursor += pathLen;

		const offset = readUint64LE(view, cursor);
		cursor += 8;

		const size = readUint64LE(view, cursor);
		cursor += 8;

		const md5 = bytes.slice(cursor, cursor + 16);
		cursor += 16;

		files.push({ path, offset, size, md5 });
	}

	return { status: 'ok', archive: { header, files } };
}

async function parsePck(source: PckSource): Promise<PckArchive> {
	if (source.byteLength < 0x58) {
		throw new Error('File too small to be a valid PCK archive');
	}

	let windowSize = Math.min(source.byteLength, INITIAL_DIRECTORY_WINDOW);
	for (;;) {
		const bytes = await source.read(0, windowSize);
		const attempt = tryParseDirectory(bytes, source.byteLength);
		if (attempt.status === 'ok') return attempt.archive;
		if (attempt.status === 'error') throw new Error(attempt.error);
		// 'grow' — the directory is larger than our window. Read more and retry.
		if (windowSize >= source.byteLength) {
			throw new Error('Unexpected end of file while reading PCK directory');
		}
		windowSize = Math.min(source.byteLength, windowSize * 4);
	}
}

async function extractFileData(source: PckSource, entry: PckFileEntry): Promise<Uint8Array> {
	return source.read(entry.offset, entry.size);
}

export {
	parsePck,
	extractFileData,
	readUint64LE,
	GDPC_MAGIC,
	FilePckSource,
	BufferPckSource,
};
export type { PckArchive, PckFileEntry, PckHeader, PckSource };

import type { PckArchive, PckFileEntry } from './pckParser';
import { extractFileData } from './pckParser';

interface DungeondraftPackMeta {
	name: string;
	id: string;
	version: string;
	author: string;
	allow3rdParty: boolean;
	colorOverrides?: {
		enabled: boolean;
		minRedness: number;
		minSaturation: number;
		redTolerance: number;
	};
}

interface DungeondraftTags {
	tags: Record<string, string[]>;
	sets?: Record<string, string[]>;
}

type MetadataResult =
	| { ok: true; meta: DungeondraftPackMeta }
	| { ok: false; error: string };

function findPackJson(archive: PckArchive): PckFileEntry | undefined {
	return archive.files.find(f => f.path.endsWith('/pack.json'));
}

function findTagsFile(archive: PckArchive): PckFileEntry | undefined {
	return archive.files.find(f => f.path.endsWith('.dungeondraft_tags'));
}

function parsePackMetadata(buffer: ArrayBuffer, archive: PckArchive): MetadataResult {
	const entry = findPackJson(archive);
	if (entry == null) {
		return { ok: false, error: 'No pack.json found in archive' };
	}

	const decoder = new TextDecoder('utf-8');
	const data = extractFileData(buffer, entry);
	const text = decoder.decode(data);

	let json: Record<string, unknown>;
	try {
		json = JSON.parse(text) as Record<string, unknown>;
	} catch {
		return { ok: false, error: 'Invalid JSON in pack.json' };
	}

	const allow3rdParty = json.allow_3rd_party_mapping_software_to_read === true;

	if (!allow3rdParty) {
		return {
			ok: false,
			error: 'This pack does not allow third-party software access. The pack author has disabled allow_3rd_party_mapping_software_to_read.',
		};
	}

	const meta: DungeondraftPackMeta = {
		name: (json.name as string) ?? 'Unknown',
		id: (json.id as string) ?? '',
		version: (json.version as string) ?? '0.0.0',
		author: (json.author as string) ?? 'Unknown',
		allow3rdParty,
	};

	const overrides = json.custom_color_overrides as Record<string, unknown> | undefined;
	if (overrides != null) {
		meta.colorOverrides = {
			enabled: (overrides.enabled as boolean) ?? false,
			minRedness: (overrides.min_redness as number) ?? 0,
			minSaturation: (overrides.min_saturation as number) ?? 0,
			redTolerance: (overrides.red_tolerance as number) ?? 0,
		};
	}

	return { ok: true, meta };
}

function parseDungeondraftTags(buffer: ArrayBuffer, archive: PckArchive): DungeondraftTags | null {
	const entry = findTagsFile(archive);
	if (entry == null) return null;

	const decoder = new TextDecoder('utf-8');
	const data = extractFileData(buffer, entry);
	const text = decoder.decode(data);

	try {
		const json = JSON.parse(text) as Record<string, unknown>;
		return {
			tags: (json.tags as Record<string, string[]>) ?? {},
			sets: json.sets as Record<string, string[]> | undefined,
		};
	} catch {
		return null;
	}
}

/** Per-wall defaults from a .dungeondraft_wall sidecar in data/walls/. */
interface WallSidecarInfo {
	color?: string;
}

/**
 * Parse all .dungeondraft_wall sidecars in the archive, keyed by filename stem
 * (e.g. "Wall_Glass_01_a" for data/walls/Wall_Glass_01_a.dungeondraft_wall).
 * The stem matches the wall texture's filename stem in textures/walls/.
 * Sidecars are optional — many packs ship walls without them.
 */
function parseWallSidecars(buffer: ArrayBuffer, archive: PckArchive): Map<string, WallSidecarInfo> {
	const result = new Map<string, WallSidecarInfo>();
	const decoder = new TextDecoder('utf-8');

	for (const entry of archive.files) {
		if (!entry.path.endsWith('.dungeondraft_wall')) continue;
		const filename = entry.path.split('/').pop() ?? '';
		const stem = filename.replace(/\.dungeondraft_wall$/, '');
		if (stem === '') continue;

		try {
			const text = decoder.decode(extractFileData(buffer, entry));
			const json = JSON.parse(text) as Record<string, unknown>;
			const info: WallSidecarInfo = {};
			if (typeof json.color === 'string') {
				info.color = json.color.replace(/^#/, '');
			}
			result.set(stem, info);
		} catch {
			// Malformed sidecar — wall still imports with defaults.
		}
	}

	return result;
}

export { parsePackMetadata, parseDungeondraftTags, findPackJson, findTagsFile, parseWallSidecars };
export type { DungeondraftPackMeta, DungeondraftTags, MetadataResult, WallSidecarInfo };

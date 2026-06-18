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

export { parsePackMetadata, parseDungeondraftTags, findPackJson, findTagsFile };
export type { DungeondraftPackMeta, DungeondraftTags, MetadataResult };

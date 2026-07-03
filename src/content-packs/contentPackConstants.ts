import type { InstalledPack } from '#types/content-packs/contentPack.types';

export const REGISTRY_URL = 'https://cdn.jsdelivr.net/gh/alas-poor-ophelia/windrose-content-packs@main/registry.json';
export const CONTENT_PACKS_FOLDER = 'windrose-content';

/** A fog pack's texture is a single jpg named after the pack id. */
export function fogPackImageFilename(pack: Pick<InstalledPack, 'id'>): string {
  return pack.id + '.jpg';
}

/** Full vault path to a fog pack's texture image. */
export function fogPackImagePath(pack: Pick<InstalledPack, 'id' | 'vaultPath'>): string {
  return pack.vaultPath + '/' + fogPackImageFilename(pack);
}

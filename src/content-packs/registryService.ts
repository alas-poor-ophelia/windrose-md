import { requestUrl } from 'obsidian';
import type { ContentPackRegistry } from '#types/content-packs/contentPack.types';
import { REGISTRY_URL } from './contentPackConstants';

let cachedRegistry: ContentPackRegistry | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 60 * 1000;

async function fetchRegistry(forceRefresh = false): Promise<ContentPackRegistry> {
  const now = Date.now();
  if (!forceRefresh && cachedRegistry != null && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedRegistry;
  }

  try {
    const bustUrl = REGISTRY_URL + '?t=' + now;
    const response = await requestUrl({ url: bustUrl });
    const data = response.json as ContentPackRegistry;

    if (data.version == null || !Array.isArray(data.packs)) {
      console.warn('[Windrose] Invalid registry format');
      return cachedRegistry ?? { version: 1, packs: [] };
    }

    cachedRegistry = data;
    cacheTimestamp = now;
    return data;
  } catch (err) {
    console.warn('[Windrose] Failed to fetch content pack registry:', err);
    return cachedRegistry ?? { version: 1, packs: [] };
  }
}

function clearRegistryCache(): void {
  cachedRegistry = null;
  cacheTimestamp = 0;
}

export { fetchRegistry, clearRegistryCache };

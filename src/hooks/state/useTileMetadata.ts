import type { App } from 'obsidian';
import type { TileMetadataStore } from '#types/tiles/tile.types';

import { useEffect, useState } from 'preact/hooks';
import {
  ensureTileMetadataLoaded,
  getTileMetadataForRender,
  subscribeTileMetadata,
} from '../../persistence/tileMetadata';

/**
 * Read the shared tile-metadata store (persistence/tileMetadata.ts) and
 * re-render when it changes. Triggers the once-per-session load. Writes go
 * through updateTileMetadata(app, mutator) — never through a local copy.
 */
function useTileMetadata(app: App): TileMetadataStore {
  const [store, setStore] = useState<TileMetadataStore>(getTileMetadataForRender);
  useEffect(() => {
    const sync = (): void => { setStore(getTileMetadataForRender()); };
    const unsubscribe = subscribeTileMetadata(sync);
    sync();
    void ensureTileMetadataLoaded(app);
    return unsubscribe;
  }, [app]);
  return store;
}

export { useTileMetadata };

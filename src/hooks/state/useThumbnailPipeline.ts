import { useEffect, useCallback, useState } from 'preact/hooks';
import { useApp } from '../../context/AppContext';
import { subscribe, getUrl, requestBatch } from '../../assets/thumbnailCache';

interface ThumbnailPipeline {
  getThumbUrl: (vaultPath: string) => string | null;
  requestThumbs: (paths: string[]) => void;
}

function useThumbnailPipeline(): ThumbnailPipeline {
  const app = useApp();
  const [, setTick] = useState(0);

  useEffect(() => {
    return subscribe(() => { setTick(t => t + 1); });
  }, []);

  const getThumbUrl = useCallback((path: string): string | null => {
    return getUrl(path);
  }, []);

  const requestThumbs = useCallback((paths: string[]) => {
    requestBatch(app, paths);
  }, [app]);

  return { getThumbUrl, requestThumbs };
}

export { useThumbnailPipeline };
export type { ThumbnailPipeline };

/**
 * useFeatureFlags.ts
 * Reactive access to the global feature flags for Preact components.
 *
 * Listens for `windrose-settings-changed` (fired on EVERY settings save)
 * and re-reads the flags — but returns the previous object when nothing
 * flipped, so consumers keep a stable reference and don't re-render on
 * unrelated settings saves.
 *
 * Effect-hygiene note: effects that publish state upward must depend on
 * individual flag booleans (e.g. `flags.tiles`), never the record object.
 */

import { useEffect, useState } from 'preact/hooks';

import type { WindroseFeature } from '#types/settings/settings.types';

import { getFeatureFlags } from '../../core/featureFlags';

function shallowEqualFlags(
  a: Record<WindroseFeature, boolean>,
  b: Record<WindroseFeature, boolean>
): boolean {
  for (const key in b) {
    if (a[key as WindroseFeature] !== b[key as WindroseFeature]) return false;
  }
  return true;
}

function useFeatureFlags(): Record<WindroseFeature, boolean> {
  const [flags, setFlags] = useState<Record<WindroseFeature, boolean>>(getFeatureFlags);

  useEffect(() => {
    const handleSettingsChange = (): void => {
      setFlags(prev => {
        const next = getFeatureFlags();
        return shallowEqualFlags(prev, next) ? prev : next;
      });
    };

    window.addEventListener('windrose-settings-changed', handleSettingsChange);

    return () => {
      window.removeEventListener('windrose-settings-changed', handleSettingsChange);
    };
  }, []);

  return flags;
}

export { useFeatureFlags };

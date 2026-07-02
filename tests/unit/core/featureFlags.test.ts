/**
 * Unit tests for featureFlags.ts — default-true semantics and
 * fresh-vs-upgrade onboarding detection.
 */

import { describe, it, expect, afterEach } from 'vitest';

import {
  FEATURE_DEFINITIONS,
  isFeatureEnabled,
  getFeatureFlags,
  decideOnboardingState,
} from '../../../src/core/featureFlags';
import { setPlugin, clearPlugin } from '../../../src/core/settingsAccessor';
import type { WindrosePluginRef } from '../../../src/core/settingsAccessor';
import type { PluginSettings } from '../../../types/settings/settings.types';

function stubPlugin(settings: Partial<PluginSettings>): void {
  setPlugin({
    app: {} as WindrosePluginRef['app'],
    settings,
    dataFilePath: 'windrose-md-data.json',
  });
}

afterEach(() => {
  clearPlugin();
});

describe('FEATURE_DEFINITIONS', () => {
  it('defines 12 unique features with labels and descriptions', () => {
    expect(FEATURE_DEFINITIONS).toHaveLength(12);
    const ids = FEATURE_DEFINITIONS.map(d => d.id);
    expect(new Set(ids).size).toBe(12);
    for (const def of FEATURE_DEFINITIONS) {
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.desc.length).toBeGreaterThan(0);
    }
  });
});

describe('isFeatureEnabled', () => {
  it('returns true when no plugin is registered (fallback settings)', () => {
    clearPlugin();
    expect(isFeatureEnabled('tiles')).toBe(true);
    expect(isFeatureEnabled('hexMaps')).toBe(true);
  });

  it('returns true when settings have no features record', () => {
    stubPlugin({});
    expect(isFeatureEnabled('fogOfWar')).toBe(true);
  });

  it('returns true for keys absent from a partial features record', () => {
    stubPlugin({ features: { tiles: false } });
    expect(isFeatureEnabled('fogOfWar')).toBe(true);
    expect(isFeatureEnabled('walls')).toBe(true);
  });

  it('returns false only for explicitly disabled features', () => {
    stubPlugin({ features: { tiles: false, fogOfWar: true } });
    expect(isFeatureEnabled('tiles')).toBe(false);
    expect(isFeatureEnabled('fogOfWar')).toBe(true);
  });
});

describe('getFeatureFlags', () => {
  it('resolves every defined feature, absent keys defaulting to true', () => {
    stubPlugin({ features: { walls: false } });
    const flags = getFeatureFlags();
    expect(Object.keys(flags)).toHaveLength(FEATURE_DEFINITIONS.length);
    expect(flags.walls).toBe(false);
    expect(flags.tiles).toBe(true);
    expect(flags.freehand).toBe(true);
  });
});

describe('decideOnboardingState', () => {
  it('returns pending for a true fresh install (null data, no maps)', () => {
    expect(decideOnboardingState(null, false)).toBe('pending');
  });

  it('returns pending for an empty settings object with no maps', () => {
    expect(decideOnboardingState({}, false)).toBe('pending');
  });

  it('returns whatsnew when settings are populated', () => {
    expect(decideOnboardingState({ version: '1.0.0' }, false)).toBe('whatsnew');
    expect(decideOnboardingState({ version: '1.0.0' }, true)).toBe('whatsnew');
  });

  it('returns whatsnew when map data exists even without settings', () => {
    expect(decideOnboardingState(null, true)).toBe('whatsnew');
    expect(decideOnboardingState({}, true)).toBe('whatsnew');
  });
});

/**
 * featureFlags.ts
 * Feature gating for the onboarding survey and the Features settings section.
 *
 * Semantics: a feature is enabled unless explicitly set to false in
 * settings.features. Absent keys (old data files, fresh FALLBACK settings,
 * test fixtures) always read as enabled — no migration required.
 */

import type { OnboardingState, WindroseFeature } from '#types/settings/settings.types';

import { getSettings } from './settingsAccessor';

// ===========================================
// Feature Definitions
// ===========================================

interface FeatureDefinition {
  id: WindroseFeature;
  label: string;
  desc: string;
}

/**
 * Single source of truth for the gateable features.
 * Consumed by the Features settings section, the onboarding survey's
 * review step, and getFeatureFlags().
 */
const FEATURE_DEFINITIONS: FeatureDefinition[] = [
  { id: 'hexMaps', label: 'Hex maps', desc: 'Create hex maps for overland worlds and regions. Existing hex maps always remain viewable.' },
  { id: 'regions', label: 'Regions', desc: 'Paint named subregions onto hex maps and manage them in the region panel.' },
  { id: 'outlines', label: 'Outlines', desc: 'Draw polygon outlines on hex maps (borders, territories).' },
  { id: 'subMaps', label: 'Sub-maps', desc: 'Drill into a hex to create a nested detail map. Existing sub-maps stay navigable.' },
  { id: 'fogOfWar', label: 'Fog of war', desc: 'Reveal maps to players gradually with paintable fog.' },
  { id: 'dungeonGenerator', label: 'Dungeon generator', desc: 'Procedurally generate random dungeons.' },
  { id: 'tiles', label: 'Image tiles', desc: 'Paint with image tiles and textures, including Dungeondraft asset packs.' },
  { id: 'walls', label: 'Walls & paths', desc: 'Draw wall and path tiles along lines and curves.' },
  { id: 'notePins', label: 'Note pins', desc: 'Pin notes to map locations and deep-link back to them.' },
  { id: 'shapeOverlays', label: 'Shape overlays', desc: 'Place resizable shape overlays (circles, cones, areas) on the map.' },
  { id: 'measurement', label: 'Distance measurement', desc: 'Measure distances in cells or map units.' },
  { id: 'freehand', label: 'Freehand drawing', desc: 'Sketch freehand curves on top of the grid.' },
];

// ===========================================
// Flag Access
// ===========================================

/** True unless the feature has been explicitly disabled. */
function isFeatureEnabled(feature: WindroseFeature): boolean {
  return getSettings().features?.[feature] ?? true;
}

/** Snapshot of all feature flags (absent keys resolved to true). */
function getFeatureFlags(): Record<WindroseFeature, boolean> {
  const stored = getSettings().features;
  const flags = {} as Record<WindroseFeature, boolean>;
  for (const def of FEATURE_DEFINITIONS) {
    flags[def.id] = stored?.[def.id] ?? true;
  }
  return flags;
}

// ===========================================
// Onboarding State Detection
// ===========================================

/**
 * Decide the initial onboarding state on plugin load.
 * Pure function — called once from main.ts with the raw loadData() result
 * and whether the map data file exists.
 *
 * Fresh install (no settings, no maps) → 'pending' (show survey).
 * Anything else → 'whatsnew' (upgrader; show the one-time notice).
 */
function decideOnboardingState(rawLoaded: unknown, mapDataExists: boolean): OnboardingState {
  const hasSettings = rawLoaded != null
    && typeof rawLoaded === 'object'
    && Object.keys(rawLoaded).length > 0;
  return (hasSettings || mapDataExists) ? 'whatsnew' : 'pending';
}

export { FEATURE_DEFINITIONS, isFeatureEnabled, getFeatureFlags, decideOnboardingState };
export type { FeatureDefinition };

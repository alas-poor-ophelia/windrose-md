/**
 * onboardingQuestions.ts
 * Data for the first-run onboarding survey: question definitions and the
 * mapping from answers to feature-flag presets.
 *
 * Pure module (no Preact) so the mapping matrix is unit-testable.
 *
 * Mapping is monotonic: presets start all-true and answers only turn
 * features OFF. The review step lets the user re-enable anything.
 */

import type { WindroseFeature } from '#types/settings/settings.types';

import { FEATURE_DEFINITIONS } from '../../core/featureFlags';

// ===========================================
// Question Definitions
// ===========================================

interface OnboardingOption {
  id: string;
  label: string;
  desc: string;
}

interface OnboardingQuestion {
  id: string;
  prompt: string;
  /** Multi-select questions allow any number of options (including none). */
  multi?: boolean;
  options: OnboardingOption[];
}

/** Answers keyed by question id; each value is the set of selected option ids. */
type OnboardingAnswers = Record<string, string[]>;

const ONBOARDING_QUESTIONS: OnboardingQuestion[] = [
  {
    id: 'mapKinds',
    prompt: 'What kind of maps will you make?',
    multi: true,
    options: [
      { id: 'grid', label: 'Dungeons, buildings & battlemaps', desc: 'Square-grid maps — graph paper in Obsidian.' },
      { id: 'hex', label: 'Overland worlds & regions', desc: 'Hex maps for worldbuilding, kingdoms, and travel.' },
    ],
  },
  {
    id: 'visualStyle',
    prompt: 'What visual style do you want?',
    options: [
      { id: 'simple', label: 'Clean & simple', desc: 'Colored cells, icons, labels, and freehand sketching.' },
      { id: 'rich', label: 'Rich & illustrated', desc: 'Image tiles, textures, and walls — including Dungeondraft assets.' },
    ],
  },
  {
    id: 'runGames',
    prompt: 'Will you run games from these maps?',
    options: [
      { id: 'yes', label: 'Yes — I’m a GM', desc: 'Reveal maps to players with fog of war and measure distances.' },
      { id: 'no', label: 'No — worldbuilding & notes', desc: 'Maps as reference and documentation.' },
    ],
  },
  {
    id: 'dungeonGen',
    prompt: 'Interested in procedurally generated dungeons?',
    options: [
      { id: 'yes', label: 'Yes, generate them for me', desc: 'One command produces a stocked random dungeon.' },
      { id: 'no', label: 'No, I’ll draw my own', desc: 'You can always enable the generator later.' },
    ],
  },
];

// ===========================================
// Answer → Feature Mapping
// ===========================================

/** All features enabled — used for the skip path and as the mapping base. */
function allFeaturesEnabled(): Record<WindroseFeature, boolean> {
  const flags = {} as Record<WindroseFeature, boolean>;
  for (const def of FEATURE_DEFINITIONS) flags[def.id] = true;
  return flags;
}

/**
 * Compute feature presets from survey answers.
 * Starts all-true; answers only disable. Unanswered questions (or an empty
 * multi-select) disable nothing — skipping mid-survey stays safe.
 *
 * `notePins` is part of the base kit: never preset off, only toggleable in
 * the review step. (Freehand is core and not a feature toggle at all.)
 */
function mapAnswersToFeatures(answers: OnboardingAnswers): Record<WindroseFeature, boolean> {
  const flags = allFeaturesEnabled();

  const mapKinds = answers['mapKinds'] ?? [];
  const wantsGrid = mapKinds.includes('grid');
  const wantsHex = mapKinds.includes('hex');

  // Q1: no hex → hide hex creation and the hex-only extras
  if (mapKinds.length > 0 && !wantsHex) {
    flags.hexMaps = false;
    flags.regions = false;
    flags.outlines = false;
    flags.subMaps = false;
  }

  // Q2: clean & simple → no tile/wall/overlay systems
  if ((answers['visualStyle'] ?? []).includes('simple')) {
    flags.tiles = false;
    flags.walls = false;
    flags.shapeOverlays = false;
  }

  // Q3: not running games → no fog or measurement
  if ((answers['runGames'] ?? []).includes('no')) {
    flags.fogOfWar = false;
    flags.measurement = false;
  }

  // Q4: no generated dungeons — also off when grid maps weren't chosen at all
  if ((answers['dungeonGen'] ?? []).includes('no') || (mapKinds.length > 0 && !wantsGrid)) {
    flags.dungeonGenerator = false;
  }

  return flags;
}

export { ONBOARDING_QUESTIONS, allFeaturesEnabled, mapAnswersToFeatures };
export type { OnboardingAnswers, OnboardingOption, OnboardingQuestion };

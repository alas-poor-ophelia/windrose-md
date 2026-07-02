/**
 * Unit tests for the onboarding survey's answer → feature mapping matrix.
 */

import { describe, it, expect } from 'vitest';

import {
  ONBOARDING_QUESTIONS,
  allFeaturesEnabled,
  mapAnswersToFeatures,
} from '../../../src/components/overlays/onboardingQuestions';
import { FEATURE_DEFINITIONS } from '../../../src/core/featureFlags';
import type { WindroseFeature } from '../../../types/settings/settings.types';

/** Features expected OFF; everything else must be ON. */
function expectOff(flags: Record<WindroseFeature, boolean>, off: WindroseFeature[]): void {
  for (const def of FEATURE_DEFINITIONS) {
    expect(flags[def.id], def.id).toBe(!off.includes(def.id));
  }
}

describe('ONBOARDING_QUESTIONS', () => {
  it('has 4 questions, each with at least 2 options', () => {
    expect(ONBOARDING_QUESTIONS).toHaveLength(4);
    for (const q of ONBOARDING_QUESTIONS) {
      expect(q.options.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('only the map-kinds question is multi-select', () => {
    expect(ONBOARDING_QUESTIONS.filter(q => q.multi === true).map(q => q.id)).toEqual(['mapKinds']);
  });
});

describe('allFeaturesEnabled (skip path)', () => {
  it('enables every defined feature', () => {
    expectOff(allFeaturesEnabled(), []);
  });
});

describe('mapAnswersToFeatures', () => {
  it('empty answers disable nothing', () => {
    expectOff(mapAnswersToFeatures({}), []);
  });

  it('empty multi-select on map kinds keeps both map types', () => {
    expectOff(mapAnswersToFeatures({ mapKinds: [] }), []);
  });

  it('grid-only turns off hex creation and hex extras', () => {
    expectOff(mapAnswersToFeatures({ mapKinds: ['grid'] }), [
      'hexMaps', 'regions', 'outlines', 'subMaps',
    ]);
  });

  it('hex-only turns off the dungeon generator', () => {
    expectOff(mapAnswersToFeatures({ mapKinds: ['hex'] }), ['dungeonGenerator']);
  });

  it('both map kinds selected disables nothing', () => {
    expectOff(mapAnswersToFeatures({ mapKinds: ['grid', 'hex'] }), []);
  });

  it('clean & simple style turns off tiles, walls, and shape overlays', () => {
    expectOff(mapAnswersToFeatures({ visualStyle: ['simple'] }), ['tiles', 'walls', 'shapeOverlays']);
  });

  it('rich & illustrated style disables nothing', () => {
    expectOff(mapAnswersToFeatures({ visualStyle: ['rich'] }), []);
  });

  it('not running games turns off fog of war and measurement', () => {
    expectOff(mapAnswersToFeatures({ runGames: ['no'] }), ['fogOfWar', 'measurement']);
  });

  it('running games disables nothing', () => {
    expectOff(mapAnswersToFeatures({ runGames: ['yes'] }), []);
  });

  it('declining generated dungeons turns off the generator', () => {
    expectOff(mapAnswersToFeatures({ dungeonGen: ['no'] }), ['dungeonGenerator']);
  });

  it('wanting generated dungeons keeps the generator even for hex-only users? No — hex-only wins', () => {
    expectOff(mapAnswersToFeatures({ mapKinds: ['hex'], dungeonGen: ['yes'] }), ['dungeonGenerator']);
  });

  it('minimal worldbuilder: hex-only, simple, no games, no generator', () => {
    expectOff(
      mapAnswersToFeatures({
        mapKinds: ['hex'],
        visualStyle: ['simple'],
        runGames: ['no'],
        dungeonGen: ['no'],
      }),
      ['dungeonGenerator', 'tiles', 'walls', 'shapeOverlays', 'fogOfWar', 'measurement'],
    );
  });

  it('minimal dungeon mapper: grid-only, simple, no games, no generator', () => {
    expectOff(
      mapAnswersToFeatures({
        mapKinds: ['grid'],
        visualStyle: ['simple'],
        runGames: ['no'],
        dungeonGen: ['no'],
      }),
      ['hexMaps', 'regions', 'outlines', 'subMaps', 'tiles', 'walls', 'shapeOverlays', 'fogOfWar', 'measurement', 'dungeonGenerator'],
    );
  });

  it('full map maker: everything on', () => {
    expectOff(
      mapAnswersToFeatures({
        mapKinds: ['grid', 'hex'],
        visualStyle: ['rich'],
        runGames: ['yes'],
        dungeonGen: ['yes'],
      }),
      [],
    );
  });

  it('never presets notePins off under any answer combination', () => {
    const combos = [
      { mapKinds: ['grid'], visualStyle: ['simple'], runGames: ['no'], dungeonGen: ['no'] },
      { mapKinds: ['hex'], visualStyle: ['simple'], runGames: ['no'], dungeonGen: ['no'] },
      { mapKinds: [], visualStyle: ['simple'], runGames: ['no'], dungeonGen: ['no'] },
    ];
    for (const answers of combos) {
      expect(mapAnswersToFeatures(answers).notePins).toBe(true);
    }
  });
});

/**
 * partyNoteOperations Unit Tests
 *
 * Covers the pure pieces: file naming, path building, content generation,
 * and the ownership marker check. Vault I/O is exercised in E2E.
 */

import { describe, it, expect } from 'vitest';

import type { PartyPin } from '#types/core/map.types';
import type { PartyRangeResults } from '../../../src/objects/partyRangeQuery';

import {
  sanitizePartyNoteFileName,
  buildPartyNotePath,
  buildPartyNoteContent,
  isOwnedPartyNoteContent,
  PARTY_NOTE_MARKER_KEY,
} from '../../../src/persistence/partyNoteOperations';

function makePin(overrides: Partial<PartyPin> = {}): PartyPin {
  return {
    id: 'party-test-1',
    position: { x: 10, y: 10 },
    label: 'The Party',
    color: '#c4a57b',
    range: 30,
    rangeStyle: 'circle',
    ...overrides,
  };
}

const context = { mapId: 'map-1', mapName: 'Overworld', mapNotePath: 'Maps/Overworld.md' };

function makeResults(overrides: Partial<PartyRangeResults> = {}): PartyRangeResults {
  return { linked: [], unlinked: [], ...overrides };
}

describe('sanitizePartyNoteFileName', () => {
  it('strips characters invalid in note names', () => {
    expect(sanitizePartyNoteFileName('The [B] Team: #1 "West"?')).toBe('The B Team 1 West');
  });

  it('collapses whitespace and falls back for empty labels', () => {
    expect(sanitizePartyNoteFileName('  a   b  ')).toBe('a b');
    expect(sanitizePartyNoteFileName('###')).toBe('Party');
  });
});

describe('buildPartyNotePath', () => {
  it('places the note in the given folder', () => {
    expect(buildPartyNotePath('Campaign/Notes', 'The Party')).toBe('Campaign/Notes/The Party - Nearby.md');
  });

  it('handles the vault root and stray slashes', () => {
    expect(buildPartyNotePath('', 'The Party')).toBe('The Party - Nearby.md');
    expect(buildPartyNotePath('/Campaign/', 'The Party')).toBe('Campaign/The Party - Nearby.md');
  });
});

describe('buildPartyNoteContent travel column (PP-35)', () => {
  const travelResults = makeResults({
    linked: [{
      notePath: 'Places/Tavern.md',
      displayName: 'Tavern',
      distanceInCells: 3,
      distanceLabel: '15 ft',
      sourceObjectId: 'obj-1',
      position: { x: 12, y: 10 },
    }],
    unlinked: [{
      label: 'Old well',
      distanceInCells: 5,
      distanceLabel: '25 ft',
      objectId: 'obj-2',
      position: { x: 8, y: 9 },
    }],
  });

  it('adds a Travel column to both tables when labels are provided', () => {
    const content = buildPartyNoteContent(makePin(), travelResults, context, undefined, {
      linked: new Map([['Places/Tavern.md', 'March 8 min']]),
      unlinked: new Map([['obj-2', 'March 12 min']]),
    });
    expect(content).toContain('| Note | Distance | Travel | Map |');
    expect(content).toContain('March 8 min');
    expect(content).toContain('| Marker | Distance | Travel |');
    expect(content).toContain('March 12 min');
  });

  it('renders an em dash for results without a computable time', () => {
    const content = buildPartyNoteContent(makePin(), travelResults, context, undefined, {
      linked: new Map(),
      unlinked: new Map(),
    });
    expect(content).toContain('| Travel |');
    expect(content).toContain('—');
  });

  it('omits the column entirely when no travel labels are provided', () => {
    const content = buildPartyNoteContent(makePin(), travelResults, context);
    expect(content).not.toContain('Travel');
  });
});

describe('buildPartyNoteContent', () => {
  it('carries the ownership marker in frontmatter', () => {
    const content = buildPartyNoteContent(makePin(), makeResults(), context);
    expect(content.startsWith(`---\n${PARTY_NOTE_MARKER_KEY}: party-test-1\n---`)).toBe(true);
  });

  it('renders an explicit empty state', () => {
    const content = buildPartyNoteContent(makePin(), makeResults(), context);
    expect(content).toContain('*Nothing in range.*');
    expect(content).not.toContain('| Note |');
  });

  it('renders linked results as a wiki-link table with deeplinks', () => {
    const results = makeResults({
      linked: [{
        notePath: 'Places/Tavern.md',
        displayName: 'Tavern',
        distanceInCells: 3,
        distanceLabel: '15 ft',
        sourceObjectId: 'obj-1',
        position: { x: 13, y: 10 },
      }],
    });
    const content = buildPartyNoteContent(makePin(), results, context);
    expect(content).toContain('| Note | Distance | Map |');
    expect(content).toContain('[[Places/Tavern\\|Tavern]]');
    expect(content).toContain('| 15 ft |');
    expect(content).toContain('(windrose:');
    expect(content).toContain('map-1,13,10');
  });

  it('omits the deeplink column for full-pane maps', () => {
    const results = makeResults({
      linked: [{
        notePath: 'Places/Tavern.md',
        displayName: 'Tavern',
        distanceInCells: 3,
        distanceLabel: '15 ft',
        sourceObjectId: 'obj-1',
        position: { x: 13, y: 10 },
      }],
    });
    const content = buildPartyNoteContent(makePin(), results, { ...context, mapNotePath: '' });
    expect(content).toContain('| Note | Distance |');
    expect(content).not.toContain('windrose:');
  });

  it('lists unlinked markers in their own table', () => {
    const results = makeResults({
      unlinked: [{
        label: 'Old Well',
        distanceInCells: 2,
        distanceLabel: '10 ft',
        objectId: 'obj-2',
        position: { x: 12, y: 10 },
      }],
    });
    const content = buildPartyNoteContent(makePin(), results, context);
    expect(content).toContain('## Unlinked');
    expect(content).toContain('| Old Well | 10 ft |');
  });

  it('escapes pipes in labels and paths', () => {
    const results = makeResults({
      unlinked: [{
        label: 'A|B',
        distanceInCells: 1,
        distanceLabel: '5 ft',
        objectId: 'obj-3',
        position: { x: 11, y: 10 },
      }],
    });
    const content = buildPartyNoteContent(makePin(), results, context);
    expect(content).toContain('| A\\|B | 5 ft |');
  });

  it('adds a Related column with capped links and overflow when provided', () => {
    const results = makeResults({
      linked: [{
        notePath: 'Places/Tavern.md',
        displayName: 'Tavern',
        distanceInCells: 3,
        distanceLabel: '15 ft',
        sourceObjectId: 'obj-1',
        position: { x: 13, y: 10 },
      }],
    });
    const related = new Map([
      ['Places/Tavern.md', { paths: ['Places/Port.md', 'People/Innkeep.md'], overflow: 3 }],
    ]);
    const content = buildPartyNoteContent(makePin(), results, context, related);
    expect(content).toContain('| Note | Distance | Related | Map |');
    expect(content).toContain('[[Places/Port\\|Port]], [[People/Innkeep\\|Innkeep]] +3 more');
  });

  it('renders an em-dash for results without related notes', () => {
    const results = makeResults({
      linked: [{
        notePath: 'Places/Tavern.md',
        displayName: 'Tavern',
        distanceInCells: 3,
        distanceLabel: '15 ft',
        sourceObjectId: 'obj-1',
        position: { x: 13, y: 10 },
      }],
    });
    const content = buildPartyNoteContent(makePin(), results, context, new Map());
    expect(content).toContain('| [[Places/Tavern\\|Tavern]] | 15 ft | — |');
  });

  it('is deterministic for identical inputs (change-detection contract)', () => {
    const results = makeResults();
    const a = buildPartyNoteContent(makePin(), results, context);
    const b = buildPartyNoteContent(makePin(), results, context);
    expect(a).toBe(b);
  });
});

describe('isOwnedPartyNoteContent', () => {
  it('accepts content generated for the same pin', () => {
    const content = buildPartyNoteContent(makePin(), makeResults(), context);
    expect(isOwnedPartyNoteContent(content, 'party-test-1')).toBe(true);
  });

  it('rejects content for a different pin', () => {
    const content = buildPartyNoteContent(makePin(), makeResults(), context);
    expect(isOwnedPartyNoteContent(content, 'party-other')).toBe(false);
  });

  it('rejects user notes without the marker', () => {
    expect(isOwnedPartyNoteContent('# My own note\n\nHello', 'party-test-1')).toBe(false);
    expect(isOwnedPartyNoteContent('---\ntitle: Mine\n---\nBody', 'party-test-1')).toBe(false);
  });

  it('handles CRLF frontmatter', () => {
    const content = `---\r\n${PARTY_NOTE_MARKER_KEY}: party-test-1\r\n---\r\nBody`;
    expect(isOwnedPartyNoteContent(content, 'party-test-1')).toBe(true);
  });
});

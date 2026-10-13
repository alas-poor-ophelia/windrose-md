/**
 * partyNoteOperations Unit Tests
 *
 * Covers the pure pieces: file naming, path building, content generation,
 * the ownership marker check, region merge, and upsert against a fake vault.
 */

import { describe, it, expect } from 'vitest';
import type { App } from 'obsidian';
import { TFile } from 'obsidian';

import type { PartyPin } from '#types/core/map.types';
import type { PartyRangeResults } from '../../../src/objects/partyRangeQuery';

import {
  sanitizePartyNoteFileName,
  buildPartyNotePath,
  buildPartyNoteContent,
  isOwnedPartyNoteContent,
  mergePartyNoteContent,
  upsertPartyNote,
  onPartyNoteRenamed,
  notifyPartyNoteRenamed,
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
  return { linked: [], unlinked: [], beacons: [], ...overrides };
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

  it('omits the duplicate H1 and shows the range with its unit', () => {
    const content = buildPartyNoteContent(makePin(), makeResults(), { ...context, distanceUnit: 'mi' });
    expect(content).not.toContain('# The Party - Nearby');
    expect(content).toContain('Within **30 mi** of the beacon on **Overworld**.');
  });

  it('drops the map clause for unnamed maps', () => {
    const content = buildPartyNoteContent(makePin(), makeResults(), { ...context, mapName: '' });
    expect(content).toContain('Within **30** of the beacon.');
    expect(content).not.toContain(' on **');
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

describe('buildPartyNoteContent beacons table', () => {
  const beacons = [
    { pinId: 'party-b', label: 'Scouts', color: '#7ba8c4', distanceInCells: 2, distanceLabel: '10 ft', position: { x: 12, y: 10 }, notePath: 'Beacons/Scouts - Nearby.md' },
    { pinId: 'party-c', label: 'Rival | Band', color: '#8ac47b', distanceInCells: 4, distanceLabel: '20 ft', position: { x: 14, y: 10 } }
  ];

  it('lists in-range beacons in their own table, linking those with a note', () => {
    const content = buildPartyNoteContent(makePin(), makeResults({ beacons }), context);
    expect(content).toContain('## Beacons');
    expect(content).toContain('| Beacon | Distance | Map |');
    expect(content).toContain('| [[Beacons/Scouts - Nearby\\|Scouts]] | 10 ft | [show](');
    expect(content).toContain('| Rival \\| Band | 20 ft | [show](');
    expect(content).not.toContain('*Nothing in range.*');
  });

  it('adds the Travel column from beacon labels', () => {
    const travel = { linked: new Map(), unlinked: new Map(), beacons: new Map([['party-b', '2h on foot']]) };
    const content = buildPartyNoteContent(makePin(), makeResults({ beacons }), context, undefined, travel);
    expect(content).toContain('| Beacon | Distance | Travel | Map |');
    expect(content).toContain('| [[Beacons/Scouts - Nearby\\|Scouts]] | 10 ft | 2h on foot | [show](');
    expect(content).toContain('| Rival \\| Band | 20 ft | — | [show](');
  });
});

/** Minimal in-memory vault: files by path, frontmatter marker via metadataCache */
function makeVault(initial: Record<string, string> = {}, opts: { raceOnCreate?: string } = {}) {
  const files = new Map<string, string>(Object.entries(initial));
  const handles = new Map<string, TFile>();
  const handle = (path: string): TFile => {
    let file = handles.get(path);
    if (!file) {
      file = new TFile();
      file.path = path;
      handles.set(path, file);
    }
    return file;
  };
  let processCalls = 0;
  const app = {
    vault: {
      getAbstractFileByPath: (path: string) => (files.has(path) ? handle(path) : null),
      getMarkdownFiles: () => [...files.keys()].map(handle),
      read: (file: TFile) => Promise.resolve(files.get(file.path) ?? ''),
      process: (file: TFile, fn: (data: string) => string) => {
        processCalls++;
        const next = fn(files.get(file.path) ?? '');
        files.set(file.path, next);
        return Promise.resolve(next);
      },
      create: (path: string, data: string) => {
        if (opts.raceOnCreate != null) {
          files.set(path, opts.raceOnCreate);
          return Promise.reject(new Error('File already exists.'));
        }
        files.set(path, data);
        return Promise.resolve(handle(path));
      },
      createFolder: () => Promise.resolve(),
    },
    metadataCache: {
      getFileCache: (file: TFile) => {
        const marker = /windrose-party-pin:\s*(\S+)/.exec(files.get(file.path) ?? '');
        return marker ? { frontmatter: { [PARTY_NOTE_MARKER_KEY]: marker[1] } } : null;
      },
    },
  };
  return { app: app as unknown as App, files, processCalls: () => processCalls };
}

describe('mergePartyNoteContent', () => {
  it('a note with only one marker keeps the user prose (wave-5 finding 8)', () => {
    const pin = makePin();
    const fresh = buildPartyNoteContent({ ...pin, range: 60 }, makeResults(), context);
    const startOnly = '---\nwindrose-party-pin: x\n---\n<!-- windrose-beacon:start -->\nMy prose.\n';
    const endOnly = 'My prose.\n<!-- windrose-beacon:end -->\nMore prose.\n';
    expect(mergePartyNoteContent(startOnly, fresh)).toBe(startOnly);
    expect(mergePartyNoteContent(endOnly, fresh)).toBe(endOnly);
  });

  it('replaces only the marker region, keeping user text and frontmatter', () => {
    const pin = makePin();
    const old = buildPartyNoteContent(pin, makeResults(), context);
    const edited = old.replace('---\n', '---\ntags: [party]\n') + '\nMy session notes.\n';
    const fresh = buildPartyNoteContent({ ...pin, range: 60 }, makeResults(), context);
    const merged = mergePartyNoteContent(edited, fresh);
    expect(merged).toContain('tags: [party]');
    expect(merged).toContain('My session notes.');
    expect(merged).toContain('**60**');
    expect(merged).not.toContain('**30**');
  });

  it('replaces a legacy note without markers in full', () => {
    const legacy = `---\n${PARTY_NOTE_MARKER_KEY}: party-test-1\n---\n\nOld table`;
    const fresh = buildPartyNoteContent(makePin(), makeResults(), context);
    expect(mergePartyNoteContent(legacy, fresh)).toBe(fresh);
  });
});

describe('upsertPartyNote', () => {
  const path = 'Notes/The Party - Nearby.md';
  const pin = makePin({ partyNote: { enabled: true, path } });

  it('creates a missing note', async () => {
    const vault = makeVault();
    const content = buildPartyNoteContent(pin, makeResults(), context);
    expect(await upsertPartyNote(vault.app, pin, content)).toBe('created');
    expect(vault.files.get(path)).toBe(content);
  });

  it('updates through vault.process and keeps user text', async () => {
    const original = buildPartyNoteContent(pin, makeResults(), context) + '\nUser text\n';
    const vault = makeVault({ [path]: original });
    const fresh = buildPartyNoteContent({ ...pin, range: 60 }, makeResults(), context);
    expect(await upsertPartyNote(vault.app, pin, fresh)).toBe('updated');
    expect(vault.processCalls()).toBe(1);
    expect(vault.files.get(path)).toContain('User text');
    expect(vault.files.get(path)).toContain('**60**');
  });

  it('does not touch an unchanged note', async () => {
    const content = buildPartyNoteContent(pin, makeResults(), context);
    const vault = makeVault({ [path]: content });
    expect(await upsertPartyNote(vault.app, pin, content)).toBe('unchanged');
    expect(vault.processCalls()).toBe(0);
  });

  it('blocks on a note it does not own', async () => {
    const vault = makeVault({ [path]: '# Mine' });
    expect(await upsertPartyNote(vault.app, pin, buildPartyNoteContent(pin, makeResults(), context))).toBe('blocked');
    expect(vault.files.get(path)).toBe('# Mine');
  });

  it('follows a renamed note by its marker instead of recreating it', async () => {
    const renamed = 'Elsewhere/Renamed.md';
    const vault = makeVault({ [renamed]: buildPartyNoteContent(pin, makeResults(), context) });
    const fresh = buildPartyNoteContent({ ...pin, range: 60 }, makeResults(), context);
    expect(await upsertPartyNote(vault.app, pin, fresh)).toBe('updated');
    expect(vault.files.has(path)).toBe(false);
    expect(vault.files.get(renamed)).toContain('**60**');
  });

  it('falls back to update when another pane wins the create race', async () => {
    const racer = buildPartyNoteContent(pin, makeResults(), context);
    const vault = makeVault({}, { raceOnCreate: racer });
    const fresh = buildPartyNoteContent({ ...pin, range: 60 }, makeResults(), context);
    expect(await upsertPartyNote(vault.app, pin, fresh)).toBe('updated');
    expect(vault.files.get(path)).toContain('**60**');
  });
});

describe('party note rename broadcast', () => {
  it('delivers renames to subscribers until they unsubscribe', () => {
    const seen: Array<[string, string]> = [];
    const off = onPartyNoteRenamed((a, b) => seen.push([a, b]));
    notifyPartyNoteRenamed('a.md', 'b.md');
    off();
    notifyPartyNoteRenamed('b.md', 'c.md');
    expect(seen).toEqual([['a.md', 'b.md']]);
  });
});

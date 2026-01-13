/**
 * Unit tests for deepLinkHandler.ts
 * Tests deep link parsing and generation for Windrose maps
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock window and CustomEvent for Node.js environment
const mockDispatchEvent = vi.fn();
vi.stubGlobal('window', { dispatchEvent: mockDispatchEvent });
vi.stubGlobal('CustomEvent', class CustomEvent extends Event {
  detail: unknown;
  constructor(type: string, options?: { detail?: unknown }) {
    super(type);
    this.detail = options?.detail;
  }
});

import {
  PROTOCOL,
  NAVIGATION_EVENT,
  parseDeepLink,
  generateDeepLink,
  generateDeepLinkMarkdown,
  emitNavigationEvent
} from '../../../src/utils/deepLinkHandler.ts';

describe('deepLinkHandler', () => {
  const WINDROSE_PROTOCOL = 'obsidian://windrose?';

  describe('constants', () => {
    it('exports correct PROTOCOL for Windrose links', () => {
      expect(PROTOCOL).toBe(WINDROSE_PROTOCOL);
    });

    it('exports correct NAVIGATION_EVENT', () => {
      expect(NAVIGATION_EVENT).toBe('dmt-navigate-to');
    });
  });

  describe('parseDeepLink', () => {
    it('parses valid deep link', () => {
      const result = parseDeepLink(`${WINDROSE_PROTOCOL}folder/note.md|map-123,5,10,1.5,layer-456`);
      expect(result).toEqual({
        notePath: 'folder/note.md',
        mapId: 'map-123',
        x: 5,
        y: 10,
        zoom: 1.5,
        layerId: 'layer-456'
      });
    });

    it('parses deep link with decimal coordinates', () => {
      const result = parseDeepLink(`${WINDROSE_PROTOCOL}Maps/dungeon.md|test-map,15.75,8.25,2.0,layer-001`);
      expect(result).toEqual({
        notePath: 'Maps/dungeon.md',
        mapId: 'test-map',
        x: 15.75,
        y: 8.25,
        zoom: 2.0,
        layerId: 'layer-001'
      });
    });

    it('parses deep link with negative coordinates', () => {
      const result = parseDeepLink(`${WINDROSE_PROTOCOL}world.md|hex-map,-5,-10,1.2,layer-abc`);
      expect(result).toEqual({
        notePath: 'world.md',
        mapId: 'hex-map',
        x: -5,
        y: -10,
        zoom: 1.2,
        layerId: 'layer-abc'
      });
    });

    it('returns null for empty string', () => {
      expect(parseDeepLink('')).toBeNull();
    });

    it('returns null for null/undefined', () => {
      expect(parseDeepLink(null as unknown as string)).toBeNull();
      expect(parseDeepLink(undefined as unknown as string)).toBeNull();
    });

    it('returns null for non-windrose protocol', () => {
      expect(parseDeepLink('http://example.com')).toBeNull();
      expect(parseDeepLink('obsidian://open')).toBeNull();
    });

    it('returns null for missing pipe separator', () => {
      expect(parseDeepLink(`${WINDROSE_PROTOCOL}map-123,5,10,1.5,layer`)).toBeNull();
    });

    it('returns null for wrong number of coordinate parts', () => {
      expect(parseDeepLink(`${WINDROSE_PROTOCOL}note.md|map-123,5,10`)).toBeNull(); // too few
      expect(parseDeepLink(`${WINDROSE_PROTOCOL}note.md|map-123,5,10,1.5,layer,extra`)).toBeNull(); // too many
    });

    it('returns null for invalid numeric values', () => {
      expect(parseDeepLink(`${WINDROSE_PROTOCOL}note.md|map-123,abc,10,1.5,layer`)).toBeNull();
      expect(parseDeepLink(`${WINDROSE_PROTOCOL}note.md|map-123,5,xyz,1.5,layer`)).toBeNull();
      expect(parseDeepLink(`${WINDROSE_PROTOCOL}note.md|map-123,5,10,not-a-number,layer`)).toBeNull();
    });

    it('returns null for empty notePath, mapId or layerId', () => {
      expect(parseDeepLink(`${WINDROSE_PROTOCOL}|map,5,10,1.5,layer`)).toBeNull();
      expect(parseDeepLink(`${WINDROSE_PROTOCOL}note.md|,5,10,1.5,layer`)).toBeNull();
      expect(parseDeepLink(`${WINDROSE_PROTOCOL}note.md|map,5,10,1.5,`)).toBeNull();
    });
  });

  describe('generateDeepLink', () => {
    it('generates valid deep link URL', () => {
      const result = generateDeepLink('folder/note.md', 'map-123', 5, 10, 1.5, 'layer-456');
      expect(result).toBe(`${WINDROSE_PROTOCOL}folder/note.md|map-123,5,10,1.5,layer-456`);
    });

    it('rounds coordinates to 2 decimal places', () => {
      const result = generateDeepLink('note.md', 'map-123', 5.12345, 10.98765, 1.55555, 'layer-456');
      expect(result).toBe(`${WINDROSE_PROTOCOL}note.md|map-123,5.12,10.99,1.56,layer-456`);
    });

    it('handles integer coordinates', () => {
      const result = generateDeepLink('note.md', 'map-123', 5, 10, 2, 'layer-456');
      expect(result).toBe(`${WINDROSE_PROTOCOL}note.md|map-123,5,10,2,layer-456`);
    });

    it('handles negative coordinates', () => {
      const result = generateDeepLink('world.md', 'hex-map', -5, -10, 1.2, 'layer-abc');
      expect(result).toBe(`${WINDROSE_PROTOCOL}world.md|hex-map,-5,-10,1.2,layer-abc`);
    });

    it('handles zero coordinates', () => {
      const result = generateDeepLink('map.md', 'map', 0, 0, 1, 'layer');
      expect(result).toBe(`${WINDROSE_PROTOCOL}map.md|map,0,0,1,layer`);
    });
  });

  describe('generateDeepLinkMarkdown', () => {
    it('generates valid markdown link', () => {
      const result = generateDeepLinkMarkdown('Throne Room', 'Maps/castle.md', 'castle-map', 15, 8, 1.2, 'layer-001');
      expect(result).toBe(`[Throne Room](${WINDROSE_PROTOCOL}Maps/castle.md|castle-map,15,8,1.2,layer-001)`);
    });

    it('escapes brackets in display text', () => {
      const result = generateDeepLinkMarkdown('Room [A]', 'note.md', 'map', 5, 5, 1, 'layer');
      expect(result).toBe(`[Room A](${WINDROSE_PROTOCOL}note.md|map,5,5,1,layer)`);
    });

    it('handles empty display text', () => {
      const result = generateDeepLinkMarkdown('', 'note.md', 'map', 5, 5, 1, 'layer');
      expect(result).toBe(`[](${WINDROSE_PROTOCOL}note.md|map,5,5,1,layer)`);
    });

    it('handles special characters in display text', () => {
      const result = generateDeepLinkMarkdown("King's Chamber", 'note.md', 'map', 5, 5, 1, 'layer');
      expect(result).toBe(`[King's Chamber](${WINDROSE_PROTOCOL}note.md|map,5,5,1,layer)`);
    });
  });

  describe('emitNavigationEvent', () => {
    beforeEach(() => {
      mockDispatchEvent.mockClear();
    });

    it('dispatches CustomEvent with correct detail', () => {
      emitNavigationEvent({
        notePath: 'folder/note.md',
        mapId: 'map-123',
        x: 5,
        y: 10,
        zoom: 1.5,
        layerId: 'layer-456'
      });

      expect(mockDispatchEvent).toHaveBeenCalledTimes(1);
      const event = mockDispatchEvent.mock.calls[0][0] as CustomEvent;
      expect(event.type).toBe('dmt-navigate-to');
      expect(event.detail.notePath).toBe('folder/note.md');
      expect(event.detail.mapId).toBe('map-123');
      expect(event.detail.x).toBe(5);
      expect(event.detail.y).toBe(10);
      expect(event.detail.zoom).toBe(1.5);
      expect(event.detail.layerId).toBe('layer-456');
      expect(typeof event.detail.timestamp).toBe('number');
    });

    it('includes timestamp in event detail', () => {
      const beforeTime = Date.now();

      emitNavigationEvent({
        notePath: 'note.md',
        mapId: 'map-123',
        x: 0,
        y: 0,
        zoom: 1,
        layerId: 'layer'
      });

      const afterTime = Date.now();
      const event = mockDispatchEvent.mock.calls[0][0] as CustomEvent;
      expect(event.detail.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(event.detail.timestamp).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('round-trip parsing', () => {
    it('can parse a generated link', () => {
      const generated = generateDeepLink('Maps/world.md', 'map-abc', 12.34, 56.78, 1.5, 'layer-xyz');
      const parsed = parseDeepLink(generated);
      expect(parsed).toEqual({
        notePath: 'Maps/world.md',
        mapId: 'map-abc',
        x: 12.34,
        y: 56.78,
        zoom: 1.5,
        layerId: 'layer-xyz'
      });
    });

    it('preserves precision through round-trip', () => {
      const generated = generateDeepLink('note.md', 'map', 1.99, 2.01, 0.99, 'layer');
      const parsed = parseDeepLink(generated);
      expect(parsed!.notePath).toBe('note.md');
      expect(parsed!.x).toBe(1.99);
      expect(parsed!.y).toBe(2.01);
      expect(parsed!.zoom).toBe(0.99);
    });
  });
});

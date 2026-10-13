import { describe, it, expect } from 'vitest';
import {
  DEEP_LINK_SELECTOR,
  hrefFromLinkElement,
  hrefFromHoverTarget,
  findWindroseHrefInLine,
  resolveHoverTarget,
} from '../../../src/core/deepLinkHoverTarget';
import type { LinkLikeElement } from '../../../src/core/deepLinkHoverTarget';

const LINK = 'windrose:Maps/World.md|world-map,3.5,4,1.18,layer_001';

function fakeLink(attrs: Record<string, string>): LinkLikeElement {
  return { getAttribute: (name: string) => attrs[name] ?? null };
}

describe('deepLinkHoverTarget', () => {
  describe('hrefFromLinkElement', () => {
    it('prefers the reading-view data-windrose-href', () => {
      expect(hrefFromLinkElement(fakeLink({ href: '#', 'data-windrose-href': LINK }))).toBe(LINK);
    });

    it('falls back to href and data-href', () => {
      expect(hrefFromLinkElement(fakeLink({ href: LINK }))).toBe(LINK);
      expect(hrefFromLinkElement(fakeLink({ 'data-href': LINK }))).toBe(LINK);
    });

    it('ignores non-windrose links', () => {
      expect(hrefFromLinkElement(fakeLink({ href: 'https://example.com' }))).toBeNull();
    });
  });

  describe('hrefFromHoverTarget', () => {
    it('resolves through closest() with the deep-link selector', () => {
      let seen = '';
      const target = {
        closest: (sel: string) => { seen = sel; return fakeLink({ 'data-windrose-href': LINK }); }
      };
      expect(hrefFromHoverTarget(target)).toBe(LINK);
      expect(seen).toBe(DEEP_LINK_SELECTOR);
    });

    it('returns null when no link encloses the target', () => {
      expect(hrefFromHoverTarget({ closest: () => null })).toBeNull();
      expect(hrefFromHoverTarget(null)).toBeNull();
    });
  });

  describe('findWindroseHrefInLine', () => {
    const line = `See [the tavern](${LINK}) and [elsewhere](https://x.y) or windrose:A.md|m,1,2,1,l bare`;

    it('finds the link when the pointer is on its text', () => {
      expect(findWindroseHrefInLine(line, line.indexOf('tavern'))).toBe(LINK);
    });

    it('finds the link when the pointer is on its url or brackets', () => {
      expect(findWindroseHrefInLine(line, line.indexOf('[the'))).toBe(LINK);
      expect(findWindroseHrefInLine(line, line.indexOf('world-map'))).toBe(LINK);
    });

    it('does not fall back to another link on the line', () => {
      expect(findWindroseHrefInLine(line, line.indexOf('elsewhere'))).toBeNull();
      expect(findWindroseHrefInLine(line, 0)).toBeNull();
    });

    it('finds bare windrose urls', () => {
      expect(findWindroseHrefInLine(line, line.indexOf('A.md'))).toBe('windrose:A.md|m,1,2,1,l');
    });

    it('returns null for a line with no deep links', () => {
      expect(findWindroseHrefInLine('plain text', 3)).toBeNull();
    });
  });

  describe('resolveHoverTarget', () => {
    it('parses the map id and position', () => {
      const parsed = resolveHoverTarget(LINK);
      expect(parsed).toMatchObject({
        notePath: 'Maps/World.md', mapId: 'world-map', x: 3.5, y: 4, zoom: 1.18, layerId: 'layer_001'
      });
    });

    it('returns null for empty or malformed hrefs', () => {
      expect(resolveHoverTarget(null)).toBeNull();
      expect(resolveHoverTarget('')).toBeNull();
      expect(resolveHoverTarget('windrose:Note.md|map,1,2')).toBeNull();
    });
  });
});

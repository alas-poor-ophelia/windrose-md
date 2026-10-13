// deepLinkHoverTarget.ts
// Pure hover-target detection for windrose: deep links. Shared by the
// reading-view and live-preview hover listeners in deepLinkRegistration.ts
// and covered by tests/unit/core/deepLinkHoverTarget.test.ts.

import { parseDeepLink, PROTOCOL } from '../persistence/deepLinkHandler';
import type { DeepLinkData } from '../persistence/deepLinkHandler';

/** Selector matching every rendered form of a windrose deep link anchor. */
export const DEEP_LINK_SELECTOR = 'a[href^="windrose:"], a[data-href^="windrose:"], a[data-windrose-href]';

/** Live-preview spans CodeMirror renders for markdown links. */
export const LIVE_PREVIEW_LINK_SELECTOR = '.cm-link, .cm-underline, .cm-url, .cm-hmd-internal-link';

/** The slice of an Element this module reads (keeps it DOM-free for tests). */
export interface LinkLikeElement {
  getAttribute(name: string): string | null;
}

export interface ClosestCapable {
  closest(selector: string): LinkLikeElement | null;
}

/** The windrose: href carried by a link element, or null when it has none. */
export function hrefFromLinkElement(link: LinkLikeElement): string | null {
  const candidates = [
    link.getAttribute('data-windrose-href'),
    link.getAttribute('href'),
    link.getAttribute('data-href'),
  ];
  for (const c of candidates) {
    if (c != null && c.startsWith(PROTOCOL)) return c;
  }
  return null;
}

/** The windrose: href of the deep-link anchor enclosing `target`, if any. */
export function hrefFromHoverTarget(target: ClosestCapable | null): string | null {
  if (target == null) return null;
  const link = target.closest(DEEP_LINK_SELECTOR);
  return link == null ? null : hrefFromLinkElement(link);
}

/**
 * Find the windrose: URL whose markdown link (`[text](windrose:...)`) or bare
 * URL span covers `localPos` (a character offset into `lineText`). Unlike the
 * click handler's lenient lookup, this never falls back to another link on
 * the line: a hover must sit on the link itself.
 */
export function findWindroseHrefInLine(lineText: string, localPos: number): string | null {
  let search = 0;
  while (true) {
    const idx = lineText.indexOf(PROTOCOL, search);
    if (idx === -1) return null;
    let end = idx;
    while (end < lineText.length) {
      const ch = lineText[end];
      if (ch === ')' || ch === ' ' || ch === '\t' || ch === '\n') break;
      end++;
    }
    const url = lineText.slice(idx, end);
    let start = idx;
    let stop = end;
    if (idx >= 2 && lineText.slice(idx - 2, idx) === '](') {
      const open = lineText.lastIndexOf('[', idx - 2);
      if (open !== -1) start = open;
      if (lineText[end] === ')') stop = end + 1;
    }
    if (localPos >= start && localPos <= stop) return url;
    search = Math.max(end, idx + PROTOCOL.length);
  }
}

/** Parse a hovered href into the map id and position the preview renders. */
export function resolveHoverTarget(href: string | null): DeepLinkData | null {
  if (href == null || href === '') return null;
  return parseDeepLink(href);
}

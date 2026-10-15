// deepLinkHoverTarget.ts
// Pure hover-target detection for windrose: deep links. Shared by the
// reading-view and live-preview hover listeners in deepLinkRegistration.ts
// and covered by tests/unit/core/deepLinkHoverTarget.test.ts.

import { parseDeepLink, PROTOCOL } from '../persistence/deepLinkHandler';
import type { DeepLinkData } from '../persistence/deepLinkHandler';
import type { MapData } from '#types/core/map.types';
import type { ExtendedGeometry, SelectedItem } from '#types/contexts/context.types';
import { createGeometry } from '../geometry/core/createGeometry';
import { parseSubHexPath, resolvableSubHexDepth, getMapAtSubHexPath } from '../persistence/subHexPath';

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

// ---------------------------------------------------------------------------
// Preview view resolution: where the hover preview centres, at what zoom, on
// which sub-hex level, and which object it highlights. Mirrors the click
// navigation (useCustomEventHandlers applyView): hex links carry axial q,r and
// are converted with hexToWorld (the renderer centres hex maps in world px),
// grid links carry cell units and are used as-is.
// ---------------------------------------------------------------------------

/** Zoom the click navigation uses when a link has no usable zoom. */
export const DEEP_LINK_FALLBACK_ZOOM = 1.175;
const MIN_PREVIEW_ZOOM = 0.05;
const MAX_PREVIEW_ZOOM = 4;
/** Link coordinates are rounded to 2 decimals; match within that. */
const LINK_COORD_EPSILON = 0.011;

/**
 * Preview zoom rule: the link's own zoom times the "Link preview zoom" slider
 * (the slider is a multiplier, default 0.5, because the popover is far smaller
 * than the map view). A link without a usable zoom uses the slider value alone.
 */
export function resolvePreviewZoom(linkZoom: number | null | undefined, sliderZoom: number): number {
  const slider = Number.isFinite(sliderZoom) && sliderZoom > 0 ? sliderZoom : 0.5;
  const raw = linkZoom != null && Number.isFinite(linkZoom) && linkZoom > 0 ? linkZoom * slider : slider;
  return Math.max(MIN_PREVIEW_ZOOM, Math.min(MAX_PREVIEW_ZOOM, raw));
}

export interface HoverPreviewView {
  /** The map level the preview renders (the root or the linked sub-hex map). */
  levelMap: MapData;
  geometry: ExtendedGeometry;
  /** viewState.center for renderCanvas: world px on hex maps, cells on grid maps. */
  center: { x: number; y: number };
  zoom: number;
  /** Layer to render, or undefined to keep the level's active layer. */
  layerId: string | undefined;
  /** The object or text label the link points at, drawn as a selection. */
  highlight: SelectedItem | null;
  /** '/'-joined sub-hex path actually rendered ('' for the root). */
  renderedSubHexPath: string;
}

export type HoverLinkView = Pick<DeepLinkData, 'x' | 'y' | 'zoom' | 'layerId' | 'subHexPath'>;

function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= LINK_COORD_EPSILON;
}

/** The object or text label whose copied-link position equals (x, y) (same formulas as Copy link). */
function findLinkedItem(
  map: MapData,
  layerId: string | undefined,
  x: number,
  y: number,
  geometry: ExtendedGeometry
): { item: SelectedItem; center: { x: number; y: number } } | null {
  const layer = map.layers?.find(l => l.id === layerId) ?? map.layers?.find(l => l.id === map.activeLayerId) ?? map.layers?.[0];
  if (layer == null) return null;
  const isHex = geometry.type === 'hex';

  for (const obj of layer.objects ?? []) {
    const size = obj.size ?? { width: 1, height: 1 };
    if (near(obj.position.x + size.width / 2, x) && near(obj.position.y + size.height / 2, y)) {
      let center = { x, y };
      if (geometry.type === 'hex') {
        const w = geometry.hexToWorld(obj.position.x, obj.position.y);
        center = { x: w.worldX, y: w.worldY };
      }
      return { item: { type: 'object', id: obj.id }, center };
    }
  }

  const gridSize = map.gridSize ?? 32;
  for (const label of layer.textLabels ?? []) {
    if (near(label.position.x / gridSize, x) && near(label.position.y / gridSize, y)) {
      const center = isHex
        ? { x: label.position.x, y: label.position.y }
        : { x: label.position.x / gridSize, y: label.position.y / gridSize };
      return { item: { type: 'text', id: label.id }, center };
    }
  }
  return null;
}

/** Link coordinates to a renderCanvas centre, exactly as the click navigation does. */
function linkCenter(geometry: ExtendedGeometry, x: number, y: number): { x: number; y: number } {
  if (geometry.type === 'hex') {
    const w = geometry.hexToWorld(x, y);
    return { x: w.worldX, y: w.worldY };
  }
  return { x, y };
}

/**
 * Resolve what the hover preview shows for a parsed link on `root`. A sub-hex
 * link renders the linked sub-map; when part of its path no longer exists the
 * deepest existing level is rendered, centred on the hex that leads to the
 * missing level (the link's x/y belong to the missing level, so no highlight).
 */
export function resolveHoverPreviewView(root: MapData, link: HoverLinkView, sliderZoom: number): HoverPreviewView {
  const path = parseSubHexPath(link.subHexPath);
  const depth = resolvableSubHexDepth(root, path);
  const renderedPath = path.slice(0, depth);
  const level = getMapAtSubHexPath(root, renderedPath) ?? root;
  const levelMap: MapData = depth > 0 && level.mapType == null ? { ...level, mapType: 'hex' } : level;
  const geometry = createGeometry(levelMap);
  const zoom = resolvePreviewZoom(link.zoom, sliderZoom);

  const hasLayer = link.layerId !== '' && (levelMap.layers ?? []).some(l => l.id === link.layerId);
  const layerId = hasLayer ? link.layerId : undefined;
  const base = { levelMap, geometry, zoom, layerId, renderedSubHexPath: renderedPath.join('/') };

  if (depth < path.length) {
    const [q, r] = path[depth].split(',').map(Number);
    const center = Number.isFinite(q) && Number.isFinite(r) ? linkCenter(geometry, q, r) : linkCenter(geometry, 0, 0);
    return { ...base, center, highlight: null };
  }

  const x = Number.isFinite(link.x) ? link.x : 0;
  const y = Number.isFinite(link.y) ? link.y : 0;
  const linked = findLinkedItem(levelMap, layerId, x, y, geometry);
  if (linked != null) return { ...base, center: linked.center, highlight: linked.item };
  return { ...base, center: linkCenter(geometry, x, y), highlight: null };
}

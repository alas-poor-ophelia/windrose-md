/**
 * svgGlyph.ts
 *
 * Safe rendering of the weather plugin's glyph SVG strings (api.glyph).
 * The string comes from another plugin, so it is never handed to an HTML
 * sink. It is parsed as image/svg+xml and checked against an ALLOWLIST:
 *
 * - Elements: plain shapes, groups, gradients, clip paths and masks. Any
 *   other element (script, style, a, use, image, animate, set,
 *   foreignObject, ...) rejects the whole glyph.
 * - Attributes: presentation and geometry attributes only. Anything else
 *   (on* handlers, style, href, xlink:href, filter, ...) is stripped.
 * - Paint references (fill, stroke, clip-path, mask, stop-color): a colour,
 *   `none`, `currentColor`, or `url(#id)` naming an element of the glyph.
 *   Anything else is stripped.
 * - A DOCTYPE (internal entities) rejects the glyph.
 *
 * Every id is prefixed per parsed instance and its `url(#id)` references
 * rewritten, so two glyphs on one page never resolve each other's
 * gradients. The checked node is imported into the host's document.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Hard cap on the glyph string; a weather glyph is a few hundred bytes */
const MAX_GLYPH_LENGTH = 64 * 1024;

/** SVG elements a glyph may use (localName, case-sensitive as in XML) */
const ALLOWED_ELEMENTS: ReadonlySet<string> = new Set([
  'svg', 'g', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse',
  'defs', 'linearGradient', 'radialGradient', 'stop', 'title', 'desc', 'clipPath', 'mask',
]);

/** Presentation and geometry attributes a glyph may carry */
const ALLOWED_ATTRIBUTES: ReadonlySet<string> = new Set([
  'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy', 'fr',
  'width', 'height', 'viewBox', 'points', 'transform', 'preserveAspectRatio',
  'fill', 'stroke', 'opacity', 'fill-rule', 'clip-rule', 'clip-path', 'mask',
  'stop-color', 'stop-opacity', 'offset',
  'gradientUnits', 'gradientTransform', 'spreadMethod', 'clipPathUnits', 'maskUnits', 'maskContentUnits',
  'id', 'class', 'role', 'aria-hidden', 'aria-label', 'xmlns', 'focusable',
  'vector-effect', 'shape-rendering',
]);

/** Attribute name prefixes allowed as a family (stroke-width, fill-opacity, ...) */
const ALLOWED_ATTRIBUTE_PREFIXES = ['stroke-', 'fill-'];

/** Attributes whose value is a paint or a reference */
const PAINT_ATTRIBUTES: ReadonlySet<string> = new Set(['fill', 'stroke', 'clip-path', 'mask', 'stop-color']);

/** A colour keyword (none, currentColor, named colours), hex, or rgb/hsl function */
const COLOR_VALUE = /^(?:[a-z]+|#[0-9a-f]{3,8}|(?:rgba?|hsla?)\(\s*[-+0-9.,%\s]*\))$/i;
/** A same-document reference */
const LOCAL_URL_VALUE = /^url\(\s*#([A-Za-z_][\w.-]*)\s*\)$/;
/** Values no non-paint attribute ever needs */
const ACTIVE_VALUE = /url\s*\(|javascript|vbscript|data\s*:|@import|expression\s*\(/i;

let instanceCounter = 0;

function isAllowedAttribute(name: string): boolean {
  return ALLOWED_ATTRIBUTES.has(name) || ALLOWED_ATTRIBUTE_PREFIXES.some(prefix => name.startsWith(prefix));
}

/** Every element of a tree, root first */
function allElements(root: Element): Element[] {
  return [root, ...Array.from(root.getElementsByTagName('*'))];
}

/**
 * Clean one element's attributes in place: strip the disallowed, prefix
 * ids, rewrite local references to the prefixed ids (and strip references
 * to ids the glyph does not define).
 */
function cleanAttributes(el: Element, ids: ReadonlyMap<string, string>, keptIds: ReadonlySet<Element>): void {
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name;
    const value = attr.value.trim();
    if (!isAllowedAttribute(name)) {
      el.removeAttributeNode(attr);
      continue;
    }
    if (name === 'id') {
      const renamed = keptIds.has(el) ? ids.get(value) : undefined;
      if (renamed != null) el.setAttribute('id', renamed);
      else el.removeAttribute('id');
      continue;
    }
    if (PAINT_ATTRIBUTES.has(name)) {
      const ref = LOCAL_URL_VALUE.exec(value);
      if (ref != null) {
        const target = ids.get(ref[1]);
        if (target != null) el.setAttribute(name, `url(#${target})`);
        else el.removeAttribute(name);
      } else if (!COLOR_VALUE.test(value)) {
        el.removeAttribute(name);
      }
      continue;
    }
    if (ACTIVE_VALUE.test(value)) el.removeAttribute(name);
  }
}

/**
 * Parse a glyph SVG string into a detached, cleaned <svg> element owned by
 * `doc`. Null when the string is not a well-formed SVG document, declares a
 * DOCTYPE, or uses an element outside the allowlist.
 */
function parseGlyphSvg(svg: string | null | undefined, doc: Document): SVGSVGElement | null {
  if (typeof svg !== 'string' || svg.trim() === '' || svg.length > MAX_GLYPH_LENGTH) return null;
  // Entities and external subsets come only through a DOCTYPE
  if (/<!DOCTYPE|<!ENTITY/i.test(svg)) return null;
  let parsed: Document;
  try {
    parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
  } catch {
    return null;
  }
  if (parsed.doctype != null) return null;
  const root = parsed.documentElement;
  if (root == null || root.localName !== 'svg' || root.namespaceURI !== SVG_NS) return null;
  if (parsed.getElementsByTagName('parsererror').length > 0) return null;

  const elements = allElements(root);
  for (const el of elements) {
    if (el.namespaceURI !== SVG_NS || !ALLOWED_ELEMENTS.has(el.localName)) return null;
  }

  // Ids: the first holder of each id keeps it, under a per-instance prefix
  const prefix = `windrose-glyph-${++instanceCounter}-`;
  const ids = new Map<string, string>();
  const keptIds = new Set<Element>();
  for (const el of elements) {
    const id = el.getAttribute('id')?.trim();
    if (id == null || id === '' || ids.has(id) || !/^[A-Za-z_][\w.-]*$/.test(id)) continue;
    ids.set(id, `${prefix}${id}`);
    keptIds.add(el);
  }
  for (const el of elements) cleanAttributes(el, ids, keptIds);

  return doc.importNode(root, true) as unknown as SVGSVGElement;
}

/**
 * Replace the host's children with the glyph. Returns false (host left
 * empty) when the glyph is missing or rejected.
 */
function mountGlyphSvg(host: Element, svg: string | null | undefined): boolean {
  while (host.firstChild != null) host.removeChild(host.firstChild);
  const node = parseGlyphSvg(svg, host.ownerDocument);
  if (node == null) return false;
  node.setAttribute('aria-hidden', 'true');
  node.setAttribute('focusable', 'false');
  host.appendChild(node);
  return true;
}

export { parseGlyphSvg, mountGlyphSvg };

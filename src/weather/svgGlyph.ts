/**
 * svgGlyph.ts
 *
 * Safe rendering of the weather plugin's glyph SVG strings (api.glyph).
 * The string comes from another plugin, so it is never handed to an HTML
 * sink: it is parsed as image/svg+xml, rejected outright when it carries
 * anything active (script, foreignObject, embedded documents, on*
 * handlers, javascript: links), and the parsed node is imported into the
 * host's document and appended.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Elements that can run code or embed foreign documents */
const FORBIDDEN_ELEMENTS = new Set(['script', 'foreignobject', 'iframe', 'object', 'embed', 'handler', 'listener']);

/** Hard cap on the glyph string; a weather glyph is a few hundred bytes */
const MAX_GLYPH_LENGTH = 64 * 1024;

function isUnsafeElement(el: Element): boolean {
  if (FORBIDDEN_ELEMENTS.has(el.localName.toLowerCase())) return true;
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    if (name.startsWith('on')) return true;
    if ((name === 'href' || name.endsWith(':href') || name === 'src') &&
        /^\s*(javascript|data:text\/html|vbscript)/i.test(attr.value)) {
      return true;
    }
  }
  return false;
}

/**
 * Parse a glyph SVG string into a detached <svg> element owned by `doc`.
 * Null when the string is not a well-formed SVG document or contains
 * anything active (the whole glyph is rejected, never partially cleaned).
 */
function parseGlyphSvg(svg: string | null | undefined, doc: Document): SVGSVGElement | null {
  if (typeof svg !== 'string' || svg.trim() === '' || svg.length > MAX_GLYPH_LENGTH) return null;
  let parsed: Document;
  try {
    parsed = new DOMParser().parseFromString(svg, 'image/svg+xml');
  } catch {
    return null;
  }
  const root = parsed.documentElement;
  if (root == null || root.localName !== 'svg' || root.namespaceURI !== SVG_NS) return null;
  if (parsed.getElementsByTagName('parsererror').length > 0) return null;
  if (isUnsafeElement(root)) return null;
  for (const el of Array.from(root.getElementsByTagName('*'))) {
    if (isUnsafeElement(el)) return null;
  }
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

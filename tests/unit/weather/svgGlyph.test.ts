// @vitest-environment happy-dom
/**
 * svgGlyph Unit Tests
 *
 * The weather plugin's glyph SVG is parsed as SVG, rejected whole when it
 * carries anything active, and appended as a node (never as markup).
 */

import { describe, it, expect } from "vitest";

import { parseGlyphSvg, mountGlyphSvg } from "../../../src/weather/svgGlyph";

const GOOD = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" fill="gold"/><path d="M1 1L2 2" stroke="#000"/></svg>';

describe("parseGlyphSvg", () => {
  it("parses a plain glyph into an svg element", () => {
    const el = parseGlyphSvg(GOOD, document);
    expect(el).not.toBeNull();
    expect(el?.localName).toBe("svg");
    expect(el?.querySelector("circle")).not.toBeNull();
    expect(el?.ownerDocument).toBe(document);
  });

  it.each([
    ['a script element', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
    ['an on* handler', '<svg xmlns="http://www.w3.org/2000/svg"><circle r="2" onclick="alert(1)"/></svg>'],
    ['an on* handler on the root', '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><circle r="2"/></svg>'],
    ['a javascript link', '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><a xlink:href="javascript:alert(1)"><circle r="2"/></a></svg>'],
    ['a foreignObject', '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject></svg>'],
    ['HTML instead of SVG', '<div>hi</div>'],
    ['an svg without the namespace', '<svg><circle r="2"/></svg>'],
    ['malformed markup', '<svg xmlns="http://www.w3.org/2000/svg"><circle'],
    ['an empty string', ''],
  ])("rejects %s", (_name, svg) => {
    expect(parseGlyphSvg(svg, document)).toBeNull();
  });

  it("rejects non-strings", () => {
    expect(parseGlyphSvg(null, document)).toBeNull();
    expect(parseGlyphSvg(undefined, document)).toBeNull();
  });
});

describe("mountGlyphSvg", () => {
  it("replaces the host's children with the glyph", () => {
    const host = document.createElement("span");
    host.appendChild(document.createElement("b"));
    expect(mountGlyphSvg(host, GOOD)).toBe(true);
    expect(host.children).toHaveLength(1);
    expect(host.firstElementChild?.localName).toBe("svg");
    expect(host.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
  });

  it("leaves the host empty for a rejected glyph", () => {
    const host = document.createElement("span");
    host.appendChild(document.createElement("b"));
    expect(mountGlyphSvg(host, '<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')).toBe(false);
    expect(host.childNodes).toHaveLength(0);
  });
});

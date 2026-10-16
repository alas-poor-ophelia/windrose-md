// @vitest-environment happy-dom
/**
 * svgGlyph Unit Tests
 *
 * The weather plugin's glyph SVG is parsed as SVG and checked against an
 * allowlist: a disallowed element rejects the glyph, disallowed attributes
 * and non-local paint references are stripped, ids are prefixed per
 * instance, and the node is appended (never as markup).
 */

import { describe, it, expect } from "vitest";

import { parseGlyphSvg, mountGlyphSvg } from "../../../src/weather/svgGlyph";

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const XLINK = 'xmlns:xlink="http://www.w3.org/1999/xlink"';

/** Every attribute of every element, as "element.attr=value" */
function attributeDump(el: Element): string[] {
  return [el, ...Array.from(el.querySelectorAll("*"))].flatMap(node =>
    Array.from(node.attributes).map(attr => `${node.localName}.${attr.name}=${attr.value}`));
}

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
    ['a javascript link', '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><a xlink:href="javascript:alert(1)"><circle r="2"/></a></svg>'],
    ['a tab-split javascript link', `<svg ${NS}><a href="java&#x9;script:alert(1)"><circle r="2"/></a></svg>`],
    ['a foreignObject', '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject></svg>'],
    ['animate retargeting an href', `<svg ${NS}><circle r="2"><animate attributeName="href" to="javascript:alert(1)"/></circle></svg>`],
    ['set retargeting an href', `<svg ${NS}><circle r="2"><set attributeName="href" to="javascript:alert(1)"/></circle></svg>`],
    ['a style element with @import', `<svg ${NS}><style>@import url(https://evil.example/x.css);</style><circle r="2"/></svg>`],
    ['an image with an href', `<svg ${NS} ${XLINK}><image xlink:href="https://evil.example/track.png" width="1" height="1"/></svg>`],
    ['a use with an external href', `<svg ${NS}><use href="https://evil.example/x.svg#a"/></svg>`],
    ['an element outside the SVG namespace', `<svg ${NS}><circle r="2"/><x:b xmlns:x="http://example.com/x"/></svg>`],
    ['an internal entity (DOCTYPE)', `<!DOCTYPE svg [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;">]><svg ${NS}><title>&b;</title></svg>`],
    ['HTML instead of SVG', '<div>hi</div>'],
    ['an svg without the namespace', '<svg><circle r="2"/></svg>'],
    ['malformed markup', '<svg xmlns="http://www.w3.org/2000/svg"><circle'],
    ['an empty string', ''],
  ])("rejects %s", (_name, svg) => {
    expect(parseGlyphSvg(svg, document)).toBeNull();
  });

  it("strips on* handlers, style and href attributes but keeps the shapes", () => {
    const el = parseGlyphSvg(`<svg ${NS} ${XLINK} onload="alert(1)"><circle r="2" onclick="alert(1)" style="fill:url(https://evil.example/)" xlink:href="javascript:alert(1)" href="java&#x9;script:x" fill="red"/></svg>`, document);
    expect(el).not.toBeNull();
    const dump = attributeDump(el!);
    expect(dump.some(entry => /onload|onclick|style|href/i.test(entry))).toBe(false);
    expect(dump).toContain("circle.fill=red");
    expect(dump).toContain("circle.r=2");
  });

  it("strips paint values that are not a colour or a local reference", () => {
    const el = parseGlyphSvg(`<svg ${NS}><rect width="1" height="1" fill="url(https://evil.example/p.svg#g)" stroke="url(javascript:alert(1))" clip-path="url(#missing)"/><path d="M0 0" fill="none" stroke="currentColor"/><circle r="1" fill="rgb(1, 2, 3)" stroke="#abc"/></svg>`, document);
    expect(el).not.toBeNull();
    const rect = el!.querySelector("rect")!;
    expect(rect.hasAttribute("fill")).toBe(false);
    expect(rect.hasAttribute("stroke")).toBe(false);
    expect(rect.hasAttribute("clip-path")).toBe(false);
    expect(el!.querySelector("path")?.getAttribute("fill")).toBe("none");
    expect(el!.querySelector("path")?.getAttribute("stroke")).toBe("currentColor");
    expect(el!.querySelector("circle")?.getAttribute("fill")).toBe("rgb(1, 2, 3)");
  });

  it("prefixes ids per instance and rewrites local references", () => {
    const svg = `<svg ${NS}><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient><clipPath id="c"><rect width="2" height="2"/></clipPath></defs><circle r="2" fill="url(#g)" clip-path="url( #c )"/></svg>`;
    const a = parseGlyphSvg(svg, document)!;
    const b = parseGlyphSvg(svg, document)!;
    const idA = a.querySelector("linearGradient")!.getAttribute("id")!;
    const idB = b.querySelector("linearGradient")!.getAttribute("id")!;
    expect(idA).not.toBe("g");
    expect(idA).not.toBe(idB);
    expect(a.querySelector("circle")?.getAttribute("fill")).toBe(`url(#${idA})`);
    expect(a.querySelector("circle")?.getAttribute("clip-path")).toBe(`url(#${a.querySelector("clipPath")!.getAttribute("id")!})`);
  });

  it("keeps only the first holder of a duplicated id", () => {
    const el = parseGlyphSvg(`<svg ${NS}><defs><linearGradient id="g"/><radialGradient id="g"/></defs><circle r="2" fill="url(#g)"/></svg>`, document)!;
    const linearId = el.querySelector("linearGradient")!.getAttribute("id");
    expect(linearId).toMatch(/g$/);
    expect(el.querySelector("radialGradient")!.hasAttribute("id")).toBe(false);
    expect(el.querySelector("circle")!.getAttribute("fill")).toBe(`url(#${linearId})`);
  });

  it("rejects a glyph over the 64 KB cap", () => {
    const big = `<svg ${NS}><path d="${"M0 0 ".repeat(14000)}"/></svg>`;
    expect(big.length).toBeGreaterThan(64 * 1024);
    expect(parseGlyphSvg(big, document)).toBeNull();
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

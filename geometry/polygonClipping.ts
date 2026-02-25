/**
 * polygonClipping.ts
 *
 * Datacore wrapper for the vendored polygon-clipping library.
 * Provides typed polygon boolean operations (difference, union, intersection).
 *
 * At runtime in Obsidian: loads the UMD bundle from the vault via app.vault.read().
 * In unit tests: the datacore-transformer converts this to an ES import from npm.
 */
const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { getBasePath } = await dc.require(pathResolverPath) as {
  getBasePath: () => string;
};

// Type definitions matching polygon-clipping's API
type Ring = [number, number][];
type Polygon = Ring[];
type MultiPolygon = Polygon[];

type DifferenceFn = (subject: Polygon | MultiPolygon, ...clips: (Polygon | MultiPolygon)[]) => MultiPolygon;

// Load the vendored UMD bundle at runtime
const bundlePath = `${getBasePath()}/vendor/polygon-clipping.umd.js`;
const bundleFile = app.vault.getAbstractFileByPath(bundlePath);
if (!bundleFile) {
  throw new Error(`[polygonClipping] Bundle not found at: ${bundlePath}`);
}
const bundleSource = await app.vault.read(bundleFile);

// Evaluate the UMD bundle in a scoped context that captures module.exports
const moduleObj: { exports: Record<string, unknown> } = { exports: {} };
const wrappedFn = new Function('module', 'exports', bundleSource);
wrappedFn(moduleObj, moduleObj.exports);

const pc = (moduleObj.exports.default || moduleObj.exports) as {
  difference: DifferenceFn;
};

const difference: DifferenceFn = pc.difference;

return { difference };

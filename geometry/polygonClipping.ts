/**
 * polygonClipping.ts
 *
 * Typed interface to the vendored polygon-clipping library.
 * Loads the wrapper module which embeds the UMD bundle inline,
 * so it works in both dev (Datacore in vault) and production
 * (compiled markdown with no filesystem access).
 *
 * In unit tests: mocked to use the npm polygon-clipping package directly.
 */

// Type definitions matching polygon-clipping's API
type Ring = [number, number][];
type Polygon = Ring[];
type MultiPolygon = Polygon[];

type DifferenceFn = (subject: Polygon | MultiPolygon, ...clips: (Polygon | MultiPolygon)[]) => MultiPolygon;

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

const pcModule = await requireModuleByName("polygon-clipping-wrapper.js") as {
  difference: DifferenceFn;
};

const difference: DifferenceFn = pcModule.difference;

return { difference };

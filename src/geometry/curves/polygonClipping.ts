/**
 * polygonClipping.ts
 *
 * Typed interface to the polygon-clipping library.
 * In standalone mode, imports directly from the npm package.
 */

import polygonClipping from 'polygon-clipping';

type Ring = [number, number][];
type Polygon = Ring[];
type MultiPolygon = Polygon[];

type DifferenceFn = (subject: Polygon | MultiPolygon, ...clips: (Polygon | MultiPolygon)[]) => MultiPolygon;
type UnionFn = (subject: Polygon | MultiPolygon, ...others: (Polygon | MultiPolygon)[]) => MultiPolygon;

const difference: DifferenceFn = polygonClipping.difference;
const union: UnionFn = polygonClipping.union;

export { difference, union };

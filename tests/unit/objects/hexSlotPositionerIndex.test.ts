/**
 * getObjectsInCellIndexed: the per-cell index the ladder element pass uses for
 * hex slot layout must answer exactly what the plain getObjectsInCell filter does.
 */

import { describe, it, expect } from "vitest";

import type { MapObject } from "#types/objects/object.types";
import { getObjectsInCell, getObjectsInCellIndexed } from "../../../src/objects/hexSlotPositioner";

const obj = (id: string, x: number, y: number, homeLevel?: number): MapObject =>
  ({ id, type: "entrance", position: { x, y }, size: { width: 1, height: 1 }, ...(homeLevel === undefined ? {} : { homeLevel }) }) as MapObject;

describe("getObjectsInCellIndexed", () => {
  const objects = [obj("a", 0, 0), obj("b", 1, 0), obj("c", 0, 0, 1), obj("d", 0, 0), obj("e", 0, 0, 0), obj("f", 3, -1, 2)];

  it("matches the plain filter for every cell and rung, in the same order", () => {
    for (const [x, y] of [[0, 0], [1, 0], [3, -1], [9, 9]]) {
      for (const home of [0, 1, 2, undefined]) {
        expect(getObjectsInCellIndexed(objects, x, y, home)).toEqual(getObjectsInCell(objects, x, y, home));
      }
    }
    expect(getObjectsInCellIndexed(objects, 0, 0, 0).map((o) => o.id)).toEqual(["a", "d", "e"]);
  });

  it("rebuilds after an in-place push and for a new array", () => {
    const list = [obj("a", 0, 0)];
    expect(getObjectsInCellIndexed(list, 0, 0, 0)).toHaveLength(1);
    list.push(obj("b", 0, 0));
    expect(getObjectsInCellIndexed(list, 0, 0, 0).map((o) => o.id)).toEqual(["a", "b"]);
    expect(getObjectsInCellIndexed([obj("z", 0, 0)], 0, 0, 0).map((o) => o.id)).toEqual(["z"]);
  });
});

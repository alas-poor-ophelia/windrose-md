/**
 * Built-in + custom object/category resolution (DUP-17).
 *
 * The map palette (getResolvedCategories / getResolvedObjectTypes) and the
 * settings tab (ObjectHelpers.getCategories / getResolved) must resolve
 * through the same merge, so a custom category's sort order lands in the same
 * slot in both places.
 */

import { describe, it, expect, afterEach } from "vitest";

import {
  getResolvedCategories,
  getResolvedObjectTypes,
  mergeBuiltInAndCustomCategories,
  mergeBuiltInAndCustomObjects,
} from "../../../src/objects/objectTypeResolver";
import { ObjectHelpers } from "../../../src/settings/helpers/objectHelpers";
import { setPlugin, clearPlugin } from "../../../src/core/settingsAccessor";
import { OBJECT_TYPES } from "../../../src/objects/objectTypes";

import type { App } from "obsidian";

const customCategory = { id: "custom-cat-traps", label: "Traps", order: 25 };
const customObject = { id: "custom-obj-1", symbol: "X", label: "Spike", category: "custom-cat-traps" };
const hiddenId = OBJECT_TYPES[0].id;
const renamedId = OBJECT_TYPES[1].id;

const objectSettings = {
  objectOverrides: {
    [hiddenId]: { hidden: true },
    [renamedId]: { label: "Renamed" },
  },
  customObjects: [customObject],
  customCategories: [customCategory],
};

function installPlugin(): void {
  setPlugin({
    app: {} as App,
    dataFilePath: "data.json",
    settings: {
      gridObjectOverrides: objectSettings.objectOverrides,
      customGridObjects: objectSettings.customObjects,
      customGridCategories: objectSettings.customCategories,
    },
  });
}

describe("object/category resolution", () => {
  afterEach(() => {
    clearPlugin();
  });

  it("palette and settings tab agree on category order for a custom category with order 25", () => {
    installPlugin();

    const palette = getResolvedCategories("grid").map((c) => c.id);
    const settingsTab = ObjectHelpers.getCategories(objectSettings).map((c) => c.id);

    expect(settingsTab).toEqual(palette);
    // order 25 sorts between hazards (20) and features (30)
    expect(palette.indexOf("custom-cat-traps")).toBe(palette.indexOf("hazards") + 1);
    expect(palette.indexOf("custom-cat-traps")).toBe(palette.indexOf("features") - 1);
  });

  it("built-in categories use the 10..50 order table", () => {
    const orders = Object.fromEntries(
      mergeBuiltInAndCustomCategories({}).map((c) => [c.id, c.order])
    );
    expect(orders).toMatchObject({ navigation: 10, hazards: 20, features: 30, encounters: 40, markers: 50 });
  });

  it("custom categories without an order go after the built-ins", () => {
    const resolved = mergeBuiltInAndCustomCategories({ customCategories: [{ id: "c", label: "C" }] });
    expect(resolved[resolved.length - 1]).toMatchObject({ id: "c", order: 100, isCustom: true, isBuiltIn: false });
  });

  it("palette and settings tab resolve the same objects", () => {
    installPlugin();

    const palette = getResolvedObjectTypes("grid");
    const settingsTab = ObjectHelpers.getResolved(objectSettings);

    expect(settingsTab).toEqual(palette);
    expect(palette.find((o) => o.id === hiddenId)).toBeUndefined();
    expect(palette.find((o) => o.id === renamedId)).toMatchObject({ label: "Renamed", isModified: true, isBuiltIn: true });
    expect(palette.find((o) => o.id === "custom-obj-1")).toMatchObject({ order: 1000, isCustom: true, isBuiltIn: false });
  });

  it("built-in objects default to index * 10 order", () => {
    const resolved = mergeBuiltInAndCustomObjects({});
    expect(resolved.slice(0, 3).map((o) => o.order)).toEqual([0, 10, 20]);
  });
});

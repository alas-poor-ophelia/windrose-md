import { test } from "obsidian-testing-framework";
import { doWithApp } from "obsidian-testing-framework/lib/util.js";
import { expect } from "vitest";

test("Windrose loads without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => {
    // Filter for Windrose-related errors (dmt = dungeon map tracker)
    const msg = err.message.toLowerCase();
    if (msg.includes("windrose") || msg.includes("dmt") || msg.includes("dungeon")) {
      errors.push(err.message);
    }
  });

  // Navigate to test map
  await doWithApp(page, async (app: any) => {
    const file = app.vault.getAbstractFileByPath("_testing/smoke-test-map.md");
    if (file) {
      await app.workspace.openLinkText(file.path, "", false);
    } else {
      throw new Error("Test file _testing/smoke-test-map.md not found in vault");
    }
  });

  // Wait for Windrose container to render
  const container = page.locator(".dmt-container");
  await container.waitFor({ state: "visible", timeout: 10000 });

  // Wait for canvas wrapper
  const canvasWrapper = page.locator(".dmt-canvas-wrapper");
  await canvasWrapper.waitFor({ state: "visible", timeout: 5000 });

  // Verify canvas wrapper has dimensions
  const box = await canvasWrapper.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThan(0);
  expect(box!.height).toBeGreaterThan(0);

  // Verify no Windrose-specific JavaScript errors
  expect(errors).toHaveLength(0);
});

test("Windrose controls render", async ({ page }) => {
  // Navigate to test map
  await doWithApp(page, async (app: any) => {
    const file = app.vault.getAbstractFileByPath("_testing/smoke-test-map.md");
    if (file) {
      await app.workspace.openLinkText(file.path, "", false);
    }
  });

  // Wait for container
  const container = page.locator(".dmt-container");
  await container.waitFor({ state: "visible", timeout: 10000 });

  // Check controls overlay
  const controls = page.locator(".dmt-controls");
  await controls.waitFor({ state: "visible", timeout: 5000 });

  // Check compass
  const compass = page.locator(".dmt-compass");
  await compass.waitFor({ state: "visible", timeout: 5000 });
});

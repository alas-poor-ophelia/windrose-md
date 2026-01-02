import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.test.ts",
  timeout: 120000,
  retries: 0,
  workers: 1, // Run tests sequentially since we share one Obsidian instance
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    trace: "on-first-retry",
  },
});

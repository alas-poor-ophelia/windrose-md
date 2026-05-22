import { defineConfig } from "vitest/config";
import path from "path";

const testVaultPath = path.resolve(__dirname, "tests/fixtures/test-vault");

export default defineConfig({
  test: {
    // E2E tests using obsidian-testing-framework
    include: ["tests/e2e/**/*.test.ts"],
    // Longer timeout for Obsidian startup
    testTimeout: 60000,
    hookTimeout: 60000,
    // Retry flaky tests (Obsidian sometimes doesn't render)
    retry: 1,
    // Run tests sequentially since each launches Obsidian
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // Setup symlinks before tests run
    globalSetup: ["tests/e2e/setup.ts"],
    // Inject test vault path for obsidian-testing-framework
    provide: {
      vault: testVaultPath,
    },
  },
});

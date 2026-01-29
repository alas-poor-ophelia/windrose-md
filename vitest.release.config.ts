import { defineConfig } from "vitest/config";
import path from "path";

const testVaultPath = path.resolve(__dirname, "tests/fixtures/test-vault-compiled");

/**
 * Vitest config for testing the COMPILED Windrose artifact.
 *
 * Uses the same test suite as the main config, but the WINDROSE_TEST_MODE=compiled
 * environment variable causes helpers.ts to use the compiled test maps.
 */
export default defineConfig({
  test: {
    // Same E2E tests
    include: ["tests/e2e/**/*.test.ts"],
    // Longer timeout for Obsidian startup
    testTimeout: 60000,
    hookTimeout: 60000,
    // Run tests sequentially since each launches Obsidian
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // Same setup (symlinks still needed for vault structure)
    globalSetup: ["tests/e2e/setup.ts"],
    // Inject test vault path for obsidian-testing-framework
    provide: {
      vault: testVaultPath,
    },
    // Environment variables for compiled mode
    env: {
      WINDROSE_TEST_MODE: "compiled",
    },
  },
});

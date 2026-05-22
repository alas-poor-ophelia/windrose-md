import { defineConfig } from "vitest/config";
import path from "path";

const testVaultPath = path.resolve(__dirname, "tests/fixtures/test-vault");

/**
 * Vitest config for release validation.
 *
 * Runs the same E2E test suite as the main config but produces
 * a JSON report for the release pipeline to parse.
 */
export default defineConfig({
  test: {
    include: ["tests/e2e/**/*.test.ts"],
    testTimeout: 60000,
    hookTimeout: 60000,
    retry: 1,
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    globalSetup: ["tests/e2e/setup.ts"],
    provide: {
      vault: testVaultPath,
    },
    reporters: ["default", "json"],
    outputFile: {
      json: "test-results.json",
    },
  },
});

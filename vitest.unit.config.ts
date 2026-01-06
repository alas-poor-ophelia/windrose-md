import { defineConfig } from "vitest/config";
import path from "path";
import { datacoreTransformer } from "./tests/unit/datacore-transformer";

export default defineConfig({
  plugins: [
    // Transform Datacore-style modules (return {}) to ES modules (export {})
    datacoreTransformer({
      sourceDir: "src",
      debug: false, // Set to true to see transformation logs
    }),
  ],
  test: {
    // Unit tests - standalone, no Obsidian
    include: ["tests/unit/**/*.test.ts"],
    // Fast timeout for unit tests
    testTimeout: 5000,
    hookTimeout: 5000,
    // Run tests in parallel for speed
    pool: "threads",
    // Coverage (optional, enable with --coverage)
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: [
        "src/**/*.d.ts",
        "src/**/CLAUDE.md",
      ],
    },
  },
  resolve: {
    alias: {
      // Allow importing types from the types directory
      "#types": path.resolve(__dirname, "types"),
    },
  },
});

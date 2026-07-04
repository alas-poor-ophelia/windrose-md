/**
 * ESLint Configuration for Windrose MapDesigner
 *
 * Flat config (ESLint 9+). Dev folder with src/ symlinked to vault.
 *
 * Adopts the FULL official `eslint-plugin-obsidianmd` recommended preset
 * (v0.3.0), which is a flat-config ARRAY bundling:
 *   - eslint:recommended
 *   - typescript-eslint recommended-type-checked
 *   - security plugins (no-unsanitized, @microsoft/sdl, depend, import)
 *   - JSON linting of package.json (@eslint/json)
 *   - the obsidianmd plugin rules
 *
 * NOTE: `obsidianmd.configs.recommended` MUST be spread at TOP LEVEL of this
 * array — it is NOT a rules object. Spreading it inside a `rules: {}` block
 * (as the 0.1.x config did) silently disables every rule.
 */

import tsparser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import obsidianmd from "eslint-plugin-obsidianmd";

const disableTypeChecked = tsPlugin.configs["disable-type-checked"].rules;

// Map of every obsidian rule set to "off". Used for:
//  - JSON files: the preset applies obsidian code-rules with no `files`
//    restriction, so they leak onto package.json where type-checked ones crash.
//  - tests/scripts: non-shipped Node code is not held to plugin-source rules.
const obsidianRulesOff = Object.fromEntries(
  Object.keys(obsidianmd.rules).map((r) => [`obsidianmd/${r}`, "off"])
);

// Rules that are meaningless for non-shipped Node test/build code.
const nonShippedNodeRulesOff = {
  ...obsidianRulesOff,
  "import/no-nodejs-modules": "off",
  "import/no-extraneous-dependencies": "off",
  "@typescript-eslint/no-require-imports": "off",
  "no-undef": "off", // tsc (with @types/node) covers undefined symbols here
  "@typescript-eslint/no-explicit-any": "off",
  "no-console": "off"
};

export default [
  // ===========================================
  // Official Obsidian recommended preset (top-level spread)
  // ===========================================
  ...obsidianmd.configs.recommended,

  // Obsidian code-rules must not run on JSON-language files.
  {
    files: ["**/*.json"],
    rules: obsidianRulesOff
  },

  // ===========================================
  // Type-aware parsing for ALL first-party TS/TSX.
  // projectService resolves the nearest tsconfig per file, so type-checked
  // rules have parser services everywhere (src, tests, scripts, types).
  // ===========================================
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.ts", "scripts/**/*.ts", "types/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true }
      }
    }
  },

  // ===========================================
  // Source (shipped plugin code) — curated project rules layered on top
  // ===========================================
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooksPlugin
    },
    rules: {
      // TypeScript strictness (project conventions)
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-function-return-type": ["warn", {
        allowExpressions: true,
        allowTypedFunctionExpressions: true
      }],
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        ignoreRestSiblings: true
      }],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/strict-boolean-expressions": "warn",
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/no-misused-promises": ["warn", {
        checksVoidReturn: { attributes: false }
      }],
      "@typescript-eslint/consistent-type-imports": ["warn", {
        prefer: "type-imports",
        fixStyle: "separate-type-imports"
      }],
      "@typescript-eslint/no-unnecessary-type-assertion": "warn",
      "@typescript-eslint/prefer-nullish-coalescing": "warn",

      // WindroseMDSettingsTab is a fully custom, tabbed Preact-rendered settings
      // UI (dozens of render*Content methods), not standard declarative Setting
      // rows. The declarative getSettingDefinitions() API (Obsidian 1.13.0
      // settings-search) does not model this UI without a full tab rewrite, which
      // is out of scope. The store reviewer did not flag this rule; it only
      // surfaced locally after the obsidianmd 0.3.0 -> 0.4.1 bump. Off by design.
      "obsidianmd/settings-tab/prefer-setting-definitions": "off",

      // React Hooks (Preact compatible)
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // Standard ESLint
      "no-unreachable": "error",
      // Plugin diagnostics via console.debug/info/warn/error (all '[Windrose]'-prefixed) are intentional; only console.log is noise.
      "no-console": ["warn", { allow: ["debug", "info", "warn", "error"] }],
      "eqeqeq": ["error", "always", { null: "ignore" }],
      "prefer-const": "error",

      // Sentence-case for UI strings, with project-specific protections:
      // brands + product name, technical acronyms, and a skip-list for strings
      // carrying code tokens (paths, snake_case ids, hex, the windrose-map
      // block name), lone glyphs, parentheticals, and +-prefixed buttons.
      "obsidianmd/ui/sentence-case": ["error", {
        enforceCamelCaseLower: true,
        brands: ["Windrose", "Dungeondraft", "RPGAwesome", "MapDesigner"],
        acronyms: ["MD", "ID", "RGB", "RPG", "DD", "JSON", "SVG", "PNG", "URL"],
        ignoreWords: ["Unicode"],
        ignoreRegex: ["/", "_", "#", "windrose-map", "^x$", "^\\s*\\(", "^\\+"]
      }]
    }
  },

  // ===========================================
  // Test files (E2E + unit) — not shipped; relax type-checked + style noise
  // ===========================================
  {
    files: ["tests/**/*.ts"],
    rules: {
      ...disableTypeChecked,
      ...nonShippedNodeRulesOff
    }
  },

  // ===========================================
  // Scripts (release automation, etc.) — not shipped
  // ===========================================
  {
    files: ["scripts/**/*.ts"],
    rules: {
      ...disableTypeChecked,
      ...nonShippedNodeRulesOff
    }
  },

  // ===========================================
  // Type definition files
  // ===========================================
  {
    files: ["types/**/*.ts"],
    rules: {
      ...disableTypeChecked,
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        ignoreRestSiblings: true
      }]
    }
  },

  // ===========================================
  // Ignore patterns
  // ===========================================
  {
    ignores: [
      "node_modules/**",
      "mcp/**",
      "types/generated/**",
      "tests/fixtures/**",
      ".claude/**",
      ".wt/**",
      "internal/**",
      // Data / output / config dirs (not plugin source)
      "objects/**",
      "test-results/**",
      "**/*.json",
      "*.md",
      // Build artifacts
      "main.js",
      "styles.css",
      // Non-TS scripts / build files (plugin source is TS only)
      "**/*.mjs",
      "**/*.cjs",
      "*.config.ts",
      // Legacy JS files in vault - not linted
      "src/**/*.js",
      "src/**/*.jsx"
    ]
  }
];

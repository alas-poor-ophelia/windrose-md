/**
 * ESLint Configuration for Windrose MapDesigner
 * 
 * Uses flat config format (ESLint 9+)
 * 
 * Structure: Dev folder with src/ symlinked to vault
 */

import tsparser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import obsidianmd from "eslint-plugin-obsidianmd";

export default [
  // ===========================================
  // TypeScript Files (in src/ symlink)
  // ===========================================
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { 
        project: "./tsconfig.json",
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooksPlugin,
      "obsidianmd": obsidianmd
    },
    rules: {
      // ===========================================
      // TypeScript Strict Rules
      // ===========================================
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-function-return-type": ["warn", {
        "allowExpressions": true,
        "allowTypedFunctionExpressions": true
      }],
      "@typescript-eslint/no-unused-vars": ["error", {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_",
        "caughtErrorsIgnorePattern": "^_",
        "ignoreRestSiblings": true
      }],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/strict-boolean-expressions": "warn",
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/no-misused-promises": ["warn", {
        "checksVoidReturn": { "attributes": false }
      }],
      "@typescript-eslint/consistent-type-imports": ["warn", {
        "prefer": "type-imports",
        "fixStyle": "separate-type-imports"
      }],
      "@typescript-eslint/no-unnecessary-type-assertion": "warn",
      "@typescript-eslint/prefer-nullish-coalescing": "warn",

      // ===========================================
      // React Hooks Rules (Preact compatible)
      // ===========================================
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // ===========================================
      // Standard ESLint Rules
      // ===========================================
      "no-unreachable": "error",
      "no-console": "warn",
      "eqeqeq": ["error", "always", { "null": "ignore" }],
      "prefer-const": "error",

      // ===========================================
      // Obsidian Community Plugin Rules (recommended)
      // ===========================================
      ...obsidianmd.configs.recommended
    }
  },
  
  // ===========================================
  // Test files (E2E tests)
  // ===========================================
  {
    files: ["tests/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.json",
        ecmaVersion: 2022,
        sourceType: "module"
      }
    },
    plugins: {
      "@typescript-eslint": tsPlugin
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off", // Tests use any for page objects
      "no-console": "off" // Console is fine in tests
    }
  },

  // ===========================================
  // Scripts (release automation, etc.)
  // ===========================================
  {
    files: ["scripts/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.json",
        ecmaVersion: 2022,
        sourceType: "module"
      }
    },
    plugins: {
      "@typescript-eslint": tsPlugin
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off", // Scripts use any for Obsidian internals
      "no-console": "off" // Console output is the UI for CLI scripts
    }
  },

  // ===========================================
  // Type definition files
  // ===========================================
  {
    files: ["types/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { 
        project: "./tsconfig.json",
        ecmaVersion: 2022,
        sourceType: "module"
      }
    },
    plugins: {
      "@typescript-eslint": tsPlugin
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_",
        "caughtErrorsIgnorePattern": "^_",
        "ignoreRestSiblings": true
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
      "*.md",
      // Build artifacts
      "main.js",
      "styles.css",
      // Legacy JS files in vault - not linted
      "src/**/*.js",
      "src/**/*.jsx"
    ]
  }
];

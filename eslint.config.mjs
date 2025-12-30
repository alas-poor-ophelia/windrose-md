/**
 * ESLint Configuration for Windrose MapDesigner
 * 
 * Uses flat config format (ESLint 9+)
 * 
 * Structure: Dev folder with src/ symlinked to vault
 */

import tsparser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
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
          jsx: true,
          globalReturn: true  // Datacore wraps scripts in async function
        }
      },
      globals: {
        dc: "readonly"  // Datacore global
      }
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
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
        "varsIgnorePattern": "^_"
      }],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/strict-boolean-expressions": "warn",
      "@typescript-eslint/no-non-null-assertion": "warn",
      
      // ===========================================
      // Standard ESLint Rules
      // ===========================================
      "no-unreachable": "error",
      "no-console": "warn",
      "eqeqeq": ["error", "always"],
      "prefer-const": "error",
      
      // ===========================================
      // Obsidian-Specific Rules
      // ===========================================
      "obsidianmd/regex-lookbehind": "error",
      "obsidianmd/platform": "warn",
      "obsidianmd/no-static-styles-assignment": "warn"
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
        "varsIgnorePattern": "^_"
      }]
    }
  },
  
  // ===========================================
  // Ignore patterns
  // ===========================================
  {
    ignores: [
      "node_modules/**",
      "types/generated/**",
      "*.md",
      // Legacy JS files in vault - not linted
      "src/**/*.js",
      "src/**/*.jsx"
    ]
  }
];

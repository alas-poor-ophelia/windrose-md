// Scanner-replica lint config: the RAW eslint-plugin-obsidianmd recommended
// preset with NO local rule customizations, approximating what the Obsidian
// store scan runs. Local gate opt-outs and option-tuning deliberately absent.
// Not part of npm run lint — invoke explicitly:
//   npx eslint --config eslint.scanner-replica.mjs "src/**/*.{ts,tsx}"
import tsparser from "@typescript-eslint/parser";
import obsidianmd from "eslint-plugin-obsidianmd";

export default [
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
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
  { ignores: ["node_modules/**", "main.js", "**/*.json", "**/*.mjs"] }
];

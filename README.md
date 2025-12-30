# Windrose Dev Harness

TypeScript/ESLint infrastructure for Windrose MapDesigner. Lives outside the Obsidian vault to avoid indexing bloat.

## Setup

1. Clone repo
2. `npm install`
3. Create symlink to vault source folder (run as Admin):
   ```powershell
   New-Item -ItemType SymbolicLink -Path "src" -Target "C:\path\to\vault\Projects\dungeon-map-tracker"
   ```
4. Open in VS Code, select "Use Workspace Version" for TypeScript
5. Restart VS Code (required for TS plugin to load)

## Commands

```bash
npm run check      # typecheck + lint
npm run typecheck  # typescript only
npm run lint       # eslint only
npm run lint:fix   # eslint with auto-fix
```

## Structure

```
windrose/
├── src/                     ← symlink to vault source files
├── types/                   ← type definitions
├── ts-plugin-datacore/      ← custom TS plugin for Datacore patterns
├── tsconfig.json
├── eslint.config.mjs
└── package.json
```

## Notes

- Source files live in the vault, not this repo
- `ts-plugin-datacore` suppresses TS1108 errors (top-level return) from Datacore's module pattern
- New source files go in the vault; they appear here via symlink

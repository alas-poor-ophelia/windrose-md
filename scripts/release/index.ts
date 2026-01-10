#!/usr/bin/env npx tsx
/**
 * Windrose Release Orchestrator
 *
 * Usage:
 *   npm run release              # Full release: compile, test, tag, push
 *   npm run release:dry          # Dry run: compile, test, but don't tag
 *   npm run release -- --skip-compile    # Skip compilation step
 *   npm run release -- --skip-tests      # Skip test step
 */

import { execSync, spawnSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import * as path from "path";
import { compileViaObsidian } from "./compile.js";

// Configuration - adjust these paths as needed
const SOURCE_ROOT =
  "C:\\Users\\whipl\\OneDrive\\Documents\\Absalom\\Projects\\dungeon-map-tracker";
const DEV_ROOT = "C:\\Dev\\windrose";
const OUTPUT_PATH = path.join(SOURCE_ROOT, "dist", "compiled-windrose-md.md");
const VERSION_PATH = path.join(SOURCE_ROOT, "dist", "VERSION");
const CHANGELOG_PATH = path.join(SOURCE_ROOT, "dist", "CHANGELOG.md");

// Datacore Compiler command ID for Windrose
const DEFAULT_COMPILER_COMMAND = "dc-compiler:compile-projects-dungeon-map-tracker--compilersettings";

interface ReleaseOptions {
  skipCompile: boolean;
  skipTests: boolean;
  dryRun: boolean;
  commandId: string;
}

function parseArgs(): ReleaseOptions {
  const args = process.argv.slice(2);
  return {
    skipCompile: args.includes("--skip-compile"),
    skipTests: args.includes("--skip-tests"),
    dryRun: args.includes("--dry-run"),
    commandId:
      args.find((a) => a.startsWith("--command="))?.split("=")[1] ||
      process.env.WINDROSE_COMPILER_COMMAND ||
      DEFAULT_COMPILER_COMMAND,
  };
}

function getVersion(): string {
  if (!existsSync(VERSION_PATH)) {
    throw new Error(`VERSION file not found at ${VERSION_PATH}`);
  }
  return readFileSync(VERSION_PATH, "utf-8").trim();
}

function checkPrerequisites(version: string): void {
  console.log("Checking prerequisites...\n");

  // Check VERSION file exists
  if (!existsSync(VERSION_PATH)) {
    throw new Error(`VERSION file not found. Create it at: ${VERSION_PATH}`);
  }
  console.log(`  VERSION: ${version}`);

  // Check CHANGELOG exists and mentions this version
  if (!existsSync(CHANGELOG_PATH)) {
    throw new Error(
      `CHANGELOG.md not found. Create it at: ${CHANGELOG_PATH}`
    );
  }
  const changelog = readFileSync(CHANGELOG_PATH, "utf-8");
  if (!changelog.includes(version)) {
    console.warn(
      `  WARNING: CHANGELOG.md does not mention version ${version}`
    );
  } else {
    console.log(`  CHANGELOG: mentions v${version}`);
  }

  // Check git status (in source repo)
  const gitStatus = execSync("git status --porcelain", {
    cwd: SOURCE_ROOT,
    encoding: "utf-8",
  });
  if (gitStatus.trim()) {
    console.warn("  WARNING: Uncommitted changes in source repo:");
    console.warn(
      gitStatus
        .split("\n")
        .map((l) => "    " + l)
        .join("\n")
    );
  } else {
    console.log("  Git: clean working directory");
  }

  // Check if tag already exists
  const tagName = `v${version}`;
  try {
    execSync(`git rev-parse ${tagName}`, {
      cwd: SOURCE_ROOT,
      stdio: "pipe",
    });
    throw new Error(
      `Tag ${tagName} already exists. Update VERSION to a new version.`
    );
  } catch (e: any) {
    if (e.message.includes("already exists")) throw e;
    // Tag doesn't exist, good
    console.log(`  Tag: ${tagName} does not exist yet`);
  }

  console.log("");
}

async function runCompile(commandId: string): Promise<void> {
  console.log("Step 1: Compiling via Obsidian...\n");

  const result = await compileViaObsidian({
    commandId,
    outputPath: OUTPUT_PATH,
    timeout: 120000,
  });

  if (!result.success) {
    throw new Error(`Compilation failed: ${result.error}`);
  }

  console.log("");
}

function runTests(): void {
  console.log("Step 2: Running E2E tests against compiled artifact...\n");

  const result = spawnSync("npm", ["run", "test:release"], {
    cwd: DEV_ROOT,
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      WINDROSE_TEST_MODE: "compiled",
    },
  });

  if (result.status !== 0) {
    throw new Error("Tests failed. Fix issues and retry.");
  }

  console.log("\n  All tests passed.\n");
}

function createTag(version: string, dryRun: boolean): void {
  const tagName = `v${version}`;
  console.log(`Step 3: Creating tag ${tagName}...\n`);

  if (dryRun) {
    console.log(`  [DRY RUN] Would create tag: ${tagName}`);
    console.log(`  [DRY RUN] Would push tag to origin`);
    return;
  }

  // Create annotated tag
  execSync(
    `git tag -a ${tagName} -m "Release ${version}"`,
    { cwd: SOURCE_ROOT }
  );
  console.log(`  Created tag: ${tagName}`);

  // Push tag to origin
  execSync(`git push origin ${tagName}`, { cwd: SOURCE_ROOT });
  console.log(`  Pushed tag to origin`);
  console.log(`  GitHub Actions will create the release.\n`);
}

async function main(): Promise<void> {
  const options = parseArgs();

  console.log("╔════════════════════════════════════════════╗");
  console.log("║       Windrose Release Pipeline            ║");
  console.log("╚════════════════════════════════════════════╝\n");

  if (options.dryRun) {
    console.log("*** DRY RUN MODE - No tags will be created ***\n");
  }

  const version = getVersion();
  checkPrerequisites(version);

  // Step 1: Compile
  if (options.skipCompile) {
    console.log("Step 1: Skipping compilation (--skip-compile)\n");
  } else {
    await runCompile(options.commandId);
  }

  // Step 2: Test
  if (options.skipTests) {
    console.log("Step 2: Skipping tests (--skip-tests)\n");
  } else {
    runTests();
  }

  // Step 3: Tag and push
  createTag(version, options.dryRun);

  console.log("╔════════════════════════════════════════════╗");
  console.log("║       Release Pipeline Complete!           ║");
  console.log("╚════════════════════════════════════════════╝\n");

  if (!options.dryRun) {
    console.log(`Version ${version} has been tagged and pushed.`);
    console.log("Check GitHub Actions for release status.");
  }
}

main().catch((e) => {
  console.error("\n╔════════════════════════════════════════════╗");
  console.error("║       Release Pipeline FAILED              ║");
  console.error("╚════════════════════════════════════════════╝\n");
  console.error("Error:", e.message);
  process.exit(1);
});

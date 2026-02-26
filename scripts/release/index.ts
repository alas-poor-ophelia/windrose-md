#!/usr/bin/env npx tsx
/**
 * Windrose Release Orchestrator
 *
 * Steps:
 *   1. Compile via Obsidian's Datacore Compiler
 *   2. Run E2E tests against compiled artifact
 *   3. Commit and push compiled artifact to source repo
 *   4. Create and push version tag (triggers GitHub Actions release)
 *
 * Usage:
 *   npm run release              # Full release: compile, test, commit, tag
 *   npm run release:dry          # Dry run: compile, test, but don't commit/tag
 *   npm run release -- --skip-compile    # Skip compilation step
 *   npm run release -- --skip-tests      # Skip test step
 */

import { execSync, spawnSync } from "child_process";
import { readFileSync, existsSync, copyFileSync } from "fs";
import * as path from "path";
import { compileViaObsidian } from "./compile.js";

// Configuration - adjust these paths as needed
const SOURCE_ROOT =
  "C:\\Users\\whipl\\OneDrive\\Documents\\Absalom\\Projects\\dungeon-map-tracker";
const DEV_ROOT = "C:\\Dev\\windrose";
const OUTPUT_PATH = path.join(SOURCE_ROOT, "dist", "compiled-windrose-md.md");
const VERSION_PATH = path.join(SOURCE_ROOT, "dist", "VERSION");
const CHANGELOG_PATH = path.join(SOURCE_ROOT, "dist", "CHANGELOG.md");
const COMPILED_TEST_VAULT = path.join(DEV_ROOT, "tests", "fixtures", "test-vault-compiled");
const COMPILED_TEST_ARTIFACT = path.join(COMPILED_TEST_VAULT, "_compiled", "compiled-windrose-md.md");

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

  // CRITICAL: Ensure we're on main branch (or release branch for dry runs)
  const currentBranch = execSync("git branch --show-current", {
    cwd: SOURCE_ROOT,
    encoding: "utf-8",
  }).trim();
  if (currentBranch !== "main" && !currentBranch.startsWith("release/")) {
    throw new Error(
      `Must be on 'main' or 'release/*' branch to release. Currently on '${currentBranch}'. Run: git checkout main`
    );
  }
  console.log(`  Branch: ${currentBranch}`);

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

  // Copy compiled artifact to test-vault-compiled for release tests
  copyFileSync(OUTPUT_PATH, COMPILED_TEST_ARTIFACT);
  console.log(`  Copied artifact to test-vault-compiled`);

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

function commitAndPushArtifact(version: string, dryRun: boolean): string | null {
  console.log(`Step 3: Committing compiled artifact...\n`);

  // Check if there are changes to commit
  const gitStatus = execSync("git status --porcelain dist/", {
    cwd: SOURCE_ROOT,
    encoding: "utf-8",
  });

  if (!gitStatus.trim()) {
    console.log("  No changes to compiled artifact detected.");
    console.log("  WARNING: This may indicate compilation didn't produce changes.\n");
    // Return current HEAD - we'll verify it contains the artifact before tagging
    return execSync("git rev-parse HEAD", { cwd: SOURCE_ROOT, encoding: "utf-8" }).trim();
  }

  if (dryRun) {
    console.log(`  [DRY RUN] Would commit compiled artifact`);
    console.log(`  [DRY RUN] Would push to origin`);
    console.log("");
    return null; // Dry run, no commit SHA to return
  }

  // Stage the compiled artifact and any dist changes
  execSync("git add dist/compiled-windrose-md.md dist/VERSION", {
    cwd: SOURCE_ROOT,
  });
  console.log("  Staged compiled artifact");

  // Commit
  execSync(
    `git commit -m "Release ${version}: compiled artifact"`,
    { cwd: SOURCE_ROOT }
  );
  const commitSha = execSync("git rev-parse HEAD", { cwd: SOURCE_ROOT, encoding: "utf-8" }).trim();
  console.log(`  Committed: Release ${version}: compiled artifact (${commitSha.slice(0, 7)})`);

  // Push to current branch (with upstream if needed)
  try {
    execSync("git push", { cwd: SOURCE_ROOT, stdio: "inherit" });
  } catch {
    // Branch may not have upstream set, try with --set-upstream
    const branch = execSync("git branch --show-current", {
      cwd: SOURCE_ROOT,
      encoding: "utf-8",
    }).trim();
    execSync(`git push --set-upstream origin ${branch}`, { cwd: SOURCE_ROOT, stdio: "inherit" });
  }
  console.log("  Pushed to origin");

  // Verify push succeeded by fetching and comparing
  console.log("  Verifying push...");
  execSync("git fetch origin main", { cwd: SOURCE_ROOT, stdio: "pipe" });
  const remoteHead = execSync("git rev-parse origin/main", { cwd: SOURCE_ROOT, encoding: "utf-8" }).trim();
  if (remoteHead !== commitSha) {
    throw new Error(`Push verification failed: local HEAD (${commitSha.slice(0, 7)}) != remote (${remoteHead.slice(0, 7)})`);
  }
  console.log(`  Verified: remote main is at ${commitSha.slice(0, 7)}\n`);

  return commitSha;
}

function createTag(version: string, dryRun: boolean, expectedCommit: string | null): void {
  const tagName = `v${version}`;
  console.log(`Step 4: Creating tag ${tagName}...\n`);

  // CRITICAL: Verify we're tagging the right commit
  const currentHead = execSync("git rev-parse HEAD", { cwd: SOURCE_ROOT, encoding: "utf-8" }).trim();

  if (expectedCommit && currentHead !== expectedCommit) {
    throw new Error(
      `HEAD changed unexpectedly!\n` +
      `  Expected: ${expectedCommit.slice(0, 7)}\n` +
      `  Current:  ${currentHead.slice(0, 7)}\n` +
      `  Aborting to prevent tagging wrong commit.`
    );
  }

  // Verify the compiled artifact exists and was modified recently
  const artifactStat = execSync(
    `git log -1 --format="%H %s" -- dist/compiled-windrose-md.md`,
    { cwd: SOURCE_ROOT, encoding: "utf-8" }
  ).trim();

  if (!artifactStat.includes(currentHead.slice(0, 7)) && !artifactStat.toLowerCase().includes("release")) {
    console.warn(`  WARNING: compiled-windrose-md.md was not modified in the current commit.`);
    console.warn(`  Last modified in: ${artifactStat}`);
    console.warn(`  Current HEAD: ${currentHead.slice(0, 7)}`);
    console.warn(`  Proceeding anyway, but verify this is intentional.\n`);
  }

  if (dryRun) {
    console.log(`  [DRY RUN] Would create tag: ${tagName} at ${currentHead.slice(0, 7)}`);
    console.log(`  [DRY RUN] Would push tag to origin`);
    return;
  }

  // Create annotated tag
  execSync(
    `git tag -a ${tagName} -m "Release ${version}"`,
    { cwd: SOURCE_ROOT }
  );
  console.log(`  Created tag: ${tagName} at ${currentHead.slice(0, 7)}`);

  // Push tag to origin
  execSync(`git push origin ${tagName}`, { cwd: SOURCE_ROOT, stdio: "inherit" });
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

  // Step 3: Commit and push compiled artifact
  let artifactCommit: string | null = null;
  if (!options.skipCompile) {
    artifactCommit = commitAndPushArtifact(version, options.dryRun);
  } else {
    console.log("Step 3: Skipping artifact commit (compilation was skipped)\n");
  }

  // Step 4: Tag and push (pass commit SHA for verification)
  createTag(version, options.dryRun, artifactCommit);

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

#!/usr/bin/env npx tsx
/**
 * Windrose Standalone Release Pipeline
 *
 * Steps:
 *   1. Verify prerequisites (clean git, no existing tag)
 *   2. Optionally bump version in manifest.json, package.json, versions.json
 *   3. Build production bundle (esbuild + SCSS)
 *   4. Run tests (unit required, E2E optional)
 *   5. Commit version bump, create tag, push (triggers GitHub Actions release)
 *   6. Verify GitHub release has correct assets
 *
 * Usage:
 *   npm run release                           # Full release from current version
 *   npm run release:dry                       # Dry run: build + test only
 *   npm run release -- --bump 2.1.0           # Bump version first
 *   npm run release -- --skip-tests           # Skip test step entirely
 *   npm run release -- --skip-e2e             # Skip E2E tests (unit only)
 *   npm run release -- --allow-branch         # Allow release from non-main branch
 */

import { execSync, spawnSync, spawn as spawnChild } from "child_process";
import { readFileSync, writeFileSync, existsSync, openSync, closeSync } from "fs";
import * as path from "path";

const DEV_ROOT = path.resolve(import.meta.dirname, "../..");
const TEST_LOG_PATH = path.join(DEV_ROOT, "test-output.log");
const TEST_RESULTS_PATH = path.join(DEV_ROOT, "test-results.json");

interface ReleaseOptions {
  bump: string | null;
  skipTests: boolean;
  skipE2E: boolean;
  dryRun: boolean;
  allowBranch: boolean;
}

function parseArgs(): ReleaseOptions {
  const args = process.argv.slice(2);
  const bumpIdx = args.indexOf("--bump");
  return {
    bump: bumpIdx >= 0 ? args[bumpIdx + 1] : null,
    skipTests: args.includes("--skip-tests"),
    skipE2E: args.includes("--skip-e2e"),
    dryRun: args.includes("--dry-run"),
    allowBranch: args.includes("--allow-branch"),
  };
}

function readManifest(): { version: string; minAppVersion: string } {
  return JSON.parse(readFileSync(path.join(DEV_ROOT, "manifest.json"), "utf-8"));
}

function getVersion(): string {
  return readManifest().version;
}

function bumpVersion(newVersion: string): void {
  console.log(`  Bumping version to ${newVersion}...\n`);

  // manifest.json
  const manifestPath = path.join(DEV_ROOT, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  manifest.version = newVersion;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`    manifest.json → ${newVersion}`);

  // package.json
  const pkgPath = path.join(DEV_ROOT, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  pkg.version = newVersion;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`    package.json → ${newVersion}`);

  // versions.json
  const versionsPath = path.join(DEV_ROOT, "versions.json");
  const versions = existsSync(versionsPath)
    ? JSON.parse(readFileSync(versionsPath, "utf-8"))
    : {};
  versions[newVersion] = manifest.minAppVersion;
  writeFileSync(versionsPath, JSON.stringify(versions, null, 2) + "\n");
  console.log(`    versions.json → ${newVersion}: ${manifest.minAppVersion}`);
  console.log("");
}

function checkPrerequisites(version: string, allowBranch: boolean): void {
  console.log("Checking prerequisites...\n");

  const branch = execSync("git branch --show-current", {
    cwd: DEV_ROOT,
    encoding: "utf-8",
  }).trim();

  if (!allowBranch && branch !== "main" && !branch.startsWith("release/")) {
    throw new Error(
      `Must be on 'main' or 'release/*' branch to release (on '${branch}').\n` +
      `  Use --allow-branch to release from the current branch.`
    );
  }
  console.log(`  Branch: ${branch}${!allowBranch ? "" : " (--allow-branch)"}`);
  console.log(`  Version: ${version}`);

  // Check if tag already exists
  const tagName = `v${version}`;
  try {
    execSync(`git rev-parse ${tagName}`, { cwd: DEV_ROOT, stdio: "pipe" });
    throw new Error(`Tag ${tagName} already exists. Bump the version first.`);
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("already exists")) throw e;
    console.log(`  Tag: ${tagName} does not exist yet`);
  }

  // Verify build artifacts are gitignored
  const mainJsTracked = execSync("git ls-files main.js", { cwd: DEV_ROOT, encoding: "utf-8" }).trim();
  if (mainJsTracked) {
    console.warn("  WARNING: main.js is tracked by git. It should be gitignored (built by CI).");
  }

  console.log("");
}

function buildProduction(): void {
  console.log("Step 1: Building production bundle...\n");

  execSync("npm run build:prod", { cwd: DEV_ROOT, stdio: "inherit" });

  // Verify outputs
  const mainJs = path.join(DEV_ROOT, "main.js");
  const stylesCss = path.join(DEV_ROOT, "styles.css");
  if (!existsSync(mainJs)) throw new Error("Build failed: main.js not found");
  if (!existsSync(stylesCss)) throw new Error("Build failed: styles.css not found");

  const mainSize = readFileSync(mainJs).length;
  const cssSize = readFileSync(stylesCss).length;
  console.log(`\n  main.js:    ${(mainSize / 1024).toFixed(0)} KB`);
  console.log(`  styles.css: ${(cssSize / 1024).toFixed(0)} KB\n`);
}

function printTestSummary(jsonPath: string): { passed: boolean } {
  if (!existsSync(jsonPath)) {
    console.log("  WARNING: No test-results.json found. Check test-output.log for details.");
    return { passed: false };
  }

  const results = JSON.parse(readFileSync(jsonPath, "utf-8"));
  const testFiles = results.testResults || [];
  const passedFiles = testFiles.filter((f: Record<string, unknown>) => f.status === "passed").length;
  const failedFiles = testFiles.filter((f: Record<string, unknown>) => f.status === "failed");

  let totalTests = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const file of testFiles) {
    for (const test of (file as Record<string, unknown[]>).assertionResults || []) {
      totalTests++;
      const t = test as Record<string, string>;
      if (t.status === "passed") totalPassed++;
      else if (t.status === "failed") totalFailed++;
      else totalSkipped++;
    }
  }

  console.log(`\n  ── Test Results ──────────────────────────────`);
  console.log(`  Files:  ${passedFiles} passed, ${failedFiles.length} failed (${testFiles.length} total)`);
  console.log(`  Tests:  ${totalPassed} passed, ${totalFailed} failed, ${totalSkipped} skipped (${totalTests} total)`);

  if (failedFiles.length > 0) {
    console.log(`\n  ── Failures ─────────────────────────────────`);
    for (const file of failedFiles) {
      const f = file as Record<string, unknown>;
      const relPath = path.relative(DEV_ROOT, f.name as string);
      console.log(`\n  FAIL ${relPath}`);
      for (const test of (f.assertionResults as Record<string, unknown>[]) || []) {
        if (test.status === "failed") {
          const ancestors = (test.ancestorTitles as string[]) || [];
          console.log(`    ✗ ${ancestors.join(" > ")}${ancestors.length ? " > " : ""}${test.title}`);
          const msg = ((test.failureMessages as string[]) || []).join("\n");
          const lines = msg.split("\n").slice(0, 10);
          for (const line of lines) {
            console.log(`      ${line}`);
          }
        }
      }
    }
  }

  console.log(`\n  Full output: ${TEST_LOG_PATH}\n`);
  return { passed: failedFiles.length === 0 };
}

async function runTests(skipE2E: boolean): Promise<void> {
  console.log(`Step 2: Running tests${skipE2E ? " (unit only)" : " (unit + E2E)"}...\n`);

  // Unit tests always run inline
  const unitResult = spawnSync("npm", ["run", "test:unit"], {
    cwd: DEV_ROOT,
    stdio: "inherit",
    shell: true,
  });

  if (unitResult.status !== 0) {
    throw new Error("Unit tests failed.");
  }
  console.log("");

  // E2E tests run by default; skip with --skip-e2e
  if (!skipE2E) {
    console.log("  Running E2E tests (background, offscreen)...\n");
    await runE2EBackground();
  }
}

function runE2EBackground(): Promise<void> {
  return new Promise((resolve, reject) => {
    const logFd = openSync(TEST_LOG_PATH, "w");
    const child = spawnChild("npm", ["run", "test:release"], {
      cwd: DEV_ROOT,
      stdio: ["ignore", logFd, logFd],
      shell: true,
      detached: false,
    });

    const startTime = Date.now();
    const timer = setInterval(() => {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      process.stdout.write(`\r  E2E running... ${elapsed}s elapsed`);
    }, 5000);

    child.on("close", (code: number | null) => {
      clearInterval(timer);
      closeSync(logFd);
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      process.stdout.write(`\r  E2E completed in ${elapsed}s\n\n`);

      const { passed } = printTestSummary(TEST_RESULTS_PATH);
      if (code !== 0 || !passed) {
        reject(new Error("E2E tests failed. See test-output.log for details."));
      } else {
        resolve();
      }
    });

    child.on("error", (err: Error) => {
      clearInterval(timer);
      closeSync(logFd);
      reject(err);
    });
  });
}

function commitAndTag(version: string, dryRun: boolean): void {
  const tagName = `v${version}`;

  // Check if there are version-related changes to commit
  const gitStatus = execSync("git status --porcelain manifest.json package.json versions.json", {
    cwd: DEV_ROOT,
    encoding: "utf-8",
  }).trim();

  if (gitStatus) {
    console.log(`Step 3: Committing version bump...\n`);

    if (dryRun) {
      console.log(`  [DRY RUN] Would commit: ${gitStatus.replace(/\n/g, ", ")}\n`);
    } else {
      execSync("git add manifest.json package.json versions.json", { cwd: DEV_ROOT });
      execSync(`git commit -m "Release ${version}"`, { cwd: DEV_ROOT });
      console.log(`  Committed version bump\n`);
    }
  }

  console.log(`Step 4: Tagging ${tagName}...\n`);

  if (dryRun) {
    console.log(`  [DRY RUN] Would create tag: ${tagName}`);
    console.log(`  [DRY RUN] Would push branch + tag to origin\n`);
    return;
  }

  execSync(`git tag -a ${tagName} -m "Release ${version}"`, { cwd: DEV_ROOT });
  console.log(`  Created tag: ${tagName}`);

  // Push branch and tag
  const branch = execSync("git branch --show-current", { cwd: DEV_ROOT, encoding: "utf-8" }).trim();
  try {
    execSync(`git push origin ${branch}`, { cwd: DEV_ROOT, stdio: "inherit" });
  } catch {
    execSync(`git push --set-upstream origin ${branch}`, { cwd: DEV_ROOT, stdio: "inherit" });
  }
  execSync(`git push origin ${tagName}`, { cwd: DEV_ROOT, stdio: "inherit" });
  console.log(`  Pushed ${branch} + ${tagName} to origin\n`);
}

function waitForRelease(version: string, maxWait: number = 180000): void {
  const tagName = `v${version}`;
  console.log(`Step 5: Verifying GitHub release...\n`);
  console.log(`  Waiting for GitHub Actions to create release for ${tagName}...`);

  const startTime = Date.now();
  const pollInterval = 10000;
  const requiredAssets = ["main.js", "styles.css", "manifest.json"];

  while (Date.now() - startTime < maxWait) {
    try {
      const result = execSync(
        `gh release view ${tagName} --json assets --jq ".assets[].name"`,
        { cwd: DEV_ROOT, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
      );
      const assets = result.trim().split("\n");
      if (requiredAssets.every(a => assets.includes(a))) {
        console.log(`\n  Release found with all required assets:`);
        for (const asset of assets) {
          console.log(`    - ${asset}`);
        }
        console.log("");
        return;
      }
    } catch {
      // Release doesn't exist yet
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    process.stdout.write(`  Waiting... (${elapsed}s)\r`);
    spawnSync("node", ["-e", `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,${pollInterval})`], { stdio: "ignore" });
  }

  console.warn(`\n  WARNING: Release not verified after ${maxWait / 1000}s. Check GitHub manually.\n`);
}

async function main(): Promise<void> {
  const options = parseArgs();

  console.log("╔════════════════════════════════════════════╗");
  console.log("║    Windrose Standalone Release Pipeline    ║");
  console.log("╚════════════════════════════════════════════╝\n");

  if (options.dryRun) {
    console.log("*** DRY RUN MODE — will build and test but not tag/push ***\n");
  }

  // Bump version if requested
  if (options.bump) {
    bumpVersion(options.bump);
  }

  const version = getVersion();
  checkPrerequisites(version, options.allowBranch);

  // Step 1: Build
  buildProduction();

  // Step 2: Test
  if (options.skipTests) {
    console.log("Step 2: Skipping tests (--skip-tests)\n");
  } else {
    await runTests(options.skipE2E);
  }

  // Steps 3-4: Commit + Tag + Push
  commitAndTag(version, options.dryRun);

  // Step 5: Verify release
  if (!options.dryRun) {
    waitForRelease(version);
  }

  console.log("╔════════════════════════════════════════════╗");
  console.log("║    Release Pipeline Complete!              ║");
  console.log("╚════════════════════════════════════════════╝\n");

  if (!options.dryRun) {
    console.log(`  Version ${version} tagged and pushed.`);
    console.log(`  GitHub Actions creating release with main.js + styles.css + manifest.json`);
  } else {
    console.log(`  Dry run complete. Build and tests passed for v${version}.`);
  }
}

main().catch((e) => {
  console.error("\n╔════════════════════════════════════════════╗");
  console.error("║    Release Pipeline FAILED                ║");
  console.error("╚════════════════════════════════════════════╝\n");
  console.error("Error:", e.message);
  process.exit(1);
});

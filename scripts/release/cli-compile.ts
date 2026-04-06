/**
 * Compile Windrose via Obsidian CLI
 *
 * Uses the Obsidian CLI to execute the compile command on a running Obsidian instance,
 * then reloads the settings plugin and takes a verification screenshot.
 *
 * Much faster than compile.ts which launches a separate Obsidian instance via Playwright.
 * Requires: Obsidian running with Absalom vault, CLI enabled in Settings > General.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync, statSync } from "fs";
import * as path from "path";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execFileAsync = promisify(execFile);

const OBSIDIAN_CLI = path.join(
  process.env.LOCALAPPDATA || "",
  "Programs",
  "obsidian",
  "Obsidian.com"
);

const VAULT = "Absalom";
const PLUGIN_ID = "dungeon-map-tracker-settings";
const COMPILED_OUTPUT = "C:\\Users\\whipl\\OneDrive\\Documents\\Absalom\\Projects\\dungeon-map-tracker\\dist\\compiled-windrose-md.md";
const COMPILE_COMMAND = "dc-compiler:compile-projects-dungeon-map-tracker--compilersettings";

async function cli(...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(OBSIDIAN_CLI, [`vault=${VAULT}`, ...args], { timeout: 30000 });
  return stdout.trim();
}

/**
 * Post-process the compiled output (same fixes as compile.ts)
 */
function postProcess(outputPath: string): void {
  console.log("  Post-processing compiled output...");
  let content = readFileSync(outputPath, "utf-8");

  content = content.replace(
    /const \{?\s*getJsonPath\s*\}? = pathResolverImport;\r?\n?/g,
    ""
  );
  content = content.replace(
    /const DATA_FILE_PATH: string = getJsonPath\(\);/g,
    'const DATA_FILE_PATH: string = dc.resolvePath("windrose-md-data.json");'
  );
  content = content.replace(
    /\/\/ =+\r?\n\/\/ Datacore Imports\r?\n\/\/ =+\r?\n\r?\n(?=\/\/ =+\r?\n\/\/ Theme Configuration)/,
    ""
  );

  writeFileSync(outputPath, content);
  console.log("  Post-processing complete");
}

async function main() {
  const startTime = Date.now();
  const keepScreenshot = process.argv.includes("--screenshot");
  const skipReload = process.argv.includes("--skip-reload");

  console.log("Windrose CLI Compile\n");

  // Step 1: Verify Obsidian is running and CLI works
  console.log("1. Verifying Obsidian CLI connection...");
  try {
    const version = await cli("version");
    console.log(`   Obsidian ${version}`);
  } catch (e: any) {
    console.error("   Failed to connect to Obsidian. Is it running?");
    console.error(`   ${e.message}`);
    process.exit(1);
  }

  // Step 2: Check errors before compile
  console.log("2. Checking pre-compile error state...");
  const preErrors = await cli("dev:errors");
  console.log(`   ${preErrors}`);

  // Step 3: Record output file mtime
  const initialMtime = existsSync(COMPILED_OUTPUT)
    ? statSync(COMPILED_OUTPUT).mtimeMs
    : 0;

  // Step 4: Execute compile command
  console.log(`3. Executing compile command...`);
  console.log(`   Command: ${COMPILE_COMMAND}`);
  try {
    const result = await cli("command", `id=${COMPILE_COMMAND}`);
    console.log(`   ${result || "Command sent"}`);
  } catch (e: any) {
    console.error(`   Failed to execute command: ${e.message}`);
    process.exit(1);
  }

  // Step 5: Poll for output file update
  console.log("4. Waiting for compilation to complete...");
  const timeout = 120000;
  const pollStart = Date.now();
  while (Date.now() - pollStart < timeout) {
    if (existsSync(COMPILED_OUTPUT)) {
      const currentMtime = statSync(COMPILED_OUTPUT).mtimeMs;
      if (currentMtime > initialMtime) {
        const compileDuration = Date.now() - pollStart;
        console.log(`   Compiled in ${compileDuration}ms`);
        break;
      }
    }
    await new Promise(r => setTimeout(r, 1000));
    if ((Date.now() - pollStart) % 10000 < 1000) {
      process.stdout.write(".");
    }
  }

  if (existsSync(COMPILED_OUTPUT) && statSync(COMPILED_OUTPUT).mtimeMs <= initialMtime) {
    console.error("   Compilation timed out — output file was not updated");
    process.exit(1);
  }

  // Step 6: Post-process
  postProcess(COMPILED_OUTPUT);

  // Step 7: Reload plugin
  if (!skipReload) {
    console.log("5. Reloading settings plugin...");
    const reloadResult = await cli("plugin:reload", `id=${PLUGIN_ID}`);
    console.log(`   ${reloadResult}`);
  }

  // Step 8: Check errors after compile
  console.log("6. Checking post-compile error state...");
  const postErrors = await cli("dev:errors");
  console.log(`   ${postErrors}`);

  // Step 9: Take verification screenshot
  if (keepScreenshot) {
    console.log("7. Taking verification screenshot...");
    const screenshotPath = path.resolve(__dirname, "..", "..", "tests", "e2e", "screenshots", `compile-verify-${Date.now()}.png`);
    const result = await cli("dev:screenshot", `path=${screenshotPath}`);
    console.log(`   Screenshot: ${result}`);
  }

  const totalDuration = Date.now() - startTime;
  console.log(`\nDone in ${totalDuration}ms`);

  if (postErrors !== "No errors captured.") {
    console.warn("\n⚠ Errors detected after compilation — review above");
    process.exit(1);
  }
}

main().catch(e => {
  console.error("Unexpected error:", e);
  process.exit(1);
});

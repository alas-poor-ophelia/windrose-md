/**
 * Post-build script for Windrose release finalization
 *
 * Removes pathResolver dependencies from the compiled output and replaces
 * dynamic path resolution with dc.resolvePath() for the release build.
 *
 * This script is designed to work with the compiler's post-build hook.
 */

async function run(ctx) {
  const { outputPath, outputContent, vault } = ctx;

  let cleaned = outputContent;

  // Step 1: Remove orphaned getJsonPath destructuring line (references undefined pathResolverImport)
  cleaned = cleaned.replace(
    /const \{ getJsonPath \} = pathResolverImport;\r?\n/g,
    ''
  );

  // Step 2: Remove the now-empty "Datacore Imports" section header
  cleaned = cleaned.replace(
    /\/\/ =+\r?\n\/\/ Datacore Imports\r?\n\/\/ =+\r?\n\r?\n(?=\/\/ =+\r?\n\/\/ Theme Configuration)/,
    ''
  );

  // Step 3: Replace DATA_FILE_PATH assignment with dc.resolvePath()
  // Handle both getJsonPath() calls and any hardcoded paths the compiler may have inserted
  cleaned = cleaned.replace(
    /const DATA_FILE_PATH: string = [^;]+;/g,
    'const DATA_FILE_PATH: string = dc.resolvePath("windrose-md-data.json");'
  );

  // Write the changes back to the output file
  await vault.adapter.write(outputPath, cleaned);

  // Log completion
  console.log("✓ Windrose release finalized:");
  console.log("  - Removed orphaned pathResolverImport reference");
  console.log("  - Removed empty Datacore Imports section");
  console.log("  - Updated DATA_FILE_PATH to use dc.resolvePath()");

  return {
    message: 'Post-build finalization complete',
    changes: [
      'Removed pathResolverImport reference',
      'Replaced DATA_FILE_PATH with dc.resolvePath("windrose-md-data.json")'
    ]
  };
}

return { run };

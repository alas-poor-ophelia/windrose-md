/**
 * Vitest plugin to transform Datacore-style modules for testing.
 *
 * Datacore modules use:
 *   - `await dc.require()` for imports
 *   - `await requireModuleByName("Module.ts")` for dynamic imports
 *   - `return { ... }` for exports (not valid ES module syntax)
 *
 * This transformer converts them to ES modules by:
 *   1. Converting requireModuleByName() calls to static imports
 *   2. Replacing `return { x, y }` with `export { x, y }`
 *   3. Commenting out pathResolver bootstrap code
 */

import type { Plugin } from 'vite';
import path from 'path';

interface TransformOptions {
  /** Directory containing Datacore source files */
  sourceDir?: string;
  /** Whether to log transformations for debugging */
  debug?: boolean;
  /** Base path for resolving module imports */
  basePath?: string;
}

/**
 * Map module names to their relative paths from src/
 * This mirrors what pathResolver.ts does at runtime
 */
const MODULE_MAP: Record<string, string> = {
  // Geometry
  'GridGeometry.ts': './geometry/GridGeometry.ts',
  'HexGeometry.ts': './geometry/HexGeometry.ts',
  'cellAccessor.ts': './geometry/cellAccessor.ts',
  'layerAccessor.ts': './utils/layerAccessor.ts',
  'segmentRenderer.ts': './geometry/segmentRenderer.ts',
  'curveBoolean.ts': './geometry/curveBoolean.ts',
  'curveCellOverlap.ts': './geometry/curveCellOverlap.ts',
  'polygonClipping.ts': './geometry/polygonClipping.ts',
  'polygon-clipping-wrapper.js': './vendor/polygon-clipping-wrapper.js',
  'curveFitting.ts': './geometry/curveFitting.ts',

  // Utils
  'rotationOperations.ts': './utils/rotationOperations.ts',
  'colorOperations.ts': './utils/colorOperations.ts',
  'deepLinkHandler.ts': './utils/deepLinkHandler.ts',
  'frameDetection.ts': './utils/frameDetection.ts',
  'imageOperations.ts': './utils/imageOperations.ts',
  'distanceOperations.ts': './utils/distanceOperations.ts',
  'diagonalFillOperations.ts': './utils/diagonalFillOperations.ts',
  'edgeOperations.ts': './utils/edgeOperations.ts',
  'dmtConstants.ts': './utils/dmtConstants.ts',
  'pathResolver.ts': './utils/pathResolver.ts',
  'borderCalculator.ts': './utils/borderCalculator.ts',
  'segmentBorderCalculator.ts': './utils/segmentBorderCalculator.ts',
  'objectTypeResolver.ts': './utils/objectTypeResolver.ts',

  // Hooks
  'useHistory.ts': './hooks/useHistory.ts',
  'useDrawingTools.ts': './hooks/useDrawingTools.ts',
  'useCanvasInteraction.ts': './hooks/useCanvasInteraction.ts',
  'useCanvasRenderer.ts': './hooks/useCanvasRenderer.ts',
  'useDistanceMeasurement.ts': './hooks/useDistanceMeasurement.ts',
  'useAreaSelect.ts': './hooks/useAreaSelect.ts',
  'useDiagonalFill.ts': './hooks/useDiagonalFill.ts',
  'useEventCoordinator.ts': './hooks/useEventCoordinator.ts',
  'useDataHandlers.ts': './hooks/useDataHandlers.ts',

  // Geometry helpers
  'BaseGeometry.ts': './geometry/BaseGeometry.ts',
  'offsetCoordinates.ts': './geometry/offsetCoordinates.ts',
  'hexMeasurements.ts': './geometry/hexMeasurements.ts',

  // Renderers
  'badgeRenderer.ts': './geometry/badgeRenderer.ts',
  'textLabelRenderer.ts': './geometry/textLabelRenderer.ts',
  'backgroundRenderer.ts': './geometry/backgroundRenderer.ts',
  'gridFogRenderer.ts': './geometry/gridFogRenderer.ts',
  'hexFogRenderer.ts': './geometry/hexFogRenderer.ts',
  'fogRenderer.ts': './geometry/fogRenderer.ts',
  'objectRenderer.ts': './geometry/objectRenderer.ts',
  'selectionRenderer.ts': './geometry/selectionRenderer.ts',

  // Generation
  'dungeonGenerator.js': './generation/dungeonGenerator.js',
  'objectPlacer.js': './generation/objectPlacer.js',

  // Settings
  'settingsReducer.ts': './components/settings/settingsReducer.ts',
};

export function datacoreTransformer(options: TransformOptions = {}): Plugin {
  const { sourceDir = 'src', debug = false } = options;

  return {
    name: 'datacore-transformer',
    enforce: 'pre',

    transform(code: string, id: string) {
      // Only transform TypeScript/JavaScript files
      if (!/\.[tj]sx?$/.test(id)) {
        return null;
      }

      // Normalize path for cross-platform comparison
      const normalizedId = id.replace(/\\/g, '/');

      // Check if this looks like a source file we should transform
      const isSourceFile =
        normalizedId.includes(`/${sourceDir}/`) ||
        normalizedId.includes('/geometry/') ||
        normalizedId.includes('/utils/') ||
        normalizedId.includes('/hooks/') ||
        normalizedId.includes('/context/') ||
        normalizedId.includes('/components/') ||
        normalizedId.includes('/generation/');

      if (!isSourceFile) {
        return null;
      }

      // Skip if no Datacore patterns detected
      const hasDatacoreReturn = /^return\s*[\{\(]/m.test(code);
      const hasDatacoreImports = /dc\.require|requireModuleByName/.test(code);

      if (!hasDatacoreReturn && !hasDatacoreImports) {
        return null;
      }

      if (debug) {
        console.log(`[datacore-transformer] Transforming: ${path.basename(id)}`);
      }

      let transformed = code;
      const collectedImports: string[] = [];

      // Determine the current file's directory for relative imports
      const fileDir = getRelativeDir(normalizedId);

      // Step 1: Transform requireModuleByName() calls to imports
      // Pattern: const { Foo } = await requireModuleByName("Module.ts") as { ... }
      // Also: const { Foo } = await requireModuleByName("Module.ts")
      // The `as { ... }` block can span multiple lines
      transformed = transformed.replace(
        /const\s*\{([^}]+)\}\s*=\s*await\s+requireModuleByName\s*\(\s*["']([^"']+)["']\s*\)(?:\s*as\s*\{[\s\S]*?\n\};?)?;?/g,
        (_match, destructured, moduleName) => {
          const exports = destructured.split(',').map((s: string) => s.trim()).filter(Boolean);
          const modulePath = resolveModulePath(moduleName, fileDir);

          if (debug) {
            console.log(`[datacore-transformer] Import: { ${exports.join(', ')} } from "${modulePath}"`);
          }

          collectedImports.push(`import { ${exports.join(', ')} } from "${modulePath}";`);
          return `// [transformed] requireModuleByName("${moduleName}")`;
        }
      );

      // Step 2: Comment out pathResolver bootstrap patterns
      // These patterns get the pathResolver and extract functions from it

      // Pattern: const pathResolverPath = dc.resolvePath("pathResolver.ts");
      transformed = transformed.replace(
        /const\s+pathResolverPath\s*=\s*dc\.resolvePath\s*\([^)]+\);?/g,
        '// [transformed] pathResolver path removed'
      );

      // Pattern: const { requireModuleByName } = await dc.require(pathResolverPath) ...
      // Multi-line type annotations
      transformed = transformed.replace(
        /const\s*\{[^}]*requireModuleByName[^}]*\}\s*=\s*await\s+dc\.require\s*\([^)]+\)(?:\s*as\s*\{[\s\S]*?\n\};?)?;?/g,
        '// [transformed] requireModuleByName bootstrap removed'
      );

      // Pattern: const pathResolverImport = await dc.require(pathResolverPath) as { ... };
      // (for modules that use pathResolver differently)
      transformed = transformed.replace(
        /const\s+\w+\s*=\s*await\s+dc\.require\s*\(pathResolverPath\)(?:\s*as\s*\{[\s\S]*?\n?\};?)?;?/g,
        '// [transformed] dc.require(pathResolverPath) removed'
      );

      // Pattern: const { getJsonPath } = pathResolverImport;
      // (destructuring from the pathResolver import)
      // Replace with mock function
      transformed = transformed.replace(
        /const\s*\{\s*getJsonPath\s*\}\s*=\s*pathResolverImport;?/g,
        'const getJsonPath = () => "./test-data.json"; // [transformed] mocked getJsonPath'
      );

      // Generic pathResolverImport destructure
      transformed = transformed.replace(
        /const\s*\{[^}]+\}\s*=\s*pathResolverImport;?/g,
        '// [transformed] pathResolverImport destructure removed'
      );

      // Step 3: Inject collected imports at the top (after existing imports)
      if (collectedImports.length > 0) {
        // Find the last import or type import line
        const importInsertPoint = findImportInsertPoint(transformed);
        const importBlock = '\n// === TRANSFORMED IMPORTS ===\n' +
                           collectedImports.join('\n') +
                           '\n// === END TRANSFORMED IMPORTS ===\n';

        transformed = transformed.slice(0, importInsertPoint) +
                     importBlock +
                     transformed.slice(importInsertPoint);
      }

      // Step 4: Inject minimal dc mock for any remaining dc.* calls
      const hasRemainingDc = /\bdc\.(require|resolvePath|headerLink)\b/.test(transformed);
      if (hasRemainingDc) {
        const dcMock = `
// === DATACORE MOCK (for remaining dc.* calls) ===
const dc = {
  resolvePath: (p: string) => p,
  headerLink: (path: string, _section: string) => path,
  require: async (_modulePath: string) => ({})
};
// === END DATACORE MOCK ===
`;
        // Insert after imports
        const insertPoint = findImportInsertPoint(transformed);
        transformed = transformed.slice(0, insertPoint) + dcMock + transformed.slice(insertPoint);
      }

      // Step 5: Transform `return { ... }` to `export { ... }`
      transformed = transformed.replace(
        /^return\s*\{([\s\S]*)\};?\s*$/m,
        (_match, inner) => {
          const exportNames = parseExportNames(inner.trim());
          if (debug) {
            console.log(`[datacore-transformer] Exports: ${exportNames.join(', ')}`);
          }
          return `export { ${exportNames.join(', ')} };`;
        }
      );

      // Step 6: Handle parenthesized return: `return ({ ... })`
      transformed = transformed.replace(
        /^return\s*\(\{([\s\S]*)\}\);?\s*$/m,
        (_match, inner) => {
          const exportNames = parseExportNames(inner.trim());
          return `export { ${exportNames.join(', ')} };`;
        }
      );

      return {
        code: transformed,
        map: null
      };
    }
  };
}

/**
 * Get relative directory path from normalized file path
 * Returns the full path from src/, e.g., "components/settings" for components/settings/settingsReducer.ts
 */
function getRelativeDir(normalizedPath: string): string {
  // Extract the directory path relative to src/
  // Match everything after /src/ up to the filename
  const srcMatch = normalizedPath.match(/\/src\/(.+)\/[^/]+$/);
  if (srcMatch) {
    return srcMatch[1];
  }

  // Fallback: extract just the top-level directory for non-src paths
  const match = normalizedPath.match(/\/(geometry|utils|hooks|context|components|generation)\//);
  if (match) {
    // Check if there's a subdirectory
    const subMatch = normalizedPath.match(new RegExp(`/${match[1]}/([^/]+)/[^/]+$`));
    if (subMatch) {
      return `${match[1]}/${subMatch[1]}`;
    }
    return match[1];
  }
  return '';
}

/**
 * Resolve a module name to a relative import path
 */
function resolveModulePath(moduleName: string, fromDir: string): string {
  const mapped = MODULE_MAP[moduleName];
  if (!mapped) {
    // Unknown module - return as-is with a prefix
    return `./${moduleName}`;
  }

  // Adjust relative path based on current directory
  // mapped is like "./geometry/GridGeometry.ts"
  // fromDir is like "geometry" or "hooks"

  if (!fromDir) {
    return mapped;
  }

  // Count how many directories up we need to go
  const fromParts = fromDir.split('/').filter(Boolean);
  const upCount = fromParts.length;

  // Strip the leading "./" from mapped
  const targetPath = mapped.replace(/^\.\//, '');

  // Build the relative path
  const prefix = upCount > 0 ? '../'.repeat(upCount) : './';
  return prefix + targetPath;
}

/**
 * Find the position to insert new imports (after existing import/export type statements)
 */
function findImportInsertPoint(code: string): number {
  // Use regex to find the end of the last import or export type statement
  // This handles multi-line imports correctly

  // Match import statements (including multi-line)
  const importRegex = /^(import\s+(?:type\s+)?(?:\{[\s\S]*?\}|[\w*]+(?:\s+as\s+\w+)?)\s+from\s+['"][^'"]+['"];?)/gm;
  const exportTypeRegex = /^(export\s+type\s+\{[\s\S]*?\};?)/gm;

  let lastMatchEnd = 0;

  // Find all import statements
  let match;
  while ((match = importRegex.exec(code)) !== null) {
    lastMatchEnd = match.index + match[0].length;
  }

  // Find all export type statements
  while ((match = exportTypeRegex.exec(code)) !== null) {
    if (match.index + match[0].length > lastMatchEnd) {
      lastMatchEnd = match.index + match[0].length;
    }
  }

  // Skip past any trailing whitespace/newlines
  while (lastMatchEnd < code.length && (code[lastMatchEnd] === '\n' || code[lastMatchEnd] === '\r')) {
    lastMatchEnd++;
  }

  return lastMatchEnd;
}

/**
 * Parse export names from object literal contents.
 * Handles: { foo, bar } and { foo: foo, bar: bar } and { foo, bar: baz }
 */
function parseExportNames(objectInner: string): string[] {
  const names: string[] = [];

  // Split by comma, but be careful about nested structures
  let depth = 0;
  let current = '';

  for (const char of objectInner) {
    if (char === '{' || char === '(' || char === '[') {
      depth++;
      current += char;
    } else if (char === '}' || char === ')' || char === ']') {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      const name = extractExportName(current.trim());
      if (name) names.push(name);
      current = '';
    } else {
      current += char;
    }
  }

  // Don't forget the last item
  const lastName = extractExportName(current.trim());
  if (lastName) names.push(lastName);

  return names;
}

/**
 * Extract the export name from an object property.
 * "foo" -> "foo"
 * "foo: bar" -> "foo"
 * "foo: someFunc()" -> "foo"
 * "// comment\nfoo" -> "foo"
 */
function extractExportName(prop: string): string | null {
  if (!prop) return null;

  // Strip single-line comments (// ...)
  let cleaned = prop.replace(/\/\/[^\n]*\n?/g, '').trim();

  // Strip multi-line comments (/* ... */)
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '').trim();

  if (!cleaned) return null;

  // Handle shorthand: just the identifier
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(cleaned)) {
    return cleaned;
  }

  // Handle key: value - extract just the key
  const colonIndex = cleaned.indexOf(':');
  if (colonIndex > 0) {
    const key = cleaned.substring(0, colonIndex).trim();
    if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) {
      return key;
    }
  }

  return null;
}

export default datacoreTransformer;

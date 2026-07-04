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
  // Geometry core
  'GridGeometry.ts': './geometry/core/GridGeometry.ts',
  'HexGeometry.ts': './geometry/core/HexGeometry.ts',
  'BaseGeometry.ts': './geometry/core/BaseGeometry.ts',
  'cellAccessor.ts': './geometry/core/cellAccessor.ts',
  'offsetCoordinates.ts': './geometry/core/offsetCoordinates.ts',
  'hexMeasurements.ts': './geometry/core/hexMeasurements.ts',

  // Geometry renderers
  'segmentRenderer.ts': './geometry/renderers/segmentRenderer.ts',
  'badgeRenderer.ts': './geometry/renderers/badgeRenderer.ts',
  'textLabelRenderer.ts': './geometry/renderers/textLabelRenderer.ts',
  'backgroundRenderer.ts': './geometry/renderers/backgroundRenderer.ts',
  'objectRenderer.ts': './geometry/renderers/objectRenderer.ts',
  'selectionRenderer.ts': './geometry/renderers/selectionRenderer.ts',
  'regionRenderer.ts': './geometry/renderers/regionRenderer.ts',
  'tileRenderer.ts': './geometry/renderers/tileRenderer.ts',
  'curveRenderer.ts': './geometry/renderers/curveRenderer.ts',
  'gridRenderer.ts': './geometry/renderers/gridRenderer.ts',
  'hexRenderer.ts': './geometry/renderers/hexRenderer.ts',

  // Geometry fog
  'fogRenderer.ts': './geometry/fog/fogRenderer.ts',
  'gridFogRenderer.ts': './geometry/fog/gridFogRenderer.ts',
  'hexFogRenderer.ts': './geometry/fog/hexFogRenderer.ts',

  // Geometry curves
  'curveBoolean.ts': './geometry/curves/curveBoolean.ts',
  'curveCellOverlap.ts': './geometry/curves/curveCellOverlap.ts',
  'curveFitting.ts': './geometry/curves/curveFitting.ts',
  'polygonClipping.ts': './geometry/curves/polygonClipping.ts',
  'polygon-clipping-wrapper.js': './vendor/polygon-clipping-wrapper.js',

  'layerAccessor.ts': './persistence/layerAccessor.ts',

  // Core
  'dmtConstants.ts': './core/dmtConstants.ts',
  'pathResolver.ts': './core/pathResolver.ts',
  'settingsAccessor.ts': './core/settingsAccessor.ts',
  'obsidianBridge.ts': './core/obsidianBridge.ts',
  'interactjs.ts': './core/interactjs.ts',

  // Objects
  'objectTypes.ts': './objects/objectTypes.ts',
  'objectTypeResolver.ts': './objects/objectTypeResolver.ts',
  'objectOperations.ts': './objects/objectOperations.ts',
  'hexSlotPositioner.ts': './objects/hexSlotPositioner.ts',
  'screenPositionUtils.ts': './objects/screenPositionUtils.ts',
  'selectionBounds.ts': './objects/selectionBounds.ts',
  'multiSelectOperations.ts': './objects/multiSelectOperations.ts',

  // Drawing
  'rotationOperations.ts': './drawing/rotationOperations.ts',
  'colorOperations.ts': './drawing/colorOperations.ts',
  'distanceOperations.ts': './drawing/distanceOperations.ts',
  'diagonalFillOperations.ts': './drawing/diagonalFillOperations.ts',
  'edgeOperations.ts': './drawing/edgeOperations.ts',
  'borderCalculator.ts': './drawing/borderCalculator.ts',
  'segmentBorderCalculator.ts': './drawing/segmentBorderCalculator.ts',
  'cellToScreenConverter.ts': './drawing/cellToScreenConverter.ts',

  // Text
  'textLabelOperations.ts': './text/textLabelOperations.ts',
  'fontOptions.ts': './text/fontOptions.ts',

  // Assets
  'imageOperations.ts': './assets/imageOperations.ts',
  'tilesetOperations.ts': './assets/tilesetOperations.ts',
  'rpgAwesomeIcons.ts': './assets/rpgAwesomeIcons.ts',
  // Persistence
  'fileOperations.ts': './persistence/fileOperations.ts',
  'deepLinkHandler.ts': './persistence/deepLinkHandler.ts',
  'exportOperations.ts': './persistence/exportOperations.ts',
  'noteOperations.ts': './persistence/noteOperations.ts',

  // Hooks - canvas
  'useCanvasRenderer.ts': './hooks/canvas/useCanvasRenderer.ts',
  'useCanvasInteraction.ts': './hooks/canvas/useCanvasInteraction.ts',
  'useEventCoordinator.ts': './hooks/canvas/useEventCoordinator.ts',
  'usePanZoomCoordinator.ts': './hooks/canvas/usePanZoomCoordinator.ts',

  // Hooks - drawing
  'useDrawingTools.ts': './hooks/drawing/useDrawingTools.ts',
  'usePaintTool.ts': './hooks/drawing/usePaintTool.ts',
  'useEdgeDragTool.ts': './hooks/drawing/useEdgeDragTool.ts',
  'useSegmentDragTool.ts': './hooks/drawing/useSegmentDragTool.ts',
  'useShapeTools.ts': './hooks/drawing/useShapeTools.ts',
  'useSegmentPicker.ts': './hooks/drawing/useSegmentPicker.ts',
  'useSegmentHover.ts': './hooks/drawing/useSegmentHover.ts',
  'useDiagonalFill.ts': './hooks/drawing/useDiagonalFill.ts',

  // Hooks - objects
  'useObjectInteractions.ts': './hooks/objects/useObjectInteractions.ts',
  'useObjectPlacement.ts': './hooks/objects/useObjectPlacement.ts',
  'useObjectDragSelect.ts': './hooks/objects/useObjectDragSelect.ts',
  'useObjectResize.ts': './hooks/objects/useObjectResize.ts',
  'useObjectHover.ts': './hooks/objects/useObjectHover.ts',
  'useObjectModifications.ts': './hooks/objects/useObjectModifications.ts',
  'useObjectUIPositions.ts': './hooks/objects/useObjectUIPositions.ts',
  'useObjectModals.ts': './hooks/objects/useObjectModals.ts',
  'useEdgeSnapModifiers.ts': './hooks/objects/useEdgeSnapModifiers.ts',
  'useGroupDrag.ts': './hooks/objects/useGroupDrag.ts',

  // Hooks - state
  'useMapData.ts': './hooks/state/useMapData.ts',
  'useTileBrush.ts': './hooks/state/useTileBrush.ts',
  'useLayerHistory.ts': './hooks/state/useLayerHistory.ts',
  'useHistory.ts': './hooks/state/useHistory.ts',
  'useDataHandlers.ts': './hooks/state/useDataHandlers.ts',
  'useToolState.ts': './hooks/state/useToolState.ts',
  'usePanelState.ts': './hooks/state/usePanelState.ts',
  'useUILayout.ts': './hooks/state/useUILayout.ts',
  'useViewControls.ts': './hooks/state/useViewControls.ts',

  // Hooks - interactions
  'useTextLabelInteraction.ts': './hooks/interactions/useTextLabelInteraction.ts',
  'useNotePinInteraction.ts': './hooks/interactions/useNotePinInteraction.ts',
  'useAreaSelect.ts': './hooks/interactions/useAreaSelect.ts',
  'useFogOfWar.ts': './hooks/interactions/useFogOfWar.ts',
  'useFogTools.ts': './hooks/interactions/useFogTools.ts',
  'useRegionTools.ts': './hooks/interactions/useRegionTools.ts',
  'useImageAlignment.ts': './hooks/interactions/useImageAlignment.ts',
  'useDistanceMeasurement.ts': './hooks/interactions/useDistanceMeasurement.ts',
  'useSubHexNavigation.ts': './hooks/interactions/useSubHexNavigation.ts',
  'useAlignmentMode.ts': './hooks/interactions/useAlignmentMode.ts',
  'useCustomEventHandlers.ts': './hooks/interactions/useCustomEventHandlers.ts',
  'useToolbarPosition.ts': './hooks/interactions/useToolbarPosition.ts',
  'useSelectionActions.ts': './hooks/interactions/useSelectionActions.ts',

  // Generation
  'dungeonGenerator.js': './generation/dungeonGenerator.js',
  'objectPlacer.js': './generation/objectPlacer.js',

  // Components - controls
  'MapHeader.tsx': './components/controls/MapHeader.tsx',
  'MapControls.tsx': './components/controls/MapControls.tsx',
  'SubHexBreadcrumb.tsx': './components/controls/SubHexBreadcrumb.tsx',

  // Components - modals
  'TextLabelEditor.tsx': './components/modals/TextLabelEditor.tsx',
  'TextInputModal.tsx': './components/modals/TextInputModal.tsx',
  'NoteLinkModal.tsx': './components/modals/NoteLinkModal.tsx',
  'LayerEditModal.tsx': './components/modals/LayerEditModal.tsx',
  'ModalPortal.tsx': './components/modals/ModalPortal.tsx',

  // Components - overlays
  'MeasurementOverlay.tsx': './components/overlays/MeasurementOverlay.tsx',
  'LinkedNoteHoverOverlays.tsx': './components/overlays/LinkedNoteHoverOverlays.tsx',
  'LinkingModeBanner.tsx': './components/overlays/LinkingModeBanner.tsx',
  'ImageAlignmentMode.tsx': './components/overlays/ImageAlignmentMode.tsx',

  // Components - panels
  'ObjectSidebar.tsx': './components/panels/ObjectSidebar.tsx',
  'LayerControls.tsx': './components/panels/LayerControls.tsx',
  'RegionPanel.tsx': './components/panels/RegionPanel.tsx',
  'TileAssetBrowser.tsx': './components/panels/TileAssetBrowser.tsx',

  // Components - toolbars
  'ObjectSelectionToolbar.tsx': './components/toolbars/ObjectSelectionToolbar.tsx',
  'TextSelectionToolbar.tsx': './components/toolbars/TextSelectionToolbar.tsx',
  'MultiSelectToolbar.tsx': './components/toolbars/MultiSelectToolbar.tsx',
  'ToolPalette.tsx': './components/toolbars/ToolPalette.tsx',
  'VisibilityToolbar.tsx': './components/toolbars/VisibilityToolbar.tsx',
  'FogOfWarToolbar.tsx': './components/toolbars/FogOfWarToolbar.tsx',
  'SelectionActionsOverlay.tsx': './components/toolbars/SelectionActionsOverlay.tsx',
  'SelectionCardFiligree.tsx': './components/toolbars/SelectionCardFiligree.tsx',

  // Components - shared
  'ColorPicker.tsx': './components/shared/ColorPicker.tsx',
  'CollapsibleSection.tsx': './components/shared/CollapsibleSection.tsx',

  // Components - settings
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
        normalizedId.includes('/hooks/') ||
        normalizedId.includes('/context/') ||
        normalizedId.includes('/components/') ||
        normalizedId.includes('/generation/') ||
        normalizedId.includes('/core/') ||
        normalizedId.includes('/objects/') ||
        normalizedId.includes('/drawing/') ||
        normalizedId.includes('/text/') ||
        normalizedId.includes('/assets/') ||
        normalizedId.includes('/persistence/');

      if (!isSourceFile) {
        return null;
      }

      // Skip if no Datacore patterns detected
      const hasDatacoreReturn = /^return\s*[{(]/m.test(code);
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
  const match = normalizedPath.match(/\/(geometry|hooks|context|components|generation|core|objects|drawing|text|assets|persistence)\//);
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

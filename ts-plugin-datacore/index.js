// Path: ts-plugin-datacore/index.js
// TypeScript Language Service Plugin that filters error 1108
// ("return statement can only be used within a function body")
// This error is invalid for Datacore scripts which are wrapped in an async function at runtime.

/**
 * @param {{ typescript: typeof import("typescript") }} modules
 */
function init(modules) {
  console.log('[ts-plugin-datacore] Plugin initialized');
  
  function create(info) {
    console.log('[ts-plugin-datacore] Creating language service proxy');
    
    const proxy = Object.create(null);
    
    // Copy all methods from the original language service
    for (const k of Object.keys(info.languageService)) {
      const x = info.languageService[k];
      proxy[k] = (...args) => x.apply(info.languageService, args);
    }

    // Filter semantic diagnostics
    proxy.getSemanticDiagnostics = (fileName) => {
      const diagnostics = info.languageService.getSemanticDiagnostics(fileName);
      return filterDatacoreDiagnostics(diagnostics);
    };

    // Filter syntactic diagnostics (where 1108 actually comes from)
    proxy.getSyntacticDiagnostics = (fileName) => {
      const diagnostics = info.languageService.getSyntacticDiagnostics(fileName);
      return filterDatacoreDiagnostics(diagnostics);
    };

    return proxy;
  }

  /**
   * Filter out Datacore-incompatible errors
   * - 1108: 'return' statement can only be used within a function body
   * - 1378: Top-level 'await' expressions are only allowed in module files
   */
  function filterDatacoreDiagnostics(diagnostics) {
    const FILTERED_CODES = [
      1108, // return outside function
      1378, // top-level await (if sourceType gets misconfigured)
    ];
    return diagnostics.filter(d => !FILTERED_CODES.includes(d.code));
  }

  return { create };
}

module.exports = init;
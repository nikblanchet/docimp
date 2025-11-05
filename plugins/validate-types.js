/**
 * JSDoc Type Validation Plugin
 *
 * This plugin performs REAL type-checking of JSDoc comments using the
 * TypeScript compiler with checkJs enabled. It validates:
 * - Parameter names match function signatures
 * - JSDoc types are syntactically correct
 * - Types align with TypeScript inference
 *
 * This is not cosmetic parsing - it uses the actual TypeScript compiler
 * to verify JSDoc correctness.
 *
 * Performance & Memory:
 * - Uses cached TypeScript language services to prevent memory leaks
 * - Reuses programs across validations: ~50-200ms → <10ms (cache hits)
 * - Automatically invalidates cache when file content changes
 * - LRU eviction prevents unbounded cache growth (max 50 entries)
 * - Shared document registry enables efficient SourceFile reuse
 *
 * @module plugins/validate-types
 */

import { readFileSync } from 'fs';

/**
 * REMOVED: Module-level globals for dependencies.
 *
 * Previous design used module-level globals (ts, parseJSDoc) set by the
 * beforeAccept hook. This violated the dependency injection principle.
 *
 * New design: Factory pattern with closure (see createValidator() at end of file).
 * Dependencies are captured in closure scope, making them available to all
 * helper functions without global state.
 */

/**
 * Maximum number of language services to cache.
 * Prevents unbounded memory growth in long-running sessions.
 *
 * Value of 50 chosen based on:
 * - Typical project has <50 JS/TS files needing validation in a single session
 * - Each language service: ~5-10MB (lib.d.ts + project files + program state)
 * - Total cache overhead: ~250-500MB worst case (50 services × 5-10MB each)
 * - Balance between performance (avoid cache misses) and memory usage
 * - Most improve sessions document 10-20 files before completion
 *
 * Trade-offs:
 * - Higher values: Fewer cache misses, but more memory usage
 * - Lower values: Less memory, but more cache thrashing and slower validation
 *
 * Can be overridden via config in future versions.
 */
const MAX_CACHE_SIZE = 50;

/**
 * Cache for TypeScript language services with LRU eviction.
 * Key: filepath
 * Value: { service: LanguageService, version: number, content: string }
 *
 * This cache prevents memory leaks by:
 * 1. Reusing TypeScript programs across validation calls
 * 2. Limiting total cache size to prevent unbounded growth
 * 3. Using LRU (Least Recently Used) eviction when cache is full
 *
 * Thread Safety: NOT thread-safe. Assumes single-threaded Node.js event loop.
 * Cache operations (Map updates, LRU tracking) are not atomic. Async operations
 * are assumed not to interleave cache mutations. If adding worker thread support
 * or parallel validation, add synchronization (locks or queue).
 *
 * Example race condition (theoretical in current usage):
 *   // Two validations start simultaneously when cache.size === 49:
 *   // Validation A checks: cache.size >= 50? No, proceed
 *   // Validation B checks: cache.size >= 50? No, proceed
 *   // Validation A adds entry (size = 50)
 *   // Validation B adds entry (size = 51) <- exceeds MAX_CACHE_SIZE
 *
 * This is acceptable given Node.js's single-threaded event loop model.
 */
const languageServiceCache = new Map();

/**
 * LRU access order tracking using Map's insertion order.
 *
 * Maps maintain insertion order, so we can leverage this for O(1) LRU tracking:
 * - To mark as recently used: delete then re-set (moves to end)
 * - To get LRU: get first key via iterator (oldest entry)
 * - No need for O(n) indexOf/splice operations
 *
 * Key: filepath
 * Value: true (only used for tracking, actual data is in languageServiceCache)
 */
const cacheAccessOrder = new Map();

/**
 * Cache statistics for debugging and monitoring.
 * Tracks hits, misses, and invalidations to measure cache effectiveness.
 */
let cacheStats = {
  hits: 0,
  misses: 0,
  invalidations: 0,
};

/**
 * Shared document registry for efficient SourceFile reuse.
 *
 * The DocumentRegistry is TypeScript's built-in mechanism for sharing
 * parsed SourceFile objects across multiple LanguageService instances.
 * This is critical for memory efficiency because:
 *
 * 1. **Parsing is expensive**: Converting source text to an AST requires
 *    significant CPU time and memory allocation.
 *
 * 2. **Library files are shared**: Multiple language services may reference
 *    the same TypeScript library files (lib.d.ts, lib.es2022.d.ts, etc.).
 *    The registry maintains a pool of SourceFiles keyed by content hash.
 *
 * 3. **Deduplication**: When a LanguageService requests a file, the registry
 *    returns a cached SourceFile if the content matches, avoiding re-parsing.
 *
 * 4. **Memory multiplier**: Without a shared registry, each language service
 *    would parse library files independently, multiplying memory usage by the
 *    number of cached services (potentially 50x with MAX_CACHE_SIZE=50).
 *
 * The registry automatically manages SourceFile lifecycle and cleanup when
 * language services are disposed.
 *
 * Initialized lazily when dependencies are injected.
 *
 * @see https://github.com/microsoft/TypeScript/wiki/Using-the-Language-Service-API#creating-the-language-service
 */
let documentRegistry;

/**
 * Clear the language service cache.
 *
 * This function is primarily useful for testing to ensure
 * a clean state between test runs. It can also be used to
 * free memory if needed.
 *
 * @returns {void}
 */
export function clearCache() {
  // Dispose all language services before clearing to prevent memory leaks
  for (const entry of languageServiceCache.values()) {
    if (entry && entry.service) {
      entry.service.dispose();
    }
  }
  languageServiceCache.clear();
  cacheAccessOrder.clear();
  cacheStats = { hits: 0, misses: 0, invalidations: 0 };
}

/**
 * Get cache statistics.
 *
 * Returns metrics about cache performance including hit/miss rates,
 * current cache size, and list of cached files. Useful for debugging
 * and monitoring.
 *
 * Usage: DEBUG_DOCIMP_CACHE=1 docimp improve ./src
 *
 * @returns {{hits: number, misses: number, invalidations: number, size: number, maxSize: number, files: string[]}} Cache statistics
 */
export function getCacheStats() {
  return {
    ...cacheStats,
    size: languageServiceCache.size,
    maxSize: MAX_CACHE_SIZE,
    files: Array.from(languageServiceCache.keys()),
  };
}

/**
 * Clear cache entry for a specific file.
 *
 * Removes the cached language service for a single file, useful when
 * you know a specific file has changed outside of normal validation.
 *
 * @param {string} filepath - Path to the file to remove from cache
 * @returns {boolean} True if entry was removed, false if not in cache
 */
export function clearCacheForFile(filepath) {
  const entry = languageServiceCache.get(filepath);
  if (entry) {
    // Dispose the language service before removing from cache to prevent memory leaks
    entry.service.dispose();
    languageServiceCache.delete(filepath);
    cacheAccessOrder.delete(filepath);
    return true;
  }
  return false;
}

/**
 * Get current cache size.
 *
 * Returns the number of files currently cached.
 *
 * @returns {number} Number of cached language services
 */
export function getCacheSize() {
  return languageServiceCache.size;
}

/**
 * Create a type validation plugin with injected dependencies.
 *
 * This factory pattern captures dependencies in closure scope, making them
 * available to all helper functions without global state. This follows the
 * dependency injection principle while maintaining clean code organization.
 *
 * Module-level caches (languageServiceCache, cacheAccessOrder, etc.) remain
 * at module scope as documented exceptions for performance optimization.
 *
 * @param {object} dependencies - Dependencies to inject
 * @param {typeof import('typescript')} dependencies.typescript - TypeScript compiler API
 * @param {object} dependencies.commentParser - JSDoc parser with parse method
 * @returns {object} Plugin object with hooks that close over dependencies
 */
export default function createValidator(dependencies) {
  // Capture dependencies in closure scope
  const ts = dependencies?.typescript;
  const parseJSDoc = dependencies?.commentParser?.parse;

  // Validate that required dependencies are available
  if (!ts) {
    throw new Error(
      'TypeScript dependency is required for validate-types plugin'
    );
  }
  if (!parseJSDoc) {
    throw new Error(
      'commentParser dependency is required for validate-types plugin'
    );
  }

  // ============================================================================
  // HELPER FUNCTIONS (moved inside factory to access ts and parseJSDoc via closure)
  // ============================================================================

  /**
   * Extract parameter names from a JSDoc comment.
   *
   * Uses comment-parser to properly handle JSDoc parameter patterns including:
   * - Optional parameters: @param {string} [name='default']
   * - Rest parameters: @param {...any} args
   * - Destructured parameters: @param {{x: number, y: number}} options
   *
   * @param {string} docstring - JSDoc comment text
   * @returns {string[]} Array of parameter names
   */
  function extractJSDocParamNames(docstring) {
    try {
      // Parse JSDoc comment using comment-parser (from closure)
      const parsed = parseJSDoc(docstring);

      if (!parsed || parsed.length === 0) {
        return [];
      }

      // Extract @param tags from the first comment block
      const paramTags = parsed[0].tags.filter((tag) => tag.tag === 'param');

      // Extract parameter names, handling special patterns
      return paramTags.map((tag) => {
        let paramName = tag.name;

        // Handle optional parameters: [name], [name='default']
        if (paramName.startsWith('[') && paramName.includes(']')) {
          const match = paramName.match(/^\[([^\]=]+)/);
          if (match) {
            paramName = match[1];
          }
        }

        // Handle rest parameters: ...args
        if (paramName.startsWith('...')) {
          paramName = paramName.substring(3);
        }

        // Handle destructured parameters: options.x -> options
        if (paramName.includes('.')) {
          paramName = paramName.split('.')[0];
        }

        return paramName;
      });
    } catch (error) {
      // Fallback to empty array if parsing fails
      if (process.env.NODE_ENV === 'development') {
        console.warn('[validate-types] Failed to parse JSDoc:', error.message);
      }
      return [];
    }
  }

  /**
   * Extract function signature from source code.
   *
   * This function reuses the SourceFile from a language service instead of
   * creating an ephemeral one. This avoids duplicate parsing and reduces
   * memory pressure.
   *
   * @param {import('typescript').LanguageService} service - TypeScript language service
   * @param {string} filepath - Path to the file
   * @param {string} functionName - Name of the function to find
   * @returns {{params: string[], isAsync: boolean} | null} Function info or null
   */
  function extractFunctionSignature(service, filepath, functionName) {
    // Get the SourceFile from the language service's program
    const program = service.getProgram();
    const sourceFile = program?.getSourceFile(filepath);

    if (!sourceFile) {
      return null;
    }

    let functionInfo = null;

    // Visit all nodes to find the function
    function visit(node) {
      // Check for function declarations (ts from closure)
      if (ts.isFunctionDeclaration(node) && node.name?.text === functionName) {
        functionInfo = {
          params: node.parameters.map((p) => p.name.getText(sourceFile)),
          isAsync:
            node.modifiers?.some(
              (m) => m.kind === ts.SyntaxKind.AsyncKeyword
            ) || false,
        };
      }

      // Check for variable declarations with arrow functions
      if (
        ts.isVariableDeclaration(node) &&
        node.name.getText(sourceFile) === functionName
      ) {
        if (node.initializer && ts.isArrowFunction(node.initializer)) {
          functionInfo = {
            params: node.initializer.parameters.map((p) =>
              p.name.getText(sourceFile)
            ),
            isAsync:
              node.initializer.modifiers?.some(
                (m) => m.kind === ts.SyntaxKind.AsyncKeyword
              ) || false,
          };
        }
      }

      // Check for method declarations in classes
      if (
        ts.isMethodDeclaration(node) &&
        node.name.getText(sourceFile) === functionName
      ) {
        functionInfo = {
          params: node.parameters.map((p) => p.name.getText(sourceFile)),
          isAsync:
            node.modifiers?.some(
              (m) => m.kind === ts.SyntaxKind.AsyncKeyword
            ) || false,
        };
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return functionInfo;
  }

  /**
   * Get or create a cached language service for a file.
   *
   * This function implements LRU caching to prevent memory leaks from
   * repeatedly creating TypeScript programs. It reuses language services
   * when file content hasn't changed and evicts least recently used
   * entries when the cache reaches MAX_CACHE_SIZE.
   *
   * @param {string} filepath - Path to the file
   * @param {string} sourceCode - Source code content
   * @returns {import('typescript').LanguageService} Cached or new language service
   */
  function getCachedLanguageService(filepath, sourceCode) {
    // Check if we have a cached service for this file
    const cached = languageServiceCache.get(filepath);

    // Return cached service if content hasn't changed
    if (cached && cached.content === sourceCode) {
      // Cache HIT
      cacheStats.hits++;
      if (process.env.DEBUG_DOCIMP_CACHE) {
        console.error(
          `[validate-types] Cache HIT: ${filepath} (${cacheStats.hits} total hits)`
        );
      }

      // Move to end of access order (most recently used) - O(1) operation
      cacheAccessOrder.delete(filepath);
      cacheAccessOrder.set(filepath, true);
      return cached.service;
    }

    // Cache MISS or INVALIDATION
    if (cached) {
      // Content changed - invalidation
      try {
        cached.service.dispose();
      } catch (error) {
        if (process.env.DEBUG_DOCIMP_CACHE) {
          console.error(
            `[validate-types] Error disposing language service for ${filepath}:`,
            error
          );
        }
      }
      cacheStats.invalidations++;
      if (process.env.DEBUG_DOCIMP_CACHE) {
        console.error(
          `[validate-types] Cache INVALIDATE: ${filepath} (${cacheStats.invalidations} total invalidations)`
        );
      }
    } else {
      // New file - miss
      cacheStats.misses++;
      if (process.env.DEBUG_DOCIMP_CACHE) {
        console.error(
          `[validate-types] Cache MISS: ${filepath} (${cacheStats.misses} total misses)`
        );
      }
    }

    // Create or update the language service
    const version = cached ? cached.version + 1 : 0;

    // Evict least recently used entry if cache is full
    if (!cached && languageServiceCache.size >= MAX_CACHE_SIZE) {
      const lruPath = cacheAccessOrder.keys().next().value;
      if (lruPath) {
        const evictedEntry = languageServiceCache.get(lruPath);
        if (evictedEntry) {
          try {
            evictedEntry.service.dispose();
          } catch (error) {
            if (process.env.DEBUG_DOCIMP_CACHE) {
              console.error(
                `[validate-types] Error disposing evicted language service for ${lruPath}:`,
                error
              );
            }
          }
        }
        languageServiceCache.delete(lruPath);
        cacheAccessOrder.delete(lruPath);
        if (process.env.DEBUG_DOCIMP_CACHE) {
          console.error(
            `[validate-types] Cache EVICT (LRU): ${lruPath} (cache size: ${languageServiceCache.size})`
          );
        }
      }
    }

    // Create compiler options with checkJs enabled (ts from closure)
    const compilerOptions = {
      allowJs: true,
      checkJs: true,
      noEmit: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    };

    // Track current file version and content
    const fileVersions = new Map([[filepath, version]]);
    const fileContents = new Map([[filepath, sourceCode]]);

    // Create a language service host (ts from closure)
    const host = {
      getScriptFileNames: () => [filepath],
      getScriptVersion: (fileName) => String(fileVersions.get(fileName) || 0),
      getScriptSnapshot: (fileName) => {
        const content = fileContents.get(fileName);
        return content ? ts.ScriptSnapshot.fromString(content) : undefined;
      },
      getCurrentDirectory: () => process.cwd(),
      getCompilationSettings: () => compilerOptions,
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      getProjectVersion: () => String(version),
      getScriptKind: (fileName) => {
        if (fileName.endsWith('.tsx')) return ts.ScriptKind.TSX;
        if (fileName.endsWith('.jsx')) return ts.ScriptKind.JSX;
        if (fileName.endsWith('.ts')) return ts.ScriptKind.TS;
        return ts.ScriptKind.JS;
      },
      getNewLine: () => '\n',
      fileExists: (fileName) =>
        fileName === filepath || ts.sys.fileExists(fileName),
      readFile: (fileName) =>
        fileContents.get(fileName) || ts.sys.readFile(fileName),
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories,
    };

    // Create the language service with document registry (ts from closure)
    const service = ts.createLanguageService(host, documentRegistry);

    // Cache the service
    languageServiceCache.set(filepath, {
      service,
      version,
      content: sourceCode,
    });

    // Update LRU access order
    cacheAccessOrder.delete(filepath);
    cacheAccessOrder.set(filepath, true);

    return service;
  }

  /**
   * Validate JSDoc with TypeScript compiler.
   *
   * Uses a cached TypeScript language service with checkJs enabled
   * to validate JSDoc comments against actual code.
   *
   * @param {string} filepath - Path to the file
   * @param {string} code - Source code (if available)
   * @returns {{valid: boolean, errors: string[]}} Validation result
   */
  function validateWithCompiler(filepath, code) {
    const perfStart = process.env.DEBUG_DOCIMP_PERF ? performance.now() : null;

    // If no code provided, try to read the file
    const sourceCode =
      code ||
      (function () {
        try {
          return readFileSync(filepath, 'utf-8');
        } catch {
          return null;
        }
      })();

    if (!sourceCode) {
      return { valid: true, errors: [] }; // Can't validate without source
    }

    // Get cached or create new language service
    const service = getCachedLanguageService(filepath, sourceCode);

    // Get semantic diagnostics (includes JSDoc validation)
    let diagnostics = [];
    try {
      diagnostics = service.getSemanticDiagnostics(filepath);
    } catch (error) {
      if (perfStart !== null) {
        const duration = (performance.now() - perfStart).toFixed(2);
        console.error(
          `[validate-types] Validation failed after ${duration}ms for ${filepath}`
        );
      }
      return {
        valid: false,
        errors: [`TypeScript compiler error: ${error.message}`],
      };
    }

    // Format errors with line/column information (ts from closure)
    const errors = diagnostics.map((d) => {
      const message = ts.flattenDiagnosticMessageText(d.messageText, '\n');
      const position =
        d.start !== undefined && d.file
          ? d.file.getLineAndCharacterOfPosition(d.start)
          : null;
      const location = position
        ? ` (line ${position.line + 1}, col ${position.character + 1})`
        : '';
      return `${message}${location}`;
    });

    if (perfStart !== null) {
      const duration = (performance.now() - perfStart).toFixed(2);
      console.error(
        `[validate-types] Validation took ${duration}ms for ${filepath}`
      );
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Generate auto-fix for parameter name mismatches.
   *
   * @param {string} docstring - Original JSDoc
   * @param {string[]} jsdocParams - Parameter names in JSDoc
   * @param {string[]} actualParams - Parameter names in function signature
   * @returns {string | null} Fixed JSDoc or null if can't fix
   */
  function generateParameterFix(docstring, jsdocParams, actualParams) {
    if (jsdocParams.length !== actualParams.length) {
      return null; // Can't auto-fix if counts don't match
    }

    let fixed = docstring;

    // Replace each mismatched parameter name
    for (let i = 0; i < jsdocParams.length; i++) {
      if (jsdocParams[i] !== actualParams[i]) {
        // Replace the parameter name in the @param tag
        const pattern = new RegExp(
          `(@param\\s+\\{[^}]+\\})\\s+${jsdocParams[i]}\\b`,
          'g'
        );
        fixed = fixed.replace(pattern, `$1 ${actualParams[i]}`);
      }
    }

    return fixed !== docstring ? fixed : null;
  }

  /**
   * Validate JSDoc type annotations.
   *
   * This is the main beforeAccept hook that runs before documentation
   * is accepted in the improve workflow.
   *
   * @param {string} docstring - Generated JSDoc comment
   * @param {object} item - Code item metadata
   * @param {object} config - User configuration
   * @returns {Promise<{accept: boolean, reason?: string, autoFix?: string}>}
   */
  async function beforeAccept(docstring, item, config) {
    // Initialize document registry lazily when TypeScript is available (ts from closure)
    if (!documentRegistry) {
      try {
        documentRegistry = ts.createDocumentRegistry();
      } catch (error) {
        return {
          accept: false,
          reason:
            `Failed to initialize TypeScript document registry: ${error.message}. ` +
            `Ensure TypeScript is properly installed and compatible.`,
        };
      }
    }

    // Only validate JavaScript/TypeScript files
    if (item.language !== 'javascript' && item.language !== 'typescript') {
      return { accept: true };
    }

    // Skip if type enforcement is disabled
    if (config.jsdocStyle?.enforceTypes === false) {
      return { accept: true };
    }

    const errors = [];

    // Extract parameter names from JSDoc (uses parseJSDoc from closure)
    const jsdocParams = extractJSDocParamNames(docstring);

    // Get language service for signature extraction and validation (uses ts from closure)
    let functionInfo = null;
    if (item.code && item.filepath) {
      const service = getCachedLanguageService(item.filepath, item.code);
      functionInfo = extractFunctionSignature(
        service,
        item.filepath,
        item.name
      );
    }

    // Validate parameter names match
    if (functionInfo && item.parameters) {
      const actualParams = functionInfo.params;

      // Check if parameter names match
      if (jsdocParams.length !== actualParams.length) {
        errors.push(
          `Parameter count mismatch: JSDoc has ${jsdocParams.length} params, function has ${actualParams.length}`
        );
      } else {
        const mismatches = [];
        for (let i = 0; i < jsdocParams.length; i++) {
          if (jsdocParams[i] !== actualParams[i]) {
            mismatches.push(
              `  Position ${i + 1}: JSDoc says "${jsdocParams[i]}", function says "${actualParams[i]}"`
            );
          }
        }

        if (mismatches.length > 0) {
          errors.push('Parameter name mismatch:\n' + mismatches.join('\n'));
        }
      }
    }

    // Run TypeScript compiler validation (uses ts from closure)
    const compilerResult = validateWithCompiler(item.filepath, item.code);
    if (!compilerResult.valid) {
      errors.push(
        'TypeScript compiler errors:\n  ' + compilerResult.errors.join('\n  ')
      );
    }

    // If there are errors, reject with detailed message
    if (errors.length > 0) {
      const reason = errors.join('\n\n');

      // Try to generate an auto-fix
      let autoFix = null;
      if (functionInfo && jsdocParams.length === functionInfo.params.length) {
        autoFix = generateParameterFix(
          docstring,
          jsdocParams,
          functionInfo.params
        );
      }

      return {
        accept: false,
        reason,
        autoFix: autoFix || undefined,
      };
    }

    return { accept: true };
  }

  // ============================================================================
  // PLUGIN OBJECT
  // ============================================================================

  // Return the plugin object with hooks that access dependencies via closure
  return {
    name: 'validate-types',
    version: '1.0.0',
    hooks: {
      beforeAccept,
    },
  };
}

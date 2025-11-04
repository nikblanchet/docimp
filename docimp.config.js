//
// DocImp Configuration File
//
// This file configures DocImp's behavior for documentation analysis,
// generation, and validation. It's written in JavaScript (not JSON)
// to allow custom logic and functions.
//
// Supports both CommonJS and ESM:
// - CommonJS: module.exports = { ... };
// - ESM: export default { ... };
//

export default {
  // Per-language style guides for generated documentation.
  //
  // BREAKING CHANGE (v0.2.0): Replaces single 'styleGuide' string with
  // per-language configuration object.
  //
  // Python options (4 variants):
  // - 'google': Google-style docstrings
  // - 'numpy-rest': NumPy format with reStructuredText markup
  // - 'numpy-markdown': NumPy format with Markdown markup
  // - 'sphinx': Pure reST (Sphinx) style
  //
  // JavaScript options (3 variants):
  // - 'jsdoc-vanilla': Standard JSDoc format
  // - 'jsdoc-google': Google-flavored JSDoc conventions
  // - 'jsdoc-closure': Google Closure Compiler style
  //
  // TypeScript options (3 variants):
  // - 'tsdoc-typedoc': TSDoc format optimized for TypeDoc
  // - 'tsdoc-aedoc': TSDoc for Microsoft API Extractor/AEDoc
  // - 'jsdoc-ts': JSDoc format in TypeScript files (hybrid approach)
  //
  // Defaults: python='google', javascript='jsdoc-vanilla', typescript='tsdoc-typedoc'
  //
  // Migration from v0.1.x:
  // Old: styleGuide: 'jsdoc'
  // New: styleGuides: { python: 'google', javascript: 'jsdoc-vanilla', typescript: 'tsdoc-typedoc' }
  styleGuides: {
    python: 'google',
    javascript: 'jsdoc-vanilla',
    typescript: 'tsdoc-typedoc',
  },

  // Tone of generated documentation.
  //
  // Options:
  // - 'concise': Brief, to-the-point descriptions
  // - 'detailed': Comprehensive explanations with examples
  // - 'friendly': Conversational, approachable language
  //
  // Default: 'concise'
  tone: 'concise',

  // JSDoc-specific style options.
  //
  // These options control JSDoc validation and style enforcement
  // for JavaScript and TypeScript files.
  jsdocStyle: {
    // Preferred tag aliases.
    //
    // Maps alternative JSDoc tag names to preferred forms.
    // For example, prefer @returns over @return, @param over @arg.
    //
    // Common mappings:
    // - return → returns
    // - arg → param
    // - property → prop
    //
    // Default: { return: 'returns', arg: 'param' }
    preferredTags: {
      return: 'returns',
      arg: 'param',
    },

    // Require descriptions for all documented items.
    //
    // When true, enforces that every documented function, class,
    // and method has a description (not just type annotations).
    //
    // Default: true
    requireDescriptions: true,

    // When to require @example tags.
    //
    // Options:
    // - 'all': Require examples for all documented items
    // - 'public': Require examples only for exported/public APIs
    // - 'none': Never require examples
    //
    // Default: 'public'
    requireExamples: 'public',

    // Enforce JSDoc type annotations with TypeScript compiler.
    //
    // When true, validates that:
    // - Parameter names in JSDoc match actual function signatures
    // - JSDoc types are syntactically correct
    // - Types align with TypeScript inference
    //
    // This enables REAL type-checking, not just parsing.
    //
    // Default: true
    enforceTypes: true,
  },

  // Audit code display configuration.
  //
  // Controls how code is displayed during the 'docimp audit' command.
  // Helps users make informed quality ratings by showing code context.
  audit: {
    showCode: {
      // Display mode for code during audit.
      //
      // Options:
      // - 'complete': Show full code block with line numbers, no truncation
      //   - No [C] option shown (full code already displayed)
      //   - Best for: Small functions, reviewing complete context
      //
      // - 'truncated': Show code up to maxLines (default 20), with line numbers
      //   - [C] option available to show full code
      //   - Truncation message shows remaining lines
      //   - Best for: Balancing context with screen space
      //
      // - 'signature': Show only function/class signature (first few lines)
      //   - [C] option available to show full code
      //   - Message shows total line count
      //   - Best for: Quick audits focusing on documentation quality, not implementation
      //
      // - 'on-demand': Hide code by default
      //   - [C] option available to show full code when needed
      //   - Best for: Experienced users who know the codebase
      //
      // Default: 'truncated'
      mode: 'truncated',

      // Maximum lines to show in 'truncated' and 'signature' modes.
      //
      // Note: This does NOT count the docstring itself, only the code.
      // Set to 0 for unlimited (equivalent to 'complete' mode).
      //
      // Default: 20
      maxLines: 20,
    },
  },

  // Claude API configuration.
  //
  // Controls timeout and retry behavior for Claude API requests.
  // These settings apply when using 'docimp improve' command.
  //
  // Use cases:
  // - Slow connections: Increase timeout to 60.0 or higher
  // - Rate-limited projects: Increase maxRetries to 5+ and retryDelay to 2.0
  // - Fast failure for CI/CD: Decrease timeout to 15.0 and maxRetries to 1
  // - Debugging API issues: Increase timeout to 120.0 to avoid false timeouts
  // - No retries: Set maxRetries to 0 to fail immediately on first error
  claude: {
    // API request timeout in seconds.
    //
    // How long to wait for Claude API response before timing out.
    // Increase for slow connections, decrease for faster failure detection.
    //
    // Default: 30.0
    timeout: 30.0,

    // Maximum number of retry attempts.
    //
    // Number of times to retry after rate-limit or timeout errors.
    // Uses exponential backoff between retries.
    // Set to 0 to disable retries (fail immediately on first error).
    //
    // Default: 3
    maxRetries: 3,

    // Base delay in seconds between retries.
    //
    // Initial delay before first retry. Subsequent retries use exponential
    // backoff (delay * 2^attempt). For example, with retryDelay=1.0:
    // - 1st retry: wait 1.0 second
    // - 2nd retry: wait 2.0 seconds
    // - 3rd retry: wait 4.0 seconds
    //
    // Default: 1.0
    retryDelay: 1.0,
  },

  // Transaction system configuration.
  //
  // Controls git operation timeouts for the transaction and rollback system.
  // The transaction system uses a side-car git repository to track all
  // documentation changes, enabling full rollback capability.
  //
  // Use cases:
  // - Network-mounted filesystems: Increase baseTimeout and slowScale
  // - Very large repositories (100K+ files): Increase slowScale to 6.0 or higher
  // - SSDs with fast git operations: Decrease baseTimeout to 15000 (15s)
  // - Severely degraded systems: Increase maxTimeout to 600000 (10 minutes)
  // - Quick failure for CI/CD: Decrease maxTimeout to 120000 (2 minutes)
  transaction: {
    git: {
      // Base timeout for default git operations in milliseconds.
      //
      // Operations like add, commit, checkout use this value directly.
      // Fast operations get baseTimeout * fastScale (5s with defaults).
      // Slow operations get baseTimeout * slowScale (120s with defaults).
      //
      // Default: 30000 (30 seconds)
      baseTimeout: 30000,

      // Scale factor for fast git operations.
      //
      // Fast operations (status, rev-parse, branch, show, diff) are
      // typically query operations that don't modify state.
      // With baseTimeout=30000 and fastScale=0.167, fast ops get 5 seconds.
      //
      // Default: 0.167 (produces 5s timeout with 30s base)
      fastScale: 0.167,

      // Scale factor for slow git operations.
      //
      // Slow operations (merge, revert, reset, init) involve significant
      // work or modification. With baseTimeout=30000 and slowScale=4.0,
      // slow ops get 120 seconds.
      //
      // Increase this for large repositories or slow filesystems:
      // - slowScale: 6.0 -> 180s for slow ops (3 minutes)
      // - slowScale: 10.0 -> 300s for slow ops (5 minutes)
      //
      // Default: 4.0 (produces 120s timeout with 30s base)
      slowScale: 4.0,

      // Absolute maximum timeout cap in milliseconds.
      //
      // No git operation will exceed this timeout regardless of scaling.
      // Prevents indefinite hangs on severely degraded filesystems.
      // If any operation takes longer than this, it's likely a system issue
      // (disk failure, network mount disconnected, etc.) rather than just
      // slow performance.
      //
      // Default: 300000 (5 minutes)
      maxTimeout: 300000,
    },
  },

  // Impact scoring weights.
  //
  // Controls how DocImp prioritizes undocumented code.
  // Weights must sum to 1.0 (±0.01 tolerance for floating-point precision).
  //
  // NOTE: Config validation (TypeScript) issues a warning if weights don't
  // sum to 1.0, but runtime validation (Python ImpactScorer) raises an error.
  // This is intentional: config validation is lenient (suggestions), runtime
  // validation is strict (requirements).
  impactWeights: {
    // Weight for cyclomatic complexity (0-1).
    //
    // Higher values prioritize complex code that needs documentation.
    // Complexity ranges from 1 (simple) to 20+ (very complex).
    //
    // Default: 0.6 (60% of score)
    complexity: 0.6,

    // Weight for audit quality rating (0-1).
    //
    // Higher values prioritize poorly-documented code.
    // Only applies after running 'docimp audit'.
    //
    // Quality ratings:
    // - No docs: 100 penalty
    // - Terrible (1): 80 penalty
    // - OK (2): 40 penalty
    // - Good (3): 20 penalty
    // - Excellent (4): 0 penalty
    //
    // Default: 0.4 (40% of score)
    quality: 0.4,
  },

  // Validation plugins.
  //
  // Plugins are JavaScript files that export validation hooks.
  // They run before documentation is accepted and can:
  // - Validate generated documentation
  // - Enforce style rules
  // - Provide auto-fix suggestions
  // - Block acceptance if validation fails
  //
  // Built-in plugins:
  // - validate-types.js: Real JSDoc type-checking with TypeScript compiler
  // - jsdoc-style.js: JSDoc style enforcement
  //
  // Paths are relative to project root.
  //
  // Security note: Plugins have full Node.js access (no sandboxing).
  // Only load plugins you trust.
  //
  // Format options:
  //
  // Option 1: Simple array of paths (uses default 10s timeout)
  // plugins: [
  //   './plugins/validate-types.js',
  //   './plugins/jsdoc-style.js',
  // ],
  //
  // Option 2: Object with paths and global timeout
  // plugins: {
  //   paths: [
  //     './plugins/validate-types.js',
  //     './plugins/jsdoc-style.js',
  //   ],
  //   timeout: 15000, // 15 seconds default for all plugins
  // },
  //
  // Timeout behavior:
  // - Default timeout: 10000ms (10 seconds)
  // - Global timeout: config.plugins.timeout (applies to all plugins)
  // - Per-plugin timeout: plugin.timeout field (overrides global)
  // - Precedence: plugin.timeout > config.plugins.timeout > 10000ms
  //
  // Example: Plugin with custom timeout
  // export default {
  //   name: 'slow-validator',
  //   version: '1.0.0',
  //   timeout: 30000, // 30 seconds for this plugin specifically
  //   hooks: { ... },
  // };
  //
  // Default: []
  plugins: [
    './plugins/validate-types.js',
    './plugins/jsdoc-style.js',
  ],

  // File exclusion patterns.
  //
  // Glob patterns for files to exclude from analysis.
  // Supports standard glob syntax:
  // - * matches any characters (except /)
  // - ** matches any characters (including /)
  // - ? matches a single character
  // - [abc] matches any character in the set
  //
  // Common exclusions:
  // - Test files
  // - Build output
  // - Dependencies
  // - Generated code
  //
  // Default: ['**/test_*.py', '**/*.test.ts', '**/node_modules/**', ...]
  exclude: [
    // Python test files
    '**/test_*.py',
    '**/*_test.py',
    '**/tests/**/*.py',

    // JavaScript/TypeScript test files
    '**/tests/**/*.ts',
    '**/tests/**/*.js',
    '**/*.test.ts',
    '**/*.test.js',
    '**/*.spec.ts',
    '**/*.spec.js',

    // Dependencies
    '**/node_modules/**',
    '**/venv/**',
    '**/.venv/**',

    // Build output
    '**/dist/**',
    '**/build/**',
    '**/__pycache__/**',
    '**/*.pyc',

    // Version control
    '**/.git/**',
  ],
};

// Example: Custom pattern detector (future enhancement)
//
// You can define custom functions to detect patterns in your code.
// These could be used in future versions to boost impact scores
// for specific architectural patterns.
//
// Example:
// customPatterns: {
//   // Detect Repository pattern classes
//   isRepository: (item) => {
//     return item.type === 'class' && item.name.endsWith('Repository');
//   },
//
//   // Detect dependency injection constructors
//   usesDependencyInjection: (item) => {
//     return item.type === 'constructor' && item.parameters.length > 2;
//   },
// }

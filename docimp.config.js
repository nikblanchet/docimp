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
  // Style guide for generated documentation.
  //
  // Options:
  // - 'numpy': NumPy-style docstrings (Python)
  // - 'google': Google-style docstrings (Python)
  // - 'sphinx': Sphinx-style docstrings (Python)
  // - 'jsdoc': JSDoc style (JavaScript/TypeScript)
  //
  // Default: 'numpy'
  styleGuide: 'jsdoc',

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

  // Impact scoring weights.
  //
  // Controls how DocImp prioritizes undocumented code.
  // Weights should sum to 1.0.
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

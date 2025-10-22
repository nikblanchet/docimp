/**
 * Configuration interface for DocImp.
 *
 * This interface defines all user-configurable options for documentation
 * analysis, generation, and validation. Configuration files are written in
 * JavaScript (CommonJS or ESM) to allow custom logic and functions.
 */

import type { SupportedLanguage } from '../types/analysis.js';

/**
 * Main configuration interface.
 */
export interface IConfig {
  /**
   * Per-language style guides for generated documentation.
   *
   * Python options:
   * - 'google': Google-style docstrings
   * - 'numpy-rest': NumPy style with reStructuredText markup
   * - 'numpy-markdown': NumPy style with Markdown markup
   * - 'sphinx': Pure reST (Sphinx) style
   *
   * JavaScript options:
   * - 'jsdoc-vanilla': Standard JSDoc format
   * - 'jsdoc-google': Google-flavored JSDoc
   * - 'jsdoc-closure': Google Closure Compiler style
   *
   * TypeScript options:
   * - 'tsdoc-typedoc': TSDoc format for TypeDoc
   * - 'tsdoc-aedoc': TSDoc for API Extractor/AEDoc
   * - 'jsdoc-ts': JSDoc format in TypeScript files
   */
  styleGuides: Partial<Record<SupportedLanguage, string>>;

  /**
   * Tone of generated documentation.
   * - 'concise': Brief, to-the-point descriptions
   * - 'detailed': Comprehensive explanations
   * - 'friendly': Conversational, approachable language
   */
  tone: 'concise' | 'detailed' | 'friendly';

  /**
   * JSDoc-specific configuration options.
   */
  jsdocStyle?: IJSDocStyle;

  /**
   * Weights for impact scoring algorithm.
   */
  impactWeights?: IImpactWeights;

  /**
   * Paths to validation plugins.
   * Plugins are JavaScript files that export validation hooks.
   */
  plugins?: string[];

  /**
   * Glob patterns for files to exclude from analysis.
   */
  exclude?: string[];

  /**
   * Audit command configuration.
   */
  audit?: IAuditConfig;

  /**
   * Claude API configuration.
   */
  claude?: IClaudeConfig;
}

/**
 * JSDoc-specific style options.
 */
export interface IJSDocStyle {
  /**
   * Preferred tag aliases.
   * Maps alternative tag names to the preferred form.
   * Example: { return: 'returns', arg: 'param' }
   */
  preferredTags?: Record<string, string>;

  /**
   * Require descriptions for all documented items.
   */
  requireDescriptions?: boolean;

  /**
   * When to require @example tags.
   * - 'all': Require examples for all documented items
   * - 'public': Require examples for exported/public APIs only
   * - 'none': Never require examples
   */
  requireExamples?: 'all' | 'public' | 'none';

  /**
   * Enforce JSDoc type annotations with TypeScript compiler.
   * When true, validates that JSDoc types match actual signatures.
   */
  enforceTypes?: boolean;
}

/**
 * Impact scoring weights.
 */
export interface IImpactWeights {
  /**
   * Weight for cyclomatic complexity (0-1).
   * Higher complexity code is prioritized for documentation.
   */
  complexity: number;

  /**
   * Weight for audit quality rating (0-1).
   * Poor-quality documentation is prioritized for improvement.
   * Only applies after running 'docimp audit'.
   */
  quality: number;
}

/**
 * Audit command configuration.
 */
export interface IAuditConfig {
  /**
   * Code display settings for audit workflow.
   */
  showCode?: {
    /**
     * Display mode for code during audit:
     * - 'complete': Show full code, no truncation, no [C] option
     * - 'truncated': Show code up to maxLines (default), [C] shows full
     * - 'signature': Show just function/class signature, [C] shows full
     * - 'on-demand': Don't show code by default, [C] shows full
     */
    mode: 'complete' | 'truncated' | 'signature' | 'on-demand';

    /**
     * Maximum lines to show in 'truncated' and 'signature' modes.
     * Does not count the docstring itself.
     * Set to 0 for unlimited.
     */
    maxLines: number;
  };
}

/**
 * Claude API configuration.
 *
 * All fields are optional in user configuration files.
 * Defaults are applied during validation via ConfigValidator.validateAndMerge(),
 * ensuring all fields have values at runtime.
 */
export interface IClaudeConfig {
  /**
   * API request timeout in seconds.
   *
   * How long to wait for Claude API response before timing out.
   * Increase for slow connections, decrease for faster failure detection.
   *
   * Default: 30.0
   */
  timeout?: number;

  /**
   * Maximum number of retry attempts for rate-limited or timed-out requests.
   *
   * Uses exponential backoff between retries. Setting to 0 disables retries
   * (fail immediately on first error).
   *
   * Default: 3
   */
  maxRetries?: number;

  /**
   * Base delay in seconds between retries (uses exponential backoff).
   *
   * Initial delay before first retry. Subsequent retries use exponential
   * backoff: delay * 2^attempt.
   *
   * Default: 1.0
   */
  retryDelay?: number;
}

/**
 * Default configuration values.
 */
export const defaultConfig: IConfig = {
  styleGuides: {
    python: 'google',
    javascript: 'jsdoc-vanilla',
    typescript: 'tsdoc-typedoc',
  },
  tone: 'concise',
  jsdocStyle: {
    preferredTags: {
      return: 'returns',
      arg: 'param',
    },
    requireDescriptions: true,
    requireExamples: 'public',
    enforceTypes: true,
  },
  impactWeights: {
    complexity: 0.6,
    quality: 0.4,
  },
  plugins: [],
  exclude: [
    '**/test_*.py',
    '**/*.test.ts',
    '**/*.test.js',
    '**/node_modules/**',
    '**/venv/**',
    '**/__pycache__/**',
    '**/dist/**',
    '**/build/**',
  ],
  audit: {
    showCode: {
      mode: 'truncated',
      maxLines: 20,
    },
  },
  claude: {
    timeout: 30.0,
    maxRetries: 3,
    retryDelay: 1.0,
  },
};

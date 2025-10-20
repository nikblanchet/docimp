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
};

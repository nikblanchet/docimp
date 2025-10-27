/**
 * Plugin interface for DocImp validation hooks.
 *
 * Plugins are JavaScript files that export validation functions to run
 * before or after documentation is written to files. They enable extensible
 * validation, style enforcement, and auto-fixing.
 *
 * Security Model:
 * - Plugins run with full Node.js access (no sandboxing)
 * - Only load plugins you trust
 * - Default: only load from ./plugins/ or paths in config
 */

import type { IConfig } from '../config/IConfig.js';

/**
 * Dependencies injected into plugin hooks.
 *
 * This allows plugins to use external modules without hardcoded imports,
 * making them more portable and testable.
 */
export interface PluginDependencies {
  /**
   * TypeScript compiler API.
   * Injected from cli/node_modules/typescript to avoid fragile path resolution.
   */
  typescript?: typeof import('typescript');

  /**
   * comment-parser library for JSDoc parsing.
   * Injected from cli/node_modules/comment-parser.
   */
  commentParser?: {
    parse: (source: string, options?: Record<string, unknown>) => unknown[];
  };
}

/**
 * Result returned by plugin validation hooks.
 */
export interface PluginResult {
  /**
   * Whether to accept the documentation.
   * - true: Documentation is valid, proceed
   * - false: Documentation has errors, block acceptance
   */
  accept: boolean;

  /**
   * Human-readable reason for rejection.
   * Required when accept is false.
   */
  reason?: string;

  /**
   * Suggested automatic fix.
   * If provided, the improve workflow can offer to apply this fix.
   */
  autoFix?: string;
}

/**
 * Metadata about a code item being documented.
 * Subset of CodeItem from Python analyzer.
 */
export interface CodeItemMetadata {
  /** Function/class/method name */
  name: string;

  /** Type of code item */
  type: 'function' | 'class' | 'method';

  /** File path */
  filepath: string;

  /** Line number */
  line_number: number;

  /** Language */
  language: 'python' | 'typescript' | 'javascript';

  /** Cyclomatic complexity */
  complexity: number;

  /** Export type (for JS/TS) */
  export_type?: 'named' | 'default' | 'commonjs' | 'internal';

  /** Module system (for JS) */
  module_system?: 'esm' | 'commonjs' | 'unknown';

  /** Original source code (if available) */
  code?: string;

  /** Function parameters */
  parameters?: string[];

  /** Return type */
  return_type?: string;
}

/**
 * Plugin validation hooks.
 */
export interface PluginHooks {
  /**
   * Run before accepting generated documentation.
   *
   * This hook validates that the generated documentation:
   * - Follows style rules
   * - Has correct types
   * - Matches the actual code signature
   * - Meets quality standards
   *
   * @param docstring - Generated documentation string
   * @param item - Metadata about the code item being documented
   * @param config - User configuration
   * @param dependencies - Injected dependencies (TypeScript, comment-parser, etc.). Required as of v0.2.0.
   * @returns Promise resolving to validation result
   */
  beforeAccept?: (
    docstring: string,
    item: CodeItemMetadata,
    config: IConfig,
    dependencies: PluginDependencies
  ) => Promise<PluginResult>;

  /**
   * Run after writing documentation to file.
   *
   * This hook can:
   * - Verify the file was written correctly
   * - Run linters or formatters
   * - Update related documentation
   * - Trigger build processes
   *
   * @param filepath - Path to the file that was modified
   * @param item - Metadata about the code item that was documented
   * @param dependencies - Injected dependencies (TypeScript, comment-parser, etc.). Required as of v0.2.0.
   * @returns Promise resolving to validation result
   */
  afterWrite?: (
    filepath: string,
    item: CodeItemMetadata,
    dependencies: PluginDependencies
  ) => Promise<PluginResult>;
}

/**
 * Plugin interface.
 *
 * A plugin is a JavaScript module that exports an object implementing
 * this interface. Plugins are loaded dynamically at runtime.
 */
export interface IPlugin {
  /** Plugin name (for display and error messages) */
  name: string;

  /** Plugin version (semantic versioning recommended) */
  version: string;

  /** Validation hooks */
  hooks: PluginHooks;

  /**
   * Timeout for plugin execution in milliseconds.
   * If a plugin hook takes longer than this, it will be rejected.
   * Default: 10000ms (10 seconds)
   */
  timeout?: number;
}

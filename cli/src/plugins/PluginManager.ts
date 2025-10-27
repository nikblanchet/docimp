/**
 * Plugin manager for loading and executing validation plugins.
 *
 * This class handles:
 * - Dynamic loading of JavaScript plugin files
 * - Error isolation per plugin
 * - Hook execution with result aggregation
 * - Security validation (path restrictions)
 */

import { pathToFileURL } from 'node:url';
import { resolve, sep, extname } from 'node:path';
import { existsSync, realpathSync } from 'node:fs';
import type {
  IPlugin,
  PluginResult,
  CodeItemMetadata,
  PluginDependencies,
} from './IPlugin.js';
import type { IConfig } from '../config/IConfig.js';
import { isPluginConfig } from '../config/IConfig.js';

// Import dependencies to inject into plugins
import * as typescript from 'typescript';
import { parse as commentParserParse } from 'comment-parser';

/**
 * Manages plugin loading and execution.
 */
export class PluginManager {
  private plugins: IPlugin[] = [];
  private loadedPaths: Set<string> = new Set();
  private config?: IConfig;

  /**
   * Create a new PluginManager.
   *
   * @param config - Optional configuration containing global plugin timeout
   */
  constructor(config?: IConfig) {
    this.config = config;
  }

  /**
   * Load plugins from file paths.
   *
   * @param pluginPaths - Array of paths to plugin files
   * @param projectRoot - Project root directory (for relative path resolution)
   * @param additionalAllowedDirs - Additional directories to allow plugin loading from (for testing only)
   * @throws Error if plugin loading fails
   */
  async loadPlugins(
    pluginPaths: string[],
    projectRoot?: string,
    additionalAllowedDirs?: string[]
  ): Promise<void> {
    const root = projectRoot || process.cwd();

    for (const pluginPath of pluginPaths) {
      try {
        await this.loadPlugin(pluginPath, root, additionalAllowedDirs);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        throw new Error(
          `Failed to load plugin from ${pluginPath}: ${errorMessage}`
        );
      }
    }
  }

  /**
   * Load a single plugin from a file path.
   *
   * @param pluginPath - Path to plugin file (relative or absolute)
   * @param projectRoot - Project root directory
   * @param additionalAllowedDirs - Additional directories to allow plugin loading from (for testing only)
   */
  private async loadPlugin(
    pluginPath: string,
    projectRoot: string,
    additionalAllowedDirs?: string[]
  ): Promise<void> {
    // Resolve relative paths from project root
    const absolutePath = resolve(projectRoot, pluginPath);

    // Validate path is safe before loading
    this.validatePluginPath(absolutePath, projectRoot, pluginPath, additionalAllowedDirs);

    // Prevent duplicate loading
    if (this.loadedPaths.has(absolutePath)) {
      return;
    }

    // Convert to file URL for dynamic import (works with both ESM and CJS)
    const fileUrl = pathToFileURL(absolutePath).href;

    // Dynamic import (works with both ESM and CommonJS via Node.js)
    const module = await import(fileUrl);

    // Extract the plugin object (handle default exports and named exports)
    const plugin: IPlugin = module.default || module;

    // Validate plugin structure
    this.validatePlugin(plugin, pluginPath);

    // Register the plugin
    this.plugins.push(plugin);
    this.loadedPaths.add(absolutePath);
  }

  /**
   * Validate that a plugin path is safe to load.
   *
   * Security restrictions:
   * - Only allows plugins from ./plugins/ or node_modules/ directories
   * - Resolves symlinks to prevent path traversal attacks
   * - Validates file exists and has correct extension
   *
   * @param absolutePath - Absolute path to plugin file
   * @param projectRoot - Project root directory
   * @param originalPath - Original path from config (for error messages)
   * @param additionalAllowedDirs - Additional directories to allow (for testing only)
   * @throws Error if plugin path is unsafe or invalid
   */
  private validatePluginPath(
    absolutePath: string,
    projectRoot: string,
    originalPath: string,
    additionalAllowedDirs?: string[]
  ): void {
    // Check if file exists
    if (!existsSync(absolutePath)) {
      throw new Error(
        `Plugin file does not exist: ${originalPath}`
      );
    }

    // Resolve symlinks to get canonical path
    let canonicalPath: string;
    try {
      canonicalPath = realpathSync(absolutePath);
    } catch (error) {
      throw new Error(
        `Failed to resolve plugin path ${originalPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Validate file extension
    const ext = extname(canonicalPath);
    const validExtensions = ['.js', '.mjs', '.cjs'];
    if (!validExtensions.includes(ext)) {
      throw new Error(
        `Plugin file must have .js, .mjs, or .cjs extension. Got: ${ext} (${originalPath})`
      );
    }

    // Define allowed directories (whitelist)
    const allowedDirs = [
      resolve(projectRoot, 'plugins'),
      resolve(projectRoot, 'node_modules'),
      ...(additionalAllowedDirs || []),
    ];

    // Check if canonical path is within allowed directories
    const isAllowed = allowedDirs.some((dir) =>
      canonicalPath.startsWith(dir + sep)
    );

    if (!isAllowed) {
      throw new Error(
        `Plugin path ${originalPath} is outside allowed directories. ` +
        `Resolved to: ${canonicalPath}. ` +
        `Plugins must be in ./plugins/ or node_modules/`
      );
    }
  }

  /**
   * Validate that a loaded module implements the IPlugin interface.
   *
   * @param plugin - Plugin object to validate
   * @param pluginPath - Path to plugin (for error messages)
   * @throws Error if plugin is invalid
   */
  private validatePlugin(plugin: unknown, pluginPath: string): void {
    if (!plugin || typeof plugin !== 'object') {
      throw new Error(
        `Plugin at ${pluginPath} must export an object`
      );
    }

    const p = plugin as Record<string, unknown>;

    if (typeof p.name !== 'string') {
      throw new Error(
        `Plugin at ${pluginPath} must have a 'name' property (string)`
      );
    }

    if (typeof p.version !== 'string') {
      throw new Error(
        `Plugin at ${pluginPath} must have a 'version' property (string)`
      );
    }

    if (!p.hooks || typeof p.hooks !== 'object') {
      throw new Error(
        `Plugin at ${pluginPath} must have a 'hooks' property (object)`
      );
    }

    const hooks = p.hooks as Record<string, unknown>;

    // Validate hook signatures (at least one hook must be present)
    if (!hooks.beforeAccept && !hooks.afterWrite) {
      throw new Error(
        `Plugin at ${pluginPath} must implement at least one hook (beforeAccept or afterWrite)`
      );
    }

    if (hooks.beforeAccept && typeof hooks.beforeAccept !== 'function') {
      throw new Error(
        `Plugin ${p.name}: beforeAccept hook must be a function`
      );
    }

    if (hooks.afterWrite && typeof hooks.afterWrite !== 'function') {
      throw new Error(
        `Plugin ${p.name}: afterWrite hook must be a function`
      );
    }
  }

  /**
   * Prepare dependencies to inject into plugin hooks.
   *
   * @returns Dependencies object with TypeScript compiler and other utilities
   */
  private prepareDependencies(): PluginDependencies {
    return {
      typescript,
      commentParser: {
        parse: commentParserParse,
      },
    };
  }

  /**
   * Get the default timeout from config, or fall back to 10 seconds.
   *
   * @returns Default timeout in milliseconds
   */
  private getDefaultTimeout(): number {
    if (isPluginConfig(this.config?.plugins)) {
      return this.config.plugins.timeout ?? 10000;
    }
    return 10000;
  }

  /**
   * Wrap a promise with a timeout.
   *
   * If the promise doesn't resolve within the timeout period, it will be
   * rejected with a timeout error.
   *
   * @param promise - Promise to wrap with timeout
   * @param timeoutMs - Timeout in milliseconds
   * @param pluginName - Plugin name (for error messages)
   * @returns Promise that rejects if timeout is exceeded
   */
  private withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    pluginName: string
  ): Promise<T> {
    let timerId: NodeJS.Timeout;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timerId = setTimeout(
        () => reject(new Error(`Plugin ${pluginName} timed out after ${timeoutMs}ms`)),
        timeoutMs
      );
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
      clearTimeout(timerId);
    });
  }

  /**
   * Format plugin error message for consistent error reporting.
   *
   * Distinguishes between timeout errors (which already include plugin name and details)
   * and plugin exceptions (which need to be prefixed with context).
   *
   * @param pluginName - Name of the plugin that threw the error
   * @param error - Error thrown by the plugin
   * @returns Formatted error message
   */
  private formatPluginError(pluginName: string, error: unknown): string {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isTimeout = errorMessage.includes('timed out after');
    return isTimeout
      ? errorMessage // Timeout error already includes plugin name and details
      : `Plugin ${pluginName} threw an error: ${errorMessage}`;
  }

  /**
   * Run beforeAccept hooks for all loaded plugins.
   *
   * Sequential execution: Plugins run one after another, not in parallel.
   * This means a slow plugin (even under timeout) will block subsequent plugins.
   * For example, if plugin A takes 9s and plugin B takes 9s, total time is 18s
   * (both under the 10s timeout individually, but not concurrent).
   *
   * Error isolation: If a plugin throws an exception, it's caught and
   * returned as a rejection with error details. Other plugins continue running.
   *
   * Timeout protection: Each plugin has a configurable timeout.
   * Timeout precedence: plugin.timeout > config.plugins.timeout > 10000ms default.
   * If a plugin exceeds its timeout, it's rejected with a timeout error.
   *
   * @param docstring - Generated documentation string
   * @param item - Code item metadata
   * @param config - User configuration
   * @returns Array of results (one per plugin)
   */
  async runBeforeAccept(
    docstring: string,
    item: CodeItemMetadata,
    config: IConfig
  ): Promise<PluginResult[]> {
    const results: PluginResult[] = [];
    const dependencies = this.prepareDependencies();

    for (const plugin of this.plugins) {
      // Skip plugins without beforeAccept hook
      if (!plugin.hooks.beforeAccept) {
        continue;
      }

      try {
        const timeoutMs = plugin.timeout ?? this.getDefaultTimeout();
        const result = await this.withTimeout(
          plugin.hooks.beforeAccept(
            docstring,
            item,
            config,
            dependencies
          ),
          timeoutMs,
          plugin.name
        );
        results.push(result);
      } catch (error) {
        // Error isolation: convert exceptions to rejection results
        results.push({
          accept: false,
          reason: this.formatPluginError(plugin.name, error),
        });
      }
    }

    return results;
  }

  /**
   * Run afterWrite hooks for all loaded plugins.
   *
   * Sequential execution: Plugins run one after another, not in parallel.
   * This means a slow plugin (even under timeout) will block subsequent plugins.
   * For example, if plugin A takes 9s and plugin B takes 9s, total time is 18s
   * (both under the 10s timeout individually, but not concurrent).
   *
   * Error isolation: If a plugin throws an exception, it's caught and
   * returned as a rejection with error details. Other plugins continue running.
   *
   * Timeout protection: Each plugin has a configurable timeout.
   * Timeout precedence: plugin.timeout > config.plugins.timeout > 10000ms default.
   * If a plugin exceeds its timeout, it's rejected with a timeout error.
   *
   * @param filepath - Path to the file that was written
   * @param item - Code item metadata
   * @returns Array of results (one per plugin)
   */
  async runAfterWrite(
    filepath: string,
    item: CodeItemMetadata
  ): Promise<PluginResult[]> {
    const results: PluginResult[] = [];
    const dependencies = this.prepareDependencies();

    for (const plugin of this.plugins) {
      // Skip plugins without afterWrite hook
      if (!plugin.hooks.afterWrite) {
        continue;
      }

      try {
        const timeoutMs = plugin.timeout ?? this.getDefaultTimeout();
        const result = await this.withTimeout(
          plugin.hooks.afterWrite(filepath, item, dependencies),
          timeoutMs,
          plugin.name
        );
        results.push(result);
      } catch (error) {
        // Error isolation: convert exceptions to rejection results
        results.push({
          accept: false,
          reason: this.formatPluginError(plugin.name, error),
        });
      }
    }

    return results;
  }

  /**
   * Get list of loaded plugin names.
   *
   * @returns Array of plugin names
   */
  getLoadedPlugins(): string[] {
    return this.plugins.map((p) => p.name);
  }

  /**
   * Clear all loaded plugins.
   * Useful for testing.
   */
  clear(): void {
    this.plugins = [];
    this.loadedPaths.clear();
  }
}

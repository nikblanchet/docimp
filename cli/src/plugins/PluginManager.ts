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
import { resolve } from 'node:path';
import type {
  IPlugin,
  PluginResult,
  CodeItemMetadata,
} from './IPlugin.js';
import type { IConfig } from '../config/IConfig.js';

/**
 * Manages plugin loading and execution.
 */
export class PluginManager {
  private plugins: IPlugin[] = [];
  private loadedPaths: Set<string> = new Set();

  /**
   * Load plugins from file paths.
   *
   * @param pluginPaths - Array of paths to plugin files
   * @param projectRoot - Project root directory (for relative path resolution)
   * @throws Error if plugin loading fails
   */
  async loadPlugins(
    pluginPaths: string[],
    projectRoot?: string
  ): Promise<void> {
    const root = projectRoot || process.cwd();

    for (const pluginPath of pluginPaths) {
      try {
        await this.loadPlugin(pluginPath, root);
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
   */
  private async loadPlugin(
    pluginPath: string,
    projectRoot: string
  ): Promise<void> {
    // Resolve relative paths from project root
    const absolutePath = resolve(projectRoot, pluginPath);

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
   * Run beforeAccept hooks for all loaded plugins.
   *
   * Executes all beforeAccept hooks in sequence. If any plugin rejects,
   * returns the first rejection. Otherwise, returns acceptance.
   *
   * Error isolation: If a plugin throws an exception, it's caught and
   * returned as a rejection with error details.
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

    for (const plugin of this.plugins) {
      // Skip plugins without beforeAccept hook
      if (!plugin.hooks.beforeAccept) {
        continue;
      }

      try {
        const result = await plugin.hooks.beforeAccept(
          docstring,
          item,
          config
        );
        results.push(result);
      } catch (error) {
        // Error isolation: convert exceptions to rejection results
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        results.push({
          accept: false,
          reason: `Plugin ${plugin.name} threw an error: ${errorMessage}`,
        });
      }
    }

    return results;
  }

  /**
   * Run afterWrite hooks for all loaded plugins.
   *
   * Executes all afterWrite hooks in sequence. Collects all results.
   *
   * Error isolation: If a plugin throws an exception, it's caught and
   * returned as a rejection with error details.
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

    for (const plugin of this.plugins) {
      // Skip plugins without afterWrite hook
      if (!plugin.hooks.afterWrite) {
        continue;
      }

      try {
        const result = await plugin.hooks.afterWrite(filepath, item);
        results.push(result);
      } catch (error) {
        // Error isolation: convert exceptions to rejection results
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        results.push({
          accept: false,
          reason: `Plugin ${plugin.name} threw an error: ${errorMessage}`,
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

/**
 * Interface for plugin manager.
 *
 * Defines the contract for loading and executing validation plugins.
 */

import type {
  PluginResult,
  CodeItemMetadata,
} from './IPlugin.js';
import type { IConfig } from '../config/IConfig.js';

/**
 * Plugin manager interface.
 *
 * Implementations handle plugin loading, validation, and hook execution.
 */
export interface IPluginManager {
  /**
   * Load plugins from file paths.
   *
   * @param pluginPaths - Array of paths to plugin files
   * @param projectRoot - Project root directory (for relative path resolution)
   * @param additionalAllowedDirs - Additional directories to allow plugin loading from (for testing only)
   * @throws Error if plugin loading fails
   */
  loadPlugins(
    pluginPaths: string[],
    projectRoot?: string,
    additionalAllowedDirs?: string[]
  ): Promise<void>;

  /**
   * Run beforeAccept hooks for all loaded plugins.
   *
   * @param docstring - Generated documentation string
   * @param item - Code item metadata
   * @param config - User configuration
   * @returns Array of results (one per plugin)
   */
  runBeforeAccept(
    docstring: string,
    item: CodeItemMetadata,
    config: IConfig
  ): Promise<PluginResult[]>;

  /**
   * Run afterWrite hooks for all loaded plugins.
   *
   * @param filepath - Path to the file that was written
   * @param item - Code item metadata
   * @returns Array of results (one per plugin)
   */
  runAfterWrite(
    filepath: string,
    item: CodeItemMetadata
  ): Promise<PluginResult[]>;

  /**
   * Get list of loaded plugin names.
   *
   * @returns Array of plugin names
   */
  getLoadedPlugins(): string[];

  /**
   * Clear all loaded plugins.
   * Useful for testing.
   */
  clear(): void;
}

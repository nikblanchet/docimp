/**
 * Configuration loader for DocImp.
 *
 * Loads and validates user configuration from JavaScript files.
 * Supports both CommonJS (module.exports) and ESM (export default) formats.
 */

import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PathValidator } from '../utils/PathValidator.js';
import type { IConfig } from './IConfig.js';
import { defaultConfig } from './IConfig.js';
import { validateAndMerge } from './ConfigValidator.js';

/**
 * Configuration loader class.
 *
 * Dynamically imports JavaScript configuration files and validates them
 * against the IConfig schema.
 */
export class ConfigLoader {
  /**
   * Load configuration from a file path.
   *
   * Searches for configuration in the following order:
   * 1. Provided configPath parameter
   * 2. docimp.config.js in current directory
   * 3. Default configuration
   *
   * @param configPath - Optional path to configuration file
   * @returns Validated configuration object
   * @throws Error if config file is malformed or validation fails
   */
  async load(configPath?: string): Promise<IConfig> {
    let resolvedPath: string | null = null;

    // If explicit path provided (including empty string), validate it with PathValidator
    if (configPath !== undefined) {
      // Use PathValidator for consistent error messages
      resolvedPath = PathValidator.validateConfigPath(configPath);
    } else {
      // Try to find config in current directory (auto-discovery - no validation needed)
      const defaultPath = resolve(process.cwd(), 'docimp.config.js');
      if (existsSync(defaultPath)) {
        resolvedPath = defaultPath;
      }
    }

    // If no config file found, use defaults
    if (!resolvedPath) {
      return { ...defaultConfig };
    }

    // Load the configuration file
    let userConfig: Partial<IConfig>;
    try {
      // Convert file path to URL for dynamic import
      const fileUrl = pathToFileURL(resolvedPath).href;
      const module = await import(fileUrl);

      // Handle both CommonJS (default export) and ESM
      userConfig = module.default || module;
    } catch (error) {
      throw new Error(
        `Failed to load configuration file: ${resolvedPath}\n${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Validate and merge with defaults
    const config = validateAndMerge(userConfig);
    return config;
  }
}

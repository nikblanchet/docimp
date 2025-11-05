/**
 * Configuration loader for DocImp.
 *
 * Loads and validates user configuration from JavaScript files.
 * Supports both CommonJS (module.exports) and ESM (export default) formats.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PathValidator } from '../utils/path-validator.js';
import { ConfigErrorClassifier } from './config-error-classifier.js';
import { validateAndMerge } from './config-validator.js';
import type { IConfigLoader } from './i-config-loader.js';
import type { IConfig } from './i-config.js';
import { defaultConfig } from './i-config.js';

/**
 * Configuration loader class.
 *
 * Dynamically imports JavaScript configuration files and validates them
 * against the IConfig schema.
 */
export class ConfigLoader implements IConfigLoader {
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

    // If explicit path provided, validate it
    if (configPath === undefined) {
      // Try to find config in current directory (auto-discovery - no validation needed)
      const defaultPath = path.resolve(process.cwd(), 'docimp.config.js');
      if (existsSync(defaultPath)) {
        resolvedPath = defaultPath;
      }
    } else {
      // Reject empty strings at the API boundary
      if (configPath === '') {
        throw new Error(
          'Config file path cannot be empty.\n' +
            'Please provide a valid config file path.'
        );
      }
      // Use PathValidator for file existence and type validation
      resolvedPath = PathValidator.validateConfigPath(configPath);
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
      // Classify the error and provide helpful feedback
      const errorDetails = ConfigErrorClassifier.classify(error, resolvedPath);

      // Build comprehensive error message
      const errorMessage = [
        errorDetails.userMessage,
        '',
        `Config file: ${resolvedPath}`,
        '',
        'Technical details:',
        errorDetails.technicalDetails,
      ];

      if (errorDetails.suggestions.length > 0) {
        errorMessage.push('', 'Suggestions:');
        for (const suggestion of errorDetails.suggestions) {
          errorMessage.push(`  - ${suggestion}`);
        }
      }

      throw new Error(errorMessage.join('\n'));
    }

    // Validate and merge with defaults
    const config = validateAndMerge(userConfig);
    return config;
  }
}

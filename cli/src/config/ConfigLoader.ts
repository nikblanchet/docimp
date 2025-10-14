/**
 * Configuration loader for DocImp.
 *
 * Loads and validates user configuration from JavaScript files.
 * Supports both CommonJS (module.exports) and ESM (export default) formats.
 */

import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { IConfig } from './IConfig.js';
import { defaultConfig } from './IConfig.js';

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

    // If explicit path provided, use it
    if (configPath) {
      resolvedPath = resolve(configPath);
      if (!existsSync(resolvedPath)) {
        throw new Error(`Configuration file not found: ${resolvedPath}`);
      }
    } else {
      // Try to find config in current directory
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
    const config = this.validateAndMerge(userConfig);
    return config;
  }

  /**
   * Validate user configuration and merge with defaults.
   *
   * @param userConfig - User-provided configuration (partial)
   * @returns Validated and merged configuration
   * @throws Error if validation fails
   */
  private validateAndMerge(userConfig: Partial<IConfig>): IConfig {
    // Validate styleGuide
    if (userConfig.styleGuide !== undefined) {
      const validStyles = ['numpy', 'google', 'sphinx', 'jsdoc'];
      if (!validStyles.includes(userConfig.styleGuide)) {
        throw new Error(
          `Invalid styleGuide: ${userConfig.styleGuide}. Must be one of: ${validStyles.join(', ')}`
        );
      }
    }

    // Validate tone
    if (userConfig.tone !== undefined) {
      const validTones = ['concise', 'detailed', 'friendly'];
      if (!validTones.includes(userConfig.tone)) {
        throw new Error(
          `Invalid tone: ${userConfig.tone}. Must be one of: ${validTones.join(', ')}`
        );
      }
    }

    // Validate jsdocStyle
    if (userConfig.jsdocStyle !== undefined) {
      if (userConfig.jsdocStyle.requireExamples !== undefined) {
        const validValues = ['all', 'public', 'none'];
        if (!validValues.includes(userConfig.jsdocStyle.requireExamples)) {
          throw new Error(
            `Invalid jsdocStyle.requireExamples: ${userConfig.jsdocStyle.requireExamples}. Must be one of: ${validValues.join(', ')}`
          );
        }
      }
    }

    // Validate impactWeights
    if (userConfig.impactWeights !== undefined) {
      const { complexity, quality } = userConfig.impactWeights;
      if (complexity !== undefined) {
        if (complexity < 0 || complexity > 1) {
          throw new Error(
            `Invalid impactWeights.complexity: ${complexity}. Must be between 0 and 1`
          );
        }
      }
      if (quality !== undefined) {
        if (quality < 0 || quality > 1) {
          throw new Error(
            `Invalid impactWeights.quality: ${quality}. Must be between 0 and 1`
          );
        }
      }
      // Warn if weights don't sum to 1
      const complexityWeight = complexity ?? defaultConfig.impactWeights!.complexity;
      const qualityWeight = quality ?? defaultConfig.impactWeights!.quality;
      const sum = complexityWeight + qualityWeight;
      if (Math.abs(sum - 1.0) > 0.01) {
        console.warn(
          `Warning: impactWeights.complexity (${complexityWeight}) + impactWeights.quality (${qualityWeight}) = ${sum}, not 1.0`
        );
      }
    }

    // Validate plugins array
    if (userConfig.plugins !== undefined) {
      if (!Array.isArray(userConfig.plugins)) {
        throw new Error('plugins must be an array of strings');
      }
      for (const plugin of userConfig.plugins) {
        if (typeof plugin !== 'string') {
          throw new Error('Each plugin must be a string path');
        }
      }
    }

    // Validate exclude array
    if (userConfig.exclude !== undefined) {
      if (!Array.isArray(userConfig.exclude)) {
        throw new Error('exclude must be an array of strings');
      }
      for (const pattern of userConfig.exclude) {
        if (typeof pattern !== 'string') {
          throw new Error('Each exclude pattern must be a string');
        }
      }
    }

    // Merge with defaults
    const config: IConfig = {
      styleGuide: userConfig.styleGuide ?? defaultConfig.styleGuide,
      tone: userConfig.tone ?? defaultConfig.tone,
      jsdocStyle: {
        ...defaultConfig.jsdocStyle,
        ...userConfig.jsdocStyle,
      },
      impactWeights: {
        ...defaultConfig.impactWeights!,
        ...userConfig.impactWeights,
      },
      plugins: userConfig.plugins ?? defaultConfig.plugins,
      exclude: userConfig.exclude ?? defaultConfig.exclude,
    };

    return config;
  }
}

/**
 * Interface for configuration loader.
 *
 * Defines the contract for loading and validating DocImp configuration.
 */

import type { IConfig } from './IConfig.js';

/**
 * Configuration loader interface.
 *
 * Implementations load configuration from files or other sources
 * and validate them against the IConfig schema.
 */
export interface IConfigLoader {
  /**
   * Load configuration from a file path.
   *
   * @param configPath - Optional path to configuration file
   * @returns Validated configuration object
   * @throws Error if config file is malformed or validation fails
   */
  load(configPath?: string): Promise<IConfig>;
}

import fs from 'node:fs';
import path from 'node:path';

/**
 * Validates filesystem paths for CLI commands.
 *
 * Provides centralized path validation with clear, actionable error messages.
 * Checks for path existence, read permissions, and optionally warns about
 * empty directories.
 */
export const PathValidator = {
  /**
   * Validates that a path exists and returns its absolute form.
   *
   * Resolves relative paths to absolute paths and verifies that the path
   * exists on the filesystem. Use this as the first validation step before
   * attempting to read or analyze a path.
   *
   * @param inputPath - The path to validate (relative or absolute)
   * @returns The absolute, normalized path
   * @throws Error if the path does not exist
   *
   * @example
   * ```typescript
   * const absolutePath = PathValidator.validatePathExists('./src');
   * // Returns: /Users/user/project/src
   * ```
   *
   * @example
   * ```typescript
   * PathValidator.validatePathExists('/nonexistent');
   * // Throws: Path not found: /nonexistent
   * //         Please check that the path exists and try again.
   * ```
   */
  validatePathExists(inputPath: string): string {
    if (!inputPath || inputPath.trim() === '') {
      throw new Error(
        'Path cannot be empty.\nPlease provide a valid path to analyze.'
      );
    }

    const absolutePath = path.resolve(inputPath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(
        `Path not found: ${absolutePath}\n` +
          'Please check that the path exists and try again.'
      );
    }

    return absolutePath;
  },

  /**
   * Validates that a path is readable.
   *
   * Checks that the current process has read permissions for the given path.
   * Call this after validatePathExists() to ensure the path can be analyzed.
   *
   * @param absolutePath - The absolute path to check (use output from validatePathExists)
   * @throws Error if the path is not readable
   *
   * @example
   * ```typescript
   * const path = PathValidator.validatePathExists('./src');
   * PathValidator.validatePathReadable(path);
   * // Proceeds if readable, throws if permission denied
   * ```
   */
  validatePathReadable(absolutePath: string): void {
    try {
      fs.accessSync(absolutePath, fs.constants.R_OK);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EACCES') {
        throw new Error(
          `Permission denied: ${absolutePath}\n` +
            'You do not have permission to read this path.\n' +
            'Please check the file permissions and try again.'
        );
      }
      // Re-throw unexpected errors
      throw error;
    }
  },

  /**
   * Warns if a directory is empty.
   *
   * Checks if the given path is a directory with no files or subdirectories.
   * Prints a warning to stderr but does not throw an error. This helps users
   * catch mistakes like analyzing an empty project folder.
   *
   * Only checks directories - files are silently skipped.
   *
   * @param absolutePath - The absolute path to check (use output from validatePathExists)
   *
   * @example
   * ```typescript
   * const path = PathValidator.validatePathExists('./empty-dir');
   * PathValidator.warnIfEmpty(path);
   * // Prints to stderr: Warning: Directory is empty: /path/to/empty-dir
   * //                   There are no files to analyze.
   * ```
   */
  warnIfEmpty(absolutePath: string): void {
    const stats = fs.statSync(absolutePath);

    if (!stats.isDirectory()) {
      // Not a directory, skip check
      return;
    }

    const entries = fs.readdirSync(absolutePath);

    if (entries.length === 0) {
      console.warn(
        `Warning: Directory is empty: ${absolutePath}\n` +
          'There are no files to analyze.'
      );
    }
  },

  /**
   * Validates a config file path.
   *
   * Similar to validatePathExists but with error messages specific to
   * configuration files. Use this when validating explicit config file paths
   * provided by the user (not for auto-discovery).
   *
   * @param configPath - The config file path to validate
   * @returns The absolute, normalized path
   * @throws Error if the config file does not exist
   *
   * @example
   * ```typescript
   * const configPath = PathValidator.validateConfigPath('./my-config.js');
   * // Returns: /Users/user/project/my-config.js
   * ```
   */
  validateConfigPath(configPath: string): string {
    if (!configPath || configPath.trim() === '') {
      throw new Error(
        'Config file path cannot be empty.\n' +
          'Please provide a valid config file path.'
      );
    }

    const absolutePath = path.resolve(configPath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(
        `Config file not found: ${absolutePath}\n` +
          'Please check that the config file exists and try again.'
      );
    }

    const stats = fs.statSync(absolutePath);
    if (!stats.isFile()) {
      throw new Error(
        `Config path is not a file: ${absolutePath}\n` +
          'Please provide a path to a configuration file, not a directory.'
      );
    }

    return absolutePath;
  },
};

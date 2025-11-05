/**
 * Analyze command implementation.
 *
 * This command analyzes documentation coverage in a codebase by calling
 * the Python analyzer via subprocess.
 */

import { writeFileSync } from 'node:fs';
import type { IConfigLoader } from '../config/IConfigLoader.js';
import { EXIT_CODE, type ExitCode } from '../constants/exitCodes.js';
import type { IDisplay } from '../display/IDisplay.js';
import type { IPythonBridge } from '../python-bridge/IPythonBridge.js';
import { PathValidator } from '../utils/PathValidator.js';
import { StateManager } from '../utils/StateManager.js';

/**
 * Core analyze logic (extracted for testability).
 *
 * @param path - Path to file or directory to analyze
 * @param options - Command options
 * @param options.format - Output format (json or summary)
 * @param options.config - Path to configuration file
 * @param options.verbose - Enable verbose output
 * @param options.keepOldReports - Preserve existing audit and plan files
 * @param options.strict - Fail immediately on first parse error
 * @param bridge - Python bridge instance (dependency injection)
 * @param display - Display instance (dependency injection)
 * @param configLoader - Config loader instance (dependency injection)
 */
export async function analyzeCore(
  path: string,
  options: {
    format?: string;
    config?: string;
    verbose?: boolean;
    keepOldReports?: boolean;
    strict?: boolean;
  },
  bridge: IPythonBridge,
  display: IDisplay,
  configLoader: IConfigLoader
): Promise<void> {
  // Validate path exists and is accessible before proceeding
  const absolutePath = PathValidator.validatePathExists(path);
  PathValidator.validatePathReadable(absolutePath);
  PathValidator.warnIfEmpty(absolutePath);

  // Ensure state directory exists
  StateManager.ensureStateDir();

  // Clear session reports unless --keep-old-reports flag is set
  if (options.keepOldReports) {
    if (options.verbose) {
      display.showMessage('Keeping previous session reports');
    }
  } else {
    const filesRemoved = StateManager.clearSessionReports();
    if (filesRemoved > 0) {
      display.showMessage(`Cleared ${filesRemoved} previous session report(s)`);
    }
  }

  // Load configuration
  const config = await configLoader.load(options.config);

  if (options.verbose) {
    display.showConfig({
      styleGuides: config.styleGuides,
      tone: config.tone,
      plugins: config.plugins,
      exclude: config.exclude,
      jsdocStyle: config.jsdocStyle,
    });
  }

  // Run analysis via Python subprocess
  if (options.verbose) {
    display.showMessage(`Analyzing: ${absolutePath}`);
  }

  const stopSpinner = display.startSpinner('Analyzing codebase...');

  try {
    const result = await bridge.analyze({
      path: absolutePath,
      config,
      verbose: options.verbose,
      strict: options.strict,
    });

    stopSpinner();

    // Save analysis result to state directory
    const analyzeFile = StateManager.getAnalyzeFile();
    writeFileSync(analyzeFile, JSON.stringify(result, null, 2), 'utf-8');

    if (options.verbose) {
      display.showMessage(`Analysis saved to: ${analyzeFile}`);
    }

    // Display results using the display service
    const format = (options.format || 'summary') as 'summary' | 'json';
    display.showAnalysisResult(result, format);
  } catch (error) {
    stopSpinner();
    throw error;
  }
}

/**
 * Execute the analyze command.
 * This is the entry point called by Commander.js.
 *
 * @param path - Path to file or directory to analyze
 * @param options - Command options
 * @param options.format - Output format (json or summary)
 * @param options.config - Path to configuration file
 * @param options.verbose - Enable verbose output
 * @param options.keepOldReports - Preserve existing audit and plan files
 * @param options.strict - Fail immediately on first parse error
 * @param bridge - Python bridge instance (dependency injection)
 * @param display - Display instance (dependency injection)
 * @param configLoader - Config loader instance (dependency injection)
 * @returns Exit code (EXIT_CODE.SUCCESS for success, EXIT_CODE.ERROR for failure)
 */
export async function analyzeCommand(
  path: string,
  options: {
    format?: string;
    config?: string;
    verbose?: boolean;
    keepOldReports?: boolean;
    strict?: boolean;
  },
  bridge: IPythonBridge,
  display: IDisplay,
  configLoader: IConfigLoader
): Promise<ExitCode> {
  try {
    await analyzeCore(path, options, bridge, display, configLoader);
    return EXIT_CODE.SUCCESS;
  } catch (error) {
    display.showError(error instanceof Error ? error.message : String(error));
    return EXIT_CODE.ERROR;
  }
}

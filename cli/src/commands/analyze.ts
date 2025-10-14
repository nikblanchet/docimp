/**
 * Analyze command implementation.
 *
 * This command analyzes documentation coverage in a codebase by calling
 * the Python analyzer via subprocess.
 */

import { ConfigLoader } from '../config/ConfigLoader.js';
import { PythonBridge } from '../python-bridge/PythonBridge.js';
import { TerminalDisplay } from '../display/TerminalDisplay.js';
import type { IPythonBridge } from '../python-bridge/IPythonBridge.js';
import type { IDisplay } from '../display/IDisplay.js';


/**
 * Core analyze logic (extracted for testability).
 *
 * @param path - Path to file or directory to analyze
 * @param options - Command options
 * @param bridge - Python bridge instance (injected for testing)
 * @param display - Display instance (injected for testing)
 */
export async function analyzeCore(
  path: string,
  options: {
    format?: string;
    config?: string;
    verbose?: boolean;
  },
  bridge?: IPythonBridge,
  display?: IDisplay
): Promise<void> {
  // Create dependencies if not injected (dependency injection pattern)
  const pythonBridge = bridge ?? new PythonBridge();
  const terminalDisplay = display ?? new TerminalDisplay();

  // Load configuration
  const configLoader = new ConfigLoader();
  const config = await configLoader.load(options.config);

  if (options.verbose) {
    terminalDisplay.showConfig({
      styleGuide: config.styleGuide,
      tone: config.tone,
      plugins: config.plugins,
      exclude: config.exclude,
      jsdocStyle: config.jsdocStyle,
    });
  }

  // Run analysis via Python subprocess
  if (options.verbose) {
    terminalDisplay.showMessage(`Analyzing: ${path}`);
  }

  const stopSpinner = terminalDisplay.startSpinner('Analyzing codebase...');

  try {
    const result = await pythonBridge.analyze({
      path,
      config,
      verbose: options.verbose,
    });

    stopSpinner();

    // Display results using the display service
    const format = (options.format || 'summary') as 'summary' | 'json';
    terminalDisplay.showAnalysisResult(result, format);
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
 */
export async function analyzeCommand(
  path: string,
  options: {
    format?: string;
    config?: string;
    verbose?: boolean;
  }
): Promise<void> {
  const display = new TerminalDisplay();

  try {
    await analyzeCore(path, options);
  } catch (error) {
    display.showError(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Plan command implementation.
 *
 * This command generates a prioritized documentation improvement plan
 * by combining items with missing or poor quality documentation.
 */

import { PythonBridge } from '../python-bridge/PythonBridge.js';
import { TerminalDisplay } from '../display/TerminalDisplay.js';
import { StateManager } from '../utils/StateManager.js';
import { ConfigLoader } from '../config/ConfigLoader.js';
import type { IPythonBridge } from '../python-bridge/IPythonBridge.js';
import type { IDisplay } from '../display/IDisplay.js';

/**
 * Core plan logic (extracted for testability).
 *
 * @param path - Path to file or directory to analyze
 * @param options - Command options
 * @param bridge - Python bridge instance (injected for testing)
 * @param display - Display instance (injected for testing)
 */
export async function planCore(
  path: string,
  options: {
    auditFile?: string;
    planFile?: string;
    qualityThreshold?: number;
    verbose?: boolean;
  },
  bridge?: IPythonBridge,
  display?: IDisplay
): Promise<void> {
  // Create display dependency (needed before loading config)
  const terminalDisplay = display ?? new TerminalDisplay();

  // Load configuration for timeout settings
  const configLoader = new ConfigLoader();
  const config = await configLoader.load();

  // Create Python bridge with config for timeout settings (after config loaded)
  const pythonBridge = bridge ?? new PythonBridge(undefined, undefined, config);

  // Use StateManager defaults if not provided
  const auditFile = options.auditFile ?? StateManager.getAuditFile();
  const planFile = options.planFile ?? StateManager.getPlanFile();

  // Run plan generation via Python subprocess
  if (options.verbose) {
    terminalDisplay.showMessage(`Generating plan for: ${path}`);
  }

  const stopSpinner = terminalDisplay.startSpinner('Generating improvement plan...');

  try {
    const result = await pythonBridge.plan({
      path,
      auditFile,
      planFile,
      qualityThreshold: options.qualityThreshold,
      verbose: options.verbose,
    });

    stopSpinner();

    // Display plan summary
    terminalDisplay.showMessage('\n' + '='.repeat(60));
    terminalDisplay.showMessage('Documentation Improvement Plan');
    terminalDisplay.showMessage('='.repeat(60));
    terminalDisplay.showMessage(`\nTotal items to improve: ${result.total_items}`);
    terminalDisplay.showMessage(`  Missing documentation: ${result.missing_docs_count}`);
    terminalDisplay.showMessage(`  Poor quality documentation: ${result.poor_quality_count}`);

    if (result.items.length > 0) {
      terminalDisplay.showMessage('\nTop 10 priorities (by impact score):');
      terminalDisplay.showMessage('-'.repeat(60));

      const topItems = result.items.slice(0, 10);
      for (const item of topItems) {
        const priorityLabel = `[${item.impact_score.toFixed(1).padStart(5)}]`;
        const typeLabel = item.type.padEnd(8);
        const nameLabel = item.name.padEnd(30);
        const location = `${item.filepath}:${item.line_number}`;

        terminalDisplay.showMessage(
          `  ${priorityLabel} ${typeLabel} ${nameLabel} ${location}`
        );
        terminalDisplay.showMessage(`         ${item.reason}`);
      }

      if (result.items.length > 10) {
        terminalDisplay.showMessage(`\n  ... and ${result.items.length - 10} more items`);
      }
    }

    terminalDisplay.showMessage('\n' + '='.repeat(60));
    terminalDisplay.showMessage(`Plan saved to: ${planFile}`);
    terminalDisplay.showMessage('Run \'docimp improve\' to start improving documentation.');
    terminalDisplay.showMessage('='.repeat(60) + '\n');
  } catch (error) {
    stopSpinner();
    throw error;
  }
}

/**
 * Execute the plan command.
 * This is the entry point called by Commander.js.
 *
 * @param path - Path to file or directory to analyze
 * @param options - Command options
 */
export async function planCommand(
  path: string,
  options: {
    auditFile?: string;
    planFile?: string;
    qualityThreshold?: number;
    verbose?: boolean;
  }
): Promise<void> {
  const display = new TerminalDisplay();

  try {
    await planCore(path, options);
  } catch (error) {
    display.showError(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

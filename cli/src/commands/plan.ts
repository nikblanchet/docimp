/**
 * Plan command implementation.
 *
 * This command generates a prioritized documentation improvement plan
 * by combining items with missing or poor quality documentation.
 */

import { StateManager } from '../utils/StateManager.js';
import { PathValidator } from '../utils/PathValidator.js';
import type { IPythonBridge } from '../python-bridge/IPythonBridge.js';
import type { IDisplay } from '../display/IDisplay.js';

/**
 * Core plan logic (extracted for testability).
 *
 * @param path - Path to file or directory to analyze
 * @param options - Command options
 * @param options.auditFile - Path to audit file containing quality ratings
 * @param options.planFile - Path to plan file for saving improvement plan
 * @param options.qualityThreshold - Quality threshold for filtering items
 * @param options.verbose - Enable verbose output
 * @param bridge - Python bridge instance (dependency injection)
 * @param display - Display instance (dependency injection)
 */
export async function planCore(
  path: string,
  options: {
    auditFile?: string;
    planFile?: string;
    qualityThreshold?: number;
    verbose?: boolean;
  },
  bridge: IPythonBridge,
  display: IDisplay
): Promise<void> {
  // Validate path exists and is accessible before proceeding
  const absolutePath = PathValidator.validatePathExists(path);
  PathValidator.validatePathReadable(absolutePath);
  PathValidator.warnIfEmpty(absolutePath);

  // Use StateManager defaults if not provided
  const auditFile = options.auditFile ?? StateManager.getAuditFile();
  const planFile = options.planFile ?? StateManager.getPlanFile();

  // Run plan generation via Python subprocess
  if (options.verbose) {
    display.showMessage(`Generating plan for: ${absolutePath}`);
  }

  const stopSpinner = display.startSpinner('Generating improvement plan...');

  try {
    const result = await bridge.plan({
      path: absolutePath,
      auditFile,
      planFile,
      qualityThreshold: options.qualityThreshold,
      verbose: options.verbose,
    });

    stopSpinner();

    // Display plan summary
    display.showMessage('\n' + '='.repeat(60));
    display.showMessage('Documentation Improvement Plan');
    display.showMessage('='.repeat(60));
    display.showMessage(`\nTotal items to improve: ${result.total_items}`);
    display.showMessage(`  Missing documentation: ${result.missing_docs_count}`);
    display.showMessage(`  Poor quality documentation: ${result.poor_quality_count}`);

    if (result.items.length > 0) {
      display.showMessage('\nTop 10 priorities (by impact score):');
      display.showMessage('-'.repeat(60));

      const topItems = result.items.slice(0, 10);
      for (const item of topItems) {
        const priorityLabel = `[${item.impact_score.toFixed(1).padStart(5)}]`;
        const typeLabel = item.type.padEnd(8);
        const nameLabel = item.name.padEnd(30);
        const location = `${item.filepath}:${item.line_number}`;

        display.showMessage(
          `  ${priorityLabel} ${typeLabel} ${nameLabel} ${location}`
        );
        display.showMessage(`         ${item.reason}`);
      }

      if (result.items.length > 10) {
        display.showMessage(`\n  ... and ${result.items.length - 10} more items`);
      }
    }

    display.showMessage('\n' + '='.repeat(60));
    display.showMessage(`Plan saved to: ${planFile}`);
    display.showMessage('Run \'docimp improve\' to start improving documentation.');
    display.showMessage('='.repeat(60) + '\n');
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
 * @param options.auditFile - Path to audit file containing quality ratings
 * @param options.planFile - Path to plan file for saving improvement plan
 * @param options.qualityThreshold - Quality threshold for filtering items
 * @param options.verbose - Enable verbose output
 * @param bridge - Python bridge instance (dependency injection)
 * @param display - Display instance (dependency injection)
 * @returns Exit code (0 for success, 1 for failure)
 */
export async function planCommand(
  path: string,
  options: {
    auditFile?: string;
    planFile?: string;
    qualityThreshold?: number;
    verbose?: boolean;
  },
  bridge: IPythonBridge,
  display: IDisplay
): Promise<number> {
  try {
    await planCore(path, options, bridge, display);
    return 0;
  } catch (error) {
    display.showError(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

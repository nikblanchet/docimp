/**
 * List-workflow-history command implementation.
 *
 * This command lists all saved workflow state snapshots
 * from the history directory (.docimp/history/).
 */

import { EXIT_CODE, type ExitCode } from '../constants/exit-codes.js';
import type { IDisplay } from '../display/i-display.js';
import { WorkflowStateManager } from '../utils/workflow-state-manager.js';

export interface ListWorkflowHistoryOptions {
  json?: boolean; // Output as JSON instead of formatted table
  limit?: number; // Limit number of snapshots to display
}

/**
 * Core list-workflow-history logic (extracted for testability).
 *
 * @param display - Display instance (dependency injection)
 * @param options - Command options
 */
export async function listWorkflowHistoryCore(
  display: IDisplay,
  options: ListWorkflowHistoryOptions
): Promise<void> {
  // Fetch all history snapshots (sorted newest first)
  let snapshots = await WorkflowStateManager.listHistorySnapshots();

  // Apply limit if specified (including 0)
  if (options.limit !== undefined) {
    snapshots = snapshots.slice(0, options.limit);
  }

  // Display snapshots using the display service
  display.showWorkflowHistory(snapshots, options.json || false);
}

/**
 * Execute the list-workflow-history command.
 * This is the entry point called by Commander.js.
 *
 * @param display - Display instance (dependency injection)
 * @param options - Command options
 * @returns Exit code (EXIT_CODE.SUCCESS for success, EXIT_CODE.ERROR for failure)
 */
export async function listWorkflowHistoryCommand(
  display: IDisplay,
  options: ListWorkflowHistoryOptions
): Promise<ExitCode> {
  try {
    await listWorkflowHistoryCore(display, options);
    return EXIT_CODE.SUCCESS;
  } catch (error) {
    display.showError(error instanceof Error ? error.message : String(error));
    return EXIT_CODE.ERROR;
  }
}

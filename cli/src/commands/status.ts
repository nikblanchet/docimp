/**
 * Status command implementation.
 *
 * This command displays workflow state including command execution history,
 * staleness warnings, and actionable suggestions for next steps.
 */

import { EXIT_CODE, type ExitCode } from '../constants/exit-codes.js';
import type { IDisplay } from '../display/i-display.js';
import type { IPythonBridge } from '../python-bridge/i-python-bridge.js';

/**
 * Core status logic (extracted for testability).
 *
 * @param bridge - Python bridge instance (dependency injection)
 * @param display - Display instance (dependency injection)
 */
export async function statusCore(
  bridge: IPythonBridge,
  display: IDisplay
): Promise<void> {
  // Fetch workflow status from Python CLI
  const status = await bridge.status();

  // Display status using the display service
  display.showWorkflowStatus(status);
}

/**
 * Execute the status command.
 * This is the entry point called by Commander.js.
 *
 * @param bridge - Python bridge instance (dependency injection)
 * @param display - Display instance (dependency injection)
 * @returns Exit code (EXIT_CODE.SUCCESS for success, EXIT_CODE.ERROR for failure)
 */
export async function statusCommand(
  bridge: IPythonBridge,
  display: IDisplay
): Promise<ExitCode> {
  try {
    await statusCore(bridge, display);
    return EXIT_CODE.SUCCESS;
  } catch (error) {
    display.showError(error instanceof Error ? error.message : String(error));
    return EXIT_CODE.ERROR;
  }
}

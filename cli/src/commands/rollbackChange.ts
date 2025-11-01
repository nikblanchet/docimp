/**
 * Rollback-change command implementation.
 *
 * This command rolls back a specific change from a documentation
 * improvement session.
 */

import { EXIT_CODE, type ExitCode } from '../constants/exitCodes.js';
import type { IPythonBridge } from '../python-bridge/IPythonBridge.js';
import type { IDisplay } from '../display/IDisplay.js';

/**
 * Core rollback-change logic (extracted for testability).
 *
 * @param entryId - Change entry ID or 'last' for most recent
 * @param bridge - Python bridge instance (dependency injection)
 * @param display - Display instance (dependency injection)
 */
export async function rollbackChangeCore(
  entryId: string,
  bridge: IPythonBridge,
  display: IDisplay
): Promise<void> {
  // Perform rollback via Python CLI
  const result = await bridge.rollbackChange(entryId);

  // Display result using the display service
  display.showRollbackResult(result);
}

/**
 * Execute the rollback-change command.
 * This is the entry point called by Commander.js.
 *
 * @param entryId - Change entry ID or 'last' for most recent
 * @param bridge - Python bridge instance (dependency injection)
 * @param display - Display instance (dependency injection)
 * @returns Exit code (EXIT_CODE.SUCCESS for success, EXIT_CODE.ERROR for failure)
 */
export async function rollbackChangeCommand(
  entryId: string,
  bridge: IPythonBridge,
  display: IDisplay
): Promise<ExitCode> {
  try {
    await rollbackChangeCore(entryId, bridge, display);
    return EXIT_CODE.SUCCESS;
  } catch (error) {
    display.showError(error instanceof Error ? error.message : String(error));
    return EXIT_CODE.ERROR;
  }
}

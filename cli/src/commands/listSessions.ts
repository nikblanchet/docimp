/**
 * List-sessions command implementation.
 *
 * This command lists all active documentation improvement sessions
 * tracked in the transaction system.
 */

import { EXIT_CODE, type ExitCode } from '../constants/exitCodes.js';
import type { IPythonBridge } from '../python-bridge/IPythonBridge.js';
import type { IDisplay } from '../display/IDisplay.js';

/**
 * Core list-sessions logic (extracted for testability).
 *
 * @param bridge - Python bridge instance (dependency injection)
 * @param display - Display instance (dependency injection)
 */
export async function listSessionsCore(
  bridge: IPythonBridge,
  display: IDisplay
): Promise<void> {
  // Fetch sessions from Python CLI
  const sessions = await bridge.listSessions();

  // Display sessions using the display service
  display.showSessionList(sessions);
}

/**
 * Execute the list-sessions command.
 * This is the entry point called by Commander.js.
 *
 * @param bridge - Python bridge instance (dependency injection)
 * @param display - Display instance (dependency injection)
 * @returns Exit code (EXIT_CODE.SUCCESS for success, EXIT_CODE.ERROR for failure)
 */
export async function listSessionsCommand(
  bridge: IPythonBridge,
  display: IDisplay
): Promise<ExitCode> {
  try {
    await listSessionsCore(bridge, display);
    return EXIT_CODE.SUCCESS;
  } catch (error) {
    display.showError(error instanceof Error ? error.message : String(error));
    return EXIT_CODE.ERROR;
  }
}

/**
 * List-changes command implementation.
 *
 * This command lists all changes in a specific documentation improvement session.
 */

import { EXIT_CODE, type ExitCode } from '../constants/exitCodes.js';
import type { IPythonBridge } from '../python-bridge/IPythonBridge.js';
import type { IDisplay } from '../display/IDisplay.js';

/**
 * Core list-changes logic (extracted for testability).
 *
 * @param sessionId - Session UUID or 'last' for most recent
 * @param bridge - Python bridge instance (dependency injection)
 * @param display - Display instance (dependency injection)
 */
export async function listChangesCore(
  sessionId: string,
  bridge: IPythonBridge,
  display: IDisplay
): Promise<void> {
  // Fetch changes from Python CLI
  const changes = await bridge.listChanges(sessionId);

  // Display changes using the display service
  display.showChangeList(changes, sessionId);
}

/**
 * Execute the list-changes command.
 * This is the entry point called by Commander.js.
 *
 * @param sessionId - Session UUID or 'last' for most recent
 * @param bridge - Python bridge instance (dependency injection)
 * @param display - Display instance (dependency injection)
 * @returns Exit code (EXIT_CODE.SUCCESS for success, EXIT_CODE.ERROR for failure)
 */
export async function listChangesCommand(
  sessionId: string,
  bridge: IPythonBridge,
  display: IDisplay
): Promise<ExitCode> {
  try {
    await listChangesCore(sessionId, bridge, display);
    return EXIT_CODE.SUCCESS;
  } catch (error) {
    display.showError(error instanceof Error ? error.message : String(error));
    return EXIT_CODE.ERROR;
  }
}

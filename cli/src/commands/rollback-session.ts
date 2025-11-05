/**
 * Rollback-session command implementation.
 *
 * This command rolls back an entire documentation improvement session,
 * reverting all changes made during that session.
 */

import { EXIT_CODE, type ExitCode } from '../constants/exit-codes.js';
import type { IDisplay } from '../display/i-display.js';
import type { IPythonBridge } from '../python-bridge/i-python-bridge.js';

/**
 * Core rollback-session logic (extracted for testability).
 *
 * @param sessionId - Session UUID or 'last' for most recent
 * @param bridge - Python bridge instance (dependency injection)
 * @param display - Display instance (dependency injection)
 */
export async function rollbackSessionCore(
  sessionId: string,
  bridge: IPythonBridge,
  display: IDisplay
): Promise<void> {
  // Perform rollback via Python CLI
  const result = await bridge.rollbackSession(sessionId);

  // Display result using the display service
  display.showRollbackResult(result);
}

/**
 * Execute the rollback-session command.
 * This is the entry point called by Commander.js.
 *
 * @param sessionId - Session UUID or 'last' for most recent
 * @param bridge - Python bridge instance (dependency injection)
 * @param display - Display instance (dependency injection)
 * @returns Exit code (EXIT_CODE.SUCCESS for success, EXIT_CODE.ERROR for failure)
 */
export async function rollbackSessionCommand(
  sessionId: string,
  bridge: IPythonBridge,
  display: IDisplay
): Promise<ExitCode> {
  try {
    await rollbackSessionCore(sessionId, bridge, display);
    return EXIT_CODE.SUCCESS;
  } catch (error) {
    display.showError(error instanceof Error ? error.message : String(error));
    return EXIT_CODE.ERROR;
  }
}

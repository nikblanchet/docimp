/**
 * Improve session management commands.
 *
 * Provides commands for listing and deleting improve sessions stored in
 * the session state directory (.docimp/session-reports/).
 */

import chalk from 'chalk';
import Table from 'cli-table3';
import prompts from 'prompts';
import { EXIT_CODE, type ExitCode } from '../constants/exit-codes.js';
import type { ImproveSessionState } from '../types/improve-session-state.js';
import { SessionStateManager } from '../utils/session-state-manager.js';

/**
 * Format elapsed time in human-readable format.
 *
 * @param isoTimestamp - ISO 8601 timestamp
 * @returns Human-readable elapsed time (e.g., "2h ago", "5m ago")
 */
function formatElapsedTime(isoTimestamp: string): string {
  const started = new Date(isoTimestamp);
  const now = new Date();
  const elapsed = now.getTime() - started.getTime();
  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ago`;
  }
  if (hours > 0) {
    return `${hours}h ago`;
  }
  if (minutes > 0) {
    return `${minutes}m ago`;
  }
  return `${seconds}s ago`;
}

/**
 * Count processed items and their statuses in a session.
 *
 * @param session - Improve session state
 * @returns Object with counts for accepted, skipped, error, and total processed
 */
function countProcessedItems(session: ImproveSessionState): {
  accepted: number;
  skipped: number;
  error: number;
  total: number;
} {
  let accepted = 0;
  let skipped = 0;
  let error = 0;

  for (const fileImprovements of Object.values(session.partial_improvements)) {
    for (const statusRecord of Object.values(fileImprovements)) {
      // Empty dict {} = not yet processed
      if (Object.keys(statusRecord as object).length > 0) {
        const record = statusRecord as {
          status: 'accepted' | 'skipped' | 'error';
        };
        switch (record.status) {
        case 'accepted': {
          accepted++;
        
        break;
        }
        case 'skipped': {
          skipped++;
        
        break;
        }
        case 'error': {
          error++;
        
        break;
        }
        // No default
        }
      }
    }
  }

  return { accepted, skipped, error, total: accepted + skipped + error };
}

/**
 * Core list-improve-sessions logic (extracted for testability).
 *
 * Lists all improve sessions with details in a formatted table.
 * Sessions are sorted by started_at descending (newest first).
 */
export async function listImproveSessionsCore(): Promise<void> {
  const sessions = await SessionStateManager.listSessions('improve');

  if (sessions.length === 0) {
    console.log(chalk.yellow('No improve sessions found.'));
    return;
  }

  // Create table with session details
  const table = new Table({
    head: [
      chalk.bold('Session ID'),
      chalk.bold('Started'),
      chalk.bold('Completed'),
      chalk.bold('Accepted/Skipped/Errors'),
      chalk.bold('Status'),
    ],
    colWidths: [15, 15, 15, 25, 15],
  });

  for (const session of sessions) {
    const improveSession = session as ImproveSessionState;
    const sessionId = improveSession.session_id.slice(0, 12);
    const started = formatElapsedTime(improveSession.started_at);
    const completed = improveSession.completed_at
      ? formatElapsedTime(improveSession.completed_at)
      : chalk.gray('N/A');

    // Count processed items by status
    const counts = countProcessedItems(improveSession);
    const itemsProcessed = `${counts.accepted}/${counts.skipped}/${counts.error}`;

    // Color-code status
    const status = improveSession.completed_at
      ? chalk.green('completed')
      : chalk.yellow('in-progress');

    table.push([sessionId, started, completed, itemsProcessed, status]);
  }

  console.log(table.toString());
}

/**
 * Execute the list-improve-sessions command.
 * This is the entry point called by Commander.js.
 *
 * @returns Exit code (EXIT_CODE.SUCCESS for success, EXIT_CODE.ERROR for failure)
 */
export async function listImproveSessionsCommand(): Promise<ExitCode> {
  try {
    await listImproveSessionsCore();
    return EXIT_CODE.SUCCESS;
  } catch (error) {
    console.error(
      chalk.red(
        `Error: ${error instanceof Error ? error.message : String(error)}`
      )
    );
    return EXIT_CODE.ERROR;
  }
}

/**
 * Core delete-improve-session logic (extracted for testability).
 *
 * Deletes one or all improve sessions with optional confirmation prompt.
 *
 * @param sessionId - Session ID to delete, or undefined for --all flag
 * @param options - Command options
 * @param options.all - Delete all sessions
 * @param options.force - Skip confirmation prompt
 */
export async function deleteImproveSessionCore(
  sessionId: string | undefined,
  options: { all?: boolean; force?: boolean }
): Promise<void> {
  // Validate input
  if (!sessionId && !options.all) {
    throw new Error(
      'Must provide session ID or use --all flag to delete all sessions'
    );
  }

  if (sessionId && options.all) {
    throw new Error('Cannot specify both session ID and --all flag');
  }

  // Handle --all flag
  if (options.all) {
    const sessions = await SessionStateManager.listSessions('improve');

    if (sessions.length === 0) {
      console.log(chalk.yellow('No improve sessions to delete.'));
      return;
    }

    // Confirmation prompt (unless --force)
    if (!options.force) {
      const response = await prompts({
        type: 'confirm',
        name: 'value',
        message: `Delete all ${sessions.length} improve session(s)?`,
        initial: false,
      });

      // Handle Ctrl+C or No
      if (response.value === undefined || !response.value) {
        console.log(chalk.gray('Deletion cancelled.'));
        return;
      }
    }

    // Delete all sessions
    for (const session of sessions) {
      const improveSession = session as ImproveSessionState;
      await SessionStateManager.deleteSessionState(
        improveSession.session_id,
        'improve'
      );
    }

    console.log(chalk.green(`Deleted ${sessions.length} improve session(s).`));
    return;
  }

  // Handle specific session ID
  if (!sessionId) {
    throw new Error('Session ID is required');
  }

  // Verify session exists before prompting
  try {
    await SessionStateManager.loadSessionState(sessionId, 'improve');
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('Session file not found')
    ) {
      throw new Error(`Improve session '${sessionId}' not found.`);
    }
    throw error;
  }

  // Confirmation prompt (unless --force)
  if (!options.force) {
    const response = await prompts({
      type: 'confirm',
      name: 'value',
      message: `Delete improve session ${sessionId.slice(0, 12)}?`,
      initial: false,
    });

    // Handle Ctrl+C or No
    if (response.value === undefined || !response.value) {
      console.log(chalk.gray('Deletion cancelled.'));
      return;
    }
  }

  // Delete session
  await SessionStateManager.deleteSessionState(sessionId, 'improve');
  console.log(
    chalk.green(`Deleted improve session ${sessionId.slice(0, 12)}.`)
  );
}

/**
 * Execute the delete-improve-session command.
 * This is the entry point called by Commander.js.
 *
 * @param sessionId - Session ID to delete, or undefined for --all flag
 * @param options - Command options
 * @param options.all - Delete all sessions
 * @param options.force - Skip confirmation prompt
 * @returns Exit code (EXIT_CODE.SUCCESS for success, EXIT_CODE.ERROR for failure)
 */
export async function deleteImproveSessionCommand(
  sessionId: string | undefined,
  options: { all?: boolean; force?: boolean }
): Promise<ExitCode> {
  try {
    await deleteImproveSessionCore(sessionId, options);
    return EXIT_CODE.SUCCESS;
  } catch (error) {
    console.error(
      chalk.red(
        `Error: ${error instanceof Error ? error.message : String(error)}`
      )
    );
    return EXIT_CODE.ERROR;
  }
}

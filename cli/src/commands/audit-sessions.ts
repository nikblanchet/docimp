/**
 * Audit session management commands.
 *
 * Provides commands for listing and deleting audit sessions stored in
 * the session state directory (.docimp/session-reports/).
 */

import chalk from 'chalk';
import Table from 'cli-table3';
import prompts from 'prompts';
import { EXIT_CODE, type ExitCode } from '../constants/exit-codes.js';
import type { AuditSessionState } from '../types/audit-session-state.js';
import { SessionStateManager } from '../utils/session-state-manager.js';
import {
  formatSessionIdForDisplay,
  isValidSessionId,
} from '../utils/validation.js';

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
 * Core list-audit-sessions logic (extracted for testability).
 *
 * Lists all audit sessions with details in a formatted table.
 * Sessions are sorted by started_at descending (newest first).
 */
export async function listAuditSessionsCore(): Promise<void> {
  const sessions = await SessionStateManager.listSessions('audit');

  if (sessions.length === 0) {
    console.log(chalk.yellow('No audit sessions found.'));
    return;
  }

  // Create table with session details
  const table = new Table({
    head: [
      chalk.bold('Session ID'),
      chalk.bold('Started'),
      chalk.bold('Completed'),
      chalk.bold('Items Rated'),
      chalk.bold('Status'),
    ],
    colWidths: [15, 15, 15, 15, 15],
  });

  for (const session of sessions) {
    const auditSession = session as AuditSessionState;
    const sessionId = formatSessionIdForDisplay(auditSession.session_id, 12);
    const started = formatElapsedTime(auditSession.started_at);
    const completed = auditSession.completed_at
      ? formatElapsedTime(auditSession.completed_at)
      : chalk.gray('N/A');

    // Count rated items (non-null ratings)
    let ratedCount = 0;
    for (const fileRatings of Object.values(auditSession.partial_ratings)) {
      for (const rating of Object.values(fileRatings)) {
        if (rating !== null) {
          ratedCount++;
        }
      }
    }
    const itemsRated = `${ratedCount}/${auditSession.total_items}`;

    // Color-code status
    const status = auditSession.completed_at
      ? chalk.green('completed')
      : chalk.yellow('in-progress');

    table.push([sessionId, started, completed, itemsRated, status]);
  }

  console.log(table.toString());
}

/**
 * Execute the list-audit-sessions command.
 * This is the entry point called by Commander.js.
 *
 * @returns Exit code (EXIT_CODE.SUCCESS for success, EXIT_CODE.ERROR for failure)
 */
export async function listAuditSessionsCommand(): Promise<ExitCode> {
  try {
    await listAuditSessionsCore();
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
 * Core delete-audit-session logic (extracted for testability).
 *
 * Deletes one or all audit sessions with optional confirmation prompt.
 *
 * @param sessionId - Session ID to delete, or undefined for --all flag
 * @param options - Command options
 * @param options.all - Delete all sessions
 * @param options.force - Skip confirmation prompt
 */
export async function deleteAuditSessionCore(
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
    const sessions = await SessionStateManager.listSessions('audit');

    if (sessions.length === 0) {
      console.log(chalk.yellow('No audit sessions to delete.'));
      return;
    }

    // Confirmation prompt (unless --force)
    if (!options.force) {
      const response = await prompts({
        type: 'confirm',
        name: 'value',
        message: `Delete all ${sessions.length} audit session(s)?`,
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
      const auditSession = session as AuditSessionState;
      await SessionStateManager.deleteSessionState(
        auditSession.session_id,
        'audit'
      );
    }

    console.log(chalk.green(`Deleted ${sessions.length} audit session(s).`));
    return;
  }

  // Handle specific session ID
  if (!sessionId) {
    throw new Error('Session ID is required');
  }

  // Validate session ID format (UUID or shortuuid)
  if (!isValidSessionId(sessionId)) {
    throw new Error(
      `Invalid session ID format: ${sessionId}. ` +
        'Expected UUID (36 chars) or shortuuid (22 chars base57).'
    );
  }

  // Verify session exists before prompting
  try {
    await SessionStateManager.loadSessionState(sessionId, 'audit');
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('Session file not found')
    ) {
      throw new Error(`Audit session '${sessionId}' not found.`);
    }
    throw error;
  }

  // Confirmation prompt (unless --force)
  if (!options.force) {
    const response = await prompts({
      type: 'confirm',
      name: 'value',
      message: `Delete audit session ${formatSessionIdForDisplay(sessionId, 12)}?`,
      initial: false,
    });

    // Handle Ctrl+C or No
    if (response.value === undefined || !response.value) {
      console.log(chalk.gray('Deletion cancelled.'));
      return;
    }
  }

  // Delete session
  await SessionStateManager.deleteSessionState(sessionId, 'audit');
  console.log(
    chalk.green(
      `Deleted audit session ${formatSessionIdForDisplay(sessionId, 12)}.`
    )
  );
}

/**
 * Execute the delete-audit-session command.
 * This is the entry point called by Commander.js.
 *
 * @param sessionId - Session ID to delete, or undefined for --all flag
 * @param options - Command options
 * @param options.all - Delete all sessions
 * @param options.force - Skip confirmation prompt
 * @returns Exit code (EXIT_CODE.SUCCESS for success, EXIT_CODE.ERROR for failure)
 */
export async function deleteAuditSessionCommand(
  sessionId: string | undefined,
  options: { all?: boolean; force?: boolean }
): Promise<ExitCode> {
  try {
    await deleteAuditSessionCore(sessionId, options);
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

/**
 * Prune-workflow-history command implementation.
 *
 * This command manually prunes workflow history snapshots based on
 * age or count criteria, giving users control over cleanup.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { EXIT_CODE, type ExitCode } from '../constants/exit-codes.js';
import { WorkflowStateManager } from '../utils/workflow-state-manager.js';

export interface PruneWorkflowHistoryOptions {
  olderThan?: string; // Age filter (e.g., "30d", "7d", "1h")
  keepLast?: number; // Keep last N snapshots
  dryRun?: boolean; // Show what would be deleted without deleting
}

/**
 * Parse age string (e.g., "30d", "7d") to milliseconds.
 *
 * @param ageString - Age string like "30d", "7d", "1h"
 * @returns Age in milliseconds
 */
function parseAgeString(ageString: string): number {
  const match = ageString.match(/^(\d+)([dhm])$/);
  if (!match) {
    throw new Error(
      `Invalid age format: ${ageString}. Use format like "30d", "7d", or "1h".`
    );
  }

  const value = Number.parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 'd': {
      return value * 24 * 60 * 60 * 1000; // Days to ms
    }
    case 'h': {
      return value * 60 * 60 * 1000; // Hours to ms
    }
    case 'm': {
      return value * 60 * 1000; // Minutes to ms
    }
    default: {
      throw new Error(`Unsupported unit: ${unit}`);
    }
  }
}

/**
 * Core prune-workflow-history logic (extracted for testability).
 *
 * @param options - Command options
 */
export async function pruneWorkflowHistoryCore(
  options: PruneWorkflowHistoryOptions
): Promise<void> {
  const { olderThan, keepLast, dryRun = false } = options;

  // Validate options
  if (!olderThan && keepLast === undefined) {
    throw new Error(
      'Must specify at least one pruning criterion: --older-than or --keep-last'
    );
  }

  // Get all snapshots
  const snapshots = await WorkflowStateManager.listHistorySnapshots();

  if (snapshots.length === 0) {
    console.log(chalk.dim('No workflow history snapshots found.'));
    return;
  }

  // Calculate thresholds
  let ageThreshold: number | undefined;
  if (olderThan) {
    const ageMs = parseAgeString(olderThan);
    ageThreshold = Date.now() - ageMs;
  }

  // Determine snapshots to delete
  const toDelete: string[] = [];

  for (const [i, snapshot] of snapshots.entries()) {
    const stats = await fs.stat(snapshot);
    const fileAge = stats.mtimeMs;

    // Check keep-last criterion (index-based, 0-indexed)
    const violatesKeepLast = keepLast !== undefined && i >= keepLast;

    // Check older-than criterion
    const violatesOlderThan =
      ageThreshold !== undefined && fileAge < ageThreshold;

    // Delete if violates ANY criterion (OR logic)
    if (violatesKeepLast || violatesOlderThan) {
      toDelete.push(snapshot);
    }
  }

  if (toDelete.length === 0) {
    console.log(chalk.green('\nNo snapshots match the pruning criteria.'));
    console.log(
      chalk.dim(`Total snapshots: ${snapshots.length} (all will be kept)\n`)
    );
    return;
  }

  // Display info
  console.log(chalk.bold('\nPrune Workflow History\n'));
  console.log(`Total snapshots: ${chalk.cyan(String(snapshots.length))}`);
  console.log(`Snapshots to delete: ${chalk.yellow(String(toDelete.length))}`);
  console.log(
    `Snapshots to keep: ${chalk.green(String(snapshots.length - toDelete.length))}`
  );

  if (dryRun) {
    console.log(chalk.bold('\nDry run mode - no changes will be made.\n'));
  } else {
    console.log('');
  }

  // Show files to delete
  console.log(chalk.bold('Snapshots to delete:\n'));
  for (const snapshot of toDelete.slice(0, 10)) {
    // Limit display to 10
    const filename = path.basename(snapshot);
    const stats = await fs.stat(snapshot);
    const sizeKB = (stats.size / 1024).toFixed(1);
    console.log(
      `  ${chalk.dim('•')} ${filename} ${chalk.dim(`(${sizeKB} KB)`)}`
    );
  }

  if (toDelete.length > 10) {
    console.log(
      chalk.dim(`  ... and ${toDelete.length - 10} more snapshot(s)`)
    );
  }

  // Delete if not dry-run
  if (dryRun) {
    console.log(
      chalk.dim('\nRun without --dry-run to delete these snapshots.\n')
    );
  } else {
    console.log('');
    await Promise.all(toDelete.map((snapshot) => fs.unlink(snapshot)));
    console.log(
      chalk.green(`\nDeleted ${toDelete.length} snapshot(s) successfully.\n`)
    );
  }
}

/**
 * Execute the prune-workflow-history command.
 *
 * @param options - Prune options
 * @returns Exit code (0 for success, 1 for error)
 */
export async function pruneWorkflowHistoryCommand(
  options: PruneWorkflowHistoryOptions
): Promise<ExitCode> {
  try {
    await pruneWorkflowHistoryCore(options);
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

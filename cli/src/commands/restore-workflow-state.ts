/**
 * Restore-workflow-state command implementation.
 *
 * This command restores workflow state from a history snapshot,
 * allowing users to revert to a previous state for debugging or recovery.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import prompts from 'prompts';
import { EXIT_CODE, type ExitCode } from '../constants/exit-codes.js';
import {
  type WorkflowState,
  WorkflowStateSchema,
} from '../types/workflow-state.js';
import { StateManager } from '../utils/state-manager.js';
import { WorkflowStateManager } from '../utils/workflow-state-manager.js';

export interface RestoreWorkflowStateOptions {
  dryRun?: boolean; // Show what would happen without making changes
  force?: boolean; // Skip confirmation prompt
}

/**
 * Core restore-workflow-state logic (extracted for testability).
 *
 * @param snapshotPath - Path to the snapshot file to restore
 * @param options - Command options
 */
export async function restoreWorkflowStateCore(
  snapshotPath: string,
  options: RestoreWorkflowStateOptions
): Promise<void> {
  const dryRun = options.dryRun || false;
  const force = options.force || false;

  // Validate snapshot file exists
  try {
    await fs.access(snapshotPath);
  } catch {
    throw new Error(`Snapshot file not found: ${snapshotPath}`);
  }

  // Read and validate snapshot
  const snapshotContent = await fs.readFile(snapshotPath, 'utf8');
  const snapshotData = JSON.parse(snapshotContent);

  // Validate against schema
  let validatedSnapshot: WorkflowState;
  try {
    validatedSnapshot = WorkflowStateSchema.parse(snapshotData);
  } catch (error) {
    throw new Error(
      `Invalid snapshot file: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Get current state for backup
  const currentStateFile = path.join(
    StateManager.getStateDir(),
    'workflow-state.json'
  );
  const currentStateExists = await WorkflowStateManager.exists();

  // Display info
  const filename = path.basename(snapshotPath);
  console.log(chalk.bold('\nRestore Workflow State\n'));
  console.log(`Snapshot: ${chalk.cyan(filename)}`);

  if (currentStateExists) {
    const currentState = await WorkflowStateManager.loadWorkflowState();
    console.log(
      `Current state: ${currentState.last_analyze ? chalk.green('has data') : chalk.dim('empty')}`
    );
    console.log(
      chalk.yellow(
        '\nRestoring will create a backup of your current state before overwriting.'
      )
    );
  } else {
    console.log(
      chalk.dim('No current workflow state exists - will create new file.')
    );
  }

  if (dryRun) {
    console.log(chalk.bold('\nDry run mode - no changes will be made.'));
    console.log('\nSnapshot contents:');
    console.log(
      chalk.dim(JSON.stringify(validatedSnapshot, null, 2).slice(0, 500))
    );
    if (JSON.stringify(validatedSnapshot, null, 2).length > 500) {
      console.log(chalk.dim('... (truncated)'));
    }
    return;
  }

  // Confirm unless --force
  if (!force && currentStateExists) {
    const response = await prompts({
      type: 'confirm',
      name: 'value',
      message: 'Proceed with restore?',
      initial: false,
    });

    if (response.value === undefined || !response.value) {
      console.log(chalk.gray('Restore cancelled.'));
      return;
    }
  }

  // Create backup of current state if it exists
  if (currentStateExists) {
    const backupPath = `${currentStateFile}.backup-${Date.now()}.json`;
    await fs.copyFile(currentStateFile, backupPath);
    console.log(chalk.green(`\nBackup saved: ${path.basename(backupPath)}`));
  }

  // Restore snapshot atomically (temp file + rename)
  const temporaryFile = `${currentStateFile}.tmp`;
  await fs.writeFile(
    temporaryFile,
    JSON.stringify(validatedSnapshot, null, 2),
    'utf8'
  );
  await fs.rename(temporaryFile, currentStateFile);

  console.log(chalk.green('\nWorkflow state restored successfully.'));
  console.log(chalk.dim(`Restored from: ${filename}\n`));
}

/**
 * Execute the restore-workflow-state command.
 *
 * @param snapshotPath - Path to the snapshot file to restore
 * @param options - Restore options
 * @returns Exit code (0 for success, 1 for error)
 */
export async function restoreWorkflowStateCommand(
  snapshotPath: string,
  options: RestoreWorkflowStateOptions
): Promise<ExitCode> {
  try {
    await restoreWorkflowStateCore(snapshotPath, options);
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

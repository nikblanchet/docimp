/**
 * Migrate workflow state command implementation.
 *
 * Provides CLI interface for manually migrating workflow-state.json
 * with dry-run, check, version selection, and force options.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import prompts from 'prompts';
import { EXIT_CODE, type ExitCode } from '../constants/exit-codes.js';
import {
  applyMigrations,
  buildMigrationPath,
  CURRENT_WORKFLOW_STATE_VERSION,
} from '../types/workflow-state-migrations.js';
import { WorkflowStateSchema } from '../types/workflow-state.js';
import { StateManager } from '../utils/state-manager.js';

export interface MigrateWorkflowStateOptions {
  dryRun?: boolean; // Show what would happen without making changes
  check?: boolean; // Exit code 1 if migration needed, 0 if current
  version?: string; // Target version (default: CURRENT_WORKFLOW_STATE_VERSION)
  force?: boolean; // Skip confirmation prompt
}

/**
 * Core migration logic (extracted for testability).
 */
export async function migrateWorkflowStateCore(
  options: MigrateWorkflowStateOptions
): Promise<void> {
  const targetVersion = options.version || CURRENT_WORKFLOW_STATE_VERSION;
  const dryRun = options.dryRun || false;
  const checkMode = options.check || false;
  const force = options.force || false;

  // Get workflow state file path
  const workflowFile = path.join(
    StateManager.getStateDir(),
    'workflow-state.json'
  );

  // Check if file exists
  try {
    await fs.access(workflowFile);
  } catch {
    if (checkMode) {
      // In check mode, no file means no migration needed
      console.log(
        chalk.green('No workflow state file found. No migration needed.')
      );
      return;
    }
    console.error(chalk.red('No workflow state file found.'));
    console.log(
      chalk.yellow('Run "docimp analyze" to create workflow-state.json.')
    );
    throw new Error('Workflow state file does not exist');
  }

  // Load and parse file
  const content = await fs.readFile(workflowFile, 'utf8');
  const data = JSON.parse(content);
  const currentVersion = data.schema_version || 'legacy';

  // In check mode, just report status and exit
  if (checkMode) {
    if (currentVersion === targetVersion) {
      console.log(
        chalk.green(
          `Workflow state is at version ${targetVersion}. No migration needed.`
        )
      );
      return;
    }
    console.log(
      chalk.yellow(`Migration needed: ${currentVersion} → ${targetVersion}`)
    );
    throw new Error('Migration needed');
  }

  // Display current state
  console.log(chalk.bold('\nWorkflow State Migration\n'));
  console.log(`Current schema version: ${chalk.cyan(currentVersion)}`);
  console.log(`Target schema version:  ${chalk.cyan(targetVersion)}`);

  // Check if migration needed
  if (currentVersion === targetVersion) {
    console.log(
      chalk.green(
        '\nWorkflow state is already at target version. No migration needed.'
      )
    );
    return;
  }

  // Build migration path (applyMigrations handles "legacy" internally)
  const displayVersion = currentVersion === 'legacy' ? 'none' : currentVersion;
  let migrationPath: string[];
  try {
    migrationPath =
      currentVersion === 'legacy'
        ? [`legacy->${targetVersion}`]
        : buildMigrationPath(currentVersion, targetVersion);
  } catch {
    migrationPath = [`${displayVersion}->${targetVersion}`];
  }
  console.log(
    chalk.bold('\nMigration path:'),
    chalk.yellow(migrationPath.join(' → '))
  );

  // Apply migrations
  const migrated = applyMigrations(data, targetVersion);

  // Validate result
  try {
    WorkflowStateSchema.parse(migrated);
    console.log(chalk.green('Migration validation passed.'));
  } catch (validationError) {
    throw new Error(
      `Migration validation failed: ${validationError instanceof Error ? validationError.message : String(validationError)}`
    );
  }

  if (dryRun) {
    console.log(chalk.bold('\nDry run mode - no changes written.'));
    console.log(chalk.gray('\nMigrated data preview:'));
    console.log(JSON.stringify(migrated, null, 2));
    return;
  }

  // Confirm before writing (unless --force)
  if (!force) {
    console.log(
      chalk.yellow(
        '\nThis will modify workflow-state.json. Create a backup first if needed.'
      )
    );

    const response = await prompts({
      type: 'confirm',
      name: 'value',
      message: 'Proceed with migration?',
      initial: false,
    });

    // Handle Ctrl+C or No
    if (response.value === undefined || !response.value) {
      console.log(chalk.gray('Migration cancelled.'));
      return;
    }
  }

  // Write migrated data atomically (temp file + rename)
  const temporaryFile = `${workflowFile}.tmp`;
  await fs.writeFile(temporaryFile, JSON.stringify(migrated, null, 2), 'utf8');
  await fs.rename(temporaryFile, workflowFile);

  console.log(chalk.green('\nMigration completed successfully.'));
  console.log(`Schema version updated to ${chalk.cyan(targetVersion)}.`);
}

/**
 * Execute the migrate-workflow-state command.
 *
 * @param options - Migration options
 * @returns Exit code (0 for success, 1 for error)
 */
export async function migrateWorkflowStateCommand(
  options: MigrateWorkflowStateOptions
): Promise<ExitCode> {
  try {
    await migrateWorkflowStateCore(options);
    return EXIT_CODE.SUCCESS;
  } catch (error) {
    // Don't show error message in check mode (already printed status)
    if (!options.check) {
      console.error(
        chalk.red(
          `Error: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
    return EXIT_CODE.ERROR;
  }
}

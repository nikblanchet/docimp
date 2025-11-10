import * as fs from 'node:fs/promises';
import path from 'node:path';
import {
  applyMigrations,
  CURRENT_WORKFLOW_STATE_VERSION,
} from '../types/workflow-state-migrations.js';
import {
  WorkflowState,
  WorkflowStateSchema,
  CommandState,
  createEmptyWorkflowState,
} from '../types/workflow-state.js';
import { StateManager } from './state-manager.js';

/**
 * Manages workflow state persistence for bidirectional workflows.
 *
 * Provides atomic read/write operations for workflow-state.json,
 * which tracks the execution state of analyze, audit, plan, and improve commands.
 */
export class WorkflowStateManager {
  /**
   * Get the path to the workflow state file
   */
  private static getWorkflowStateFile(): string {
    return path.join(StateManager.getStateDir(), 'workflow-state.json');
  }

  /**
   * Save workflow state to disk atomically (temp file + rename pattern)
   */
  static async saveWorkflowState(state: WorkflowState): Promise<void> {
    const filePath = this.getWorkflowStateFile();
    const temporaryPath = `${filePath}.tmp`;

    // Ensure state directory exists
    StateManager.ensureStateDir();

    // Validate state against schema
    const validated = WorkflowStateSchema.parse(state);

    // Write to temp file first
    await fs.writeFile(
      temporaryPath,
      JSON.stringify(validated, null, 2),
      'utf8'
    );

    // Atomic rename
    await fs.rename(temporaryPath, filePath);
  }

  /**
   * Load workflow state from disk with schema validation and migration support
   * Returns empty state if file doesn't exist
   */
  static async loadWorkflowState(): Promise<WorkflowState> {
    const filePath = this.getWorkflowStateFile();

    try {
      const content = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(content);

      // Apply migrations if needed (handles legacy files and version upgrades)
      const migrated = applyMigrations(data, CURRENT_WORKFLOW_STATE_VERSION);

      // Validate against schema (Zod will provide detailed validation errors)
      return WorkflowStateSchema.parse(migrated);
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        // File doesn't exist - return empty state
        return createEmptyWorkflowState();
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load workflow state: ${message}`);
    }
  }

  /**
   * Update the state for a specific command
   */
  static async updateCommandState(
    command: 'analyze' | 'audit' | 'plan' | 'improve',
    commandState: CommandState
  ): Promise<void> {
    const state = await this.loadWorkflowState();

    // Update the specific command state
    switch (command) {
      case 'analyze': {
        state.last_analyze = commandState;
        break;
      }
      case 'audit': {
        state.last_audit = commandState;
        break;
      }
      case 'plan': {
        state.last_plan = commandState;
        break;
      }
      case 'improve': {
        state.last_improve = commandState;
        break;
      }
    }

    await this.saveWorkflowState(state);
  }

  /**
   * Get the state for a specific command
   */
  static async getCommandState(
    command: 'analyze' | 'audit' | 'plan' | 'improve'
  ): Promise<CommandState | null> {
    const state = await this.loadWorkflowState();

    switch (command) {
      case 'analyze': {
        return state.last_analyze;
      }
      case 'audit': {
        return state.last_audit;
      }
      case 'plan': {
        return state.last_plan;
      }
      case 'improve': {
        return state.last_improve;
      }
    }
  }

  /**
   * Delete the workflow state file
   */
  static async clearWorkflowState(): Promise<void> {
    const filePath = this.getWorkflowStateFile();

    try {
      await fs.unlink(filePath);
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code !== 'ENOENT'
      ) {
        throw error;
      }
      // File doesn't exist - nothing to do
    }
  }

  /**
   * Check if workflow state file exists
   */
  static async exists(): Promise<boolean> {
    const filePath = this.getWorkflowStateFile();
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

import * as fs from 'node:fs/promises';
import path from 'node:path';
import type { IWorkflowHistoryConfig } from '../config/i-config.js';
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
   *
   * @returns Path to workflow-state.json
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
   *
   * @returns Loaded workflow state or empty state if file doesn't exist
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
   *
   * @param command - Command to update state for
   * @param commandState - New state for the command
   * @param historyConfig - Optional workflow history configuration for snapshot tracking
   */
  static async updateCommandState(
    command: 'analyze' | 'audit' | 'plan' | 'improve',
    commandState: CommandState,
    historyConfig?: IWorkflowHistoryConfig
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

    // Save history snapshot if enabled
    if (historyConfig?.enabled) {
      await this.saveHistorySnapshot(state);

      // Rotate old snapshots using hybrid strategy
      const maxSnapshots = historyConfig.maxSnapshots ?? 50;
      const maxAgeDays = historyConfig.maxAgeDays ?? 30;
      await this.rotateHistory(maxSnapshots, maxAgeDays);
    }
  }

  /**
   * Get the state for a specific command
   *
   * @returns Command state or null if not run yet
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
   *
   * @returns True if workflow state file exists
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

  /**
   * Save a timestamped snapshot of workflow state to history directory
   * Uses atomic write pattern (temp + rename) for safety
   *
   * @param state - Workflow state to snapshot
   * @returns Path to the created snapshot file
   */
  static async saveHistorySnapshot(state: WorkflowState): Promise<string> {
    // Generate cross-platform safe timestamp (replace : and . with -)
    const timestamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
    const filename = `workflow-state-${timestamp}.json`;
    const filepath = path.join(StateManager.getHistoryDir(), filename);
    const temporaryPath = `${filepath}.tmp`;

    // Ensure history directory exists
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
    await fs.rename(temporaryPath, filepath);

    return filepath;
  }

  /**
   * List all workflow state history snapshots, sorted newest first
   *
   * @returns Array of snapshot file paths, sorted by timestamp (newest first)
   */
  static async listHistorySnapshots(): Promise<string[]> {
    const historyDirectory = StateManager.getHistoryDir();

    try {
      const files = await fs.readdir(historyDirectory);

      // Filter for workflow state snapshots only
      const snapshots = files
        .filter((f) => f.startsWith('workflow-state-') && f.endsWith('.json'))
        .map((f) => path.join(historyDirectory, f))
        .toSorted()
        .toReversed(); // ISO 8601 timestamps are lexicographically sortable

      return snapshots;
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        // History directory doesn't exist yet - return empty array
        return [];
      }
      throw error;
    }
  }

  /**
   * Rotate workflow history using hybrid strategy:
   * - Keep last N snapshots (count limit)
   * - Keep snapshots from last M days (time limit)
   * - Delete snapshots that violate BOTH limits
   *
   * @param maxSnapshots - Maximum number of snapshots to keep (default: 50)
   * @param maxAgeDays - Maximum age in days to keep snapshots (default: 30)
   */
  static async rotateHistory(
    maxSnapshots: number = 50,
    maxAgeDays: number = 30
  ): Promise<void> {
    const snapshots = await this.listHistorySnapshots();

    if (snapshots.length === 0) {
      return; // Nothing to rotate
    }

    // Calculate age threshold (Unix timestamp in milliseconds)
    const now = Date.now();
    const ageThresholdMs = maxAgeDays * 24 * 60 * 60 * 1000;
    const ageThreshold = now - ageThresholdMs;

    const toDelete: string[] = [];

    for (const [i, snapshot] of snapshots.entries()) {
      // Get file modification time
      const stats = await fs.stat(snapshot);
      const fileAge = stats.mtimeMs;

      // Hybrid logic: Delete if BOTH conditions are violated
      const violatesCountLimit = i >= maxSnapshots; // Index-based (0-indexed)
      const violatesTimeLimit = fileAge < ageThreshold;

      if (violatesCountLimit || violatesTimeLimit) {
        toDelete.push(snapshot);
      }
    }

    // Delete snapshots that violate limits
    await Promise.all(toDelete.map((snapshot) => fs.unlink(snapshot)));
  }
}

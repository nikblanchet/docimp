import * as fs from 'node:fs/promises';
import type { CommandState } from '../types/workflow-state.js';
import { StateManager } from './state-manager.js';
import { WorkflowStateManager } from './workflow-state-manager.js';

/**
 * Validation result for workflow prerequisites
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  suggestion?: string;
}

/**
 * Result of comparing file checksums between two command states
 *
 * Used to detect if analyzed files have been modified, added, or removed
 * between two workflow command executions (e.g., analyze → audit).
 *
 * @example
 * ```typescript
 * const analyzeState = {
 *   timestamp: '2025-01-01T12:00:00Z',
 *   item_count: 10,
 *   file_checksums: {
 *     'file1.ts': 'abc123',
 *     'file2.ts': 'def456'
 *   }
 * };
 *
 * const auditState = {
 *   timestamp: '2025-01-01T10:00:00Z',
 *   item_count: 10,
 *   file_checksums: {
 *     'file1.ts': 'oldabc',  // Modified
 *     'file3.ts': 'removed'  // Removed
 *   }
 * };
 *
 * const result = compareFileChecksums(analyzeState, auditState);
 * // result = { hasChanges: true, changedCount: 3 }
 * // (1 modified + 1 added + 1 removed = 3 changes)
 * ```
 */
export interface ChecksumComparisonResult {
  /**
   * Whether any changes were detected
   *
   * True if any files were modified, added, or removed.
   * False only when all file checksums match exactly.
   */
  hasChanges: boolean;

  /**
   * Total number of changed files
   *
   * Sum of modified + added + removed files.
   * Zero when hasChanges is false.
   */
  changedCount: number;
}

/**
 * Result of checking if command results are stale
 */
export interface StalenessCheckResult {
  isStale: boolean;
  changedCount: number;
}

/**
 * Compare file checksums between two command states to detect changes
 *
 * Detects three types of changes:
 * - File modified: Same filepath, different checksum
 * - File removed: Present in older state, absent in newer state
 * - File added: Absent in older state, present in newer state
 *
 * @param newerState - Command state with more recent analysis results
 * @param olderState - Command state with older results to compare against
 * @returns Comparison result with change detection flag and count
 * @throws Error if file_checksums is missing from either state
 */
export function compareFileChecksums(
  newerState: CommandState,
  olderState: CommandState
): ChecksumComparisonResult {
  if (
    !newerState.file_checksums ||
    !olderState.file_checksums ||
    Object.keys(newerState.file_checksums).length === 0 ||
    Object.keys(olderState.file_checksums).length === 0
  ) {
    throw new Error(
      'Cannot compare file checksums: file_checksums missing from command state. ' +
        'This may indicate legacy workflow state data. ' +
        'Re-run analysis to update workflow state with checksums.'
    );
  }

  let changedCount = 0;

  // Check for modified files (same path, different checksum)
  for (const [filepath, olderChecksum] of Object.entries(
    olderState.file_checksums
  )) {
    if (filepath in newerState.file_checksums) {
      if (newerState.file_checksums[filepath] !== olderChecksum) {
        changedCount++;
      }
    } else {
      // File removed from newer state
      changedCount++;
    }
  }

  // Check for added files (present in newer, absent in older)
  for (const filepath of Object.keys(newerState.file_checksums)) {
    if (!(filepath in olderState.file_checksums)) {
      changedCount++;
    }
  }

  return {
    hasChanges: changedCount > 0,
    changedCount,
  };
}

/**
 * Validates workflow prerequisites before command execution.
 *
 * Ensures commands are run in the correct order and that required
 * files exist before proceeding.
 */
export const WorkflowValidator = {
  /**
   * Validate prerequisites for the audit command
   *
   * Requires:
   * - analyze results must exist
   * - analyze results should be current (not stale)
   *
   * @returns Validation result with valid flag and optional error/suggestion
   */
  async validateAuditPrerequisites(
    skipValidation: boolean = false
  ): Promise<ValidationResult> {
    if (skipValidation) {
      return { valid: true };
    }

    // Check if analyze results exist
    const analyzeFile = StateManager.getAnalyzeFile();
    try {
      await fs.access(analyzeFile);
    } catch {
      return {
        valid: false,
        error: `Cannot run audit: analysis results not found at ${analyzeFile}`,
        suggestion:
          `Workflow step 1 is missing.\n` +
          `Run 'docimp analyze <path>' first to generate analysis results.\n\n` +
          `Recommended workflow:\n` +
          `  Step 1: docimp analyze <path>   (missing)\n` +
          `  Step 2: docimp audit <path>     (current command)\n` +
          `  Step 3: docimp plan <path>\n` +
          `  Step 4: docimp improve <path>`,
      };
    }

    // Check if analyze results are current
    const workflowState = await WorkflowStateManager.loadWorkflowState();
    if (!workflowState.last_analyze) {
      return {
        valid: false,
        error: `Cannot run audit: analysis results exist but workflow state is missing.`,
        suggestion: `Re-run 'docimp analyze <path>' to update workflow state.`,
      };
    }

    return { valid: true };
  },

  /**
   * Validate prerequisites for the plan command
   *
   * Requires:
   * - analyze results must exist
   *
   * @returns Validation result with valid flag and optional error/suggestion
   */
  async validatePlanPrerequisites(
    skipValidation: boolean = false
  ): Promise<ValidationResult> {
    if (skipValidation) {
      return { valid: true };
    }

    // Check if analyze results exist
    const analyzeFile = StateManager.getAnalyzeFile();
    try {
      await fs.access(analyzeFile);
    } catch {
      return {
        valid: false,
        error: `Cannot run plan: analysis results not found at ${analyzeFile}`,
        suggestion:
          `Workflow step 1 is missing.\n` +
          `Run 'docimp analyze <path>' first to generate analysis results.\n\n` +
          `Recommended workflow:\n` +
          `  Step 1: docimp analyze <path>   (missing)\n` +
          `  Step 2: docimp plan <path>      (current command)`,
      };
    }

    return { valid: true };
  },

  /**
   * Validate prerequisites for the improve command
   *
   * Requires:
   * - plan must exist
   * - plan should be current (not stale)
   *
   * @returns Validation result with valid flag and optional error/suggestion
   */
  async validateImprovePrerequisites(
    skipValidation: boolean = false
  ): Promise<ValidationResult> {
    if (skipValidation) {
      return { valid: true };
    }

    // Check if plan exists
    const planFile = StateManager.getPlanFile();
    try {
      await fs.access(planFile);
    } catch {
      return {
        valid: false,
        error: `Cannot run improve: plan file not found at ${planFile}`,
        suggestion:
          `Workflow step 3 is missing.\n` +
          `Run 'docimp plan <path>' first to generate an improvement plan.\n\n` +
          `Recommended workflow:\n` +
          `  Step 1: docimp analyze <path>\n` +
          `  Step 2: docimp audit <path>     (optional)\n` +
          `  Step 3: docimp plan <path>      (missing)\n` +
          `  Step 4: docimp improve <path>   (current command)`,
      };
    }

    // Check if plan is current
    const workflowState = await WorkflowStateManager.loadWorkflowState();
    if (workflowState.last_plan && workflowState.last_analyze) {
      const planTime = new Date(workflowState.last_plan.timestamp);
      const analyzeTime = new Date(workflowState.last_analyze.timestamp);

      if (analyzeTime > planTime) {
        return {
          valid: false,
          error:
            'Cannot run improve: plan is stale (analysis re-run since plan was generated).',
          suggestion: `Re-run 'docimp plan <path>' to update the plan with latest analysis.`,
        };
      }
    }

    return { valid: true };
  },

  /**
   * Check if analyze results are stale compared to source files
   *
   * Returns true if any analyzed files have been modified since last analysis
   *
   * @returns True if analyze results are stale (files modified since last analysis)
   */
  async isAnalyzeStale(): Promise<boolean> {
    const workflowState = await WorkflowStateManager.loadWorkflowState();

    if (!workflowState.last_analyze) {
      return false; // No analyze run yet
    }

    const fileChecksums = workflowState.last_analyze.file_checksums;

    // Check if any files have been modified
    for (const [filepath, checksum] of Object.entries(fileChecksums)) {
      try {
        const content = await fs.readFile(filepath, 'utf8');
        const crypto = await import('node:crypto');
        const currentChecksum = crypto
          .createHash('sha256')
          .update(content)
          .digest('hex');

        if (currentChecksum !== checksum) {
          return true; // File modified
        }
      } catch {
        // File may have been deleted or inaccessible
        return true; // Consider stale if file missing
      }
    }

    return false;
  },

  /**
   * Check if audit results are stale compared to analyze results
   *
   * Uses file-level checksum comparison to detect if any analyzed files
   * have changed since the audit was performed.
   *
   * @returns Staleness check result with isStale flag and changed file count
   */
  async isAuditStale(): Promise<StalenessCheckResult> {
    const workflowState = await WorkflowStateManager.loadWorkflowState();

    if (!workflowState.last_audit || !workflowState.last_analyze) {
      return { isStale: false, changedCount: 0 }; // Either not run yet
    }

    // Compare file checksums between analyze and audit states
    const comparison = compareFileChecksums(
      workflowState.last_analyze,
      workflowState.last_audit
    );

    return {
      isStale: comparison.hasChanges,
      changedCount: comparison.changedCount,
    };
  },

  /**
   * Check if plan is stale compared to analyze results
   *
   * Uses file-level checksum comparison to detect if any analyzed files
   * have changed since the plan was generated.
   *
   * @returns Staleness check result with isStale flag and changed file count
   */
  async isPlanStale(): Promise<StalenessCheckResult> {
    const workflowState = await WorkflowStateManager.loadWorkflowState();

    if (!workflowState.last_plan || !workflowState.last_analyze) {
      return { isStale: false, changedCount: 0 }; // Either not run yet
    }

    // Compare file checksums between analyze and plan states
    const comparison = compareFileChecksums(
      workflowState.last_analyze,
      workflowState.last_plan
    );

    return {
      isStale: comparison.hasChanges,
      changedCount: comparison.changedCount,
    };
  },
};

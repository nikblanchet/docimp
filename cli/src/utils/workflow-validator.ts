import * as fs from 'node:fs/promises';
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
   * @returns True if audit results are stale (analyze re-run since audit)
   */
  async isAuditStale(): Promise<boolean> {
    const workflowState = await WorkflowStateManager.loadWorkflowState();

    if (!workflowState.last_audit || !workflowState.last_analyze) {
      return false; // Either not run yet
    }

    const auditTime = new Date(workflowState.last_audit.timestamp);
    const analyzeTime = new Date(workflowState.last_analyze.timestamp);

    return analyzeTime > auditTime;
  },

  /**
   * Check if plan is stale compared to analyze results
   *
   * @returns True if plan is stale (analyze re-run since plan)
   */
  async isPlanStale(): Promise<boolean> {
    const workflowState = await WorkflowStateManager.loadWorkflowState();

    if (!workflowState.last_plan || !workflowState.last_analyze) {
      return false; // Either not run yet
    }

    const planTime = new Date(workflowState.last_plan.timestamp);
    const analyzeTime = new Date(workflowState.last_analyze.timestamp);

    return analyzeTime > planTime;
  },
};

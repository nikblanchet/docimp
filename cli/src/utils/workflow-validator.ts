import * as fs from 'fs/promises';
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
export class WorkflowValidator {
  /**
   * Validate prerequisites for the audit command
   *
   * Requires:
   * - analyze results must exist
   * - analyze results should be current (not stale)
   */
  static async validateAuditPrerequisites(
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
        error: `Analysis results not found: ${analyzeFile}`,
        suggestion: `Run 'docimp analyze <path>' first to generate analysis results.`,
      };
    }

    // Check if analyze results are current
    const workflowState = await WorkflowStateManager.loadWorkflowState();
    if (!workflowState.last_analyze) {
      return {
        valid: false,
        error: 'Analysis results exist but workflow state is missing.',
        suggestion: `Re-run 'docimp analyze <path>' to update workflow state.`,
      };
    }

    return { valid: true };
  }

  /**
   * Validate prerequisites for the plan command
   *
   * Requires:
   * - analyze results must exist
   */
  static async validatePlanPrerequisites(
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
        error: `Analysis results not found: ${analyzeFile}`,
        suggestion: `Run 'docimp analyze <path>' first to generate analysis results.`,
      };
    }

    return { valid: true };
  }

  /**
   * Validate prerequisites for the improve command
   *
   * Requires:
   * - plan must exist
   * - plan should be current (not stale)
   */
  static async validateImprovePrerequisites(
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
        error: `Plan file not found: ${planFile}`,
        suggestion: `Run 'docimp plan <path>' first to generate an improvement plan.`,
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
          error: 'Plan is stale (analysis has been re-run since plan was generated).',
          suggestion: `Re-run 'docimp plan <path>' to update the plan with latest analysis.`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Check if analyze results are stale compared to source files
   *
   * Returns true if any analyzed files have been modified since last analysis
   */
  static async isAnalyzeStale(): Promise<boolean> {
    const workflowState = await WorkflowStateManager.loadWorkflowState();

    if (!workflowState.last_analyze) {
      return false; // No analyze run yet
    }

    const fileChecksums = workflowState.last_analyze.file_checksums;

    // Check if any files have been modified
    for (const [filepath, checksum] of Object.entries(fileChecksums)) {
      try {
        const content = await fs.readFile(filepath, 'utf8');
        const crypto = await import('crypto');
        const currentChecksum = crypto.createHash('sha256').update(content).digest('hex');

        if (currentChecksum !== checksum) {
          return true; // File modified
        }
      } catch {
        // File may have been deleted or inaccessible
        return true; // Consider stale if file missing
      }
    }

    return false;
  }

  /**
   * Check if audit results are stale compared to analyze results
   */
  static async isAuditStale(): Promise<boolean> {
    const workflowState = await WorkflowStateManager.loadWorkflowState();

    if (!workflowState.last_audit || !workflowState.last_analyze) {
      return false; // Either not run yet
    }

    const auditTime = new Date(workflowState.last_audit.timestamp);
    const analyzeTime = new Date(workflowState.last_analyze.timestamp);

    return analyzeTime > auditTime;
  }

  /**
   * Check if plan is stale compared to analyze results
   */
  static async isPlanStale(): Promise<boolean> {
    const workflowState = await WorkflowStateManager.loadWorkflowState();

    if (!workflowState.last_plan || !workflowState.last_analyze) {
      return false; // Either not run yet
    }

    const planTime = new Date(workflowState.last_plan.timestamp);
    const analyzeTime = new Date(workflowState.last_analyze.timestamp);

    return analyzeTime > planTime;
  }
}

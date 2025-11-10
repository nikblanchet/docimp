/**
 * Zod schemas for runtime validation of JSON responses from Python subprocess.
 *
 * These schemas validate that Python analyzer returns well-formed data
 * before it reaches TypeScript application code. Malformed responses
 * are caught early with helpful error messages.
 *
 * Design decisions:
 * - Use .passthrough() to allow extra fields for forward compatibility
 * - Mirror TypeScript interfaces from types/analysis.ts
 * - Provide helpful error messages for validation failures
 */

import { z } from 'zod';

/**
 * Schema for CodeItem.
 * Represents a parsed code item (function, class, method, or interface).
 */
export const CodeItemSchema = z
  .object({
    name: z.string(),
    type: z.enum(['function', 'class', 'method', 'interface']),
    filepath: z.string(),
    line_number: z.number().int().positive(),
    end_line: z.number().int().positive(),
    language: z.enum(['python', 'typescript', 'javascript', 'skipped']),
    complexity: z.number().int().nonnegative(),
    impact_score: z.number().min(0).max(100),
    has_docs: z.boolean(),
    parameters: z.array(z.string()),
    return_type: z.string().nullable(),
    docstring: z.string().nullable(),
    export_type: z.enum(['named', 'default', 'commonjs', 'internal']),
    module_system: z.enum(['esm', 'commonjs', 'unknown']),
    audit_rating: z.number().int().min(1).max(4).nullable(),
  })
  .passthrough();

/**
 * Schema for ParseFailure.
 * Represents a file that failed to parse.
 */
export const ParseFailureSchema = z
  .object({
    filepath: z.string(),
    error: z.string(),
  })
  .passthrough();

/**
 * Schema for LanguageMetrics.
 * Language-specific metrics for documentation coverage.
 */
export const LanguageMetricsSchema = z
  .object({
    language: z.string(),
    total_items: z.number().int().nonnegative(),
    documented_items: z.number().int().nonnegative(),
    coverage_percent: z.number().min(0).max(100),
    avg_complexity: z.number().nonnegative(),
    avg_impact_score: z.number().min(0).max(100),
  })
  .passthrough();

/**
 * Schema for AnalysisResult.
 * Complete analysis result from analyze command.
 */
export const AnalysisResultSchema = z
  .object({
    coverage_percent: z.number().min(0).max(100),
    total_items: z.number().int().nonnegative(),
    documented_items: z.number().int().nonnegative(),
    by_language: z.record(z.string(), LanguageMetricsSchema),
    items: z.array(CodeItemSchema),
    parse_failures: z.array(ParseFailureSchema),
  })
  .passthrough();

/**
 * Schema for AuditItem.
 * Audit item with documentation for quality rating.
 */
export const AuditItemSchema = z
  .object({
    name: z.string(),
    type: z.enum(['function', 'class', 'method', 'interface']),
    filepath: z.string(),
    line_number: z.number().int().positive(),
    end_line: z.number().int().positive(),
    language: z.enum(['python', 'typescript', 'javascript', 'skipped']),
    complexity: z.number().int().nonnegative(),
    docstring: z.string().nullable(),
    audit_rating: z.number().int().min(1).max(4).nullable(),
  })
  .passthrough();

/**
 * Schema for AuditListResult.
 * Result from audit command listing documented items.
 */
export const AuditListResultSchema = z
  .object({
    items: z.array(AuditItemSchema),
  })
  .passthrough();

/**
 * Schema for PlanItem.
 * Plan item for documentation improvement.
 */
export const PlanItemSchema = z
  .object({
    name: z.string(),
    type: z.enum(['function', 'class', 'method', 'interface']),
    filepath: z.string(),
    line_number: z.number().int().positive(),
    end_line: z.number().int().positive(),
    language: z.enum(['python', 'typescript', 'javascript']),
    complexity: z.number().int().nonnegative(),
    impact_score: z.number().min(0).max(100),
    has_docs: z.boolean(),
    audit_rating: z.number().int().min(1).max(4).nullable(),
    parameters: z.array(z.string()),
    return_type: z.string().nullable(),
    docstring: z.string().nullable(),
    export_type: z.enum(['named', 'default', 'commonjs', 'internal']),
    module_system: z.enum(['esm', 'commonjs', 'unknown']),
    reason: z.string(),
  })
  .passthrough();

/**
 * Schema for PlanResult.
 * Result from plan command.
 */
export const PlanResultSchema = z
  .object({
    items: z.array(PlanItemSchema),
    total_items: z.number().int().nonnegative(),
    missing_docs_count: z.number().int().nonnegative(),
    poor_quality_count: z.number().int().nonnegative(),
  })
  .passthrough();

/**
 * Transaction tracking schemas for rollback capability.
 * These schemas validate JSON responses from Python rollback commands.
 */

/**
 * Schema for SessionSummary.
 * Summary of a documentation improvement session.
 */
export const SessionSummarySchema = z
  .object({
    session_id: z.string(),
    started_at: z.string(),
    completed_at: z.string().nullable(),
    change_count: z.number().int().nonnegative(),
    status: z.enum([
      'in_progress',
      'committed',
      'rolled_back',
      'partial_rollback',
    ]),
  })
  .passthrough();

/**
 * Schema for TransactionEntry.
 * Record of a single file modification.
 */
export const TransactionEntrySchema = z
  .object({
    entry_id: z.string(),
    filepath: z.string(),
    timestamp: z.string(),
    item_name: z.string(),
    item_type: z.string(),
    language: z.string(),
    success: z.boolean(),
  })
  .passthrough();

/**
 * Schema for RollbackResult.
 * Result of a rollback operation.
 */
export const RollbackResultSchema = z
  .object({
    success: z.boolean(),
    restored_count: z.number().int().nonnegative(),
    failed_count: z.number().int().nonnegative(),
    status: z.enum(['completed', 'partial_rollback', 'failed']),
    conflicts: z.array(z.string()),
    message: z.string(),
  })
  .passthrough();

/**
 * Generic success response schema for simple Python commands.
 */
export const GenericSuccessSchema = z
  .object({
    success: z.boolean(),
    error: z.string().optional(),
    message: z.string().optional(),
  })
  .passthrough();

/**
 * Schema for CommandStatus.
 * Represents the state of a single workflow command execution.
 */
export const CommandStatusSchema = z
  .object({
    command: z.string(),
    status: z.enum(['run', 'not_run']),
    timestamp: z.string().optional(),
    item_count: z.number().int().nonnegative().optional(),
    file_count: z.number().int().nonnegative().optional(),
  })
  .passthrough();

/**
 * Schema for WorkflowStatusResult.
 * Represents the complete workflow state with warnings and suggestions.
 */
export const WorkflowStatusResultSchema = z
  .object({
    commands: z.array(CommandStatusSchema),
    staleness_warnings: z.array(z.string()),
    suggestions: z.array(z.string()),
    file_modifications: z.number().int().nonnegative(),
  })
  .passthrough();

/**
 * Helper to format Zod validation errors into user-friendly messages.
 *
 * @param error - Zod validation error
 * @returns Formatted error message with field-specific details
 */
export function formatValidationError(error: z.ZodError): string {
  // Use Zod's built-in formatting
  const issues = error.issues;

  if (!issues || issues.length === 0) {
    return 'Invalid response from Python analyzer: Unknown validation error';
  }

  const fieldErrors = issues.map((issue) => {
    const path = issue.path.join('.');
    const pathDisplay = path || 'root';
    return `  - ${pathDisplay}: ${issue.message}`;
  });

  return 'Invalid response from Python analyzer:\n' + fieldErrors.join('\n');
}

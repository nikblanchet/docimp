import { z } from 'zod';

/**
 * Represents a single migration that was applied to workflow state
 */
export const MigrationLogEntrySchema = z.object({
  from: z.string(), // Source schema version
  to: z.string(), // Target schema version
  timestamp: z.string(), // ISO 8601 timestamp when migration was applied
});

export type MigrationLogEntry = z.infer<typeof MigrationLogEntrySchema>;

/**
 * Represents the timestamp and metadata for a single workflow command execution
 */
export const CommandStateSchema = z.object({
  timestamp: z.string(), // ISO 8601 timestamp
  item_count: z.number().int().nonnegative(),
  file_checksums: z.record(z.string(), z.string()), // filepath -> SHA256 checksum
});

export type CommandState = z.infer<typeof CommandStateSchema>;

/**
 * Tracks the overall workflow state across all commands
 * Stored in .docimp/workflow-state.json
 */
export const WorkflowStateSchema = z.object({
  schema_version: z.literal('1.0'),
  migration_log: z.array(MigrationLogEntrySchema).optional().default([]),
  last_analyze: CommandStateSchema.nullable(),
  last_audit: CommandStateSchema.nullable(),
  last_plan: CommandStateSchema.nullable(),
  last_improve: CommandStateSchema.nullable(),
});

export type WorkflowState = z.infer<typeof WorkflowStateSchema>;

/**
 * Creates an empty workflow state
 */
export function createEmptyWorkflowState(): WorkflowState {
  return {
    schema_version: '1.0',
    migration_log: [],
    last_analyze: null,
    last_audit: null,
    last_plan: null,
    last_improve: null,
  };
}

/**
 * Creates a command state for the current execution
 */
export function createCommandState(
  itemCount: number,
  fileChecksums: Record<string, string>
): CommandState {
  return {
    timestamp: new Date().toISOString(),
    item_count: itemCount,
    file_checksums: fileChecksums,
  };
}

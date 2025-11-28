/**
 * TypeScript types and Zod schemas for improve session state persistence.
 *
 * Provides runtime validation for session state when loading from JSON files.
 * Mirrors the Python ImproveSessionState dataclass from analyzer/src/models/improve_session_state.py
 */

import { z } from 'zod';

import { FileSnapshotSchema } from './audit-session-state.js';
import { SessionIdSchema } from './session-id.js';

/**
 * Schema for improve status record.
 * Tracks detailed status for each improved item (accepted/skipped/error).
 */
export const ImproveStatusRecordSchema = z
  .object({
    status: z.enum(['accepted', 'skipped', 'error']),
    timestamp: z.string().datetime(), // ISO 8601 timestamp
    suggestion: z.string().optional(), // Optional suggestion text (for accepted items)
  })
  .passthrough();

/**
 * TypeScript type for improve status record.
 */
export type ImproveStatusRecord = z.infer<typeof ImproveStatusRecordSchema>;

/**
 * Schema for improve configuration.
 * Configuration options for documentation generation (style guides and tone).
 */
export const ImproveConfigSchema = z
  .object({
    styleGuides: z.record(z.string(), z.string()), // language -> style guide name
    tone: z.string(), // concise, detailed, friendly
  })
  .passthrough();

/**
 * TypeScript type for improve configuration.
 */
export type ImproveConfig = z.infer<typeof ImproveConfigSchema>;

/**
 * Schema for ImproveSessionState.
 * Complete state of an in-progress or completed improve session.
 */
export const ImproveSessionStateSchema = z
  .object({
    session_id: SessionIdSchema,
    schema_version: z.string().default('1.0'), // Schema version for migration support
    transaction_id: SessionIdSchema, // Links to git transaction branch
    started_at: z.string().datetime(), // ISO 8601 timestamp
    current_index: z.number().int().nonnegative(),
    total_items: z.number().int().positive(),
    partial_improvements: z.record(
      z.string(), // filepath
      z.record(
        z.string(), // item_name
        z.union([ImproveStatusRecordSchema, z.object({}).strict()]) // status record or empty dict (not yet processed)
      )
    ),
    file_snapshot: z.record(z.string(), FileSnapshotSchema), // filepath -> FileSnapshot
    config: ImproveConfigSchema,
    completed_at: z.string().datetime().nullable(), // ISO 8601 timestamp or null if in-progress
    previous_session_id: SessionIdSchema.optional(), // Links to previous session if this is a continuation
  })
  .passthrough(); // Keep .passthrough() for forward compatibility - allows loading sessions from newer versions

/**
 * TypeScript type inferred from ImproveSessionStateSchema.
 *
 * Represents the complete state of an improve session including:
 * - session_id: Unique identifier (UUID)
 * - schema_version: Version string for migration support (default '1.0')
 * - transaction_id: Git transaction ID for documentation changes
 * - started_at: ISO 8601 timestamp when session began
 * - current_index: Current position in plan_items array (0-based)
 * - total_items: Total number of items to improve
 * - partial_improvements: Nested object with status records per item
 * - file_snapshot: File snapshots for modification detection
 * - config: Improve configuration (styleGuides, tone)
 * - completed_at: ISO 8601 timestamp when completed, or null if in-progress
 */
export type ImproveSessionState = z.infer<typeof ImproveSessionStateSchema>;

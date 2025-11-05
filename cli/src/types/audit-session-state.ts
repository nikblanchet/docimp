/**
 * TypeScript types and Zod schemas for audit session state persistence.
 *
 * Provides runtime validation for session state when loading from JSON files.
 * Mirrors the Python AuditSessionState dataclass from analyzer/src/models/audit_session_state.py
 */

import { z } from 'zod';

/**
 * Schema for FileSnapshot.
 * Represents a snapshot of a source file for modification detection.
 */
export const FileSnapshotSchema = z
  .object({
    filepath: z.string(),
    timestamp: z.number(),
    checksum: z.string(),
    size: z.number().int().nonnegative(),
  })
  .passthrough();

/**
 * TypeScript type inferred from FileSnapshotSchema.
 */
export type FileSnapshot = z.infer<typeof FileSnapshotSchema>;

/**
 * Schema for audit configuration.
 * Configuration options for audit display (code visibility settings).
 */
export const AuditConfigSchema = z
  .object({
    showCodeMode: z.enum(['complete', 'truncated', 'signature', 'on-demand']),
    maxLines: z.number().int().positive(),
  })
  .passthrough();

/**
 * TypeScript type for audit configuration.
 */
export type AuditConfig = z.infer<typeof AuditConfigSchema>;

/**
 * Schema for AuditSessionState.
 * Complete state of an in-progress or completed audit session.
 */
export const AuditSessionStateSchema = z
  .object({
    session_id: z.string().uuid(),
    started_at: z.string().datetime(), // ISO 8601 timestamp
    current_index: z.number().int().nonnegative(),
    total_items: z.number().int().positive(),
    partial_ratings: z.record(
      z.string(), // filepath
      z.record(
        z.string(), // item_name
        z.number().int().min(1).max(4).nullable() // rating or null for skipped
      )
    ),
    file_snapshot: z.record(z.string(), FileSnapshotSchema), // filepath -> FileSnapshot
    config: AuditConfigSchema,
    completed_at: z.string().datetime().nullable(), // ISO 8601 timestamp or null if in-progress
  })
  .passthrough();

/**
 * TypeScript type inferred from AuditSessionStateSchema.
 *
 * Represents the complete state of an audit session including:
 * - session_id: Unique identifier (UUID)
 * - started_at: ISO 8601 timestamp when session began
 * - current_index: Current position in items array (0-based)
 * - total_items: Total number of items to audit
 * - partial_ratings: Nested object mapping filepath -> item_name -> rating (1-4 or null)
 * - file_snapshot: File snapshots for modification detection
 * - config: Audit display configuration
 * - completed_at: ISO 8601 timestamp when completed, or null if in-progress
 */
export type AuditSessionState = z.infer<typeof AuditSessionStateSchema>;

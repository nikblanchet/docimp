/**
 * Zod schema for session ID validation.
 *
 * Accepts both standard UUIDs and shortuuids for backward compatibility.
 * New sessions use shortuuid format (22 chars), but existing sessions
 * with standard UUIDs (36 chars) remain valid indefinitely.
 */

import { z } from 'zod';
import { isValidSessionId } from '../utils/validation.js';

/**
 * Custom Zod schema for session ID validation.
 *
 * Accepts both standard UUID and shortuuid formats for backward compatibility.
 * - Standard UUID: 36 chars with hyphens (e.g., 550e8400-e29b-41d4-a716-446655440000)
 * - ShortUUID: 22 chars base57 encoded (e.g., vytxeTZskVKR7C7WgdSP3d)
 *
 * New sessions use shortuuid format, but existing sessions with UUIDs remain valid.
 */
export const SessionIdSchema = z.string().refine(isValidSessionId, {
  message:
    'Invalid session ID format. Expected UUID (36 chars) or shortuuid (22 chars base57)',
});

/**
 * Type alias for session ID.
 */
export type SessionId = z.infer<typeof SessionIdSchema>;

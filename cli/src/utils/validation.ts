/**
 * Validation utilities for input parameters.
 */

import {
  formatDisplay,
  isValid as isValidShortUuidFormat,
  stripHyphens,
} from './shortuuid.js';

/**
 * Validate that a string is a valid UUID format (v1-v5).
 *
 * This validates the standard 36-character UUID format with hyphens.
 * For session IDs, prefer isValidSessionId() which accepts both UUID
 * and shortuuid formats.
 *
 * @param sessionId - The session ID string to validate
 * @returns True if valid UUID format, false otherwise
 */
export function isValidUuid(sessionId: string): boolean {
  // UUID v1-v5 pattern: xxxxxxxx-xxxx-[1-5]xxx-[89ab]xxx-xxxxxxxxxxxx
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(sessionId);
}

/**
 * Validate that a string is a valid shortuuid format.
 *
 * Shortuuids are 22-character base57-encoded UUIDs. Hyphens are allowed
 * and stripped before validation.
 *
 * @param value - The string to validate
 * @returns True if valid shortuuid format, false otherwise
 */
export function isValidShortUuid(value: string): boolean {
  return isValidShortUuidFormat(value);
}

/**
 * Validate that a string is a valid session ID (UUID or shortuuid).
 *
 * Accepts two formats indefinitely for backward compatibility:
 * - Standard UUID: 36 chars with hyphens (e.g., 550e8400-e29b-41d4-a716-446655440000)
 * - ShortUUID: 22 chars base57 encoded (e.g., vytxeTZskVKR7C7WgdSP3d)
 *
 * @param sessionId - The session ID string to validate
 * @returns True if valid UUID or shortuuid format, false otherwise
 */
export function isValidSessionId(sessionId: string): boolean {
  return isValidUuid(sessionId) || isValidShortUuid(sessionId);
}

/**
 * Detect the format of a session ID.
 *
 * @param sessionId - The session ID to analyze
 * @returns 'uuid' for standard UUIDs, 'shortuuid' for short UUIDs, 'invalid' otherwise
 */
export function detectSessionIdFormat(
  sessionId: string
): 'uuid' | 'shortuuid' | 'invalid' {
  if (isValidUuid(sessionId)) return 'uuid';
  if (isValidShortUuid(sessionId)) return 'shortuuid';
  return 'invalid';
}

/**
 * Normalize a session ID by stripping hyphens if it's a shortuuid.
 *
 * UUIDs are returned unchanged. Shortuuids have hyphens stripped.
 *
 * @param sessionId - The session ID to normalize
 * @returns Normalized session ID
 */
export function normalizeSessionId(sessionId: string): string {
  if (isValidUuid(sessionId)) {
    return sessionId;
  }
  // For shortuuids, strip hyphens
  return stripHyphens(sessionId);
}

/**
 * Format a session ID for display with optional truncation.
 *
 * For shortuuids: truncates and adds hyphens every 4 chars from right
 * For UUIDs: just truncates (they already have natural hyphen breaks)
 *
 * @param sessionId - The session ID to format
 * @param truncate - Number of characters to show (8 or 12 typical)
 * @returns Formatted session ID for display
 *
 * @example
 * // Shortuuid: formatted with hyphens
 * formatSessionIdForDisplay('vytxeTZskVKR7C7WgdSP3d', 8)
 * // Returns: 'vytx-eTZs'
 *
 * formatSessionIdForDisplay('vytxeTZskVKR7C7WgdSP3d', 12)
 * // Returns: 'vytx-eTZs-kVKR'
 *
 * // UUID: simple truncation (already has hyphens)
 * formatSessionIdForDisplay('550e8400-e29b-41d4-a716-446655440000', 8)
 * // Returns: '550e8400'
 */
export function formatSessionIdForDisplay(
  sessionId: string,
  truncate: number
): string {
  // For legacy UUIDs, just truncate (they have natural hyphen structure)
  if (isValidUuid(sessionId)) {
    return sessionId.slice(0, truncate);
  }

  // For shortuuids, use formatDisplay with truncation and hyphenation
  return formatDisplay(sessionId, { truncate });
}

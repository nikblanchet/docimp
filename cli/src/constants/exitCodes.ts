/**
 * Exit code constants for CLI commands.
 *
 * These constants make exit codes self-documenting and easier to maintain.
 * Following Unix conventions:
 * - 0 indicates success or user-initiated cancellation
 * - 1 indicates an error
 */

export const EXIT_CODE = {
  /** Command completed successfully */
  SUCCESS: 0,

  /** Command encountered an error */
  ERROR: 1,

  /** User cancelled the operation (not an error) */
  USER_CANCELLED: 0,
} as const;

/**
 * Type representing valid exit codes.
 * All command functions should return this type.
 */
export type ExitCode = (typeof EXIT_CODE)[keyof typeof EXIT_CODE];

/**
 * Terminal width detection utilities for responsive table rendering.
 *
 * Provides functions to detect terminal width and determine whether to use
 * compact display mode for narrow terminals (< 80 columns).
 */

/**
 * Character set for compact tables without borders.
 * Used when terminal width is below threshold to maximize content space.
 */
export const COMPACT_TABLE_CHARS: Record<string, string> = {
  'top': '',
  'top-mid': '',
  'top-left': '',
  'top-right': '',
  'bottom': '',
  'bottom-mid': '',
  'bottom-left': '',
  'bottom-right': '',
  'left': '',
  'left-mid': '',
  'mid': '',
  'mid-mid': '',
  'right': '',
  'right-mid': '',
  'middle': ' '
};

/**
 * Compact table style configuration for narrow terminals.
 * Removes padding and header styling to conserve space.
 */
export const COMPACT_TABLE_STYLE: { 'padding-left': number; 'padding-right': number; head: string[] } = {
  'padding-left': 0,
  'padding-right': 1,
  head: []
};

/**
 * Gets the current terminal width in columns.
 *
 * For TTY terminals, returns the actual column width.
 * For non-TTY output (pipes, files), defaults to 120 columns to ensure
 * full table rendering for readability in logs and documentation.
 *
 * @returns Terminal width in columns (default: 120)
 */
export function getTerminalWidth(): number {
  return process.stdout.columns || 120;
}

/**
 * Determines whether compact display mode should be used.
 *
 * Compact mode uses borderless tables with minimal padding for narrow terminals.
 * This prevents table overflow and wrapping issues on small screens, tmux panes,
 * or mobile SSH sessions.
 *
 * @param threshold - Minimum width for full table display (default: 80)
 * @returns true if terminal width is below threshold
 */
export function shouldUseCompactMode(threshold: number = 80): boolean {
  return getTerminalWidth() < threshold;
}

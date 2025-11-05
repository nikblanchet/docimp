/**
 * Display interface for terminal output.
 *
 * This interface defines the contract for displaying analysis results,
 * progress indicators, and other terminal output. Commands should inject
 * an IDisplay implementation (typically TerminalDisplay) rather than
 * using console.log directly.
 */

import type {
  AnalysisResult,
  CodeItem,
  AuditSummary,
  SessionSummary,
  TransactionEntry,
  RollbackResult,
} from '../types/analysis.js';

/**
 * Display interface for terminal output with dependency injection support.
 */
export interface IDisplay {
  /**
   * Display complete analysis results with formatting.
   *
   * @param result - Analysis result to display
   * @param format - Output format ('summary' or 'json')
   */
  showAnalysisResult(result: AnalysisResult, format: 'summary' | 'json'): void;

  /**
   * Display configuration information (verbose mode).
   *
   * @param config - Configuration object to display
   */
  showConfig(config: Record<string, unknown>): void;

  /**
   * Display a simple message.
   *
   * @param message - Message to display
   */
  showMessage(message: string): void;

  /**
   * Display an error message.
   *
   * @param message - Error message to display
   */
  showError(message: string): void;

  /**
   * Display a warning message.
   *
   * @param message - Warning message to display
   */
  showWarning(message: string): void;

  /**
   * Display a success message.
   *
   * @param message - Success message to display
   */
  showSuccess(message: string): void;

  /**
   * Display a list of code items (for planning, audit, etc.).
   *
   * @param items - Code items to display
   * @param title - Optional title for the list
   */
  showCodeItems(items: CodeItem[], title?: string): void;

  /**
   * Start a progress spinner with a message.
   *
   * @param message - Progress message
   * @returns Function to stop the spinner
   */
  startSpinner(message: string): () => void;

  /**
   * Display a progress bar for iterative operations.
   *
   * @param current - Current progress value
   * @param total - Total value
   * @param message - Optional progress message
   */
  showProgress(current: number, total: number, message?: string): void;

  /**
   * Display audit summary with rating breakdown and next steps.
   *
   * @param summary - Audit summary statistics
   */
  showAuditSummary(summary: AuditSummary): void;

  /**
   * Display a docstring in a labeled box for audit review.
   *
   * Shows the docstring being audited in a bordered box with the header
   * "CURRENT DOCSTRING". This makes it clear which docstring is being
   * rated, especially when code contains nested functions with their
   * own docstrings.
   *
   * @param docstring - The docstring text to display
   * @param width - Optional box width in characters (default: 60)
   */
  showBoxedDocstring(docstring: string, width?: number): void;

  /**
   * Display a code block with optional truncation message.
   *
   * Shows code (which already includes line numbers from CodeExtractor)
   * without a header label. If truncated, displays a message indicating
   * how many more lines are available and how to view them.
   *
   * @param code - The code to display (already formatted with line numbers)
   * @param truncated - Whether the code was truncated
   * @param totalLines - Total number of lines in the full code
   * @param displayedLines - Number of lines actually displayed
   */
  showCodeBlock(
    code: string,
    truncated: boolean,
    totalLines: number,
    displayedLines: number
  ): void;

  /**
   * Display just the function/class signature with message about full code.
   *
   * Shows only the signature line(s) (which already includes line number
   * from CodeExtractor) followed by a message indicating the total code
   * size and how to view the full code.
   *
   * @param signature - The signature to display (already formatted with line number)
   * @param totalLines - Total number of lines in the full code
   */
  showSignature(signature: string, totalLines: number): void;

  /**
   * Display list of documentation improvement sessions.
   *
   * Shows all active sessions in a formatted table with session ID,
   * start time, change count, and status.
   *
   * @param sessions - Array of session summaries to display
   */
  showSessionList(sessions: SessionSummary[]): void;

  /**
   * Display list of changes in a session.
   *
   * Shows all changes in a session in a formatted table with entry ID,
   * file path, item name, and timestamp.
   *
   * @param changes - Array of transaction entries to display
   * @param sessionId - Session identifier for the header
   */
  showChangeList(changes: TransactionEntry[], sessionId: string): void;

  /**
   * Display rollback operation result.
   *
   * Shows the result of a rollback operation including success/failure status,
   * number of files restored, and any conflicts that occurred.
   *
   * @param result - Rollback result to display
   */
  showRollbackResult(result: RollbackResult): void;
}

/**
 * Display interface for terminal output.
 *
 * This interface defines the contract for displaying analysis results,
 * progress indicators, and other terminal output. Commands should inject
 * an IDisplay implementation (typically TerminalDisplay) rather than
 * using console.log directly.
 */

import type { AnalysisResult, CodeItem, AuditSummary } from '../types/analysis.js';

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
}

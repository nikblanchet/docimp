/**
 * Interface for Python subprocess bridge.
 *
 * This interface defines the contract for communicating with the Python
 * analyzer via subprocess. Implementations spawn Python processes, pass
 * configuration, and parse JSON responses.
 */

import type { AnalysisResult, AuditListResult, AuditRatings, PlanResult, SessionSummary, TransactionEntry, RollbackResult } from '../types/analysis.js';
import type { IConfig } from '../config/IConfig.js';

/**
 * Options for Python analyzer invocation.
 */
export interface AnalyzeOptions {
  /** Path to analyze */
  path: string;

  /** Configuration to pass to Python */
  config: IConfig;

  /** Enable verbose output */
  verbose?: boolean;

  /** Fail immediately on first parse error */
  strict?: boolean;
}

/**
 * Options for audit command.
 */
export interface AuditOptions {
  /** Path to audit */
  path: string;

  /** Path to audit file (default: .docimp/session-reports/audit.json) */
  auditFile?: string;

  /** Enable verbose output */
  verbose?: boolean;
}

/**
 * Options for plan command.
 */
export interface PlanOptions {
  /** Path to analyze */
  path: string;

  /** Path to audit file (default: .docimp/session-reports/audit.json) */
  auditFile?: string;

  /** Path to save plan file (default: .docimp/session-reports/plan.json) */
  planFile?: string;

  /** Quality threshold for including audited items (default: 2) */
  qualityThreshold?: number;

  /** Enable verbose output */
  verbose?: boolean;
}

/**
 * Options for suggest command.
 */
export interface SuggestOptions {
  /** Target in format filepath:itemname */
  target: string;

  /** Style guide to use */
  styleGuide: string;

  /** Documentation tone */
  tone: string;

  /** Claude API timeout in seconds */
  timeout?: number;

  /** Maximum retry attempts for Claude API */
  maxRetries?: number;

  /** Base retry delay in seconds */
  retryDelay?: number;

  /** Enable verbose output */
  verbose?: boolean;
}

/**
 * Data for apply command.
 */
export interface ApplyData {
  /** Path to source file */
  filepath: string;

  /** Name of function/class/method */
  item_name: string;

  /** Type of item */
  item_type: string;

  /** Documentation to write */
  docstring: string;

  /** Language of source file */
  language: string;

  /** Line number where item is located */
  line_number?: number;

  /** Base directory for path validation (files must be within this directory) */
  base_path?: string;

  /** Optional explicit backup path for transaction tracking */
  backup_path?: string;
}

/**
 * Python subprocess bridge interface.
 */
export interface IPythonBridge {
  /**
   * Analyze documentation coverage using Python analyzer.
   *
   * @param options - Analysis options
   * @returns Promise resolving to analysis result
   * @throws Error if Python process fails or returns invalid JSON
   */
  analyze(options: AnalyzeOptions): Promise<AnalysisResult>;

  /**
   * Get list of documented items for quality audit.
   *
   * @param options - Audit options
   * @returns Promise resolving to list of documented items
   * @throws Error if Python process fails or returns invalid JSON
   */
  audit(options: AuditOptions): Promise<AuditListResult>;

  /**
   * Save audit ratings to file.
   *
   * @param ratings - Audit ratings to persist
   * @param auditFile - Path to audit file (default: .docimp/session-reports/audit.json)
   * @returns Promise resolving when ratings are saved
   * @throws Error if Python process fails
   */
  applyAudit(ratings: AuditRatings, auditFile?: string): Promise<void>;

  /**
   * Generate prioritized documentation improvement plan.
   *
   * @param options - Plan options
   * @returns Promise resolving to plan result
   * @throws Error if Python process fails or returns invalid JSON
   */
  plan(options: PlanOptions): Promise<PlanResult>;

  /**
   * Request documentation suggestion from Claude.
   *
   * @param options - Suggestion options
   * @returns Promise resolving to suggested documentation text
   * @throws Error if Python process fails or Claude API error
   */
  suggest(options: SuggestOptions): Promise<string>;

  /**
   * Write documentation to a source file.
   *
   * @param data - Data for writing documentation
   * @returns Promise resolving when documentation is written
   * @throws Error if Python process fails or write fails
   */
  apply(data: ApplyData): Promise<void>;

  /**
   * List all documentation improvement sessions.
   *
   * @returns Promise resolving to array of session summaries
   * @throws Error if Python process fails or returns invalid JSON
   */
  listSessions(): Promise<SessionSummary[]>;

  /**
   * List changes in a specific session.
   *
   * @param sessionId - Session UUID or 'last' for most recent
   * @returns Promise resolving to array of transaction entries
   * @throws Error if Python process fails or returns invalid JSON
   */
  listChanges(sessionId: string): Promise<TransactionEntry[]>;

  /**
   * Rollback an entire session (revert all changes).
   *
   * @param sessionId - Session UUID or 'last' for most recent
   * @returns Promise resolving to rollback result
   * @throws Error if Python process fails or rollback fails
   */
  rollbackSession(sessionId: string): Promise<RollbackResult>;

  /**
   * Rollback a specific change.
   *
   * @param entryId - Change entry ID or 'last' for most recent
   * @returns Promise resolving to rollback result
   * @throws Error if Python process fails or rollback fails
   */
  rollbackChange(entryId: string): Promise<RollbackResult>;

  /**
   * Begin a new transaction for tracking documentation changes.
   *
   * Creates a new git branch in the side-car repository and initializes
   * a transaction manifest for tracking all changes in this session.
   *
   * @param sessionId - Unique identifier for this improve session (UUID)
   * @returns Promise resolving when transaction is initialized
   * @throws Error if git backend unavailable or initialization fails
   */
  beginTransaction(sessionId: string): Promise<void>;

  /**
   * Record a documentation write in the current transaction.
   *
   * Creates a git commit in the side-car repository with metadata about the
   * change. Must be called after each accepted documentation modification.
   *
   * @param sessionId - Transaction session identifier
   * @param filepath - Absolute path to modified file
   * @param backupPath - Path to backup file for rollback
   * @param itemName - Name of documented item (function/class/method)
   * @param itemType - Type of item ('function', 'class', 'method')
   * @param language - Programming language ('python', 'typescript', 'javascript')
   * @returns Promise resolving when write is recorded
   * @throws Error if transaction not active or git commit fails
   */
  recordWrite(
    sessionId: string,
    filepath: string,
    backupPath: string,
    itemName: string,
    itemType: string,
    language: string
  ): Promise<void>;
}

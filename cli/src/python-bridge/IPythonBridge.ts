/**
 * Interface for Python subprocess bridge.
 *
 * This interface defines the contract for communicating with the Python
 * analyzer via subprocess. Implementations spawn Python processes, pass
 * configuration, and parse JSON responses.
 */

import type { AnalysisResult, AuditListResult, AuditRatings, PlanResult } from '../types/analysis.js';
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
}

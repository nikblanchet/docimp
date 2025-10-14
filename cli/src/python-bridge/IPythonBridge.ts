/**
 * Interface for Python subprocess bridge.
 *
 * This interface defines the contract for communicating with the Python
 * analyzer via subprocess. Implementations spawn Python processes, pass
 * configuration, and parse JSON responses.
 */

import type { AnalysisResult, AuditListResult, AuditRatings } from '../types/analysis.js';
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

  /** Path to audit file (default: .docimp-audit.json) */
  auditFile?: string;

  /** Enable verbose output */
  verbose?: boolean;
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
   * @param auditFile - Path to audit file (default: .docimp-audit.json)
   * @returns Promise resolving when ratings are saved
   * @throws Error if Python process fails
   */
  applyAudit(ratings: AuditRatings, auditFile?: string): Promise<void>;
}

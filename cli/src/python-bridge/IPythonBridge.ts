/**
 * Interface for Python subprocess bridge.
 *
 * This interface defines the contract for communicating with the Python
 * analyzer via subprocess. Implementations spawn Python processes, pass
 * configuration, and parse JSON responses.
 */

import type { AnalysisResult } from '../types/analysis.js';
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
}

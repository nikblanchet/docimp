/**
 * Interface for interactive documentation improvement session.
 *
 * Defines the contract for running an interactive workflow to improve
 * documentation with user guidance and AI assistance.
 */

import type { PlanItem } from '../types/analysis.js';

/**
 * Interactive session interface.
 *
 * Implementations handle the interactive loop for improving documentation,
 * including user prompts, AI generation, validation, and file updates.
 */
export interface IInteractiveSession {
  /**
   * Run the interactive improvement session.
   *
   * @param items - Plan items to improve
   */
  run(items: PlanItem[]): Promise<void>;
}

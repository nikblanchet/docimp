/**
 * State directory management for docimp working files.
 *
 * This module provides utilities for managing the .docimp/ state directory
 * where all working files (audit results, plans, session reports) are stored.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
  statSync,
} from 'node:fs';
import path from 'node:path';

/**
 * Manages the .docimp/ state directory for working files.
 *
 * The state directory structure:
 * .docimp/
 * ├── session-reports/    # Current session data (ephemeral)
 * │   ├── audit.json
 * │   ├── plan.json
 * │   └── analyze-latest.json
 * └── history/            # Long-term data (future feature)
 *
 * All methods return absolute paths resolved from the current working directory.
 */
export class StateManager {
  private static readonly STATE_DIR_NAME = '.docimp';
  private static readonly SESSION_REPORTS_DIR = 'session-reports';
  private static readonly HISTORY_DIR = 'history';

  private static readonly AUDIT_FILE = 'audit.json';
  private static readonly PLAN_FILE = 'plan.json';
  private static readonly ANALYZE_FILE = 'analyze-latest.json';

  /**
   * Get the absolute path to the .docimp/ state directory.
   *
   * @param basePath - Base directory to resolve from. If not provided, uses current working directory.
   * @returns Absolute path to .docimp/ directory.
   */
  static getStateDir(basePath?: string): string {
    const base = basePath || process.cwd();
    return path.resolve(base, this.STATE_DIR_NAME);
  }

  /**
   * Get the absolute path to the session-reports/ directory.
   *
   * @param basePath - Base directory to resolve from. If not provided, uses current working directory.
   * @returns Absolute path to .docimp/session-reports/ directory.
   */
  static getSessionReportsDir(basePath?: string): string {
    return path.join(this.getStateDir(basePath), this.SESSION_REPORTS_DIR);
  }

  /**
   * Get the absolute path to the history/ directory.
   *
   * @param basePath - Base directory to resolve from. If not provided, uses current working directory.
   * @returns Absolute path to .docimp/history/ directory.
   */
  static getHistoryDir(basePath?: string): string {
    return path.join(this.getStateDir(basePath), this.HISTORY_DIR);
  }

  /**
   * Get the absolute path to the audit.json file.
   *
   * @param basePath - Base directory to resolve from. If not provided, uses current working directory.
   * @returns Absolute path to .docimp/session-reports/audit.json.
   */
  static getAuditFile(basePath?: string): string {
    return path.join(this.getSessionReportsDir(basePath), this.AUDIT_FILE);
  }

  /**
   * Get the absolute path to the plan.json file.
   *
   * @param basePath - Base directory to resolve from. If not provided, uses current working directory.
   * @returns Absolute path to .docimp/session-reports/plan.json.
   */
  static getPlanFile(basePath?: string): string {
    return path.join(this.getSessionReportsDir(basePath), this.PLAN_FILE);
  }

  /**
   * Get the absolute path to the analyze-latest.json file.
   *
   * @param basePath - Base directory to resolve from. If not provided, uses current working directory.
   * @returns Absolute path to .docimp/session-reports/analyze-latest.json.
   */
  static getAnalyzeFile(basePath?: string): string {
    return path.join(this.getSessionReportsDir(basePath), this.ANALYZE_FILE);
  }

  /**
   * Ensure the state directory structure exists, creating it if necessary.
   *
   * Creates:
   * - .docimp/
   * - .docimp/session-reports/
   * - .docimp/history/
   *
   * @param basePath - Base directory to resolve from. If not provided, uses current working directory.
   */
  static ensureStateDir(basePath?: string): void {
    const stateDirectory = this.getStateDir(basePath);
    const sessionReportsDirectory = this.getSessionReportsDir(basePath);
    const historyDirectory = this.getHistoryDir(basePath);

    // Create directories with recursive option (idempotent)
    if (!existsSync(stateDirectory)) {
      mkdirSync(stateDirectory, { recursive: true });
    }
    if (!existsSync(sessionReportsDirectory)) {
      mkdirSync(sessionReportsDirectory, { recursive: true });
    }
    if (!existsSync(historyDirectory)) {
      mkdirSync(historyDirectory, { recursive: true });
    }
  }

  /**
   * Clear all files in the session-reports/ directory.
   *
   * This removes all session files (audit, plan, analyze) to start fresh.
   * The session-reports/ directory itself is preserved.
   * The history/ directory is NOT touched.
   *
   * @param basePath - Base directory to resolve from. If not provided, uses current working directory.
   * @returns Number of files removed.
   */
  static clearSessionReports(basePath?: string): number {
    const sessionReportsDirectory = this.getSessionReportsDir(basePath);

    // Ensure directory exists first
    if (!existsSync(sessionReportsDirectory)) {
      this.ensureStateDir(basePath);
      return 0;
    }

    // Remove all files in session-reports/
    let filesRemoved = 0;
    const items = readdirSync(sessionReportsDirectory);

    for (const item of items) {
      const itemPath = path.join(sessionReportsDirectory, item);
      const stats = statSync(itemPath);

      if (stats.isFile()) {
        unlinkSync(itemPath);
        filesRemoved++;
      }
    }

    return filesRemoved;
  }

  /**
   * Check if the state directory exists.
   *
   * @param basePath - Base directory to resolve from. If not provided, uses current working directory.
   * @returns True if .docimp/ directory exists, False otherwise.
   */
  static stateDirExists(basePath?: string): boolean {
    return existsSync(this.getStateDir(basePath));
  }
}

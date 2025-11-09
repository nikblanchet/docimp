/**
 * Shared test utilities for setting up test environments.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { CodeItem } from '../types/analysis';

/**
 * Options for setupDocimpDir function.
 */
export interface SetupDocimpDirOptions {
  /**
   * Whether to create analyze-latest.json file.
   * @default true
   */
  createAnalyzeFile?: boolean;

  /**
   * Whether to create workflow-state.json file.
   * @default true
   */
  createWorkflowState?: boolean;

  /**
   * Whether to create plan.json file.
   * @default false
   */
  createPlanFile?: boolean;

  /**
   * Whether to create audit.json file.
   * @default false
   */
  createAuditFile?: boolean;

  /**
   * Custom items to include in analyze-latest.json.
   * If not provided, an empty array is used.
   */
  analyzeItems?: CodeItem[];

  /**
   * Custom items to include in plan.json.
   * If not provided, an empty array is used.
   */
  planItems?: CodeItem[];
}

/**
 * Set up .docimp directory with necessary workflow state files for testing.
 * This helper creates the directory structure and minimal required files
 * to satisfy workflow validator checks.
 *
 * @param tempDir - The temporary directory to create .docimp structure in
 * @param options - Optional configuration for which files to create
 */
export function setupDocimpDir(
  tempDir: string,
  options: SetupDocimpDirOptions = {}
): void {
  const {
    createAnalyzeFile = true,
    createWorkflowState = true,
    createPlanFile = false,
    createAuditFile = false,
    analyzeItems = [],
    planItems = [],
  } = options;

  // Create .docimp directory structure
  const docimpDir = path.join(tempDir, '.docimp');
  const sessionReportsDir = path.join(docimpDir, 'session-reports');
  fs.mkdirSync(sessionReportsDir, { recursive: true });

  // Create workflow-state.json if requested
  if (createWorkflowState) {
    const workflowState = {
      schema_version: '1.0',
      last_analyze: createAnalyzeFile
        ? {
            timestamp: new Date().toISOString(),
            item_count: analyzeItems.length,
            file_checksums: {},
          }
        : null,
      last_audit: createAuditFile
        ? {
            timestamp: new Date().toISOString(),
            item_count: 0,
            file_checksums: {},
          }
        : null,
      last_plan: createPlanFile
        ? {
            timestamp: new Date().toISOString(),
            item_count: planItems.length,
            file_checksums: {},
          }
        : null,
      last_improve: null,
    };

    fs.writeFileSync(
      path.join(docimpDir, 'workflow-state.json'),
      JSON.stringify(workflowState, null, 2),
      'utf8'
    );
  }

  // Create analyze-latest.json if requested
  if (createAnalyzeFile) {
    const analyzeResult = {
      items: analyzeItems,
      coverage_percent: analyzeItems.length > 0 ? 50.0 : 0.0,
      total_items: analyzeItems.length,
      documented_items: 0,
      by_language: {},
      parse_failures: [],
    };

    fs.writeFileSync(
      path.join(sessionReportsDir, 'analyze-latest.json'),
      JSON.stringify(analyzeResult, null, 2),
      'utf8'
    );
  }

  // Create plan.json if requested
  if (createPlanFile) {
    const planResult = {
      items: planItems,
      total_items: planItems.length,
      metadata: {
        created_at: new Date().toISOString(),
        audit_applied: createAuditFile,
      },
    };

    fs.writeFileSync(
      path.join(docimpDir, 'plan.json'),
      JSON.stringify(planResult, null, 2),
      'utf8'
    );
  }

  // Create audit.json if requested
  if (createAuditFile) {
    const auditResult = {
      items: analyzeItems.map((item) => ({
        ...item,
        audit_rating: 2, // Default "OK" rating
      })),
      metadata: {
        created_at: new Date().toISOString(),
        total_rated: analyzeItems.length,
      },
    };

    fs.writeFileSync(
      path.join(docimpDir, 'audit.json'),
      JSON.stringify(auditResult, null, 2),
      'utf8'
    );
  }
}

/**
 * Create a minimal CodeItem for testing.
 */
export function createMockCodeItem(
  overrides: Partial<CodeItem> = {}
): CodeItem {
  return {
    name: 'testFunction',
    type: 'function',
    filepath: 'test.js',
    line_number: 10,
    end_line: 20,
    language: 'javascript',
    complexity: 5,
    impact_score: 25,
    has_docs: false,
    parameters: [],
    return_type: null,
    docstring: null,
    export_type: 'named',
    module_system: 'esm',
    audit_rating: null,
    ...overrides,
  };
}

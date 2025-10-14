/**
 * TypeScript types matching Python analyzer data structures.
 *
 * These types ensure type safety when communicating with the Python
 * subprocess via JSON. They mirror the dataclasses defined in
 * analyzer/src/models/.
 */

/**
 * Represents a parsed code item (function, class, or method).
 */
export interface CodeItem {
  /** Function, class, or method name */
  name: string;

  /** Type of code element */
  type: 'function' | 'class' | 'method';

  /** Absolute path to source file */
  filepath: string;

  /** Line number where definition starts */
  line_number: number;

  /** Source language */
  language: 'python' | 'typescript' | 'javascript' | 'skipped';

  /** Cyclomatic complexity score */
  complexity: number;

  /** Calculated impact score (0-100) */
  impact_score: number;

  /** Whether item has documentation */
  has_docs: boolean;

  /** Export type for JavaScript/TypeScript */
  export_type: 'named' | 'default' | 'commonjs' | 'internal';

  /** Module system for JavaScript */
  module_system: 'esm' | 'commonjs' | 'unknown';

  /** Optional audit quality rating (1-4, or undefined if not audited) */
  audit_rating?: number;
}

/**
 * Language-specific metrics.
 */
export interface LanguageMetrics {
  /** Language name */
  language: string;

  /** Total items found */
  total_items: number;

  /** Number of documented items */
  documented_items: number;

  /** Documentation coverage percentage */
  coverage_percent: number;

  /** Average cyclomatic complexity */
  avg_complexity: number;

  /** Average impact score */
  avg_impact_score: number;
}

/**
 * Complete analysis result.
 */
export interface AnalysisResult {
  /** Overall documentation coverage percentage */
  coverage_percent: number;

  /** Total number of items analyzed */
  total_items: number;

  /** Number of items with documentation */
  documented_items: number;

  /** Metrics broken down by language */
  by_language: Record<string, LanguageMetrics>;

  /** All parsed code items */
  items: CodeItem[];
}

/**
 * Audit item with documentation for quality rating.
 */
export interface AuditItem {
  /** Function, class, or method name */
  name: string;

  /** Type of code element */
  type: 'function' | 'class' | 'method';

  /** Absolute path to source file */
  filepath: string;

  /** Line number where definition starts */
  line_number: number;

  /** Source language */
  language: 'python' | 'typescript' | 'javascript' | 'skipped';

  /** Cyclomatic complexity score */
  complexity: number;

  /** Existing documentation string */
  docstring: string | null;

  /** Existing audit rating if already rated */
  audit_rating?: number;
}

/**
 * Result from audit command listing documented items.
 */
export interface AuditListResult {
  /** Items with documentation to be audited */
  items: AuditItem[];
}

/**
 * Audit ratings to be persisted.
 */
export interface AuditRatings {
  /** Nested mapping: filepath -> item_name -> rating (1-4 or null for skipped) */
  ratings: Record<string, Record<string, number | null>>;
}

/**
 * Plan item for documentation improvement.
 */
export interface PlanItem {
  /** Function, class, or method name */
  name: string;

  /** Type of code element */
  type: 'function' | 'class' | 'method';

  /** Absolute path to source file */
  filepath: string;

  /** Line number where definition starts */
  line_number: number;

  /** Source language */
  language: 'python' | 'typescript' | 'javascript';

  /** Cyclomatic complexity score */
  complexity: number;

  /** Calculated impact score (0-100) */
  impact_score: number;

  /** Whether item currently has documentation */
  has_docs: boolean;

  /** Optional audit quality rating */
  audit_rating: number | null;

  /** Parameter names */
  parameters: string[];

  /** Return type annotation if available */
  return_type: string | null;

  /** Existing documentation if present */
  docstring: string | null;

  /** Export type for JavaScript/TypeScript */
  export_type: 'named' | 'default' | 'commonjs' | 'internal';

  /** Module system for JavaScript */
  module_system: 'esm' | 'commonjs' | 'unknown';

  /** Reason for inclusion in plan */
  reason: string;
}

/**
 * Result from plan command.
 */
export interface PlanResult {
  /** Prioritized items to improve */
  items: PlanItem[];

  /** Total number of items in plan */
  total_items: number;

  /** Number of items with missing docs */
  missing_docs_count: number;

  /** Number of items with poor quality docs */
  poor_quality_count: number;
}

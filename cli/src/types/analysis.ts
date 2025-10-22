/**
 * TypeScript types matching Python analyzer data structures.
 *
 * These types ensure type safety when communicating with the Python
 * subprocess via JSON. They mirror the dataclasses defined in
 * analyzer/src/models/.
 */

/**
 * Supported programming languages for documentation generation.
 * This type provides compile-time verification that all supported
 * languages are handled consistently across the codebase.
 */
export type SupportedLanguage = 'python' | 'javascript' | 'typescript';

/**
 * Represents a parsed code item (function, class, method, or interface).
 */
export interface CodeItem {
  /** Function, class, method, or interface name */
  name: string;

  /** Type of code element */
  type: 'function' | 'class' | 'method' | 'interface';

  /** Absolute path to source file */
  filepath: string;

  /** Line number where definition starts */
  line_number: number;

  /** Line number where definition ends (inclusive) */
  end_line: number;

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
 * Represents a file that failed to parse.
 */
export interface ParseFailure {
  /** Absolute path to the file that failed to parse */
  filepath: string;

  /** First line of the error message from the exception */
  error: string;
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

  /** Files that failed to parse */
  parse_failures: ParseFailure[];
}

/**
 * Audit item with documentation for quality rating.
 */
export interface AuditItem {
  /** Function, class, method, or interface name */
  name: string;

  /** Type of code element */
  type: 'function' | 'class' | 'method' | 'interface';

  /** Absolute path to source file */
  filepath: string;

  /** Line number where definition starts */
  line_number: number;

  /** Line number where definition ends (inclusive) */
  end_line: number;

  /** Source language */
  language: 'python' | 'typescript' | 'javascript' | 'skipped';

  /** Cyclomatic complexity score */
  complexity: number;

  /** Existing documentation string */
  docstring: string | null;

  /** Existing audit rating if already rated (null if not audited) */
  audit_rating: number | null;
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
 * Audit summary statistics for display.
 */
export interface AuditSummary {
  /** Total number of documented items available for audit */
  totalItems: number;

  /** Number of items that were audited (rated or skipped) */
  auditedItems: number;

  /** Count of items with each rating (1-4) and skipped (null) */
  ratingCounts: {
    terrible: number;  // Rating 1
    ok: number;        // Rating 2
    good: number;      // Rating 3
    excellent: number; // Rating 4
    skipped: number;   // Rating null
  };

  /** Path to the audit file */
  auditFile: string;
}

/**
 * Plan item for documentation improvement.
 */
export interface PlanItem {
  /** Function, class, method, or interface name */
  name: string;

  /** Type of code element */
  type: 'function' | 'class' | 'method' | 'interface';

  /** Absolute path to source file */
  filepath: string;

  /** Line number where definition starts */
  line_number: number;

  /** Line number where definition ends (inclusive) */
  end_line: number;

  /** Source language */
  language: SupportedLanguage;

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

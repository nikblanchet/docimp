/**
 * Analyze command implementation.
 *
 * This command analyzes documentation coverage in a codebase by calling
 * the Python analyzer via subprocess.
 */

import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import prompts from 'prompts';
import type { IConfigLoader } from '../config/i-config-loader.js';
import type { IConfig } from '../config/i-config.js';
import { EXIT_CODE, type ExitCode } from '../constants/exit-codes.js';
import type { IDisplay } from '../display/i-display.js';
import type { IPythonBridge } from '../python-bridge/i-python-bridge.js';
import type {
  AuditRatings,
  AnalysisResult,
  LanguageMetrics,
} from '../types/analysis.js';
import { createCommandState } from '../types/workflow-state.js';
import { FileTracker, type FileSnapshot } from '../utils/file-tracker.js';
import { PathValidator } from '../utils/path-validator.js';
import { StateManager } from '../utils/state-manager.js';
import { WorkflowStateManager } from '../utils/workflow-state-manager.js';

/**
 * Handle incremental analysis: only re-analyze changed files
 *
 * @param absolutePath - Absolute path to analyze
 * @param config - Configuration object
 * @param options - Command options
 * @param options.verbose - Enable verbose output
 * @param options.strict - Fail immediately on parse errors
 * @param bridge - Python bridge instance
 * @param display - Display instance
 * @returns Analysis result with merged items
 */
async function handleIncrementalAnalysis(
  absolutePath: string,
  config: IConfig,
  options: { verbose?: boolean; strict?: boolean },
  bridge: IPythonBridge,
  display: IDisplay
): Promise<AnalysisResult> {
  // Load previous analysis results
  const analyzeFile = StateManager.getAnalyzeFile();
  if (!existsSync(analyzeFile)) {
    display.showMessage(
      'No previous analysis found. Running full analysis instead.'
    );
    const stopSpinner = display.startSpinner('Analyzing codebase...');
    try {
      const result = await bridge.analyze({
        path: absolutePath,
        config,
        verbose: options.verbose,
        strict: options.strict,
      });
      stopSpinner();
      return result;
    } catch (error) {
      stopSpinner();
      throw error;
    }
  }

  // Load previous results and workflow state
  const previousResult = JSON.parse(
    await import('node:fs/promises').then((fs) =>
      fs.readFile(analyzeFile, 'utf8')
    )
  ) as AnalysisResult;
  const workflowState = await WorkflowStateManager.loadWorkflowState();

  if (!workflowState.last_analyze) {
    display.showMessage(
      'Workflow state missing. Running full analysis instead.'
    );
    const stopSpinner = display.startSpinner('Analyzing codebase...');
    try {
      const result = await bridge.analyze({
        path: absolutePath,
        config,
        verbose: options.verbose,
        strict: options.strict,
      });
      stopSpinner();
      return result;
    } catch (error) {
      stopSpinner();
      throw error;
    }
  }

  // Detect changed files
  // Reconstruct snapshot from checksums (FileTracker expects FileSnapshot objects)
  const snapshot: Record<string, FileSnapshot> = {};
  for (const [filepath, checksum] of Object.entries(
    workflowState.last_analyze.file_checksums
  )) {
    snapshot[filepath] = {
      filepath,
      checksum,
      timestamp: 0, // Not needed for change detection
      size: 0, // Not needed for change detection
    };
  }

  const changedFiles = await FileTracker.detectChanges(snapshot);

  if (changedFiles.length === 0) {
    if (options.verbose) {
      display.showMessage(
        'No files changed. Reusing previous analysis results.'
      );
    }
    return previousResult;
  }

  if (options.verbose) {
    display.showMessage(
      `Found ${changedFiles.length} changed file(s). Re-analyzing...`
    );
  }

  // Run analysis only on changed files
  const stopSpinner = display.startSpinner(
    `Analyzing ${changedFiles.length} changed file(s)...`
  );

  try {
    // Analyze each changed file individually
    const changedResults = await Promise.all(
      changedFiles.map(async (filepath) => {
        return await bridge.analyze({
          path: filepath,
          config,
          verbose: false,
          strict: options.strict,
        });
      })
    );

    stopSpinner();

    // Merge results: remove old items from changed files, add new items
    const unchangedItems = previousResult.items.filter(
      (item) => !changedFiles.includes(item.filepath)
    );

    const changedItems = changedResults.flatMap((result) => result.items);

    const mergedItems = [...unchangedItems, ...changedItems];

    // Recalculate coverage statistics
    const documentedItems = mergedItems.filter((item) => item.has_docs).length;
    const totalItems = mergedItems.length;
    const coveragePercent =
      totalItems > 0 ? (documentedItems / totalItems) * 100 : 0;

    // Recalculate by_language statistics
    const byLanguage: Record<string, LanguageMetrics> = {};
    for (const item of mergedItems) {
      if (!byLanguage[item.language]) {
        byLanguage[item.language] = {
          language: item.language,
          total_items: 0,
          documented_items: 0,
          coverage_percent: 0,
          avg_complexity: 0,
          avg_impact_score: 0,
        };
      }
      byLanguage[item.language].total_items++;
      if (item.has_docs) {
        byLanguage[item.language].documented_items++;
      }
    }

    // Calculate coverage percentages and averages for each language
    for (const lang of Object.keys(byLanguage)) {
      const langData = byLanguage[lang];
      const langItems = mergedItems.filter((item) => item.language === lang);

      langData.coverage_percent =
        langData.total_items > 0
          ? (langData.documented_items / langData.total_items) * 100
          : 0;

      langData.avg_complexity =
        langItems.reduce((sum, item) => sum + item.complexity, 0) /
        langItems.length;

      langData.avg_impact_score =
        langItems.reduce((sum, item) => sum + item.impact_score, 0) /
        langItems.length;
    }

    // Merge parse failures
    const unchangedFailures = previousResult.parse_failures || [];
    const changedFailures = changedResults.flatMap(
      (result) => result.parse_failures || []
    );
    const mergedFailures = [...unchangedFailures, ...changedFailures];

    if (options.verbose) {
      display.showMessage(
        `Merged ${unchangedItems.length} unchanged + ${changedItems.length} changed = ${mergedItems.length} total items`
      );
    }

    return {
      items: mergedItems,
      coverage_percent: coveragePercent,
      total_items: totalItems,
      documented_items: documentedItems,
      by_language: byLanguage,
      parse_failures: mergedFailures,
    };
  } catch (error) {
    stopSpinner();
    throw error;
  }
}

/**
 * Apply audit ratings from audit.json to analysis items.
 *
 * @param result - Analysis result containing items
 * @param display - Display instance for showing messages
 * @param verbose - Whether to show verbose messages
 * @returns Modified result with audit ratings applied
 */
function applyAuditRatings(
  result: AnalysisResult,
  display: IDisplay,
  verbose: boolean
): AnalysisResult {
  // Load audit.json if it exists
  const auditFile = StateManager.getAuditFile();
  if (!existsSync(auditFile)) {
    if (verbose) {
      display.showMessage('No audit.json found. Skipping rating application.');
    }
    return result;
  }

  try {
    const auditData = JSON.parse(
      readFileSync(auditFile, 'utf8')
    ) as AuditRatings;

    let appliedCount = 0;

    // Apply ratings to items by matching filepath and name
    for (const item of result.items) {
      const fileRatings = auditData.ratings[item.filepath];
      if (fileRatings && fileRatings[item.name] !== undefined) {
        item.audit_rating = fileRatings[item.name];
        appliedCount++;
      }
    }

    if (verbose) {
      display.showMessage(
        `Applied audit ratings to ${appliedCount} item(s) from ${auditFile}`
      );
    }

    return result;
  } catch (error) {
    // If audit file is corrupted, show warning but continue
    display.showWarning(
      `Failed to load audit ratings from ${auditFile}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
    return result;
  }
}

/**
 * Smart auto-clean handler: determines whether to clean session reports.
 *
 * Default behavior (no flags): Prompts user when audit.json exists.
 * Override with --preserve-audit to preserve audit.json.
 * Override with --force-clean to skip prompt and always clean.
 *
 * @param options - Command options
 * @param options.preserveAudit - Preserve audit.json file only
 * @param options.forceClean - Force clean without prompting (bypasses default prompt)
 * @param display - Display instance for showing warning messages
 * @returns true if should clean, false if should preserve
 * @throws Error if user cancels the operation (Ctrl+C)
 */
async function handleSmartAutoClean(
  options: {
    preserveAudit?: boolean;
    forceClean?: boolean;
  },
  display: IDisplay
): Promise<boolean> {
  // Preserve if explicit flag is set
  if (options.preserveAudit) {
    return false;
  }

  // Force clean if explicit flag is set (skip prompt)
  if (options.forceClean) {
    return true;
  }

  // Check if audit.json exists
  const auditFile = StateManager.getAuditFile();
  if (!existsSync(auditFile)) {
    return true; // No audit file, safe to clean
  }

  // Show warning messages
  display.showMessage('Audit ratings file exists at ' + auditFile);
  display.showMessage('Re-running analyze will delete these ratings.');

  // Prompt user for confirmation
  const response = await prompts({
    type: 'confirm',
    name: 'shouldDelete',
    message: 'Delete audit ratings and continue?',
    initial: false,
  });

  // Handle user cancellation (Ctrl+C or ESC)
  if (response.shouldDelete === undefined) {
    throw new Error('Operation cancelled by user');
  }

  return response.shouldDelete;
}

/**
 * Core analyze logic (extracted for testability).
 *
 * @param path - Path to file or directory to analyze
 * @param options - Command options
 * @param options.format - Output format (json or summary)
 * @param options.config - Path to configuration file
 * @param options.verbose - Enable verbose output
 * @param options.preserveAudit - Preserve audit.json file only
 * @param options.forceClean - Force clean without prompting
 * @param options.incremental - Only re-analyze changed files
 * @param options.strict - Fail immediately on first parse error
 * @param options.applyAudit - Apply existing audit ratings to analyzed items
 * @param bridge - Python bridge instance (dependency injection)
 * @param display - Display instance (dependency injection)
 * @param configLoader - Config loader instance (dependency injection)
 */
export async function analyzeCore(
  path: string,
  options: {
    format?: string;
    config?: string;
    verbose?: boolean;
    preserveAudit?: boolean;
    forceClean?: boolean;
    incremental?: boolean;
    strict?: boolean;
    applyAudit?: boolean;
  },
  bridge: IPythonBridge,
  display: IDisplay,
  configLoader: IConfigLoader
): Promise<void> {
  // Validate path exists and is accessible before proceeding
  const absolutePath = PathValidator.validatePathExists(path);
  PathValidator.validatePathReadable(absolutePath);
  PathValidator.warnIfEmpty(absolutePath);

  // Ensure state directory exists
  StateManager.ensureStateDir();

  // Smart auto-clean: check if audit.json exists and prompt user
  const shouldClean = await handleSmartAutoClean(options, display);

  if (shouldClean) {
    const filesRemoved = StateManager.clearSessionReports();
    if (filesRemoved > 0 && options.verbose) {
      display.showMessage(`Cleared ${filesRemoved} previous session report(s)`);
    }
  } else if (options.verbose) {
    display.showMessage('Keeping previous session reports');
  }

  // Load configuration
  const config = await configLoader.load(options.config);

  if (options.verbose) {
    display.showConfig({
      styleGuides: config.styleGuides,
      tone: config.tone,
      plugins: config.plugins,
      exclude: config.exclude,
      jsdocStyle: config.jsdocStyle,
    });
  }

  // Handle incremental analysis if requested
  let result;
  if (options.incremental) {
    result = await handleIncrementalAnalysis(
      absolutePath,
      config,
      options,
      bridge,
      display
    );
  } else {
    // Run full analysis via Python subprocess
    if (options.verbose) {
      display.showMessage(`Analyzing: ${absolutePath}`);
    }

    const stopSpinner = display.startSpinner('Analyzing codebase...');

    try {
      result = await bridge.analyze({
        path: absolutePath,
        config,
        verbose: options.verbose,
        strict: options.strict,
      });

      stopSpinner();
    } catch (error) {
      stopSpinner();
      throw error;
    }
  }

  // Apply audit ratings if requested
  if (options.applyAudit) {
    result = applyAuditRatings(result, display, options.verbose ?? false);
  }

  // Save and display results (common path for both full and incremental)
  // Save analysis result to state directory
  const analyzeFile = StateManager.getAnalyzeFile();
  writeFileSync(analyzeFile, JSON.stringify(result, null, 2), 'utf8');

  if (options.verbose) {
    display.showMessage(`Analysis saved to: ${analyzeFile}`);
  }

  // Update workflow state with file checksums
  const filepaths = result.items.map((item) => item.filepath);
  const snapshot = await FileTracker.createSnapshot(filepaths);

  // Extract checksums from snapshot (WorkflowState expects Record<string, string>)
  const fileChecksums: Record<string, string> = {};
  for (const [filepath, fileSnapshot] of Object.entries(snapshot)) {
    fileChecksums[filepath] = fileSnapshot.checksum;
  }

  const commandState = createCommandState(result.total_items, fileChecksums);
  await WorkflowStateManager.updateCommandState('analyze', commandState);

  // Display results using the display service
  const format = (options.format || 'summary') as 'summary' | 'json';
  display.showAnalysisResult(result, format);
}

/**
 * Execute the analyze command.
 * This is the entry point called by Commander.js.
 *
 * @param path - Path to file or directory to analyze
 * @param options - Command options
 * @param options.format - Output format (json or summary)
 * @param options.config - Path to configuration file
 * @param options.verbose - Enable verbose output
 * @param options.preserveAudit - Preserve audit.json file only
 * @param options.forceClean - Force clean without prompting
 * @param options.incremental - Only re-analyze changed files
 * @param options.strict - Fail immediately on first parse error
 * @param options.applyAudit - Apply existing audit ratings to analyzed items
 * @param bridge - Python bridge instance (dependency injection)
 * @param display - Display instance (dependency injection)
 * @param configLoader - Config loader instance (dependency injection)
 * @returns Exit code (EXIT_CODE.SUCCESS for success, EXIT_CODE.ERROR for failure)
 */
export async function analyzeCommand(
  path: string,
  options: {
    format?: string;
    config?: string;
    verbose?: boolean;
    preserveAudit?: boolean;
    forceClean?: boolean;
    incremental?: boolean;
    strict?: boolean;
    applyAudit?: boolean;
  },
  bridge: IPythonBridge,
  display: IDisplay,
  configLoader: IConfigLoader
): Promise<ExitCode> {
  try {
    await analyzeCore(path, options, bridge, display, configLoader);
    return EXIT_CODE.SUCCESS;
  } catch (error) {
    display.showError(error instanceof Error ? error.message : String(error));
    return EXIT_CODE.ERROR;
  }
}

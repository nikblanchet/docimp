/**
 * Analyze command implementation.
 *
 * This command analyzes documentation coverage in a codebase by calling
 * the Python analyzer via subprocess.
 */

import { ConfigLoader } from '../config/ConfigLoader.js';
import { PythonBridge } from '../python-bridge/PythonBridge.js';
import type { IPythonBridge } from '../python-bridge/IPythonBridge.js';
import type { AnalysisResult } from '../types/analysis.js';

/**
 * Format analysis result as JSON string.
 *
 * @param result - Analysis result to format
 * @returns Formatted JSON string
 */
function formatJson(result: AnalysisResult): string {
  return JSON.stringify(result, null, 2);
}

/**
 * Format analysis result as human-readable summary.
 *
 * @param result - Analysis result to format
 * @returns Formatted summary string
 */
function formatSummary(result: AnalysisResult): string {
  const lines: string[] = [];

  lines.push('='.repeat(60));
  lines.push('Documentation Coverage Analysis');
  lines.push('='.repeat(60));
  lines.push('');
  lines.push(
    `Overall Coverage: ${result.coverage_percent.toFixed(1)}% ` +
    `(${result.documented_items}/${result.total_items} items)`
  );
  lines.push('');

  if (Object.keys(result.by_language).length > 0) {
    lines.push('By Language:');
    lines.push('-'.repeat(60));

    // Sort languages for consistent output
    const languages = Object.keys(result.by_language).sort();
    for (const lang of languages) {
      const metrics = result.by_language[lang];
      lines.push(`  ${lang.charAt(0).toUpperCase() + lang.slice(1)}:`);
      lines.push(
        `    Coverage: ${metrics.coverage_percent.toFixed(1)}% ` +
        `(${metrics.documented_items}/${metrics.total_items})`
      );
      lines.push(`    Avg Complexity: ${metrics.avg_complexity.toFixed(1)}`);
      lines.push(`    Avg Impact Score: ${metrics.avg_impact_score.toFixed(1)}`);
      lines.push('');
    }
  }

  // Show undocumented items by priority
  const undocumented = result.items.filter((item) => !item.has_docs);
  if (undocumented.length > 0) {
    lines.push('Top Undocumented Items (by impact):');
    lines.push('-'.repeat(60));

    // Sort by impact score descending
    const sorted = undocumented
      .sort((a, b) => b.impact_score - a.impact_score)
      .slice(0, 10);

    for (const item of sorted) {
      const score = item.impact_score.toFixed(1).padStart(5);
      const type = item.type.padEnd(8);
      const name = item.name.padEnd(30).slice(0, 30);
      lines.push(
        `  [${score}] ${type} ${name} (${item.filepath}:${item.line_number})`
      );
    }

    if (undocumented.length > 10) {
      lines.push(`  ... and ${undocumented.length - 10} more`);
    }
  }

  lines.push('');
  lines.push('='.repeat(60));

  return lines.join('\n');
}

/**
 * Core analyze logic (extracted for testability).
 *
 * @param path - Path to file or directory to analyze
 * @param options - Command options
 * @param bridge - Python bridge instance (injected for testing)
 */
export async function analyzeCore(
  path: string,
  options: {
    format?: string;
    config?: string;
    verbose?: boolean;
  },
  bridge?: IPythonBridge
): Promise<void> {
  // Load configuration
  const configLoader = new ConfigLoader();
  const config = await configLoader.load(options.config);

  if (options.verbose) {
    console.log('Configuration loaded:');
    console.log(`  Style guide: ${config.styleGuide}`);
    console.log(`  Tone: ${config.tone}`);
    console.log(`  Plugins: ${config.plugins?.length || 0} loaded`);
    console.log(`  Exclude patterns: ${config.exclude?.length || 0} patterns`);
    if (config.jsdocStyle) {
      console.log('  JSDoc options:');
      console.log(`    Enforce types: ${config.jsdocStyle.enforceTypes}`);
      console.log(`    Require examples: ${config.jsdocStyle.requireExamples}`);
    }
    console.log('');
  }

  // Create bridge if not injected (dependency injection pattern)
  const pythonBridge = bridge ?? new PythonBridge();

  // Run analysis via Python subprocess
  if (options.verbose) {
    console.log(`Analyzing: ${path}`);
  }

  const result = await pythonBridge.analyze({
    path,
    config,
    verbose: options.verbose,
  });

  // Format and display output
  const format = options.format || 'summary';
  const output = format === 'json' ? formatJson(result) : formatSummary(result);
  console.log(output);
}

/**
 * Execute the analyze command.
 * This is the entry point called by Commander.js.
 *
 * @param path - Path to file or directory to analyze
 * @param options - Command options
 */
export async function analyzeCommand(
  path: string,
  options: {
    format?: string;
    config?: string;
    verbose?: boolean;
  }
): Promise<void> {
  try {
    await analyzeCore(path, options);
  } catch (error) {
    console.error('Error:');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

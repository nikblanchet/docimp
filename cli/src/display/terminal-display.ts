/**
 * Terminal display implementation with formatted output.
 *
 * This class provides rich terminal output using chalk for colors,
 * cli-table3 for tables, and ora for progress spinners.
 */

import chalk from 'chalk';
import Table from 'cli-table3';
import ora, { Ora } from 'ora';
import type {
  AnalysisResult,
  CodeItem,
  LanguageMetrics,
  AuditSummary,
  ParseFailure,
  SessionSummary,
  TransactionEntry,
  RollbackResult,
} from '../types/analysis.js';
import {
  shouldUseCompactMode,
  COMPACT_TABLE_CHARS,
  COMPACT_TABLE_STYLE,
} from '../utils/terminal-width.js';
import type { IDisplay } from './i-display.js';

/**
 * Terminal display implementation with rich formatting.
 */
export class TerminalDisplay implements IDisplay {
  private spinner: Ora | null = null;

  /**
   * Create a responsive table that adapts to terminal width.
   *
   * For terminals >= 80 columns, creates a full table with borders.
   * For narrow terminals (< 80 columns), creates a compact borderless table.
   *
   * @param headers - Column headers
   * @param fullWidths - Column widths for full table mode (>= 80 cols)
   * @param compactWidths - Column widths for compact mode (< 80 cols)
   * @returns Configured cli-table3 Table instance
   */
  private createResponsiveTable(
    headers: string[],
    fullWidths: number[],
    compactWidths: number[]
  ) {
    const isCompact = shouldUseCompactMode(80);

    return new Table({
      head: headers,
      colWidths: isCompact ? compactWidths : fullWidths,
      chars: isCompact ? COMPACT_TABLE_CHARS : undefined,
      style: isCompact ? COMPACT_TABLE_STYLE : { head: [], border: ['grey'] },
    });
  }

  /**
   * Display complete analysis results with formatting.
   */
  public showAnalysisResult(
    result: AnalysisResult,
    format: 'summary' | 'json'
  ): void {
    if (format === 'json') {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    // Summary format with rich formatting
    this.showSummary(result);
  }

  /**
   * Display formatted summary of analysis results.
   */
  private showSummary(result: AnalysisResult): void {
    console.log('');
    console.log(chalk.bold.blue('═'.repeat(70)));
    console.log(chalk.bold.blue('  Documentation Coverage Analysis'));
    console.log(chalk.bold.blue('═'.repeat(70)));
    console.log('');

    // Overall coverage
    const coverageColor = this.getCoverageColor(result.coverage_percent);
    const coverageBar = this.createProgressBar(result.coverage_percent);

    console.log(chalk.bold('Overall Coverage:'));
    console.log(
      `  ${coverageColor(result.coverage_percent.toFixed(1) + '%')} ` +
        `(${result.documented_items}/${result.total_items} items)`
    );
    console.log(`  ${coverageBar}`);
    console.log('');

    // Language breakdown
    if (Object.keys(result.by_language).length > 0) {
      this.showLanguageBreakdown(result.by_language);
    }

    // Top undocumented items
    const undocumented = result.items.filter((item) => !item.has_docs);
    if (undocumented.length > 0) {
      this.showTopUndocumented(undocumented);
    }

    // Parse failures (if any)
    if (result.parse_failures && result.parse_failures.length > 0) {
      this.showParseFailures(result.parse_failures);
    }

    console.log(chalk.bold.blue('═'.repeat(70)));
    console.log('');
  }

  /**
   * Display language-specific breakdown with table.
   */
  private showLanguageBreakdown(
    byLanguage: Record<string, LanguageMetrics>
  ): void {
    console.log(chalk.bold('By Language:'));
    console.log('');

    const table = this.createResponsiveTable(
      [
        chalk.cyan('Language'),
        chalk.cyan('Coverage'),
        chalk.cyan('Items'),
        chalk.cyan('Avg Complexity'),
        chalk.cyan('Avg Impact'),
      ],
      [15, 15, 15, 18, 15], // Full widths
      [12, 12, 12, 14, 12] // Compact widths
    );

    // Sort languages alphabetically
    const languages = Object.keys(byLanguage).toSorted();

    for (const lang of languages) {
      const metrics = byLanguage[lang];
      const coverageColor = this.getCoverageColor(metrics.coverage_percent);
      const warning = metrics.coverage_percent < 50 ? chalk.yellow(' ⚠') : '';

      table.push([
        this.capitalizeLanguage(lang),
        coverageColor(metrics.coverage_percent.toFixed(1) + '%') + warning,
        `${metrics.documented_items}/${metrics.total_items}`,
        metrics.avg_complexity.toFixed(1),
        metrics.avg_impact_score.toFixed(1),
      ]);
    }

    console.log(table.toString());
    console.log('');
  }

  /**
   * Display top undocumented items by impact score.
   */
  private showTopUndocumented(undocumented: CodeItem[]): void {
    console.log(
      chalk.bold('Top Undocumented Items') + chalk.gray(' (by impact score)')
    );
    console.log('');

    // Sort by impact score descending
    const sorted = undocumented
      .toSorted((a, b) => b.impact_score - a.impact_score)
      .slice(0, 10);

    const table = this.createResponsiveTable(
      [
        chalk.cyan('Score'),
        chalk.cyan('Type'),
        chalk.cyan('Name'),
        chalk.cyan('Location'),
      ],
      [10, 12, 30, 40], // Full widths
      [8, 10, 20, 28] // Compact widths
    );

    for (const item of sorted) {
      const scoreColor = this.getImpactColor(item.impact_score);
      const relativePath = this.getRelativePath(item.filepath);

      table.push([
        scoreColor(item.impact_score.toFixed(1)),
        item.type,
        this.truncate(item.name, 28),
        chalk.gray(`${relativePath}:${item.line_number}`),
      ]);
    }

    console.log(table.toString());

    if (undocumented.length > 10) {
      console.log(
        chalk.gray(
          `  ... and ${undocumented.length - 10} more undocumented items`
        )
      );
    }
    console.log('');
  }

  /**
   * Display parse failures with file paths and error messages.
   */
  private showParseFailures(failures: ParseFailure[]): void {
    console.log(
      chalk.yellow('⚠ Parse Failures: ') +
        chalk.bold(
          `${failures.length} ${failures.length === 1 ? 'file' : 'files'}`
        )
    );
    console.log('');

    for (const failure of failures) {
      const relativePath = this.getRelativePath(failure.filepath);
      console.log(
        `  ${chalk.red('•')} ${chalk.gray(relativePath)}: ${failure.error}`
      );
    }
    console.log('');
  }

  /**
   * Display configuration information.
   */
  public showConfig(config: Record<string, unknown>): void {
    console.log(chalk.bold('Configuration:'));

    if (config.styleGuide) {
      console.log(`  Style guide: ${chalk.cyan(String(config.styleGuide))}`);
    }
    if (config.tone) {
      console.log(`  Tone: ${chalk.cyan(String(config.tone))}`);
    }
    if (config.plugins) {
      const pluginCount = Array.isArray(config.plugins)
        ? config.plugins.length
        : 0;
      console.log(`  Plugins: ${chalk.cyan(String(pluginCount))} loaded`);
    }
    if (config.exclude) {
      const excludeCount = Array.isArray(config.exclude)
        ? config.exclude.length
        : 0;
      console.log(
        `  Exclude patterns: ${chalk.cyan(String(excludeCount))} patterns`
      );
    }

    if (config.jsdocStyle && typeof config.jsdocStyle === 'object') {
      const jsdoc = config.jsdocStyle as Record<string, unknown>;
      console.log('  JSDoc options:');
      if ('enforceTypes' in jsdoc) {
        console.log(
          `    Enforce types: ${chalk.cyan(String(jsdoc.enforceTypes))}`
        );
      }
      if ('requireExamples' in jsdoc) {
        console.log(
          `    Require examples: ${chalk.cyan(String(jsdoc.requireExamples))}`
        );
      }
    }
    console.log('');
  }

  /**
   * Display a simple message.
   */
  public showMessage(message: string): void {
    console.log(message);
  }

  /**
   * Display an error message.
   */
  public showError(message: string): void {
    console.error(chalk.red('Error: ') + message);
  }

  /**
   * Display a warning message.
   */
  public showWarning(message: string): void {
    console.log(chalk.yellow('Warning: ') + message);
  }

  /**
   * Display a success message.
   */
  public showSuccess(message: string): void {
    console.log(chalk.green('✓ ') + message);
  }

  /**
   * Display a list of code items.
   */
  public showCodeItems(items: CodeItem[], title?: string): void {
    if (title) {
      console.log(chalk.bold(title));
      console.log('');
    }

    const table = this.createResponsiveTable(
      [
        chalk.cyan('Name'),
        chalk.cyan('Type'),
        chalk.cyan('Language'),
        chalk.cyan('Impact'),
        chalk.cyan('Location'),
      ],
      [25, 12, 12, 10, 35], // Full widths
      [18, 10, 10, 8, 20] // Compact widths
    );

    for (const item of items) {
      const scoreColor = this.getImpactColor(item.impact_score);
      const relativePath = this.getRelativePath(item.filepath);

      table.push([
        this.truncate(item.name, 23),
        item.type,
        this.capitalizeLanguage(item.language),
        scoreColor(item.impact_score.toFixed(1)),
        chalk.gray(`${relativePath}:${item.line_number}`),
      ]);
    }

    console.log(table.toString());
    console.log('');
  }

  /**
   * Stop the currently active spinner.
   */
  private stopSpinner(): void {
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
  }

  /**
   * Start a progress spinner.
   * @returns A function to stop the spinner.
   */
  public startSpinner(message: string): () => void {
    this.spinner = ora(message).start();
    return this.stopSpinner.bind(this);
  }

  /**
   * Display a progress bar.
   */
  public showProgress(current: number, total: number, message?: string): void {
    const percent = (current / total) * 100;
    const bar = this.createProgressBar(percent);
    const status = `${current}/${total}`;

    const line = message ? `${bar} ${status} - ${message}` : `${bar} ${status}`;

    process.stdout.write('\r' + line);

    if (current === total) {
      process.stdout.write('\n');
    }
  }

  /**
   * Get color function based on coverage percentage.
   * @returns Chalk color function.
   */
  private getCoverageColor(percent: number): typeof chalk {
    if (percent >= 80) return chalk.green;
    if (percent >= 50) return chalk.yellow;
    return chalk.red;
  }

  /**
   * Get color function based on impact score.
   * @returns Chalk color function.
   */
  private getImpactColor(score: number): typeof chalk {
    if (score >= 75) return chalk.red;
    if (score >= 50) return chalk.yellow;
    return chalk.green;
  }

  /**
   * Create a visual progress bar.
   * @returns Visual progress bar string.
   */
  private createProgressBar(percent: number, width: number = 30): string {
    const filled = Math.round((percent / 100) * width);
    const empty = width - filled;
    const color = this.getCoverageColor(percent);

    return (
      '[' + color('█'.repeat(filled)) + chalk.gray('░'.repeat(empty)) + ']'
    );
  }

  /**
   * Capitalize language name.
   * @returns Capitalized language name.
   */
  private capitalizeLanguage(lang: string): string {
    if (lang === 'javascript') return 'JavaScript';
    if (lang === 'typescript') return 'TypeScript';
    if (lang === 'python') return 'Python';
    return lang.charAt(0).toUpperCase() + lang.slice(1);
  }

  /**
   * Get relative path from current directory.
   * @returns Relative path string.
   */
  private getRelativePath(filepath: string): string {
    const cwd = process.cwd();
    if (filepath.startsWith(cwd)) {
      return filepath.slice(cwd.length + 1);
    }
    return filepath;
  }

  /**
   * Truncate string to specified length.
   * @returns Truncated string with ellipsis if needed.
   */
  private truncate(string_: string, maxLength: number): string {
    if (string_.length <= maxLength) return string_;
    return string_.slice(0, maxLength - 3) + '...';
  }

  /**
   * Display audit summary with rating breakdown and next steps.
   */
  public showAuditSummary(summary: AuditSummary): void {
    const { totalItems, auditedItems, ratingCounts, auditFile } = summary;

    // Calculate percentage
    const percent = totalItems > 0 ? (auditedItems / totalItems) * 100 : 0;

    // Box width
    const width = 50;
    const horizontalLine = '─'.repeat(width);

    console.log('');
    console.log('┌' + horizontalLine + '┐');
    console.log(
      '│' + this.padCenter('Documentation Quality Audit Complete', width) + '│'
    );
    console.log('├' + horizontalLine + '┤');
    console.log(
      '│' +
        this.padLeft(
          `Audited: ${auditedItems} / ${totalItems} documented items (${percent.toFixed(1)}%)`,
          width
        ) +
        '│'
    );
    console.log('│' + ' '.repeat(width) + '│');

    // Rating breakdown
    console.log('│' + this.padLeft('Rating Breakdown:', width) + '│');

    // Only show ratings that have counts > 0
    if (ratingCounts.terrible > 0) {
      const line = `  ${chalk.red('•')} Terrible (1):  ${ratingCounts.terrible} ${this.pluralize(ratingCounts.terrible, 'item', 'items')}`;
      console.log('│' + this.padLeft(line, width, true) + '│');
    }
    if (ratingCounts.ok > 0) {
      const line = `  ${chalk.yellow('•')} OK (2):        ${ratingCounts.ok} ${this.pluralize(ratingCounts.ok, 'item', 'items')}`;
      console.log('│' + this.padLeft(line, width, true) + '│');
    }
    if (ratingCounts.good > 0) {
      const line = `  ${chalk.green('•')} Good (3):      ${ratingCounts.good} ${this.pluralize(ratingCounts.good, 'item', 'items')}`;
      console.log('│' + this.padLeft(line, width, true) + '│');
    }
    if (ratingCounts.excellent > 0) {
      const line = `  ${chalk.green('•')} Excellent (4): ${ratingCounts.excellent} ${this.pluralize(ratingCounts.excellent, 'item', 'items')}`;
      console.log('│' + this.padLeft(line, width, true) + '│');
    }
    if (ratingCounts.skipped > 0) {
      const line = `  ${chalk.gray('•')} Skipped:       ${ratingCounts.skipped} ${this.pluralize(ratingCounts.skipped, 'item', 'items')}`;
      console.log('│' + this.padLeft(line, width, true) + '│');
    }

    console.log('│' + ' '.repeat(width) + '│');
    console.log('│' + this.padLeft('Audit saved to:', width) + '│');
    console.log('│' + this.padLeft(auditFile, width) + '│');
    console.log('│' + ' '.repeat(width) + '│');
    console.log('│' + this.padLeft('Next steps:', width) + '│');
    console.log(
      '│' + this.padLeft("Run 'docimp plan .' to generate", width) + '│'
    );
    console.log('│' + this.padLeft('improvement priorities.', width) + '│');
    console.log('└' + horizontalLine + '┘');
    console.log('');
  }

  /**
   * Pad string to center it within specified width.
   * @returns Centered and padded string.
   */
  private padCenter(string_: string, width: number): string {
    const strippedLength = this.stripAnsiLength(string_);
    const padding = width - strippedLength;
    const leftPad = Math.floor(padding / 2);
    const rightPad = padding - leftPad;
    return ' '.repeat(leftPad) + string_ + ' '.repeat(rightPad);
  }

  /**
   * Pad string to left-align it within specified width.
   * @returns Left-aligned and padded string.
   */
  private padLeft(
    string_: string,
    width: number,
    hasColor: boolean = false
  ): string {
    const strippedLength = hasColor ? this.stripAnsiLength(string_) : string_.length;
    const padding = width - strippedLength;
    // Handle case where string exceeds width (no padding)
    if (padding < 2) {
      return '  ' + string_;
    }
    return '  ' + string_ + ' '.repeat(padding - 2);
  }

  /**
   * Get length of string excluding ANSI color codes.
   * @returns String length without ANSI codes.
   */
  private stripAnsiLength(string_: string): number {
    // Remove ANSI escape codes to get true display length
    // eslint-disable-next-line no-control-regex
    const stripped = string_.replaceAll(/\u001B\[[0-9;]*m/g, '');
    return stripped.length;
  }

  /**
   * Pluralize a word based on count.
   * @returns Singular or plural form of the word.
   */
  private pluralize(count: number, singular: string, plural: string): string {
    return count === 1 ? singular : plural;
  }

  /**
   * Display a docstring in a labeled box for audit review.
   *
   * Shows the docstring being audited in a bordered box with the header
   * "CURRENT DOCSTRING". This makes it clear which docstring is being
   * rated, especially when code contains nested functions with their
   * own docstrings.
   */
  public showBoxedDocstring(docstring: string, width: number = 60): void {
    const horizontalLine = '─'.repeat(width);

    // Box top with header
    console.log('┌' + horizontalLine + '┐');
    console.log('│' + this.padLeft('CURRENT DOCSTRING', width) + '│');
    console.log('├' + horizontalLine + '┤');

    // Split docstring into lines and display each
    const lines = docstring.split('\n');
    for (const line of lines) {
      console.log('│' + this.padLeft(line, width) + '│');
    }

    // Box bottom
    console.log('└' + horizontalLine + '┘');
  }

  /**
   * Display a code block with optional truncation message.
   *
   * Shows code (which already includes line numbers from CodeExtractor)
   * without a header label. If truncated, displays a message indicating
   * how many more lines are available.
   */
  public showCodeBlock(
    code: string,
    truncated: boolean,
    totalLines: number,
    displayedLines: number
  ): void {
    // Display the code (already includes line numbers)
    console.log(code);

    // If truncated, show message about remaining lines
    if (truncated) {
      const remainingLines = totalLines - displayedLines;
      console.log('');
      console.log(
        `... (${remainingLines} more lines, press C to see full code)`
      );
    }
  }

  /**
   * Display just the function/class signature with message about full code.
   *
   * Shows only the signature line(s) followed by a message indicating
   * the total code size and how to view the full code.
   */
  public showSignature(signature: string, totalLines: number): void {
    // Display the signature (already includes line number)
    console.log(signature);
    console.log('');
    console.log(`(Full code: ${totalLines} lines, press C to see all)`);
  }

  /**
   * Display list of documentation improvement sessions.
   *
   * Shows all active sessions in a formatted table.
   */
  public showSessionList(sessions: SessionSummary[]): void {
    if (sessions.length === 0) {
      console.log(chalk.dim('No active sessions found.'));
      return;
    }

    console.log(chalk.bold('\nActive Documentation Sessions\n'));

    const table = this.createResponsiveTable(
      [
        chalk.cyan('Session ID'),
        chalk.cyan('Started'),
        chalk.cyan('Changes'),
        chalk.cyan('Status'),
      ],
      [38, 20, 10, 20], // Full widths
      [28, 16, 8, 14] // Compact widths
    );

    for (const session of sessions) {
      const statusColor =
        session.status === 'in_progress'
          ? chalk.yellow
          : session.status === 'committed'
            ? chalk.green
            : chalk.gray;

      table.push([
        session.session_id,
        session.started_at.slice(0, 19).replace('T', ' '),
        session.change_count.toString(),
        statusColor(session.status),
      ]);
    }

    console.log(table.toString());
    console.log(chalk.dim(`\nTotal: ${sessions.length} session(s)\n`));
  }

  /**
   * Display list of changes in a session.
   *
   * Shows all changes in a formatted table.
   */
  public showChangeList(changes: TransactionEntry[], sessionId: string): void {
    if (changes.length === 0) {
      console.log(chalk.dim(`No changes found in session: ${sessionId}`));
      return;
    }

    console.log(chalk.bold(`\nChanges in Session: ${sessionId}\n`));

    const table = this.createResponsiveTable(
      [
        chalk.cyan('Entry ID'),
        chalk.cyan('File'),
        chalk.cyan('Item'),
        chalk.cyan('Timestamp'),
      ],
      [12, 40, 25, 20], // Full widths
      [10, 28, 18, 16] // Compact widths
    );

    for (const change of changes) {
      // Truncate filepath if too long
      const filepath =
        change.filepath.length > 37
          ? '...' + change.filepath.slice(-37)
          : change.filepath;

      // Truncate item name if too long
      const itemName =
        change.item_name.length > 22
          ? change.item_name.slice(0, 22) + '...'
          : change.item_name;

      table.push([
        change.entry_id,
        filepath,
        itemName,
        change.timestamp.slice(0, 19).replace('T', ' '),
      ]);
    }

    console.log(table.toString());
    console.log(chalk.dim(`\nTotal: ${changes.length} change(s)\n`));
  }

  /**
   * Display rollback operation result.
   *
   * Shows success/failure with appropriate formatting.
   */
  public showRollbackResult(result: RollbackResult): void {
    console.log('');

    if (result.success) {
      console.log(chalk.green('✓ Rollback successful!'));
      console.log(chalk.dim(`Restored ${result.restored_count} file(s)`));
    } else {
      console.log(chalk.red('✗ Rollback failed'));
      console.log(
        chalk.dim(`Failed: ${result.failed_count} file(s) had conflicts`)
      );

      if (result.conflicts && result.conflicts.length > 0) {
        console.log('');
        console.log(chalk.yellow('Conflicts in:'));
        for (const conflict of result.conflicts) {
          console.log(chalk.dim(`  - ${conflict}`));
        }
      }
    }

    console.log('');
  }
}

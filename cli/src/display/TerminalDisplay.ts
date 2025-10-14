/**
 * Terminal display implementation with formatted output.
 *
 * This class provides rich terminal output using chalk for colors,
 * cli-table3 for tables, and ora for progress spinners.
 */

import chalk from 'chalk';
import Table from 'cli-table3';
import ora, { Ora } from 'ora';
import type { IDisplay } from './IDisplay.js';
import type { AnalysisResult, CodeItem, LanguageMetrics } from '../types/analysis.js';

/**
 * Terminal display implementation with rich formatting.
 */
export class TerminalDisplay implements IDisplay {
  private spinner: Ora | null = null;

  /**
   * Display complete analysis results with formatting.
   */
  public showAnalysisResult(result: AnalysisResult, format: 'summary' | 'json'): void {
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

    console.log(chalk.bold.blue('═'.repeat(70)));
    console.log('');
  }

  /**
   * Display language-specific breakdown with table.
   */
  private showLanguageBreakdown(byLanguage: Record<string, LanguageMetrics>): void {
    console.log(chalk.bold('By Language:'));
    console.log('');

    const table = new Table({
      head: [
        chalk.cyan('Language'),
        chalk.cyan('Coverage'),
        chalk.cyan('Items'),
        chalk.cyan('Avg Complexity'),
        chalk.cyan('Avg Impact')
      ],
      colWidths: [15, 15, 15, 18, 15],
      style: {
        head: [],
        border: ['grey']
      }
    });

    // Sort languages alphabetically
    const languages = Object.keys(byLanguage).sort();

    for (const lang of languages) {
      const metrics = byLanguage[lang];
      const coverageColor = this.getCoverageColor(metrics.coverage_percent);
      const warning = metrics.coverage_percent < 50 ? chalk.yellow(' ⚠') : '';

      table.push([
        this.capitalizeLanguage(lang),
        coverageColor(metrics.coverage_percent.toFixed(1) + '%') + warning,
        `${metrics.documented_items}/${metrics.total_items}`,
        metrics.avg_complexity.toFixed(1),
        metrics.avg_impact_score.toFixed(1)
      ]);
    }

    console.log(table.toString());
    console.log('');
  }

  /**
   * Display top undocumented items by impact score.
   */
  private showTopUndocumented(undocumented: CodeItem[]): void {
    console.log(chalk.bold('Top Undocumented Items') + chalk.gray(' (by impact score)'));
    console.log('');

    // Sort by impact score descending
    const sorted = undocumented
      .sort((a, b) => b.impact_score - a.impact_score)
      .slice(0, 10);

    const table = new Table({
      head: [
        chalk.cyan('Score'),
        chalk.cyan('Type'),
        chalk.cyan('Name'),
        chalk.cyan('Location')
      ],
      colWidths: [10, 12, 30, 40],
      style: {
        head: [],
        border: ['grey']
      }
    });

    for (const item of sorted) {
      const scoreColor = this.getImpactColor(item.impact_score);
      const relativePath = this.getRelativePath(item.filepath);

      table.push([
        scoreColor(item.impact_score.toFixed(1)),
        item.type,
        this.truncate(item.name, 28),
        chalk.gray(`${relativePath}:${item.line_number}`)
      ]);
    }

    console.log(table.toString());

    if (undocumented.length > 10) {
      console.log(chalk.gray(`  ... and ${undocumented.length - 10} more undocumented items`));
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
      const pluginCount = Array.isArray(config.plugins) ? config.plugins.length : 0;
      console.log(`  Plugins: ${chalk.cyan(String(pluginCount))} loaded`);
    }
    if (config.exclude) {
      const excludeCount = Array.isArray(config.exclude) ? config.exclude.length : 0;
      console.log(`  Exclude patterns: ${chalk.cyan(String(excludeCount))} patterns`);
    }

    if (config.jsdocStyle && typeof config.jsdocStyle === 'object') {
      const jsdoc = config.jsdocStyle as Record<string, unknown>;
      console.log('  JSDoc options:');
      if ('enforceTypes' in jsdoc) {
        console.log(`    Enforce types: ${chalk.cyan(String(jsdoc.enforceTypes))}`);
      }
      if ('requireExamples' in jsdoc) {
        console.log(`    Require examples: ${chalk.cyan(String(jsdoc.requireExamples))}`);
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

    const table = new Table({
      head: [
        chalk.cyan('Name'),
        chalk.cyan('Type'),
        chalk.cyan('Language'),
        chalk.cyan('Impact'),
        chalk.cyan('Location')
      ],
      colWidths: [25, 12, 12, 10, 35],
      style: {
        head: [],
        border: ['grey']
      }
    });

    for (const item of items) {
      const scoreColor = this.getImpactColor(item.impact_score);
      const relativePath = this.getRelativePath(item.filepath);

      table.push([
        this.truncate(item.name, 23),
        item.type,
        this.capitalizeLanguage(item.language),
        scoreColor(item.impact_score.toFixed(1)),
        chalk.gray(`${relativePath}:${item.line_number}`)
      ]);
    }

    console.log(table.toString());
    console.log('');
  }

  /**
   * Start a progress spinner.
   */
  public startSpinner(message: string): () => void {
    this.spinner = ora(message).start();

    return () => {
      if (this.spinner) {
        this.spinner.stop();
        this.spinner = null;
      }
    };
  }

  /**
   * Display a progress bar.
   */
  public showProgress(current: number, total: number, message?: string): void {
    const percent = (current / total) * 100;
    const bar = this.createProgressBar(percent);
    const status = `${current}/${total}`;

    const line = message
      ? `${bar} ${status} - ${message}`
      : `${bar} ${status}`;

    process.stdout.write('\r' + line);

    if (current === total) {
      process.stdout.write('\n');
    }
  }

  /**
   * Get color function based on coverage percentage.
   */
  private getCoverageColor(percent: number): typeof chalk {
    if (percent >= 80) return chalk.green;
    if (percent >= 50) return chalk.yellow;
    return chalk.red;
  }

  /**
   * Get color function based on impact score.
   */
  private getImpactColor(score: number): typeof chalk {
    if (score >= 75) return chalk.red;
    if (score >= 50) return chalk.yellow;
    return chalk.green;
  }

  /**
   * Create a visual progress bar.
   */
  private createProgressBar(percent: number, width: number = 30): string {
    const filled = Math.round((percent / 100) * width);
    const empty = width - filled;
    const color = this.getCoverageColor(percent);

    return '[' + color('█'.repeat(filled)) + chalk.gray('░'.repeat(empty)) + ']';
  }

  /**
   * Capitalize language name.
   */
  private capitalizeLanguage(lang: string): string {
    if (lang === 'javascript') return 'JavaScript';
    if (lang === 'typescript') return 'TypeScript';
    if (lang === 'python') return 'Python';
    return lang.charAt(0).toUpperCase() + lang.slice(1);
  }

  /**
   * Get relative path from current directory.
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
   */
  private truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength - 3) + '...';
  }
}

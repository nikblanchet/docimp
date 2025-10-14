/**
 * Audit command implementation.
 *
 * This command audits existing documentation quality by presenting
 * documented items to the user for interactive rating.
 */

import prompts from 'prompts';
import { PythonBridge } from '../python-bridge/PythonBridge.js';
import { TerminalDisplay } from '../display/TerminalDisplay.js';
import type { IPythonBridge } from '../python-bridge/IPythonBridge.js';
import type { IDisplay } from '../display/IDisplay.js';
import type { AuditRatings } from '../types/analysis.js';

/**
 * Core audit logic (extracted for testability).
 *
 * @param path - Path to file or directory to audit
 * @param options - Command options
 * @param bridge - Python bridge instance (injected for testing)
 * @param display - Display instance (injected for testing)
 */
export async function auditCore(
  path: string,
  options: {
    auditFile?: string;
    verbose?: boolean;
  },
  bridge?: IPythonBridge,
  display?: IDisplay
): Promise<void> {
  // Create dependencies if not injected (dependency injection pattern)
  const pythonBridge = bridge ?? new PythonBridge();
  const terminalDisplay = display ?? new TerminalDisplay();

  // Get list of documented items from Python
  if (options.verbose) {
    terminalDisplay.showMessage(`Finding documented items in: ${path}`);
  }

  const stopSpinner = terminalDisplay.startSpinner('Analyzing documented items...');

  try {
    const result = await pythonBridge.audit({
      path,
      auditFile: options.auditFile,
      verbose: options.verbose,
    });

    stopSpinner();

    const items = result.items;

    if (items.length === 0) {
      terminalDisplay.showMessage('No documented items found to audit.');
      return;
    }

    terminalDisplay.showMessage(`\nFound ${items.length} documented items to audit.`);
    terminalDisplay.showMessage('Rate the quality of each item\'s documentation.\n');

    // Initialize ratings structure
    const ratings: AuditRatings = { ratings: {} };

    // Load existing ratings into ratings structure
    for (const item of items) {
      if (item.audit_rating !== undefined && item.audit_rating !== null) {
        if (!ratings.ratings[item.filepath]) {
          ratings.ratings[item.filepath] = {};
        }
        ratings.ratings[item.filepath][item.name] = item.audit_rating;
      }
    }

    // Filter out already-rated items (for resume capability)
    const unratedItems = items.filter(item => item.audit_rating === undefined || item.audit_rating === null);

    if (unratedItems.length === 0) {
      terminalDisplay.showMessage('All items have already been audited.');
      return;
    }

    terminalDisplay.showMessage(`${unratedItems.length} items remaining to audit.\n`);

    // Interactive rating loop
    let audited = 0;
    for (const item of unratedItems) {
      audited++;

      // Show progress
      terminalDisplay.showMessage(`\nAuditing: ${audited}/${unratedItems.length}`);
      terminalDisplay.showMessage(`${item.type} ${item.name} (${item.language})`);
      terminalDisplay.showMessage(`Location: ${item.filepath}:${item.line_number}`);
      terminalDisplay.showMessage(`Complexity: ${item.complexity}\n`);

      // Show the documentation
      if (item.docstring) {
        terminalDisplay.showMessage('Current documentation:');
        terminalDisplay.showMessage('-'.repeat(60));
        terminalDisplay.showMessage(item.docstring);
        terminalDisplay.showMessage('-'.repeat(60) + '\n');
      }

      // Prompt for rating
      const response = await prompts({
        type: 'select',
        name: 'rating',
        message: 'Rate the documentation quality:',
        choices: [
          { title: '0 - Skip (come back later)', value: -1 },
          { title: '1 - Terrible (needs major improvement)', value: 1 },
          { title: '2 - OK (adequate but could be better)', value: 2 },
          { title: '3 - Good (clear and helpful)', value: 3 },
          { title: '4 - Excellent (exemplary documentation)', value: 4 },
        ],
        initial: 0,
      });

      // Handle user cancellation (Ctrl+C)
      if (response.rating === undefined) {
        terminalDisplay.showMessage('\n\nAudit interrupted by user.');
        break;
      }

      // Skip = -1, don't save
      if (response.rating === -1) {
        terminalDisplay.showMessage('Skipped.\n');
        continue;
      }

      // Save the rating
      if (!ratings.ratings[item.filepath]) {
        ratings.ratings[item.filepath] = {};
      }
      ratings.ratings[item.filepath][item.name] = response.rating;

      const ratingLabels: Record<number, string> = {
        1: 'Terrible',
        2: 'OK',
        3: 'Good',
        4: 'Excellent',
      };

      terminalDisplay.showMessage(`Rated as: ${ratingLabels[response.rating]}\n`);
    }

    // Save all ratings
    const totalRatings = Object.values(ratings.ratings).reduce(
      (sum, fileRatings) => sum + Object.keys(fileRatings).length,
      0
    );

    if (totalRatings > 0) {
      const savingSpinner = terminalDisplay.startSpinner('Saving audit ratings...');

      try {
        await pythonBridge.applyAudit(ratings, options.auditFile);
        savingSpinner();
        terminalDisplay.showMessage(`\n\nAudit complete! Saved ${totalRatings} ratings.`);
        terminalDisplay.showMessage(`Run 'docimp analyze' to see updated impact scores.`);
      } catch (error) {
        savingSpinner();
        throw error;
      }
    } else {
      terminalDisplay.showMessage('\n\nNo ratings saved.');
    }
  } catch (error) {
    stopSpinner();
    throw error;
  }
}

/**
 * Execute the audit command.
 * This is the entry point called by Commander.js.
 *
 * @param path - Path to file or directory to audit
 * @param options - Command options
 */
export async function auditCommand(
  path: string,
  options: {
    auditFile?: string;
    verbose?: boolean;
  }
): Promise<void> {
  const display = new TerminalDisplay();

  try {
    await auditCore(path, options);
  } catch (error) {
    display.showError(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Audit command implementation.
 *
 * This command audits existing documentation quality by presenting
 * documented items to the user for interactive rating.
 */

import prompts from 'prompts';
import { PythonBridge } from '../python-bridge/PythonBridge.js';
import { TerminalDisplay } from '../display/TerminalDisplay.js';
import { StateManager } from '../utils/StateManager.js';
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

  // Use StateManager default if auditFile not provided
  const auditFile = options.auditFile ?? StateManager.getAuditFile();

  // Get list of documented items from Python
  if (options.verbose) {
    terminalDisplay.showMessage(`Finding documented items in: ${path}`);
  }

  const stopSpinner = terminalDisplay.startSpinner('Analyzing documented items...');

  try {
    const result = await pythonBridge.audit({
      path,
      auditFile,
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

    // Interactive rating loop
    let audited = 0;
    for (const item of items) {
      audited++;

      // Show progress
      terminalDisplay.showMessage(`\nAuditing: ${audited}/${items.length}`);
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
        type: 'text',
        name: 'rating',
        message: 'Rate the documentation quality ([1-4], S to skip, Q to quit):',
        validate: (value: string) => {
          const normalized = value.trim().toUpperCase();
          if (['1', '2', '3', '4', 'S', 'Q'].includes(normalized)) {
            return true;
          }
          return 'Please enter 1-4 for quality rating, S to skip, or Q to quit';
        },
      });

      // Handle user cancellation (Ctrl+C)
      if (response.rating === undefined) {
        terminalDisplay.showMessage('\n\nAudit interrupted by user.');
        break;
      }

      const normalized = response.rating.trim().toUpperCase();

      // Handle quit
      if (normalized === 'Q') {
        terminalDisplay.showMessage('\n\nAudit stopped by user.');
        break;
      }

      // Handle skip - save null
      if (normalized === 'S') {
        if (!ratings.ratings[item.filepath]) {
          ratings.ratings[item.filepath] = {};
        }
        ratings.ratings[item.filepath][item.name] = null;
        terminalDisplay.showMessage('Skipped.\n');
        continue;
      }

      // Save the numeric rating (1-4)
      const numericRating = parseInt(normalized, 10);
      if (!ratings.ratings[item.filepath]) {
        ratings.ratings[item.filepath] = {};
      }
      ratings.ratings[item.filepath][item.name] = numericRating;

      const ratingLabels: Record<number, string> = {
        1: 'Terrible',
        2: 'OK',
        3: 'Good',
        4: 'Excellent',
      };

      terminalDisplay.showMessage(`Rated as: ${ratingLabels[numericRating]}\n`);
    }

    // Save all ratings
    const totalRatings = Object.values(ratings.ratings).reduce(
      (sum, fileRatings) => sum + Object.keys(fileRatings).length,
      0
    );

    if (totalRatings > 0) {
      const savingSpinner = terminalDisplay.startSpinner('Saving audit ratings...');

      try {
        await pythonBridge.applyAudit(ratings, auditFile);
        savingSpinner();
        terminalDisplay.showMessage(`\n\nAudit complete! Saved ${totalRatings} ratings to ${auditFile}`);
        terminalDisplay.showMessage(`Run 'docimp plan' to generate an improvement plan.`);
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
